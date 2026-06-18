import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { useTranslation } from "../i18n";
import {
  APP_VERSION,
  DEFAULT_PROFILE_ID,
  GITHUB_REPO,
  RELEASES_URL,
  compareVersions,
  createDefaultProfiles,
  hydrateTabs,
  isTauriRuntime,
  type AppState,
} from "../appCore";
import type { Update } from "@tauri-apps/plugin-updater";

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

export interface ConfirmDialogRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface UseBackupAndUpdatesArgs {
  state: AppState;
  setState: (next: AppState) => void;
  setFocusedPaneId: (id: string | null) => void;
  setConfirmDialog: (dialog: ConfirmDialogRequest | null) => void;
}

export interface UseBackupAndUpdatesResult {
  updateStatus: UpdateStatus;
  backupBusy: BackupBusy;
  checkForUpdates: () => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  openReleasePage: (url: string) => Promise<void>;
  exportConfigJson: () => Promise<void>;
  importConfigJson: () => Promise<void>;
  exportFullBackup: () => Promise<void>;
  restoreFullBackup: () => Promise<void>;
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
}: UseBackupAndUpdatesArgs): UseBackupAndUpdatesResult {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [backupBusy, setBackupBusy] = useState<BackupBusy>("idle");
  // Holds the pending Update returned by the Tauri updater `check()` so a later
  // `downloadAndInstallUpdate()` can act on the exact same artifact (signature
  // verification happens inside the plugin during download/install).
  const pendingUpdate = useRef<Update | null>(null);

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
    const data = (await response.json()) as { tag_name?: string; html_url?: string };
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
        await invoke("plugin:fs|write_text_file", { path: filePath, contents: json }).catch(
          async () => {
            // tauri-plugin-fs may not be available, fall back to raw command
            const { writeTextFile } = await import("@tauri-apps/plugin-fs").catch(() => ({
              writeTextFile: null as null | ((p: string, c: string) => Promise<void>),
            }));
            if (writeTextFile) {
              await writeTextFile(filePath, json);
              return;
            }
            throw new Error(t("backup.fsUnavailable"));
          },
        );
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
      window.alert(t("backup.exportError", { msg: error instanceof Error ? error.message : String(error) }));
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
        const { readTextFile } = await import("@tauri-apps/plugin-fs").catch(() => ({
          readTextFile: null as null | ((p: string) => Promise<string>),
        }));
        if (!readTextFile) throw new Error(t("backup.fsUnavailable"));
        text = await readTextFile(filePath);
      } else {
        text = await new Promise<string | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) {
              resolve(null);
              return;
            }
            resolve(await file.text());
          };
          input.click();
        });
      }

      if (!text) {
        setBackupBusy("idle");
        return;
      }

      const parsed = JSON.parse(text) as AppState;
      if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) {
        throw new Error(t("backup.invalidConfig"));
      }

      setConfirmDialog({
        title: t("backup.replaceConfigTitle"),
        message: t("backup.replaceConfigMsg"),
        confirmLabel: t("backup.replace"),
        danger: true,
        onConfirm: () => {
          const profiles =
            Array.isArray(parsed.profiles) && parsed.profiles.length > 0
              ? parsed.profiles
              : createDefaultProfiles();
          const profileIds = new Set(profiles.map((p) => p.id));
          const workspaces = parsed.workspaces.map((ws) => ({
            ...ws,
            panes: ws.panes.map((pane) => ({
              ...pane,
              profileId: profileIds.has(pane.profileId) ? pane.profileId : DEFAULT_PROFILE_ID,
              tabs: hydrateTabs(pane.tabs ?? []),
            })),
          }));
          const activeId = workspaces.some((ws) => ws.id === parsed.activeWorkspaceId)
            ? parsed.activeWorkspaceId
            : workspaces[0].id;
          setState({ workspaces, activeWorkspaceId: activeId, profiles });
          setFocusedPaneId(null);
        },
      });
    } catch (error) {
      window.alert(t("backup.importError", { msg: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBackupBusy("idle");
    }
  }

  async function exportFullBackup() {
    if (!isTauriRuntime()) {
      window.alert(t("backup.fullDesktopOnly"));
      return;
    }
    setBackupBusy("exporting");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        title: t("backup.saveFullTitle"),
        defaultPath: `ai-multiplexer-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!filePath) {
        setBackupBusy("idle");
        return;
      }
      // Save config alongside zip as <name>.json
      const configPath = filePath.replace(/\.zip$/i, ".json");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs").catch(() => ({
        writeTextFile: null as null | ((p: string, c: string) => Promise<void>),
      }));
      if (writeTextFile) {
        await writeTextFile(configPath, JSON.stringify(state, null, 2));
      }
      await invoke("backup_sessions_zip", { outputPath: filePath });
      window.alert(
        t("backup.backupComplete", { zip: filePath, config: configPath }),
      );
    } catch (error) {
      window.alert(
        t("backup.backupError", {
          msg: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBackupBusy("idle");
    }
  }

  async function restoreFullBackup() {
    if (!isTauriRuntime()) {
      window.alert(t("backup.restoreDesktopOnly"));
      return;
    }
    setBackupBusy("importing");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        title: t("backup.chooseRestoreTitle"),
        multiple: false,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!filePath || typeof filePath !== "string") {
        setBackupBusy("idle");
        return;
      }

      setConfirmDialog({
        title: t("backup.restoreTitle"),
        message: t("backup.restoreMsg"),
        confirmLabel: t("backup.restore"),
        danger: true,
        onConfirm: async () => {
          try {
            await invoke("restore_sessions_zip", { inputPath: filePath });
            window.alert(t("backup.restoreDone"));
          } catch (error) {
            window.alert(t("backup.restoreError", { msg: error instanceof Error ? error.message : String(error) }));
          }
        },
      });
    } catch (error) {
      window.alert(t("backup.restoreError", { msg: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBackupBusy("idle");
    }
  }

  return {
    updateStatus,
    backupBusy,
    checkForUpdates,
    downloadAndInstallUpdate,
    openReleasePage,
    exportConfigJson,
    importConfigJson,
    exportFullBackup,
    restoreFullBackup,
  };
}
