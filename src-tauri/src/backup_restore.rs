use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;
#[cfg(test)]
use zip::write::SimpleFileOptions;
use zip::ZipArchive;
#[cfg(test)]
use zip::ZipWriter;

use crate::session_paths::{pane_sessions_root, validate_profile_session_id};

#[cfg(test)]
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingBackupRequest {
    output_path: String,
    config_json: String,
}

struct SensitivePassphrase(String);

impl SensitivePassphrase {
    fn new(value: String) -> Result<Self, String> {
        if value.is_empty() {
            Err("BACKUP_PASSPHRASE_REQUIRED: Mật khẩu backup không được để trống".to_string())
        } else {
            Ok(Self(value))
        }
    }

    fn secret(&self) -> age::secrecy::SecretString {
        age::secrecy::SecretString::from(self.0.clone())
    }
}

impl Drop for SensitivePassphrase {
    fn drop(&mut self) {
        // Không đảm bảo chống mọi bản sao do allocator/runtime tạo ra, nhưng xóa
        // buffer String do command Rust sở hữu ngay khi kết thúc thao tác.
        unsafe { self.0.as_bytes_mut().fill(0) };
    }
}

struct ExactLengthReader<R> {
    inner: R,
    expected: u64,
    remaining: u64,
    eof_verified: bool,
}

impl<R: Read> ExactLengthReader<R> {
    fn new(inner: R, expected: u64) -> Self {
        Self {
            inner,
            expected,
            remaining: expected,
            eof_verified: false,
        }
    }

    fn verify_complete(&mut self) -> std::io::Result<()> {
        if self.remaining != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                format!(
                    "File session thay đổi khi backup: dự kiến {} byte nhưng thiếu {} byte",
                    self.expected, self.remaining
                ),
            ));
        }
        if !self.eof_verified {
            let mut probe = [0_u8; 1];
            loop {
                match self.inner.read(&mut probe) {
                    Ok(0) => {
                        self.eof_verified = true;
                        break;
                    }
                    Ok(_) => {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!(
                                "File session thay đổi khi backup: vượt quá {} byte đã khai báo",
                                self.expected
                            ),
                        ));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(error) => return Err(error),
                }
            }
        }
        Ok(())
    }
}

impl<R: Read> Read for ExactLengthReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        if self.remaining == 0 {
            self.verify_complete()?;
            return Ok(0);
        }
        let allowed = buffer
            .len()
            .min(self.remaining.min(usize::MAX as u64) as usize);
        loop {
            match self.inner.read(&mut buffer[..allowed]) {
                Ok(0) => return self.verify_complete().map(|()| 0),
                Ok(read) => {
                    self.remaining -= read as u64;
                    return Ok(read);
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
    }
}

const BACKUP_METADATA_DIR: &str = "__ai_chat_multiplexer_backup";
const BACKUP_APP_STATE_ENTRY: &str = "__ai_chat_multiplexer_backup/app-state.json";
const BACKUP_MANIFEST_ENTRY: &str = "__ai_chat_multiplexer_backup/manifest.json";
const BACKUP_FORMAT_VERSION: u32 = 1;
const ENCRYPTED_BACKUP_FORMAT_VERSION: u32 = 2;
const BACKUP_SCRYPT_LOG_N: u8 = 18;
const ENCRYPTED_BACKUP_MANIFEST_ENTRY: &str = "__ai_chat_multiplexer_backup/manifest.json";
const ENCRYPTED_BACKUP_APP_STATE_ENTRY: &str = "__ai_chat_multiplexer_backup/app-state.json";
const MAX_BACKUP_METADATA_BYTES: u64 = 10 * 1024 * 1024;
const MAX_RESTORE_ENTRIES: usize = 10_000;
const MAX_RESTORE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_RESTORE_FILE_BYTES: u64 = 512 * 1024 * 1024;
// DEFLATE can legitimately exceed 1,000:1 for repetitive browser profile data.
// Absolute file/total limits remain the primary ZIP-bomb controls.
const MAX_RESTORE_COMPRESSION_RATIO: u64 = 1_100;
const ENCRYPTED_METADATA_ENTRIES: usize = 2;
const MAX_ENCRYPTED_ARCHIVE_BYTES: u64 =
    MAX_RESTORE_TOTAL_BYTES + MAX_BACKUP_METADATA_BYTES * ENCRYPTED_METADATA_ENTRIES as u64;
const RESTORE_COPY_BUFFER_BYTES: usize = 64 * 1024;
#[cfg(test)]
const MAX_PENDING_BACKUP_REQUEST_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PENDING_RESTORE_CONFIG_BYTES: u64 = 64 * 1024 * 1024;
const MAX_STARTUP_RESULTS_BYTES: u64 = 64 * 1024 * 1024;
const MAX_STARTUP_RESULTS: usize = 4;
const STALE_RESTORE_STAGING_AGE: Duration = Duration::from_secs(24 * 60 * 60);
static ACTIVE_RESTORE_CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
#[cfg(test)]
static BACKUP_SCHEDULE_LOCK: Mutex<()> = Mutex::new(());
static STARTUP_RESULTS_LOCK: Mutex<()> = Mutex::new(());
static TEMP_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    app_version: String,
    created_at_unix_seconds: u64,
    profile_ids: Vec<String>,
}

#[derive(Clone, Copy)]
struct RestoreLimits {
    max_entries: usize,
    max_total_bytes: u64,
    max_file_bytes: u64,
    max_compression_ratio: u64,
}

const RESTORE_LIMITS: RestoreLimits = RestoreLimits {
    max_entries: MAX_RESTORE_ENTRIES,
    max_total_bytes: MAX_RESTORE_TOTAL_BYTES,
    max_file_bytes: MAX_RESTORE_FILE_BYTES,
    max_compression_ratio: MAX_RESTORE_COMPRESSION_RATIO,
};

#[derive(Clone, Copy)]
struct EncryptedBackupLimits {
    max_entries: usize,
    max_total_bytes: u64,
    max_file_bytes: u64,
    max_metadata_bytes: u64,
}

const ENCRYPTED_BACKUP_LIMITS: EncryptedBackupLimits = EncryptedBackupLimits {
    max_entries: MAX_RESTORE_ENTRIES,
    max_total_bytes: MAX_ENCRYPTED_ARCHIVE_BYTES,
    max_file_bytes: MAX_RESTORE_FILE_BYTES,
    max_metadata_bytes: MAX_BACKUP_METADATA_BYTES,
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestoreConfig {
    config_json: Option<String>,
    config_path: Option<String>,
    config_source: Option<String>,
    config_error: Option<String>,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartupOperationResult {
    operation: String,
    success: bool,
    message: String,
    zip_path: Option<String>,
    config_path: Option<String>,
    config_json: Option<String>,
    config_restored: Option<bool>,
    #[serde(default)]
    warnings: Vec<String>,
}

fn sanitize_path_part(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "default".to_string()
    } else {
        sanitized
    }
}

#[cfg(test)]
fn pending_backup_request_path(root: &Path) -> PathBuf {
    root.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".pane-sessions.pending-backup.json")
}

fn startup_result_path(root: &Path) -> PathBuf {
    root.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(".pane-sessions.startup-results.json")
}

fn read_text_file_bounded(path: &Path, max_bytes: u64) -> Result<String, String> {
    if is_link_or_reparse_point(path)? {
        return Err(format!(
            "File {} là symbolic link hoặc reparse point",
            path.display()
        ));
    }
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > max_bytes {
        return Err(format!("File {} vượt giới hạn", path.display()));
    }
    let mut bytes = Vec::with_capacity(metadata.len().min(max_bytes) as usize);
    File::open(path)
        .map_err(|error| error.to_string())?
        .take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!("File {} vượt giới hạn", path.display()));
    }
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

