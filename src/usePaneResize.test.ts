import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { usePaneResize, type UsePaneResizeArgs } from "./hooks/usePaneResize";
import { MIN_TRACK_FRACTION, type Workspace } from "./appCore";

/**
 * Manual animation-frame queue. The hook coalesces commits onto frames, so the
 * tests need to decide exactly when a frame runs to observe the coalescing.
 */
let frames: Array<(() => void) | null>;

function runFrames() {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame?.();
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) =>
      frames.push(() => callback(0)) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames[handle - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: "ws", name: "WS", columns: 2, panes: [], ...overrides };
}

function setup(overrides: Partial<UsePaneResizeArgs> = {}) {
  const commits: Workspace[] = [];
  const updateActiveWorkspace = vi.fn((updater: (workspace: Workspace) => Workspace) => {
    commits.push(updater(makeWorkspace()));
  });

  const hook = renderHook(() =>
    usePaneResize({
      updateActiveWorkspace,
      colSizes: [0.5, 0.5],
      rowSizes: [1],
      effectiveColumns: 2,
      effectiveRows: 1,
      ...overrides,
    }),
  );

  return { ...hook, commits, updateActiveWorkspace };
}

/** Attach a grid element of a known size so pixel deltas map to fractions. */
function attachGrid(
  gridRef: React.MutableRefObject<HTMLElement | null>,
  size = { width: 1000, height: 500 },
) {
  const grid = document.createElement("div");
  grid.getBoundingClientRect = () =>
    ({ width: size.width, height: size.height, top: 0, left: 0 }) as DOMRect;
  gridRef.current = grid;
  return grid;
}

function pointerDownEvent(
  clientX: number,
  clientY: number,
  pointerId = 1,
): ReactPointerEvent<HTMLElement> {
  const setPointerCapture = vi.fn();
  return {
    button: 0,
    pointerId,
    clientX,
    clientY,
    currentTarget: { setPointerCapture } as unknown as HTMLElement,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLElement>;
}

function movePointer(clientX: number, clientY: number, pointerId = 1) {
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX, clientY, pointerId, bubbles: true }),
  );
}

function releasePointer(type: "pointerup" | "pointercancel" = "pointerup", pointerId = 1) {
  window.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));
}

