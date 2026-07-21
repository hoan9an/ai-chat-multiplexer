import { invoke } from "@tauri-apps/api/core";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";
import {
  APP_VERSION,
  GITHUB_REPO,
  RELEASES_URL,
  STORAGE_KEY,
  compareVersions,
  isTauriRuntime,
  normalizeAppState,
  type AppState,
} from "../appCore";
import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateStatus, BackupBusy } from "../types/updates";
import type {
  AlertDialogOptions,
  ConfirmDialogOptions,
} from "../types/dialogs";
import { recordDiagnostic } from "../diagnostics";

export type { UpdateStatus, BackupBusy };

export interface UseBackupAndUpdatesArgs {
  state: AppState;
  setState: (next: AppState) => void;
  setFocusedPaneId: (id: string | null) => void;
  setConfirmDialog: (dialog: ConfirmDialogOptions | null) => void;
  setAlertDialog: (dialog: AlertDialogOptions | null) => void;
}

interface StartupOperationResult {
  operation: "backup" | "restore" | string;
  success: boolean;
  message: string;
  zipPath?: string | null;
  configPath?: string | null;
  configJson?: string | null;
  configRestored?: boolean | null;
  warnings?: string[];
}

const MAX_CONFIG_JSON_BYTES = 10 * 1024 * 1024;

export interface UseBackupAndUpdatesResult {
  updateStatus: UpdateStatus;
  backupBusy: BackupBusy;
  startupRestoreProcessing: boolean;
  checkForUpdates: () => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  openReleasePage: (url: string) => Promise<void>;
  exportConfigJson: () => Promise<void>;
  importConfigJson: () => Promise<void>;
  exportFullBackup: (passphrase: string) => Promise<void>;
  restoreFullBackup: (passphrase: string) => Promise<void>;
  cancelRestoreFullBackup: () => Promise<void>;
}

function isMissingUpdaterReleaseJson(message: string): boolean {
  if (/could not fetch a valid release json from the remote/i.test(message)) {
    return true;
  }

  if (!/\b(?:404|not found)\b/i.test(message)) {
    return false;
  }

  return (
    /latest\.json/i.test(message) ||
    /\bupdater\s+manifest\b/i.test(message) ||
    /\bupdate\s+manifest\b/i.test(message) ||
    /\brelease\s+json\b/i.test(message) ||
    /\brelease\s+manifest\b/i.test(message)
  );
}

