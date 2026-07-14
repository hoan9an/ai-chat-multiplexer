# AI Chat Multiplexer

AI Chat Multiplexer is a local-first desktop workspace for running multiple AI web apps side by side. It is built with Tauri 2, React 19, TypeScript, Vite, and a Rust backend that manages native child webviews, per-profile browser session storage, downloads, backups, restores, and desktop updates.

![Status](https://img.shields.io/badge/status-active-success) ![Version](https://img.shields.io/badge/version-0.1.10-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Languages: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

![AI Chat Multiplexer desktop workspace preview](./docs/assets/ai-multiplexer-hero.png)

## Current Scope

This repository contains two user-facing surfaces:

- Desktop app: the main Tauri application under `src/` and `src-tauri/`.
- Static landing page: a standalone site under `landing/`.

The desktop app is the product runtime. The landing page is static HTML/CSS/JS and is not part of the Tauri app bundle unless a deployment workflow explicitly publishes it.

## Runtime Architecture

The application shell is rendered by React, while external AI sites are rendered in native Tauri child webviews.

```text
React app shell
  App.tsx
    AppHeader
    PaneGrid
      Pane
    AppOverlays

Hooks
  useAppPersistence          local app state + theme persistence
  useDerivedWorkspaceState   active workspace/pane derivation
  useNativeWebviews          DOM rectangle -> native child webview sync
  useNativeTabStatus         title/url/favicon/loading polling
  usePaneActions             panes, tabs, navigation, drag/drop
  useProfileWorkspaceActions profiles and workspaces
  useDownloadManager         native download event toasts/panel
  useBackupAndUpdates        config backup, full backup, restore, updater

Rust/Tauri backend
  native webview lifecycle
  profile session directories
  native downloads
  ZIP backup/restore staging
  updater/process/dialog/fs/opener plugins
```

React owns the workspace model, UI state, layout, and intent. Rust owns privileged desktop operations and native webview operations that cannot be implemented reliably in a browser-only surface.

## Core Features

- Multiple workspaces, each with independent pane layout and tab state.
- Focus mode and 1/2/3/4-column pane layouts.
- Drag-and-drop pane reordering.
- Tab management inside each pane.
- Moving tabs between panes when both panes use the same profile.
- Detaching a tab into a new pane.
- Per-profile browser sessions using Tauri webview `data_directory`.
- Native webviews for external `http` and `https` sites, avoiding iframe restrictions from CSP or `X-Frame-Options`.
- Local `newtab.html` page for blank tabs and search/address input behavior.
- Native download prompts, progress events, toast notifications, and a downloads panel.
- JSON config export/import for workspace state.
- Full ZIP backup/restore for profile session files plus app state metadata.
- Signed Tauri updater integration backed by GitHub Releases.
- English, Vietnamese, and Chinese UI dictionaries.

## Data Model

The shared frontend model is defined in `src/appCore.ts`.

```text
AppState
  workspaces: Workspace[]
  activeWorkspaceId: string
  profiles: Profile[]

Workspace
  id: string
  name: string
  columns: number
  panes: ChatPane[]

ChatPane
  id: string
  title: string
  profileId: string
  tabs: ChatTab[]
  activeTabId: string

ChatTab
  id: string
  title: string
  url: string
  loadedUrl: string
  currentUrl?: string
  faviconUrl?: string
  isLoading?: boolean
```

Current app state is stored in `localStorage` under:

```text
ai-chat-multiplexer-state-v5
```

Theme is stored separately under:

```text
ai-chat-multiplexer-theme
```

Language is stored under:

```text
ai-chat-multiplexer-lang
```

The app still contains migration paths for older localStorage keys:

- `ai-chat-multiplexer-state-v4`
- `ai-chat-multiplexer-state-v3`
- `ai-chat-multiplexer-layout-v2`

Invalid or structurally broken saved state falls back to a default workspace.

## Native Webviews

The frontend does not embed third-party AI sites with iframes in desktop mode. Instead, `useNativeWebviews` mirrors visible pane rectangles into Tauri child webviews.

Important implementation details:

- Native webview labels are generated from tab IDs and have the shape `tab-{id}`.
- Rust validates labels and rejects labels outside the `tab-*` form.
- Only `http`, `https`, and `about:blank` are accepted for native webview navigation.
- Hidden tabs, inactive workspaces, modal-open states, and suspended states hide native webviews instead of leaving them exposed above the React UI.
- Existing webviews are navigated with `native_webview_load_url` rather than recreated when possible, preserving session state.
- `native_webview_tab_status` polls title, current URL, favicon, and loading state from the child webview, then sanitizes page-provided values before returning them to the privileged app shell.

The native command surface is registered in `src-tauri/src/lib.rs`:

- `native_webview_upsert`
- `native_webview_hide`
- `native_webview_close`
- `native_webview_navigate`
- `native_webview_load_url`
- `native_webview_tab_status`
- `delete_profile_session`
- `backup_sessions_zip`
- `restore_sessions_zip`
- `session_startup_results`
- `reveal_path_in_folder`
- `quit_app`

## Profile Sessions

Profiles are browser-session containers, not just labels in the UI.

For native webviews, Rust creates a Tauri data directory under the app data directory:

```text
pane-sessions/{sanitized-profile-id}/
```

Each profile gets separate cookies, local storage, cache, and related WebView session files. Deleting an unused profile can also delete its profile session directory through the `delete_profile_session` command.

Tab movement across panes is intentionally constrained: a tab can move from one pane to another only when both panes use the same profile. This avoids silently changing the browser session backing a loaded tab.

## Address Resolution

Address input is normalized in `resolveAddress`:

- Empty input becomes `about:blank`.
- Existing schemes are passed through.
- `localhost`, `localhost:port`, and `127.0.0.1[:port]` are treated as `http` URLs.
- Host-like input such as `example.com/path` becomes `https://example.com/path`.
- Other text becomes a Google search URL.

The default first tab is the bundled New Tab page:

```text
/newtab.html
```

The New Tab page lives at `public/newtab.html`. It prelinks common AI services and receives the active language through `?lang=` because it can run in an isolated webview/iframe surface instead of sharing the React app's localStorage context.

## Backup And Restore

There are two backup modes.

Config JSON export/import stores only the app model: workspaces, panes, tabs, active workspace, and profiles. It does not include browser session files.

Full ZIP backup is desktop-only. It includes profile session files and app state metadata:

```text
__ai_chat_multiplexer_backup/app-state.json
```

The full backup flow is intentionally restart-oriented because WebView session files can be locked while the app is running:

1. Frontend asks Rust to schedule a backup with the current serialized app state.
2. Rust stores a pending backup request beside the `pane-sessions` directory.
3. The user restarts the app.
4. During Tauri setup, Rust processes the pending request before normal operation.
5. Rust writes the ZIP and a sidecar JSON file for compatibility.
6. Startup results are surfaced back to the frontend through `session_startup_results`.

Restore is also staged:

1. User chooses a backup ZIP.
2. Rust extracts it into a staging directory and validates safe archive paths.
3. Rust records pending restore metadata and app config, if present.
4. On restart, Rust replaces live profile sessions with the staged sessions.
5. Frontend applies the restored app state when valid.

Full backups can contain live cookies and session material. Treat them as private credentials. Restore is best-effort; protected services may require sign-in again on another machine or Windows user.

## Downloads

Native child webviews use Tauri download events. On requested download, Rust opens a save-file dialog, emits `native-webview-download` events, and tracks completion.

On Windows/WebView2, the normal finished event can be unreliable, so the backend includes a file-size polling fallback: when the selected file stops growing for a short stable interval, the backend emits a finished event. If polling times out, the download is surfaced as unsuccessful so the UI does not remain stuck in a loading state.

Frontend download UI is handled by:

- `useDownloadManager`
- `DownloadToastStack`
- `DownloadsPanel`

Completed downloads can be opened directly or revealed in the platform file manager via `reveal_path_in_folder`.

## Updates And Releases

The app version is currently `0.1.10` in:

- `package.json`
- `src/appCore.ts`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Desktop updates use `@tauri-apps/plugin-updater`. The configured updater endpoint is:

```text
https://github.com/hoan9an/ai-chat-multiplexer/releases/latest/download/latest.json
```

The release workflow runs on `v*` tags, creates or reuses one draft GitHub release, builds Tauri bundles on macOS, Linux, and Windows, uploads updater artifacts including `latest.json`, and publishes the release only after all matrix builds succeed.

Required GitHub Actions secrets for signed updater artifacts:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

In non-Tauri/web fallback mode, update checks use the GitHub Releases API and open the release page for manual download.

## Security Model

The app is local-first, but it is still a desktop browser shell that renders external websites. The security-sensitive boundaries are:

- Third-party pages run in child webviews, not in the privileged React app shell.
- Native command labels are validated so external or malformed labels cannot target the main window.
- Native webview URLs are restricted to `http`, `https`, and `about:blank`.
- Page-provided tab status data is sanitized before entering app UI state.
- Full backup/restore paths are chosen through backend dialogs, not arbitrary frontend-provided paths.
- ZIP restore uses enclosed paths and rejects archives without valid session files.
- Tauri capabilities are scoped in `src-tauri/capabilities/default.json`.

The app does not proxy, cache, decrypt, or bypass the AI services opened inside webviews. Authentication remains between the user and each service.

## Repository Layout

```text
.
├─ src/                         React/TypeScript desktop frontend
│  ├─ App.tsx                    App composition
│  ├─ appCore.ts                 Shared model, constants, migrations, URL helpers
│  ├─ components/                UI components
│  ├─ hooks/                     App behavior hooks
│  ├─ i18n/                      vi/en/zh dictionaries and provider
│  ├─ types/                     Shared UI state types
│  └─ newtab.ts                  Internal new-tab URL helpers
├─ public/                       Static assets served by Vite/Tauri frontend
│  └─ newtab.html                Internal new-tab page
├─ src-tauri/                    Rust backend and Tauri configuration
│  ├─ src/lib.rs                 Native commands and startup processing
│  ├─ tauri.conf.json            App bundle, CSP, updater endpoint
│  ├─ capabilities/default.json  Tauri permission set
│  └─ icons/                     Bundle icons
├─ landing/                      Standalone static landing page
├─ docs/assets/                  README/documentation assets
├─ openspec/                     Design/spec notes
└─ .github/workflows/            CI and release automation
```

## Requirements

For frontend development:

- Node.js 20+
- npm

For desktop development:

- Rust stable
- Tauri-supported desktop environment
- Windows: Microsoft Edge WebView2 Runtime, Visual Studio 2022 Build Tools with C++ workload, and the Rust MSVC toolchain
- Linux: Tauri native dependencies such as `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` or distribution equivalent, `librsvg2-dev`, `patchelf`, `build-essential`, and `libssl-dev`

## Development Commands

Install dependencies:

```bash
npm install
```

Run the Vite-only frontend:

```bash
npm run dev
```

Run the desktop app in Tauri dev mode:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Build desktop bundles:

```bash
npm run tauri build
```

Run frontend tests:

```bash
npm test
```

Run Rust checks/tests:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Vite is configured for Tauri on port `1420` with `strictPort: true`. If that port is occupied, `npm run tauri dev` will fail until the port is freed.

## Testing Notes

Frontend tests use Vitest with `jsdom` and live under `src/**/*.test.{ts,tsx}`. Tauri-specific APIs are mocked per test where needed.

CI currently runs:

- `npx tsc --noEmit`
- `npm test`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`

Web-only development is useful for shell UI work, pure state logic, and most React tests. It is not sufficient for validating native child webviews, real AI site embedding behavior, profile session isolation, native downloads, full backup/restore, updater behavior, or platform file-manager integration. Use `npm run tauri dev` for those areas.

## Landing Page

The `landing/` directory is a standalone static page deployed by GitHub Pages:

```text
landing/index.html
landing/styles.css
landing/script.js
landing/assets/
```

It does not share the React app runtime. Changes to the landing page should be reviewed separately from desktop app changes unless a deployment workflow explicitly ties them together.

## Release Checklist

Before tagging a release, keep version values aligned across:

- `package.json`
- `src/appCore.ts`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Then run the relevant local checks:

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Push a `v*` tag to trigger `.github/workflows/release.yml`.

## License

MIT. See [LICENSE](./LICENSE).
