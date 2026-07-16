# Full backup format v1

Full backup format version 1 is a ZIP archive containing WebView profile session
files and reserved metadata under `__ai_chat_multiplexer_backup/`:

- `app-state.json`: workspace/pane/tab/profile mapping.
- `manifest.json`: format version, app version, creation time, and profile IDs.

The adjacent JSON sidecar remains available for compatibility with older
restores. Archive creation streams source files into a temporary output and
atomically finalizes the selected path. A failed write preserves an existing
backup and removes the partial output.

## Privacy contract

Format v1 is not encrypted. It may contain cookies, login tokens, local storage,
and other credential-like session data. The UI requires explicit consent for
each Settings session. The file must be stored as secret data and must never be
sent to support. Config JSON export remains the safe option when browser session
files are not required.

## Restore limits

Restore fails closed before replacing live sessions when any limit is exceeded:

| Limit | Value |
|---|---:|
| Archive entries | 10,000 |
| Total uncompressed data | 4 GiB |
| Single uncompressed file | 512 MiB |
| Compression ratio | 1,100:1 |
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
