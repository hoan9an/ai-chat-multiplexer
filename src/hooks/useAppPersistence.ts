import { useEffect, useRef, useState } from "react";
import {
  STORAGE_KEY,
  THEME_STORAGE_KEY,
  loadAppState,
  type AppState,
  type ThemeMode,
} from "../appCore";

export interface UseAppPersistenceResult {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  theme: ThemeMode;
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>;
}

/** Trailing debounce for state writes, in ms. */
const STATE_WRITE_DEBOUNCE_MS = 500;

// Serialize state for persistence, dropping the transient `isLoading` flag on
// every tab. `isLoading` is driven by the ~1.2s native-status poll and is reset
// on load anyway (see hydrateTabs), so persisting it only churns the stored
// payload as tabs flip between loading/idle. Stripping it keeps the written
// bytes stable across poll toggles without reshaping AppState.
function serializeState(state: AppState): string {
  return JSON.stringify(state, (key, value) => (key === "isLoading" ? undefined : value));
}

export function useAppPersistence(): UseAppPersistenceResult {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" ? "dark" : "light";
  });

  // Debounce state writes. Transient poll updates (native tab status, ~1.2s)
  // flow through `state` on every tick; writing the whole tree to localStorage
  // each time is wasteful. Coalesce writes on a trailing timer and always flush
  // the latest snapshot on unload so nothing is lost when the window closes.
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, serializeState(latestStateRef.current));
    }, STATE_WRITE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  // Flush the pending snapshot synchronously when the page is being torn down,
  // so a close/refresh during the debounce window does not drop the last edit.
  useEffect(() => {
    const flush = () => {
      window.localStorage.setItem(STORAGE_KEY, serializeState(latestStateRef.current));
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);

    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return { state, setState, theme, setTheme };
}
