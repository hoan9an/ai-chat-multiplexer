import {
  IconCheck,
  IconDownload,
  IconExternal,
  IconMoon,
  IconRefresh,
  IconSettings as _IconSettings,
  IconSun,
  IconUpload,
  IconX,
} from "../Icons";
import { APP_VERSION, GITHUB_REPO, WEBSITE_URL, isTauriRuntime, type ThemeMode } from "../appCore";
import { useTranslation, type Lang } from "../i18n";

void _IconSettings; // re-exported indirectly so the file remains stable on tree-shake

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; latest: string; releaseUrl: string }
  | { kind: "downloading"; latest: string; progress: number }
  | { kind: "installing"; latest: string }
  | { kind: "readyToInstall"; latest: string }
  | { kind: "current" }
  | { kind: "error"; message: string };

export type BackupBusy = "idle" | "exporting" | "importing";

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  updateStatus: UpdateStatus;
  onCheckForUpdates: () => void;
  onDownloadAndInstall: () => void;
  onOpenReleasePage: (url: string) => void;
  backupBusy: BackupBusy;
  onExportConfig: () => void;
  onImportConfig: () => void;
  onExportFullBackup: () => void;
  onRestoreFullBackup: () => void;
};

export function SettingsModal({
  open,
  onClose,
  theme,
  onThemeChange,
  updateStatus,
  onCheckForUpdates,
  onDownloadAndInstall,
  onOpenReleasePage,
  backupBusy,
  onExportConfig,
  onImportConfig,
  onExportFullBackup,
  onRestoreFullBackup,
}: SettingsModalProps) {
  const { t, lang, setLang } = useTranslation();

  if (!open) return null;

  const languages: { value: Lang; label: string }[] = [
    { value: "vi", label: t("settings.langVietnamese") },
    { value: "en", label: t("settings.langEnglish") },
    { value: "zh", label: t("settings.langChinese") },
  ];

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card settings-card">
        <header className="settings-header">
          <h3 className="modal-title">{t("settings.title")}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <IconX size={14} />
          </button>
        </header>

        <section className="settings-section">
          <h4 className="settings-section-title">{t("settings.appearance")}</h4>
          <div className="settings-row">
            <span className="settings-label">{t("settings.mode")}</span>
            <div className="layout-segment settings-theme-segment">
              <button
                type="button"
                className={theme === "light" ? "segment active" : "segment"}
                onClick={() => onThemeChange("light")}
              >
                <IconSun size={12} /> {t("settings.light")}
              </button>
              <button
                type="button"
                className={theme === "dark" ? "segment active" : "segment"}
                onClick={() => onThemeChange("dark")}
              >
                <IconMoon size={12} /> {t("settings.dark")}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">{t("settings.language")}</span>
            <div className="layout-segment settings-language-segment">
              {languages.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={lang === item.value ? "segment active" : "segment"}
                  onClick={() => setLang(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h4 className="settings-section-title">{t("settings.updates")}</h4>
          <div className="settings-row">
            <span className="settings-label">{t("settings.currentVersion")}</span>
            <span className="settings-meta">v{APP_VERSION}</span>
          </div>
          <div className="settings-row settings-update-row">
            {updateStatus.kind === "idle" && (
              <button type="button" className="modal-btn" onClick={onCheckForUpdates}>
                <IconRefresh size={12} /> {t("update.check")}
              </button>
            )}
            {updateStatus.kind === "checking" && (
              <span className="settings-meta">{t("update.checking")}</span>
            )}
            {updateStatus.kind === "current" && (
              <span className="settings-meta success">
                <IconCheck size={12} /> {t("update.current")}
              </span>
            )}
            {updateStatus.kind === "available" && (
              <div className="settings-update-available">
                <span>
                  {t("update.availablePrefix")}
                  <strong>v{updateStatus.latest}</strong>
                </span>
                {isTauriRuntime() ? (
                  <button
                    type="button"
                    className="modal-btn primary"
                    onClick={onDownloadAndInstall}
                  >
                    <IconDownload size={12} /> {t("update.downloadInstall")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="modal-btn primary"
                    onClick={() => onOpenReleasePage(updateStatus.releaseUrl)}
                  >
                    <IconExternal size={12} /> {t("update.openDownload")}
                  </button>
                )}
              </div>
            )}
            {updateStatus.kind === "downloading" && (
              <div className="settings-update-available">
                <span>
                  {t("update.downloading")}
                  <strong> {updateStatus.progress}%</strong>
                </span>
                <progress
                  className="update-progress"
                  max={100}
                  value={updateStatus.progress}
                  aria-label={t("update.downloading")}
                />
              </div>
            )}
            {updateStatus.kind === "installing" && (
              <span className="settings-meta">{t("update.installing")}</span>
            )}
            {updateStatus.kind === "readyToInstall" && (
              <span className="settings-meta">{t("update.restarting")}</span>
            )}
            {updateStatus.kind === "error" && (
              <span className="settings-meta danger">{updateStatus.message}</span>
            )}
          </div>
        </section>

        <section className="settings-section">
          <h4 className="settings-section-title">{t("settings.backupRestore")}</h4>
          <p className="settings-help">
            <strong>{t("backup.configWord")}</strong>
            {t("backup.helpMiddle")}
            <strong>{t("backup.fullBackupWord")}</strong>
            {t("backup.helpEnd")}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="modal-btn"
              onClick={onExportConfig}
              disabled={backupBusy !== "idle"}
            >
              <IconDownload size={12} /> {t("backup.exportConfig")}
            </button>
            <button
              type="button"
              className="modal-btn"
              onClick={onImportConfig}
              disabled={backupBusy !== "idle"}
            >
              <IconUpload size={12} /> {t("backup.importConfig")}
            </button>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="modal-btn"
              onClick={onExportFullBackup}
              disabled={backupBusy !== "idle" || !isTauriRuntime()}
              title={!isTauriRuntime() ? t("backup.desktopOnly") : undefined}
            >
              <IconDownload size={12} /> {t("backup.fullBackup")}
            </button>
            <button
              type="button"
              className="modal-btn"
              onClick={onRestoreFullBackup}
              disabled={backupBusy !== "idle" || !isTauriRuntime()}
              title={!isTauriRuntime() ? t("backup.desktopOnly") : undefined}
            >
              <IconUpload size={12} /> {t("backup.restoreBackup")}
            </button>
          </div>
        </section>

        <footer className="settings-footer">
          <div className="settings-footer-links">
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                onOpenReleasePage(WEBSITE_URL);
              }}
            >
              {t("settings.website")}
            </a>
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                onOpenReleasePage(`https://github.com/${GITHUB_REPO}`);
              }}
            >
              GitHub
            </a>
          </div>
          <span className="settings-meta">v{APP_VERSION}</span>
        </footer>
      </div>
    </div>
  );
}
