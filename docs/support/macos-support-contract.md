# macOS readiness contract

Status: experimental, not commercially supported.

Candidate targets are Apple Silicon (`aarch64-apple-darwin`) and Intel
(`x86_64-apple-darwin`). A CI-produced DMG or updater archive is only a build
artifact. It does not establish runtime support.

## Gates before support

- Named macOS engineering and support owner.
- Minimum and maximum tested macOS versions declared from current Apple support
  policy at release review time.
- Runtime matrix completed on physical Apple Silicon and Intel hardware when
  both architectures are distributed.
- WKWebView session/profile isolation, popup/OAuth, New Tab, download, file
  dialogs, backup/restore, updater, restart, and uninstall behavior tested.
- Developer ID Application signing and Apple notarization verified on the exact
  release artifacts. Gatekeeper acceptance is checked on a clean machine.
- Updater signatures, version lock, source provenance, SHA256 inventory, known
  issues, rollback/recovery path, and native smoke evidence available.

Provider policy restrictions are documented rather than bypassed. The app must
not spoof browser identity, inject cookies, or copy protected sessions to force
a provider test to pass.

Until every gate is met, release notes and product surfaces must use
`experimental` or `coming soon`, and beta support SLA does not apply.
