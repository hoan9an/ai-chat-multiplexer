use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use tauri_plugin_dialog::DialogExt;

use crate::session_paths::profile_session_directory;

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
pub(crate) struct NativeTabStatus {
    title: String,
    url: String,
    favicon_url: String,
    is_loading: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeWebviewUpsertRequest {
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

fn is_safe_webview_label(label: &str) -> bool {
    // Chỉ chấp nhận nhãn của các pane webview do frontend tạo ra: `tab-{id}`.
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
pub(crate) async fn native_webview_upsert(
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

                            // WebView2 có thể không phát Finished; theo dõi kích thước
                            // để UI không bị kẹt ở trạng thái đang tải.
                            let watch_app = download_app.clone();
                            let watch_label = download_label.clone();
                            let watch_url = url.to_string();
                            let watch_path = path.clone();
                            std::thread::spawn(move || {
                                let mut last_size: u64 = 0;
                                let mut stable_ticks: u32 = 0;
                                let mut total_ticks: u32 = 0;
                                while total_ticks < 1200 {
                                    std::thread::sleep(Duration::from_millis(500));
                                    total_ticks += 1;
                                    let size = std::fs::metadata(&watch_path)
                                        .map(|m| m.len())
                                        .unwrap_or(0);
                                    if size > 0 && size == last_size {
                                        stable_ticks += 1;
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
pub(crate) async fn native_webview_hide(
    app: tauri::AppHandle,
    label: String,
) -> Result<(), String> {
    validate_webview_label(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn native_webview_close(
    app: tauri::AppHandle,
    label: String,
) -> Result<(), String> {
    validate_webview_label(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn native_webview_navigate(
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
pub(crate) async fn native_webview_load_url(
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
pub(crate) async fn native_webview_tab_status(
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

/// Làm sạch metadata do trang không tin cậy trả về trước khi đưa lên cửa sổ chính.
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

#[cfg(test)]
mod tests {
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
        for invalid in [
            "main",
            "",
            "tab-",
            "other-t1",
            "Tab-t1",
            " tab-t1",
            "tab-t1/../main",
            "tab t1",
        ] {
            assert!(!is_safe_webview_label(invalid));
        }
        assert!(validate_webview_label("main").is_err());
        assert!(validate_webview_label("tab-t1").is_ok());
    }

    #[test]
    fn label_validator_enforces_length_cap() {
        let long = format!("tab-{}", "a".repeat(200));
        assert!(!is_safe_webview_label(&long));
        let ok = format!("tab-{}", "a".repeat(120));
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
