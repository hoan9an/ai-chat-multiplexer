import type { MutableRefObject } from "react";
import {
  getGutterTrack,
  getPaneGridPosition,
  getTotalTracks,
  toSplitGridTemplate,
  type ChatPane,
  type Profile,
} from "../appCore";
import { useTranslation } from "../i18n";
import { Pane } from "./Pane";
import type { SplitterAxis } from "../hooks/usePaneResize";

export interface PaneGridProps {
  visiblePanes: ChatPane[];
  activePanes: ChatPane[];
  effectiveColumns: number;
  effectiveRows: number;
  colSizes: number[];
  rowSizes: number[];
  focusedPaneId: string | null;
  dragOverPaneId: string | null;
  draggingTabKey: string | null;
  tabDragOver: { paneId: string; tabId: string | null; before: boolean } | null;
  editingUrls: Record<string, string>;
  paneDrag: MutableRefObject<{
    paneId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>;
  tabDrag: MutableRefObject<{
    paneId: string;
    tabId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>;
  webviewShells: MutableRefObject<Record<string, HTMLDivElement | null>>;

  // Resize
  gridRef: MutableRefObject<HTMLElement | null>;
  activeSplitter: { axis: SplitterAxis; index: number } | null;
  beginSplitterDrag: (
    axis: SplitterAxis,
    index: number,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
  nudgeSplitter: (axis: SplitterAxis, index: number, delta: number) => void;
  resetTrackSizes: () => void;

  /** Pane whose overflow menu is open, lifted so native webviews can suspend. */
  openPaneMenuId: string | null;
  setOpenPaneMenuId: (id: string | null) => void;

  getProfileById: (profileId: string) => Profile | undefined;
  setFocusedPaneId: (id: string | null) => void;
  setDraggingPaneId: (id: string | null) => void;
  setDragOverPaneId: (id: string | null) => void;
  setDraggingTabKey: (key: string | null) => void;
  setTabDragOver: (
    drag: { paneId: string; tabId: string | null; before: boolean } | null,
  ) => void;
  setEditingUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addTab: (paneId: string) => void;
  removeTab: (paneId: string, tabId: string) => void;
  removePane: (paneId: string) => void;
  updateActivePane: (paneId: string, updater: (pane: ChatPane) => ChatPane) => void;
  navigateActiveWebview: (
    paneId: string,
    tab: ChatPane["tabs"][number],
    action: "back" | "forward" | "reload",
  ) => void;
  startEditingUrl: (paneId: string, tab: ChatPane["tabs"][number]) => void;
  updateEditingUrl: (paneId: string, tabId: string, value: string) => void;
  commitTabUrl: (paneId: string, tabId: string) => void;
  finishPaneDrag: (clientX: number, clientY: number) => void;
  moveTabWithinPane: (
    paneId: string,
    sourceTabId: string,
    targetTabId: string,
    before: boolean,
  ) => void;
  moveTabAcrossPanes: (
    sourcePaneId: string,
    sourceTabId: string,
    targetPaneId: string,
    targetTabId: string | null,
    before: boolean,
  ) => void;
  detachTabToNewPane: (sourcePaneId: string, sourceTabId: string) => void;

  // Pane-level actions surfaced in the pane menu
  renamePane: (paneId: string) => void;
  duplicatePane: (paneId: string) => void;
  splitPane: (paneId: string) => void;
  movePaneProfile: (paneId: string, profileId: string) => void;
  copyActiveTabUrl: (paneId: string) => void;
  openActiveTabExternally: (paneId: string) => void;
  profiles: Profile[];
}

/** Keyboard step for a splitter nudge, as a fraction of the axis. */
const SPLITTER_KEY_STEP = 0.02;

export function PaneGrid(props: PaneGridProps) {
  const {
    visiblePanes,
    activePanes,
    effectiveColumns,
    effectiveRows,
    colSizes,
    rowSizes,
    focusedPaneId,
    dragOverPaneId,
    draggingTabKey,
    tabDragOver,
    editingUrls,
    paneDrag,
    tabDrag,
    webviewShells,
    gridRef,
    activeSplitter,
    beginSplitterDrag,
    nudgeSplitter,
    resetTrackSizes,
    openPaneMenuId,
    setOpenPaneMenuId,
    getProfileById,
    setFocusedPaneId,
    setDraggingPaneId,
    setDragOverPaneId,
    setDraggingTabKey,
    setTabDragOver,
    setEditingUrls,
    addTab,
    removeTab,
    removePane,
    updateActivePane,
    navigateActiveWebview,
    startEditingUrl,
    updateEditingUrl,
    commitTabUrl,
    finishPaneDrag,
    moveTabWithinPane,
    moveTabAcrossPanes,
    detachTabToNewPane,
    renamePane,
    duplicatePane,
    splitPane,
    movePaneProfile,
    copyActiveTabUrl,
    openActiveTabExternally,
    profiles,
  } = props;
  const { t } = useTranslation();

  const isFocusMode = Boolean(focusedPaneId);
  // Focus mode collapses to a single full-size pane, so no gutters or splitters
  // are laid out and the workspace's stored track sizes are left alone.
  const columnTemplate = isFocusMode ? undefined : toSplitGridTemplate(colSizes);
  const rowTemplate = isFocusMode ? undefined : toSplitGridTemplate(rowSizes);

  function renderSplitter(axis: SplitterAxis, index: number) {
    const isVertical = axis === "col";
    const isActive = activeSplitter?.axis === axis && activeSplitter.index === index;
    const track = getGutterTrack(index);

    return (
      <div
        key={`${axis}-${index}`}
        className={`pane-splitter pane-splitter-${axis}${isActive ? " pane-splitter-active" : ""}`}
        style={
          isVertical
            ? { gridColumn: track, gridRow: `1 / ${getTotalTracks(effectiveRows) + 1}` }
            : { gridRow: track, gridColumn: `1 / ${getTotalTracks(effectiveColumns) + 1}` }
        }
        role="separator"
        aria-orientation={isVertical ? "vertical" : "horizontal"}
        aria-label={
          isVertical
            ? t("pane.resizeColumns", { index: String(index + 1) })
            : t("pane.resizeRows", { index: String(index + 1) })
        }
        tabIndex={0}
        onPointerDown={(event) => beginSplitterDrag(axis, index, event)}
        onKeyDown={(event) => {
          const decrease = isVertical ? "ArrowLeft" : "ArrowUp";
          const increase = isVertical ? "ArrowRight" : "ArrowDown";
          if (event.key === decrease) {
            event.preventDefault();
            nudgeSplitter(axis, index, -SPLITTER_KEY_STEP);
          } else if (event.key === increase) {
            event.preventDefault();
            nudgeSplitter(axis, index, SPLITTER_KEY_STEP);
          }
        }}
      >
        <span className="pane-splitter-grip" aria-hidden="true" />
      </div>
    );
  }

  return (
    <section
      ref={(element) => {
        gridRef.current = element;
      }}
      className={`split-grid columns-${effectiveColumns} ${isFocusMode ? "focus-mode" : ""}${
        activeSplitter ? " split-grid-resizing" : ""
      }`}
      style={
        isFocusMode
          ? undefined
          : { gridTemplateColumns: columnTemplate, gridTemplateRows: rowTemplate }
      }
    >
      {visiblePanes.map((pane, index) => {
        const position = isFocusMode
          ? undefined
          : getPaneGridPosition(index, effectiveColumns);

        return (
          <Pane
            key={pane.id}
            pane={pane}
            index={index}
            gridColumn={position?.column}
            gridRow={position?.row}
            paneProfile={getProfileById(pane.profileId)}
            profiles={profiles}
            activePanes={activePanes}
            isFocused={focusedPaneId === pane.id}
            focusedPaneId={focusedPaneId}
            dragOverPaneId={dragOverPaneId}
            draggingTabKey={draggingTabKey}
            tabDragOver={tabDragOver}
            editingUrls={editingUrls}
            isMenuOpen={openPaneMenuId === pane.id}
            paneDrag={paneDrag}
            tabDrag={tabDrag}
            registerShellRef={(paneId, element) => {
              webviewShells.current[paneId] = element;
            }}
            setFocusedPaneId={setFocusedPaneId}
            setDraggingPaneId={setDraggingPaneId}
            setDragOverPaneId={setDragOverPaneId}
            setDraggingTabKey={setDraggingTabKey}
            setTabDragOver={setTabDragOver}
            setEditingUrls={setEditingUrls}
            setMenuOpen={(open) => setOpenPaneMenuId(open ? pane.id : null)}
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
            resetTrackSizes={resetTrackSizes}
          />
        );
      })}

      {!isFocusMode &&
        Array.from({ length: Math.max(0, effectiveColumns - 1) }, (_, index) =>
          renderSplitter("col", index),
        )}
      {!isFocusMode &&
        Array.from({ length: Math.max(0, effectiveRows - 1) }, (_, index) =>
          renderSplitter("row", index),
        )}
    </section>
  );
}
