# Windows support contract

Effective date: 2026-07-16

## Supported environment

- Windows 10 and Windows 11 on supported Microsoft servicing channels.
- x64 installer artifacts produced by the repository release workflow.
- Microsoft Edge WebView2 Evergreen Runtime.
- Internet access to the selected AI provider and GitHub Releases for updates.
- A normal, non-administrator Windows user is the default runtime context.

The app does not provide or proxy AI accounts. Users authenticate directly with
each provider in the provider webview. Provider subscriptions, regional access,
enterprise policies, and provider-side outages remain outside the app's support
boundary.

## Provider test set

The Windows beta compatibility set is ChatGPT, Claude, Gemini, Perplexity,
DeepSeek, and Grok. Inclusion means the provider is tested and its limitations
are recorded. It is not a guarantee that every provider-owned flow will remain
available after a provider changes its website or authentication policy.

The app will not spoof a user agent, inject cookies, decrypt session storage, or
bypass an OAuth/provider restriction. A flow prohibited in embedded user agents
is documented as a provider limitation and uses a system-browser fallback only
when a supported callback flow exists.

## Installer and update support

- The supported Windows release must pass the release artifact gate.
- Tauri updater artifacts must have a valid updater signature.
- Publicly supported installers must have a valid Authenticode signature.
- An unsigned build may be distributed only as an explicitly labeled internal
  or experimental artifact, never as the supported paid-beta installer.

## Data and backup support

- Config JSON contains the app model but no browser profile files.
- Full backup contains browser profile/session files and must be treated as
  credential-like private data.
- Session restore is best-effort. Another machine or Windows user may require
  sign-in again because of provider, WebView2, DPAPI, or server-side controls.
- Support must never request a full backup ZIP, profile directory, cookie,
  prompt, chat content, token, or private key.

## Other platforms

macOS and Linux are experimental build targets. They are not commercially
supported until each platform has a runtime matrix, package contract, signing
evidence, release smoke report, and named support owner.