fn write_file_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    if is_link_or_reparse_point(path)? {
        return Err(format!(
            "Không ghi đè symbolic link hoặc reparse point {}",
            path.display()
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp_path = unique_output_temp_path(path)?;
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(contents)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        finalize_output_file(&temp_path, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

#[cfg(test)]
fn write_file_atomic_create_only(path: &Path, contents: &[u8]) -> Result<(), String> {
    if is_link_or_reparse_point(path)? {
        return Err(format!(
            "Không ghi đè symbolic link hoặc reparse point {}",
            path.display()
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp_path = unique_output_temp_path(path)?;
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(contents)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        std::fs::hard_link(&temp_path, path).map_err(|error| error.to_string())?;
        std::fs::remove_file(&temp_path).map_err(|error| error.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

fn append_startup_result(root: &Path, result: StartupOperationResult) -> Result<(), String> {
    let _guard = STARTUP_RESULTS_LOCK
        .lock()
        .map_err(|_| "Không thể khóa kết quả startup".to_string())?;
    let path = startup_result_path(root);
    let mut results = read_text_file_bounded(&path, MAX_STARTUP_RESULTS_BYTES)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<StartupOperationResult>>(&raw).ok())
        .unwrap_or_default();
    results.push(result);
    if results.len() > MAX_STARTUP_RESULTS {
        results.drain(..results.len() - MAX_STARTUP_RESULTS);
    }
    let mut json = serde_json::to_vec(&results).map_err(|error| error.to_string())?;
    while json.len() as u64 > MAX_STARTUP_RESULTS_BYTES && results.len() > 1 {
        results.remove(0);
        json = serde_json::to_vec(&results).map_err(|error| error.to_string())?;
    }
    if json.len() as u64 > MAX_STARTUP_RESULTS_BYTES {
        return Err("Một kết quả startup vượt giới hạn".to_string());
    }
    write_file_atomic(&path, &json)
}

fn is_link_or_reparse_point(path: &Path) -> Result<bool, String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
        return Ok(true);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        Ok(metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[cfg(test)]
fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    base_dir: &Path,
    src: &Path,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut file_count = 0;

    let mut entries = WalkDir::new(src).follow_links(false).into_iter();
    while let Some(entry) = entries.next() {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type();
        if is_link_or_reparse_point(path)? {
            if file_type.is_dir() {
                entries.skip_current_dir();
            }
            continue;
        }
        let relative = path
            .strip_prefix(base_dir)
            .map_err(|error| error.to_string())?;
        let name = relative.to_string_lossy().replace('\\', "/");

        if file_type.is_dir() {
            if !name.is_empty() {
                zip.add_directory(format!("{}/", name), options)
                    .map_err(|error| error.to_string())?;
            }
            continue;
        }

        if name.is_empty() || !file_type.is_file() {
            continue;
        }

        zip.start_file(&name, options)
            .map_err(|error| error.to_string())?;
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        std::io::copy(&mut file, zip).map_err(|error| error.to_string())?;
        file_count += 1;
    }

    Ok(file_count)
}

/// Ngày UTC hiện tại dạng `YYYY-MM-DD`, dùng cho tên file backup mặc định gợi ý
/// trong hộp thoại lưu (tương đương `new Date().toISOString().slice(0, 10)` ở
/// frontend cũ). Tự tính để không cần thêm dependency về thời gian.
fn today_utc_yyyy_mm_dd() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    // Thuật toán civil_from_days của Howard Hinnant.
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if month <= 2 { year + 1 } else { year };
    format!("{year:04}-{month:02}-{day:02}")
}

fn config_sidecar_path(output_path: &Path) -> PathBuf {
    if output_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        output_path.with_extension("json")
    } else {
        let mut sidecar = output_path.to_path_buf();
        sidecar.set_extension("json");
        sidecar
    }
}

#[cfg(test)]
fn write_backup_metadata<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    options: SimpleFileOptions,
    config_json: &str,
    manifest: &BackupManifest,
) -> Result<(), String> {
    if config_json.len() as u64 > MAX_BACKUP_METADATA_BYTES {
        return Err("App config vượt giới hạn metadata backup".to_string());
    }
    zip.add_directory(format!("{BACKUP_METADATA_DIR}/"), options)
        .map_err(|error| error.to_string())?;
    zip.start_file(BACKUP_APP_STATE_ENTRY, options)
        .map_err(|error| error.to_string())?;
    zip.write_all(config_json.as_bytes())
        .map_err(|error| error.to_string())?;
    zip.start_file(BACKUP_MANIFEST_ENTRY, options)
        .map_err(|error| error.to_string())?;
    let manifest_json = serde_json::to_vec(manifest).map_err(|error| error.to_string())?;
    zip.write_all(&manifest_json)
        .map_err(|error| error.to_string())
}

fn backup_profile_ids(root: &Path) -> Vec<String> {
    let mut ids = std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    ids
}

fn backup_manifest(root: &Path) -> BackupManifest {
    BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at_unix_seconds: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
        profile_ids: backup_profile_ids(root),
    }
}

fn encrypted_backup_manifest(root: &Path) -> BackupManifest {
    let mut manifest = backup_manifest(root);
    manifest.format_version = ENCRYPTED_BACKUP_FORMAT_VERSION;
    manifest
}

fn append_tar_bytes<W: Write>(
    archive: &mut tar::Builder<W>,
    path: &str,
    contents: &[u8],
) -> Result<(), String> {
    let mut header = tar::Header::new_gnu();
    header.set_size(contents.len() as u64);
    header.set_mode(0o600);
    header.set_cksum();
    archive
        .append_data(&mut header, path, contents)
        .map_err(|error| error.to_string())
}

fn write_encrypted_tar<W: Write>(
    output: W,
    root: &Path,
    config_json: &str,
    passphrase: age::secrecy::SecretString,
) -> Result<usize, String> {
    write_encrypted_tar_with_limits(
        output,
        root,
        config_json,
        passphrase,
        ENCRYPTED_BACKUP_LIMITS,
    )
}

fn write_encrypted_tar_with_limits<W: Write>(
    output: W,
    root: &Path,
    config_json: &str,
    passphrase: age::secrecy::SecretString,
    limits: EncryptedBackupLimits,
) -> Result<usize, String> {
    write_encrypted_tar_with_limits_and_hook(
        output,
        root,
        config_json,
        passphrase,
        limits,
        |_, _| Ok(()),
    )
}

fn write_encrypted_tar_with_limits_and_hook<W: Write, F>(
    output: W,
    root: &Path,
    config_json: &str,
    passphrase: age::secrecy::SecretString,
    limits: EncryptedBackupLimits,
    mut before_file_read: F,
) -> Result<usize, String>
where
    F: FnMut(&Path, u64) -> Result<(), String>,
{
    if config_json.len() as u64 > limits.max_metadata_bytes {
        return Err("App config vượt giới hạn metadata backup".to_string());
    }
    let manifest_json =
        serde_json::to_vec(&encrypted_backup_manifest(root)).map_err(|error| error.to_string())?;
    if manifest_json.len() as u64 > limits.max_metadata_bytes {
        return Err("Manifest backup vượt giới hạn".to_string());
    }
    if ENCRYPTED_METADATA_ENTRIES > limits.max_entries {
        return Err("Giới hạn entry backup không đủ cho metadata bắt buộc".to_string());
    }
    let metadata_bytes = (config_json.len() as u64)
        .checked_add(manifest_json.len() as u64)
        .ok_or_else(|| "Tổng kích thước backup vượt giới hạn".to_string())?;
    if metadata_bytes > limits.max_total_bytes {
        return Err(format!(
            "Tổng dữ liệu backup vượt giới hạn {} byte",
            limits.max_total_bytes
        ));
    }

    let mut recipient = age::scrypt::Recipient::new(passphrase);
    recipient.set_work_factor(BACKUP_SCRYPT_LOG_N);
    let encryptor =
        age::Encryptor::with_recipients(std::iter::once(&recipient as &dyn age::Recipient))
            .map_err(|error| format!("Không thể khởi tạo mã hóa backup: {error}"))?;
    let encrypted = encryptor
        .wrap_output(output)
        .map_err(|error| format!("Không thể khởi tạo mã hóa backup: {error}"))?;
    let mut archive = tar::Builder::new(encrypted);
    archive.mode(tar::HeaderMode::Deterministic);
    let mut file_count = 0;
    let mut total_bytes = metadata_bytes;

    let mut entries = WalkDir::new(root).follow_links(false).into_iter();
    while let Some(entry) = entries.next() {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type();
        if is_link_or_reparse_point(path)? {
            if file_type.is_dir() {
                entries.skip_current_dir();
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
        validate_session_archive_path(relative, false)?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.len() > limits.max_file_bytes {
            return Err(format!(
                "Một file session vượt giới hạn {} byte",
                limits.max_file_bytes
            ));
        }
        if file_count >= limits.max_entries - ENCRYPTED_METADATA_ENTRIES {
            return Err(format!(
                "Backup có quá nhiều entry (tối đa {})",
                limits.max_entries
            ));
        }
        total_bytes = total_bytes
            .checked_add(metadata.len())
            .ok_or_else(|| "Tổng kích thước backup vượt giới hạn".to_string())?;
        if total_bytes > limits.max_total_bytes {
            return Err(format!(
                "Tổng dữ liệu backup vượt giới hạn {} byte",
                limits.max_total_bytes
            ));
        }
        let mut header = tar::Header::new_gnu();
        header.set_metadata_in_mode(&metadata, tar::HeaderMode::Deterministic);
        header.set_size(metadata.len());
        header.set_mode(0o600);
        header.set_cksum();
        before_file_read(path, metadata.len())?;
        let file = File::open(path).map_err(|error| error.to_string())?;
        let mut exact_file = ExactLengthReader::new(file, metadata.len());
        archive
            .append_data(&mut header, relative, &mut exact_file)
            .map_err(|error| error.to_string())?;
        exact_file
            .verify_complete()
            .map_err(|error| error.to_string())?;
        file_count += 1;
    }

    append_tar_bytes(
        &mut archive,
        ENCRYPTED_BACKUP_APP_STATE_ENTRY,
        config_json.as_bytes(),
    )?;
    append_tar_bytes(
        &mut archive,
        ENCRYPTED_BACKUP_MANIFEST_ENTRY,
        &manifest_json,
    )?;
    let encrypted = archive.into_inner().map_err(|error| error.to_string())?;
    let mut output = encrypted
        .finish()
        .map_err(|error| format!("Không thể hoàn tất mã hóa backup: {error}"))?;
    output.flush().map_err(|error| error.to_string())?;
    Ok(file_count)
}

fn backup_sessions_encrypted_to(
    root: &Path,
    output_path: &Path,
    config_json: &str,
    passphrase: &SensitivePassphrase,
) -> Result<(), String> {
    backup_sessions_encrypted_to_with(root, output_path, |file| {
        write_encrypted_tar(file, root, config_json, passphrase.secret())
    })
}

fn backup_sessions_encrypted_to_with<F>(
    root: &Path,
    output_path: &Path,
    write_backup: F,
) -> Result<(), String>
where
    F: FnOnce(&mut File) -> Result<usize, String>,
{
    if !root.is_dir() {
        return Err("Chưa có session nào để backup".to_string());
    }
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }
    validate_backup_output_outside_session_root(root, output_path)?;
    let temp_path = unique_output_temp_path(output_path)?;
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        let file_count = write_backup(&mut file)?;
        if file_count == 0 {
            return Err("Không có file session nào để backup".to_string());
        }
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        finalize_output_file(&temp_path, output_path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

fn unique_sibling_path(output_path: &Path, marker: &str) -> Result<PathBuf, String> {
    let parent = output_path.parent().unwrap_or_else(|| Path::new("."));
    let name = output_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("backup.zip");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    for _ in 0..1000 {
        let suffix = TEMP_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{name}.{marker}-{}-{timestamp}-{suffix}",
            std::process::id()
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "Không thể tạo file tạm duy nhất bên cạnh {}",
        output_path.display()
    ))
}

fn unique_output_temp_path(output_path: &Path) -> Result<PathBuf, String> {
    unique_sibling_path(output_path, "partial")
}

fn finalize_output_file(temp_path: &Path, output_path: &Path) -> Result<(), String> {
    if !output_path.exists() {
        return std::fs::rename(temp_path, output_path).map_err(|error| error.to_string());
    }
    let output_metadata =
        std::fs::symlink_metadata(output_path).map_err(|error| error.to_string())?;
    if !output_metadata.file_type().is_file() || is_link_or_reparse_point(output_path)? {
        return Err(format!(
            "Từ chối thay thế output không phải regular file: {}",
            output_path.display()
        ));
    }

    let previous_path = unique_sibling_path(output_path, "previous")?;
    std::fs::rename(output_path, &previous_path).map_err(|error| error.to_string())?;
    match std::fs::rename(temp_path, output_path) {
        Ok(()) => {
            let _ = std::fs::remove_file(previous_path);
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::rename(previous_path, output_path);
            Err(error.to_string())
        }
    }
}

fn validate_backup_output_outside_session_root(
    root: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let canonical_root = std::fs::canonicalize(root).map_err(|error| error.to_string())?;
    let output_parent = output_path.parent().unwrap_or_else(|| Path::new("."));
    let canonical_parent =
        std::fs::canonicalize(output_parent).map_err(|error| error.to_string())?;
    let candidate = canonical_parent.join(
        output_path
            .file_name()
            .ok_or_else(|| "Đường dẫn backup không có tên file".to_string())?,
    );
    if candidate.starts_with(&canonical_root) {
        return Err("Không thể lưu backup bên trong thư mục session đang được backup".to_string());
    }
    Ok(())
}

#[cfg(test)]
fn backup_sessions_zip_to_strict(
    root: &Path,
    output_path: &Path,
    config_json: &str,
) -> Result<(), String> {
    if !root.exists() {
        return Err("Chưa có session nào để backup".to_string());
    }
    if !root.is_dir() {
        return Err("Thư mục session không hợp lệ".to_string());
    }

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }
    validate_backup_output_outside_session_root(root, output_path)?;

    let temp_path = unique_output_temp_path(output_path)?;
    let write_result = (|| {
        let file = File::create(&temp_path).map_err(|error| error.to_string())?;
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let file_count = add_dir_to_zip(&mut zip, root, root, options)?;
        write_backup_metadata(&mut zip, options, config_json, &backup_manifest(root))?;
        zip.finish().map_err(|error| error.to_string())?;

        if file_count == 0 {
            return Err("Không có file session nào để backup".to_string());
        }
        finalize_output_file(&temp_path, output_path)
    })();

    if write_result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    write_result
}
#[cfg(test)]
fn copy_dir_best_effort(src: &Path, dst: &Path) -> Result<usize, String> {
    let mut copied = 0;
    for entry in WalkDir::new(src) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let relative = match path.strip_prefix(src) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let target = dst.join(relative);
        if path.is_dir() {
            let _ = std::fs::create_dir_all(&target);
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::copy(path, &target).is_ok() {
            copied += 1;
        }
    }
    Ok(copied)
}

#[cfg(test)]
fn backup_sessions_zip_to(root: &Path, output_path: &Path) -> Result<(), String> {
    if !root.exists() {
        return Err("Chưa có session nào để backup".to_string());
    }
    if !root.is_dir() {
        return Err("Thư mục session không hợp lệ".to_string());
    }

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }

    let temp_copy = unique_backup_temp_path(root)?;
    if temp_copy.exists() {
        let _ = std::fs::remove_dir_all(&temp_copy);
    }
    std::fs::create_dir_all(&temp_copy).map_err(|error| error.to_string())?;

    let copied = copy_dir_best_effort(root, &temp_copy)?;
    if copied == 0 {
        let _ = std::fs::remove_dir_all(&temp_copy);
        return Err("Không có file session nào để backup".to_string());
    }

    let zip_result = (|| {
        let file = File::create(output_path).map_err(|error| error.to_string())?;
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let file_count = add_dir_to_zip(&mut zip, &temp_copy, &temp_copy, options)?;
        zip.finish().map_err(|error| error.to_string())?;
        if file_count == 0 {
            let _ = std::fs::remove_file(output_path);
            return Err("Không có file session nào để backup".to_string());
        }
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&temp_copy);
    zip_result
}

#[cfg(test)]
fn write_backup_config_sidecar(output_path: &Path, config_json: &str) -> Result<(), String> {
    let config_path = config_sidecar_path(output_path);
    let temp_path = unique_output_temp_path(&config_path)?;
    let result = std::fs::write(&temp_path, config_json)
        .map_err(|error| error.to_string())
        .and_then(|_| finalize_output_file(&temp_path, &config_path));
    if result.is_err() {
        let _ = std::fs::remove_file(temp_path);
    }
    result
}

#[cfg(test)]
fn create_backup_artifacts_with_sidecar<F>(
    root: &Path,
    output_path: &Path,
    config_json: &str,
    write_sidecar: F,
) -> Result<(Option<PathBuf>, Vec<String>), String>
where
    F: FnOnce(&Path, &str) -> Result<(), String>,
{
    backup_sessions_zip_to_strict(root, output_path, config_json)?;
    let config_path = config_sidecar_path(output_path);
    match write_sidecar(output_path, config_json) {
        Ok(()) => Ok((Some(config_path), Vec::new())),
        Err(error) => Ok((
            None,
            vec![format!(
                "ZIP backup đã hoàn tất nhưng không thể ghi JSON sidecar: {error}"
            )],
        )),
    }
}

#[cfg(test)]
fn schedule_sessions_backup(
    root: &Path,
    output_path: &Path,
    config_json: String,
) -> Result<(), String> {
    if !root.exists() {
        return Err("Chưa có session nào để backup".to_string());
    }
    if !root.is_dir() {
        return Err("Thư mục session không hợp lệ".to_string());
    }
    if config_json.len() as u64 > MAX_BACKUP_METADATA_BYTES {
        return Err("App config vượt giới hạn metadata backup".to_string());
    }

    let _guard = BACKUP_SCHEDULE_LOCK
        .lock()
        .map_err(|_| "Không thể khóa lịch backup".to_string())?;
    let request_path = pending_backup_request_path(root);
    if let Some(parent) = request_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let request = PendingBackupRequest {
        output_path: output_path.to_string_lossy().into_owned(),
        config_json,
    };
    let json = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    if json.len() as u64 > MAX_PENDING_BACKUP_REQUEST_BYTES {
        return Err("Yêu cầu backup vượt giới hạn".to_string());
    }
    write_file_atomic_create_only(&request_path, &json).map_err(|error| {
        if request_path.exists() {
            "Một backup khác đã được lên lịch và đang chờ restart".to_string()
        } else {
            error
        }
    })
}

#[cfg(test)]
fn process_pending_sessions_backup(root: &Path) -> Result<(), String> {
    let request_path = pending_backup_request_path(root);
    if !request_path.exists() {
        return Ok(());
    }

    let request = (|| {
        let request_json = read_text_file_bounded(&request_path, MAX_PENDING_BACKUP_REQUEST_BYTES)?;
        serde_json::from_str::<PendingBackupRequest>(&request_json)
            .map_err(|error| error.to_string())
    })();
    let request = match request {
        Ok(request) => request,
        Err(read_error) => {
            let remove_result = std::fs::remove_file(&request_path);
            if let Err(remove_error) = remove_result {
                return Err(format!(
                    "{read_error}; không thể xóa yêu cầu backup lỗi: {remove_error}"
                ));
            }
            return Err(format!(
                "Yêu cầu backup không hợp lệ đã được xóa: {read_error}"
            ));
        }
    };
    let output_path = PathBuf::from(&request.output_path);

    let result = create_backup_artifacts_with_sidecar(
        root,
        &output_path,
        &request.config_json,
        write_backup_config_sidecar,
    );
    let remove_request_result =
        std::fs::remove_file(&request_path).map_err(|error| error.to_string());
    if let Err(error) = remove_request_result {
        return Err(format!(
            "Backup đã chạy nhưng không thể xóa yêu cầu pending: {error}"
        ));
    }

    match result {
        Ok((config_path, warnings)) => {
            if let Err(error) = append_startup_result(
                root,
                StartupOperationResult {
                    operation: "backup".to_string(),
                    success: true,
                    message: "Backup hoàn tất".to_string(),
                    zip_path: Some(output_path.to_string_lossy().into_owned()),
                    config_path: config_path.map(|path| path.to_string_lossy().into_owned()),
                    config_json: None,
                    config_restored: None,
                    warnings,
                },
            ) {
                eprintln!("[STARTUP_RESULT_WRITE_FAILED] {error}");
            }
            Ok(())
        }
        Err(error) => {
            if let Err(write_error) = append_startup_result(
                root,
                StartupOperationResult {
                    operation: "backup".to_string(),
                    success: false,
                    message: error.clone(),
                    zip_path: Some(output_path.to_string_lossy().into_owned()),
                    config_path: None,
                    config_json: None,
                    config_restored: None,
                    warnings: Vec::new(),
                },
            ) {
                eprintln!("[STARTUP_RESULT_WRITE_FAILED] {write_error}");
            }
            Err(error)
        }
    }
}

fn pending_restore_path(root: &Path) -> PathBuf {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");

    parent.join(format!(".{name}.pending-restore"))
}

fn pending_restore_config_path(root: &Path) -> PathBuf {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");

    parent.join(format!(".{name}.pending-restore-config.json"))
}

fn cleanup_restore_staging_paths_older_than(
    root: &Path,
    minimum_age: Duration,
    now: std::time::SystemTime,
) -> Result<(), String> {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    if !parent.exists() {
        return Ok(());
    }
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");
    let prefix = format!(".{name}.staging-restore");
    for entry in std::fs::read_dir(parent).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_name = entry.file_name();
        let Some(entry_name) = entry_name.to_str() else {
            continue;
        };
        let is_owned_name = entry_name == prefix
            || entry_name
                .strip_prefix(&format!("{prefix}-"))
                .is_some_and(|suffix| {
                    !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit())
                });
        let is_old_enough = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= minimum_age);
        if is_owned_name && is_old_enough {
            remove_owned_directory(&entry.path())?;
        }
    }
    Ok(())
}

fn cleanup_restore_staging_paths(root: &Path) -> Result<(), String> {
    cleanup_restore_staging_paths_older_than(
        root,
        STALE_RESTORE_STAGING_AGE,
        std::time::SystemTime::now(),
    )
}

fn unique_restore_staging_path(root: &Path) -> Result<PathBuf, String> {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");
    for suffix in 0..1000 {
        let candidate = parent.join(format!(".{name}.staging-restore-{suffix}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "Không thể tạo thư mục staging duy nhất bên cạnh {}",
        root.display()
    ))
}

fn remove_owned_directory(path: &Path) -> Result<(), String> {
    if is_link_or_reparse_point(path)? {
        return Err(format!(
            "Từ chối xóa symbolic link hoặc reparse point {}",
            path.display()
        ));
    }
    if !path.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(path).map_err(|error| error.to_string())
}

fn unique_backup_temp_path(root: &Path) -> Result<PathBuf, String> {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");

    for suffix in 0..1000 {
        let candidate = parent.join(format!(".{name}.previous-{suffix}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Không thể tạo thư mục rollback duy nhất bên cạnh {}",
        root.display()
    ))
}

fn is_backup_metadata_path(path: &Path) -> bool {
    path.components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .is_some_and(|first| first == BACKUP_METADATA_DIR)
}

fn validate_session_archive_path(path: &Path, is_directory: bool) -> Result<(), String> {
    let mut components = path.components();
    let profile_id = components
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .ok_or_else(|| "Backup chứa đường dẫn session không hợp lệ".to_string())?;

    if !is_directory && components.next().is_none() {
        return Err("File session trong backup phải nằm trong thư mục profile".to_string());
    }
    validate_profile_session_id(profile_id)?;
    Ok(())
}

fn read_embedded_app_state<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<Option<String>, String> {
    match archive.by_name(BACKUP_APP_STATE_ENTRY) {
        Ok(mut entry) => {
            if entry.size() > MAX_BACKUP_METADATA_BYTES {
                return Err("App config trong backup vượt giới hạn".to_string());
            }
            let mut config_json = String::new();
            (&mut entry)
                .take(MAX_BACKUP_METADATA_BYTES + 1)
                .read_to_string(&mut config_json)
                .map_err(|error| error.to_string())?;
            if config_json.len() as u64 > MAX_BACKUP_METADATA_BYTES {
                return Err("App config trong backup vượt giới hạn".to_string());
            }
            Ok(Some(config_json))
        }
        Err(zip::result::ZipError::FileNotFound) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn validate_embedded_backup_manifest<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<(), String> {
    let mut entry = match archive.by_name(BACKUP_MANIFEST_ENTRY) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if entry.size() > MAX_BACKUP_METADATA_BYTES {
        return Err("Manifest backup vượt giới hạn".to_string());
    }
    let manifest: BackupManifest =
        serde_json::from_reader((&mut entry).take(MAX_BACKUP_METADATA_BYTES + 1))
            .map_err(|error| format!("Manifest backup không hợp lệ: {error}"))?;
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(format!(
            "Backup format version {} không được hỗ trợ",
            manifest.format_version
        ));
    }
    Ok(())
}

fn read_sidecar_app_state(input_path: &Path) -> Result<Option<(String, PathBuf)>, String> {
    let config_path = config_sidecar_path(input_path);
    if !config_path.exists() {
        return Ok(None);
    }

    if std::fs::metadata(&config_path)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_BACKUP_METADATA_BYTES
    {
        return Err("File config đi kèm vượt giới hạn".to_string());
    }
    let config_json = std::fs::read_to_string(&config_path).map_err(|error| error.to_string())?;
    Ok(Some((config_json, config_path)))
}

fn app_state_profile_warnings(
    config_json: &str,
    restored_root: &Path,
) -> Result<Vec<String>, String> {
    let value: serde_json::Value =
        serde_json::from_str(config_json).map_err(|error| error.to_string())?;
    let workspaces = value
        .get("workspaces")
        .and_then(|workspaces| workspaces.as_array())
        .ok_or_else(|| "File config không có workspaces hợp lệ".to_string())?;

    if workspaces.is_empty() {
        return Err("File config không có workspace nào".to_string());
    }

    let mut profile_ids = Vec::<String>::new();
    for workspace in workspaces {
        if let Some(panes) = workspace.get("panes").and_then(|panes| panes.as_array()) {
            for pane in panes {
                if let Some(profile_id) = pane
                    .get("profileId")
                    .and_then(|profile_id| profile_id.as_str())
                {
                    if !profile_ids.iter().any(|existing| existing == profile_id) {
                        profile_ids.push(profile_id.to_string());
                    }
                }
            }
        }
    }

    Ok(profile_ids
        .into_iter()
        .filter(|profile_id| profile_id != "prof-default")
        .filter(|profile_id| !restored_root.join(sanitize_path_part(profile_id)).exists())
        .map(|profile_id| format!("Profile {profile_id} không có thư mục session trong backup"))
        .collect())
}

fn build_pending_restore_config<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    input_path: &Path,
    restored_root: &Path,
) -> PendingRestoreConfig {
    let mut config_path = None;
    let mut config_source = None;
    let mut config_error = None;
    let mut warnings = Vec::new();

    let config_json = match read_embedded_app_state(archive) {
        Ok(Some(config_json)) => {
            config_source = Some("embedded".to_string());
            Some(config_json)
        }
        Ok(None) => match read_sidecar_app_state(input_path) {
            Ok(Some((config_json, sidecar_path))) => {
                config_path = Some(sidecar_path.to_string_lossy().into_owned());
                config_source = Some("sidecar".to_string());
                Some(config_json)
            }
            Ok(None) => {
                warnings.push("Backup không có app config; chỉ restore session".to_string());
                None
            }
            Err(error) => {
                config_error = Some(format!("Không đọc được file config đi kèm: {error}"));
                None
            }
        },
        Err(error) => {
            config_error = Some(format!("Không đọc được app config trong backup: {error}"));
            None
        }
    };

    let config_json = config_json.and_then(|config_json| {
        match app_state_profile_warnings(&config_json, restored_root) {
            Ok(mut profile_warnings) => {
                warnings.append(&mut profile_warnings);
                Some(config_json)
            }
            Err(error) => {
                config_error = Some(format!("Config backup không hợp lệ: {error}"));
                None
            }
        }
    });

    PendingRestoreConfig {
        config_json,
        config_path,
        config_source,
        config_error,
        warnings,
    }
}

fn stage_pending_restore_config(
    root: &Path,
    config: &PendingRestoreConfig,
) -> Result<PathBuf, String> {
    let path = pending_restore_config_path(root);
    let json = serde_json::to_string(config).map_err(|error| error.to_string())?;
    let temp_path = unique_output_temp_path(&path)?;
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        Ok::<(), String>(())
    })();
    match result {
        Ok(()) => Ok(temp_path),
        Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            Err(error)
        }
    }
}

fn read_pending_restore_config(root: &Path) -> PendingRestoreConfig {
    let path = pending_restore_config_path(root);
    read_text_file_bounded(&path, MAX_PENDING_RESTORE_CONFIG_BYTES)
        .ok()
        .and_then(|raw| serde_json::from_str::<PendingRestoreConfig>(&raw).ok())
        .unwrap_or(PendingRestoreConfig {
            config_json: None,
            config_path: None,
            config_source: None,
            config_error: Some("Không tìm thấy app config đã stage".to_string()),
            warnings: vec!["Không thể restore layout/profile mapping".to_string()],
        })
}

fn validate_restore_archive_with_limits<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    limits: RestoreLimits,
) -> Result<(), String> {
    if archive.len() > limits.max_entries {
        return Err(format!(
            "Backup có quá nhiều entry (tối đa {})",
            limits.max_entries
        ));
    }

    let mut total = 0_u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "Backup chứa đường dẫn không an toàn".to_string())?;
        if enclosed.as_os_str().is_empty() {
            return Err("Backup chứa entry không hợp lệ".to_string());
        }
        if entry.is_dir() {
            continue;
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Backup không được chứa symbolic link".to_string());
        }

        let size = entry.size();
        if size > limits.max_file_bytes {
            return Err(format!(
                "Một file trong backup vượt giới hạn {} byte",
                limits.max_file_bytes
            ));
        }
        total = total
            .checked_add(size)
            .ok_or_else(|| "Tổng kích thước backup vượt giới hạn".to_string())?;
        if total > limits.max_total_bytes {
            return Err(format!(
                "Tổng dữ liệu giải nén vượt giới hạn {} byte",
                limits.max_total_bytes
            ));
        }

        let compressed = entry.compressed_size();
        if size > 0
            && (compressed == 0 || size > compressed.saturating_mul(limits.max_compression_ratio))
        {
            return Err(format!(
                "Backup có compression ratio vượt giới hạn {}:1",
                limits.max_compression_ratio
            ));
        }
    }
    Ok(())
}

