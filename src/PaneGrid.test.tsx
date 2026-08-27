import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import type { MutableRefObject } from "react";

// Mock Pane to avoid pulling in its deep dependency tree (Tauri webview, drag handlers, etc.)
vi.mock("./components/Pane", () => ({
  Pane: (props: {
    pane: { id: string; title: string };
    index: number;
    gridColumn?: number;
    gridRow?: number;
    registerShellRef?: (paneId: string, element: HTMLDivElement | null) => void;
  }) => (
    <div
      data-testid="pane"
      data-id={props.pane.id}
      data-index={props.index}
      data-grid-column={props.gridColumn ?? ""}
      data-grid-row={props.gridRow ?? ""}
    >
      <div ref={(element) => props.registerShellRef?.(props.pane.id, element)} />
      {props.pane.title}
    </div>
  ),
}));

import { PaneGrid, type PaneGridProps } from "./components/PaneGrid";
import type { ChatPane } from "./appCore";

afterEach(cleanup);

function makePane(id: string): ChatPane {
  return {
    id,
    title: `Title-${id}`,
    profileId: "prof-default",
    activeTabId: `${id}-t`,
    tabs: [
      {
        id: `${id}-t`,
        title: "T",
        url: "https://x",
        loadedUrl: "https://x",
      },
    ],
  };
}

function harnessProps(panes: ChatPane[], overrides: Partial<PaneGridProps> = {}) {
  return {
    panes,
    overrides,
  };
}

/** Every non-ref prop, so each test only has to state what it cares about. */
function baseProps(panes: ChatPane[]): Omit<
  PaneGridProps,
  "paneDrag" | "tabDrag" | "webviewShells" | "gridRef"
> {
  return {
    visiblePanes: panes,
    activePanes: panes,
    effectiveColumns: 2,
    effectiveRows: 1,
    colSizes: [0.5, 0.5],
    rowSizes: [1],
    focusedPaneId: null,
    dragOverPaneId: null,
    draggingTabKey: null,
    tabDragOver: null,
    editingUrls: {},
    activeSplitter: null,
    beginSplitterDrag: vi.fn(),
    nudgeSplitter: vi.fn(),
    resetTrackSizes: vi.fn(),
    openPaneMenuId: null,
    setOpenPaneMenuId: vi.fn(),
    getProfileById: () => ({ id: "prof-default", name: "Default" }),
    profiles: [{ id: "prof-default", name: "Default" }],
    setFocusedPaneId: vi.fn(),
    setDraggingPaneId: vi.fn(),
    setDragOverPaneId: vi.fn(),
    setDraggingTabKey: vi.fn(),
    setTabDragOver: vi.fn(),
    setEditingUrls: vi.fn(),
    addTab: vi.fn(),
    removeTab: vi.fn(),
    removePane: vi.fn(),
    updateActivePane: vi.fn(),
    navigateActiveWebview: vi.fn(),
    startEditingUrl: vi.fn(),
    updateEditingUrl: vi.fn(),
    commitTabUrl: vi.fn(),
    finishPaneDrag: vi.fn(),
    moveTabWithinPane: vi.fn(),
    moveTabAcrossPanes: vi.fn(),
    detachTabToNewPane: vi.fn(),
    renamePane: vi.fn(),
    duplicatePane: vi.fn(),
    splitPane: vi.fn(),
    movePaneProfile: vi.fn(),
    copyActiveTabUrl: vi.fn(),
    openActiveTabExternally: vi.fn(),
  };
}

function Harness({
  panes,
  overrides,
}: {
  panes: ChatPane[];
  overrides: Partial<PaneGridProps>;
}) {
  const paneDrag = useRef(null) as MutableRefObject<PaneGridProps["paneDrag"]["current"]>;
  const tabDrag = useRef(null) as MutableRefObject<PaneGridProps["tabDrag"]["current"]>;
  const webviewShells = useRef<Record<string, HTMLDivElement | null>>(
    {},
  ) as MutableRefObject<Record<string, HTMLDivElement | null>>;
  const gridRef = useRef<HTMLElement | null>(null);

  const props: PaneGridProps = {
    ...baseProps(panes),
    paneDrag,
    tabDrag,
    webviewShells,
    gridRef,
    ...overrides,
  };
  return <PaneGrid {...props} />;
}

