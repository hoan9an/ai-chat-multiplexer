# AI Chat Multiplexer

Desktop workspace for running multiple AI chat sessions side by side, with Chrome-style isolated profiles for using multiple accounts at the same time.

![Status](https://img.shields.io/badge/status-active-success) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Languages: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## Overview

AI Chat Multiplexer is a local-first desktop app for people who work with many AI tools at once. Instead of juggling dozens of browser tabs, you can split one desktop window into multiple panes and run Claude, ChatGPT, Gemini, Perplexity, DeepSeek, local tools, or any URL side by side.

The app uses real native Tauri webviews instead of iframes, so modern AI sites that block iframe embedding can still run normally in the desktop app.

---

## Why this exists

When working with AI, it is common to:

- ask several models the same question,
- keep one AI writing while another is researching,
- compare Work and Personal accounts,
- wait for long responses and switch to another task,
- keep multiple project contexts open at the same time.

Normal browser tabs become messy quickly. AI Chat Multiplexer gives AI workflows a terminal-multiplexer style layout: multiple panes, multiple tabs, separate profiles, one focused workspace.

---

## Core features

### Workspaces

- Create multiple workspaces such as `Work`, `Personal`, `Research`, or per-project spaces.
- Each workspace owns its own pane layout.
- Rename and delete workspaces from inside the app.
- App state is restored from local storage when reopened.

### Flexible pane layout

- Focus mode for one pane.
- 2-column, 3-column, and 4-column layouts.
- Column count is automatically capped by the number of panes.
- Drag panes to reorder them.
- Maximize one pane without losing the rest of the workspace.

### Chrome-style profiles

Profiles are browser session containers, not provider-specific presets.

- Each profile has its own cookie/storage/session directory.
- Use `Work`, `Personal`, or any custom profile name.
- Same profile in multiple panes means shared login/session.
- Different profiles mean isolated accounts.
- Deleting a pane does not delete its profile/session.
- Profiles cannot be deleted while still used by open panes.

### Tabs inside panes

- Each pane supports multiple tabs.
- Each tab has its own URL, title, favicon, and loading state.
- URL bar supports direct URLs, localhost URLs, and search queries.
- Back, forward, and reload controls are available per active tab.
- Tabs can be reordered.
- Tabs can move across panes when both panes use the same profile.
- Tabs can be detached into new panes.

### Native webview engine

Most AI websites block iframes with `X-Frame-Options` or CSP. AI Chat Multiplexer avoids that by using Tauri native child webviews.

How it works:

1. React renders an empty `webview-shell` placeholder for each active pane.
2. React measures the placeholder rectangle.
3. Tauri creates or moves a native webview to match that rectangle.
4. The native webview uses the selected profile's session directory.
5. When menus, modals, downloads, or drag overlays are open, native webviews are hidden so they do not cover the React UI.

### Downloads

- Downloads initiated inside native webviews are handled by Rust/Tauri.
- The app shows download toasts.
- Completed downloads can be opened or revealed in the file manager.
- Includes a Windows WebView2 workaround for download-finished events that may not fire reliably.

### Backup and restore

- Export/import app configuration as JSON.
- Full backup can include profile sessions/cookies as a ZIP.
- Restore session backups from ZIP.

> **Security note:** full backups may contain login sessions/cookies. Keep them private and do not share them.

### Updates

- The app can check the latest GitHub release.
- If a newer version is available, it opens the release page.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Desktop runtime | Tauri 2 |
| Native backend | Rust |
| State storage | `localStorage` |
| Browser session storage | Tauri webview `data_directory` per profile |
| Styling | Plain CSS |
| Tests | Vitest + Testing Library + jsdom |
| Icons | Inline custom SVG components |

---

## Project structure

```text
.
├── src/
│   ├── App.tsx                         # Composition root
│   ├── appCore.ts                      # Types, constants, helpers, state migrations
│   ├── newtab.ts                       # New-tab URL helpers
│   ├── main.tsx                        # React entrypoint
│   ├── App.css                         # Theme and layout styles
│   ├── Icons.tsx                       # Inline SVG icons
│   ├── components/
│   │   ├── AppHeader.tsx               # Top bar, workspace/menu/layout controls
│   │   ├── AppOverlays.tsx             # Modals, settings, downloads overlays
│   │   ├── Pane.tsx                    # Pane UI, tab strip, URL bar, drag interactions
│   │   ├── PaneGrid.tsx                # Pane grid renderer
│   │   ├── SettingsModal.tsx           # Theme, update, backup/restore settings
│   │   ├── WorkspaceSwitcher.tsx       # Workspace dropdown
│   │   ├── DownloadsPanel.tsx          # Downloads history panel
│   │   ├── DownloadToastStack.tsx      # Download toast UI
│   │   └── Modals.tsx                  # Confirm/text prompt modals
│   ├── hooks/
│   │   ├── useAppPersistence.ts        # localStorage state/theme persistence
│   │   ├── useNativeWebviews.ts        # React-to-native webview positioning/sync
│   │   ├── useNativeTabStatus.ts       # Poll native title/url/favicon/loading state
│   │   ├── usePaneActions.ts           # Pane/tab/url/navigation state transitions
│   │   ├── useProfileWorkspaceActions.ts
│   │   ├── useDownloadManager.ts
│   │   ├── useBackupAndUpdates.ts
│   │   ├── useDerivedWorkspaceState.ts
│   │   ├── useDragState.ts
│   │   ├── useFocusedPaneCleanup.ts
│   │   ├── useMenuStates.ts
│   │   └── usePromptDialogs.ts
│   └── types/
│       └── dialogs.ts
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                      # Tauri commands and native webview backend
│   │   └── main.rs
│   ├── capabilities/default.json
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── tauri.conf.json
├── public/
│   ├── newtab.html
│   └── tauri.svg
├── scripts/
│   └── gen-icon-source.mjs
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── README.md
```

---

## Architecture

### Data model

```text
AppState
├── workspaces[]
│   ├── id
│   ├── name
│   ├── columns
│   └── panes[]
│       ├── id
│       ├── title
│       ├── profileId
│       ├── activeTabId
│       └── tabs[]
│           ├── id
│           ├── title
│           ├── url
│           ├── loadedUrl
│           ├── currentUrl
│           ├── faviconUrl
│           └── isLoading
├── activeWorkspaceId
└── profiles[]
    ├── id
    └── name
```

### URL semantics

The app separates commanded navigation from observed browser navigation:

- `loadedUrl` is the last URL the app explicitly asked the native webview to load.
- `currentUrl` is the URL observed from the native webview after redirects or SPA route changes.
- The address bar displays the observed URL, but observed SPA route changes must not be fed back into `load_url`, otherwise sites like Gemini can reload and lose in-page state.

### Native webview lifecycle

```text
React Pane
  └── webview-shell DOM rectangle
        ↓
useNativeWebviews
  └── native_webview_upsert(profileId, label, url, x, y, width, height)
        ↓
Rust/Tauri
  └── WebviewBuilder::new(label, url)
      .data_directory(profile_session_directory)
      .enable_clipboard_access()
```

Native webview labels are based on tab IDs so moving a tab does not destroy its webview state.

### Profile session isolation

Each profile maps to an isolated session directory:

```text
app_data_dir/pane-sessions/<profile_id>/
```

This isolates cookies, localStorage, IndexedDB, cache, and login sessions between profiles.

---

## Core invariants

When modifying the app, keep these rules intact:

1. Native webview labels must remain stable for a tab across pane moves.
2. Profile IDs map to isolated Tauri `data_directory` folders.
3. A pane should not become permanently empty.
4. A workspace should always have a valid active workspace fallback.
5. Cross-pane tab moves are allowed only when profiles match.
6. Native webviews should be hidden while menus, modals, download panels, or drag overlays are active.
7. Passive native status polling must not trigger native reloads.
8. State migrations must preserve existing user workspaces/profiles/tabs.

---

## Requirements

### General

- Node.js 20+ recommended
- npm
- Rust stable
- Tauri-supported desktop environment

### Windows

- Windows 10/11
- Microsoft Edge WebView2 Runtime
- Visual Studio 2022 Build Tools with C++ workload
- Rust MSVC toolchain

### Linux/WSL

For Linux builds, install Tauri native dependencies such as:

```bash
sudo apt-get update
sudo apt-get install -y \
  libdbus-1-dev \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev
```

---

## Setup

Install dependencies:

```bash
npm install
```

Run web-only development mode:

```bash
npm run dev
```

Run desktop development mode:

```bash
npm run tauri dev
```

Build frontend only:

```bash
npm run build
```

Build desktop app:

```bash
npm run tauri build
```

---

## Testing

Run the full test suite:

```bash
npm test
```

Run watch mode:

```bash
npm run test:watch
```

Run Vitest UI:

```bash
npm run test:ui
```

The tests cover:

- state helpers and migrations,
- workspace/profile actions,
- pane/tab behavior,
- native webview sync calls,
- native tab status polling,
- backup/update flows,
- download state management,
- components and overlays.

---

## Manual desktop smoke test

Use this checklist for changes involving native webviews, sessions, downloads, or layout:

1. Start the desktop app.
2. Open two panes with the same profile and confirm the session is shared.
3. Open two panes with different profiles and confirm login sessions are isolated.
4. Open Gemini, create a new chat, type a message, and confirm there is no flicker/reload that loses the conversation.
5. Open settings while a webview is visible and confirm the modal is not covered.
6. Drag panes and confirm webviews hide/reappear correctly.
7. Drag tabs within a pane.
8. Drag tabs across panes with the same profile.
9. Confirm cross-profile tab moves are blocked.
10. Download a file and confirm toast/open/reveal behavior.
11. Export config JSON.
12. Create a full backup and restore it in a controlled test profile.

---

## Build outputs

Tauri build artifacts are generated under:

```text
src-tauri/target/release/bundle/
```

On Windows, typical outputs include:

```text
src-tauri/target/release/bundle/nsis/*.exe
src-tauri/target/release/bundle/msi/*.msi
```

---

## Security model

AI Chat Multiplexer is designed as a local-first app.

Important security notes:

- External websites run in native webviews.
- Profiles isolate browser storage via separate data directories.
- Full backups can include cookies/session data and should be treated as private secrets.
- CSP is disabled in Tauri config to support arbitrary external websites. This is a deliberate browser-shell tradeoff.
- Do not expose privileged Tauri commands to untrusted external web content.

---

## Troubleshooting

### Website does not render in web dev mode

This is expected for many AI sites. Web dev mode uses iframe fallback and modern AI sites often block iframes.

Use desktop mode instead:

```bash
npm run tauri dev
```

### Tests or build say `Permission denied` on WSL

If local npm binaries lose executable bits, run:

```bash
chmod +x node_modules/.bin/vitest node_modules/.bin/tsc node_modules/.bin/vite node_modules/.bin/tauri
```

Then rerun:

```bash
npm test
npm run build
```

### Rollup optional dependency error

If you see an error such as missing `@rollup/rollup-*`, reinstall dependencies:

```bash
npm install
```

### Tauri Linux build fails on missing `dbus-1` or `webkit2gtk-4.1`

Install the Linux packages listed in the Linux/WSL requirements section.

### Windows build fails on MSVC/linker errors

Install Visual Studio 2022 Build Tools with the C++ workload, then reopen the terminal so PATH updates.

---

## Version

Current app version: `0.1.5`

---

## Author

Made by **An** with AI-assisted development.

---

## License

MIT — see [LICENSE](./LICENSE).
