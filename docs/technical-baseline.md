# Technical baseline before v0.1.11 hardening

Baseline date: 2026-07-16

## Source state used as the rollback baseline

- Branch: `release/v0.1.10`
- Commit: `0b856b9ea6aab33a2f86c60435009dfd25e41d1a`
- Rollback release: `v0.1.10`
- Product version: `0.1.10`
- Supported product platform: Windows 10/11 with Edge WebView2 Evergreen
- Experimental build targets: macOS and Linux

Version values are locked in these files:

- `package.json`
- `src/appCore.ts`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## Toolchain observed locally

- Tauri: `2.11.2`
- Wry: `0.55.1`
- `@tauri-apps/api`: `2.11.0`
- `@tauri-apps/cli`: `2.11.2`

## Baseline verification

The following checks passed from the baseline commit on Windows:

| Check | Result |
|---|---|
| `npm test` | PASS, 30 files and 542 tests |
| `npm run build` | PASS |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS, 20 tests |

These checks establish a compilation and unit-test baseline. They do not prove
installer behavior, real provider login, OAuth, popup handling, Authenticode,
or updater behavior on a clean machine.

## File ownership order

Only one integration owner should modify each central file in a wave:

| File | Integration order |
|---|---|
| `src-tauri/src/lib.rs` | Webview policy, then backup/diagnostics integration |
| `src/App.tsx` | Native event integration, then onboarding/support integration |
| `src/appCore.ts` | Template/state migration owner only |
| `src/components/Pane.tsx` | Webview/New Tab owner only during W1 |
| `src/hooks/useBackupAndUpdates.ts` | Backup owner, then diagnostics integration |
| `.github/workflows/release.yml` | Release trust owner only |
| `src-tauri/tauri.conf.json` | Release trust owner only; updater key changes require a separate rotation plan |
