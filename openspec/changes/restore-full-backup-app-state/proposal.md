## Why

Full backup/restore currently restores WebView2 pane session files but not the app state that maps panes to profile IDs. Restored cookies can exist on disk while the app opens a different profile/session folder, making Google/Facebook appear logged out after restore.

At the product level, copy that says full backup "includes login sessions" creates a stronger expectation than the app can safely provide. WebView2 profile files can be copied, but protected sites may bind sessions to the originating machine, Windows user, DPAPI/app-bound encryption context, or server-side policy.

## What Changes

- Embed the app state/profile mapping inside full backup ZIPs, while preserving the existing sidecar JSON for compatibility and user visibility.
- Restore full backups as a coordinated operation: staged WebView2 sessions plus restored app state applied before native webviews are created.
- Support older backups by reading the sidecar JSON with the same basename when the ZIP lacks embedded app state.
- Report startup restore results with enough detail to distinguish session restore success, config restore success, and missing profile/session warnings.
- Preserve existing direct JSON import/export and startup-safe session backup/restore behavior.
- Update UI copy, documentation, and acceptance criteria so session-file restore is described as best-effort and never as a guarantee that Google/Facebook or other protected-site logins remain signed in across computers or Windows users.

## Capabilities

### New Capabilities
- `full-backup-restore`: Full backup and restore of WebView2 pane session files together with app state/profile mapping, with explicit best-effort expectations for restored site sessions.

### Modified Capabilities
- None

## Impact

- Native backup/restore code in `src-tauri/src/lib.rs`.
- Backup/restore frontend orchestration in `src/hooks/useBackupAndUpdates.ts`.
- App state persistence/loading in `src/hooks/useAppPersistence.ts` and `src/appCore.ts` as needed.
- App/native webview startup gating in `src/App.tsx` and/or `src/hooks/useNativeWebviews.ts` if needed.
- Restore status and expectation copy in `src/i18n/en.ts`, `src/i18n/vi.ts`, and `src/i18n/zh.ts`.
- User documentation in `README.md`, `README.vi.md`, and `README.zh.md`.
- Regression coverage in frontend and Rust backup/restore tests.
