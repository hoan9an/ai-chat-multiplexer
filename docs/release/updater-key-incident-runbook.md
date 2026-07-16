# Updater signing key rotation and incident runbook

The updater public key in `src-tauri/tauri.conf.json` is a compatibility contract:
an installed version accepts only artifacts signed by the private key matching
the public key embedded in that version. Changing the repository key alone can
strand existing installs.

## Planned rotation

1. Create the new key through an approved secret-management workflow. Never
   place either private key in the repository or support tooling.
2. Keep the old key active while shipping a bridge release signed by the old
   key. The bridge release embeds the new public key for subsequent updates.
3. Complete the full release gate and measure bridge adoption.
4. Only after the supported migration window, sign later releases with the new
   private key and revoke access to the old key.
5. Document versions that can update automatically and versions that require a
   manual reinstall. Keep release endpoints and supported channel explicit.

Do not rotate the public key and private key in one release while assuming old
installs can consume it. They verify that release with the old embedded key.

## Suspected compromise or unauthorized release

1. Stop publication and leave candidates draft. Disable credentials in the
   secret store using the authorized incident process.
2. Preserve workflow run IDs, tag/commit identities, release API inventory and
   hashes within approved access. Do not copy secrets or private user data.
3. Determine whether the updater private key, Authenticode certificate, GitHub
   token, tag, or release assets were affected; each has a different trust path.
4. If a malicious release is public, mark it affected through the authorized
   GitHub incident process and publish clear manual-install guidance. Deletion,
   tag changes, certificate revocation, and updater endpoint changes are separate
   consequential actions and require explicit incident authorization.
5. Build a clean higher version from a reviewed commit. Use the planned bridge
   sequence when the old updater key remains trustworthy; otherwise existing
   clients require a verified manual reinstall.
6. Rotate the Authenticode certificate separately when its private key is
   affected and account for revocation/timestamp behavior.

## Emergency updater disablement

The application has no remote kill switch. To stop automatic delivery, do not
publish another release as GitHub `latest`. Changing or removing the endpoint
inside source affects only newly installed builds. Existing installs may still
query the endpoint embedded in their version, so incident communication and a
verified manual reinstall path are mandatory.

Record incident owner, UTC timeline, affected versions, hashes, user impact,
containment authorization, recovery version, and post-incident actions. Do not
include credentials, cookies, session files, prompts, or chat content.
