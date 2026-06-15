import type { Dictionary } from "./vi";

export const en: Dictionary = {
  // Shared / generic
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.ok": "OK",

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
  "update.current": "You are on the latest version.",
  "update.availablePrefix": "New version available: ",
  "update.openDownload": "Open download page",
  "update.downloadInstall": "Download & install",
  "update.downloading": "Downloading…",
  "update.installing": "Installing…",
  "update.restarting": "Restarting…",
  "update.parseError": "Could not read the latest version.",

  // Backup & restore
  "backup.configWord": "Config",
  "backup.helpMiddle": " contains only workspaces and profiles (no cookies). ",
  "backup.fullBackupWord": "Full backup",
  "backup.helpEnd": " includes login sessions.",
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
    "Full backup (including sessions/cookies) is only available in the desktop app.",
  "backup.saveFullTitle": "Save full backup",
  "backup.backupComplete":
    "Backup complete:\n• {zip}\n• {config}\n\nTo restore, use both files.",
  "backup.backupError": "Backup failed: {msg}",
  "backup.restoreDesktopOnly": "Full restore is only available in the desktop app.",
  "backup.chooseRestoreTitle": "Choose backup .zip file (sessions)",
  "backup.restoreTitle": "Restore session?",
  "backup.restoreMsg":
    "Current cookies will be replaced. The app needs to restart to fully apply.",
  "backup.restore": "Restore",
  "backup.restoreDone": "Restored. Close and reopen the app to fully apply.",
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
  "header.focus": "Focus",
  "header.newPane": "New pane",
  "header.chooseProfile": "Choose a profile for the new pane",
  "header.renameProfile": "Rename {name}",
  "header.rename": "Rename",
  "header.deleteProfile": "Delete {name}",
  "header.deleteProfileTitle": "Delete profile",
  "header.newProfile": "New profile…",
  "header.newProfileTitle": "New profile",
  "header.newProfilePlaceholder": "e.g. Work, Personal",
  "header.openSettings": "Open settings",
  "header.brand": "AI Multiplexer",

  // Workspace switcher
  "workspace.choose": "Choose workspace",
  "workspace.list": "Workspace list",
  "workspace.newWorkspace": "New workspace",
  "workspace.renameCurrent": "Rename current",
  "workspace.deleteCurrent": "Delete current",
};
