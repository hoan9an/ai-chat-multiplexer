# Full backup formats

New exports use encrypted format v2. Format v1 is retained only as a legacy
restore format.

## Format v2 (current export format)

Format v2 is a binary [age](https://age-encryption.org/) passphrase-encrypted
stream. Its decrypted payload is a TAR archive containing WebView profile
session files and reserved metadata under
`__ai_chat_multiplexer_backup/`:

- `app-state.json`: workspace/pane/tab/profile mapping.
- `manifest.json`: format version `2`, app version, creation time, and profile
  IDs.

The TAR stream is written directly through the age encryptor to a unique
temporary output; no plaintext archive or JSON sidecar is created. A successful
write is finalized atomically. The passphrase is supplied only for the active
Tauri command and is not written to pending requests, startup results, logs, or
app storage.

Restore decrypts and validates the complete stream into an isolated staging
directory. Wrong passphrases, authentication failures, truncation, malformed
metadata, unsafe paths, unsupported entry types, and exceeded limits fail
before any live session tree is replaced. Restore only applies the staged tree
on the following app startup.

The passphrase cannot recover a lost account on its own. Provider, WebView2,
Windows-user, DPAPI, and server-side controls may still require authentication
again.

## Format v1 (legacy restore only)

Full backup format version 1 is a ZIP archive containing WebView profile session
files and reserved metadata under `__ai_chat_multiplexer_backup/`:

- `app-state.json`: workspace/pane/tab/profile mapping.
- `manifest.json`: format version, app version, creation time, and profile IDs.

An adjacent JSON sidecar remains readable for compatibility with older
restores. The app no longer creates v1 backups or plaintext sidecars.

## Privacy contract

Format v1 is not encrypted. It may contain cookies, login tokens, local storage,
and other credential-like session data. Existing v1 files must be stored as
secret data and must never be sent to support. Import them only from a trusted
source, then create a new encrypted v2 backup. Config JSON export remains the
appropriate option when browser session files are not required.

## Restore limits

Both formats fail closed before replacing live sessions when any limit is
exceeded:

| Limit | Value |
|---|---:|
| Archive entries | 10,000 |
| Total uncompressed data | 4 GiB |
| Single uncompressed file | 512 MiB |
| ZIP v1 compression ratio | 1,100:1 |
| App-state metadata | 10 MiB |

Unsafe paths, symbolic links, malformed archives, empty session archives, and
cancelled restores are rejected. Extraction occurs in a staging directory. A
failure or cancellation removes staging data and preserves the current live
session tree.

The ratio ceiling allows valid highly repetitive DEFLATE output produced by the
app itself. Entry, per-file, total uncompressed-size, and streaming byte limits
remain the primary controls against decompression abuse.

Restore remains best-effort. Provider, WebView2, Windows-user, DPAPI, and
server-side controls may require authentication again.