fn restore_archive_into_temp<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    temp_root: &Path,
    cancel_requested: &AtomicBool,
) -> Result<usize, String> {
    validate_restore_archive_with_limits(archive, RESTORE_LIMITS)?;
    let mut restored_files = 0;
    let mut restored_bytes = 0_u64;
    let mut buffer = [0_u8; RESTORE_COPY_BUFFER_BYTES];

    for index in 0..archive.len() {
        if cancel_requested.load(Ordering::Relaxed) {
            return Err("Restore đã bị hủy".to_string());
        }
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "Backup chứa đường dẫn không an toàn".to_string())?
            .to_path_buf();

        if enclosed.as_os_str().is_empty() || is_backup_metadata_path(&enclosed) {
            continue;
        }

        validate_session_archive_path(&enclosed, entry.is_dir())?;

        let outpath = temp_root.join(enclosed);

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|error| error.to_string())?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut outfile = File::create(&outpath).map_err(|error| error.to_string())?;
        let mut file_bytes = 0_u64;
        loop {
            if cancel_requested.load(Ordering::Relaxed) {
                return Err("Restore đã bị hủy".to_string());
            }
            let read = entry.read(&mut buffer).map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            file_bytes = file_bytes.saturating_add(read as u64);
            restored_bytes = restored_bytes.saturating_add(read as u64);
            if file_bytes > MAX_RESTORE_FILE_BYTES || restored_bytes > MAX_RESTORE_TOTAL_BYTES {
                return Err("Dữ liệu giải nén vượt giới hạn".to_string());
            }
            outfile
                .write_all(&buffer[..read])
                .map_err(|error| error.to_string())?;
        }
        restored_files += 1;
    }

    if restored_files == 0 {
        return Err("File backup không chứa session hợp lệ".to_string());
    }

    Ok(restored_files)
}

