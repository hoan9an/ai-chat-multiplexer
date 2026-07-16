// Shared types and pure helper functions used across components.
// Extracted from App.tsx to keep the main file focused on UI composition.

export type ChatTab = {
  id: string;
  title: string;
  url: string;
  loadedUrl: string;
  currentUrl?: string;
  faviconUrl?: string;
  isLoading?: boolean;
};

export type NativeTabStatus = {
  title: string;
  url: string;
  faviconUrl: string;
  isLoading: boolean;
};

export type ChatPane = {
  id: string;
  title: string;
  profileId: string;
  tabs: ChatTab[];
  activeTabId: string;
};

export type Workspace = {
  id: string;
  name: string;
  columns: number;
  panes: ChatPane[];
};

export type Profile = {
  id: string;
  name: string;
};

export type AppState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  profiles: Profile[];
};

export type DownloadEventPayload =
  | { kind: "started"; label: string; url: string; path: string }
  | { kind: "finished"; label: string; url: string; path: string | null; success: boolean }
  | { kind: "cancelled"; label: string; url: string };

export type DownloadToast = {
  id: string;
  status: "downloading" | "success" | "error" | "cancelled";
  fileName: string;
  path: string | null;
  /** Wall-clock ms when the download was first noticed (started or finished). */
  createdAt: number;
};

export type ThemeMode = "light" | "dark";

export const STORAGE_KEY = "ai-chat-multiplexer-state-v5";
export const LEGACY_STATE_V4_KEY = "ai-chat-multiplexer-state-v4";
export const LEGACY_STATE_V3_KEY = "ai-chat-multiplexer-state-v3";
export const LEGACY_LAYOUT_KEY = "ai-chat-multiplexer-layout-v2";
export const THEME_STORAGE_KEY = "ai-chat-multiplexer-theme";
export const DEFAULT_PROFILE_ID = "prof-default";
export const APP_VERSION = "0.1.14";
export const GITHUB_REPO = "hoan9an/ai-chat-multiplexer";
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const SUPPORT_ISSUE_URL = `https://github.com/${GITHUB_REPO}/issues/new?template=bug-report.yml`;
export const KNOWN_ISSUES_URL = `https://github.com/${GITHUB_REPO}/blob/main/docs/support/known-issues.md`;

const MAX_ENTITY_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 256;
const MAX_TITLE_LENGTH = 512;
const MAX_URL_LENGTH = 8192;
const MAX_PROFILES = 100;
const MAX_WORKSPACES = 100;
const MAX_PANES_PER_WORKSPACE = 100;
const MAX_TABS_PER_PANE = 100;

import { getNewTabUrl, isNewTabUrl, NEW_TAB_ICON, NEW_TAB_TITLE } from "./newtab";

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const aa = parse(a);
  const bb = parse(b);
  const length = Math.max(aa.length, bb.length);
  for (let index = 0; index < length; index += 1) {
    const left = aa[index] ?? 0;
    const right = bb[index] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

export function createDefaultProfiles(): Profile[] {
  return [{ id: DEFAULT_PROFILE_ID, name: "Default" }];
}

export function createDefaultWorkspace(name = "Workspace 1"): Workspace {
  const paneId = createId("pane");
  const tabId = createId("tab");
  const newTabUrl = getNewTabUrl();

  return {
    id: createId("ws"),
    name,
    columns: 1,
    panes: [
      {
        id: paneId,
        title: "Main Chat",
        profileId: DEFAULT_PROFILE_ID,
        activeTabId: tabId,
        tabs: [
          {
            id: tabId,
            title: NEW_TAB_TITLE,
            url: newTabUrl,
            loadedUrl: newTabUrl,
            currentUrl: newTabUrl,
            faviconUrl: NEW_TAB_ICON,
          },
        ],
      },
    ],
  };
}

export function createDefaultState(): AppState {
  const workspace = createDefaultWorkspace();
  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    profiles: createDefaultProfiles(),
  };
}

