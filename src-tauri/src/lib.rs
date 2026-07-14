use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::DownloadEvent;
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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingBackupRequest {
    output_path: String,
    config_json: String,
}

const BACKUP_METADATA_DIR: &str = "__ai_chat_multiplexer_backup";
const BACKUP_APP_STATE_ENTRY: &str = "__ai_chat_multiplexer_backup/app-state.json";

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

fn profile_session_directory(app: &tauri::AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pane-sessions");
    let session_dir = base_dir.join(sanitize_path_part(profile_id));

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
    let webview_builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        .data_directory(session_dir)
        .enable_clipboard_access()
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
                eprintln!(
                    "[download] finished label={} url={} path={:?} success={}",
                    download_label, url, path, success,
                );
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
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pane-sessions")
        .join(sanitize_path_part(&profile_id));

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

fn append_startup_result(root: &Path, result: StartupOperationResult) {
    let path = startup_result_path(root);
    let mut results = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<StartupOperationResult>>(&raw).ok())
        .unwrap_or_default();
    results.push(result);
    if let Ok(json) = serde_json::to_string(&results) {
        let _ = std::fs::write(path, json);
    }
}

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    base_dir: &Path,
    src: &Path,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut file_count = 0;

    for entry in WalkDir::new(src) {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let relative = path
            .strip_prefix(base_dir)
            .map_err(|error| error.to_string())?;
        let name = relative.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            if !name.is_empty() {
                zip.add_directory(format!("{}/", name), options)
                    .map_err(|error| error.to_string())?;
            }
            continue;
        }

        if name.is_empty() {
            continue;
        }

        zip.start_file(&name, options)
            .map_err(|error| error.to_string())?;
        let mut file = File::open(path).map_err(|error| error.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|error| error.to_string())?;
        zip.write_all(&buffer).map_err(|error| error.to_string())?;
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
) -> Result<(), String> {
    zip.add_directory(format!("{BACKUP_METADATA_DIR}/"), options)
        .map_err(|error| error.to_string())?;
    zip.start_file(BACKUP_APP_STATE_ENTRY, options)
        .map_err(|error| error.to_string())?;
    zip.write_all(config_json.as_bytes())
        .map_err(|error| error.to_string())
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

    let file = File::create(output_path).map_err(|error| error.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let file_count = add_dir_to_zip(&mut zip, root, root, options)?;
    write_backup_metadata(&mut zip, options, config_json)?;
    zip.finish().map_err(|error| error.to_string())?;

    if file_count == 0 {
        let _ = std::fs::remove_file(output_path);
        return Err("Không có file session nào để backup".to_string());
    }

    Ok(())
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

    let temp_copy = unique_backup_temp_path(root);
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
    std::fs::write(&config_path, config_json).map_err(|error| error.to_string())
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

    let request_path = pending_backup_request_path(root);
    if let Some(parent) = request_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let request = PendingBackupRequest {
        output_path: output_path.to_string_lossy().into_owned(),
        config_json,
    };
    let json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    std::fs::write(request_path, json).map_err(|error| error.to_string())
}

fn process_pending_sessions_backup(root: &Path) -> Result<(), String> {
    let request_path = pending_backup_request_path(root);
    if !request_path.exists() {
        return Ok(());
    }

    let request_json = std::fs::read_to_string(&request_path).map_err(|error| error.to_string())?;
    let request: PendingBackupRequest =
        serde_json::from_str(&request_json).map_err(|error| error.to_string())?;
    let output_path = PathBuf::from(&request.output_path);

    let result = backup_sessions_zip_to_strict(root, &output_path, &request.config_json)
        .and_then(|_| write_backup_config_sidecar(&output_path, &request.config_json));
    let config_path = config_sidecar_path(&output_path);

    match result {
        Ok(()) => {
            let _ = std::fs::remove_file(&request_path);
            append_startup_result(
                root,
                StartupOperationResult {
                    operation: "backup".to_string(),
                    success: true,
                    message: "Backup hoàn tất".to_string(),
                    zip_path: Some(output_path.to_string_lossy().into_owned()),
                    config_path: Some(config_path.to_string_lossy().into_owned()),
                    config_json: None,
                    config_restored: None,
                    warnings: Vec::new(),
                },
            );
            Ok(())
        }
        Err(error) => {
            let error_path = output_path.with_extension("backup-error.txt");
            let _ = std::fs::write(&error_path, &error);
            let _ = std::fs::remove_file(&request_path);
            append_startup_result(
                root,
                StartupOperationResult {
                    operation: "backup".to_string(),
                    success: false,
                    message: error.clone(),
                    zip_path: Some(output_path.to_string_lossy().into_owned()),
                    config_path: Some(config_path.to_string_lossy().into_owned()),
                    config_json: None,
                    config_restored: None,
                    warnings: Vec::new(),
                },
            );
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

fn unique_backup_temp_path(root: &Path) -> PathBuf {
    let parent = root.parent().unwrap_or_else(|| Path::new("."));
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pane-sessions");

    for suffix in 0..1000 {
        let candidate = parent.join(format!(".{name}.previous-{suffix}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!(".{name}.previous-fallback"))
}

fn is_backup_metadata_path(path: &Path) -> bool {
    path.components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .is_some_and(|first| first == BACKUP_METADATA_DIR)
}

fn read_embedded_app_state<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<Option<String>, String> {
    match archive.by_name(BACKUP_APP_STATE_ENTRY) {
        Ok(mut entry) => {
            let mut config_json = String::new();
            entry
                .read_to_string(&mut config_json)
                .map_err(|error| error.to_string())?;
            Ok(Some(config_json))
        }
        Err(zip::result::ZipError::FileNotFound) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn read_sidecar_app_state(input_path: &Path) -> Result<Option<(String, PathBuf)>, String> {
    let config_path = config_sidecar_path(input_path);
    if !config_path.exists() {
        return Ok(None);
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

fn write_pending_restore_config(root: &Path, config: &PendingRestoreConfig) -> Result<(), String> {
    let path = pending_restore_config_path(root);
    let json = serde_json::to_string(config).map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

fn take_pending_restore_config(root: &Path) -> PendingRestoreConfig {
    let path = pending_restore_config_path(root);
    let config = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<PendingRestoreConfig>(&raw).ok())
        .unwrap_or(PendingRestoreConfig {
            config_json: None,
            config_path: None,
            config_source: None,
            config_error: Some("Không tìm thấy app config đã stage".to_string()),
            warnings: vec!["Không thể restore layout/profile mapping".to_string()],
        });
    let _ = std::fs::remove_file(path);
    config
}

fn restore_archive_into_temp<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    temp_root: &Path,
) -> Result<usize, String> {
    let mut restored_files = 0;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let enclosed = match entry.enclosed_name() {
            Some(path) => path.to_path_buf(),
            None => continue,
        };

        if enclosed.as_os_str().is_empty() || is_backup_metadata_path(&enclosed) {
            continue;
        }

        let outpath = temp_root.join(enclosed);

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|error| error.to_string())?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut outfile = File::create(&outpath).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|error| error.to_string())?;
        restored_files += 1;
    }

    if restored_files == 0 {
        return Err("File backup không chứa session hợp lệ".to_string());
    }

    Ok(restored_files)
}

fn stage_sessions_restore_from_zip(root: &Path, input_path: &Path) -> Result<(), String> {
    let parent = root
        .parent()
        .ok_or_else(|| "Đường dẫn session không hợp lệ".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let pending_root = pending_restore_path(root);
    let staging_root = parent.join(format!(
        ".{}.staging-restore",
        root.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("pane-sessions")
    ));

    if staging_root.exists() {
        std::fs::remove_dir_all(&staging_root).map_err(|error| error.to_string())?;
    }
    std::fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;

    let restore_result = (|| {
        let file = File::open(input_path).map_err(|error| error.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
        restore_archive_into_temp(&mut archive, &staging_root)?;
        let restore_config = build_pending_restore_config(&mut archive, input_path, &staging_root);
        Ok::<PendingRestoreConfig, String>(restore_config)
    })();

    let restore_config = match restore_result {
        Ok(config) => config,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&staging_root);
            let _ = std::fs::remove_file(pending_restore_config_path(root));
            return Err(error);
        }
    };

    if pending_root.exists() {
        std::fs::remove_dir_all(&pending_root).map_err(|error| error.to_string())?;
    }
    if let Err(error) = write_pending_restore_config(root, &restore_config) {
        let _ = std::fs::remove_dir_all(&staging_root);
        return Err(error);
    }
    if let Err(error) = std::fs::rename(&staging_root, &pending_root) {
        let _ = std::fs::remove_file(pending_restore_config_path(root));
        return Err(error.to_string());
    }

    Ok(())
}

fn apply_staged_sessions_restore(root: &Path) -> Result<(), String> {
    let pending_root = pending_restore_path(root);
    if !pending_root.exists() {
        return Ok(());
    }

    let previous_root = unique_backup_temp_path(root);
    if previous_root.exists() {
        std::fs::remove_dir_all(&previous_root).map_err(|error| error.to_string())?;
    }

    let had_existing_root = root.exists();
    if had_existing_root {
        std::fs::rename(root, &previous_root).map_err(|error| error.to_string())?;
    }

    if let Err(error) = std::fs::rename(&pending_root, root) {
        if had_existing_root {
            let _ = std::fs::rename(&previous_root, root);
        }
        return Err(error.to_string());
    }

    if had_existing_root {
        let _ = std::fs::remove_dir_all(&previous_root);
    }

    Ok(())
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
    let raw = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(&path);
    serde_json::from_str(&raw).map_err(|error| error.to_string())
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
    stage_sessions_restore_from_zip(&root, &input_path)?;
    Ok(Some(input_path.to_string_lossy().into_owned()))
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
        let pending_config = take_pending_restore_config(&sessions);
        assert_eq!(pending_config.config_source.as_deref(), Some("embedded"));
        assert_eq!(
            pending_config.config_json.as_deref(),
            Some(std::str::from_utf8(config).unwrap())
        );
        assert!(pending_config.warnings.is_empty());
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

        let pending_config = take_pending_restore_config(&sessions);
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
    fn startup_apply_replaces_existing_sessions_cleanly() {
        let dir = test_root("restore-apply");
        let sessions = dir.join("pane-sessions");
        fs::create_dir_all(sessions.join("old-profile")).unwrap();
        fs::write(sessions.join("old-profile").join("Cookies"), b"old").unwrap();
        let pending = pending_restore_path(&sessions);
        fs::create_dir_all(pending.join("new-profile")).unwrap();
        fs::write(pending.join("new-profile").join("Cookies"), b"new").unwrap();

        apply_staged_sessions_restore(&sessions).unwrap();

        assert!(!sessions.join("old-profile").exists());
        assert_eq!(
            fs::read(sessions.join("new-profile").join("Cookies")).unwrap(),
            b"new"
        );
        assert!(!pending.exists());
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

        let error = restore_archive_into_temp(&mut archive, &temp).unwrap_err();

        assert!(error.contains("không chứa session hợp lệ"));
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

        let count = restore_archive_into_temp(&mut archive, &temp).unwrap();

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
            if let Err(error) = process_pending_sessions_backup(&root) {
                eprintln!("[backup] pending startup backup failed: {error}");
            }
            if pending_restore_path(&root).exists() {
                match apply_staged_sessions_restore(&root) {
                    Ok(()) => {
                        let restore_config = take_pending_restore_config(&root);
                        let mut warnings = restore_config.warnings;
                        if let Some(error) = &restore_config.config_error {
                            warnings.push(error.clone());
                        }
                        let config_restored = restore_config.config_json.is_some();
                        append_startup_result(
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
                        )
                    }
                    Err(error) => {
                        eprintln!("[restore] pending startup restore failed: {error}");
                        append_startup_result(
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
                        );
                    }
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
            delete_profile_session,
            backup_sessions_zip,
            restore_sessions_zip,
            session_startup_results,
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
}
