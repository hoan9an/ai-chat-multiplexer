import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "./appCore";
import type { AlertDialogOptions } from "./types/dialogs";

let eventHandler: ((event: { payload: unknown }) => void) | undefined;
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_name: string, handler: (event: { payload: unknown }) => void) => {
    eventHandler = handler;
    return Promise.resolve(unlisten);
  }),
}));

vi.mock("./appCore", async () => {
  const actual = await vi.importActual<typeof import("./appCore")>("./appCore");
  return { ...actual, isTauriRuntime: () => true };
});

import {
  routeNativeNewWindow,
  useNativeNewWindowRequests,
  type NativeNewWindowRequest,
} from "./hooks/useNativeNewWindowRequests";
import { LanguageProvider } from "./i18n";

function state(): AppState {
  return {
    activeWorkspaceId: "ws-1",
    profiles: [{ id: "prof-default", name: "Default" }],
    workspaces: [
      {
        id: "ws-1",
        name: "Workspace",
        columns: 1,
        panes: [
          {
            id: "pane-1",
            title: "Pane",
            profileId: "prof-default",
            activeTabId: "source",
            tabs: [
              {
                id: "source",
                title: "Source",
                url: "https://source.test",
                loadedUrl: "https://source.test",
              },
              {
                id: "after",
                title: "After",
                url: "https://after.test",
                loadedUrl: "https://after.test",
              },
            ],
          },
        ],
      },
    ],
  };
}

function request(overrides: Partial<NativeNewWindowRequest> = {}): NativeNewWindowRequest {
  return {
    kind: "openTab",
    sourceLabel: "tab-source",
    url: "https://popup.test/path?state=kept#callback",
    reason: "https",
    timestampMs: 1,
    ...overrides,
  };
}

describe("routeNativeNewWindow", () => {
  it("inserts the popup after its source and keeps the pane profile", () => {
    const next = routeNativeNewWindow(state(), request());
    const pane = next.workspaces[0].panes[0];
    expect(pane.tabs).toHaveLength(3);
    expect(pane.tabs[1].url).toBe("https://popup.test/path?state=kept#callback");
    expect(pane.activeTabId).toBe(pane.tabs[1].id);
    expect(pane.profileId).toBe("prof-default");
  });

  it("does not mutate state for blocked, invalid, or stale-source requests", () => {
    const initial = state();
    expect(routeNativeNewWindow(initial, request({ kind: "blocked", url: null }))).toBe(initial);
    expect(routeNativeNewWindow(initial, request({ url: "javascript:alert(1)" }))).toBe(initial);
    expect(routeNativeNewWindow(initial, request({ sourceLabel: "tab-missing" }))).toBe(initial);
  });
});

describe("useNativeNewWindowRequests", () => {
  beforeEach(() => {
    eventHandler = undefined;
    unlisten.mockReset();
  });

  it("routes openTab events and shows a message for denied popups", () => {
    const alerts: Array<AlertDialogOptions | null> = [];
    const { result } = renderHook(
      () => {
        const [value, setValue] = useState(state());
        useNativeNewWindowRequests({
          setState: setValue,
          setAlertDialog: (dialog) => alerts.push(dialog),
        });
        return value;
      },
      { wrapper: LanguageProvider },
    );

    act(() => eventHandler?.({ payload: request() }));
    expect(result.current.workspaces[0].panes[0].tabs).toHaveLength(3);

    act(() =>
      eventHandler?.({
        payload: request({ kind: "blocked", url: null, reason: "blankPopup" }),
      }),
    );
    expect(alerts.at(-1)?.title).toBe("Popup đã bị chặn");
  });
});
