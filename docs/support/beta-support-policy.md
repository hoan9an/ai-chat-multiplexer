# Windows beta support policy

Support target: acknowledge a paid-beta report within two business days. This is
an operational target, not an uptime guarantee. Provider outages and
provider-owned policy changes may take longer to classify.

Each report is triaged by app version, Windows/WebView2 version, provider, and
flow: install, login, New Tab, popup, workspace/profile, download, backup,
restore, update, or uninstall. A report should have an owner and one disposition:
reproducible, known limitation, provider-blocked, needs safe evidence, fixed in a
named version, or cannot reproduce.

Support may request a user-reviewed support bundle. Support must never request a
full backup ZIP, profile directory, cookie, token, prompt, chat content, full
URL, full filesystem path, provider credential, signing key, or private key.

Windows 10/11 x64 with WebView2 Evergreen is the supported beta surface. macOS
and Linux builds are experimental and do not receive this response target.
