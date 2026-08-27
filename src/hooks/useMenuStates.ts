import { useEffect, useState } from "react";

export interface UseMenuStatesResult {
  isNewPaneMenuOpen: boolean;
  setIsNewPaneMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isWorkspaceMenuOpen: boolean;
  setIsWorkspaceMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isDownloadsOpen: boolean;
  setIsDownloadsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Pane whose overflow menu is open, or null. Lifted here so the native
   * webviews can be suspended while it is showing — otherwise the child
   * webview would paint over the dropdown. */
  openPaneMenuId: string | null;
  setOpenPaneMenuId: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Owns boolean open/close state for top-level dropdown menus and modals,
 * plus a single click-outside handler that closes them as needed.
 */
export function useMenuStates(): UseMenuStatesResult {
  const [isNewPaneMenuOpen, setIsNewPaneMenuOpen] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openPaneMenuId, setOpenPaneMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!isNewPaneMenuOpen && !isWorkspaceMenuOpen && !isDownloadsOpen && !openPaneMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      if (isNewPaneMenuOpen && !target.closest(".new-pane-menu")) {
        setIsNewPaneMenuOpen(false);
      }
      if (isWorkspaceMenuOpen && !target.closest(".workspace-switcher")) {
        setIsWorkspaceMenuOpen(false);
      }
      if (openPaneMenuId && !target.closest(".pane-menu")) {
        setOpenPaneMenuId(null);
      }
      if (
        isDownloadsOpen &&
        !target.closest(".downloads-panel") &&
        !target.closest(".downloads-button")
      ) {
        setIsDownloadsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isNewPaneMenuOpen, isWorkspaceMenuOpen, isDownloadsOpen, openPaneMenuId]);

  return {
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
  };
}
