import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { STORAGE_KEY, THEME_STORAGE_KEY } from "./appCore";

describe("useAppPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("returns default state when localStorage is empty", () => {
    const { result } = renderHook(() => useAppPersistence());
    expect(result.current.state.workspaces.length).toBeGreaterThan(0);
    expect(result.current.state.activeWorkspaceId).toBe(result.current.state.workspaces[0].id);
  });

  it("defaults theme to light when no saved theme", () => {
    const { result } = renderHook(() => useAppPersistence());
    expect(result.current.theme).toBe("light");
  });

  it("loads saved dark theme from localStorage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useAppPersistence());
    expect(result.current.theme).toBe("dark");
  });

  it("treats invalid theme value as light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon");
    const { result } = renderHook(() => useAppPersistence());
    expect(result.current.theme).toBe("light");
  });

  it("persists state to localStorage when state changes (after debounce)", () => {
    const { result } = renderHook(() => useAppPersistence());
    const initial = result.current.state;
    act(() => {
      result.current.setState({
        ...initial,
        workspaces: initial.workspaces.map((ws) =>
          ws.id === initial.activeWorkspaceId ? { ...ws, name: "Renamed" } : ws,
        ),
      });
    });
    // Trailing debounce: nothing is written until the timer fires.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    const updated = parsed.workspaces.find(
      (ws: { id: string }) => ws.id === initial.activeWorkspaceId,
    );
    expect(updated.name).toBe("Renamed");
  });

  it("coalesces rapid state changes into a single debounced write", () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useAppPersistence());
    const initial = result.current.state;
    setSpy.mockClear();

    // Three quick edits inside the debounce window → one state write.
    act(() => {
      result.current.setState({ ...initial });
    });
    act(() => {
      result.current.setState({ ...initial });
    });
    act(() => {
      result.current.setState({ ...initial });
    });
    // No state write yet (timer still pending).
    expect(setSpy.mock.calls.filter((c) => c[0] === STORAGE_KEY)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(setSpy.mock.calls.filter((c) => c[0] === STORAGE_KEY)).toHaveLength(1);
    setSpy.mockRestore();
  });

  it("does not persist the transient isLoading flag on tabs", () => {
    const { result } = renderHook(() => useAppPersistence());
    const initial = result.current.state;
    act(() => {
      result.current.setState({
        ...initial,
        workspaces: initial.workspaces.map((ws) =>
          ws.id === initial.activeWorkspaceId
            ? {
                ...ws,
                panes: ws.panes.map((pane, i) =>
                  i === 0
                    ? {
                        ...pane,
                        tabs: pane.tabs.map((tab) => ({ ...tab, isLoading: true })),
                      }
                    : pane,
                ),
              }
            : ws,
        ),
      });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // The serialized payload must not carry isLoading anywhere.
    expect(stored).not.toContain("isLoading");
    const parsed = JSON.parse(stored!);
    const ws = parsed.workspaces.find(
      (w: { id: string }) => w.id === initial.activeWorkspaceId,
    );
    expect(ws.panes[0].tabs[0].isLoading).toBeUndefined();
  });

  it("flushes the latest state on pagehide even mid-debounce", () => {
    const { result } = renderHook(() => useAppPersistence());
    const initial = result.current.state;
    act(() => {
      result.current.setState({
        ...initial,
        workspaces: initial.workspaces.map((ws) =>
          ws.id === initial.activeWorkspaceId ? { ...ws, name: "Flushed" } : ws,
        ),
      });
    });
    // Do NOT advance the timer — simulate the window closing first.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(stored!);
    const updated = parsed.workspaces.find(
      (ws: { id: string }) => ws.id === initial.activeWorkspaceId,
    );
    expect(updated.name).toBe("Flushed");
  });

  it("persists theme to localStorage when theme changes", () => {
    const { result } = renderHook(() => useAppPersistence());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("writes initial state to localStorage after the mount debounce", () => {
    renderHook(() => useAppPersistence());
    // Debounced: nothing written synchronously on mount.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("writes initial theme to localStorage on mount", () => {
    renderHook(() => useAppPersistence());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
