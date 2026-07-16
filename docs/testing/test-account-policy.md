# Provider test-account policy

Use dedicated test accounts containing no personal, customer, production, or
payment data. Credentials must remain in the operator's approved password
manager and must never be committed, pasted into issues, stored in screenshots,
placed in support bundles, or added to CI.

Provider login tests are manual. Record only provider, test case, result,
timestamp, app build hash, Windows/WebView2 versions, and a cropped screenshot
that contains no account identifier or conversation content.

Do not automate MFA, CAPTCHA, OAuth consent, or login with repository secrets.
Do not weaken provider security, spoof the browser identity, inject cookies, or
copy session files into a test account to force a pass.

When a provider cannot be tested safely, record `NOT-TESTABLE` with the reason.
When the provider rejects an embedded user agent or controls the failure, record
`BLOCKED-PROVIDER` and link the public provider policy when available.