export function useBackupAndUpdates({
  state,
  setState,
  setFocusedPaneId,
  setConfirmDialog,
  setAlertDialog,
}: UseBackupAndUpdatesArgs): UseBackupAndUpdatesResult {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    kind: "idle",
  });
  const [backupBusy, setBackupBusy] = useState<BackupBusy>("idle");
  const [startupRestoreProcessing, setStartupRestoreProcessing] = useState(() =>
    isTauriRuntime(),
  );
  // Holds the pending Update returned by the Tauri updater `check()` so a later
  // `downloadAndInstallUpdate()` can act on the exact same artifact (signature
  // verification happens inside the plugin during download/install).
  const pendingUpdate = useRef<Update | null>(null);

  function appStateFromJson(configJson: string): AppState | null {
    try {
      return normalizeAppState(JSON.parse(configJson) as AppState);
    } catch {
      return null;
    }
  }

  function applyImportedAppState(parsed: AppState): AppState {
    const normalized = normalizeAppState(parsed);
    if (!normalized) {
      throw new Error(t("backup.invalidConfig"));
    }
    return normalized;
  }

  function showAlert(message: string, title = t("common.notice")) {
    setAlertDialog({ title, message, confirmLabel: t("common.ok") });
  }

  useLayoutEffect(() => {
    if (!isTauriRuntime()) {
      setStartupRestoreProcessing(false);
      return;
    }
    let cancelled = false;
    void Promise.resolve(
      invoke<StartupOperationResult[]>("session_startup_results"),
    )
      .then((results) => {
        if (cancelled) return;
        const safeResults = Array.isArray(results) ? results : [];
        const messages: string[] = [];

        safeResults.forEach((result) => {
          if (result.operation === "backup") {
            if (!result.success) {
              recordDiagnostic({
                component: "backup",
                code: "FULL_BACKUP_STARTUP_FAILED",
                severity: "error",
              });
            }
            messages.push(
              result.success
                ? result.configPath
                  ? t("backup.startupBackupSuccess", {
                      zip: result.zipPath ?? "",
                      config: result.configPath,
                    })
                  : t("backup.startupBackupZipOnly", {
                      zip: result.zipPath ?? "",
                    })
                : t("backup.startupBackupError", { msg: result.message }),
            );
            (result.warnings ?? []).forEach((warning) =>
              messages.push(warning),
            );
            return;
          }

          if (result.operation === "restore") {
            if (result.success && result.configJson) {
              const restoredState = appStateFromJson(result.configJson);
              if (restoredState) {
                window.localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify(restoredState),
                );
                setState(restoredState);
                setFocusedPaneId(null);
                messages.push(t("backup.startupRestoreSuccess"));
              } else {
                messages.push(
                  t("backup.startupRestoreConfigError", {
                    msg: t("backup.invalidConfig"),
                  }),
                );
              }
            } else if (result.success) {
              messages.push(
                result.configRestored === false
                  ? t("backup.startupRestorePartial")
                  : t("backup.startupRestoreSuccess"),
              );
            } else {
              recordDiagnostic({
                component: "restore",
                code: "FULL_RESTORE_STARTUP_FAILED",
                severity: "error",
              });
              messages.push(
                t("backup.startupRestoreError", { msg: result.message }),
              );
            }

            (result.warnings ?? []).forEach((warning) =>
              messages.push(warning),
            );
            return;
          }

          messages.push(result.message);
        });

        if (safeResults.length > 0) {
          void Promise.resolve(
            invoke("acknowledge_session_startup_results"),
          ).catch((error) => {
            recordDiagnostic({
              component: "restore",
              code: "STARTUP_RESULT_ACK_FAILED",
              severity: "error",
            });
            console.error("acknowledge_session_startup_results failed", error);
          });
        }

        if (messages.length > 0) {
          showAlert(messages.join("\n\n"));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          recordDiagnostic({
            component: "restore",
            code: "STARTUP_RESULT_READ_FAILED",
            severity: "error",
          });
          console.error("session_startup_results failed", error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStartupRestoreProcessing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setFocusedPaneId, setState, t]);

  async function restartApp() {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      try {
        await invoke("quit_app");
      } catch {
        showAlert(t("backup.restartManual"));
      }
    }
  }

  // Web / non-Tauri fallback: query the GitHub REST API and surface the releases
  // page for a manual download. The desktop updater is unavailable here.
  async function checkForUpdatesViaGithubApi() {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const latestTag = data.tag_name?.replace(/^v/, "") ?? "";
    const releaseUrl = data.html_url ?? RELEASES_URL;

    if (!latestTag) {
      setUpdateStatus({ kind: "error", message: t("update.parseError") });
      return;
    }

    if (compareVersions(latestTag, APP_VERSION) > 0) {
      setUpdateStatus({ kind: "available", latest: latestTag, releaseUrl });
    } else {
      setUpdateStatus({ kind: "current" });
    }
  }

  async function checkForUpdates() {
    pendingUpdate.current = null;
    setUpdateStatus({ kind: "checking" });
    try {
      if (isTauriRuntime()) {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          pendingUpdate.current = update;
          // No releaseUrl in the desktop path — install happens in-app — but we
          // keep the field populated so the `available` shape stays uniform and
          // the web-fallback link still works if ever rendered.
          setUpdateStatus({
            kind: "available",
            latest: update.version,
            releaseUrl: RELEASES_URL,
          });
        } else {
          setUpdateStatus({ kind: "current" });
        }
        return;
      }

      await checkForUpdatesViaGithubApi();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Treat only known "missing updater manifest/release JSON" lookup failures
      // as up-to-date. Do not hide offline, permission, signature, or generic asset
      // corruption errors behind a broad release-word match.
      if (isMissingUpdaterReleaseJson(message)) {
        setUpdateStatus({ kind: "current" });
        return;
      }
      setUpdateStatus({ kind: "error", message });
      recordDiagnostic({
        component: "updater",
        code: "UPDATE_CHECK_FAILED",
        severity: "error",
      });
    }
  }

  async function downloadAndInstallUpdate() {
    const update = pendingUpdate.current;
    if (!update) {
      // No update was staged by a prior check — nothing to install.
      return;
    }

    const latest = update.version;
    let contentLength = 0;
    let downloaded = 0;
    setUpdateStatus({ kind: "downloading", latest, progress: 0 });

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            downloaded = 0;
            setUpdateStatus({ kind: "downloading", latest, progress: 0 });
            break;
          case "Progress": {
            downloaded += event.data.chunkLength;
            const progress =
              contentLength > 0
                ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                : 0;
            setUpdateStatus({ kind: "downloading", latest, progress });
            break;
          }
          case "Finished":
            setUpdateStatus({ kind: "installing", latest });
            break;
        }
      });

      // Download + signature verification + install all succeeded.
      setUpdateStatus({ kind: "readyToInstall", latest });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      pendingUpdate.current = null;
      recordDiagnostic({
        component: "updater",
        code: "UPDATE_INSTALL_FAILED",
        severity: "error",
      });
      setUpdateStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function openReleasePage(url: string) {
    if (isTauriRuntime()) {
      try {
        await invoke("plugin:opener|open_url", { url });
        return;
      } catch {
        // fallthrough to window.open
      }
    }
    window.open(url, "_blank", "noopener");
  }

  async function exportConfigJson() {
    setBackupBusy("exporting");
    try {
      const json = JSON.stringify(state, null, 2);

      if (isTauriRuntime()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const filePath = await save({
          title: t("backup.saveConfigTitle"),
          defaultPath: `ai-multiplexer-config-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!filePath) {
          setBackupBusy("idle");
          return;
        }
        await invoke("plugin:fs|write_text_file", {
          path: filePath,
          contents: json,
        }).catch(async () => {
          // tauri-plugin-fs may not be available, fall back to raw command
          const { writeTextFile } = await import("@tauri-apps/plugin-fs").catch(
            () => ({
              writeTextFile: null as
                null | ((p: string, c: string) => Promise<void>),
            }),
          );
          if (writeTextFile) {
            await writeTextFile(filePath, json);
            return;
          }
          throw new Error(t("backup.fsUnavailable"));
        });
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ai-multiplexer-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      recordDiagnostic({
        component: "backup",
        code: "CONFIG_EXPORT_FAILED",
        severity: "error",
      });
      showAlert(
        t("backup.exportError", {
          msg: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBackupBusy("idle");
    }
  }

  async function importConfigJson() {
    setBackupBusy("importing");
    try {
      let text: string | null = null;

      if (isTauriRuntime()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const filePath = await open({
          title: t("backup.chooseConfigTitle"),
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!filePath || typeof filePath !== "string") {
          setBackupBusy("idle");
          return;
        }
        const { readTextFile, stat } =
          await import("@tauri-apps/plugin-fs").catch(() => ({
            readTextFile: null as null | ((p: string) => Promise<string>),
            stat: null as null | ((p: string) => Promise<{ size: number }>),
          }));
        if (!readTextFile || !stat) throw new Error(t("backup.fsUnavailable"));
        const fileInfo = await stat(filePath);
        if (fileInfo.size > MAX_CONFIG_JSON_BYTES) {
          throw new Error(t("backup.configTooLarge"));
        }
        text = await readTextFile(filePath);
      } else {
        text = await new Promise<string | null>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json";
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) {
              resolve(null);
              return;
            }
            if (file.size > MAX_CONFIG_JSON_BYTES) {
              reject(new Error(t("backup.configTooLarge")));
              return;
            }
            void file.text().then(resolve, reject);
          };
          input.click();
        });
      }

      if (!text) {
        setBackupBusy("idle");
        return;
      }

      const normalized = applyImportedAppState(JSON.parse(text) as AppState);

      setConfirmDialog({
        title: t("backup.replaceConfigTitle"),
        message: t("backup.replaceConfigMsg"),
        confirmLabel: t("backup.replace"),
        danger: true,
        onConfirm: () => {
          setState(normalized);
          setFocusedPaneId(null);
          setConfirmDialog(null);
        },
      });
    } catch (error) {
      recordDiagnostic({
        component: "backup",
        code: "CONFIG_IMPORT_FAILED",
        severity: "error",
      });
      showAlert(
        t("backup.importError", {
          msg: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBackupBusy("idle");
    }
  }

  async function exportFullBackup(passphrase: string) {
    if (!isTauriRuntime()) {
      showAlert(t("backup.fullDesktopOnly"));
      return;
    }
    if (!passphrase) {
      showAlert(t("backup.passwordRequired"));
      return;
    }
    setBackupBusy("exporting");
    try {
      // The passphrase is sent only with this invoke. Rust closes the child
      // webviews, writes the encrypted archive immediately, and never stages
      // the passphrase in a restart request or sidecar file.
      const outputPath = await invoke<string | null>("backup_sessions_zip", {
        configJson: JSON.stringify(state, null, 2),
        passphrase,
      });
      if (!outputPath) {
        return;
      }
      setConfirmDialog({
        title: t("backup.backupScheduledTitle"),
        message: t("backup.backupScheduledMsg", { path: outputPath }),
        confirmLabel: t("backup.restartNow"),
        danger: false,
        onConfirm: restartApp,
      });
    } catch (error) {
      recordDiagnostic({
        component: "backup",
        code: "FULL_BACKUP_SCHEDULE_FAILED",
        severity: "error",
      });
      const message = error instanceof Error ? error.message : String(error);
      showAlert(
        message.startsWith("BACKUP_PASSPHRASE_REQUIRED:")
          ? t("backup.passwordRequired")
          : t("backup.backupError", { msg: message }),
      );
    } finally {
      setBackupBusy("idle");
    }
  }

  async function restoreFullBackup(passphrase: string) {
    if (!isTauriRuntime()) {
      showAlert(t("backup.restoreDesktopOnly"));
      return;
    }
    setBackupBusy("importing");
    try {
      // An empty passphrase is intentionally allowed here for legacy ZIP v1.
      // Encrypted backups reject it in Rust without touching live sessions.
      const inputPath = await invoke<string | null>("restore_sessions_zip", {
        passphrase,
      });
      if (!inputPath) return;
      setConfirmDialog({
        title: t("backup.restoreSuccessTitle"),
        message: t("backup.restoreSuccessMsg"),
        confirmLabel: t("backup.restartNow"),
        danger: false,
        onConfirm: restartApp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /restore.*(?:bị hủy|cancelled)|(?:bị hủy|cancelled).*restore/i.test(
          message,
        )
      ) {
        return;
      }
      recordDiagnostic({
        component: "restore",
        code: "FULL_RESTORE_STAGE_FAILED",
        severity: "error",
      });
      const safeMessage =
        message.startsWith("BACKUP_AUTH_FAILED:") ||
        message.startsWith("BACKUP_PASSPHRASE_REQUIRED:") ||
        message.startsWith("BACKUP_FORMAT_UNSUPPORTED:")
          ? t("backup.restoreAuthError")
          : t("backup.restoreError", { msg: message });
      showAlert(safeMessage);
    } finally {
      setBackupBusy("idle");
    }
  }

  async function cancelRestoreFullBackup() {
    if (!isTauriRuntime()) return;
    try {
      await invoke("cancel_restore_sessions");
    } catch (error) {
      recordDiagnostic({
        component: "restore",
        code: "FULL_RESTORE_CANCEL_FAILED",
        severity: "error",
      });
      const message = error instanceof Error ? error.message : String(error);
      showAlert(t("backup.restoreCancelError", { msg: message }));
    }
  }

  return {
    updateStatus,
    backupBusy,
    startupRestoreProcessing,
    checkForUpdates,
    downloadAndInstallUpdate,
    openReleasePage,
    exportConfigJson,
    importConfigJson,
    exportFullBackup,
    restoreFullBackup,
    cancelRestoreFullBackup,
  };
}
