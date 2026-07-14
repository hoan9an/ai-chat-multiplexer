import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
  getFallbackTabTitle,
  getNativeWebviewLabel,
  getOriginFallbackIcon,
  isTauriRuntime,
  type ChatPane,
  type NativeTabStatus,
} from "../appCore";

export interface UseNativeTabStatusArgs {
  activePanes: ChatPane[];
  focusedPaneId: string | null;
  updateActivePane: (paneId: string, updater: (pane: ChatPane) => ChatPane) => void;
}

/**
 * Polls native webview status (URL, title, favicon, loading) for the active
 * tab of every visible pane, and updates state in-place when anything changes.
 * Only runs in the Tauri runtime; no-op in the browser.
 */
export function useNativeTabStatus({
  activePanes,
  focusedPaneId,
  updateActivePane,
}: UseNativeTabStatusArgs) {
  // Keep the polling callback in a ref so the interval effect does not depend on
  // `activePanes`/`updateActivePane` identity. Each poll result triggers a
  // re-render (and a fresh `activePanes` array); if the effect depended on that
  // array it would tear down and recreate the interval every ~poll, and the
  // immediate `syncTabStatuses()` on each re-setup made the real poll rate far
  // faster than the intended 1200ms. The ref lets the interval read the latest
  // values without being a dependency.
  const syncRef = useRef<() => void>(() => undefined);
  // Guards against late-resolving invoke promises writing state after unmount.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  syncRef.current = () => {
    activePanes.forEach((pane) => {
      const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
      const isPaneVisible = !focusedPaneId || focusedPaneId === pane.id;

      if (!activeTab || !isPaneVisible) {
        return;
      }

      const label = getNativeWebviewLabel(pane.id, activeTab);

      void invoke<NativeTabStatus>("native_webview_tab_status", { label })
        .then((status) => {
          if (!isMountedRef.current) {
            return;
          }

          updateActivePane(pane.id, (currentPane) => ({
            ...currentPane,
            tabs: currentPane.tabs.map((tab) => {
              if (tab.id !== activeTab.id) {
                return tab;
              }

              const nextUrl =
                status.url || tab.currentUrl || tab.url || tab.loadedUrl;
              const nextTitle =
                status.title.trim() || getFallbackTabTitle(nextUrl);
              const nextFaviconUrl =
                status.faviconUrl || getOriginFallbackIcon(nextUrl);

              if (
                tab.title === nextTitle &&
                tab.currentUrl === nextUrl &&
                tab.faviconUrl === nextFaviconUrl &&
                tab.isLoading === status.isLoading
              ) {
                return tab;
              }

              return {
                ...tab,
                title: nextTitle,
                currentUrl: nextUrl,
                faviconUrl: nextFaviconUrl,
                isLoading: status.isLoading,
              };
            }),
          }));
        })
        .catch(() => undefined);
    });
  };

  // Stable key: the joined list of visible native-webview labels. The interval is
  // recreated only when the actual set of polled tabs changes (tab switch, pane
  // add/remove, focus change) — NOT on every poll result.
  const visibleLabelsKey = activePanes
    .filter((pane) => !focusedPaneId || focusedPaneId === pane.id)
    .map((pane) => {
      const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
      return activeTab ? getNativeWebviewLabel(pane.id, activeTab) : "";
    })
    .join("|");

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const tick = () => syncRef.current();

    tick();
    const interval = window.setInterval(tick, 1200);

    return () => {
      window.clearInterval(interval);
    };
    // Recreate the interval only when the set of visible tabs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLabelsKey]);
}
