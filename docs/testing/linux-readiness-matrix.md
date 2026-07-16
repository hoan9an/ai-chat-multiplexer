# Linux readiness matrix

Owner: unassigned platform owner. Current status is `NOT-TESTED`; compilation in
GitHub Actions is not runtime evidence.

Allowed results: `PASS`, `FAIL-KNOWN`, `BLOCKED-PROVIDER`, `NOT-TESTED`.

| Target | Install/deps | First run/New Tab | WebKitGTK profile isolation | Popup/OAuth | Portal/download | Backup/restore | Signed updater | Restart/uninstall | Owner |
|---|---|---|---|---|---|---|---|---|---|
| Ubuntu 22.04 LTS x86_64 | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | Platform owner required |
| Ubuntu 24.04 LTS x86_64 | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | Platform owner required |

Each row requires app version/commit, artifact SHA256, distribution/build,
desktop environment, Wayland/X11, WebKitGTK version, package format, timestamp,
tester, expected/observed result, and private redacted evidence reference. Do not
record account identifiers, prompts, chat content, cookies, tokens, full URLs,
full paths, session files, backups, or signing credentials.