export function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Decide if a string is a real URL/host or a search query.
// Used by the URL bar and the new-tab search box to mimic browser behavior.
export function resolveAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";

  // Plain "localhost", "localhost:1234" or 127.0.0.1[:port]/path → treat as URL.
  // Check this BEFORE the generic scheme check below, otherwise "localhost:1420"
  // would look like a URL whose scheme is "localhost".
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // Already has a real scheme — pass through.
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;

  // No spaces and looks like a host (has a dot, no path-only tokens).
  // Examples: "google.com", "search.brave.com/", "example.com/path?q=1".
  if (!/\s/.test(trimmed) && /^[\w-]+(\.[\w-]+)+([:/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Fall back to search engine.
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function isAllowedWebviewUrl(url: string) {
  if (url === "about:blank") return true;

  try {
    const parsed = new URL(normalizeUrl(url), window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getOriginFallbackIcon(url: string) {
  // New-tab pages use the bundled app icon instead of an origin favicon.
  if (isNewTabUrl(url)) return NEW_TAB_ICON;
  try {
    const parsed = new URL(normalizeUrl(url));
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

export function getDisplayUrl(tab: ChatTab) {
  const url = tab.currentUrl || tab.url || tab.loadedUrl;
  if (isNewTabUrl(url)) return "";
  return url;
}

export function getFallbackTabTitle(url: string) {
  if (isNewTabUrl(url)) return NEW_TAB_TITLE;
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "") || NEW_TAB_TITLE;
  } catch {
    return NEW_TAB_TITLE;
  }
}

export function getTabTitle(tab: ChatTab) {
  return tab.title.trim() || getFallbackTabTitle(getDisplayUrl(tab));
}

export function getTabKey(paneId: string, tabId: string) {
  return `${paneId}:${tabId}`;
}

export function isPaneDragControl(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("button, input, select, summary, a, [role='button']"));
}

export function getNativeWebviewLabel(_paneId: string, tab: ChatTab) {
  // Use ONLY tab.id so the label stays stable when:
  // - the tab is moved between panes (drag tear-out / reorder),
  // - the tab navigates to a different URL.
  // Both would otherwise close+recreate the webview and lose state.
  return `tab-${tab.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function isSafeEntityId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ENTITY_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function hasDuplicate<T>(values: T[]): boolean {
  return new Set(values).size !== values.length;
}

export function hydrateTabs(tabs: ChatTab[]): ChatTab[] {
  return tabs.map((tab) => ({
    ...tab,
    loadedUrl: tab.loadedUrl ?? tab.url,
    currentUrl: tab.currentUrl ?? tab.loadedUrl ?? tab.url,
    faviconUrl: tab.faviconUrl ?? getOriginFallbackIcon(tab.loadedUrl ?? tab.url),
    isLoading: false,
  }));
}

function migrateLegacyLayout(): Workspace | null {
  const saved = window.localStorage.getItem(LEGACY_LAYOUT_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as { columns?: number; panes?: ChatPane[] };
    if (!Array.isArray(parsed.panes) || parsed.panes.length === 0) return null;

    return {
      id: createId("ws"),
      name: "Workspace 1",
      columns: parsed.columns ?? 1,
      panes: parsed.panes.map((pane) => ({
        ...pane,
        profileId: DEFAULT_PROFILE_ID,
        tabs: hydrateTabs(pane.tabs ?? []),
      })),
    };
  } catch {
    return null;
  }
}

function migrateLegacyV3(): { workspaces: Workspace[]; activeWorkspaceId: string } | null {
  const saved = window.localStorage.getItem(LEGACY_STATE_V3_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as {
      workspaces?: Array<Workspace & { panes: Array<ChatPane & { profileId?: string }> }>;
      activeWorkspaceId?: string;
    };
    if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) return null;

    const workspaces = parsed.workspaces.map((ws) => ({
      ...ws,
      panes: ws.panes.map((pane) => ({
        ...pane,
        profileId: DEFAULT_PROFILE_ID,
        tabs: hydrateTabs(pane.tabs ?? []),
      })),
    }));

    const activeId =
      parsed.activeWorkspaceId && workspaces.some((ws) => ws.id === parsed.activeWorkspaceId)
        ? parsed.activeWorkspaceId
        : workspaces[0].id;

    return { workspaces, activeWorkspaceId: activeId };
  } catch {
    return null;
  }
}

function migrateLegacyV4(): AppState | null {
  // v4 had per-preset profiles like { id, presetId, name }. Collapse them by name
  // into a single shared profile list. All "Default" become the global Default.
  const saved = window.localStorage.getItem(LEGACY_STATE_V4_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as {
      workspaces?: Array<Workspace & { panes: Array<ChatPane & { profileId?: string }> }>;
      activeWorkspaceId?: string;
      profiles?: Array<{ id: string; name: string; presetId?: string }>;
    };
    if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) return null;

    // Build a name -> new profile id map. Keep names unique.
    const nameToId = new Map<string, string>();
    nameToId.set("Default", DEFAULT_PROFILE_ID);

    const oldIdToNewId = new Map<string, string>();
    (parsed.profiles ?? []).forEach((p) => {
      const name = (p.name ?? "Default").trim() || "Default";
      let mappedId = nameToId.get(name);
      if (!mappedId) {
        mappedId = createId("prof");
        nameToId.set(name, mappedId);
      }
      oldIdToNewId.set(p.id, mappedId);
    });

    const profiles: Profile[] = Array.from(nameToId.entries()).map(([name, id]) => ({ id, name }));

    const workspaces = parsed.workspaces.map((ws) => ({
      ...ws,
      panes: ws.panes.map((pane) => ({
        ...pane,
        profileId: pane.profileId
          ? oldIdToNewId.get(pane.profileId) ?? DEFAULT_PROFILE_ID
          : DEFAULT_PROFILE_ID,
        tabs: hydrateTabs(pane.tabs ?? []),
      })),
    }));

    const activeId =
      parsed.activeWorkspaceId && workspaces.some((ws) => ws.id === parsed.activeWorkspaceId)
        ? parsed.activeWorkspaceId
        : workspaces[0].id;

    return { workspaces, activeWorkspaceId: activeId, profiles };
  } catch {
    return null;
  }
}

export function normalizeAppState(parsed: AppState): AppState | null {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.workspaces) ||
    parsed.workspaces.length === 0 ||
    parsed.workspaces.length > MAX_WORKSPACES
  ) {
    return null;
  }

  const profiles =
    Array.isArray(parsed.profiles) && parsed.profiles.length > 0
      ? parsed.profiles
      : createDefaultProfiles();

  if (
    profiles.length > MAX_PROFILES ||
    profiles.some(
      (profile) =>
        !profile ||
        typeof profile !== "object" ||
        !isSafeEntityId(profile.id) ||
        !isBoundedString(profile.name, MAX_NAME_LENGTH),
    ) ||
    hasDuplicate(profiles.map((profile) => profile.id))
  ) {
    return null;
  }

  const profileIds = new Set(profiles.map((p) => p.id));

  const fallbackProfileId = profileIds.has(DEFAULT_PROFILE_ID)
    ? DEFAULT_PROFILE_ID
    : profiles[0].id;

  const workspaceIds = parsed.workspaces.map((workspace) => workspace?.id);
  if (
    workspaceIds.some((id) => !isSafeEntityId(id)) ||
    hasDuplicate(workspaceIds)
  ) {
    return null;
  }

  const paneIds = new Set<string>();
  const tabIds = new Set<string>();

  // Reject structurally broken data (a pane with no tabs cannot render) but
  // cheaply repair what we can: a missing/dangling profileId falls back to a
  // valid profile, and an activeTabId that no longer exists falls back to the
  // first tab. IDs must remain globally unique because tab IDs become native
  // webview labels and profile IDs become native session-directory names.
  let structurallyBroken = false;
  const workspaces = parsed.workspaces.map((ws) => {
    if (
      !ws ||
      typeof ws !== "object" ||
      !isBoundedString(ws.name, MAX_NAME_LENGTH) ||
      !Number.isInteger(ws.columns) ||
      ws.columns < 1 ||
      ws.columns > 4 ||
      !Array.isArray(ws.panes) ||
      ws.panes.length === 0 ||
      ws.panes.length > MAX_PANES_PER_WORKSPACE
    ) {
      structurallyBroken = true;
      return { ...ws, panes: [] };
    }

    const panes = ws.panes.map((pane) => {
      if (
        !pane ||
        typeof pane !== "object" ||
        !isSafeEntityId(pane.id) ||
        paneIds.has(pane.id) ||
        !isBoundedString(pane.title, MAX_TITLE_LENGTH) ||
        !Array.isArray(pane.tabs) ||
        pane.tabs.length === 0 ||
        pane.tabs.length > MAX_TABS_PER_PANE
      ) {
        structurallyBroken = true;
        return { ...pane, tabs: [] } as ChatPane;
      }

      paneIds.add(pane.id);
      const tabsValid = pane.tabs.every((tab) => {
        const urls = [tab?.url, tab?.loadedUrl, tab?.currentUrl].filter(
          (value): value is string => typeof value === "string",
        );
        if (
          !tab ||
          typeof tab !== "object" ||
          !isSafeEntityId(tab.id) ||
          tabIds.has(tab.id) ||
          !isBoundedString(tab.title, MAX_TITLE_LENGTH) ||
          !isBoundedString(tab.url, MAX_URL_LENGTH) ||
          (tab.loadedUrl !== undefined && !isBoundedString(tab.loadedUrl, MAX_URL_LENGTH)) ||
          (tab.currentUrl !== undefined && !isBoundedString(tab.currentUrl, MAX_URL_LENGTH)) ||
          (tab.faviconUrl !== undefined && !isBoundedString(tab.faviconUrl, MAX_URL_LENGTH)) ||
          (tab.isLoading !== undefined && typeof tab.isLoading !== "boolean") ||
          urls.some((url) => !isNewTabUrl(url) && !isAllowedWebviewUrl(url))
        ) {
          return false;
        }
        tabIds.add(tab.id);
        return true;
      });
      if (!tabsValid) structurallyBroken = true;

      const tabs = tabsValid ? hydrateTabs(pane.tabs) : [];
      const activeTabId = tabs.some((tab) => tab.id === pane.activeTabId)
        ? pane.activeTabId
        : tabs[0]?.id;

      return {
        ...pane,
        profileId: profileIds.has(pane.profileId) ? pane.profileId : fallbackProfileId,
        activeTabId,
        tabs,
      };
    });

    return { ...ws, panes };
  });

  if (structurallyBroken || workspaces.some((ws) => ws.panes.length === 0)) {
    return null;
  }

  const activeId = workspaces.some((ws) => ws.id === parsed.activeWorkspaceId)
    ? parsed.activeWorkspaceId
    : workspaces[0].id;

  return { workspaces, activeWorkspaceId: activeId, profiles };
}

function loadAppStateFromStorage(): AppState {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const normalized = normalizeAppState(JSON.parse(saved) as AppState);
      if (normalized) {
        return normalized;
      }
    } catch {
      // fall through to default
    }
  }

  const v4 = migrateLegacyV4();
  if (v4) {
    const normalized = normalizeAppState(v4);
    if (normalized) {
      window.localStorage.removeItem(LEGACY_STATE_V4_KEY);
      return normalized;
    }
  }

  const v3 = migrateLegacyV3();
  if (v3) {
    const normalized = normalizeAppState({ ...v3, profiles: createDefaultProfiles() });
    if (normalized) {
      window.localStorage.removeItem(LEGACY_STATE_V3_KEY);
      return normalized;
    }
  }

  const legacy = migrateLegacyLayout();
  if (legacy) {
    const normalized = normalizeAppState({
      workspaces: [legacy],
      activeWorkspaceId: legacy.id,
      profiles: createDefaultProfiles(),
    });
    if (normalized) {
      window.localStorage.removeItem(LEGACY_LAYOUT_KEY);
      return normalized;
    }
  }

  return createDefaultState();
}

export function loadAppState(): AppState {
  try {
    return loadAppStateFromStorage();
  } catch {
    return createDefaultState();
  }
}
