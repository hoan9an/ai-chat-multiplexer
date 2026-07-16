# Windows native smoke checklist

Run this checklist against the exact draft installer named in
`native-smoke-report.json`. Record the installer SHA256, app version and commit,
Windows build, WebView2 version, timestamp, tester, and a private evidence
reference. Crop all evidence to remove private data.

`tester` and `evidenceRef` in the public report must be opaque IDs containing
only letters, digits, dot, underscore, or hyphen. Keep screenshots and videos in
the separately controlled evidence store; never put a URL or filesystem path in
the report. Keep `notes` empty unless it contains only non-sensitive issue IDs.

Allowed report values are `PASS`, `FAIL`, `BLOCKED`, and `NOT-TESTED`, but the
publish gate accepts only `PASS` for every schema case.

## Environment

- [ ] Windows 10 or 11 x64 on a supported servicing channel.
- [ ] WebView2 Evergreen version recorded.
- [ ] Clean non-administrator Windows account available.
- [ ] Existing-version upgrade account available.
- [ ] Dedicated provider accounts contain no personal/customer data.
- [ ] Tested installer hash matches the draft release asset.

## Required report cases

- [ ] `authenticode`: installer signature is Valid, timestamped, and chains on
  the test machine.
- [ ] `cleanInstall`: install and first launch succeed on the clean account.
- [ ] `firstRun`: onboarding can be completed or skipped without losing state.
- [ ] `existingUpgrade`: existing workspace, profiles, tabs, and settings remain.
- [ ] `updaterInstallRestart`: signed update installs and relaunches; an invalid
  signature fails closed.
- [ ] `newTabLanguages`: quick links, search/address, loading and reload work in
  Vietnamese, English, and Chinese without opening an unintended window.
- [ ] `multiPaneProfiles`: at least two panes and two profiles stay isolated.
- [ ] `popupAndOAuth`: `_blank`, `window.open`, login/consent, and callback policy
  match the provider matrix; no spoofing or cookie injection is used.
- [ ] `download`: start, completion, error/cancel behavior and local file actions
  work; diagnostics contain no raw URL or full path.
- [ ] `configBackupRestore`: JSON export/import validates and persists state.
- [ ] `fullBackupRestoreAndInvalidArchive`: explicit consent, same-user restore,
  startup apply, invalid archive rejection, cancellation, and cleanup work.
- [ ] `restartPersistence`: layout, tabs, profiles, and session behavior match the
  documented best-effort contract after close/reopen.
- [ ] `uninstallRelaunch`: uninstall behavior and subsequent reinstall/relaunch
  match the documented data-retention expectation.

## Provider evidence

Update `docs/testing/provider-compatibility-matrix.md` for ChatGPT, Claude,
Gemini, Perplexity, DeepSeek, and Grok. A provider-owned policy limitation may be
documented as known, but it cannot be represented as a passing smoke case unless
the approved fallback itself was exercised successfully.

Never attach a full backup, profile directory, cookie, token, prompt, chat
content, full URL, private key, or provider credential to release evidence.