fn backup_auth_error() -> String {
    "BACKUP_AUTH_FAILED: Không thể giải mã backup; mật khẩu sai hoặc file đã bị thay đổi/hỏng"
        .to_string()
}

fn is_legacy_zip(input_path: &Path) -> Result<bool, String> {
    let mut signature = [0_u8; 4];
    let read = File::open(input_path)
        .map_err(|error| error.to_string())?
        .read(&mut signature)
        .map_err(|error| error.to_string())?;
    Ok(read == signature.len()
        && matches!(
            signature,
            [b'P', b'K', 3, 4] | [b'P', b'K', 5, 6] | [b'P', b'K', 7, 8]
        ))
}

fn stage_sessions_restore_from_encrypted_with_cancel(
    root: &Path,
    input_path: &Path,
    passphrase: &SensitivePassphrase,
    cancel_requested: &AtomicBool,
) -> Result<(), String> {
    let parent = root
        .parent()
        .ok_or_else(|| "Đường dẫn session không hợp lệ".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let pending_root = pending_restore_path(root);
    let pending_config_path = pending_restore_config_path(root);
    if pending_root.exists() || pending_config_path.exists() {
        return Err("Một restore đã được stage và đang chờ restart".to_string());
    }
    cleanup_restore_staging_paths(root)?;
    let staging_root = unique_restore_staging_path(root)?;
    std::fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;

    let restore_result = (|| {
        let input = BufReader::new(File::open(input_path).map_err(|error| error.to_string())?);
        let decryptor = age::Decryptor::new_buffered(input).map_err(|_| backup_auth_error())?;
        let mut identity = age::scrypt::Identity::new(passphrase.secret());
        identity.set_max_work_factor(BACKUP_SCRYPT_LOG_N);
        let reader = decryptor
            .decrypt(std::iter::once(&identity as &dyn age::Identity))
            .map_err(|_| backup_auth_error())?;
        let mut archive = tar::Archive::new(reader);
        let mut entry_count = 0_usize;
        let mut total_bytes = 0_u64;
        let mut restored_files = 0_usize;
        let mut config_json: Option<String> = None;
        let mut manifest: Option<BackupManifest> = None;
        let mut buffer = [0_u8; RESTORE_COPY_BUFFER_BYTES];

        {
            let entries = archive.entries().map_err(|_| backup_auth_error())?;
            for entry in entries {
                if cancel_requested.load(Ordering::Relaxed) {
                    return Err("Restore đã bị hủy".to_string());
                }
                entry_count = entry_count.saturating_add(1);
                if entry_count > MAX_RESTORE_ENTRIES {
                    return Err(format!(
                        "Backup có quá nhiều entry (tối đa {MAX_RESTORE_ENTRIES})"
                    ));
                }
                let mut entry = entry.map_err(|_| backup_auth_error())?;
                let path = entry.path().map_err(|_| backup_auth_error())?.into_owned();
                if path.is_absolute()
                    || path.components().any(|component| {
                        matches!(
                            component,
                            std::path::Component::ParentDir
                                | std::path::Component::RootDir
                                | std::path::Component::Prefix(_)
                        )
                    })
                {
                    return Err("Backup chứa đường dẫn không an toàn".to_string());
                }
                let entry_type = entry.header().entry_type();
                if !entry_type.is_file() {
                    return Err("Backup mã hóa chứa entry không phải regular file".to_string());
                }
                let size = entry.header().size().map_err(|_| backup_auth_error())?;
                if size > MAX_RESTORE_FILE_BYTES && !is_backup_metadata_path(&path) {
                    return Err(format!(
                        "Một file trong backup vượt giới hạn {MAX_RESTORE_FILE_BYTES} byte"
                    ));
                }
                total_bytes = total_bytes
                    .checked_add(size)
                    .ok_or_else(|| "Tổng kích thước backup vượt giới hạn".to_string())?;
                if total_bytes
                    > MAX_RESTORE_TOTAL_BYTES.saturating_add(MAX_BACKUP_METADATA_BYTES * 2)
                {
                    return Err(format!(
                        "Tổng dữ liệu giải nén vượt giới hạn {MAX_RESTORE_TOTAL_BYTES} byte"
                    ));
                }

                if path == Path::new(ENCRYPTED_BACKUP_APP_STATE_ENTRY) {
                    if size > MAX_BACKUP_METADATA_BYTES {
                        return Err("App config trong backup vượt giới hạn".to_string());
                    }
                    let mut bytes = Vec::with_capacity(size as usize);
                    entry
                        .read_to_end(&mut bytes)
                        .map_err(|_| backup_auth_error())?;
                    config_json = Some(String::from_utf8(bytes).map_err(|_| {
                        "App config trong backup không phải UTF-8 hợp lệ".to_string()
                    })?);
                    continue;
                }
                if path == Path::new(ENCRYPTED_BACKUP_MANIFEST_ENTRY) {
                    if size > MAX_BACKUP_METADATA_BYTES {
                        return Err("Manifest backup vượt giới hạn".to_string());
                    }
                    manifest = Some(
                        serde_json::from_reader((&mut entry).take(MAX_BACKUP_METADATA_BYTES + 1))
                            .map_err(|error| format!("Manifest backup không hợp lệ: {error}"))?,
                    );
                    continue;
                }
                if is_backup_metadata_path(&path) {
                    return Err("Backup chứa metadata không được hỗ trợ".to_string());
                }
                validate_session_archive_path(&path, false)?;
                let outpath = staging_root.join(&path);
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let mut output = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&outpath)
                    .map_err(|error| error.to_string())?;
                let mut written = 0_u64;
                loop {
                    if cancel_requested.load(Ordering::Relaxed) {
                        return Err("Restore đã bị hủy".to_string());
                    }
                    let read = entry.read(&mut buffer).map_err(|_| backup_auth_error())?;
                    if read == 0 {
                        break;
                    }
                    written = written.saturating_add(read as u64);
                    if written > size || written > MAX_RESTORE_FILE_BYTES {
                        return Err("Dữ liệu giải nén vượt giới hạn".to_string());
                    }
                    output
                        .write_all(&buffer[..read])
                        .map_err(|error| error.to_string())?;
                }
                if written != size {
                    return Err(backup_auth_error());
                }
                restored_files += 1;
            }
        }
        // Drain the authenticated age stream after TAR reaches its end markers. TAR
        // legitimately leaves zero padding unread; reaching EOF here also forces age
        // to authenticate its final chunk and reject truncation/tampering.
        let mut authenticated_stream = archive.into_inner();
        std::io::copy(&mut authenticated_stream, &mut std::io::sink())
            .map_err(|_| backup_auth_error())?;
        if restored_files == 0 {
            return Err("File backup không chứa session hợp lệ".to_string());
        }
        let manifest = manifest.ok_or_else(|| {
            "BACKUP_FORMAT_UNSUPPORTED: Backup mã hóa không có manifest".to_string()
        })?;
        if manifest.format_version != ENCRYPTED_BACKUP_FORMAT_VERSION {
            return Err(format!(
                "BACKUP_FORMAT_UNSUPPORTED: Backup format version {} không được hỗ trợ",
                manifest.format_version
            ));
        }
        let config_json = config_json.ok_or_else(|| {
            "BACKUP_FORMAT_UNSUPPORTED: Backup mã hóa không có app config".to_string()
        })?;
        let warnings = app_state_profile_warnings(&config_json, &staging_root)
            .map_err(|error| format!("Config backup không hợp lệ: {error}"))?;
        Ok::<PendingRestoreConfig, String>(PendingRestoreConfig {
            config_json: Some(config_json),
            config_path: None,
            config_source: Some("encrypted".to_string()),
            config_error: None,
            warnings,
        })
    })();

    let restore_config = match restore_result {
        Ok(config) => config,
        Err(error) => {
            let cleanup = remove_owned_directory(&staging_root);
            return match cleanup {
                Ok(()) => Err(error),
                Err(cleanup_error) => {
                    Err(format!("{error}; không thể dọn staging: {cleanup_error}"))
                }
            };
        }
    };
    commit_staged_restore(root, &staging_root, &restore_config)
}

fn commit_staged_restore(
    root: &Path,
    staging_root: &Path,
    restore_config: &PendingRestoreConfig,
) -> Result<(), String> {
    let pending_root = pending_restore_path(root);
    let pending_config = pending_restore_config_path(root);
    let staged_config = match stage_pending_restore_config(root, restore_config) {
        Ok(path) => path,
        Err(error) => {
            if let Err(cleanup_error) = remove_owned_directory(staging_root) {
                return Err(format!("{error}; không thể dọn staging: {cleanup_error}"));
            }
            return Err(error);
        }
    };
    if let Err(error) = std::fs::rename(staging_root, &pending_root) {
        let cleanup_error = remove_owned_directory(staging_root).err();
        let _ = std::fs::remove_file(&staged_config);
        return Err(match cleanup_error {
            Some(cleanup_error) => format!("{error}; không thể dọn staging: {cleanup_error}"),
            None => error.to_string(),
        });
    }
    if let Err(error) = std::fs::rename(&staged_config, &pending_config) {
        if std::fs::rename(&pending_root, staging_root).is_err() {
            let _ = std::fs::remove_file(&staged_config);
            return Err(format!(
                "{error}; rollback không thể gỡ restore đã stage tại {}",
                pending_root.display()
            ));
        }
        let cleanup_error = remove_owned_directory(staging_root).err();
        let _ = std::fs::remove_file(&staged_config);
        return Err(match cleanup_error {
            Some(cleanup_error) => format!("{error}; không thể dọn staging: {cleanup_error}"),
            None => error.to_string(),
        });
    }
    Ok(())
}

