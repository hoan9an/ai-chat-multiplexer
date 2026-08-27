import { invoke } from "@tauri-apps/api/core";
import {
  createDefaultWorkspace,
  createId,
  isTauriRuntime,
  type AppState,
  type ChatPane,
  type Profile,
  type Workspace,
} from "../appCore";
import { getNewTabUrl, NEW_TAB_ICON, NEW_TAB_TITLE } from "../newtab";
import { useTranslation } from "../i18n";
import type { ConfirmDialogOptions, TextPromptOptions } from "../types/dialogs";

export interface UseProfileWorkspaceActionsArgs {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  activeWorkspace: Workspace;
  setFocusedPaneId: (id: string | null) => void;
  setConfirmDialog: (dialog: ConfirmDialogOptions | null) => void;
  openTextPrompt: (opts: TextPromptOptions) => void;
  updateActiveWorkspace: (updater: (workspace: Workspace) => Workspace) => void;
}

export interface ProfileWorkspaceActions {
  addBlankPaneWithProfile: (profile: Profile) => void;
  getProfileById: (profileId: string) => Profile | undefined;
  ensureProfileWithName: (profileName: string) => Profile;
  renameProfile: (profileId: string) => void;
  renamePane: (paneId: string) => void;
  deleteProfile: (profileId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: () => void;
  renameActiveWorkspace: () => void;
  deleteActiveWorkspace: () => void;
}

export function useProfileWorkspaceActions({
  state,
  setState,
  activeWorkspace,
  setFocusedPaneId,
  setConfirmDialog,
  openTextPrompt,
  updateActiveWorkspace,
}: UseProfileWorkspaceActionsArgs): ProfileWorkspaceActions {
  const { t } = useTranslation();
  function addBlankPaneWithProfile(profile: Profile) {
    const paneId = createId("pane");
    const tabId = createId("tab");
    const newTabUrl = getNewTabUrl();
    const paneTitle = profile.name === "Default" ? "Main Chat" : profile.name;
    const newPane: ChatPane = {
      id: paneId,
      title: paneTitle,
      profileId: profile.id,
      activeTabId: tabId,
      tabs: [
        {
          id: tabId,
          title: NEW_TAB_TITLE,
          url: newTabUrl,
          loadedUrl: newTabUrl,
          currentUrl: newTabUrl,
          faviconUrl: NEW_TAB_ICON,
        },
      ],
    };
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      panes: [...workspace.panes, newPane],
    }));
  }

  function getProfileById(profileId: string): Profile | undefined {
    return state.profiles.find((p) => p.id === profileId);
  }

  function ensureProfileWithName(profileName: string): Profile {
    const trimmed = profileName.trim() || "Default";
    const existing = state.profiles.find((p) => p.name === trimmed);
    if (existing) return existing;

    const newProfile: Profile = {
      id: createId("prof"),
      name: trimmed,
    };
    setState((current) => ({ ...current, profiles: [...current.profiles, newProfile] }));
    return newProfile;
  }

  function renameProfile(profileId: string) {
    const profile = state.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    openTextPrompt({
      title: t("profile.renameTitle"),
      initial: profile.name,
      placeholder: t("profile.newNamePlaceholder"),
      onSubmit: (next) => {
        if (next === profile.name) return;
        setState((current) => ({
          ...current,
          profiles: current.profiles.map((p) => (p.id === profileId ? { ...p, name: next } : p)),
          workspaces: current.workspaces.map((ws) => ({
            ...ws,
            panes: ws.panes.map((pane) => {
              if (pane.profileId !== profileId) return pane;
              const baseTitle = pane.title.split(" — ")[0];
              return {
                ...pane,
                title: next === "Default" ? baseTitle : `${baseTitle} — ${next}`,
              };
            }),
          })),
        }));
      },
    });
  }

  function renamePane(paneId: string) {
    const pane = activeWorkspace.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return;
    openTextPrompt({
      title: t("pane.renameTitle"),
      initial: pane.title,
      placeholder: t("pane.newTitlePlaceholder"),
      onSubmit: (next) => {
        if (next === pane.title) return;
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          panes: workspace.panes.map((candidate) =>
            candidate.id === paneId ? { ...candidate, title: next } : candidate,
          ),
        }));
      },
    });
  }

  function deleteProfile(profileId: string) {
    const profile = state.profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const inUse = state.workspaces.some((ws) =>
      ws.panes.some((pane) => pane.profileId === profileId),
    );
    if (inUse) {
      setConfirmDialog({
        title: t("profile.inUseTitle"),
        message: t("profile.inUseMessage"),
        confirmLabel: t("common.ok"),
        onConfirm: () => setConfirmDialog(null),
      });
      return;
    }

    setConfirmDialog({
      title: t("profile.deleteTitle", { name: profile.name }),
      message: t("profile.deleteMessage"),
      confirmLabel: t("common.delete"),
      danger: true,
      onConfirm: () => {
        if (isTauriRuntime()) {
          void invoke("delete_profile_session", {
            profileId,
          }).catch((error) => console.error("delete_profile_session failed", error));
        }
        setState((current) => ({
          ...current,
          profiles: current.profiles.filter((p) => p.id !== profileId),
        }));
        setConfirmDialog(null);
      },
    });
  }

  function switchWorkspace(workspaceId: string) {
    if (workspaceId === state.activeWorkspaceId) return;
    setFocusedPaneId(null);
    setState((current) => ({ ...current, activeWorkspaceId: workspaceId }));
  }

  function createWorkspace() {
    const nextIndex = state.workspaces.length + 1;
    const workspace = createDefaultWorkspace(`Workspace ${nextIndex}`);
    setFocusedPaneId(null);
    setState((current) => ({
      ...current,
      workspaces: [...current.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    }));
  }

  function renameActiveWorkspace() {
    const currentName = activeWorkspace.name;
    openTextPrompt({
      title: t("workspace.renameTitle"),
      initial: currentName,
      placeholder: t("profile.newNamePlaceholder"),
      onSubmit: (next) => {
        if (next === currentName) return;
        updateActiveWorkspace((workspace) => ({ ...workspace, name: next }));
      },
    });
  }

  function deleteActiveWorkspace() {
    if (state.workspaces.length <= 1) return;

    setConfirmDialog({
      title: t("workspace.deleteTitle", { name: activeWorkspace.name }),
      message: t("workspace.deleteMessage"),
      confirmLabel: t("common.delete"),
      danger: true,
      onConfirm: () => {
        setFocusedPaneId(null);
        setState((current) => {
          const remaining = current.workspaces.filter(
            (ws) => ws.id !== current.activeWorkspaceId,
          );
          return {
            ...current,
            workspaces: remaining,
            activeWorkspaceId: remaining[0].id,
          };
        });
        setConfirmDialog(null);
      },
    });
  }

  return {
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
  };
}
