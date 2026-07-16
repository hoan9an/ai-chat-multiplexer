import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIAGNOSTICS_STORAGE_KEY } from "./diagnostics";

const invokeSpy = vi.fn();
const saveSpy = vi.fn();
const writeTextFileSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeSpy(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => saveSpy(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: (...args: unknown[]) => writeTextFileSpy(...args),
}));

vi.mock("./appCore", async () => {
  const actual = await vi.importActual<typeof import("./appCore")>("./appCore");
  return { ...actual, isTauriRuntime: () => true };
});

import { useDiagnostics } from "./hooks/useDiagnostics";

describe("useDiagnostics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invokeSpy.mockReset();
    invokeSpy.mockResolvedValue({ os: "windows", arch: "x86_64", webviewVersion: "150.0" });
    saveSpy.mockReset();
    saveSpy.mockResolvedValue("C:/tmp/support.json");
    writeTextFileSpy.mockReset();
    writeTextFileSpy.mockResolvedValue(undefined);
  });

  it("writes the exact redacted snapshot shown in the confirmation dialog", async () => {
    window.localStorage.setItem(
      DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          appVersion: "old",
          component: "webview",
          code: "FIRST_EVENT",
          severity: "error",
        },
      ]),
    );
    const setConfirmDialog = vi.fn();
    const setAlertDialog = vi.fn();
    const { result } = renderHook(() => useDiagnostics({ setConfirmDialog, setAlertDialog }));

    act(() => result.current.exportSupportBundle());
    const dialog = setConfirmDialog.mock.calls.at(-1)?.[0];
    expect(dialog.details).toContain("FIRST_EVENT");

    window.localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, "[]");
    await act(async () => {
      await dialog.onConfirm();
    });

    expect(writeTextFileSpy).toHaveBeenCalledWith("C:/tmp/support.json", dialog.details);
    expect(writeTextFileSpy.mock.calls[0][1]).toContain("FIRST_EVENT");
    expect(setAlertDialog).not.toHaveBeenCalled();
  });
});
