import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { expectCallWithMessage, nthCallFirstArgString } from "./test-utils";
import { vi as viDict } from "./i18n/vi";
import { en as enDict } from "./i18n/en";
import { zh as zhDict } from "./i18n/zh";

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

const writeTextFileSpy = vi.fn();
const readTextFileSpy = vi.fn();
const statSpy = vi.fn();
let writeTextFileExportNull = false;
let readTextFileExportNull = false;
vi.mock("@tauri-apps/plugin-fs", () => ({
  get writeTextFile() {
    return writeTextFileExportNull
      ? null
      : (p: string, c: string) => writeTextFileSpy(p, c);
  },
  get readTextFile() {
    return readTextFileExportNull ? null : (p: string) => readTextFileSpy(p);
  },
  stat: (p: string) => statSpy(p),
}));

const updaterCheck = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => updaterCheck(),
}));

const relaunchSpy = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunchSpy(),
}));

let tauriRuntime = false;
vi.mock("./appCore", async () => {
  const actual = await vi.importActual<typeof import("./appCore")>("./appCore");
  return {
    ...actual,
    isTauriRuntime: () => tauriRuntime,
  };
});

import { useBackupAndUpdates } from "./hooks/useBackupAndUpdates";
import { SettingsModal } from "./components/SettingsModal";
import type { AppState } from "./appCore";
import { APP_VERSION, STORAGE_KEY } from "./appCore";

function makeState(): AppState {
  return {
    workspaces: [
      {
        id: "ws1",
        name: "WS1",
        columns: 2,
        panes: [
          {
            id: "p1",
            title: "P1",
            profileId: "prof-default",
            activeTabId: "t1",
            tabs: [
              {
                id: "t1",
                title: "Tab",
                url: "https://example.com",
                loadedUrl: "https://example.com",
              },
            ],
          },
        ],
      },
    ],
    activeWorkspaceId: "ws1",
    profiles: [{ id: "prof-default", name: "Default" }],
  };
}

interface SetupResult {
  state: AppState;
  result: ReturnType<
    typeof renderHook<ReturnType<typeof useBackupAndUpdates>, unknown>
  >["result"];
  setStateSpy: ReturnType<typeof vi.fn>;
  setFocusedPaneId: ReturnType<typeof vi.fn>;
  setConfirmDialog: ReturnType<typeof vi.fn>;
  setAlertDialog: ReturnType<typeof vi.fn>;
}

function setupHook(initial?: AppState): SetupResult {
  const state = initial ?? makeState();
  const setStateSpy = vi.fn();
  const setFocusedPaneId = vi.fn();
  const setConfirmDialog = vi.fn();
  const setAlertDialog = vi.fn();
  const { result } = renderHook(() =>
    useBackupAndUpdates({
      state,
      setState: setStateSpy,
      setFocusedPaneId,
      setConfirmDialog,
      setAlertDialog,
    }),
  );
  invokeSpy.mockClear();
  return {
    state,
    result,
    setStateSpy,
    setFocusedPaneId,
    setConfirmDialog,
    setAlertDialog,
  };
}

describe("backup/restore product wording", () => {
  const fullBackupCopyKeys = [
    "backup.helpEnd",
    "backup.fullDesktopOnly",
    "backup.backupScheduledMsg",
    "backup.startupBackupSuccess",
    "backup.startupBackupZipOnly",
    "backup.startupRestoreSuccess",
    "backup.startupRestorePartial",
    "backup.startupRestoreConfigError",
    "backup.backupComplete",
    "backup.restoreMsg",
    "backup.restoreDone",
    "backup.restoreSuccessMsg",
  ] as const;

  const dictionaries = [
    {
      lang: "vi",
      dict: viDict,
      expected: {
        appState: /trạng thái app/i,
        sessionFiles: /session profile|file session profile/i,
        deviceScope: /thiết bị này/i,
        replacementRisk: /bị thay thế/i,
        reauth: /đăng nhập lại/i,
      },
    },
    {
      lang: "en",
      dict: enDict,
      expected: {
        appState: /app state/i,
        sessionFiles: /session profiles|profile session files/i,
        deviceScope: /this device/i,
        replacementRisk: /may be replaced/i,
        reauth: /sign-in again/i,
      },
    },
    {
      lang: "zh",
      dict: zhDict,
      expected: {
        appState: /应用状态/,
        sessionFiles: /会话配置文件|配置文件会话文件/,
        deviceScope: /本机/,
        replacementRisk: /可能会被替换/,
        reauth: /重新登录/,
      },
    },
  ];

  it.each(dictionaries)(
    "makes full backup session restore limits explicit in $lang",
    ({ dict, expected }) => {
      const fullBackupHelp = fullBackupCopyKeys
        .map((key) => dict[key])
        .join("\n");

      expect(fullBackupHelp).toMatch(expected.appState);
      expect(fullBackupHelp).toMatch(expected.sessionFiles);
      expect(fullBackupHelp).toMatch(expected.deviceScope);
      expect(fullBackupHelp).toMatch(expected.replacementRisk);
      expect(fullBackupHelp).toMatch(expected.reauth);
    },
  );

  it("does not describe full backup as guaranteed login preservation", () => {
    const allBackupCopy = dictionaries
      .flatMap(({ dict }) => fullBackupCopyKeys.map((key) => dict[key]))
      .join("\n");

    expect(allBackupCopy).not.toMatch(/includes login sessions/i);
    expect(allBackupCopy).not.toMatch(/including sessions\/cookies/i);
    expect(allBackupCopy).not.toMatch(/kèm session đăng nhập/i);
    expect(allBackupCopy).not.toMatch(/含会话\/cookie|包含登录会话/);
  });
});

