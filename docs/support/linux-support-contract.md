# Linux readiness contract

Status: experimental, not commercially supported.

Initial candidate distributions are Ubuntu 22.04 LTS and Ubuntu 24.04 LTS on
x86_64. AppImage, DEB, and RPM output existing in CI does not imply that all
distributions or package formats are supported. RPM remains a build artifact
until a named RPM-family distribution is selected and tested.

## Gates before support

- Named Linux engineering and support owner.
- Exact distribution/version, desktop session, display protocol, package format,
  WebKitGTK version, and runtime dependencies documented.
- Runtime matrix covers install/dependencies, portal/file dialog, session/profile
  persistence, popup/OAuth, New Tab, downloads, backup/restore, updater, restart,
  and uninstall/reinstall behavior.
- Package trust/distribution policy is defined separately from Tauri updater
  signatures. Updater signature, SHA256, provenance, exact inventory, rollback,
  known issues, and native smoke evidence remain mandatory.
- Provider restrictions are documented and never bypassed through cookie
  injection or protected-session copying. Panes set a plain Chrome user agent
  string; client hints are left at the runtime default.

Until every gate is met, release notes and product surfaces must use
`experimental` or `coming soon`, and beta support SLA does not apply.
