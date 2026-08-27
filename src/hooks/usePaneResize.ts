import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEvenTrackSizes,
  resizeTrackSizes,
  type Workspace,
} from "../appCore";

export type SplitterAxis = "col" | "row";

export interface ActiveSplitterDrag {
  axis: SplitterAxis;
  /** Boundary index: the drag moves the edge between track `index` and `index + 1`. */
  index: number;
  pointerId: number;
  /** Length of the whole axis in px, used to convert pixel movement to fractions. */
  axisLength: number;
  startPosition: number;
  startSizes: number[];
}

export interface UsePaneResizeArgs {
  updateActiveWorkspace: (updater: (workspace: Workspace) => Workspace) => void;
  colSizes: number[];
  rowSizes: number[];
  effectiveColumns: number;
  effectiveRows: number;
}

export interface UsePaneResizeResult {
  /** Non-null while a splitter is being dragged; drives the splitter's active style. */
  activeSplitter: { axis: SplitterAxis; index: number } | null;
  gridRef: React.MutableRefObject<HTMLElement | null>;
  beginSplitterDrag: (
    axis: SplitterAxis,
    index: number,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
  /** Move a boundary by a fixed fraction; used by keyboard splitter controls. */
  nudgeSplitter: (axis: SplitterAxis, index: number, delta: number) => void;
  resetTrackSizes: () => void;
}

/**
 * Owns splitter drag for the pane grid.
 *
 * A pointer move is converted to a fraction of the grid's own width/height and
 * applied to the two tracks adjacent to the dragged boundary. Writes are
 * coalesced onto animation frames: native child webviews are repositioned by
 * `useNativeWebviews` in response to the state change, so committing more often
 * than once per frame would only add IPC without adding smoothness.
 */
export function usePaneResize({
  updateActiveWorkspace,
  colSizes,
  rowSizes,
  effectiveColumns,
  effectiveRows,
}: UsePaneResizeArgs): UsePaneResizeResult {
  const gridRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<ActiveSplitterDrag | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingSizesRef = useRef<number[] | null>(null);
  const [activeSplitter, setActiveSplitter] = useState<{
    axis: SplitterAxis;
    index: number;
  } | null>(null);

  // Latest track sizes, read inside pointer handlers that are registered once.
  const sizesRef = useRef({ colSizes, rowSizes });
  sizesRef.current = { colSizes, rowSizes };

  const commitSizes = useCallback(
    (axis: SplitterAxis, sizes: number[]) => {
      updateActiveWorkspace((workspace) => ({
        ...workspace,
        ...(axis === "col" ? { colSizes: sizes } : { rowSizes: sizes }),
      }));
    },
    [updateActiveWorkspace],
  );

  const cancelPendingFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingSizesRef.current = null;
  }, []);

  const scheduleCommit = useCallback(
    (axis: SplitterAxis, sizes: number[]) => {
      pendingSizesRef.current = sizes;
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingSizesRef.current;
        pendingSizesRef.current = null;
        if (next) commitSizes(axis, next);
      });
    },
    [commitSizes],
  );

  const beginSplitterDrag = useCallback(
    (axis: SplitterAxis, index: number, event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const grid = gridRef.current;
      if (!grid) return;

      const rect = grid.getBoundingClientRect();
      const axisLength = axis === "col" ? rect.width : rect.height;
      if (axisLength < 1) return;

      const current = sizesRef.current;
      dragRef.current = {
        axis,
        index,
        pointerId: event.pointerId,
        axisLength,
        startPosition: axis === "col" ? event.clientX : event.clientY,
        startSizes: axis === "col" ? [...current.colSizes] : [...current.rowSizes],
      };
      setActiveSplitter({ axis, index });

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; the window-level listeners below still track
        // the pointer if it is unavailable.
      }
      event.preventDefault();
    },
    [],
  );

  // Pointer move/up are tracked on the window so a fast drag that outruns the
  // thin splitter element keeps resizing instead of stalling.
  useEffect(() => {
    if (!activeSplitter) return;

    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const position = drag.axis === "col" ? event.clientX : event.clientY;
      const delta = (position - drag.startPosition) / drag.axisLength;
      const next = resizeTrackSizes(drag.startSizes, drag.index, delta);
      scheduleCommit(drag.axis, next);
    };

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      // Flush the last scheduled frame so the final position is not dropped.
      const pending = pendingSizesRef.current;
      cancelPendingFrame();
      if (pending) commitSizes(drag.axis, pending);

      dragRef.current = null;
      setActiveSplitter(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [activeSplitter, cancelPendingFrame, commitSizes, scheduleCommit]);

  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  const resetTrackSizes = useCallback(() => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      colSizes: createEvenTrackSizes(effectiveColumns),
      rowSizes: createEvenTrackSizes(effectiveRows),
    }));
  }, [effectiveColumns, effectiveRows, updateActiveWorkspace]);

  const nudgeSplitter = useCallback(
    (axis: SplitterAxis, index: number, delta: number) => {
      const current = sizesRef.current;
      const sizes = axis === "col" ? current.colSizes : current.rowSizes;
      const next = resizeTrackSizes(sizes, index, delta);
      if (next === sizes) return;
      commitSizes(axis, next);
    },
    [commitSizes],
  );

  return { activeSplitter, gridRef, beginSplitterDrag, nudgeSplitter, resetTrackSizes };
}
