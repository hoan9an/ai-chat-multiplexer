import type {
  AlertDialogOptions,
  ConfirmDialogOptions,
  TextPromptState,
} from "../types/dialogs";
import type { DownloadToast, ThemeMode } from "../appCore";
import type { UpdateStatus, BackupBusy } from "../types/updates";
import { AlertDialog, ConfirmDialog, TextPromptModal } from "./Modals";
import { SettingsModal } from "./SettingsModal";
import { DownloadToastStack } from "./DownloadToastStack";
import { DownloadsPanel } from "./DownloadsPanel";
import { OnboardingModal } from "./OnboardingModal";
import type { WorkflowTemplateId } from "../workflowTemplates";

export interface AppOverlaysProps {
  textPrompt: TextPromptState | null;
  textPromptValue: string;
  setTextPromptValue: (value: string) => void;
  closeTextPrompt: () => void;
  submitTextPrompt: () => void;

  confirmDialog: ConfirmDialogOptions | null;
  setConfirmDialog: (dialog: ConfirmDialogOptions | null) => void;
  alertDialog: AlertDialogOptions | null;
  setAlertDialog: (dialog: AlertDialogOptions | null) => void;

  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  updateStatus: UpdateStatus;
  checkForUpdates: () => void;
  downloadAndInstallUpdate: () => void;
  openReleasePage: (url: string) => void;
  backupBusy: BackupBusy;
  exportConfigJson: () => void;
  importConfigJson: () => void;
  exportFullBackup: (passphrase: string) => void | Promise<void>;
  restoreFullBackup: (passphrase: string) => void | Promise<void>;
  cancelRestoreFullBackup: () => void | Promise<void>;
  exportSupportBundle: () => void;
  openSupportIssue: () => void;
  openKnownIssues: () => void;

  isOnboardingOpen: boolean;
  applyOnboardingTemplate: (
    templateId: WorkflowTemplateId,
    name: string,
  ) => void;
  skipOnboarding: () => void;
  reopenOnboarding: () => void;

  isDownloadsOpen: boolean;
  setIsDownloadsOpen: (open: boolean) => void;
  downloadToasts: DownloadToast[];
  dismissToast: (id: string) => void;
  openFile: (path: string) => Promise<void> | void;
  revealFolder: (path: string) => void;
  clearAll: () => void;
}

export function AppOverlays(props: AppOverlaysProps) {
  const {
    textPrompt,
    textPromptValue,
    setTextPromptValue,
    closeTextPrompt,
    submitTextPrompt,
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    isSettingsOpen,
    setIsSettingsOpen,
    theme,
    setTheme,
    updateStatus,
    checkForUpdates,
    downloadAndInstallUpdate,
    openReleasePage,
    backupBusy,
    exportConfigJson,
    importConfigJson,
    exportFullBackup,
    restoreFullBackup,
    cancelRestoreFullBackup,
    exportSupportBundle,
    openSupportIssue,
    openKnownIssues,
    isOnboardingOpen,
    applyOnboardingTemplate,
    skipOnboarding,
    reopenOnboarding,
    isDownloadsOpen,
    setIsDownloadsOpen,
    downloadToasts,
    dismissToast,
    openFile,
    revealFolder,
    clearAll,
  } = props;

  return (
    <>
      <TextPromptModal
        prompt={textPrompt}
        value={textPromptValue}
        onValueChange={setTextPromptValue}
        onClose={closeTextPrompt}
        onSubmit={submitTextPrompt}
      />

      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        updateStatus={updateStatus}
        onCheckForUpdates={checkForUpdates}
        onDownloadAndInstall={downloadAndInstallUpdate}
        onOpenReleasePage={openReleasePage}
        backupBusy={backupBusy}
        onExportConfig={exportConfigJson}
        onImportConfig={importConfigJson}
        onExportFullBackup={exportFullBackup}
        onRestoreFullBackup={restoreFullBackup}
        onCancelRestoreFullBackup={cancelRestoreFullBackup}
        onExportSupportBundle={exportSupportBundle}
        onOpenSupportIssue={openSupportIssue}
        onOpenKnownIssues={openKnownIssues}
        onShowOnboarding={reopenOnboarding}
      />

      <OnboardingModal
        open={isOnboardingOpen}
        onApplyTemplate={applyOnboardingTemplate}
        onSkip={skipOnboarding}
      />

      <ConfirmDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />

      <AlertDialog dialog={alertDialog} onClose={() => setAlertDialog(null)} />

      <DownloadToastStack
        toasts={downloadToasts}
        onDismiss={dismissToast}
        onOpenFile={(path) => void openFile(path)}
        onRevealFolder={revealFolder}
      />

      <DownloadsPanel
        open={isDownloadsOpen}
        items={downloadToasts}
        onClose={() => setIsDownloadsOpen(false)}
        onClearAll={clearAll}
        onOpenFile={(path) => void openFile(path)}
        onRevealFolder={revealFolder}
      />
    </>
  );
}
