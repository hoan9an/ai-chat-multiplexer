import {
  countGridRows,
  createEvenTrackSizes,
  normalizeTrackSizes,
  type AppState,
  type ChatPane,
  type Workspace,
} from "../appCore";

export interface UseDerivedWorkspaceStateArgs {
  state: AppState;
  focusedPaneId: string | null;
  isNewPaneMenuOpen: boolean;
  isWorkspaceMenuOpen: boolean;
  isSettingsOpen: boolean;
  isDownloadsOpen: boolean;
  openPaneMenuId: string | null;
  draggingPaneId: string | null;
  draggingTabKey: string | null;
  textPrompt: unknown | null;
  confirmDialog: unknown | null;
  alertDialog: unknown | null;
}

export interface UseDerivedWorkspaceStateResult {
  activeWorkspace: Workspace;
  activePanes: ChatPane[];
  visiblePanes: ChatPane[];
  effectiveColumns: number;
  effectiveRows: number;
  colSizes: number[];
  rowSizes: number[];
  shouldSuspendNativeWebviews: boolean;
}

/**
 * Derives workspace-related view-model values from the source state plus UI flags.
 *
 * Returns:
 * - activeWorkspace: current workspace (or first as fallback)
 * - activePanes: panes in active workspace
 * - visiblePanes: filtered to focused pane when focus mode is active
 * - effectiveColumns: clamped column count (1 in focus mode)
 * - effectiveRows: row count the visible panes occupy at that column count
 * - colSizes/rowSizes: track fractions for the grid template, evenly split when
 *   the workspace has no stored sizes or the stored length no longer matches
 * - shouldSuspendNativeWebviews: any modal/menu/drag is suspending native overlays
 */
export function useDerivedWorkspaceState(
  args: UseDerivedWorkspaceStateArgs,
): UseDerivedWorkspaceStateResult {
  const {
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
  } = args;

  const activeWorkspace =
    state.workspaces.find((ws) => ws.id === state.activeWorkspaceId) ?? state.workspaces[0];
  const activePanes = activeWorkspace.panes;
  const visiblePanes = focusedPaneId
    ? activePanes.filter((pane) => pane.id === focusedPaneId)
    : activePanes;
  const effectiveColumns = focusedPaneId
    ? 1
    : Math.max(1, Math.min(activeWorkspace.columns, activePanes.length));
  const effectiveRows = countGridRows(visiblePanes.length, effectiveColumns);
  // Focus mode renders a single pane, so its tracks are always a full-size 1x1
  // and the workspace's stored sizes stay untouched until focus is released.
  const colSizes = focusedPaneId
    ? createEvenTrackSizes(1)
    : normalizeTrackSizes(activeWorkspace.colSizes, effectiveColumns);
  const rowSizes = focusedPaneId
    ? createEvenTrackSizes(1)
    : normalizeTrackSizes(activeWorkspace.rowSizes, effectiveRows);
  const shouldSuspendNativeWebviews =
    isNewPaneMenuOpen ||
    isWorkspaceMenuOpen ||
    draggingPaneId !== null ||
    textPrompt !== null ||
    confirmDialog !== null ||
    alertDialog !== null ||
    isSettingsOpen ||
    isDownloadsOpen ||
    openPaneMenuId !== null ||
    draggingTabKey !== null;

  return {
    activeWorkspace,
    activePanes,
    visiblePanes,
    effectiveColumns,
    effectiveRows,
    colSizes,
    rowSizes,
    shouldSuspendNativeWebviews,
  };
}
