## Context

The app stores browser sessions in per-profile WebView2 data directories under `pane-sessions/<profile-id>`. React app layout, panes, tabs, and profile IDs are stored separately in the app's localStorage state. Full backup currently captures WebView2 session files and writes the React app state as a sidecar JSON file, but full restore stages and applies only the session ZIP. This can leave restored cookies on disk while the running app opens panes using stale profile IDs, so the user sees Google/Facebook logged out even though files were restored.

Backup and restore must remain startup-safe because WebView2 locks session databases while webviews are alive. Session replacement should continue to happen during Tauri setup before child webviews are created.

A separate product expectation issue must be fixed at the wording/spec level: copying WebView2 profile files is not the same as guaranteeing restored login validity. Protected sites can bind or invalidate sessions based on machine, Windows user, DPAPI/app-bound encryption, server risk checks, or token revocation. The app must not attempt to decrypt/export/manipulate cookies, tokens, DPAPI, or app-bound encryption to bypass those protections.

## Goals / Non-Goals

**Goals:**
- Include app state/profile mapping in full backup ZIPs so the backup is self-contained.
- Preserve the existing sidecar JSON for compatibility and user visibility.
- Stage both session data and app state during restore, then apply session data at startup before WebView2 is created.
- Apply the restored app state in the frontend before native webviews are allowed to create/navigate child WebViews.
- Support older backups that do not contain embedded app state by reading the sidecar JSON next to the selected ZIP when available.
- Report session/config restore success and validation warnings clearly after restart.
- Describe full backup/restore as copying app state and profile session files with best-effort session restore semantics.
- Tell users that restoring on another computer or Windows user may require logging into Google/Facebook and other protected sites again, while same-machine/same-Windows-user restore may preserve sessions when WebView/site protections allow it.

**Non-Goals:**
- Do not decrypt or manipulate WebView2 cookies, passwords, DPAPI keys, or app-bound encryption data.
- Do not change the existing profile ID/session directory naming scheme.
- Do not replace the separate JSON import/export feature.
- Do not guarantee that sites will accept restored sessions when the provider intentionally invalidates sessions server-side.

## Decisions

1. **Embed backup metadata inside the ZIP**
   - Add a reserved metadata entry such as `__ai_chat_multiplexer_backup/app-state.json` containing the app state JSON.
   - Rationale: the ZIP becomes the primary restore artifact, avoiding accidental restore of session files without the matching profile mapping.
   - Alternative considered: keep relying only on sidecar JSON. Rejected because sidecar files are easy to lose or mismatch.

2. **Keep sidecar JSON as compatibility layer**
   - Continue writing `<backup>.json` next to `<backup>.zip` during backup.
   - During restore, prefer embedded app state. If missing, attempt to read the sidecar JSON with the same basename.
   - Rationale: users may already have backups created by recent builds that include sidecar JSON but no embedded metadata.

3. **Stage restored app state in native startup results**
   - Native restore should extract/stage the session tree and persist the restored app state payload or return it in the startup result after apply.
   - Frontend should consume startup restore results and apply the restored state through the same validation/hydration logic used by JSON import.
   - Rationale: native code can safely replace session folders at startup, while frontend owns the React/localStorage state shape and validation.

4. **Gate native webview creation until startup restore result is processed**
   - The first render after startup restore must not create child webviews from stale localStorage state.
   - Implement a startup restore/config processing state in the frontend and pass a suspended flag to `useNativeWebviews` until restored app state is applied or explicitly unavailable.
   - Rationale: if webviews are created before state is replaced, WebView2 can load the wrong profile/session folder during the critical startup window.

5. **Validate profile/session consistency**
   - After staging/extracting the backup, validate that app state profile IDs referenced by panes have corresponding session directories in the restored tree.
   - Report warnings instead of failing restore when optional profile directories are missing, because some profiles may not have opened WebView2 data yet.
   - Rationale: this gives the user actionable feedback without making valid config-only profiles impossible to restore.

## Risks / Trade-offs

- **Provider-side session invalidation** → Mitigation: preserve all client-side WebView2 data and report that provider-side revocation is outside app control.
- **Old ZIP without embedded app state and missing sidecar** → Mitigation: restore sessions but warn that app layout/profile mapping could not be restored.
- **Malformed embedded or sidecar config** → Mitigation: fail or warn config restore clearly without corrupting existing app state; keep session restore staged/apply behavior safe.
- **Frontend applies restored state too late** → Mitigation: add explicit startup gating so native webviews stay suspended until restore results are processed.
- **Reserved metadata path pollutes session tree** → Mitigation: restore extraction must skip reserved metadata entries and only restore session entries into `pane-sessions`.
