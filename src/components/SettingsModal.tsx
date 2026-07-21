import { useEffect, useState } from "react";
import {
  IconCheck,
  IconDownload,
  IconExternal,
  IconMoon,
  IconRefresh,
  IconSun,
  IconUpload,
  IconX,
} from "../Icons";
import {
  APP_VERSION,
  GITHUB_REPO,
  isTauriRuntime,
  type ThemeMode,
} from "../appCore";
import { useTranslation, type Lang } from "../i18n";
import type { UpdateStatus, BackupBusy } from "../types/updates";

export type { UpdateStatus, BackupBusy };

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
  onExportFullBackup: (passphrase: string) => void | Promise<void>;
  onRestoreFullBackup: (passphrase: string) => void | Promise<void>;
  onCancelRestoreFullBackup: () => void | Promise<void>;
  onExportSupportBundle: () => void;
  onOpenSupportIssue: () => void;
  onOpenKnownIssues: () => void;
  onShowOnboarding: () => void;
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
  onCancelRestoreFullBackup,
  onExportSupportBundle,
  onOpenSupportIssue,
  onOpenKnownIssues,
  onShowOnboarding,
}: SettingsModalProps) {
  const { t, lang, setLang } = useTranslation();
  const [backupPasswordMode, setBackupPasswordMode] = useState<
    "export" | "restore" | null
  >(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordConfirmation, setBackupPasswordConfirmation] =
    useState("");
  const [backupPasswordError, setBackupPasswordError] = useState("");
  const [backupPasswordSubmitting, setBackupPasswordSubmitting] =
    useState(false);

  useEffect(() => {
    if (!open) {
      setBackupPasswordMode(null);
      setBackupPassword("");
      setBackupPasswordConfirmation("");
      setBackupPasswordError("");
      setBackupPasswordSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const languages: { value: Lang; label: string }[] = [
    { value: "vi", label: t("settings.langVietnamese") },
    { value: "en", label: t("settings.langEnglish") },
    { value: "zh", label: t("settings.langChinese") },
  ];

  function openBackupPasswordDialog(mode: "export" | "restore") {
    setBackupPassword("");
    setBackupPasswordConfirmation("");
    setBackupPasswordError("");
    setBackupPasswordMode(mode);
  }

  function closeBackupPasswordDialog() {
    if (backupPasswordSubmitting) return;
    setBackupPasswordMode(null);
    setBackupPassword("");
    setBackupPasswordConfirmation("");
    setBackupPasswordError("");
  }

  function cancelBackupPasswordSubmission() {
    setBackupPassword("");
    setBackupPasswordConfirmation("");
    setBackupPasswordError("");
    if (backupPasswordMode === "restore") {
      void onCancelRestoreFullBackup();
    }
  }

  async function submitBackupPassword() {
    if (!backupPasswordMode || backupPasswordSubmitting) return;

    if (backupPasswordMode === "export" && backupPassword.length === 0) {
      setBackupPasswordError(t("backup.passwordRequired"));
      return;
    }
    if (
      backupPasswordMode === "export" &&
      backupPassword !== backupPasswordConfirmation
    ) {
      setBackupPasswordError(t("backup.passwordMismatch"));
      return;
    }

    const passphrase = backupPassword;
    setBackupPasswordError("");
    setBackupPasswordSubmitting(true);
    try {
      if (backupPasswordMode === "export") {
        await onExportFullBackup(passphrase);
      } else {
        await onRestoreFullBackup(passphrase);
      }
    } finally {
      // Passwords are deliberately kept only in this short-lived component
      // state and are cleared after every completed/cancelled operation.
      setBackupPassword("");
      setBackupPasswordConfirmation("");
      setBackupPasswordError("");
      setBackupPasswordSubmitting(false);
      setBackupPasswordMode(null);
    }
  }

  return (
    <>
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
            <h4 className="settings-section-title">
              {t("settings.appearance")}
            </h4>
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
                    className={
                      lang === item.value ? "segment active" : "segment"
                    }
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
              <span className="settings-label">
                {t("settings.currentVersion")}
              </span>
              <span className="settings-meta">v{APP_VERSION}</span>
            </div>
            <div className="settings-row settings-update-row">
              {updateStatus.kind === "idle" && (
                <button
                  type="button"
                  className="modal-btn"
                  onClick={onCheckForUpdates}
                >
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
                <span className="settings-meta danger">
                  {updateStatus.message}
                </span>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h4 className="settings-section-title">
              {t("settings.backupRestore")}
            </h4>
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
            <p className="settings-help">{t("backup.encryptedNotice")}</p>
            <div className="settings-actions">
              <button
                type="button"
                className="modal-btn"
                onClick={() => openBackupPasswordDialog("export")}
                disabled={backupBusy !== "idle" || !isTauriRuntime()}
                title={!isTauriRuntime() ? t("backup.desktopOnly") : undefined}
              >
                <IconDownload size={12} /> {t("backup.fullBackup")}
              </button>
              <button
                type="button"
                className="modal-btn"
                onClick={() => openBackupPasswordDialog("restore")}
                disabled={backupBusy !== "idle" || !isTauriRuntime()}
                title={!isTauriRuntime() ? t("backup.desktopOnly") : undefined}
              >
                <IconUpload size={12} /> {t("backup.restoreBackup")}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h4 className="settings-section-title">{t("diagnostics.title")}</h4>
            <p className="settings-help">{t("diagnostics.help")}</p>
            <div className="settings-actions">
              <button
                type="button"
                className="modal-btn"
                onClick={onExportSupportBundle}
              >
                <IconDownload size={12} /> {t("diagnostics.export")}
              </button>
              <button
                type="button"
                className="modal-btn"
                onClick={onOpenSupportIssue}
              >
                <IconExternal size={12} /> {t("support.reportIssue")}
              </button>
            </div>
            <div className="settings-support-links">
              <button
                type="button"
                className="settings-link-button"
                onClick={onOpenKnownIssues}
              >
                {t("support.knownIssues")}
              </button>
              <button
                type="button"
                className="settings-link-button"
                onClick={onShowOnboarding}
              >
                {t("onboarding.showAgain")}
              </button>
            </div>
          </section>

          <footer className="settings-footer">
            <div className="settings-footer-links">
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
      {backupPasswordMode && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              closeBackupPasswordDialog();
          }}
        >
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBackupPassword();
            }}
          >
            <h3 className="modal-title">
              {backupPasswordMode === "export"
                ? t("backup.passwordExportTitle")
                : t("backup.passwordRestoreTitle")}
            </h3>
            <p className="modal-message">
              {backupPasswordMode === "export"
                ? t("backup.passwordExportHelp")
                : t("backup.passwordRestoreHelp")}
            </p>
            <label className="settings-label" htmlFor="full-backup-password">
              {t("backup.passwordLabel")}
            </label>
            <input
              id="full-backup-password"
              autoFocus
              className="modal-input"
              type="password"
              autoComplete="off"
              value={backupPassword}
              disabled={backupPasswordSubmitting}
              onChange={(event) => {
                setBackupPassword(event.target.value);
                setBackupPasswordError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeBackupPasswordDialog();
                }
              }}
            />
            {backupPasswordMode === "export" && (
              <>
                <label
                  className="settings-label"
                  htmlFor="full-backup-password-confirmation"
                >
                  {t("backup.passwordConfirmLabel")}
                </label>
                <input
                  id="full-backup-password-confirmation"
                  className="modal-input"
                  type="password"
                  autoComplete="off"
                  value={backupPasswordConfirmation}
                  disabled={backupPasswordSubmitting}
                  onChange={(event) => {
                    setBackupPasswordConfirmation(event.target.value);
                    setBackupPasswordError("");
                  }}
                />
              </>
            )}
            {backupPasswordError && (
              <p className="modal-message" role="alert">
                {backupPasswordError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn"
                onClick={
                  backupPasswordSubmitting
                    ? cancelBackupPasswordSubmission
                    : closeBackupPasswordDialog
                }
                disabled={
                  backupPasswordSubmitting && backupPasswordMode !== "restore"
                }
              >
                {backupPasswordSubmitting && backupPasswordMode === "restore"
                  ? t("backup.cancelRestore")
                  : t("common.cancel")}
              </button>
              <button
                type="submit"
                className={
                  backupPasswordMode === "restore"
                    ? "modal-btn danger"
                    : "modal-btn primary"
                }
                disabled={backupPasswordSubmitting}
              >
                {backupPasswordSubmitting
                  ? backupPasswordMode === "export"
                    ? t("backup.exporting")
                    : t("backup.restoring")
                  : backupPasswordMode === "export"
                    ? t("backup.createEncrypted")
                    : t("backup.restore")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