describe("usePaneResize", () => {
  it("starts with no active splitter", () => {
    const { result } = setup();
    expect(result.current.activeSplitter).toBeNull();
  });

  it("marks the dragged boundary active on pointerdown", () => {
    const { result } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));

    expect(result.current.activeSplitter).toEqual({ axis: "col", index: 0 });
  });

  it("ignores a non-primary button", () => {
    const { result } = setup();
    attachGrid(result.current.gridRef);
    const event = { ...pointerDownEvent(500, 250), button: 2 } as ReactPointerEvent<HTMLElement>;

    act(() => result.current.beginSplitterDrag("col", 0, event));

    expect(result.current.activeSplitter).toBeNull();
  });

  it("ignores a drag when the grid is not mounted", () => {
    const { result } = setup();

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));

    expect(result.current.activeSplitter).toBeNull();
  });

  it("ignores a drag when the grid has collapsed to zero length", () => {
    const { result } = setup();
    attachGrid(result.current.gridRef, { width: 0, height: 0 });

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(0, 0)));

    expect(result.current.activeSplitter).toBeNull();
  });

  it("converts pixel movement into a track fraction of the grid width", () => {
    const { result, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(600, 250));
    act(() => runFrames());

    // +100px over a 1000px axis = +0.1 to the left track.
    expect(commits).toHaveLength(1);
    expect(commits[0].colSizes![0]).toBeCloseTo(0.6);
    expect(commits[0].colSizes![1]).toBeCloseTo(0.4);
    expect(commits[0].rowSizes).toBeUndefined();
  });

  it("uses the grid height for a row drag", () => {
    const { result, commits } = setup({ rowSizes: [0.5, 0.5], effectiveRows: 2 });
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("row", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(500, 300));
    act(() => runFrames());

    // +50px over a 500px axis = +0.1 to the top track.
    expect(commits[0].rowSizes![0]).toBeCloseTo(0.6);
    expect(commits[0].colSizes).toBeUndefined();
  });

  it("coalesces several moves within one frame into a single commit", () => {
    const { result, updateActiveWorkspace, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => {
      movePointer(520, 250);
      movePointer(560, 250);
      movePointer(600, 250);
    });

    // Nothing written yet: the frame has not run.
    expect(updateActiveWorkspace).not.toHaveBeenCalled();

    act(() => runFrames());

    // One write, holding the last position rather than the first.
    expect(updateActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(commits[0].colSizes![0]).toBeCloseTo(0.6);
  });

  it("commits once per frame across frames", () => {
    const { result, updateActiveWorkspace } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(550, 250));
    act(() => runFrames());
    act(() => movePointer(600, 250));
    act(() => runFrames());

    expect(updateActiveWorkspace).toHaveBeenCalledTimes(2);
  });

  it("flushes the pending frame on pointerup so the final position is kept", () => {
    const { result, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(700, 250));
    // Release before the scheduled frame ever runs.
    act(() => releasePointer());

    expect(commits).toHaveLength(1);
    expect(commits[0].colSizes![0]).toBeCloseTo(0.7);
    expect(result.current.activeSplitter).toBeNull();

    // The cancelled frame must not commit a second time.
    act(() => runFrames());
    expect(commits).toHaveLength(1);
  });

  it("flushes and ends the drag on pointercancel", () => {
    const { result, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(650, 250));
    act(() => releasePointer("pointercancel"));

    expect(commits).toHaveLength(1);
    expect(commits[0].colSizes![0]).toBeCloseTo(0.65);
    expect(result.current.activeSplitter).toBeNull();
  });

  it("does not commit on pointerup when the pointer never moved", () => {
    const { result, updateActiveWorkspace } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => releasePointer());

    expect(updateActiveWorkspace).not.toHaveBeenCalled();
    expect(result.current.activeSplitter).toBeNull();
  });

  it("ignores pointer events from a different pointer", () => {
    const { result, updateActiveWorkspace } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250, 1)));
    act(() => movePointer(700, 250, 2));
    act(() => runFrames());

    expect(updateActiveWorkspace).not.toHaveBeenCalled();
    // A second pointer's release must not end the drag either.
    act(() => releasePointer("pointerup", 2));
    expect(result.current.activeSplitter).toEqual({ axis: "col", index: 0 });
  });

  it("stops tracking the pointer after the drag ends", () => {
    const { result, updateActiveWorkspace } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => releasePointer());
    act(() => movePointer(900, 250));
    act(() => runFrames());

    expect(updateActiveWorkspace).not.toHaveBeenCalled();
  });

  it("clamps a drag past the edge at MIN_TRACK_FRACTION", () => {
    const { result, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(-5000, 250));
    act(() => runFrames());

    expect(commits[0].colSizes![0]).toBeCloseTo(MIN_TRACK_FRACTION);
  });

  it("measures from the sizes captured at drag start, not the committed ones", () => {
    // startSizes is a snapshot, so a move to the same position twice yields the
    // same result instead of compounding.
    const { result, commits } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(600, 250));
    act(() => runFrames());
    act(() => movePointer(600, 250));
    act(() => runFrames());

    expect(commits[1].colSizes![0]).toBeCloseTo(0.6);
  });

  describe("nudgeSplitter", () => {
    it("commits a column nudge immediately, without waiting for a frame", () => {
      const { result, commits, updateActiveWorkspace } = setup();

      act(() => result.current.nudgeSplitter("col", 0, 0.02));

      expect(updateActiveWorkspace).toHaveBeenCalledTimes(1);
      expect(commits[0].colSizes![0]).toBeCloseTo(0.52);
      expect(commits[0].colSizes![1]).toBeCloseTo(0.48);
    });

    it("commits a row nudge on the row axis", () => {
      const { result, commits } = setup({ rowSizes: [0.5, 0.5], effectiveRows: 2 });

      act(() => result.current.nudgeSplitter("row", 0, -0.02));

      expect(commits[0].rowSizes![0]).toBeCloseTo(0.48);
      expect(commits[0].colSizes).toBeUndefined();
    });

    it("does not commit when the boundary cannot move", () => {
      const { result, updateActiveWorkspace } = setup({ colSizes: [1] });

      // Single track: no boundary to nudge.
      act(() => result.current.nudgeSplitter("col", 0, 0.02));
      expect(updateActiveWorkspace).not.toHaveBeenCalled();

      // Already clamped, so a further push changes nothing.
      const clamped = setup({ colSizes: [MIN_TRACK_FRACTION, 1 - MIN_TRACK_FRACTION] });
      act(() => clamped.result.current.nudgeSplitter("col", 0, -0.02));
      expect(clamped.updateActiveWorkspace).not.toHaveBeenCalled();
    });

    it("reads the latest sizes rather than the ones from first render", () => {
      const commits: Workspace[] = [];
      const updateActiveWorkspace = vi.fn((updater: (workspace: Workspace) => Workspace) => {
        commits.push(updater(makeWorkspace()));
      });
      const { result, rerender } = renderHook(
        ({ colSizes }: { colSizes: number[] }) =>
          usePaneResize({
            updateActiveWorkspace,
            colSizes,
            rowSizes: [1],
            effectiveColumns: 2,
            effectiveRows: 1,
          }),
        { initialProps: { colSizes: [0.5, 0.5] } },
      );

      rerender({ colSizes: [0.8, 0.2] });
      act(() => result.current.nudgeSplitter("col", 0, -0.05));

      expect(commits[0].colSizes![0]).toBeCloseTo(0.75);
    });
  });

  describe("resetTrackSizes", () => {
    it("writes an even split on both axes", () => {
      const { result, commits } = setup({
        colSizes: [0.8, 0.2],
        rowSizes: [0.7, 0.3],
        effectiveColumns: 2,
        effectiveRows: 2,
      });

      act(() => result.current.resetTrackSizes());

      expect(commits[0].colSizes).toEqual([0.5, 0.5]);
      expect(commits[0].rowSizes).toEqual([0.5, 0.5]);
    });

    it("follows the effective track counts, not the stored array lengths", () => {
      const { result, commits } = setup({
        colSizes: [0.8, 0.2],
        rowSizes: [1],
        effectiveColumns: 4,
        effectiveRows: 1,
      });

      act(() => result.current.resetTrackSizes());

      expect(commits[0].colSizes).toEqual([0.25, 0.25, 0.25, 0.25]);
      expect(commits[0].rowSizes).toEqual([1]);
    });
  });

  it("cancels a pending frame on unmount", () => {
    const { result, unmount, updateActiveWorkspace } = setup();
    attachGrid(result.current.gridRef);

    act(() => result.current.beginSplitterDrag("col", 0, pointerDownEvent(500, 250)));
    act(() => movePointer(700, 250));
    unmount();
    runFrames();

    expect(updateActiveWorkspace).not.toHaveBeenCalled();
  });
});
