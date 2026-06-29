import type { Dictionary } from "./vi";

export const en: Dictionary = {
  // Shared / generic
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.ok": "OK",
  "common.delete": "Delete",

  // Settings modal
  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.mode": "Mode",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.language": "Language",
  "settings.langVietnamese": "Tiếng Việt",
  "settings.langEnglish": "English",
  "settings.langChinese": "中文",
  "settings.updates": "Updates",
  "settings.currentVersion": "Current version",
  "settings.backupRestore": "Backup & restore",

  // Updates
  "update.check": "Check for updates",
  "update.checking": "Checking…",
  "update.current": "No new updates, or you are on the latest version.",
  "update.availablePrefix": "New version available: ",
  "update.openDownload": "Open download page",
  "update.downloadInstall": "Download & install",
  "update.downloading": "Downloading…",
  "update.installing": "Installing…",
  "update.restarting": "Restarting…",
  "update.parseError": "Could not read the latest version.",

  // Backup & restore
  "backup.configWord": "Config",
  "backup.helpMiddle": " saves workspaces, panes, tabs, and profiles. ",
  "backup.fullBackupWord": "Full backup",
  "backup.helpEnd":
    " saves session profiles (Note: only applies on the original device).",
  "backup.exportConfig": "Export config (.json)",
  "backup.importConfig": "Import config",
  "backup.fullBackup": "Full backup (.zip)",
  "backup.restoreBackup": "Restore from backup",
  "backup.desktopOnly": "Only available in the desktop app",
  "backup.saveConfigTitle": "Save config",
  "backup.fsUnavailable": "File system plugin unavailable",
  "backup.chooseConfigTitle": "Choose config file",
  "backup.exportError": "Export failed: {msg}",
  "backup.importError": "Import failed: {msg}",
  "backup.invalidConfig": "File is not a valid config",
  "backup.replaceConfigTitle": "Replace current config?",
  "backup.replaceConfigMsg":
    "All current workspaces and profiles will be replaced with the contents of the file.",
  "backup.replace": "Replace",
  "backup.fullDesktopOnly":
    "Full backup is only available in the desktop app.",
  "backup.saveFullTitle": "Save full backup",
  "backup.backupScheduledTitle": "Restart required for a complete backup",
  "backup.backupScheduledMsg":
    "The app will restart to create a full backup before WebView2 locks session files:\n• {zip}\n• {config}\n\nOn another computer or Windows user, some accounts may need sign-in again.",
  "backup.startupBackupSuccess":
    "Backup complete:\n• {zip}\n• {config}\n\nUse the ZIP to restore; keep the JSON for compatibility. Do not share these files.",
  "backup.startupBackupError": "Backup failed after restart: {msg}",
  "backup.startupRestoreSuccess":
    "Restore complete. App state and profile session files were applied. Some accounts may need sign-in again on another computer or Windows user.",
  "backup.startupRestorePartial":
    "Profile session files were restored, but the workspace/profile mapping was not restored. Some tabs may use the current layout/profile.",
  "backup.startupRestoreConfigError":
    "Profile session files were restored, but the backup app state could not be applied: {msg}",
  "backup.startupRestoreError": "Restore failed after restart: {msg}",
  "backup.backupComplete":
    "Backup complete:\n• {zip}\n• {config}\n\nUse the ZIP to restore; keep the JSON for compatibility. Do not share these files.",
  "backup.backupError": "Backup failed: {msg}",
  "backup.restoreDesktopOnly": "Full restore is only available in the desktop app.",
  "backup.chooseRestoreTitle": "Choose backup .zip file (sessions)",
  "backup.restoreTitle": "Restore full backup?",
  "backup.restoreMsg":
    "Current profile session files may be replaced. On another computer or Windows user, some accounts may need sign-in again. The app needs to restart to fully apply.",
  "backup.restore": "Restore",
  "backup.restoreDone":
    "Restore staged. Close and reopen the app to apply it.",
  "backup.restoreSuccessTitle": "Restore successful",
  "backup.restoreSuccessMsg":
    "Profile session files are staged. Restart the app now to apply the full restore?",
  "backup.restartNow": "Restart now",
  "backup.restartManual": "Could not restart automatically. Please close and reopen the app manually.",
  "backup.restoreError": "Restore failed: {msg}",

  // Pane
  "pane.tabsOf": "Tabs of {title}",
  "pane.closeTab": "Close {title}",
  "pane.splitControls": "Split chat controls",
  "pane.addTab": "Add tab",
  "pane.minimizePane": "Minimize pane",
  "pane.maximizePane": "Maximize pane",
  "pane.minimize": "Minimize",
  "pane.maximize": "Maximize",
  "pane.closeSplit": "Close split chat",
  "pane.webNav": "Web navigation",
  "pane.back": "Back",
  "pane.forward": "Forward",
  "pane.reload": "Reload",
  "pane.profileTitle": "Profile: {name}",
  "pane.url": "URL",
  "pane.loading": "Loading",
  "pane.ready": "Ready",
  "pane.webPreview": "Web Preview",
  "pane.previewNotice":
    "This site cannot be shown in the preview. In the desktop app (Tauri), the content displays fully.",
  "pane.openInBrowser": "Open in browser",

  // Downloads panel
  "downloads.title": "Downloads",
  "downloads.clearListTitle": "Clear list",
  "downloads.clearAll": "Clear all",
  "downloads.empty": "No files have been downloaded yet.",
  "downloads.downloading": "Downloading…",
  "downloads.completed": "Completed",
  "downloads.error": "Error",
  "downloads.cancelled": "Cancelled",
  "downloads.openFile": "Open file",
  "downloads.openFolder": "Open folder",

  // Download toasts
  "toast.downloading": "Downloading…",
  "toast.success": "Download complete",
  "toast.error": "Download failed",

  // App header
  "header.layoutControls": "Layout controls",
  "header.chooseLayout": "Choose layout",
  "header.layoutColumns": "Use {label} column layout",
  "header.focus": "Focus",
  "header.newPane": "New Pane",
  "header.chooseProfile": "Choose a profile for the new pane",
  "header.renameProfile": "Rename {name}",
  "header.rename": "Rename",
  "header.deleteProfile": "Delete {name}",
  "header.deleteProfileTitle": "Delete profile",
  "header.newProfile": "New profile…",
  "header.newProfileTitle": "New profile",
  "header.newProfilePlaceholder": "e.g. Work, Personal",
  "header.openSettings": "Open settings",
  "header.settings": "Settings",
  "header.brand": "AI Multiplexer",

  // Profile actions (dialogs)
  "profile.renameTitle": "Rename profile",
  "profile.newNamePlaceholder": "New name",
  "profile.inUseTitle": "Profile in use",
  "profile.inUseMessage": "This profile is being used by an open pane. Close the pane before deleting.",
  "profile.deleteTitle": "Delete profile \"{name}\"?",
  "profile.deleteMessage": "All cookies and logins for this profile will be permanently deleted.",

  // Workspace switcher
  "workspace.choose": "Choose workspace",
  "workspace.list": "Workspace list",
  "workspace.newWorkspace": "New workspace",
  "workspace.renameCurrent": "Rename current",
  "workspace.deleteCurrent": "Delete current",
  "workspace.paneCount": "{count} panes",
  "workspace.renameTitle": "Rename workspace",
  "workspace.deleteTitle": "Delete workspace \"{name}\"?",
  "workspace.deleteMessage": "All panes inside will be closed. Profiles and sessions are kept.",
};
