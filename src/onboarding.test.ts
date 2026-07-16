import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEY } from "./appCore";
import {
  initializeOnboarding,
  ONBOARDING_STORAGE_KEY,
  useOnboarding,
  writeOnboardingStatus,
} from "./onboarding";

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("onboarding persistence", () => {
  it("opens only for a fresh install and writes a separate pending record", () => {
    expect(initializeOnboarding(window.localStorage)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? "{}")).toMatchObject({
      schemaVersion: 1,
      status: "pending",
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not open for an existing v5 state and leaves the state bytes untouched", () => {
    const existing = JSON.stringify({ existing: "state-v5" });
    window.localStorage.setItem(STORAGE_KEY, existing);
    expect(initializeOnboarding(window.localStorage)).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(existing);
  });

  it.each(["completed", "skipped"] as const)("does not reopen a %s onboarding", (status) => {
    writeOnboardingStatus(window.localStorage, status);
    expect(initializeOnboarding(window.localStorage)).toBe(false);
  });

  it("does not crash when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
    } as unknown as Storage;

    expect(() => writeOnboardingStatus(unavailableStorage, "completed")).not.toThrow();
    expect(initializeOnboarding(unavailableStorage)).toBe(false);
  });

  it("does not crash when accessing window.localStorage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });

    try {
      const { result } = renderHook(() => useOnboarding());
      expect(result.current.isOpen).toBe(false);
      expect(() => act(() => result.current.reopen())).not.toThrow();
      expect(result.current.isOpen).toBe(true);
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
