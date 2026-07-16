import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  createId,
  getFallbackTabTitle,
  getNativeWebviewLabel,
  getOriginFallbackIcon,
  isAllowedWebviewUrl,
  isTauriRuntime,
  type AppState,
  type ChatTab,
} from "../appCore";
import type { AlertDialogOptions } from "../types/dialogs";
import { useTranslation } from "../i18n";

export type NativeNewWindowRequest = {
  kind: "openTab" | "blocked";
  sourceLabel: string;
  url: string | null;
  reason: "http" | "https" | "unsupportedScheme" | "blankPopup";
  timestampMs: number;
};

export function routeNativeNewWindow(state: AppState, request: NativeNewWindowRequest): AppState {
  if (request.kind !== "openTab" || !request.url || !isAllowedWebviewUrl(request.url)) {
    return state;
  }

  let changed = false;
  const workspaces = state.workspaces.map((workspace) => ({
    ...workspace,
    panes: workspace.panes.map((pane) => {
      const sourceIndex = pane.tabs.findIndex(
        (tab) => getNativeWebviewLabel(pane.id, tab) === request.sourceLabel,
      );
      if (sourceIndex < 0) return pane;

      const id = createId("tab");
      const url = request.url!;
      const nextTab: ChatTab = {
        id,
        title: getFallbackTabTitle(url),
        url,
        loadedUrl: url,
        currentUrl: url,
        faviconUrl: getOriginFallbackIcon(url),
        isLoading: true,
      };
      const tabs = [...pane.tabs];
      tabs.splice(sourceIndex + 1, 0, nextTab);
      changed = true;
      return { ...pane, tabs, activeTabId: id };
    }),
  }));

  return changed ? { ...state, workspaces } : state;
}

type Args = {
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  setAlertDialog: (dialog: AlertDialogOptions | null) => void;
};

export function useNativeNewWindowRequests({ setState, setAlertDialog }: Args) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const unlistenPromise = listen<NativeNewWindowRequest>(
      "native-webview-new-window",
      ({ payload }) => {
        if (!payload || typeof payload.sourceLabel !== "string") return;

        if (payload.kind === "openTab") {
          setState((current) => routeNativeNewWindow(current, payload));
          return;
        }

        if (payload.kind === "blocked") {
          setAlertDialog({
            title: t("popup.blockedTitle"),
            message:
              payload.reason === "blankPopup"
                ? t("popup.blankBlocked")
                : t("popup.schemeBlocked"),
          });
        }
      },
    );

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setAlertDialog, setState, t]);
}
