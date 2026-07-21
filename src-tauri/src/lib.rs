mod app_commands;
mod backup_restore;
mod diagnostics;
mod session_paths;
mod webviews;

use app_commands::{quit_app, reveal_path_in_folder};
use backup_restore::{
    acknowledge_session_startup_results, backup_sessions_zip, cancel_restore_sessions,
    process_session_startup, restore_sessions_zip, session_startup_results,
};
use diagnostics::diagnostics_runtime_info;
use session_paths::delete_profile_session;
use webviews::{
    native_webview_close, native_webview_hide, native_webview_load_url, native_webview_navigate,
    native_webview_tab_status, native_webview_upsert,
};

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
            process_session_startup(app.handle()).map_err(std::io::Error::other)?;
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
