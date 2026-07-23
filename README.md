# AI Chat Multiplexer

A local-first desktop workspace for running multiple AI web apps side by side while keeping projects and browser sessions organized.

[![CI](https://github.com/hoan9an/ai-chat-multiplexer/actions/workflows/ci.yml/badge.svg)](https://github.com/hoan9an/ai-chat-multiplexer/actions/workflows/ci.yml)

Languages: [English](./README.md) · [Tiếng Việt](./README.vi.md) · [中文](./README.zh.md)

![AI Chat Multiplexer desktop workspace](./docs/assets/ai-multiplexer-hero.png)

[Download the latest release](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest) · [Known issues](./docs/support/known-issues.md) · [Build from source](#build-from-source)

## Why use it?

AI work often spans several models, accounts, and projects. AI Chat Multiplexer keeps those workflows in one desktop window without turning them into one shared browser session.

| Need | What the app provides |
|---|---|
| Compare models | Place multiple AI services in adjacent panes. |
| Keep projects organized | Save panes and tabs in separate workspaces. |
| Separate accounts | Give each profile its own cookies, storage, cache, and login session. |
| Keep working in parallel | Leave a long-running task open while using another pane. |
| Open iframe-blocked services | Render external sites in native Tauri child webviews instead of ordinary iframes. |

## Core capabilities

- Workspaces with independent pane layouts and tab state.
- Focus mode and one- to four-column layouts with drag-and-drop pane ordering.
- Tabs that can be reordered, detached, or moved between panes using the same profile.
- Profile-level browser session isolation through dedicated Tauri webview data directories.
- Native downloads, managed new-window routing, update checks, and redacted local diagnostics.
- Optional onboarding and ready-made workflows for comparison, coding review, and research.
- English, Vietnamese, and Chinese interfaces.

The React interface owns the workspace model and layout. The Rust/Tauri backend owns native child webviews, profile session directories, downloads, backup/restore, and other privileged desktop operations. External AI services remain responsible for their own accounts, content, and policies; the app does not proxy provider traffic or bypass provider protections.

## Backup and privacy

The two backup modes serve different purposes:

- **Configuration export** stores workspace, pane, tab, and profile definitions only.
- **Full backup** stores app-state metadata and profile session files in a passphrase-encrypted archive.

The app does not store the full-backup passphrase. Keep it somewhere safe: a forgotten passphrase cannot be recovered. A full backup can contain cookies and other sensitive session material, so handle the encrypted file as private data.

Restore is best-effort: protected services may require sign-in again after moving to another device or Windows user.

## Platform support

| Platform | Status | Notes |
|---|---|---|
| Windows 10/11 x64 | Supported beta | Requires Microsoft Edge WebView2 Evergreen, normally present on supported Windows versions. |
| macOS | Experimental | Artifacts may be available for evaluation, but this is not a supported beta target. |
| Linux | Experimental | Desktop behavior depends on the distribution and WebKitGTK environment. |

Windows installers may not be Authenticode-signed and can trigger an unknown-publisher warning. Check the [latest release notes](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest) for the exact signing status, artifacts, and known limitations of the build you download.

Detailed contracts: [Windows](./docs/support/windows-support-contract.md) · [macOS](./docs/support/macos-support-contract.md) · [Linux](./docs/support/linux-support-contract.md)

## Download and run

1. Open [GitHub Releases](https://github.com/hoan9an/ai-chat-multiplexer/releases/latest).
2. Read the release notes, then choose the artifact for your platform.
3. On Windows, install the `.exe` or `.msi` package and review any publisher warning before continuing.
4. Create profiles for accounts that must remain isolated, then arrange services into panes and workspaces.

## Build from source

Requirements:

- Node.js 20+ and npm.
- Stable Rust and the prerequisites for a [Tauri desktop build](https://v2.tauri.app/start/prerequisites/).
- On Windows, Visual Studio 2022 Build Tools with the C++ workload, the Rust MSVC toolchain, and WebView2.

```bash
npm install
npm run tauri dev
```

`npm run dev` starts the web-only shell. It is useful for interface work, but it cannot validate native webviews, isolated profile sessions, downloads, encrypted backup/restore, or updater behavior.

Run the main local checks before submitting a change:

```bash
npm run build
npm test
npm run test:release
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Architecture and repository map

```text
React app shell and local workspace state
                │
                ▼
       typed Tauri commands/events
                │
                ▼
Rust backend ── native child webviews ── external AI services
       │
       ├─ profile session directories
       └─ downloads, backup/restore, diagnostics, updater
```

- [`src/`](./src/) — React/TypeScript interface, state, hooks, and translations.
- [`src-tauri/`](./src-tauri/) — Rust backend, Tauri configuration, permissions, and bundle assets.
- [`landing/`](./landing/) — standalone static product page; it is separate from the desktop runtime.
- [`docs/`](./docs/) — support contracts, known issues, security notes, and release procedures.
- [`.github/workflows/`](./.github/workflows/) — CI and release automation.

The technical baseline is documented in [`docs/technical-baseline.md`](./docs/technical-baseline.md).

## Releases and versioning

The release number is intentionally not repeated in this README. The `releases/latest` URL always points readers to the current published release.

Version values are maintained in `package.json`, `src/appCore.ts`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. [`scripts/validate-version-lock.mjs`](./scripts/validate-version-lock.mjs) verifies that those sources and the release tag agree. See the [release gate runbook](./docs/release/release-gate-runbook.md) for the maintained process.

README content should change when product behavior, support policy, or contributor workflow changes—not for a routine version bump.

## Support and contributing

- Review [known issues](./docs/support/known-issues.md) and the [beta support policy](./docs/support/beta-support-policy.md) before reporting a problem.
- Search or open a [GitHub issue](https://github.com/hoan9an/ai-chat-multiplexer/issues) with reproducible steps and non-sensitive diagnostics.
- Keep changes focused, add or update relevant tests, and smoke-test the desktop app whenever native behavior is affected.
- Never include cookies, tokens, private prompts, session files, signing keys, or full backups in an issue or commit.

## License

MIT. See [LICENSE](./LICENSE).
