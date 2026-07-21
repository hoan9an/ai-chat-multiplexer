use std::path::PathBuf;

use tauri::Manager;

fn is_safe_profile_session_id(profile_id: &str) -> bool {
    !profile_id.is_empty()
        && profile_id.len() <= 120
        && profile_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

pub(crate) fn validate_profile_session_id(profile_id: &str) -> Result<(), String> {
    if is_safe_profile_session_id(profile_id) {
        Ok(())
    } else {
        Err("Profile session ID không hợp lệ".to_string())
    }
}

pub(crate) fn pane_sessions_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("pane-sessions"))
        .map_err(|error| error.to_string())
}

pub(crate) fn profile_session_directory(
    app: &tauri::AppHandle,
    profile_id: &str,
) -> Result<PathBuf, String> {
    validate_profile_session_id(profile_id)?;
    let session_dir = pane_sessions_root(app)?.join(profile_id);

    std::fs::create_dir_all(&session_dir).map_err(|error| error.to_string())?;

    Ok(session_dir)
}

#[tauri::command]
pub(crate) async fn delete_profile_session(
    app: tauri::AppHandle,
    profile_id: String,
) -> Result<(), String> {
    validate_profile_session_id(&profile_id)?;
    let session_dir = pane_sessions_root(&app)?.join(&profile_id);

    if session_dir.exists() {
        std::fs::remove_dir_all(&session_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_session_id_validator_prevents_directory_aliases() {
        assert!(validate_profile_session_id("prof-default").is_ok());
        assert!(validate_profile_session_id("prof_Work-9").is_ok());
        assert!(validate_profile_session_id("").is_err());
        assert!(validate_profile_session_id("profile@work").is_err());
        assert!(validate_profile_session_id("../profile").is_err());
        assert!(validate_profile_session_id(&"a".repeat(121)).is_err());
    }
}
