import { useCallback, useState } from "react";
import {
  LEGACY_LAYOUT_KEY,
  LEGACY_STATE_V3_KEY,
  LEGACY_STATE_V4_KEY,
  STORAGE_KEY,
} from "./appCore";

export const ONBOARDING_STORAGE_KEY = "ai-chat-multiplexer-onboarding-v1";

export type OnboardingStatus = "pending" | "completed" | "skipped";

type OnboardingRecord = {
  schemaVersion: 1;
  status: OnboardingStatus;
  updatedAt: string;
};

const APP_STATE_KEYS = [STORAGE_KEY, LEGACY_STATE_V4_KEY, LEGACY_STATE_V3_KEY, LEGACY_LAYOUT_KEY];

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRecord(storage: Storage | null): OnboardingRecord | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(ONBOARDING_STORAGE_KEY) ?? "null") as Partial<OnboardingRecord> | null;
    if (
      parsed?.schemaVersion === 1 &&
      (parsed.status === "pending" || parsed.status === "completed" || parsed.status === "skipped")
    ) {
      return parsed as OnboardingRecord;
    }
  } catch {
    // A malformed onboarding record is repaired below without touching app state.
  }
  return null;
}

export function writeOnboardingStatus(storage: Storage | null, status: OnboardingStatus): boolean {
  if (!storage) return false;
  const record: OnboardingRecord = {
    schemaVersion: 1,
    status,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Persistence failure must not block the first-run or settings UI.
    return false;
  }
}

export function initializeOnboarding(storage: Storage | null): boolean {
  if (!storage) return false;
  const record = readRecord(storage);
  if (record) return record.status === "pending";

  let existingInstall: boolean;
  try {
    existingInstall = APP_STATE_KEYS.some((key) => storage.getItem(key) !== null);
  } catch {
    // When storage is unavailable, avoid forcing an unpersistable modal on every launch.
    return false;
  }
  if (existingInstall) return false;

  return writeOnboardingStatus(storage, "pending");
}

export function useOnboarding() {
  const [isOpen, setIsOpen] = useState(() => initializeOnboarding(getBrowserStorage()));

  const setStatus = useCallback((status: OnboardingStatus) => {
    writeOnboardingStatus(getBrowserStorage(), status);
    setIsOpen(status === "pending");
  }, []);

  return {
    isOpen,
    complete: () => setStatus("completed"),
    skip: () => setStatus("skipped"),
    reopen: () => setStatus("pending"),
  };
}
