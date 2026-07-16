# Release gate runbook

This runbook applies to the Windows-first paid beta. A successful build is a
release candidate, not permission to publish.

## Required repository configuration

- GitHub environment `production-release` with at least one required reviewer.
- Updater signing secrets: `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Windows signing secrets: `WINDOWS_SIGNING_PFX_BASE64`,
  `WINDOWS_SIGNING_PFX_PASSWORD`, and `WINDOWS_TIMESTAMP_URL`.
- No signing credential may be written to the repository, release notes,
  support bundle, native smoke report, or retained build artifact.

## Candidate creation

1. Update all four version sources and run the local completion checks.
2. Create a new immutable version tag. Do not reuse or force-update a published
   tag as a release workflow.
3. The `Release candidate` workflow validates source and creates a draft.
4. Matrix jobs build updater artifacts. The Windows job fails closed without a
   timestamped Authenticode certificate.
5. The artifact gate downloads the complete draft, creates one merged
   `latest.json`, verifies exact inventory, updater signatures, installer hashes,
   version lock, source archive, checksums, and provenance.
6. The draft remains unpublished. macOS and Linux remain experimental.

Expected automated evidence:

- `latest.json`
- updater `.sig` files
- `authenticode-report.json`
- `SHA256SUMS.txt`
- `release-provenance.json`
- versioned source archive

Any missing, duplicate, empty, unexpected, stale, misnamed, or hash-mismatched
asset blocks the candidate. Fix the source/workflow and use a new version tag if
the tag has already been published.

## Current updater-smoke blocker

The installed application checks
`https://github.com/hoan9an/ai-chat-multiplexer/releases/latest/download/latest.json`.
GitHub's `latest` release endpoint does not expose draft releases. Therefore an
installed older version cannot discover or install the exact draft candidate,
and `updaterInstallRestart` cannot truthfully be marked `PASS` before publication
with the current single-channel architecture.

Do not bypass this by editing the report or weakening signature verification.
Before the first gated candidate can be published, choose and implement one of
these release-policy changes:

1. Add a separately authenticated staging update channel that can serve the
   signed draft manifest and assets to controlled QA machines.
2. Change publication policy so updater install/restart is an explicit
   post-publication smoke gate, with a documented patch-release response if it
   fails.

Until one option is implemented and exercised, keep `updaterInstallRestart` as
`NOT-TESTED` or `BLOCKED`. The current publish verifier will correctly reject
that report, so this is a release blocker rather than a local test failure.

## Native approval and publication

1. Download the draft Windows NSIS installer and record its SHA256.
2. Complete [native-smoke-checklist.md](native-smoke-checklist.md) on controlled
   Windows machines. Use dedicated provider test accounts.
3. Fill `scripts/native-smoke-report.template.json`. Every required case must be
   `PASS`; do not include account identifiers, prompts, chat content, cookies,
   tokens, full URLs, full paths, or private evidence.
4. Upload the file as exactly `native-smoke-report.json` to the draft.
5. Dispatch `Publish verified release` for the exact draft tag.
6. A reviewer approves `production-release` only after reviewing the draft,
   smoke evidence reference, installer hash, supported-platform statement, and
   known issues.
7. After approval, the workflow downloads and verifies the entire draft again,
   cryptographically checks updater signatures, confirms the tag target, and
   only then publishes it as latest.

## Failure and rollback

- Leave a failed candidate as draft and record an owner/disposition.
- Do not publish an unsigned Windows artifact as supported.
- Do not delete or rewrite a published tag to roll back. Publish a higher patch
  version that fixes or reverts the defect.
- For a severe updater incident, follow
  [updater-key-incident-runbook.md](updater-key-incident-runbook.md).
- The product rollback baseline for this execution plan is `v0.1.10`.
