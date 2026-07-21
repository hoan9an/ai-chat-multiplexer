use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticRuntimeInfo {
    os: String,
    arch: String,
    webview_version: Option<String>,
}

#[tauri::command]
pub(crate) async fn diagnostics_runtime_info() -> DiagnosticRuntimeInfo {
    DiagnosticRuntimeInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        webview_version: tauri::webview_version().ok(),
    }
}
