import { useState } from "react";
import "./App.css";
import { AppOverlays } from "./components/AppOverlays";
import { PaneGrid } from "./components/PaneGrid";
import { AppHeader } from "./components/AppHeader";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { useDragState } from "./hooks/useDragState";
import { useDerivedWorkspaceState } from "./hooks/useDerivedWorkspaceState";
import { useFocusedPaneCleanup } from "./hooks/useFocusedPaneCleanup";
import { useMenuStates } from "./hooks/useMenuStates";
import { useDownloadManager } from "./hooks/useDownloadManager";
import { useNativeWebviews } from "./hooks/useNativeWebviews";
import { useBackupAndUpdates } from "./hooks/useBackupAndUpdates";
import { useNativeTabStatus } from "./hooks/useNativeTabStatus";
import { usePaneActions } from "./hooks/usePaneActions";
import { usePaneResize } from "./hooks/usePaneResize";
import { usePromptDialogs } from "./hooks/usePromptDialogs";
import { useProfileWorkspaceActions } from "./hooks/useProfileWorkspaceActions";
import { useNativeNewWindowRequests } from "./hooks/useNativeNewWindowRequests";
import { useDiagnostics } from "./hooks/useDiagnostics";
import { useTranslation } from "./i18n";
import { KNOWN_ISSUES_URL, SUPPORT_ISSUE_URL } from "./appCore";
import { useOnboarding } from "./onboarding";
import { applyWorkflowTemplate, type WorkflowTemplateId } from "./workflowTemplates";

