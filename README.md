# AI Chat Multiplexer

A local-first desktop command center for comparing, coordinating, and keeping multiple AI chats alive side by side.

![Status](https://img.shields.io/badge/status-active-success) ![Version](https://img.shields.io/badge/version-0.1.10-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![React](https://img.shields.io/badge/React-19-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Languages: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

---

## One workspace. Every AI conversation.

AI Chat Multiplexer turns your desktop into a focused AI operations room: Claude in one pane, ChatGPT in another, Gemini beside your research tool, and separate Work/Personal accounts kept safely apart.

No more tab hunting. No more logging in and out. No more losing context while one model is still thinking.

![AI Chat Multiplexer desktop workspace preview](./docs/assets/ai-multiplexer-hero.png)

<p align="center">
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/latest"><strong>Download the latest release</strong></a>
  ·
  <a href="https://github.com/hoan9an/ai-chat-multiplexer/releases/tag/v0.1.10">View v0.1.10</a>
  ·
  <a href="#quick-start">Run from source</a>
</p>

---

## Built for the way AI power users work

Modern AI work is rarely one-chat-at-a-time. You compare answers, run parallel prompts, keep project context open, and switch between accounts. Browser tabs can do it, but they quickly become noisy and fragile.

AI Chat Multiplexer gives you a terminal-multiplexer style workspace for AI:

- ask multiple models the same question and compare responses in real time;
- keep research, writing, coding, and review chats visible together;
- separate client, work, personal, and experimental accounts with isolated profiles;
- keep important sessions open across app restarts;
- use AI websites that block iframe embedding through native Tauri webviews.

---

## Highlights

### Multi-pane AI workspace

Split one desktop window into focused panes. Use focus mode, 2-column, 3-column, or 4-column layouts, then drag panes into the order that matches your workflow.

### Chrome-style profile isolation

Profiles are real browser-session containers. Each profile has its own cookies, storage, cache, and login session, so Work and Personal accounts can stay signed in at the same time without leaking into each other.

### Tabs inside every pane

Each pane can hold multiple tabs with their own URL, title, favicon, and loading state. Reorder tabs, move tabs between panes that share a profile, or detach a tab into a new pane.

### Native webviews, not fragile iframes

Many AI services block iframe embedding with CSP or `X-Frame-Options`. AI Chat Multiplexer uses native Tauri child webviews, so those sites can run like normal desktop browser surfaces.

### Local-first state

Your workspaces, panes, tabs, profiles, theme, and layout are stored locally. The app is designed as a desktop shell for the services you choose, not a hosted proxy for your chats.

### Backup and restore

Export/import configuration as JSON, or create a full ZIP backup that can include workspaces, panes, tabs, profile mappings, and profile session files. Full backups may contain cookies/session data, so treat them like private secrets. Session restore is best-effort and protected sites may still require signing in again on another machine or Windows user.

### Auto-update ready

The desktop app can check GitHub releases. Signed releases can be downloaded, installed, and relaunched through the Tauri updater; fallback environments open the release page.

---

## Common workflows

| Workflow | How AI Chat Multiplexer helps |
|---|---|
| Model comparison | Open Claude, ChatGPT, Gemini, and Perplexity side by side and ask the same question. |
| Research + drafting | Keep a research pane visible while another AI writes, edits, or summarizes. |
| Account separation | Use Work, Personal, Client, or Lab profiles with separate login sessions. |
| Long-running prompts | Let one model think while you continue working in another pane. |
| Project context | Keep dedicated workspaces for clients, repos, topics, or experiments. |
| Local tooling | Open localhost apps, docs, dashboards, or local AI tools beside hosted AI chats. |

---

## Privacy and security model

AI Chat Multiplexer is local-first:

- external AI sites run in native desktop webviews;
- browser storage is isolated per profile via separate data directories;
- workspace state is stored locally;
- full backups can include sensitive session files and should be protected accordingly;
- session restore does not decrypt, export, or bypass cookies, tokens, DPAPI, app-bound encryption, or site protections.

Because this is a browser-shell style desktop app, only use trusted services and avoid exposing privileged Tauri commands to untrusted web content.

---

## Quick start

### Download the app

Get the latest installer from GitHub Releases:

- Latest release: <https://github.com/hoan9an/ai-chat-multiplexer/releases/latest>
- Current app version: `0.1.10`

On Windows, install the `.exe`/`.msi` artifact from the release page. Microsoft Edge WebView2 Runtime is required and is normally already present on Windows 10/11.

### Run from source

Requirements:

- Node.js 20+
- npm
- Rust stable
- Tauri-supported desktop environment
- Windows: Visual Studio 2022 Build Tools with C++ workload and Rust MSVC toolchain

```bash
npm install
npm run tauri dev
```

Build the desktop app:

```bash
npm run tauri build
```

Web-only development is also available, but many AI sites intentionally block iframe rendering. Use desktop mode for realistic testing.

```bash
npm run dev
```

---

## Compact tech stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite 7 |
| Native backend | Rust |
| State storage | `localStorage` |
| Session isolation | Tauri webview `data_directory` per profile |
| Styling | Plain CSS |
| Tests | Vitest + Testing Library + jsdom |

---

## Development

Useful commands:

```bash
npm install
npm run dev
npm run tauri dev
npm run build
npm run tauri build
npm test
```

Linux/WSL builds need Tauri native dependencies such as `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `build-essential`, and `libssl-dev`.

When changing native webviews, sessions, downloads, backup/restore, or updater behavior, smoke-test the desktop app rather than relying only on web dev mode.

---

## Version

Current app version: `0.1.10`

---

## Author

Made by **An** with AI-assisted development.

---

## License

MIT — see [LICENSE](./LICENSE).