describe("PaneGrid", () => {
  it("renders one Pane per visiblePane in the supplied order", () => {
    const panes = [makePane("p1"), makePane("p2"), makePane("p3")];
    const { container } = render(<Harness {...harnessProps(panes)} />);
    const ids = Array.from(container.querySelectorAll("[data-testid=pane]")).map(
      (el) => el.getAttribute("data-id"),
    );
    expect(ids).toEqual(["p1", "p2", "p3"]);
  });

  it("passes the correct index prop to each Pane", () => {
    const panes = [makePane("a"), makePane("b")];
    const { container } = render(<Harness {...harnessProps(panes)} />);
    const indices = Array.from(container.querySelectorAll("[data-testid=pane]")).map(
      (el) => el.getAttribute("data-index"),
    );
    expect(indices).toEqual(["0", "1"]);
  });

  it("applies the columns-N modifier class based on effectiveColumns", () => {
    const panes = [makePane("p1")];
    const { container } = render(
      <Harness panes={panes} overrides={{ effectiveColumns: 3 }} />,
    );
    const grid = container.querySelector(".split-grid")!;
    expect(grid.className).toContain("columns-3");
    expect(grid.className).not.toContain("focus-mode");
  });

  it("adds focus-mode class when focusedPaneId is set", () => {
    const panes = [makePane("p1")];
    const { container } = render(
      <Harness panes={panes} overrides={{ focusedPaneId: "p1" }} />,
    );
    const grid = container.querySelector(".split-grid")!;
    expect(grid.className).toContain("focus-mode");
  });

  it("renders an empty grid when visiblePanes is empty", () => {
    const { container } = render(
      <Harness
        panes={[]}
        overrides={{ effectiveColumns: 1, effectiveRows: 0, colSizes: [1], rowSizes: [] }}
      />,
    );
    const grid = container.querySelector(".split-grid")!;
    expect(grid.children).toHaveLength(0);
  });

  it("only renders panes from visiblePanes (not activePanes when they differ)", () => {
    const all = [makePane("p1"), makePane("p2")];
    const visible = [all[0]];
    const { container } = render(
      <Harness panes={visible} overrides={{ activePanes: all }} />,
    );
    const ids = Array.from(container.querySelectorAll("[data-testid=pane]")).map(
      (el) => el.getAttribute("data-id"),
    );
    expect(ids).toEqual(["p1"]);
  });

  it("registers shell refs for each pane in webviewShells.current", () => {
    let capturedRef: MutableRefObject<Record<string, HTMLDivElement | null>> | null = null;
    function CapturingHarness() {
      const paneDrag = useRef(null) as MutableRefObject<PaneGridProps["paneDrag"]["current"]>;
      const tabDrag = useRef(null) as MutableRefObject<PaneGridProps["tabDrag"]["current"]>;
      const webviewShells = useRef<Record<string, HTMLDivElement | null>>(
        {},
      ) as MutableRefObject<Record<string, HTMLDivElement | null>>;
      const gridRef = useRef<HTMLElement | null>(null);
      capturedRef = webviewShells;
      const panes = [makePane("p1"), makePane("p2")];
      return (
        <PaneGrid
          {...baseProps(panes)}
          paneDrag={paneDrag}
          tabDrag={tabDrag}
          webviewShells={webviewShells}
          gridRef={gridRef}
        />
      );
    }
    render(<CapturingHarness />);
    expect(capturedRef).not.toBeNull();
    const refs = capturedRef!.current;
    expect(Object.keys(refs).sort()).toEqual(["p1", "p2"]);
    expect(refs.p1).not.toBeNull();
    expect(refs.p2).not.toBeNull();
  });

  it("places panes on odd grid tracks so gutters stay free for splitters", () => {
    const panes = [makePane("p1"), makePane("p2"), makePane("p3")];
    const { container } = render(
      <Harness panes={panes} overrides={{ effectiveColumns: 2, effectiveRows: 2 }} />,
    );
    const cells = Array.from(container.querySelectorAll("[data-testid=pane]")).map((el) => [
      el.getAttribute("data-grid-column"),
      el.getAttribute("data-grid-row"),
    ]);
    expect(cells).toEqual([
      ["1", "1"],
      ["3", "1"],
      ["1", "3"],
    ]);
  });

  it("renders one splitter per interior boundary on both axes", () => {
    const panes = [makePane("p1"), makePane("p2"), makePane("p3"), makePane("p4")];
    const { container } = render(
      <Harness panes={panes} overrides={{ effectiveColumns: 3, effectiveRows: 2 }} />,
    );
    expect(container.querySelectorAll(".pane-splitter-col")).toHaveLength(2);
    expect(container.querySelectorAll(".pane-splitter-row")).toHaveLength(1);
  });

  it("renders no splitters in focus mode", () => {
    const panes = [makePane("p1")];
    const { container } = render(
      <Harness panes={panes} overrides={{ focusedPaneId: "p1", effectiveColumns: 1 }} />,
    );
    expect(container.querySelectorAll(".pane-splitter")).toHaveLength(0);
  });

  it("marks the dragged splitter active", () => {
    const panes = [makePane("p1"), makePane("p2")];
    const { container } = render(
      <Harness panes={panes} overrides={{ activeSplitter: { axis: "col", index: 0 } }} />,
    );
    const splitter = container.querySelector(".pane-splitter-col")!;
    expect(splitter.className).toContain("pane-splitter-active");
    expect(container.querySelector(".split-grid")!.className).toContain(
      "split-grid-resizing",
    );
  });

  it("starts a splitter drag on pointerdown", () => {
    const beginSplitterDrag = vi.fn();
    const panes = [makePane("p1"), makePane("p2")];
    const { container } = render(
      <Harness panes={panes} overrides={{ beginSplitterDrag }} />,
    );
    fireEvent.pointerDown(container.querySelector(".pane-splitter-col")!);
    expect(beginSplitterDrag).toHaveBeenCalledWith("col", 0, expect.anything());
  });

  it("nudges a column splitter with arrow keys", () => {
    const nudgeSplitter = vi.fn();
    const panes = [makePane("p1"), makePane("p2")];
    const { container } = render(<Harness panes={panes} overrides={{ nudgeSplitter }} />);
    const splitter = container.querySelector(".pane-splitter-col")!;

    fireEvent.keyDown(splitter, { key: "ArrowRight" });
    expect(nudgeSplitter).toHaveBeenLastCalledWith("col", 0, 0.02);

    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(nudgeSplitter).toHaveBeenLastCalledWith("col", 0, -0.02);

    // Vertical keys belong to the row axis and must not move a column boundary.
    fireEvent.keyDown(splitter, { key: "ArrowUp" });
    expect(nudgeSplitter).toHaveBeenCalledTimes(2);
  });

  it("nudges a row splitter with vertical arrow keys", () => {
    const nudgeSplitter = vi.fn();
    const panes = [makePane("p1"), makePane("p2"), makePane("p3")];
    const { container } = render(
      <Harness
        panes={panes}
        overrides={{ nudgeSplitter, effectiveColumns: 2, effectiveRows: 2 }}
      />,
    );
    const splitter = container.querySelector(".pane-splitter-row")!;

    fireEvent.keyDown(splitter, { key: "ArrowDown" });
    expect(nudgeSplitter).toHaveBeenLastCalledWith("row", 0, 0.02);

    fireEvent.keyDown(splitter, { key: "ArrowUp" });
    expect(nudgeSplitter).toHaveBeenLastCalledWith("row", 0, -0.02);
  });

  it("applies the stored track fractions as the grid template", () => {
    const panes = [makePane("p1"), makePane("p2")];
    const { container } = render(
      <Harness panes={panes} overrides={{ colSizes: [0.7, 0.3], rowSizes: [1] }} />,
    );
    const grid = container.querySelector(".split-grid") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("minmax(0, 0.7fr) 6px minmax(0, 0.3fr)");
    expect(grid.style.gridTemplateRows).toBe("minmax(0, 1fr)");
  });
});