fn stage_sessions_restore_from_zip_with_cancel(
    root: &Path,
    input_path: &Path,
    cancel_requested: &AtomicBool,
) -> Result<(), String> {
    let parent = root
        .parent()
        .ok_or_else(|| "Đường dẫn session không hợp lệ".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let pending_root = pending_restore_path(root);
    let pending_config = pending_restore_config_path(root);
    if pending_root.exists() || pending_config.exists() {
        return Err("Một restore đã được stage và đang chờ restart".to_string());
    }
    cleanup_restore_staging_paths(root)?;
    let staging_root = unique_restore_staging_path(root)?;
    std::fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;

    let restore_result = (|| {
        let file = File::open(input_path).map_err(|error| error.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
        validate_embedded_backup_manifest(&mut archive)?;
        restore_archive_into_temp(&mut archive, &staging_root, cancel_requested)?;
        if cancel_requested.load(Ordering::Relaxed) {
            return Err("Restore đã bị hủy".to_string());
        }
        let restore_config = build_pending_restore_config(&mut archive, input_path, &staging_root);
        Ok::<PendingRestoreConfig, String>(restore_config)
    })();

    let restore_config = match restore_result {
        Ok(config) => config,
        Err(error) => {
            if let Err(cleanup_error) = remove_owned_directory(&staging_root) {
                return Err(format!("{error}; không thể dọn staging: {cleanup_error}"));
            }
            return Err(error);
        }
    };

    let staged_config = match stage_pending_restore_config(root, &restore_config) {
        Ok(path) => path,
        Err(error) => {
            if let Err(cleanup_error) = remove_owned_directory(&staging_root) {
                return Err(format!("{error}; không thể dọn staging: {cleanup_error}"));
            }
            return Err(error);
        }
    };
    if let Err(error) = std::fs::rename(&staging_root, &pending_root) {
        let cleanup_error = remove_owned_directory(&staging_root).err();
        let _ = std::fs::remove_file(&staged_config);
        return Err(match cleanup_error {
            Some(cleanup_error) => format!("{error}; không thể dọn staging: {cleanup_error}"),
            None => error.to_string(),
        });
    }
    if let Err(error) = std::fs::rename(&staged_config, &pending_config) {
        if std::fs::rename(&pending_root, &staging_root).is_err() {
            let _ = std::fs::remove_file(&staged_config);
            return Err(format!(
                "{error}; rollback không thể gỡ restore đã stage tại {}",
                pending_root.display()
            ));
        }
        let cleanup_error = remove_owned_directory(&staging_root).err();
        let _ = std::fs::remove_file(&staged_config);
        return Err(match cleanup_error {
            Some(cleanup_error) => format!("{error}; không thể dọn staging: {cleanup_error}"),
            None => error.to_string(),
        });
    }

    Ok(())
}

#[cfg(test)]
fn stage_sessions_restore_from_zip(root: &Path, input_path: &Path) -> Result<(), String> {
    let cancel_requested = AtomicBool::new(false);
    stage_sessions_restore_from_zip_with_cancel(root, input_path, &cancel_requested)
}

fn apply_staged_sessions_restore(root: &Path) -> Result<Vec<String>, String> {
    let pending_root = pending_restore_path(root);
    if !pending_root.exists() {
        return Ok(Vec::new());
    }
    if is_link_or_reparse_point(&pending_root)? {
        return Err("Restore pending là symbolic link hoặc reparse point".to_string());
    }
    if root.exists() && is_link_or_reparse_point(root)? {
        return Err("Thư mục session hiện tại là symbolic link hoặc reparse point".to_string());
    }

    let previous_root = unique_backup_temp_path(root)?;

    let had_existing_root = root.exists();
    if had_existing_root {
        std::fs::rename(root, &previous_root).map_err(|error| error.to_string())?;
    }

    if let Err(error) = std::fs::rename(&pending_root, root) {
        if had_existing_root && std::fs::rename(&previous_root, root).is_err() {
            return Err(format!(
                "{error}; rollback không thể khôi phục session cũ từ {}",
                previous_root.display()
            ));
        }
        return Err(error.to_string());
    }

    let mut warnings = Vec::new();
    if had_existing_root {
        if let Err(error) = remove_owned_directory(&previous_root) {
            eprintln!("[RESTORE_PREVIOUS_CLEANUP_FAILED] {error}");
            warnings.push(
                "Restore đã áp dụng nhưng không thể dọn bản session cũ; hãy khởi động lại app trước khi thử lại"
                    .to_string(),
            );
        }
    }

    Ok(warnings)
}

#[tauri::command]
pub(crate) async fn backup_sessions_zip(
    app: tauri::AppHandle,
    config_json: String,
    passphrase: String,
) -> Result<Option<String>, String> {
    // Bảo mật: file backup chứa cookie session sống của mọi tài khoản đang đăng
    // nhập, nên Rust tự mở hộp thoại lưu thay vì nhận đường dẫn tùy ý từ frontend
    // (frontend bị chiếm quyền có thể exfiltrate cookie ra đường dẫn bất kỳ).
    // Dùng blocking_save_file trên luồng riêng để không chặn luồng chính.
    let passphrase = SensitivePassphrase::new(passphrase)?;
    let default_name = format!("ai-multiplexer-backup-{}.acmbak", today_utc_yyyy_mm_dd());
    let dialog_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Lưu full backup")
            .set_file_name(&default_name)
            .add_filter("AI Chat Multiplexer encrypted backup", &["acmbak"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let output_path = match chosen {
        Some(file_path) => file_path.into_path().map_err(|error| error.to_string())?,
        None => return Ok(None),
    };

    for (label, webview) in app.webviews() {
        if label.starts_with("tab-") {
            webview
                .close()
                .map_err(|error| format!("Không thể đóng session trước khi backup: {error}"))?;
        }
    }
    let root = pane_sessions_root(&app)?;
    let backup_path = output_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        backup_sessions_encrypted_to(&root, &backup_path, &config_json, &passphrase)
    })
    .await
    .map_err(|_| "Backup worker bị dừng".to_string())??;
    Ok(Some(output_path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub(crate) async fn session_startup_results(
    app: tauri::AppHandle,
) -> Result<Vec<StartupOperationResult>, String> {
    let root = pane_sessions_root(&app)?;
    let path = startup_result_path(&root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = read_text_file_bounded(&path, MAX_STARTUP_RESULTS_BYTES)?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn acknowledge_session_startup_results_for_root(root: &Path) -> Result<(), String> {
    let result_path = startup_result_path(root);
    if !result_path.exists() {
        return Ok(());
    }
    let raw = read_text_file_bounded(&result_path, MAX_STARTUP_RESULTS_BYTES)?;
    let results: Vec<StartupOperationResult> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let acknowledged_restore = results.iter().any(|result| result.operation == "restore");
    std::fs::remove_file(&result_path).map_err(|error| error.to_string())?;
    let restore_config_path = pending_restore_config_path(root);
    if acknowledged_restore && restore_config_path.exists() {
        std::fs::remove_file(&restore_config_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn acknowledge_session_startup_results(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let root = pane_sessions_root(&app)?;
    acknowledge_session_startup_results_for_root(&root)
}

#[tauri::command]
pub(crate) async fn restore_sessions_zip(
    app: tauri::AppHandle,
    passphrase: String,
) -> Result<Option<String>, String> {
    // Bảo mật: Rust tự mở hộp thoại chọn file thay vì nhận đường dẫn tùy ý từ
    // frontend, tránh việc cấy dữ liệu session từ đường dẫn bất kỳ.
    // blocking_pick_file chạy trên luồng riêng để không chặn luồng chính.
    let dialog_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Chọn full backup")
            .add_filter("AI Chat Multiplexer backup", &["acmbak", "zip"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let input_path = match chosen {
        Some(file_path) => file_path.into_path().map_err(|error| error.to_string())?,
        None => return Ok(None),
    };
    let legacy_zip = is_legacy_zip(&input_path)?;
    let passphrase = if legacy_zip {
        None
    } else {
        Some(SensitivePassphrase::new(passphrase)?)
    };

    let root = pane_sessions_root(&app)?;
    let cancel_requested = Arc::new(AtomicBool::new(false));
    {
        let mut active = ACTIVE_RESTORE_CANCEL
            .lock()
            .map_err(|_| "Không thể khóa trạng thái restore".to_string())?;
        if active.is_some() {
            return Err("Một restore khác đang chạy".to_string());
        }
        *active = Some(cancel_requested.clone());
    }
    let restore_path = input_path.clone();
    let worker_cancel = cancel_requested.clone();
    let worker_result = tauri::async_runtime::spawn_blocking(move || match passphrase {
        Some(passphrase) => stage_sessions_restore_from_encrypted_with_cancel(
            &root,
            &restore_path,
            &passphrase,
            &worker_cancel,
        ),
        None => stage_sessions_restore_from_zip_with_cancel(&root, &restore_path, &worker_cancel),
    })
    .await;
    {
        let mut active = ACTIVE_RESTORE_CANCEL
            .lock()
            .map_err(|_| "Không thể mở khóa trạng thái restore".to_string())?;
        if active
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &cancel_requested))
        {
            *active = None;
        }
    }
    let result = worker_result.map_err(|_| "Restore worker bị dừng".to_string())?;
    result?;
    Ok(Some(input_path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub(crate) async fn cancel_restore_sessions() -> Result<(), String> {
    let active = ACTIVE_RESTORE_CANCEL
        .lock()
        .map_err(|_| "Không thể khóa trạng thái restore".to_string())?;
    if let Some(cancel_requested) = active.as_ref() {
        cancel_requested.store(true, Ordering::SeqCst);
    }
    Ok(())
}

pub(crate) fn process_session_startup(app: &tauri::AppHandle) -> Result<(), String> {
    let root = pane_sessions_root(app)?;
    if let Err(error) = cleanup_restore_staging_paths(&root) {
        eprintln!("[RESTORE_STAGING_CLEANUP_FAILED] {error}");
    }
    let mut staged_restore_applied = false;
    let mut restore_cleanup_warnings = Vec::new();
    if pending_restore_path(&root).exists() {
        match apply_staged_sessions_restore(&root) {
            Ok(cleanup_warnings) => {
                staged_restore_applied = true;
                restore_cleanup_warnings = cleanup_warnings;
            }
            Err(error) => {
                eprintln!("[FULL_RESTORE_STARTUP_FAILED]");
                if let Err(write_error) = append_startup_result(
                    &root,
                    StartupOperationResult {
                        operation: "restore".to_string(),
                        success: false,
                        message: error,
                        zip_path: None,
                        config_path: None,
                        config_json: None,
                        config_restored: Some(false),
                        warnings: Vec::new(),
                    },
                ) {
                    eprintln!("[STARTUP_RESULT_WRITE_FAILED] {write_error}");
                }
            }
        }
    }
    let restore_config_path = pending_restore_config_path(&root);
    if staged_restore_applied
        || (restore_config_path.exists() && !pending_restore_path(&root).exists())
    {
        let restore_config = read_pending_restore_config(&root);
        let mut warnings = restore_config.warnings;
        warnings.extend(restore_cleanup_warnings);
        if !staged_restore_applied {
            warnings.push(
                "Khôi phục app state tiếp tục sau lần khởi động trước bị gián đoạn".to_string(),
            );
        }
        if let Some(error) = &restore_config.config_error {
            warnings.push(error.clone());
        }
        let config_restored = restore_config.config_json.is_some();
        if let Err(error) = append_startup_result(
            &root,
            StartupOperationResult {
                operation: "restore".to_string(),
                success: true,
                message: "Restore hoàn tất".to_string(),
                zip_path: None,
                config_path: restore_config.config_path,
                config_json: restore_config.config_json,
                config_restored: Some(config_restored),
                warnings,
            },
        ) {
            eprintln!("[STARTUP_RESULT_WRITE_FAILED] {error}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod backup_restore_tests {
    use super::*;
    use std::fs;
    use std::io::Cursor;

    fn test_root(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("ai-chat-multiplexer-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        root
    }

    fn create_zip(path: &Path, entries: &[(&str, &[u8])]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let file = File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, contents) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(contents).unwrap();
        }
        zip.finish().unwrap();
    }

    fn archive_from_entries(
        entries: &[(&str, &[u8])],
        compression: zip::CompressionMethod,
    ) -> ZipArchive<Cursor<Vec<u8>>> {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut bytes);
            let options = SimpleFileOptions::default().compression_method(compression);
            for (name, contents) in entries {
                zip.start_file(*name, options).unwrap();
                zip.write_all(contents).unwrap();
            }
            zip.finish().unwrap();
        }
        bytes.set_position(0);
        ZipArchive::new(bytes).unwrap()
    }

    fn test_limits(
        max_entries: usize,
        max_total_bytes: u64,
        max_file_bytes: u64,
        max_compression_ratio: u64,
    ) -> RestoreLimits {
        RestoreLimits {
            max_entries,
            max_total_bytes,
            max_file_bytes,
            max_compression_ratio,
        }
    }

    fn startup_result(message: &str) -> StartupOperationResult {
        StartupOperationResult {
            operation: "backup".to_string(),
            success: true,
            message: message.to_string(),
            zip_path: None,
            config_path: None,
            config_json: None,
            config_restored: None,
            warnings: Vec::new(),
        }
    }

    #[test]
    fn today_utc_is_iso_date_shape() {
        let today = today_utc_yyyy_mm_dd();
        assert_eq!(today.len(), 10);
        let parts: Vec<&str> = today.split('-').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].len(), 4);
        assert_eq!(parts[1].len(), 2);
        assert_eq!(parts[2].len(), 2);
        assert!(parts
            .iter()
            .all(|part| part.chars().all(|character| character.is_ascii_digit())));
    }

    fn valid_encrypted_config(profile_id: &str) -> String {
        format!(
            r#"{{"workspaces":[{{"id":"ws","panes":[{{"profileId":"{profile_id}"}}]}}],"activeWorkspaceId":"ws","profiles":[{{"id":"{profile_id}","name":"Test"}}]}}"#
        )
    }

    fn encrypted_fixture(name: &str) -> (PathBuf, PathBuf, SensitivePassphrase, String) {
        let dir = test_root(name);
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("profile");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"secret-cookie").unwrap();
        let output = dir.join("backup.acmbak");
        let passphrase =
            SensitivePassphrase::new("correct horse battery staple".to_string()).unwrap();
        let config = valid_encrypted_config("profile");
        backup_sessions_encrypted_to(&sessions, &output, &config, &passphrase).unwrap();
        (dir, output, passphrase, config)
    }

    #[test]
    fn encrypted_backup_roundtrip_contains_no_plaintext_and_stages_without_touching_live() {
        let (dir, output, passphrase, config) = encrypted_fixture("encrypted-roundtrip");
        let ciphertext = fs::read(&output).unwrap();
        assert!(!ciphertext.starts_with(b"PK"));
        assert!(!ciphertext
            .windows(b"secret-cookie".len())
            .any(|window| window == b"secret-cookie"));
        assert!(!ciphertext
            .windows(config.len())
            .any(|window| window == config.as_bytes()));

        let live = dir.join("live-sessions");
        fs::create_dir_all(live.join("old-profile")).unwrap();
        fs::write(live.join("old-profile").join("Cookies"), b"old").unwrap();
        let cancel = AtomicBool::new(false);
        stage_sessions_restore_from_encrypted_with_cancel(&live, &output, &passphrase, &cancel)
            .unwrap();

        assert_eq!(
            fs::read(live.join("old-profile").join("Cookies")).unwrap(),
            b"old"
        );
        assert_eq!(
            fs::read(pending_restore_path(&live).join("profile").join("Cookies")).unwrap(),
            b"secret-cookie"
        );
        let restored = read_pending_restore_config(&live);
        assert_eq!(restored.config_json.as_deref(), Some(config.as_str()));
        assert_eq!(restored.config_source.as_deref(), Some("encrypted"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn encrypted_restore_wrong_password_fails_without_touching_live_or_leaving_temp() {
        let (dir, output, _passphrase, _) = encrypted_fixture("encrypted-wrong-password");
        let live = dir.join("live-sessions");
        fs::create_dir_all(live.join("old-profile")).unwrap();
        fs::write(live.join("old-profile").join("Cookies"), b"old").unwrap();
        let wrong = SensitivePassphrase::new("definitely wrong".to_string()).unwrap();
        let cancel = AtomicBool::new(false);

        let error =
            stage_sessions_restore_from_encrypted_with_cancel(&live, &output, &wrong, &cancel)
                .unwrap_err();

        assert!(error.starts_with("BACKUP_AUTH_FAILED:"));
        assert_eq!(
            fs::read(live.join("old-profile").join("Cookies")).unwrap(),
            b"old"
        );
        assert!(!pending_restore_path(&live).exists());
        assert!(!pending_restore_config_path(&live).exists());
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .contains("staging-restore"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn encrypted_restore_rejects_tamper_and_truncation_before_staging() {
        for tamper in [true, false] {
            let label = if tamper { "tamper" } else { "truncated" };
            let (dir, output, passphrase, _) = encrypted_fixture(&format!("encrypted-{label}"));
            let mut ciphertext = fs::read(&output).unwrap();
            if tamper {
                let index = ciphertext.len() - 24;
                ciphertext[index] ^= 0x80;
            } else {
                ciphertext.truncate(ciphertext.len() - 20);
            }
            fs::write(&output, ciphertext).unwrap();
            let live = dir.join("live-sessions");
            fs::create_dir_all(live.join("old-profile")).unwrap();
            fs::write(live.join("old-profile").join("Cookies"), b"old").unwrap();
            let cancel = AtomicBool::new(false);

            let error = stage_sessions_restore_from_encrypted_with_cancel(
                &live,
                &output,
                &passphrase,
                &cancel,
            )
            .unwrap_err();

            assert!(error.starts_with("BACKUP_AUTH_FAILED:"), "{label}: {error}");
            assert_eq!(
                fs::read(live.join("old-profile").join("Cookies")).unwrap(),
                b"old"
            );
            assert!(!pending_restore_path(&live).exists());
            assert!(!pending_restore_config_path(&live).exists());
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn empty_backup_passphrase_is_rejected() {
        let error = SensitivePassphrase::new(String::new()).err().unwrap();
        assert!(error.starts_with("BACKUP_PASSPHRASE_REQUIRED:"));
    }

    fn test_encrypted_limits(
        max_entries: usize,
        max_total_bytes: u64,
        max_file_bytes: u64,
    ) -> EncryptedBackupLimits {
        EncryptedBackupLimits {
            max_entries,
            max_total_bytes,
            max_file_bytes,
            max_metadata_bytes: MAX_BACKUP_METADATA_BYTES,
        }
    }

    #[test]
    fn encrypted_export_counts_mandatory_metadata_entries() {
        let dir = test_root("encrypted-entry-limit");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("profile")).unwrap();
        fs::write(sessions.join("profile").join("one"), b"1").unwrap();
        fs::write(sessions.join("profile").join("two"), b"2").unwrap();
        let config = valid_encrypted_config("profile");
        let passphrase = SensitivePassphrase::new("test passphrase".to_string()).unwrap();

        let error = write_encrypted_tar_with_limits(
            Vec::new(),
            &sessions,
            &config,
            passphrase.secret(),
            test_encrypted_limits(3, 1024 * 1024, 1024),
        )
        .unwrap_err();

        assert!(error.contains("quá nhiều entry"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn encrypted_export_rejects_total_size_including_metadata() {
        let dir = test_root("encrypted-total-limit");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("profile")).unwrap();
        fs::write(sessions.join("profile").join("Cookies"), b"12345678").unwrap();
        let config = valid_encrypted_config("profile");
        let manifest_len = serde_json::to_vec(&encrypted_backup_manifest(&sessions))
            .unwrap()
            .len() as u64;
        let metadata_len = config.len() as u64 + manifest_len;
        let passphrase = SensitivePassphrase::new("test passphrase".to_string()).unwrap();

        let error = write_encrypted_tar_with_limits(
            Vec::new(),
            &sessions,
            &config,
            passphrase.secret(),
            test_encrypted_limits(10, metadata_len + 7, 1024),
        )
        .unwrap_err();

        assert!(error.contains("Tổng dữ liệu backup vượt giới hạn"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn encrypted_export_rejects_file_size_consistently_with_restore() {
        let dir = test_root("encrypted-file-limit");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("profile")).unwrap();
        fs::write(sessions.join("profile").join("Cookies"), b"12345").unwrap();
        let config = valid_encrypted_config("profile");
        let passphrase = SensitivePassphrase::new("test passphrase".to_string()).unwrap();

        let error = write_encrypted_tar_with_limits(
            Vec::new(),
            &sessions,
            &config,
            passphrase.secret(),
            test_encrypted_limits(10, 1024 * 1024, 4),
        )
        .unwrap_err();

        assert!(error.contains("Một file session vượt giới hạn 4 byte"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn exact_length_reader_rejects_source_shrink() {
        let mut reader = ExactLengthReader::new(std::io::Cursor::new(b"123"), 5);
        let mut output = Vec::new();

        let error = reader.read_to_end(&mut output).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::UnexpectedEof);
        assert_eq!(output, b"123");
        assert!(reader.verify_complete().is_err());
    }

    #[test]
    fn exact_length_reader_rejects_source_growth_without_exposing_extra_bytes() {
        let mut reader = ExactLengthReader::new(std::io::Cursor::new(b"12345"), 3);
        let mut output = Vec::new();

        let error = reader.read_to_end(&mut output).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(output, b"123");
        assert!(reader.verify_complete().is_err());
    }

    #[test]
    fn exact_length_reader_accepts_unchanged_source() {
        let mut reader = ExactLengthReader::new(std::io::Cursor::new(b"123"), 3);
        let mut output = Vec::new();

        reader.read_to_end(&mut output).unwrap();
        reader.verify_complete().unwrap();

        assert_eq!(output, b"123");
    }

    #[test]
    fn encrypted_backup_source_shrink_preserves_existing_output_and_cleans_partial() {
        let dir = test_root("encrypted-source-shrink");
        let sessions = dir.join("pane-sessions");
        let source = sessions.join("profile").join("Cookies");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"12345").unwrap();
        let output = dir.join("backup.acmbak");
        fs::write(&output, b"existing-backup").unwrap();
        let config = valid_encrypted_config("profile");
        let passphrase = SensitivePassphrase::new("test passphrase".to_string()).unwrap();

        let error = backup_sessions_encrypted_to_with(&sessions, &output, |file| {
            write_encrypted_tar_with_limits_and_hook(
                file,
                &sessions,
                &config,
                passphrase.secret(),
                ENCRYPTED_BACKUP_LIMITS,
                |path, declared| {
                    assert_eq!(declared, 5);
                    fs::write(path, b"123").map_err(|error| error.to_string())
                },
            )
        })
        .unwrap_err();

        assert!(error.contains("thay đổi khi backup"));
        assert_eq!(fs::read(&output).unwrap(), b"existing-backup");
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn encrypted_backup_source_growth_preserves_existing_output_and_cleans_partial() {
        let dir = test_root("encrypted-source-growth");
        let sessions = dir.join("pane-sessions");
        let source = sessions.join("profile").join("Cookies");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, b"123").unwrap();
        let output = dir.join("backup.acmbak");
        fs::write(&output, b"existing-backup").unwrap();
        let config = valid_encrypted_config("profile");
        let passphrase = SensitivePassphrase::new("test passphrase".to_string()).unwrap();

        let error = backup_sessions_encrypted_to_with(&sessions, &output, |file| {
            write_encrypted_tar_with_limits_and_hook(
                file,
                &sessions,
                &config,
                passphrase.secret(),
                ENCRYPTED_BACKUP_LIMITS,
                |path, declared| {
                    assert_eq!(declared, 3);
                    fs::write(path, b"12345").map_err(|error| error.to_string())
                },
            )
        })
        .unwrap_err();

        assert!(error.contains("thay đổi khi backup"));
        assert_eq!(fs::read(&output).unwrap(), b"existing-backup");
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn config_sidecar_path_replaces_zip_extension() {
        assert_eq!(
            config_sidecar_path(Path::new("C:/tmp/backup.zip")),
            PathBuf::from("C:/tmp/backup.json"),
        );
        assert_eq!(
            config_sidecar_path(Path::new("C:/tmp/backup.ZIP")),
            PathBuf::from("C:/tmp/backup.json"),
        );
    }

    #[test]
    fn backup_rejects_empty_sessions() {
        let dir = test_root("backup-empty");
        let sessions = dir.join("pane-sessions");
        let output = dir.join("out").join("sessions.zip");
        fs::create_dir_all(&sessions).unwrap();

        let error = backup_sessions_zip_to(&sessions, &output).unwrap_err();

        assert!(error.contains("Không có file session"));
        assert!(!output.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_creates_parent_and_writes_relative_paths() {
        let dir = test_root("backup-relative");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("nested").join("sessions.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();

        backup_sessions_zip_to(&sessions, &output).unwrap();

        let file = File::open(&output).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut entry = archive.by_name("prof-default/Cookies").unwrap();
        let mut contents = Vec::new();
        entry.read_to_end(&mut contents).unwrap();
        assert_eq!(contents, b"cookie-data");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn schedule_backup_writes_pending_request_without_live_zip() {
        let dir = test_root("backup-schedule");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("scheduled").join("sessions.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();

        schedule_sessions_backup(&sessions, &output, "{\"workspaces\":[]}".to_string()).unwrap();

        let request_path = pending_backup_request_path(&sessions);
        let request_json = fs::read_to_string(request_path).unwrap();
        let request: PendingBackupRequest = serde_json::from_str(&request_json).unwrap();
        assert_eq!(PathBuf::from(request.output_path), output);
        assert_eq!(request.config_json, "{\"workspaces\":[]}");
        assert!(!output.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn schedule_backup_refuses_to_overwrite_pending_request() {
        let dir = test_root("backup-pending-conflict");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let first = dir.join("first.zip");
        let second = dir.join("second.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();
        schedule_sessions_backup(&sessions, &first, "{\"first\":true}".to_string()).unwrap();
        let request_path = pending_backup_request_path(&sessions);
        let original = fs::read(&request_path).unwrap();

        let error = schedule_sessions_backup(&sessions, &second, "{\"second\":true}".to_string())
            .unwrap_err();

        assert!(error.contains("đang chờ restart"));
        assert_eq!(fs::read(request_path).unwrap(), original);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn create_only_atomic_write_has_one_complete_winner() {
        let dir = test_root("atomic-create-only");
        fs::create_dir_all(&dir).unwrap();
        let target = Arc::new(dir.join("pending.json"));
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let handles = (0..8)
            .map(|index| {
                let target = target.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let payload = format!("payload-{index}");
                    barrier.wait();
                    (
                        payload.clone(),
                        write_file_atomic_create_only(&target, payload.as_bytes()),
                    )
                })
            })
            .collect::<Vec<_>>();
        let results = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>();

        assert_eq!(
            results.iter().filter(|(_, result)| result.is_ok()).count(),
            1
        );
        let stored = fs::read_to_string(target.as_ref()).unwrap();
        assert!(results
            .iter()
            .any(|(payload, result)| result.is_ok() && payload == &stored));
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_pending_backup_request_is_removed_after_read_failure() {
        let dir = test_root("backup-invalid-pending");
        let sessions = dir.join("pane-sessions");
        let request_path = pending_backup_request_path(&sessions);
        fs::create_dir_all(&dir).unwrap();
        fs::write(&request_path, b"not-json").unwrap();

        let error = process_pending_sessions_backup(&sessions).unwrap_err();

        assert!(error.contains("expected ident") || error.contains("expected value"));
        assert!(!request_path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_results_are_atomic_and_bounded_to_recent_entries() {
        let dir = test_root("startup-results-bounded");
        let sessions = dir.join("pane-sessions");
        for index in 0..(MAX_STARTUP_RESULTS + 2) {
            append_startup_result(&sessions, startup_result(&format!("result-{index}"))).unwrap();
        }

        let raw =
            read_text_file_bounded(&startup_result_path(&sessions), MAX_STARTUP_RESULTS_BYTES)
                .unwrap();
        let results: Vec<StartupOperationResult> = serde_json::from_str(&raw).unwrap();

        assert_eq!(results.len(), MAX_STARTUP_RESULTS);
        assert_eq!(results.first().unwrap().message, "result-2");
        assert_eq!(
            results.last().unwrap().message,
            format!("result-{}", MAX_STARTUP_RESULTS + 1)
        );
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_result_ack_only_consumes_restore_config_for_restore_results() {
        let dir = test_root("startup-results-ack");
        let sessions = dir.join("pane-sessions");
        let config_path = pending_restore_config_path(&sessions);
        write_file_atomic(&config_path, b"{}").unwrap();
        append_startup_result(&sessions, startup_result("backup")).unwrap();

        acknowledge_session_startup_results_for_root(&sessions).unwrap();

        assert!(!startup_result_path(&sessions).exists());
        assert!(config_path.exists());

        let mut restore_result = startup_result("restore");
        restore_result.operation = "restore".to_string();
        append_startup_result(&sessions, restore_result).unwrap();
        acknowledge_session_startup_results_for_root(&sessions).unwrap();

        assert!(!startup_result_path(&sessions).exists());
        assert!(!config_path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn pending_json_limits_allow_escaped_maximum_app_state() {
        let config_json = "\\\"".repeat((MAX_BACKUP_METADATA_BYTES as usize) / 2);
        assert_eq!(config_json.len() as u64, MAX_BACKUP_METADATA_BYTES);
        let request = PendingBackupRequest {
            output_path: "C:\\backup.zip".to_string(),
            config_json: config_json.clone(),
        };
        let pending_restore = PendingRestoreConfig {
            config_json: Some(config_json.clone()),
            config_path: None,
            config_source: Some("embedded".to_string()),
            config_error: None,
            warnings: Vec::new(),
        };
        let startup = startup_result(&config_json);

        assert!(
            serde_json::to_vec(&request).unwrap().len() as u64 <= MAX_PENDING_BACKUP_REQUEST_BYTES
        );
        assert!(
            serde_json::to_vec(&pending_restore).unwrap().len() as u64
                <= MAX_PENDING_RESTORE_CONFIG_BYTES
        );
        assert!(
            serde_json::to_vec(&vec![startup]).unwrap().len() as u64 <= MAX_STARTUP_RESULTS_BYTES
        );
    }

    #[test]
    fn stale_restore_staging_cleanup_preserves_similarly_named_directory() {
        let dir = test_root("restore-staging-cleanup");
        let sessions = dir.join("pane-sessions");
        let legacy = dir.join(".pane-sessions.staging-restore");
        let numbered = dir.join(".pane-sessions.staging-restore-7");
        let unrelated = dir.join(".pane-sessions.staging-restore-user-data");
        for path in [&legacy, &numbered, &unrelated] {
            fs::create_dir_all(path).unwrap();
            fs::write(path.join("marker"), b"data").unwrap();
        }

        cleanup_restore_staging_paths_older_than(
            &sessions,
            Duration::ZERO,
            std::time::SystemTime::now(),
        )
        .unwrap();

        assert!(!legacy.exists());
        assert!(!numbered.exists());
        assert!(unrelated.join("marker").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_process_pending_backup_creates_zip_and_config() {
        let dir = test_root("backup-process");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("scheduled").join("sessions.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();
        schedule_sessions_backup(&sessions, &output, "{\"workspaces\":[1]}".to_string()).unwrap();

        process_pending_sessions_backup(&sessions).unwrap();

        assert!(!pending_backup_request_path(&sessions).exists());
        assert_eq!(
            fs::read_to_string(config_sidecar_path(&output)).unwrap(),
            "{\"workspaces\":[1]}"
        );
        let file = File::open(&output).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let manifest: BackupManifest =
            serde_json::from_reader(archive.by_name(BACKUP_MANIFEST_ENTRY).unwrap()).unwrap();
        assert_eq!(manifest.format_version, BACKUP_FORMAT_VERSION);
        assert_eq!(manifest.app_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(manifest.profile_ids, vec!["prof-default"]);
        let mut metadata = archive.by_name(BACKUP_APP_STATE_ENTRY).unwrap();
        let mut metadata_contents = String::new();
        metadata.read_to_string(&mut metadata_contents).unwrap();
        assert_eq!(metadata_contents, "{\"workspaces\":[1]}");
        drop(metadata);
        let mut entry = archive.by_name("prof-default/Cookies").unwrap();
        let mut contents = Vec::new();
        entry.read_to_end(&mut contents).unwrap();
        assert_eq!(contents, b"cookie-data");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_keeps_valid_self_contained_zip_when_sidecar_write_fails() {
        let dir = test_root("backup-sidecar-failure");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("sessions.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();

        let (config_path, warnings) = create_backup_artifacts_with_sidecar(
            &sessions,
            &output,
            "{\"workspaces\":[1]}",
            |_output, _config| Err("simulated sidecar failure".to_string()),
        )
        .unwrap();

        assert!(output.exists());
        assert!(config_path.is_none());
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("simulated sidecar failure"));
        let mut archive = ZipArchive::new(File::open(&output).unwrap()).unwrap();
        let mut embedded = String::new();
        archive
            .by_name(BACKUP_APP_STATE_ENTRY)
            .unwrap()
            .read_to_string(&mut embedded)
            .unwrap();
        assert_eq!(embedded, "{\"workspaces\":[1]}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_rejects_zip_without_valid_session_files() {
        let dir = test_root("restore-empty");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("empty.zip");
        create_zip(&input, &[]);

        let error = stage_sessions_restore_from_zip(&sessions, &input).unwrap_err();

        assert!(error.contains("không chứa session hợp lệ"));
        assert!(!sessions.exists());
        assert!(!pending_restore_path(&sessions).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_rejects_files_outside_a_profile_directory() {
        let dir = test_root("restore-root-file");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("not-a-session-backup.zip");
        create_zip(&input, &[("root-file.txt", b"not a browser session")]);

        let error = stage_sessions_restore_from_zip(&sessions, &input).unwrap_err();

        assert!(error.contains("thư mục profile"));
        assert!(!sessions.exists());
        assert!(!pending_restore_path(&sessions).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_rejects_unsafe_profile_directory_ids() {
        let dir = test_root("restore-unsafe-profile-id");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("unsafe-profile.zip");
        create_zip(&input, &[("profile@work/Cookies", b"cookie-data")]);

        let error = stage_sessions_restore_from_zip(&sessions, &input).unwrap_err();

        assert!(error.contains("Profile session ID không hợp lệ"));
        assert!(!sessions.exists());
        assert!(!pending_restore_path(&sessions).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_uses_embedded_config_and_skips_metadata_entries() {
        let dir = test_root("restore-embedded-config");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("backup.zip");
        let config = br#"{"workspaces":[{"id":"ws","panes":[{"profileId":"new-profile"}]}],"activeWorkspaceId":"ws","profiles":[{"id":"new-profile","name":"New"}]}"#;
        create_zip(
            &input,
            &[
                (BACKUP_APP_STATE_ENTRY, config),
                ("new-profile/Cookies", b"new"),
            ],
        );

        stage_sessions_restore_from_zip(&sessions, &input).unwrap();

        assert_eq!(
            fs::read(
                pending_restore_path(&sessions)
                    .join("new-profile")
                    .join("Cookies")
            )
            .unwrap(),
            b"new",
        );
        assert!(!pending_restore_path(&sessions)
            .join(BACKUP_METADATA_DIR)
            .exists());
        let pending_config = read_pending_restore_config(&sessions);
        assert_eq!(pending_config.config_source.as_deref(), Some("embedded"));
        assert_eq!(
            pending_config.config_json.as_deref(),
            Some(std::str::from_utf8(config).unwrap())
        );
        assert!(pending_config.warnings.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_rejects_unknown_or_malformed_backup_manifest() {
        let dir = test_root("restore-manifest-validation");
        let sessions = dir.join("pane-sessions");
        let future = dir.join("future.zip");
        let malformed = dir.join("malformed.zip");
        let future_manifest = br#"{"formatVersion":999,"appVersion":"999.0.0","createdAtUnixSeconds":0,"profileIds":[]}"#;
        create_zip(
            &future,
            &[
                (BACKUP_MANIFEST_ENTRY, future_manifest),
                ("profile/Cookies", b"future"),
            ],
        );
        create_zip(
            &malformed,
            &[
                (BACKUP_MANIFEST_ENTRY, b"not-json"),
                ("profile/Cookies", b"malformed"),
            ],
        );

        let future_error = stage_sessions_restore_from_zip(&sessions, &future).unwrap_err();
        assert!(future_error.contains("version 999"));
        let malformed_error = stage_sessions_restore_from_zip(&sessions, &malformed).unwrap_err();
        assert!(malformed_error.contains("Manifest backup không hợp lệ"));
        assert!(!sessions.exists());
        assert!(!pending_restore_path(&sessions).exists());
        assert!(!dir.join(".pane-sessions.staging-restore").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_falls_back_to_sidecar_config_for_old_zip() {
        let dir = test_root("restore-sidecar-config");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("backup.zip");
        let sidecar = config_sidecar_path(&input);
        let config = r#"{"workspaces":[{"id":"ws","panes":[{"profileId":"new-profile"}]}],"activeWorkspaceId":"ws","profiles":[{"id":"new-profile","name":"New"}]}"#;
        create_zip(&input, &[("new-profile/Cookies", b"new")]);
        fs::write(&sidecar, config).unwrap();

        stage_sessions_restore_from_zip(&sessions, &input).unwrap();

        let pending_config = read_pending_restore_config(&sessions);
        assert_eq!(pending_config.config_source.as_deref(), Some("sidecar"));
        assert_eq!(
            pending_config.config_path.as_deref(),
            Some(sidecar.to_string_lossy().as_ref())
        );
        assert_eq!(pending_config.config_json.as_deref(), Some(config));
        assert!(pending_config.warnings.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_does_not_touch_live_sessions_until_startup_apply() {
        let dir = test_root("restore-stage");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("old-profile")).unwrap();
        fs::write(sessions.join("old-profile").join("Cookies"), b"old").unwrap();
        let input = dir.join("backup.zip");
        create_zip(&input, &[("new-profile/Cookies", b"new")]);

        stage_sessions_restore_from_zip(&sessions, &input).unwrap();

        assert_eq!(
            fs::read(sessions.join("old-profile").join("Cookies")).unwrap(),
            b"old"
        );
        assert_eq!(
            fs::read(
                pending_restore_path(&sessions)
                    .join("new-profile")
                    .join("Cookies")
            )
            .unwrap(),
            b"new",
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stage_restore_refuses_to_replace_an_existing_pending_restore() {
        let dir = test_root("restore-pending-conflict");
        let sessions = dir.join("pane-sessions");
        let first = dir.join("first.zip");
        let second = dir.join("second.zip");
        create_zip(&first, &[("first-profile/Cookies", b"first")]);
        create_zip(&second, &[("second-profile/Cookies", b"second")]);

        stage_sessions_restore_from_zip(&sessions, &first).unwrap();
        let pending_config = pending_restore_config_path(&sessions);
        let first_config = fs::read(&pending_config).unwrap();

        let error = stage_sessions_restore_from_zip(&sessions, &second).unwrap_err();

        assert!(error.contains("đang chờ restart"));
        assert_eq!(
            fs::read(
                pending_restore_path(&sessions)
                    .join("first-profile")
                    .join("Cookies")
            )
            .unwrap(),
            b"first"
        );
        assert!(!pending_restore_path(&sessions)
            .join("second-profile")
            .exists());
        assert_eq!(fs::read(pending_config).unwrap(), first_config);
        assert!(!dir.join(".pane-sessions.staging-restore").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_apply_replaces_existing_sessions_cleanly() {
        let dir = test_root("restore-apply");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("old-profile")).unwrap();
        fs::write(sessions.join("old-profile").join("Cookies"), b"old").unwrap();
        let pending = pending_restore_path(&sessions);
        fs::create_dir_all(pending.join("new-profile")).unwrap();
        fs::write(pending.join("new-profile").join("Cookies"), b"new").unwrap();

        assert!(apply_staged_sessions_restore(&sessions).unwrap().is_empty());

        assert!(!sessions.join("old-profile").exists());
        assert_eq!(
            fs::read(sessions.join("new-profile").join("Cookies")).unwrap(),
            b"new"
        );
        assert!(!pending.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn interrupted_startup_keeps_restore_config_replayable_after_session_swap() {
        let dir = test_root("restore-interrupted-startup");
        let sessions = dir.join("pane-sessions");
        let pending = pending_restore_path(&sessions);
        let config_path = pending_restore_config_path(&sessions);
        fs::create_dir_all(sessions.join("old-profile")).unwrap();
        fs::write(sessions.join("old-profile").join("Cookies"), b"old").unwrap();
        fs::create_dir_all(pending.join("new-profile")).unwrap();
        fs::write(pending.join("new-profile").join("Cookies"), b"new").unwrap();
        let config = PendingRestoreConfig {
            config_json: Some("{\"workspaces\":[1]}".to_string()),
            config_path: None,
            config_source: Some("embedded".to_string()),
            config_error: None,
            warnings: Vec::new(),
        };
        write_file_atomic(&config_path, &serde_json::to_vec(&config).unwrap()).unwrap();

        apply_staged_sessions_restore(&sessions).unwrap();

        assert!(!pending.exists());
        assert!(config_path.exists());
        assert_eq!(
            read_pending_restore_config(&sessions)
                .config_json
                .as_deref(),
            Some("{\"workspaces\":[1]}")
        );
        assert_eq!(
            read_pending_restore_config(&sessions)
                .config_json
                .as_deref(),
            Some("{\"workspaces\":[1]}")
        );
        assert!(config_path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_skips_unsafe_entries_and_requires_a_safe_file() {
        let dir = test_root("restore-unsafe");
        let sessions = dir.join("pane-sessions");
        let input = dir.join("unsafe.zip");
        create_zip(&input, &[("../outside", b"bad")]);

        let file = File::open(&input).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let temp = dir.join("temp");
        fs::create_dir_all(&temp).unwrap();

        let cancel = AtomicBool::new(false);
        let error = restore_archive_into_temp(&mut archive, &temp, &cancel).unwrap_err();

        assert!(error.contains("đường dẫn không an toàn"));
        assert!(!dir.join("outside").exists());
        assert!(!sessions.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_archive_into_temp_accepts_safe_entries() {
        let dir = test_root("restore-safe");
        let input = dir.join("safe.zip");
        create_zip(&input, &[("profile/Local Storage/file", b"value")]);
        let file = File::open(&input).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let temp = dir.join("temp");
        fs::create_dir_all(&temp).unwrap();

        let cancel = AtomicBool::new(false);
        let count = restore_archive_into_temp(&mut archive, &temp, &cancel).unwrap();

        assert_eq!(count, 1);
        assert_eq!(
            fs::read(temp.join("profile").join("Local Storage").join("file")).unwrap(),
            b"value"
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_empty_in_memory_zip_is_rejected() {
        let cursor = Cursor::new(Vec::<u8>::new());
        assert!(ZipArchive::new(cursor).is_err());
    }

    #[test]
    fn restore_rejects_entry_count_before_extracting() {
        let mut archive = archive_from_entries(
            &[("profile/one", b"1"), ("profile/two", b"2")],
            zip::CompressionMethod::Stored,
        );
        let error =
            validate_restore_archive_with_limits(&mut archive, test_limits(1, 100, 100, 200))
                .unwrap_err();
        assert!(error.contains("quá nhiều entry"));
    }

    #[test]
    fn restore_rejects_single_file_and_total_size_limits() {
        let entries = [("profile/one", b"12345".as_slice())];
        let mut archive = archive_from_entries(&entries, zip::CompressionMethod::Stored);
        let error =
            validate_restore_archive_with_limits(&mut archive, test_limits(10, 100, 4, 200))
                .unwrap_err();
        assert!(error.contains("Một file"));

        let mut archive = archive_from_entries(
            &[("profile/one", b"123"), ("profile/two", b"456")],
            zip::CompressionMethod::Stored,
        );
        let error =
            validate_restore_archive_with_limits(&mut archive, test_limits(10, 5, 100, 200))
                .unwrap_err();
        assert!(error.contains("Tổng dữ liệu"));
    }

    #[test]
    fn restore_rejects_excessive_compression_ratio() {
        let payload = vec![b'A'; 32 * 1024];
        let mut archive = archive_from_entries(
            &[("profile/compressed", payload.as_slice())],
            zip::CompressionMethod::Deflated,
        );
        let error = validate_restore_archive_with_limits(
            &mut archive,
            test_limits(10, 100_000, 100_000, 2),
        )
        .unwrap_err();
        assert!(error.contains("compression ratio"));
    }

    #[test]
    fn cancelled_restore_cleans_staging_and_preserves_live_sessions() {
        let dir = test_root("restore-cancelled");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("old-profile")).unwrap();
        fs::write(sessions.join("old-profile").join("Cookies"), b"old").unwrap();
        let input = dir.join("backup.zip");
        create_zip(&input, &[("new-profile/Cookies", b"new")]);
        let cancel = AtomicBool::new(true);

        let error =
            stage_sessions_restore_from_zip_with_cancel(&sessions, &input, &cancel).unwrap_err();

        assert!(error.contains("bị hủy"));
        assert_eq!(
            fs::read(sessions.join("old-profile").join("Cookies")).unwrap(),
            b"old"
        );
        assert!(!pending_restore_path(&sessions).exists());
        assert!(!dir.join(".pane-sessions.staging-restore").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_failure_does_not_replace_existing_output_or_leave_partial_file() {
        let dir = test_root("backup-atomic-failure");
        let sessions = dir.join("pane-sessions");
        let output = dir.join("sessions.zip");
        fs::create_dir_all(&sessions).unwrap();
        fs::write(&output, b"existing").unwrap();

        let error = backup_sessions_zip_to_strict(&sessions, &output, "{}").unwrap_err();

        assert!(error.contains("Không có file session"));
        assert_eq!(fs::read(&output).unwrap(), b"existing");
        let partial_count = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
            .count();
        assert_eq!(partial_count, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_rejects_output_inside_live_session_tree() {
        let dir = test_root("backup-inside-session-root");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = profile.join("self-backup.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie-data").unwrap();

        let error =
            backup_sessions_zip_to_strict(&sessions, &output, "{\"workspaces\":[]}").unwrap_err();

        assert!(error.contains("bên trong thư mục session"));
        assert!(!output.exists());
        assert_eq!(
            fs::read_dir(&profile)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("partial"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn backup_overwrite_preserves_unrelated_previous_backup_file() {
        let dir = test_root("backup-unrelated-previous");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("sessions.zip");
        let unrelated = output.with_extension("previous-backup");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"new").unwrap();
        fs::write(&output, b"old").unwrap();
        fs::write(&unrelated, b"unrelated").unwrap();

        backup_sessions_zip_to_strict(&sessions, &output, "{\"workspaces\":[1]}").unwrap();

        assert_eq!(fs::read(&unrelated).unwrap(), b"unrelated");
        let mut archive = ZipArchive::new(File::open(&output).unwrap()).unwrap();
        let mut restored = Vec::new();
        archive
            .by_name("prof-default/Cookies")
            .unwrap()
            .read_to_end(&mut restored)
            .unwrap();
        assert_eq!(restored, b"new");
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".sessions.zip.previous-")
                })
                .count(),
            0
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn app_generated_backup_is_accepted_by_its_restore_limits() {
        let dir = test_root("backup-roundtrip-limits");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("sessions.zip");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("HighlyCompressible"), vec![b'A'; 64 * 1024]).unwrap();

        backup_sessions_zip_to_strict(&sessions, &output, "{\"workspaces\":[]}").unwrap();
        let mut archive = ZipArchive::new(File::open(&output).unwrap()).unwrap();

        validate_restore_archive_with_limits(&mut archive, RESTORE_LIMITS).unwrap();
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn backup_skips_symbolic_links_outside_the_session_root() {
        use std::os::unix::fs::symlink;

        let dir = test_root("backup-symlink");
        let sessions = dir.join("pane-sessions");
        let profile = sessions.join("prof-default");
        let output = dir.join("sessions.zip");
        let outside = dir.join("outside-secret");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("Cookies"), b"cookie").unwrap();
        fs::write(&outside, b"outside").unwrap();
        symlink(&outside, profile.join("linked-secret")).unwrap();

        backup_sessions_zip_to_strict(&sessions, &output, "{\"workspaces\":[1]}").unwrap();

        let mut archive = ZipArchive::new(File::open(&output).unwrap()).unwrap();
        assert!(archive.by_name("prof-default/linked-secret").is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