describe("useBackupAndUpdates", () => {
  beforeEach(() => {
    tauriRuntime = false;
    invokeSpy.mockReset();
    updaterCheck.mockReset();
    relaunchSpy.mockReset();
    rejectingCommands.clear();
    writeTextFileExportNull = false;
    readTextFileExportNull = false;
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("startup restore results", () => {
    it("applies restored app state before releasing startup restore processing", async () => {
      tauriRuntime = true;
      const restoredState: AppState = {
        workspaces: [
          {
            id: "ws-restored",
            name: "Restored",
            columns: 1,
            panes: [
              {
                id: "pane-restored",
                title: "Restored pane",
                profileId: "prof-personal",
                activeTabId: "tab-restored",
                tabs: [
                  {
                    id: "tab-restored",
                    title: "Facebook",
                    url: "https://facebook.com",
                    loadedUrl: "https://facebook.com",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-restored",
        profiles: [
          { id: "prof-default", name: "Default" },
          { id: "prof-personal", name: "Personal" },
        ],
      };
      invokeSpy.mockResolvedValueOnce([
        {
          operation: "restore",
          success: true,
          message: "ok",
          configJson: JSON.stringify(restoredState),
          configRestored: true,
          warnings: [],
        },
      ]);
      const { result, setStateSpy, setFocusedPaneId, setAlertDialog } =
        setupHook();

      expect(result.current.startupRestoreProcessing).toBe(true);
      await waitFor(() =>
        expect(setStateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ activeWorkspaceId: "ws-restored" }),
        ),
      );
      await waitFor(() =>
        expect(result.current.startupRestoreProcessing).toBe(false),
      );
      expect(setFocusedPaneId).toHaveBeenCalledWith(null);
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Restore hoàn tất"),
        }),
      );
      expect(
        JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"),
      ).toMatchObject({
        activeWorkspaceId: "ws-restored",
      });
      expect(invokeSpy).toHaveBeenCalledWith(
        "acknowledge_session_startup_results",
        undefined,
      );
      const setStateOrder = setStateSpy.mock.invocationCallOrder[0];
      const ackCall = invokeSpy.mock.calls.findIndex(
        ([command]) => command === "acknowledge_session_startup_results",
      );
      expect(setStateOrder).toBeLessThan(
        invokeSpy.mock.invocationCallOrder[ackCall],
      );
    });

    it("does not replace state when restored config is invalid", async () => {
      tauriRuntime = true;
      invokeSpy.mockResolvedValueOnce([
        {
          operation: "restore",
          success: true,
          message: "ok",
          configJson: "{}",
          configRestored: true,
          warnings: ["warning text"],
        },
      ]);
      const { result, setStateSpy, setAlertDialog } = setupHook();

      await waitFor(() =>
        expect(result.current.startupRestoreProcessing).toBe(false),
      );
      expect(setStateSpy).not.toHaveBeenCalled();
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("warning text"),
        }),
      );
    });

    it("does not acknowledge restore evidence when restored state cannot be persisted", async () => {
      tauriRuntime = true;
      const restoredState = makeState();
      restoredState.activeWorkspaceId = "ws1";
      invokeSpy.mockResolvedValueOnce([
        {
          operation: "restore",
          success: true,
          message: "ok",
          configJson: JSON.stringify(restoredState),
          configRestored: true,
          warnings: [],
        },
      ]);
      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new DOMException("Access denied", "SecurityError");
        });

      const { result, setStateSpy } = setupHook();

      await waitFor(() =>
        expect(result.current.startupRestoreProcessing).toBe(false),
      );
      expect(setStateSpy).not.toHaveBeenCalled();
      expect(invokeSpy).not.toHaveBeenCalledWith(
        "acknowledge_session_startup_results",
        undefined,
      );
      setItemSpy.mockRestore();
    });

    it("reports a self-contained ZIP accurately when the optional sidecar failed", async () => {
      tauriRuntime = true;
      invokeSpy.mockResolvedValueOnce([
        {
          operation: "backup",
          success: true,
          message: "Backup hoàn tất",
          zipPath: "C:/tmp/sessions.zip",
          configPath: null,
          warnings: ["simulated sidecar warning"],
        },
      ]);
      const { result, setAlertDialog } = setupHook();

      await waitFor(() =>
        expect(result.current.startupRestoreProcessing).toBe(false),
      );
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(
            /ZIP backup tự chứa[\s\S]*simulated sidecar warning/,
          ),
        }),
      );
      const message = setAlertDialog.mock.calls[0][0].message as string;
      expect(message).not.toContain("• \n");
    });
  });

  describe("checkForUpdates", () => {
    it("returns 'available' when GitHub release tag is newer than APP_VERSION", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: "v99.0.0",
          html_url: "https://example/r",
        }),
      } as Response);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({
        kind: "available",
        latest: "99.0.0",
        releaseUrl: "https://example/r",
      });
    });

    it("returns 'current' when latest tag is not newer", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: APP_VERSION }),
      } as Response);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({ kind: "current" });
    });

    it("returns 'error' when fetch responds with non-ok status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus.kind).toBe("error");
    });

    it("returns 'error' when tag_name is missing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus.kind).toBe("error");
    });

    it("returns 'error' on network exception", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({
        kind: "error",
        message: "offline",
      });
    });
  });

  describe("checkForUpdates (Tauri updater)", () => {
    beforeEach(() => {
      tauriRuntime = true;
    });

    it("uses the updater check() and reports 'available' with the new version", async () => {
      updaterCheck.mockResolvedValue({ version: "2.0.0" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(updaterCheck).toHaveBeenCalledTimes(1);
      // Desktop path must NOT hit the GitHub REST API.
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.current.updateStatus.kind).toBe("available");
      if (result.current.updateStatus.kind === "available") {
        expect(result.current.updateStatus.latest).toBe("2.0.0");
      }
    });

    it("reports 'current' when updater check() resolves null", async () => {
      updaterCheck.mockResolvedValue(null);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({ kind: "current" });
    });

    it("reports 'current' when updater check() cannot fetch valid release JSON", async () => {
      updaterCheck.mockRejectedValue(
        new Error("Could not fetch a valid release JSON from the remote"),
      );
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({ kind: "current" });
    });

    it("reports 'current' when latest.json/updater manifest 404s", async () => {
      const currentMessages = [
        "HTTP 404 fetching latest.json",
        "404 Not Found: updater manifest",
        "404 Not Found: release JSON",
      ];

      for (const message of currentMessages) {
        updaterCheck.mockRejectedValueOnce(new Error(message));
        const { result } = setupHook();

        await act(async () => {
          await result.current.checkForUpdates();
        });

        expect(result.current.updateStatus).toEqual({ kind: "current" });
      }
    });

    it("reports 'error' when updater check() rejects with a generic error", async () => {
      updaterCheck.mockRejectedValue(new Error("endpoint 404"));
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({
        kind: "error",
        message: "endpoint 404",
      });
    });

    it("reports 'error' when updater check() rejects with a generic release-word error", async () => {
      updaterCheck.mockRejectedValue(new Error("release asset corrupted"));
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      expect(result.current.updateStatus).toEqual({
        kind: "error",
        message: "release asset corrupted",
      });
    });
  });

  describe("downloadAndInstallUpdate (Tauri updater)", () => {
    beforeEach(() => {
      tauriRuntime = true;
    });

    it("does nothing when no update was staged by a prior check", async () => {
      const { result } = setupHook();

      await act(async () => {
        await result.current.downloadAndInstallUpdate();
      });

      expect(relaunchSpy).not.toHaveBeenCalled();
      expect(result.current.updateStatus).toEqual({ kind: "idle" });
    });

    it("tracks progress through downloading → installing then relaunches", async () => {
      const downloadAndInstall = vi.fn(
        async (
          cb: (event: { event: string; data?: Record<string, number> }) => void,
        ) => {
          cb({ event: "Started", data: { contentLength: 200 } });
          cb({ event: "Progress", data: { chunkLength: 100 } });
          cb({ event: "Progress", data: { chunkLength: 100 } });
          cb({ event: "Finished" });
        },
      );
      updaterCheck.mockResolvedValue({ version: "2.0.0", downloadAndInstall });
      relaunchSpy.mockResolvedValue(undefined);
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      await act(async () => {
        await result.current.downloadAndInstallUpdate();
      });

      expect(downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(relaunchSpy).toHaveBeenCalledTimes(1);
      // After the install completes we briefly mark readyToInstall before relaunch.
      expect(result.current.updateStatus).toEqual({
        kind: "readyToInstall",
        latest: "2.0.0",
      });
    });

    it("reports 'error' and does not relaunch when install/verification fails", async () => {
      const downloadAndInstall = vi.fn(async () => {
        throw new Error("signature verification failed");
      });
      updaterCheck.mockResolvedValue({ version: "2.0.0", downloadAndInstall });
      const { result } = setupHook();

      await act(async () => {
        await result.current.checkForUpdates();
      });

      await act(async () => {
        await result.current.downloadAndInstallUpdate();
      });

      expect(relaunchSpy).not.toHaveBeenCalled();
      expect(result.current.updateStatus).toEqual({
        kind: "error",
        message: "signature verification failed",
      });
    });
  });

  describe("openReleasePage", () => {
    it("calls window.open in browser runtime", async () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const { result } = setupHook();

      await act(async () => {
        await result.current.openReleasePage("https://example/release");
      });

      expect(openSpy).toHaveBeenCalledWith(
        "https://example/release",
        "_blank",
        "noopener",
      );
    });

    it("invokes plugin:opener|open_url in Tauri runtime", async () => {
      tauriRuntime = true;
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const { result } = setupHook();
      await act(async () => {
        await result.current.openReleasePage("https://example/release");
      });
      expect(invokeSpy).toHaveBeenCalledWith(
        "plugin:opener|open_url",
        expect.objectContaining({ url: "https://example/release" }),
      );
      // Success path: should NOT fall back to window.open.
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("falls back to window.open when Tauri opener invoke rejects", async () => {
      tauriRuntime = true;
      rejectingCommands.add("plugin:opener|open_url");
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const { result } = setupHook();
      await act(async () => {
        await result.current.openReleasePage("https://example/release");
      });
      expect(openSpy).toHaveBeenCalledWith(
        "https://example/release",
        "_blank",
        "noopener",
      );
    });
  });

  describe("exportConfigJson (browser)", () => {
    it("creates a blob URL and triggers download", async () => {
      const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:mock");
      const revokeObjectURL = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => undefined);
      const clickSpy = vi.fn();
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = realCreate(tag) as HTMLAnchorElement;
        if (tag === "a") {
          (el as HTMLAnchorElement & { click: () => void }).click = clickSpy;
        }
        return el;
      });

      const { result } = setupHook();

      await act(async () => {
        await result.current.exportConfigJson();
      });

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("exportConfigJson (Tauri runtime)", () => {
    beforeEach(() => {
      tauriRuntime = true;
      dialogSave.mockReset();
      writeTextFileSpy.mockReset();
    });

    it("returns to idle when user cancels save dialog", async () => {
      dialogSave.mockResolvedValue(null);
      const { result } = setupHook();
      await act(async () => {
        await result.current.exportConfigJson();
      });
      expect(invokeSpy).not.toHaveBeenCalledWith(
        "plugin:fs|write_text_file",
        expect.anything(),
      );
      expect(writeTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("writes via plugin:fs|write_text_file when invoke succeeds", async () => {
      dialogSave.mockResolvedValue("C:/cfg.json");
      invokeSpy.mockResolvedValue(undefined);
      const { result } = setupHook();
      await act(async () => {
        await result.current.exportConfigJson();
      });
      expect(invokeSpy).toHaveBeenCalledWith(
        "plugin:fs|write_text_file",
        expect.objectContaining({ path: "C:/cfg.json" }),
      );
      // Plugin path succeeded so the writeTextFile fallback shouldn't run.
      expect(writeTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("falls back to plugin-fs writeTextFile when invoke rejects", async () => {
      dialogSave.mockResolvedValue("C:/cfg.json");
      rejectingCommands.add("plugin:fs|write_text_file");
      writeTextFileSpy.mockResolvedValue(undefined);
      const { result } = setupHook();
      await act(async () => {
        await result.current.exportConfigJson();
      });
      expect(writeTextFileSpy).toHaveBeenCalledWith(
        "C:/cfg.json",
        expect.any(String),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts when both invoke and writeTextFile fail", async () => {
      dialogSave.mockResolvedValue("C:/cfg.json");
      rejectingCommands.add("plugin:fs|write_text_file");
      writeTextFileSpy.mockRejectedValue(new Error("disk full"));
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.exportConfigJson();
      });
      expect(setAlertDialog).toHaveBeenCalledTimes(1);
      const alertArg = setAlertDialog.mock.calls[0][0];
      expect(alertArg.message).toMatch(/Export lỗi/);
      expect(alertArg.message).toMatch(/disk full/);
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts with 'plugin không khả dụng' when writeTextFile export is null (line 129 falsy)", async () => {
      tauriRuntime = true;
      writeTextFileExportNull = true;
      dialogSave.mockResolvedValue("C:/cfg.json");
      rejectingCommands.add("plugin:fs|write_text_file");
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.exportConfigJson();
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/không khả dụng/),
        }),
      );
      expect(writeTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("importConfigJson (browser)", () => {
    function mockFileInput(
      text: string | null,
      options: { size?: number; readError?: Error } = {},
    ) {
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = realCreate(tag) as HTMLInputElement;
        if (tag === "input") {
          (el as HTMLInputElement).click = () => {
            queueMicrotask(() => {
              if (text === null) {
                Object.defineProperty(el, "files", {
                  value: [],
                  configurable: true,
                });
              } else {
                const file = new File([text], "config.json", {
                  type: "application/json",
                });
                if (options.size !== undefined) {
                  Object.defineProperty(file, "size", {
                    value: options.size,
                    configurable: true,
                  });
                }
                if (options.readError) {
                  file.text = () => Promise.reject(options.readError);
                }
                Object.defineProperty(el, "files", {
                  value: [file],
                  configurable: true,
                });
              }
              el.onchange?.(new Event("change"));
            });
          };
        }
        return el;
      });
    }

    it("parses JSON then opens confirm dialog and applies on confirm", async () => {
      const incoming: AppState = {
        workspaces: [
          {
            id: "ws-new",
            name: "Imported",
            columns: 1,
            panes: [
              {
                id: "p-new",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t",
                    title: "T",
                    url: "https://x",
                    loadedUrl: "https://x",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-new",
        profiles: [{ id: "prof-default", name: "Default" }],
      };
      mockFileInput(JSON.stringify(incoming));
      const { result, setStateSpy, setConfirmDialog, setFocusedPaneId } =
        setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      await waitFor(() => expect(setConfirmDialog).toHaveBeenCalled());
      const dialog = setConfirmDialog.mock.calls[0][0];
      expect(dialog.danger).toBe(true);

      act(() => dialog.onConfirm());

      expect(setStateSpy).toHaveBeenCalledTimes(1);
      const applied = setStateSpy.mock.calls[0][0] as AppState;
      expect(applied.workspaces[0].id).toBe("ws-new");
      expect(setFocusedPaneId).toHaveBeenCalledWith(null);
    });

    it("alerts on invalid JSON without calling setConfirmDialog", async () => {
      mockFileInput("{ not json");
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      await waitFor(() => expect(setAlertDialog).toHaveBeenCalledTimes(1));
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Import lỗi/),
        }),
      );
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts when file lacks workspaces array", async () => {
      mockFileInput(JSON.stringify({ workspaces: [], profiles: [] }));
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      await waitFor(() => expect(setAlertDialog).toHaveBeenCalledTimes(1));
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(
            /không có workspaces|workspaces|hợp lệ|lỗi/i,
          ),
        }),
      );
      expect(setConfirmDialog).not.toHaveBeenCalled();
    });

    it("returns idle when user cancels the file picker (no file selected)", async () => {
      mockFileInput(null);
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      // The "no file" path resolves with null which makes text empty,
      // so importConfigJson returns to idle without confirm dialog or alert.
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setAlertDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("rejects an oversized browser config before reading it", async () => {
      mockFileInput("{}", { size: 10 * 1024 * 1024 + 1 });
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      await waitFor(() => expect(setAlertDialog).toHaveBeenCalledTimes(1));
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/10 MiB/) }),
      );
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("reports browser file read errors and returns to idle", async () => {
      mockFileInput("{}", { readError: new Error("browser read failed") });
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      await waitFor(() => expect(setAlertDialog).toHaveBeenCalledTimes(1));
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/browser read failed/),
        }),
      );
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("importConfigJson (Tauri runtime)", () => {
    beforeEach(() => {
      tauriRuntime = true;
      dialogOpen.mockReset();
      readTextFileSpy.mockReset();
      statSpy.mockReset();
      statSpy.mockResolvedValue({ size: 1024 });
    });

    it("reads file via plugin-fs and opens confirm dialog on valid JSON", async () => {
      const incoming: AppState = {
        workspaces: [
          {
            id: "ws-imp",
            name: "Imported",
            columns: 1,
            panes: [
              {
                id: "p-imp",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t",
                    title: "T",
                    url: "https://x",
                    loadedUrl: "https://x",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-imp",
        profiles: [{ id: "prof-default", name: "Default" }],
      };
      dialogOpen.mockResolvedValue("C:/tmp/config.json");
      readTextFileSpy.mockResolvedValue(JSON.stringify(incoming));

      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(readTextFileSpy).toHaveBeenCalledWith("C:/tmp/config.json");
      expect(statSpy).toHaveBeenCalledWith("C:/tmp/config.json");
      expect(setConfirmDialog).toHaveBeenCalledTimes(1);
      const dialogArg = setConfirmDialog.mock.calls[0][0];
      expect(dialogArg).toEqual(
        expect.objectContaining({
          onConfirm: expect.any(Function),
        }),
      );
    });

    it("returns idle when user cancels the open dialog", async () => {
      dialogOpen.mockResolvedValue(null);
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(readTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("rejects an oversized config before reading its contents", async () => {
      dialogOpen.mockResolvedValue("C:/tmp/oversized.json");
      statSpy.mockResolvedValue({ size: 10 * 1024 * 1024 + 1 });
      const { result, setConfirmDialog, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.importConfigJson();
      });

      expect(readTextFileSpy).not.toHaveBeenCalled();
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/10 MiB/) }),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts when readTextFile rejects (outer try/catch)", async () => {
      dialogOpen.mockResolvedValue("C:/tmp/config.json");
      readTextFileSpy.mockRejectedValue(new Error("read failed"));
      const { result, setConfirmDialog, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setAlertDialog).toHaveBeenCalledTimes(1);
      const alertArg = setAlertDialog.mock.calls[0][0];
      expect(alertArg.message).toMatch(/Import lỗi/);
      expect(alertArg.message).toMatch(/read failed/);
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts with 'plugin không khả dụng' when readTextFile export is null (line 167 truthy)", async () => {
      // BRDA gap: line 167 `if (!readTextFile) throw ...` — true branch.
      dialogOpen.mockResolvedValue("C:/tmp/config.json");
      readTextFileExportNull = true;
      const { result, setConfirmDialog, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/không khả dụng/),
        }),
      );
      expect(readTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("desktop-only guards", () => {
    it("exportFullBackup alerts and returns when not in Tauri runtime", async () => {
      const { result, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });

      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/desktop|app/i),
        }),
      );
      expect(invokeSpy).not.toHaveBeenCalledWith(
        "backup_sessions_zip",
        expect.anything(),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("restoreFullBackup alerts and returns when not in Tauri runtime", async () => {
      const { result, setAlertDialog } = setupHook();

      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });

      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/desktop|app/i),
        }),
      );
      expect(invokeSpy).not.toHaveBeenCalledWith(
        "restore_sessions_zip",
        expect.anything(),
      );
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("exportFullBackup (Tauri runtime)", () => {
    beforeEach(() => {
      tauriRuntime = true;
      dialogSave.mockReset();
      writeTextFileSpy.mockReset();
    });

    it("returns idle without opening confirm when Rust reports cancelled save (null path)", async () => {
      // Rust mở hộp thoại lưu và trả về null khi người dùng hủy.
      invokeSpy.mockResolvedValue(null);
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(invokeSpy).toHaveBeenCalledWith("backup_sessions_zip", {
        configJson: expect.stringContaining("workspaces"),
        passphrase: "test-passphrase",
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("invokes backup_sessions_zip with config json and confirms with the Rust-chosen path", async () => {
      // Frontend không còn tự chọn đường dẫn; nó dùng đường dẫn Rust trả về.
      invokeSpy.mockResolvedValue("C:/tmp/backup.acmbak");
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(writeTextFileSpy).not.toHaveBeenCalled();
      expect(dialogSave).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith("backup_sessions_zip", {
        configJson: expect.stringContaining("workspaces"),
        passphrase: "test-passphrase",
      });
      const confirmArg = setConfirmDialog.mock.calls[0][0];
      expect(confirmArg.message).toContain("C:/tmp/backup.acmbak");
      expect(confirmArg.title).toEqual(expect.stringContaining("Backup"));
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts when invoke throws", async () => {
      const { result, setAlertDialog } = setupHook();
      // Đặt sau setupHook để không bị effect mount (session_startup_results) tiêu thụ.
      invokeSpy.mockRejectedValueOnce(new Error("boom"));
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Backup lỗi"),
        }),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("does not depend on plugin-fs or the JS dialog for full backup", async () => {
      writeTextFileExportNull = true;
      invokeSpy.mockResolvedValue("C:/tmp/backup.acmbak");
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(writeTextFileSpy).not.toHaveBeenCalled();
      expect(dialogSave).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith("backup_sessions_zip", {
        configJson: expect.stringContaining("workspaces"),
        passphrase: "test-passphrase",
      });
      expect(setConfirmDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Backup"),
        }),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("alerts when not in Tauri runtime (early return path)", async () => {
      tauriRuntime = false;
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/desktop|app/i),
        }),
      );
      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("rejects an empty export password before invoking Rust", async () => {
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("");
      });
      expect(invokeSpy).not.toHaveBeenCalledWith(
        "backup_sessions_zip",
        expect.anything(),
      );
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({ message: viDict["backup.passwordRequired"] }),
      );
    });
  });

  describe("restoreFullBackup (Tauri runtime)", () => {
    beforeEach(() => {
      tauriRuntime = true;
      dialogOpen.mockReset();
    });

    it("clicking Cancel restore reaches the native cancellation command", async () => {
      let rejectRestore!: (reason: Error) => void;
      invokeSpy.mockImplementation((cmd: string) => {
        if (cmd === "restore_sessions_zip") {
          return new Promise<string | null>((_resolve, reject) => {
            rejectRestore = reject;
          });
        }
        if (cmd === "cancel_restore_sessions") {
          rejectRestore(new Error("Restore cancelled"));
          return Promise.resolve(undefined);
        }
        return Promise.resolve([]);
      });

      function Harness() {
        const backup = useBackupAndUpdates({
          state: makeState(),
          setState: vi.fn(),
          setFocusedPaneId: vi.fn(),
          setConfirmDialog: vi.fn(),
          setAlertDialog: vi.fn(),
        });
        return createElement(SettingsModal, {
          open: true,
          onClose: vi.fn(),
          theme: "light",
          onThemeChange: vi.fn(),
          updateStatus: backup.updateStatus,
          onCheckForUpdates: backup.checkForUpdates,
          onDownloadAndInstall: backup.downloadAndInstallUpdate,
          onOpenReleasePage: backup.openReleasePage,
          backupBusy: backup.backupBusy,
          onExportConfig: backup.exportConfigJson,
          onImportConfig: backup.importConfigJson,
          onExportFullBackup: backup.exportFullBackup,
          onRestoreFullBackup: backup.restoreFullBackup,
          onCancelRestoreFullBackup: backup.cancelRestoreFullBackup,
          onExportSupportBundle: vi.fn(),
          onOpenSupportIssue: vi.fn(),
          onOpenKnownIssues: vi.fn(),
          onShowOnboarding: vi.fn(),
        });
      }

      render(createElement(Harness));
      fireEvent.click(
        screen.getByRole("button", { name: /Khôi phục từ backup/ }),
      );
      fireEvent.change(screen.getByLabelText("Mật khẩu backup"), {
        target: { value: "temporary secret" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Hủy restore" }),
      );

      await waitFor(() => {
        expect(invokeSpy).toHaveBeenCalledWith(
          "cancel_restore_sessions",
          undefined,
        );
      });
    });

    it("invokes restore_sessions_zip with passphrase and shows success on a returned path", async () => {
      // Rust tự mở hộp thoại chọn file và trả về đường dẫn đã chọn.
      invokeSpy.mockResolvedValue("C:/tmp/in.acmbak");
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });
      expect(setConfirmDialog).toHaveBeenCalledTimes(1);
      expect(invokeSpy).toHaveBeenCalledWith("restore_sessions_zip", {
        passphrase: "restore-passphrase",
      });
      const successDialog = setConfirmDialog.mock.calls[0][0];
      expect(successDialog.title).toContain("Restore");
      expect(result.current.backupBusy).toBe("idle");
    });

    it("allows an empty passphrase for legacy ZIP restore", async () => {
      invokeSpy.mockResolvedValue(null);
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.restoreFullBackup("");
      });
      expect(invokeSpy).toHaveBeenCalledWith("restore_sessions_zip", {
        passphrase: "",
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("invokes cancellation even from a handler captured before restore state rerenders", async () => {
      let resolveRestore!: (value: string | null) => void;
      invokeSpy.mockImplementation((cmd: string) => {
        if (cmd === "restore_sessions_zip") {
          return new Promise<string | null>((resolve) => {
            resolveRestore = resolve;
          });
        }
        return Promise.resolve(undefined);
      });
      const { result } = setupHook();
      const cancelCapturedBeforeRestore = result.current.cancelRestoreFullBackup;
      let restorePromise!: Promise<void>;

      await act(async () => {
        restorePromise = result.current.restoreFullBackup("restore-passphrase");
      });
      await act(async () => {
        await cancelCapturedBeforeRestore();
      });

      expect(invokeSpy).toHaveBeenCalledWith(
        "cancel_restore_sessions",
        undefined,
      );
      await act(async () => {
        resolveRestore(null);
        await restorePromise;
      });
    });

    it("keeps backupBusy importing while restore is running", async () => {
      let resolveRestore!: (value: string | null) => void;
      const { result } = setupHook();
      invokeSpy.mockImplementation((cmd: string) => {
        if (cmd === "restore_sessions_zip") {
          return new Promise<string | null>((resolve) => {
            resolveRestore = resolve;
          });
        }
        return Promise.resolve([]);
      });

      let restorePromise!: Promise<void>;
      await act(async () => {
        restorePromise = result.current.restoreFullBackup("restore-passphrase");
      });
      expect(result.current.backupBusy).toBe("importing");

      await act(async () => {
        await result.current.cancelRestoreFullBackup();
      });
      expect(invokeSpy).toHaveBeenCalledWith(
        "cancel_restore_sessions",
        undefined,
      );

      await act(async () => {
        resolveRestore("C:/tmp/in.acmbak");
        await restorePromise;
      });
      expect(result.current.backupBusy).toBe("idle");
    });

    it("reports a backend cancellation failure without ending the active restore", async () => {
      let resolveRestore!: (value: string | null) => void;
      invokeSpy.mockImplementation((cmd: string) => {
        if (cmd === "restore_sessions_zip") {
          return new Promise<string | null>((resolve) => {
            resolveRestore = resolve;
          });
        }
        if (cmd === "cancel_restore_sessions") {
          return Promise.reject(new Error("cancel unavailable"));
        }
        return Promise.resolve([]);
      });
      const { result, setAlertDialog } = setupHook();
      let restorePromise!: Promise<void>;
      await act(async () => {
        restorePromise = result.current.restoreFullBackup("restore-passphrase");
      });

      await act(async () => {
        await result.current.cancelRestoreFullBackup();
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("cancel unavailable"),
        }),
      );
      expect(result.current.backupBusy).toBe("importing");

      await act(async () => {
        resolveRestore(null);
        await restorePromise;
      });
      expect(result.current.backupBusy).toBe("idle");
    });

    it("shows a generic message for a wrong password or corrupt file", async () => {
      const { result, setAlertDialog } = setupHook();
      invokeSpy.mockRejectedValueOnce(new Error("nope"));
      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Restore lỗi"),
        }),
      );
      expect(result.current.backupBusy).toBe("idle");

      invokeSpy.mockRejectedValueOnce(
        new Error("BACKUP_AUTH_FAILED: backend details must not reach UI"),
      );
      await act(async () => {
        await result.current.restoreFullBackup("wrong-password");
      });
      expect(setAlertDialog).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: viDict["backup.restoreAuthError"] }),
      );

      invokeSpy.mockRejectedValueOnce(
        new Error("BACKUP_FORMAT_UNSUPPORTED: internal parser details"),
      );
      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });
      expect(setAlertDialog).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: viDict["backup.restoreAuthError"] }),
      );
    });

    it("treats a user-cancelled restore as cancellation instead of a failure", async () => {
      const { result, setConfirmDialog, setAlertDialog } = setupHook();
      invokeSpy.mockRejectedValueOnce(new Error("Restore đã bị hủy"));

      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });

      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setAlertDialog).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });
  });

  describe("non-Error error coercion (String(error) ternary branches)", () => {
    it("checkForUpdates with non-Error rejection coerces to String (line 86 false branch)", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        "network down" as unknown as Error,
      );
      const { result } = setupHook();
      await act(async () => {
        await result.current.checkForUpdates();
      });
      expect(result.current.updateStatus).toEqual({
        kind: "error",
        message: "network down",
      });
    });

    it("exportConfigJson with non-Error coerces to String (line 142 false branch)", async () => {
      const original = URL.createObjectURL;
      (URL as unknown as { createObjectURL: () => string }).createObjectURL =
        () => {
          throw "blob denied"; // non-Error
        };
      try {
        const { result, setAlertDialog } = setupHook();
        await act(async () => {
          await result.current.exportConfigJson();
        });
        expect(setAlertDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(/blob denied/),
          }),
        );
        expect(result.current.backupBusy).toBe("idle");
      } finally {
        (
          URL as unknown as { createObjectURL: typeof original }
        ).createObjectURL = original;
      }
    });

    it("importConfigJson with non-Error rejection coerces to String (line 223 false branch)", async () => {
      tauriRuntime = true;
      dialogOpen.mockResolvedValue("C:/cfg.json");
      readTextFileSpy.mockRejectedValue("read denied" as unknown as Error);
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("read denied"),
        }),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("exportFullBackup with non-Error rejection coerces to String", async () => {
      tauriRuntime = true;
      invokeSpy.mockRejectedValue("save denied" as unknown as Error);
      const { result, setAlertDialog } = setupHook();
      await act(async () => {
        await result.current.exportFullBackup("test-passphrase");
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("save denied"),
        }),
      );
      expect(result.current.backupBusy).toBe("idle");
    });

    it("restoreFullBackup with non-Error rejection coerces to String", async () => {
      tauriRuntime = true;
      const { result, setAlertDialog } = setupHook();
      invokeSpy.mockRejectedValueOnce("zip rejected" as unknown as Error);
      await act(async () => {
        await result.current.restoreFullBackup("restore-passphrase");
      });
      expect(setAlertDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("zip rejected"),
        }),
      );
    });
  });

  describe("importConfigJson edge cases (Tauri runtime)", () => {
    beforeEach(() => {
      tauriRuntime = true;
      dialogOpen.mockReset();
      readTextFileSpy.mockReset();
    });

    it("returns idle when filePath is a non-string truthy value (line 167 typeof branch)", async () => {
      dialogOpen.mockResolvedValue([{ path: "some" }] as unknown as string);
      const { result, setConfirmDialog } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(readTextFileSpy).not.toHaveBeenCalled();
      expect(result.current.backupBusy).toBe("idle");
    });

    it("onConfirm uses createDefaultProfiles when parsed.profiles is missing (line 203 false branch)", async () => {
      const incoming = {
        workspaces: [
          {
            id: "ws-imp",
            name: "Imp",
            columns: 1,
            panes: [
              {
                id: "p-imp",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t",
                    title: "T",
                    url: "https://x",
                    loadedUrl: "https://x",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-imp",
      };
      dialogOpen.mockResolvedValue("C:/cfg.json");
      readTextFileSpy.mockResolvedValue(JSON.stringify(incoming));
      const { result, setConfirmDialog, setStateSpy } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      const dialogArg = setConfirmDialog.mock.calls[0][0];
      act(() => {
        dialogArg.onConfirm();
      });
      expect(setStateSpy).toHaveBeenCalledTimes(1);
      const newState = setStateSpy.mock.calls[0][0];
      expect(Array.isArray(newState.profiles)).toBe(true);
      expect(newState.profiles.length).toBeGreaterThan(0);
    });

    it("onConfirm falls back profileId to default when profile id missing (line 211 false branch)", async () => {
      const incoming = {
        workspaces: [
          {
            id: "ws-imp",
            name: "Imp",
            columns: 1,
            panes: [
              {
                id: "p-imp",
                title: "P",
                profileId: "missing-prof",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t",
                    title: "T",
                    url: "https://x",
                    loadedUrl: "https://x",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-imp",
        profiles: [{ id: "prof-default", name: "Default" }],
      };
      dialogOpen.mockResolvedValue("C:/cfg.json");
      readTextFileSpy.mockResolvedValue(JSON.stringify(incoming));
      const { result, setConfirmDialog, setStateSpy } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      const dialogArg = setConfirmDialog.mock.calls[0][0];
      act(() => {
        dialogArg.onConfirm();
      });
      const newState = setStateSpy.mock.calls[0][0];
      const importedPane = newState.workspaces[0].panes[0];
      expect(importedPane.profileId).not.toBe("missing-prof");
    });

    it("rejects an imported config whose pane has no tabs (structurally broken)", async () => {
      // A pane with no tabs is unrenderable. normalizeAppState now returns null
      // for it, so applyImportedAppState throws invalidConfig and the import is
      // refused with an alert instead of opening the replace-confirm dialog.
      const incoming = {
        workspaces: [
          {
            id: "ws-imp",
            name: "Imp",
            columns: 1,
            panes: [
              {
                id: "p-imp",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                // tabs intentionally omitted → structurally broken, rejected.
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-imp",
        profiles: [{ id: "prof-default", name: "Default" }],
      };
      dialogOpen.mockResolvedValue("C:/cfg.json");
      readTextFileSpy.mockResolvedValue(JSON.stringify(incoming));
      const { result, setConfirmDialog, setStateSpy, setAlertDialog } =
        setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      // No replace-confirm dialog and no state write: the broken config is refused.
      expect(setConfirmDialog).not.toHaveBeenCalled();
      expect(setStateSpy).not.toHaveBeenCalled();
      expect(setAlertDialog).toHaveBeenCalled();
    });

    it("onConfirm picks first workspace as active when activeWorkspaceId is missing (line 215 false branch)", async () => {
      const incoming = {
        workspaces: [
          {
            id: "ws-A",
            name: "A",
            columns: 1,
            panes: [
              {
                id: "pa",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t",
                    title: "T",
                    url: "https://x",
                    loadedUrl: "https://x",
                  },
                ],
              },
            ],
          },
          {
            id: "ws-B",
            name: "B",
            columns: 1,
            panes: [
              {
                id: "pb",
                title: "P",
                profileId: "prof-default",
                activeTabId: "t",
                tabs: [
                  {
                    id: "t-b",
                    title: "T",
                    url: "https://y",
                    loadedUrl: "https://y",
                  },
                ],
              },
            ],
          },
        ],
        activeWorkspaceId: "ws-NOT-PRESENT",
        profiles: [{ id: "prof-default", name: "Default" }],
      };
      dialogOpen.mockResolvedValue("C:/cfg.json");
      readTextFileSpy.mockResolvedValue(JSON.stringify(incoming));
      const { result, setConfirmDialog, setStateSpy } = setupHook();
      await act(async () => {
        await result.current.importConfigJson();
      });
      const dialogArg = setConfirmDialog.mock.calls[0][0];
      act(() => {
        dialogArg.onConfirm();
      });
      const newState = setStateSpy.mock.calls[0][0];
      expect(newState.activeWorkspaceId).toBe("ws-A");
    });
  });
});
