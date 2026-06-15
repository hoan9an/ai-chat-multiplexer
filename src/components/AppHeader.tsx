import {
  AppLogo,
  AppWordmark,
  IconDownload,
  IconEdit,
  IconPlus,
  IconSettings,
  IconTrash,
} from "../Icons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useTranslation } from "../i18n";
import type { AppState, Profile, Workspace } from "../appCore";

export interface AppHeaderProps {
  state: AppState;
  activeWorkspace: Workspace;
  activePaneCount: number;

  // Workspace switcher
  isWorkspaceMenuOpen: boolean;
  setIsWorkspaceMenuOpen: (open: boolean) => void;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: () => void;
  renameActiveWorkspace: () => void;
  deleteActiveWorkspace: () => void;

  // Layout
  setColumns: (columns: number) => void;

  // New pane menu
  isNewPaneMenuOpen: boolean;
  setIsNewPaneMenuOpen: (open: boolean) => void;
  addBlankPaneWithProfile: (profile: Profile) => void;
  renameProfile: (profileId: string) => void;
  deleteProfile: (profileId: string) => void;
  openTextPrompt: (opts: {
    title: string;
    initial?: string;
    placeholder?: string;
    onSubmit: (value: string) => void;
  }) => void;
  ensureProfileWithName: (profileName: string) => Profile;

  // Downloads + settings
  hasActiveDownload: boolean;
  setIsDownloadsOpen: (updater: (open: boolean) => boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
}

export function AppHeader({
  state,
  activeWorkspace,
  activePaneCount,
  isWorkspaceMenuOpen,
  setIsWorkspaceMenuOpen,
  switchWorkspace,
  createWorkspace,
  renameActiveWorkspace,
  deleteActiveWorkspace,
  setColumns,
  isNewPaneMenuOpen,
  setIsNewPaneMenuOpen,
  addBlankPaneWithProfile,
  renameProfile,
  deleteProfile,
  openTextPrompt,
  ensureProfileWithName,
  hasActiveDownload,
  setIsDownloadsOpen,
  setIsSettingsOpen,
}: AppHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="terminal-topbar">
      <section className="brand">
        <div className="brand-badge" aria-label="AI Multiplexer">
          <span className="brand-mark" aria-hidden="true">
            <AppLogo size={26} />
          </span>
          <AppWordmark height={20} className="brand-wordmark" />
          <span className="brand-shimmer" aria-hidden="true" />
        </div>
      </section>

      <section className="workspace-center">
        <WorkspaceSwitcher
          workspaces={state.workspaces}
          activeWorkspaceId={state.activeWorkspaceId}
          activePaneCount={activePaneCount}
          open={isWorkspaceMenuOpen}
          onOpenChange={setIsWorkspaceMenuOpen}
          onSwitch={switchWorkspace}
          onCreate={createWorkspace}
          onRename={renameActiveWorkspace}
          onDelete={deleteActiveWorkspace}
        />
      </section>

      <section className="toolbar" aria-label={t("header.layoutControls")}>
        <div className="layout-segment" aria-label={t("header.chooseLayout")}>
          {[
            { value: 1, label: t("header.focus") },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
          ].map((item) => {
            const isActiveLayout = activeWorkspace.columns === item.value;

            return (
              <button
                key={item.value}
                type="button"
                className={isActiveLayout ? "segment active" : "segment"}
                onClick={() => setColumns(item.value)}
                aria-label={`Use ${item.label} column layout`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <details
          className="new-pane-menu"
          open={isNewPaneMenuOpen}
          onToggle={(event) => setIsNewPaneMenuOpen(event.currentTarget.open)}
        >
          <summary>{t("header.newPane")}</summary>
          <div className="preset-menu profile-menu" aria-label={t("header.chooseProfile")}>
            {state.profiles.map((profile) => (
              <div className="profile-row" key={profile.id} role="none">
                <button
                  type="button"
                  className="profile-pick"
                  onClick={() => {
                    addBlankPaneWithProfile(profile);
                    setIsNewPaneMenuOpen(false);
                  }}
                >
                  <span className="profile-dot" aria-hidden="true">●</span>
                  <span className="profile-pick-name">{profile.name}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    renameProfile(profile.id);
                  }}
                  aria-label={t("header.renameProfile", { name: profile.name })}
                  title={t("header.rename")}
                >
                  <IconEdit size={11} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteProfile(profile.id);
                  }}
                  aria-label={t("header.deleteProfile", { name: profile.name })}
                  title={t("header.deleteProfileTitle")}
                >
                  <IconTrash size={11} />
                </button>
              </div>
            ))}
            <div className="menu-separator" role="separator" />
            <button
              type="button"
              className="profile-pick profile-create"
              onClick={() => {
                setIsNewPaneMenuOpen(false);
                openTextPrompt({
                  title: t("header.newProfileTitle"),
                  initial: "",
                  placeholder: t("header.newProfilePlaceholder"),
                  onSubmit: (name) => {
                    const profile = ensureProfileWithName(name);
                    addBlankPaneWithProfile(profile);
                  },
                });
              }}
            >
              <span className="profile-dot" aria-hidden="true">
                <IconPlus size={11} />
              </span>
              <span>{t("header.newProfile")}</span>
            </button>
          </div>
        </details>
        <button
          type="button"
          className="theme-toggle downloads-button"
          onClick={() => setIsDownloadsOpen((open) => !open)}
          aria-label={t("downloads.title")}
          title={t("downloads.title")}
        >
          <IconDownload size={14} />
          {hasActiveDownload && <span className="downloads-button-dot" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setIsSettingsOpen(true)}
          aria-label={t("header.openSettings")}
          title="Settings"
        >
          <IconSettings size={14} />
        </button>
      </section>
    </header>
  );
}
