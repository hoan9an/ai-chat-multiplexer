// New Tab page configuration.
// In production (Tauri), the frontend is served from tauri://localhost so we can
// reference public/newtab.html directly. In dev (Vite), Vite serves /newtab.html.

export const NEW_TAB_TITLE = "New Tab";

// Icon shown for new-tab pages (tab strip + page favicon). Served from public/
// so it resolves on both the dev origin and tauri://localhost in production.
export const NEW_TAB_ICON = "/app-icon.png";

const NEW_TAB_PATH = "/newtab.html";

export function getNewTabUrl(): string {
  if (typeof window === "undefined") return NEW_TAB_PATH;
  // Build an absolute URL using the current origin so the webview keeps it stable.
  return new URL(NEW_TAB_PATH, window.location.href).toString();
}

export function isNewTabUrl(url: string): boolean {
  if (!url) return false;
  // Strip query/hash and trailing slashes for comparison
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname === NEW_TAB_PATH;
  } catch {
    return url.endsWith(NEW_TAB_PATH);
  }
}

// The new-tab page runs in an isolated native webview and cannot read the app's
// localStorage, so the active language is passed through the URL. For non-new-tab
// URLs this is a no-op.
export function withNewTabLang(url: string, lang: string): string {
  if (!isNewTabUrl(url)) return url;
  try {
    const parsed = new URL(url, window.location.href);
    parsed.searchParams.set("lang", lang);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}lang=${encodeURIComponent(lang)}`;
  }
}
