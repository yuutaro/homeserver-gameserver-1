---
name: release-client-pack
description: Build and publish a public Minecraft mrpack from an already updated production client.mrpack, verify Discord notification, and record the release in a GitHub issue. Use for client-pack release requests, not MOD installation or server operations.
compatibility: Python 3.11+, authenticated gh CLI, and this repository's release configuration.
---

# Release a client pack

Run from the repository root (`../../..` relative to this skill). Read
`docs/runbooks/client-pack-releases.md` and `references/message-templates.md`
(relative to this skill) before proceeding. Use the templates for wording;
keep release notes change-only and put verification details in the issue.

## Scope

- Input: an already updated production `data/<environment>/client.mrpack`.
- Do not install MODs, edit the source pack, bump its version, create backups,
  or start/stop servers. Ask for missing prerequisites instead.
- Use `scripts/pack-release.py`; do not duplicate its implementation.
- Never expose secrets, private addresses, personal packs, or backup paths in public records.

## Workflow

1. Confirm the environment, source version, MOD changes, and verification evidence.
   Resolve paths and repository from `config/pack-release.env` without printing
   secrets; never read `bot.env`. Check `gh auth status`.
2. Compare the source with that environment's previous published public pack
   (not GitHub's global latest release). Compare MOD identities/versions,
   hashes, and the embedded-to-URL conversions; filename-only changes are not
   necessarily new MODs. Use the supplied change record when needed. If no
   baseline exists, record an initial release. Confirm the target tag/release
   does not already exist.
3. Reuse the related work issue, or create a short release issue. Record only
   verified facts. MOD-only changes need no empty commit.
4. Review `config/pack-policies/<environment>.json` against the actual MOD delta.
   Preserve existing decisions and notices; revisit changed conditions or new
   restrictions, not every unchanged MOD. Do not clear blockers or approve an
   unknown binary just to pass validation.
5. Compute the sanitized index fingerprint using `public_payload` and
   `mod_fingerprint` from `scripts/pack-release.py`. Pin it in the policy only
   after reviewing the delta. Run `python3 -m unittest discover -s scripts/tests -v`
   for tooling/policy changes; commit them against the issue and follow the
   repository's branch/PR rules. Do not publish with an unapproved policy.
6. Generate the artifacts:
   ```bash
   python3 scripts/pack-release.py prepare <environment>
   ```
   Check the generated public ZIP: only `modrinth.index.json` and generated
   notices; no schematics, copied settings, or embedded JARs. Verify MOD delta,
   version, official download references, and upload eligibility. Keep the
   personal copy, manifest, and checksums private. Do not delete existing outputs
   blindly; investigate unfinished attempts first.
7. Replace the generated `RELEASE_NOTES.md` with short Japanese change bullets.
   Rights notices stay inside the pack. Do not add installation instructions,
   testing reports, or boilerplate to the release body unless requested.
8. Upload a draft with truthful verification:
   ```bash
   python3 scripts/pack-release.py publish <environment> <version> --client-verified
   ```
   Use `--client-verified` only with client verification evidence; distinguish
   source-pack testing from a fresh public-pack import. If only server testing
   was done and the user authorizes that release, use `--server-verified-only`.
   If neither applies, stop and ask; never fabricate a verification result.
9. Inspect the draft's body and assets. Attach only the public mrpack, then publish:
   ```bash
   gh release edit packs/minecraft/<environment>/v<version> --repo <repository> --draft=false
   ```
   Confirm it is published and the expected asset exists. Never overwrite an
   existing tag/release. On upload errors, inspect partial drafts before retrying.
10. Find the matching `release` event run of `notify-pack-release.yml` and verify
    its result, not merely the newest unrelated run. Do not send another Discord
    message manually. On failure, record the run URL and inspect for an existing
    message before retrying; do not recreate the release to trigger notifications.
11. Add a concise result comment to the issue using the template, including any
    verification limits or known problems. Close a dedicated release issue when
    complete; do not close broader work issues prematurely. Leave notification
    failures open. Report the version, release URL, and any failure briefly.
