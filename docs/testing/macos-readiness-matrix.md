# macOS readiness matrix

Owner: unassigned platform owner. Current status is `NOT-TESTED`; no macOS
runtime evidence was produced in this Windows execution environment.

Allowed results: `PASS`, `FAIL-KNOWN`, `BLOCKED-PROVIDER`, `NOT-TESTED`.

| Target | Install/Gatekeeper | First run/New Tab | WKWebView profile isolation | Popup/OAuth | Download/dialog | Backup/restore | Signed updater | Restart/uninstall | Owner |
|---|---|---|---|---|---|---|---|---|---|
| Apple Silicon | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | Platform owner required |
| Intel | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | NOT-TESTED | Platform owner required |

Each row requires app version/commit, artifact SHA256, machine model, macOS
version/build, WebKit runtime context, timestamp, tester, provider/profile alias,
expected/observed result, and a private redacted evidence reference. Do not
record account identifiers, prompts, chat content, cookies, tokens, full URLs,
full paths, session files, backups, or signing credentials.
