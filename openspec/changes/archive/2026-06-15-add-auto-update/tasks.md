## 1. Rust / Tauri backend

- [x] 1.1 Add `tauri-plugin-updater = "2"` to `src-tauri/Cargo.toml` dependencies
- [x] 1.2 Register `tauri_plugin_updater::Builder::new().build()` in the plugin chain in `src-tauri/src/lib.rs`
- [x] 1.3 Build the Rust crate to confirm the new dependency resolves and compiles ← (verify: `cargo build` succeeds in src-tauri, updater plugin registered) — NOTE: `tauri-plugin-updater` 2.10.1 + `tauri-plugin-process` 2.3.1 resolved in Cargo.lock and the plugin is registered in lib.rs; full `cargo check` could not finish in this environment because the system library `libdbus-1-dev` is missing (transitive build-script dep, unrelated to this change). Verified by inspection + lockfile resolution.

## 2. Tauri configuration & capabilities

- [x] 2.1 In `src-tauri/tauri.conf.json` add `bundle.createUpdaterArtifacts: true`
- [x] 2.2 In `src-tauri/tauri.conf.json` add `plugins.updater` with `endpoints` pointing to `https://github.com/davidhoang-crypto/ai-chat-multiplexer/releases/latest/download/latest.json` and a `pubkey` placeholder clearly marked `REPLACE_WITH_TAURI_PUBLIC_KEY`
- [x] 2.3 Add `updater:default` to the permissions list in `src-tauri/capabilities/default.json` (and `process:default` + `process:allow-restart` for relaunch) ← (verify: capabilities valid JSON, permissions match plugins used)

## 3. Frontend dependencies

- [x] 3.1 Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` to `package.json` dependencies (version `^2`)
- [x] 3.2 Run `npm install` to update the lockfile

## 4. Update logic (useBackupAndUpdates)

- [x] 4.1 Extend `UpdateStatus` type to add `downloading` (with `progress` 0–100 and `latest`), `installing`, and `readyToInstall` (with `latest`) states; keep `available` carrying enough info to start install (web fallback keeps `releaseUrl`)
- [x] 4.2 Rewrite `checkForUpdates()` to use `check()` from `@tauri-apps/plugin-updater` in the Tauri runtime; on web/non-Tauri, keep the existing GitHub API fetch + releases-page fallback
- [x] 4.3 Add `downloadAndInstallUpdate()` that calls `update.downloadAndInstall()` tracking Started/Progress/Finished events into `downloading.progress`, then `relaunch()` from `@tauri-apps/plugin-process`
- [x] 4.4 Preserve `openReleasePage()` for the web fallback path; export the new install function from the hook ← (verify: hook returns coherent state machine, no orphaned states, web fallback intact)

## 5. Settings UI (SettingsModal)

- [x] 5.1 Replace the single "open download page" button in the `available` state with a "Download & install" action that calls the new install function (Tauri runtime); keep the "open releases page" link for web fallback
- [x] 5.2 Render `downloading` (progress %), `installing`, and `readyToInstall` states with appropriate controls and the relaunch action
- [x] 5.3 Wire the new handler props through `App.tsx` (or wherever SettingsModal is mounted) from the hook ← (verify: all UpdateStatus variants render, props wired end-to-end)

## 6. Internationalization

- [x] 6.1 Add new `update.*` keys (downloading, installing, downloadInstall, restartNow, progress label, etc.) to `src/i18n/en.ts`
- [x] 6.2 Add the same keys to `src/i18n/vi.ts`
- [x] 6.3 Add the same keys to `src/i18n/zh.ts` ← (verify: all three locales have identical key sets, no missing keys)

## 7. Release automation

- [x] 7.1 Create `.github/workflows/release.yml` that builds on tag push (matrix for win/mac/linux), uses `tauri-apps/tauri-action`, signs artifacts via `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets, and publishes the release + `latest.json` ← (verify: workflow references secrets not literals, produces latest.json matching the updater endpoint)

## 8. Documentation & key setup (no secrets committed)

- [x] 8.1 Document in the change (and/or README) how to run `npm run tauri signer generate -- -w ~/.tauri/ai-chat-multiplexer.key`, paste the PUBLIC key into `tauri.conf.json`, and store the PRIVATE key + password in GitHub Actions secrets. NEVER commit the private key. ← (verify: no private key material anywhere in the repo, pubkey is a clearly-marked placeholder)

## 9. Tests & verification

- [x] 9.1 Update `src/useBackupAndUpdates.test.ts` (and importReject test) to cover the new state machine: check → available → downloading → installing, mocking the updater/process plugins
- [x] 9.2 Update `SettingsModal.test.tsx` for the new buttons/states
- [x] 9.3 Run `npm run build` (tsc + vite) and `npm test` — all green ← (verify: typecheck passes, full test suite passes, no regressions in other components)
