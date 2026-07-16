# Provider compatibility matrix

Matrix version: 1

Owner: release QA. Runtime evidence must include app version and commit, Windows
version, WebView2 Runtime version, timestamp, test profile, and a cropped image
or short recording with private data removed.

Allowed results: `PASS`, `FAIL-KNOWN`, `BLOCKED-PROVIDER`, `NOT-TESTABLE`.

Current entries are intentionally `NOT-TESTABLE`: the implementation baseline
was audited without dedicated provider accounts or a controlled release-candidate
desktop run. A release candidate cannot pass the native smoke gate until every
P0 row is replaced with runtime evidence or an approved known limitation.

| Provider | First load | Login | `_blank` / popup | OAuth | Download | Reload | Session reopen | Owner |
|---|---|---|---|---|---|---|---|---|
| ChatGPT | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |
| Claude | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |
| Gemini | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |
| Perplexity | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |
| DeepSeek | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |
| Grok | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Webview QA |

Reason for `NOT-TESTABLE`: no authorized dedicated provider test accounts were
available during the baseline audit. This status is evidence of a missing
runtime check, not evidence that the flow works.

## New Tab regression matrix

These cases can be exercised without provider credentials and are mandatory on
the Windows release candidate.

| Case | vi | en | zh | Expected | Owner |
|---|---|---|---|---|---|
| Quick link | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Active tab navigates in-app | Webview QA |
| Search text | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Active tab opens encoded search URL | Webview QA |
| Address input | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Active tab opens normalized URL | Webview QA |
| Loading state | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Loading clears without layout shift | Webview QA |
| Tab switch/reload | NOT-TESTABLE | NOT-TESTABLE | NOT-TESTABLE | Correct tab/profile remains active | Webview QA |

## Evidence record template

```text
Date/time (UTC):
App version / commit / artifact SHA256:
Windows edition and version:
WebView2 Runtime version:
Provider and test profile alias:
Test case:
Expected:
Observed:
Result:
Known issue / owner:
Redacted screenshot or recording:
```
