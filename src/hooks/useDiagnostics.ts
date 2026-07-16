import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { APP_VERSION, isTauriRuntime } from "../appCore";
import {
  createSupportBundle,
  pruneDiagnostics,
  recordDiagnostic,
  setDiagnosticRuntimeInfo,
  type DiagnosticRuntimeInfo,
} from "../diagnostics";
import { useTranslation } from "../i18n";
import type { AlertDialogOptions, ConfirmDialogOptions } from "../types/dialogs";

type Args = {
  setConfirmDialog: (dialog: ConfirmDialogOptions | null) => void;
  setAlertDialog: (dialog: AlertDialogOptions | null) => void;
};

export function useDiagnostics({ setConfirmDialog, setAlertDialog }: Args) {
  const { t } = useTranslation();

  useEffect(() => {
    pruneDiagnostics();
    if (!isTauriRuntime()) return;
    void invoke<DiagnosticRuntimeInfo>("diagnostics_runtime_info")
      .then(setDiagnosticRuntimeInfo)
      .catch(() => {
        recordDiagnostic({
          component: "diagnostics",
          code: "DIAGNOSTICS_RUNTIME_INFO_FAILED",
          severity: "warning",
        });
      });
  }, []);

  async function saveSupportBundle(serializedBundle: string) {
    try {
      if (isTauriRuntime()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          title: t("diagnostics.saveTitle"),
          defaultPath: `ai-multiplexer-support-${APP_VERSION}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path) return;
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        await writeTextFile(path, serializedBundle);
      } else {
        const blob = new Blob([serializedBundle], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `ai-multiplexer-support-${APP_VERSION}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      recordDiagnostic({
        component: "diagnostics",
        code: "SUPPORT_BUNDLE_EXPORT_FAILED",
        severity: "error",
      });
      setAlertDialog({
        title: t("diagnostics.exportFailedTitle"),
        message: t("diagnostics.exportFailed"),
      });
    }
  }

  function exportSupportBundle() {
    const bundle = createSupportBundle();
    const serializedBundle = JSON.stringify(bundle, null, 2);
    setConfirmDialog({
      title: t("diagnostics.exportTitle"),
      message: t("diagnostics.exportPreview", {
        count: String(bundle.events.length),
      }),
      details: serializedBundle,
      confirmLabel: t("diagnostics.export"),
      onConfirm: async () => {
        setConfirmDialog(null);
        await saveSupportBundle(serializedBundle);
      },
    });
  }

  return { exportSupportBundle };
}
