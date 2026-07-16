# Known issues

Use one entry per reproducible limitation. Do not include full URLs, query
strings, account identifiers, local usernames, prompts, or conversation data.

```text
ID:
App version and commit:
Windows and WebView2 versions:
Provider / flow:
Expected behavior:
Observed behavior:
Reproduction steps:
Result: FAIL-KNOWN | BLOCKED-PROVIDER
Owner:
Workaround or fallback:
Target release:
Evidence location (redacted):
```

## Current limitations

- Provider-owned OAuth flows may reject embedded user agents. The app does not
  spoof user agents or bypass provider policy.
- A popup that opens `about:blank` and navigates only after creation cannot be
  converted safely into an app tab without a later URL. It is denied and shown
  as an unsupported popup until the provider has a tested fallback.
- Full backup is not encrypted in format version 1. It requires explicit user
  consent and must be handled as credential-like private data.
- macOS and Linux artifacts are experimental and do not imply support.
