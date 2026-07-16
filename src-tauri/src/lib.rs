use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum DownloadProgress {
    #[serde(rename = "started")]
    Started {
        label: String,
        url: String,
        path: String,
    },
    #[serde(rename = "finished")]
    Finished {
        label: String,
        url: String,
        path: Option<String>,
        success: bool,
    },
    #[serde(rename = "cancelled")]
    Cancelled { label: String, url: String },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeTabStatus {
    title: String,
    url: String,
    favicon_url: String,
    is_loading: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeWebviewUpsertRequest {
    profile_id: String,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeNewWindowRequest {
    kind: String,
    source_label: String,
    url: Option<String>,
    reason: String,
    timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRuntimeInfo {
    os: String,
    arch: String,
    webview_version: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingBackupRequest {
    output_path: String,
    config_json: String,
}

const BACKUP_METADATA_DIR: &str = "__ai_chat_multiplexer_backup";
const BACKUP_APP_STATE_ENTRY: &str = "__ai_chat_multiplexer_backup/app-state.json";
const BACKUP_MANIFEST_ENTRY: &str = "__ai_chat_multiplexer_backup/manifest.json";
const BACKUP_FORMAT_VERSION: u32 = 1;
const MAX_BACKUP_METADATA_BYTES: u64 = 10 * 1024 * 1024;
const MAX_RESTORE_ENTRIES: usize = 10_000;
const MAX_RESTORE_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_RESTORE_FILE_BYTES: u64 = 512 * 1024 * 1024;
// DEFLATE can legitimately exceed 1,000:1 for repetitive browser profile data.
// Absolute file/total limits remain the primary ZIP-bomb controls.
const MAX_RESTORE_COMPRESSION_RATIO: u64 = 1_100;
const RESTORE_COPY_BUFFER_BYTES: usize = 64 * 1024;
const MAX_PENDING_BACKUP_REQUEST_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PENDING_RESTORE_CONFIG_BYTES: u64 = 64 * 1024 * 1024;
const MAX_STARTUP_RESULTS_BYTES: u64 = 64 * 1024 * 1024;
const MAX_STARTUP_RESULTS: usize = 4;
const STALE_RESTORE_STAGING_AGE: Duration = Duration::from_secs(24 * 60 * 60);
static ACTIVE_RESTORE_CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
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
struct StartupOperationResult {
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

fn is_safe_webview_label(label: &str) -> bool {
    // Chỉ chấp nhận nhãn của các pane webview do frontend tạo ra: `tab-{id}`
    // (xem getNativeWebviewLabel trong appCore.ts). Không cho phép "main" hay bất
    // kỳ nhãn nào khác để tránh điều hướng/đóng cửa sổ chính có đặc quyền.
    // Khớp ^tab-[A-Za-z0-9_-]+$ và giới hạn 128 ký tự.
    label.len() <= 128
        && label.len() > "tab-".len()
        && label.starts_with("tab-")
        && label.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn validate_webview_label(label: &str) -> Result<(), String> {
    if is_safe_webview_label(label) {
        Ok(())
    } else {
        Err("Nhãn webview không hợp lệ".to_string())
    }
}

fn validate_webview_url(url: &str) -> Result<url::Url, String> {
    if url == "about:blank" {
        return url::Url::parse(url).map_err(|error| format!("URL không hợp lệ: {error}"));
    }

    let parsed = url::Url::parse(url).map_err(|error| format!("URL không hợp lệ: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("Chỉ cho phép URL http/https cho native webview".to_string()),
    }
}

fn timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn new_window_request(source_label: &str, target: &url::Url) -> NativeNewWindowRequest {
    let (kind, url, reason) = match target.scheme() {
        "http" | "https" => (
            "openTab".to_string(),
            Some(target.to_string()),
            target.scheme().to_string(),
        ),
        "about" if target.as_str() == "about:blank" => {
            ("blocked".to_string(), None, "blankPopup".to_string())
        }
        _ => ("blocked".to_string(), None, "unsupportedScheme".to_string()),
    };

    NativeNewWindowRequest {
        kind,
        source_label: source_label.to_string(),
        url,
        reason,
        timestamp_ms: timestamp_ms(),
    }
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

fn is_safe_profile_session_id(profile_id: &str) -> bool {
    !profile_id.is_empty()
        && profile_id.len() <= 120
        && profile_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn validate_profile_session_id(profile_id: &str) -> Result<(), String> {
    if is_safe_profile_session_id(profile_id) {
        Ok(())
    } else {
        Err("Profile session ID không hợp lệ".to_string())
    }
}

fn profile_session_directory(app: &tauri::AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    validate_profile_session_id(profile_id)?;
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pane-sessions");
    let session_dir = base_dir.join(profile_id);

    std::fs::create_dir_all(&session_dir).map_err(|error| error.to_string())?;

    Ok(session_dir)
}

fn suggested_filename(destination: &Path, url: &str) -> String {
    if let Some(name) = destination.file_name().and_then(|n| n.to_str()) {
        if !name.is_empty() {
            return name.to_string();
        }
    }

    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(segment) = parsed.path_segments().and_then(|mut s| s.next_back()) {
            let decoded = urlencoding_decode(segment);
            let trimmed = decoded.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    "download".to_string()
}

fn urlencoding_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(code) = u8::from_str_radix(hex, 16) {
                out.push(code as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

#[tauri::command]
async fn native_webview_upsert(
    app: tauri::AppHandle,
    request: NativeWebviewUpsertRequest,
) -> Result<(), String> {
    let NativeWebviewUpsertRequest {
        profile_id,
        label,
        url,
        x,
        y,
        width,
        height,
    } = request;

    validate_webview_label(&label)?;
    let parsed_url = validate_webview_url(&url)?;

    if width < 1.0 || height < 1.0 {
        return Ok(());
    }

    if let Some(webview) = app.get_webview(&label) {
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
        webview.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "Không tìm thấy cửa sổ chính".to_string())?;
    let session_dir = profile_session_directory(&app, &profile_id)?;
    let download_app = app.clone();
    let download_label = label.clone();
    let popup_app = app.clone();
    let popup_label = label.clone();
    let webview_builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        .data_directory(session_dir)
        .enable_clipboard_access()
        .on_new_window(move |url, _features| {
            let request = new_window_request(&popup_label, &url);
            let _ = popup_app.emit("native-webview-new-window", request);
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| match event {
            DownloadEvent::Requested { url, destination } => {
                let suggested = suggested_filename(destination, url.as_str());
                let chosen = download_app
                    .dialog()
                    .file()
                    .set_title("Lưu file đã tải")
                    .set_file_name(&suggested)
                    .blocking_save_file();

                match chosen {
                    Some(file_path) => match file_path.into_path() {
                        Ok(path) => {
                            *destination = path.clone();
                            let _ = download_app.emit(
                                "native-webview-download",
                                DownloadProgress::Started {
                                    label: download_label.clone(),
                                    url: url.to_string(),
                                    path: path.to_string_lossy().into_owned(),
                                },
                            );

                            // Workaround: WebView2 on Windows often does NOT fire
                            // DownloadEvent::Finished. Poll the file size; when it
                            // stops growing for a few ticks, assume the download
                            // is complete and emit Finished ourselves.
                            let watch_app = download_app.clone();
                            let watch_label = download_label.clone();
                            let watch_url = url.to_string();
                            let watch_path = path.clone();
                            std::thread::spawn(move || {
                                let mut last_size: u64 = 0;
                                let mut stable_ticks: u32 = 0;
                                let mut total_ticks: u32 = 0;
                                // Poll up to ~10 minutes (600s).
                                while total_ticks < 1200 {
                                    std::thread::sleep(Duration::from_millis(500));
                                    total_ticks += 1;
                                    let size = std::fs::metadata(&watch_path)
                                        .map(|m| m.len())
                                        .unwrap_or(0);
                                    if size > 0 && size == last_size {
                                        stable_ticks += 1;
                                        // 3 ticks * 500ms = 1.5s of no growth.
                                        if stable_ticks >= 3 {
                                            let _ = watch_app.emit(
                                                "native-webview-download",
                                                DownloadProgress::Finished {
                                                    label: watch_label.clone(),
                                                    url: watch_url.clone(),
                                                    path: Some(
                                                        watch_path.to_string_lossy().into_owned(),
                                                    ),
                                                    success: true,
                                                },
                                            );
                                            return;
                                        }
                                    } else {
                                        stable_ticks = 0;
                                        last_size = size;
                                    }
                                }
                                // Timeout — emit a finished/error so the UI doesn't hang.
                                let _ = watch_app.emit(
                                    "native-webview-download",
                                    DownloadProgress::Finished {
                                        label: watch_label.clone(),
                                        url: watch_url.clone(),
                                        path: Some(watch_path.to_string_lossy().into_owned()),
                                        success: false,
                                    },
                                );
                            });

                            true
                        }
                        Err(_) => {
                            let _ = download_app.emit(
                                "native-webview-download",
                                DownloadProgress::Cancelled {
                                    label: download_label.clone(),
                                    url: url.to_string(),
                                },
                            );
                            false
                        }
                    },
                    None => {
                        let _ = download_app.emit(
                            "native-webview-download",
                            DownloadProgress::Cancelled {
                                label: download_label.clone(),
                                url: url.to_string(),
                            },
                        );
                        false
                    }
                }
            }
            DownloadEvent::Finished { url, path, success } => {
                eprintln!("[DOWNLOAD_FINISHED] success={success}");
                let _ = download_app.emit(
                    "native-webview-download",
                    DownloadProgress::Finished {
                        label: download_label.clone(),
                        url: url.to_string(),
                        path: path.as_ref().map(|p| p.to_string_lossy().into_owned()),
                        success,
                    },
                );
                true
            }
            _ => true,
        });

    window
        .add_child(
            webview_builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_profile_session(app: tauri::AppHandle, profile_id: String) -> Result<(), String> {
    validate_profile_session_id(&profile_id)?;
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pane-sessions")
        .join(&profile_id);

    if base_dir.exists() {
        std::fs::remove_dir_all(&base_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn native_webview_hide(app: tauri::AppHandle, label: String) -> Result<(), String> {
    validate_webview_label(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn native_webview_close(app: tauri::AppHandle, label: String) -> Result<(), String> {
    validate_webview_label(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn native_webview_navigate(
    app: tauri::AppHandle,
    label: String,
    action: String,
) -> Result<(), String> {
    validate_webview_label(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Không tìm thấy webview đang mở".to_string())?;

    match action.as_str() {
        "back" => webview.eval("history.back()"),
        "forward" => webview.eval("history.forward()"),
        "reload" => webview.reload(),
        _ => return Err(format!("Hành động điều hướng không hợp lệ: {action}")),
    }
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn native_webview_load_url(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    validate_webview_label(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Không tìm thấy webview đang mở".to_string())?;
    let parsed = validate_webview_url(&url)?;
    webview
        .navigate(parsed)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn native_webview_tab_status(
    app: tauri::AppHandle,
    label: String,
) -> Result<NativeTabStatus, String> {
    validate_webview_label(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Không tìm thấy webview đang mở".to_string())?;
    let current_url = webview.url().map(|url| url.to_string()).unwrap_or_default();
    let (sender, receiver) = mpsc::channel::<String>();

    webview
        .eval_with_callback(
            r#"
            (() => {
              const favicon = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]');
              const faviconHref = favicon ? favicon.href : '';

              return {
                title: document.title || '',
                url: '',
                faviconUrl: faviconHref,
                isLoading: document.readyState !== 'complete'
              };
            })()
            "#,
            move |result| {
                let _ = sender.send(result);
            },
        )
        .map_err(|error| error.to_string())?;

    let raw_status = receiver
        .recv_timeout(Duration::from_millis(700))
        .unwrap_or_else(|_| {
            "{\"title\":\"\",\"url\":\"\",\"faviconUrl\":\"\",\"isLoading\":false}".to_string()
        });
    let json_status: String = serde_json::from_str(&raw_status).unwrap_or(raw_status);
    let mut status =
        serde_json::from_str::<NativeTabStatus>(&json_status).unwrap_or(NativeTabStatus {
            title: String::new(),
            url: String::new(),
            favicon_url: String::new(),
            is_loading: false,
        });

    status.url = current_url;
    sanitize_native_tab_status(&mut status);

    Ok(status)
}

#[tauri::command]
async fn diagnostics_runtime_info() -> DiagnosticRuntimeInfo {
    DiagnosticRuntimeInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        webview_version: tauri::webview_version().ok(),
    }
}

/// Làm sạch tiêu đề/favicon do trang (không tin cậy) trả về trước khi đưa lên
/// cửa sổ chính có đặc quyền: loại ký tự điều khiển khỏi title, giới hạn độ dài,
/// và chỉ giữ favicon là URL http/https.
fn sanitize_native_tab_status(status: &mut NativeTabStatus) {
    const MAX_TITLE_LEN: usize = 512;
    const MAX_FAVICON_LEN: usize = 2048;

    status.title = status
        .title
        .chars()
        .filter(|character| !character.is_control())
        .take(MAX_TITLE_LEN)
        .collect();

    let favicon_ok = status.favicon_url.len() <= MAX_FAVICON_LEN
        && url::Url::parse(&status.favicon_url)
            .map(|parsed| matches!(parsed.scheme(), "http" | "https"))
            .unwrap_or(false);
    if !favicon_ok {
        status.favicon_url = String::new();
    }
}

fn pane_sessions_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pane-sessions"))
}

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
async fn backup_sessions_zip(
    app: tauri::AppHandle,
    config_json: String,
) -> Result<Option<String>, String> {
    // Bảo mật: file backup chứa cookie session sống của mọi tài khoản đang đăng
    // nhập, nên Rust tự mở hộp thoại lưu thay vì nhận đường dẫn tùy ý từ frontend
    // (frontend bị chiếm quyền có thể exfiltrate cookie ra đường dẫn bất kỳ).
    // Dùng blocking_save_file trên luồng riêng để không chặn luồng chính.
    let default_name = format!("ai-multiplexer-backup-{}.zip", today_utc_yyyy_mm_dd());
    let dialog_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Lưu full backup")
            .set_file_name(&default_name)
            .add_filter("ZIP", &["zip"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let output_path = match chosen {
        Some(file_path) => file_path.into_path().map_err(|error| error.to_string())?,
        None => return Ok(None),
    };

    let root = pane_sessions_root(&app)?;
    schedule_sessions_backup(&root, &output_path, config_json)?;
    Ok(Some(output_path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn session_startup_results(
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
async fn acknowledge_session_startup_results(app: tauri::AppHandle) -> Result<(), String> {
    let root = pane_sessions_root(&app)?;
    acknowledge_session_startup_results_for_root(&root)
}

#[tauri::command]
async fn restore_sessions_zip(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Bảo mật: Rust tự mở hộp thoại chọn file thay vì nhận đường dẫn tùy ý từ
    // frontend, tránh việc cấy dữ liệu session từ đường dẫn bất kỳ.
    // blocking_pick_file chạy trên luồng riêng để không chặn luồng chính.
    let dialog_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Chọn file backup .zip (sessions)")
            .add_filter("ZIP", &["zip"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let input_path = match chosen {
        Some(file_path) => file_path.into_path().map_err(|error| error.to_string())?,
        None => return Ok(None),
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
    let worker_result = tauri::async_runtime::spawn_blocking(move || {
        stage_sessions_restore_from_zip_with_cancel(&root, &restore_path, &worker_cancel)
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
async fn cancel_restore_sessions() -> Result<(), String> {
    let active = ACTIVE_RESTORE_CANCEL
        .lock()
        .map_err(|_| "Không thể khóa trạng thái restore".to_string())?;
    if let Some(cancel_requested) = active.as_ref() {
        cancel_requested.store(true, Ordering::SeqCst);
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

#[tauri::command]
async fn reveal_path_in_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let folder = if target.is_file() {
        target.parent().map(|p| p.to_path_buf()).unwrap_or(target)
    } else {
        target
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(folder)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let root = pane_sessions_root(app.handle()).map_err(std::io::Error::other)?;
            if let Err(error) = cleanup_restore_staging_paths(&root) {
                eprintln!("[RESTORE_STAGING_CLEANUP_FAILED] {error}");
            }
            if let Err(error) = process_pending_sessions_backup(&root) {
                eprintln!("[FULL_BACKUP_STARTUP_FAILED] {error}");
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
                        "Khôi phục app state tiếp tục sau lần khởi động trước bị gián đoạn"
                            .to_string(),
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
        })
        .invoke_handler(tauri::generate_handler![
            native_webview_upsert,
            native_webview_hide,
            native_webview_close,
            native_webview_navigate,
            native_webview_load_url,
            native_webview_tab_status,
            diagnostics_runtime_info,
            delete_profile_session,
            backup_sessions_zip,
            restore_sessions_zip,
            cancel_restore_sessions,
            session_startup_results,
            acknowledge_session_startup_results,
            reveal_path_in_folder,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod security_tests {
    use super::*;

    #[test]
    fn label_validator_accepts_pane_labels() {
        assert!(is_safe_webview_label("tab-t1"));
        assert!(is_safe_webview_label("tab-tab-abc-123"));
        assert!(is_safe_webview_label("tab-weird-id--"));
        assert!(is_safe_webview_label("tab-A_b-9"));
    }

    #[test]
    fn label_validator_rejects_main_and_non_tab_labels() {
        // "main" điều hướng/đóng cửa sổ chính -> phải bị từ chối.
        assert!(!is_safe_webview_label("main"));
        assert!(!is_safe_webview_label(""));
        assert!(!is_safe_webview_label("tab-")); // thiếu phần id
        assert!(!is_safe_webview_label("other-t1"));
        assert!(!is_safe_webview_label("Tab-t1")); // sai hoa/thường tiền tố
        assert!(!is_safe_webview_label(" tab-t1"));
        assert!(!is_safe_webview_label("tab-t1/../main"));
        assert!(!is_safe_webview_label("tab t1"));
        assert!(validate_webview_label("main").is_err());
        assert!(validate_webview_label("tab-t1").is_ok());
    }

    #[test]
    fn profile_session_id_validator_prevents_directory_aliases() {
        assert!(validate_profile_session_id("prof-default").is_ok());
        assert!(validate_profile_session_id("prof_Work-9").is_ok());
        assert!(validate_profile_session_id("").is_err());
        assert!(validate_profile_session_id("profile@work").is_err());
        assert!(validate_profile_session_id("../profile").is_err());
        assert!(validate_profile_session_id(&"a".repeat(121)).is_err());
    }

    #[test]
    fn label_validator_enforces_length_cap() {
        let long = format!("tab-{}", "a".repeat(200));
        assert!(long.len() > 128);
        assert!(!is_safe_webview_label(&long));
        let ok = format!("tab-{}", "a".repeat(120));
        assert!(ok.len() <= 128);
        assert!(is_safe_webview_label(&ok));
    }

    #[test]
    fn tab_status_strips_control_chars_and_caps_title() {
        let mut status = NativeTabStatus {
            title: format!("Hi\u{0007}\tthere\n{}", "x".repeat(600)),
            url: String::new(),
            favicon_url: "https://example.com/favicon.ico".to_string(),
            is_loading: false,
        };
        sanitize_native_tab_status(&mut status);
        assert!(!status.title.chars().any(|c| c.is_control()));
        assert!(status.title.starts_with("Hithere"));
        assert!(status.title.chars().count() <= 512);
        assert_eq!(status.favicon_url, "https://example.com/favicon.ico");
    }

    #[test]
    fn tab_status_rejects_non_http_favicon() {
        for bad in [
            "javascript:alert(1)",
            "data:image/png;base64,AAAA",
            "file:///etc/passwd",
            "not a url",
            "",
        ] {
            let mut status = NativeTabStatus {
                title: "t".to_string(),
                url: String::new(),
                favicon_url: bad.to_string(),
                is_loading: false,
            };
            sanitize_native_tab_status(&mut status);
            assert_eq!(status.favicon_url, "", "favicon `{bad}` should be dropped");
        }
    }

    #[test]
    fn tab_status_caps_favicon_length() {
        let mut status = NativeTabStatus {
            title: "t".to_string(),
            url: String::new(),
            favicon_url: format!("https://example.com/{}", "a".repeat(3000)),
            is_loading: false,
        };
        sanitize_native_tab_status(&mut status);
        assert_eq!(status.favicon_url, "");
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
        assert!(parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit())));
    }

    #[test]
    fn new_window_http_request_routes_without_losing_query() {
        let target = url::Url::parse("https://example.com/oauth?state=secret#return").unwrap();
        let request = new_window_request("tab-t1", &target);
        assert_eq!(request.kind, "openTab");
        assert_eq!(request.source_label, "tab-t1");
        assert_eq!(request.reason, "https");
        assert_eq!(request.url.as_deref(), Some(target.as_str()));
    }

    #[test]
    fn new_window_blank_and_custom_schemes_are_blocked_without_url_payload() {
        for (raw, expected_reason) in [
            ("about:blank", "blankPopup"),
            ("mailto:test@example.com", "unsupportedScheme"),
        ] {
            let request = new_window_request("tab-t1", &url::Url::parse(raw).unwrap());
            assert_eq!(request.kind, "blocked");
            assert_eq!(request.reason, expected_reason);
            assert!(request.url.is_none());
        }
    }
}
