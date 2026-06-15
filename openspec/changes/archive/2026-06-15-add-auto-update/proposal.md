## Why

Today the app only checks GitHub for the latest release and opens the releases page so the user can manually download and reinstall (`src/hooks/useBackupAndUpdates.ts` `checkForUpdates`/`openReleasePage`, `src/components/SettingsModal.tsx` update section). This is friction-heavy and error-prone: users may install the wrong asset, skip updates, or run stale builds. Tauri 2 ships an official, signature-verified updater that can download, install, and relaunch in-app, removing the manual step entirely.

## What Changes

- Add `tauri-plugin-updater` (Rust + `@tauri-apps/plugin-updater`) and `@tauri-apps/plugin-process` (relaunch) to the project; register the updater plugin in `src-tauri/src/lib.rs`.
- Configure `tauri.conf.json`: `bundle.createUpdaterArtifacts = true` and `plugins.updater` with an Ed25519 `pubkey` and an `endpoints` entry pointing at the GitHub Releases `latest.json` manifest.
- Add `updater:default` permission to `src-tauri/capabilities/default.json`.
- Rewrite the update logic in `useBackupAndUpdates`: use `check()` from the updater plugin, extend `UpdateStatus` with `downloading{progress}` and `installing` states, run `downloadAndInstall` with progress reporting, then `relaunch()`. Keep a web/non-Tauri fallback that still links to the releases page.
- Update `SettingsModal` to replace the "open download page" button with a "Download & install" action plus progress/installing UI.
- Add new i18n keys for the download/installing/restart states in **all three** languages (vi/en/zh), kept in sync.
- Add a GitHub Actions release workflow (`.github/workflows/release.yml`) that builds on tag push, signs artifacts using repository secrets, and publishes the release + `latest.json` so the updater endpoint resolves.
- Document (in tasks) the manual signing-key generation step. **The private signing key is NEVER committed** — only the public key goes into `tauri.conf.json`; the private key + password live in GitHub Actions secrets.

**BREAKING**: Release process changes — releases must now be produced with updater artifacts and a valid signature, or the updater endpoint will not resolve for clients.

## Capabilities

### New Capabilities
- `auto-update`: In-app checking, signature-verified download, install, and relaunch of new application releases, including progress feedback and a non-desktop fallback.

### Modified Capabilities
<!-- None — no existing OpenSpec capability specs exist in openspec/specs/. -->

## Impact

- **Frontend**: `src/hooks/useBackupAndUpdates.ts` (update flow rewrite, new status states), `src/components/SettingsModal.tsx` (progress UI), `src/i18n/{en,vi,zh}.ts` (new keys). Existing tests `src/useBackupAndUpdates.test.ts` and `SettingsModal.test.tsx` updated for new behavior.
- **Rust**: `src-tauri/src/lib.rs` (register updater plugin), `src-tauri/Cargo.toml` (add `tauri-plugin-updater`).
- **Config**: `src-tauri/tauri.conf.json` (updater artifacts + plugin config), `src-tauri/capabilities/default.json` (updater permission), `package.json` (JS plugin deps).
- **CI/CD**: new `.github/workflows/release.yml`; requires `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets.
- **Security**: auto-installs executables; signature verification via `pubkey` is mandatory and must not be disabled.
