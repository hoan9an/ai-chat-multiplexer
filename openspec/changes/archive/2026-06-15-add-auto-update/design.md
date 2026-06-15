## Context

The app is a Tauri 2 + React 19 + Vite desktop application. Today the "update" feature in `src/hooks/useBackupAndUpdates.ts` only calls the GitHub REST API (`/repos/{repo}/releases/latest`), compares the tag against `APP_VERSION`, and — if newer — opens the GitHub releases page in the browser via `openReleasePage()`. The user must then manually download the installer and run it.

Tauri 2 ships an official `tauri-plugin-updater` that downloads and installs signed update artifacts and (with `tauri-plugin-process`) relaunches the app. This is the supported, secure path and replaces the manual flow.

Constraints:
- Security-sensitive: the updater installs executable artifacts. Signature verification with an Ed25519 public key is mandatory and must not be disabled.
- The PRIVATE signing key must never be committed. It lives only in GitHub Actions secrets.
- Three UI languages (vi/en/zh) must stay in sync.
- Web (non-Tauri) runtime has no updater — it must degrade gracefully to the existing "open releases page" behavior.

## Goals / Non-Goals

**Goals:**
- Replace manual download with check → download → install → relaunch, driven from Settings.
- Verify update authenticity via the Tauri updater's signature check before install.
- Surface download progress and an explicit "install & restart" action in the UI.
- Provide a GitHub Actions workflow that builds, signs, and publishes updater artifacts + `latest.json` so the updater endpoint resolves.
- Keep web fallback working (link to releases page).

**Non-Goals:**
- Silent/background auto-install without user action (the user clicks to start; this keeps control with the user).
- Delta/differential updates.
- Auto-check on every launch (kept as an explicit user action in Settings, matching current behavior). A future enhancement could add launch-time checks.
- Generating or storing the private signing key (documented manual step for the maintainer).

## Decisions

**Decision: Use `tauri-plugin-updater` + `tauri-plugin-process` over a hand-rolled downloader.**
Rationale: Official plugin handles platform-specific install (NSIS/MSI on Windows, `.app`/dmg on macOS, AppImage on Linux), signature verification, and the `latest.json` manifest protocol. A hand-rolled fetch+exec would have to reimplement signature verification — exactly the security-critical part. Alternative considered: keep `fetch` + shell out to the installer — rejected (no signature guarantee, fragile per-platform).

**Decision: GitHub Releases `latest.json` endpoint.**
Endpoint: `https://github.com/davidhoang-crypto/ai-chat-multiplexer/releases/latest/download/latest.json`. Rationale: free, already where releases live, supported by `tauri-action`. Alternative: self-hosted endpoint — rejected (extra infra).

**Decision: Public key in `tauri.conf.json`, private key only in CI secrets.**
The agent inserts a clearly-marked placeholder pubkey and documents the `npm run tauri signer generate` step. Rationale: committing a private key would compromise the whole update channel. The maintainer must generate the keypair and set `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as repo secrets, and paste the public key into `tauri.conf.json`.

**Decision: Extend `UpdateStatus` rather than replace it.**
New states: `downloading` (with progress 0–100 / bytes), `installing`, `ready-to-relaunch`. Keep `idle|checking|available|current|error`. Rationale: minimal churn to `SettingsModal` and existing tests; additive.

**Decision: Web runtime keeps `openReleasePage` fallback.**
`check()` from the plugin only works under Tauri. In a browser (`!isTauriRuntime()`), fall back to the existing GitHub API fetch + open releases page so the dev/web build still functions.

## Risks / Trade-offs

- [Placeholder pubkey ships in config] → Updater will refuse to verify real artifacts until the maintainer replaces it. Documented prominently in tasks + a code comment; the app still builds and runs (update check simply errors at verify time, which is the safe failure mode).
- [Private key mismanagement] → Tasks explicitly instruct never to commit it; `.gitignore` guidance added; key only referenced by env var in CI.
- [Endpoint 404 before first signed release] → `check()` errors are caught and surfaced as a normal "error" status; no crash.
- [macOS/Windows signing vs updater signing are different concerns] → Updater signature (Ed25519) is separate from OS code-signing. We require the updater signature; OS code-signing is out of scope and noted as a follow-up (unsigned binaries may show OS warnings but updater still verifies integrity).
- [Test environment has no Tauri] → Tests mock `@tauri-apps/plugin-updater` / `plugin-process`; web fallback path is unit-testable.

## Migration Plan

1. Add deps, register plugin, add config + capabilities, generate keypair (maintainer), publish a signed release via the new workflow.
2. Rollback: revert the plugin registration and restore `openReleasePage` as the primary action; existing releases remain downloadable manually.