function DesktopApp() {
  const { lang, t } = useTranslation();
  const { state, setState, theme, setTheme } = useAppPersistence();
  const onboarding = useOnboarding();
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const {
    isNewPaneMenuOpen,
    setIsNewPaneMenuOpen,
    isWorkspaceMenuOpen,
    setIsWorkspaceMenuOpen,
    isDownloadsOpen,
    setIsDownloadsOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    openPaneMenuId,
    setOpenPaneMenuId,
  } = useMenuStates();
  const {
    textPrompt,
    textPromptValue,
    setTextPromptValue,
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    openTextPrompt,
    closeTextPrompt,
    submitTextPrompt,
  } = usePromptDialogs();
  const {
    draggingPaneId,
    setDraggingPaneId,
    dragOverPaneId,
    setDragOverPaneId,
    editingUrls,
    setEditingUrls,
    tabDragOver,
    setTabDragOver,
    draggingTabKey,
    setDraggingTabKey,
    webviewShells,
    paneDrag,
    tabDrag,
  } = useDragState();
  const downloadManager = useDownloadManager();
  const downloadToasts = downloadManager.toasts;
  useNativeNewWindowRequests({ setState, setAlertDialog });
  const { exportSupportBundle } = useDiagnostics({ setConfirmDialog, setAlertDialog });
  const {
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
  } = useBackupAndUpdates({
    state,
    setState,
    setFocusedPaneId,
    setConfirmDialog,
    setAlertDialog,
  });

  const {
    activeWorkspace,
    activePanes,
    visiblePanes,
    effectiveColumns,
    effectiveRows,
    colSizes,
    rowSizes,
    shouldSuspendNativeWebviews,
  } = useDerivedWorkspaceState({
    state,
    focusedPaneId,
    isNewPaneMenuOpen,
    isWorkspaceMenuOpen,
    isSettingsOpen,
    isDownloadsOpen,
    openPaneMenuId,
    draggingPaneId,
    draggingTabKey,
    textPrompt,
    confirmDialog,
    alertDialog,
  });

  useNativeWebviews({
    state,
    focusedPaneId,
    suspended: shouldSuspendNativeWebviews || startupRestoreProcessing || onboarding.isOpen,
    shellsRef: webviewShells,
    lang,
  });

  useFocusedPaneCleanup({ focusedPaneId, activePanes, setFocusedPaneId });

  const {
    updateActiveWorkspace,
    updateActivePane,
    setColumns,
    removePane,
    addTab,
    removeTab,
    startEditingUrl,
    updateEditingUrl,
    commitTabUrl,
    navigateActiveWebview,
    moveTabWithinPane,
    moveTabAcrossPanes,
    detachTabToNewPane,
    finishPaneDrag,
    duplicatePane,
    splitPane,
    movePaneProfile,
    copyActiveTabUrl,
    openActiveTabExternally,
  } = usePaneActions({
    setState,
    activePanes,
    focusedPaneId,
    paneDrag,
    editingUrls,
    setEditingUrls,
    setDraggingPaneId,
    setDragOverPaneId,
  });

  const { activeSplitter, gridRef, beginSplitterDrag, nudgeSplitter, resetTrackSizes } =
    usePaneResize({
      updateActiveWorkspace,
      colSizes,
      rowSizes,
      effectiveColumns,
      effectiveRows,
    });

  useNativeTabStatus({ activePanes, focusedPaneId, updateActivePane });

  const {
    addBlankPaneWithProfile,
    getProfileById,
    ensureProfileWithName,
    renameProfile,
    renamePane,
    deleteProfile,
    switchWorkspace,
    createWorkspace,
    renameActiveWorkspace,
    deleteActiveWorkspace,
  } = useProfileWorkspaceActions({
    state,
    setState,
    activeWorkspace,
    setFocusedPaneId,
    setConfirmDialog,
    openTextPrompt,
    updateActiveWorkspace,
  });

  function applyOnboardingTemplate(templateId: WorkflowTemplateId, name: string) {
    setFocusedPaneId(null);
    setState((current) => applyWorkflowTemplate(current, templateId, name));
    onboarding.complete();
  }

  function openSupportIssue() {
    setIsSettingsOpen(false);
    setConfirmDialog({
      title: t("support.privacyTitle"),
      message: t("support.privacyMessage"),
      confirmLabel: t("support.continue"),
      onConfirm: async () => {
        setConfirmDialog(null);
        await openReleasePage(SUPPORT_ISSUE_URL);
      },
    });
  }

  function openKnownIssues() {
    void openReleasePage(KNOWN_ISSUES_URL);
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <AppHeader
        state={state}
        activeWorkspace={activeWorkspace}
        activePaneCount={activePanes.length}
        isWorkspaceMenuOpen={isWorkspaceMenuOpen}
        setIsWorkspaceMenuOpen={setIsWorkspaceMenuOpen}
        switchWorkspace={switchWorkspace}
        createWorkspace={createWorkspace}
        renameActiveWorkspace={renameActiveWorkspace}
        deleteActiveWorkspace={deleteActiveWorkspace}
        setColumns={setColumns}
        isNewPaneMenuOpen={isNewPaneMenuOpen}
        setIsNewPaneMenuOpen={setIsNewPaneMenuOpen}
        addBlankPaneWithProfile={addBlankPaneWithProfile}
        renameProfile={renameProfile}
        deleteProfile={deleteProfile}
        openTextPrompt={openTextPrompt}
        ensureProfileWithName={ensureProfileWithName}
        hasActiveDownload={downloadManager.hasActiveDownload}
        setIsDownloadsOpen={setIsDownloadsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      <PaneGrid
        visiblePanes={visiblePanes}
        activePanes={activePanes}
        effectiveColumns={effectiveColumns}
        effectiveRows={effectiveRows}
        colSizes={colSizes}
        rowSizes={rowSizes}
        focusedPaneId={focusedPaneId}
        dragOverPaneId={dragOverPaneId}
        draggingTabKey={draggingTabKey}
        tabDragOver={tabDragOver}
        editingUrls={editingUrls}
        paneDrag={paneDrag}
        tabDrag={tabDrag}
        webviewShells={webviewShells}
        gridRef={gridRef}
        activeSplitter={activeSplitter}
        beginSplitterDrag={beginSplitterDrag}
        nudgeSplitter={nudgeSplitter}
        resetTrackSizes={resetTrackSizes}
        openPaneMenuId={openPaneMenuId}
        setOpenPaneMenuId={setOpenPaneMenuId}
        getProfileById={getProfileById}
        profiles={state.profiles}
        setFocusedPaneId={setFocusedPaneId}
        setDraggingPaneId={setDraggingPaneId}
        setDragOverPaneId={setDragOverPaneId}
        setDraggingTabKey={setDraggingTabKey}
        setTabDragOver={setTabDragOver}
        setEditingUrls={setEditingUrls}
        addTab={addTab}
        removeTab={removeTab}
        removePane={removePane}
        updateActivePane={updateActivePane}
        navigateActiveWebview={navigateActiveWebview}
        startEditingUrl={startEditingUrl}
        updateEditingUrl={updateEditingUrl}
        commitTabUrl={commitTabUrl}
        finishPaneDrag={finishPaneDrag}
        moveTabWithinPane={moveTabWithinPane}
        moveTabAcrossPanes={moveTabAcrossPanes}
        detachTabToNewPane={detachTabToNewPane}
        renamePane={renamePane}
        duplicatePane={duplicatePane}
        splitPane={splitPane}
        movePaneProfile={movePaneProfile}
        copyActiveTabUrl={copyActiveTabUrl}
        openActiveTabExternally={openActiveTabExternally}
      />
      <AppOverlays
        textPrompt={textPrompt}
        textPromptValue={textPromptValue}
        setTextPromptValue={setTextPromptValue}
        closeTextPrompt={closeTextPrompt}
        submitTextPrompt={submitTextPrompt}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        alertDialog={alertDialog}
        setAlertDialog={setAlertDialog}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        theme={theme}
        setTheme={setTheme}
        updateStatus={updateStatus}
        checkForUpdates={checkForUpdates}
        downloadAndInstallUpdate={downloadAndInstallUpdate}
        openReleasePage={openReleasePage}
        backupBusy={backupBusy}
        exportConfigJson={exportConfigJson}
        importConfigJson={importConfigJson}
        exportFullBackup={exportFullBackup}
        restoreFullBackup={restoreFullBackup}
        cancelRestoreFullBackup={cancelRestoreFullBackup}
        exportSupportBundle={exportSupportBundle}
        openSupportIssue={openSupportIssue}
        openKnownIssues={openKnownIssues}
        isOnboardingOpen={onboarding.isOpen}
        applyOnboardingTemplate={applyOnboardingTemplate}
        skipOnboarding={onboarding.skip}
        reopenOnboarding={() => {
          setIsSettingsOpen(false);
          onboarding.reopen();
        }}
        isDownloadsOpen={isDownloadsOpen}
        setIsDownloadsOpen={setIsDownloadsOpen}
        downloadToasts={downloadToasts}
        dismissToast={downloadManager.dismissToast}
        openFile={downloadManager.openFile}
        revealFolder={downloadManager.revealFolder}
        clearAll={downloadManager.clearAll}
      />
    </main>
  );
}

function App() {
  return <DesktopApp />;
}

export default App;
