## 1. Native backup/restore metadata

- [x] 1.1 Add reserved ZIP metadata support for embedded app state without extracting metadata into `pane-sessions`.
- [x] 1.2 Update full backup scheduling/processing so generated ZIPs contain both session data and embedded app-state metadata while still writing the sidecar JSON.
- [x] 1.3 Update restore staging to read embedded app state first, fall back to same-basename sidecar JSON for older ZIPs, and persist staged app-state metadata for startup result consumption. ← (verify: ZIPs with embedded state and older ZIP+sidecar both stage the expected config payload)

## 2. Startup restore application and validation

- [x] 2.1 Extend startup restore result data to include app-state/config restore status, restored app-state payload when valid, and validation warnings.
- [x] 2.2 Validate restored app-state profile references against staged/restored session directories and report warnings without corrupting existing app state.
- [x] 2.3 Preserve safe rollback behavior when session replacement or config parsing fails. ← (verify: failed restore paths do not delete existing live session data or replace current app state with invalid config)

## 3. Frontend restore orchestration

- [x] 3.1 Add shared app-state normalization/validation helper so JSON import and restore startup config use the same rules.
- [x] 3.2 Consume startup restore results, apply restored app state before native webviews start, and persist it through existing app persistence.
- [x] 3.3 Gate/suspend native webview creation during startup restore result processing to prevent stale profile/session use. ← (verify: after startup restore with config payload, child webviews are not upserted until the restored state is applied)

## 4. User feedback and compatibility

- [x] 4.1 Update backup/restore dialogs and i18n strings to distinguish full restore success, config restore success/failure, and profile/session warnings.
- [x] 4.2 Preserve existing direct JSON import/export behavior and existing restart prompts.
- [x] 4.3 Keep older backup compatibility documented in behavior/tests. ← (verify: restore from ZIP without embedded metadata but with sidecar JSON remains supported)

## 5. Tests and verification

- [x] 5.1 Add Rust tests for embedded metadata, sidecar fallback, metadata skip during extraction, and validation warnings.
- [x] 5.2 Add frontend tests for startup restore applying config before webview startup and for malformed/missing config paths.
- [x] 5.3 Run targeted frontend and Rust tests, then run the broader test suite if practical. ← (verify: all backup/restore regressions pass and no unrelated files are edited to hide failures)
