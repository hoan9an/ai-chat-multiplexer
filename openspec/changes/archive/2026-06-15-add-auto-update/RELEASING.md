# Releasing & updater signing keys

The auto-updater installs **signed** executables. Signature verification with an
Ed25519 key pair is mandatory and must never be disabled. This document covers
the one-time key generation and the per-release flow.

## 1. Generate the updater key pair (one-time, maintainer only)

Run locally — never in CI, never committed:

```bash
npm run tauri signer generate -- -w ~/.tauri/ai-chat-multiplexer.key
```

This prints/writes two things:

- a **private** key (`~/.tauri/ai-chat-multiplexer.key`) + the password you chose
- a **public** key (printed to stdout, also in `~/.tauri/ai-chat-multiplexer.key.pub`)

## 2. Install the PUBLIC key in the app config

Copy the public key string into `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<PASTE PUBLIC KEY HERE>",
    "endpoints": [
      "https://github.com/davidhoang-crypto/ai-chat-multiplexer/releases/latest/download/latest.json"
    ]
  }
}
```

The shipped placeholder is `REPLACE_WITH_TAURI_PUBLIC_KEY`. Until you replace it,
the updater will refuse to verify any artifact (safe failure mode — the check
simply surfaces an error, the app never installs an unverified binary).

## 3. Store the PRIVATE key in GitHub Actions secrets

In the GitHub repo: **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret name | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the full contents of `~/.tauri/ai-chat-multiplexer.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose in step 1 |

**NEVER commit the private key or its password to the repository.** Keep a secure
offline backup — losing it means you cannot publish updates that existing
installs will accept (you'd have to ship a new pubkey via a manual reinstall).

## 4. Cut a release

1. Bump the version in all three places so they stay in lockstep:
   `src/appCore.ts` (`APP_VERSION`), `src-tauri/tauri.conf.json` (`version`),
   `src-tauri/Cargo.toml` (`version`).
2. Commit, then push a matching tag:
   ```bash
   git tag v0.1.6
   git push origin v0.1.6
   ```
3. `.github/workflows/release.yml` builds the win/mac/linux bundles, signs them
   with the secret private key, and publishes a **draft** GitHub release that
   includes `latest.json` (the updater manifest).
4. Review the draft release, then publish it. Once published as the *latest*
   release, the updater endpoint
   `releases/latest/download/latest.json` resolves and clients can update.
