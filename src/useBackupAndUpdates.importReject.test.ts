import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { vi as viDict } from "./i18n/vi";

// Isolated test file to cover the .catch arrows on dynamic import("@tauri-apps/plugin-fs")
// in useBackupAndUpdates.ts (anonymous_5 line 122, anonymous_7 line 164, anonymous_16 line 248).
// These arrows fire only when the dynamic plugin-fs import itself rejects — we force that
// here without affecting the main useBackupAndUpdates.test.ts mock setup.

const invokeSpy = vi.fn();
const rejectingCommands = new Set<string>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => {
    if (rejectingCommands.has(cmd)) {
      invokeSpy(cmd, args);
      return Promise.reject(new Error(`${cmd} forced rejection`));
    }
    return invokeSpy(cmd, args);
  },
}));

const dialogSave = vi.fn();
const dialogOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (opts: unknown) => dialogSave(opts),
  open: (opts: unknown) => dialogOpen(opts),
}));

// CRITICAL: make the plugin-fs import itself reject so the .catch arrow fires.
vi.mock("@tauri-apps/plugin-fs", () => {
  throw new Error("plugin-fs unavailable");
});

vi.mock("./appCore", async () => {
  const actual = await vi.importActual<typeof import("./appCore")>("./appCore");
  return {
    ...actual,
    isTauriRuntime: () => true,
  };
});

import { useBackupAndUpdates } from "./hooks/useBackupAndUpdates";
import type { AppState } from "./appCore";

function makeState(): AppState {
  return {
    workspaces: [
      {
        id: "ws1",
        name: "WS1",
        columns: 1,
        panes: [
          {
            id: "p1",
            title: "P1",
            profileId: "prof-default",
            activeTabId: "t1",
            tabs: [{ id: "t1", title: "Tab", url: "https://x", loadedUrl: "https://x" }],
          },
        ],
      },
    ],
    activeWorkspaceId: "ws1",
    profiles: [{ id: "prof-default", name: "Default" }],
  };
}

function setupHook() {
  const setState = vi.fn();
  const setFocusedPaneId = vi.fn();
  const setConfirmDialog = vi.fn();
  const setAlertDialog = vi.fn();
  const { result } = renderHook(() =>
    useBackupAndUpdates({
      state: makeState(),
      setState,
      setFocusedPaneId,
      setConfirmDialog,
      setAlertDialog,
    }),
  );
  invokeSpy.mockClear();
  return { result, setConfirmDialog, setAlertDialog };
}

describe("useBackupAndUpdates — dynamic plugin-fs import rejection", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    rejectingCommands.clear();
    dialogSave.mockReset();
    dialogOpen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exportConfigJson .catch returns null when plugin-fs import rejects (anonymous_5)", async () => {
    dialogSave.mockResolvedValue("C:/cfg.json");
    rejectingCommands.add("plugin:fs|write_text_file");
    const { result, setAlertDialog } = setupHook();
    await act(async () => {
      await result.current.exportConfigJson();
    });
    expect(setAlertDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: viDict["common.notice"],
        message: expect.stringMatching(/không khả dụng/),
      }),
    );
    expect(result.current.backupBusy).toBe("idle");
  });

  it("importConfigJson .catch returns null when plugin-fs import rejects (anonymous_7)", async () => {
    dialogOpen.mockResolvedValue("C:/cfg.json");
    const { result, setAlertDialog } = setupHook();
    await act(async () => {
      await result.current.importConfigJson();
    });
    expect(setAlertDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: viDict["common.notice"],
        message: expect.stringMatching(/không khả dụng/),
      }),
    );
    expect(result.current.backupBusy).toBe("idle");
  });

  it("exportFullBackup schedules safe startup backup without depending on plugin-fs", async () => {
    // Rust tự chọn đường dẫn và trả về; backup không còn phụ thuộc plugin-fs.
    invokeSpy.mockResolvedValue("C:/backup.zip");
    const { result, setConfirmDialog } = setupHook();
    await act(async () => {
      await result.current.exportFullBackup();
    });
    expect(invokeSpy).toHaveBeenCalledWith(
      "backup_sessions_zip",
      expect.objectContaining({ configJson: expect.stringContaining("workspaces") }),
    );
    expect(dialogSave).not.toHaveBeenCalled();
    expect(setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining("restart"),
    }));
    expect(result.current.backupBusy).toBe("idle");
  });
});
