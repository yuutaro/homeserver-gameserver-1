---
name: publish-server-update
description: Distribute verified Minecraft server MOD changes to players. Update the production packwiz ledger, bump its version, refresh the index, publish GitHub Pages and a versioned mrpack Release, verify Discord notification, and record the work in an issue. Use after MOD installation and gameplay/startup checks, not to install MODs or operate servers.
compatibility: Python 3.11+, packwiz CLI, authenticated gh and Git push access, and this repository's release configuration.
---

# Publish a server update

Work from the repository root (`../../..` from this skill). Read
`docs/runbooks/client-pack-releases.md` from that root, plus
`references/packwiz-update.md` and `references/message-templates.md` from this
skill. Use existing `scripts/`; do not duplicate their implementation.

## Scope

- Input: verified production MOD changes and their test evidence. Update the
  distribution ledger at `data/<environment>/packwiz/`, not the server JARs.
- Do not install/update/remove server JARs, change server settings, restart
  servers, create world backups, or update personal `client.mrpack`.
- Never publish secrets, private addresses, personal settings, schematics,
  unreviewed binaries, or backup paths. Never read `bot.env`.

## Workflow

1. Confirm the environment, actual MOD delta, verification evidence, and permission
   to publish now. Resolve paths/repository from `config/pack-release.env` without
   exposing secrets; check `gh auth status` and Git push access. Pages affects
   clients immediately: if the server still runs the old configuration, ask about
   timing rather than restarting it. Stop for missing verification; never invent it.
2. Reuse the related issue or open a short update issue. Inspect that environment's
   previous public pack and Pages state, not GitHub's global latest. Investigate
   partial releases or an unpublished ledger before editing; do not silently
   combine unrelated changes or repeat a completed publication.
3. Apply only the verified delta to packwiz using `references/packwiz-update.md`.
   Pin official versioned URLs and SHA-512 hashes, validate downloads against the
   tested JARs, preserve client-only MODs and optional choices, and omit server-only
   MODs. Use `side = "client"` for all distributed entries. Ask when client
   requirements or the identity of an unknown JAR cannot be established.
4. Set an unused version in `pack.toml` (normally the next patch of this
   environment's latest version unless specified), accounting for existing tags,
   drafts, Pages and output directories. Run `packwiz refresh` in the source pack.
   Compare identities, versions, URLs and hashes against the previous public pack;
   filename changes alone are not necessarily MOD additions. Freeze the ledger
   until Pages verification completes. Do not overwrite existing outputs.
5. Review `config/pack-policies/<environment>.json` for the actual delta. Preserve
   existing decisions/notices; revisit new restrictions, not every unchanged MOD.
   Generate a candidate with `scripts/packwiz-export.py`, inspect its delta, then
   pin its fingerprint in the policy. Never bypass blockers to pass validation.
   Commit policy/tooling changes against the issue on a dedicated branch; run
   `python3 -m unittest discover -s scripts/tests -v` for those changes. Open PRs
   against `main` unless a deliberate dependency requires another base; verify
   that completed changes eventually reach `main`. MOD-only work needs no empty commit.
6. Prepare artifacts:
   ```bash
   python3 scripts/packwiz-publish.py prepare <environment> --pack-dir <pack-dir>
   ```
   Inspect version, MOD delta, URLs, hashes, eligibility and ZIP contents. The
   public mrpack must contain no schematics, copied settings or embedded JARs;
   every MOD's server environment must be `unsupported`.
7. Replace generated `RELEASE_NOTES.md` with short Japanese MOD change bullets.
   Keep rights notices inside the pack and verification details in the issue.
8. Create a draft using truthful verification:
   ```bash
   python3 scripts/pack-release.py publish <environment> <version> --client-verified
   ```
   Use `--client-verified` only with evidence for this MOD configuration; distinguish
   user-reported tests from fresh public-pack imports. If only server tests exist,
   use `--server-verified-only` only when the user authorizes that release. If
   neither applies, stop and ask. Inspect partial drafts after failures.
9. Publish the same source to Pages:
   ```bash
   python3 scripts/packwiz-publish.py pages <environment> --pack-dir <pack-dir> --version <version>
   ```
   Verify the matching deployment commit and deployed pack/index hashes. Check
   regenerated installation HTML/CSS/images and Prism ZIP when present; they are
   separate from the packwiz index. If deployment or later publication fails,
   record the partial state and stop rather than blindly retrying.
10. Review the draft's body/assets, attach only the public mrpack, and publish:
    ```bash
    gh release edit packs/minecraft/<environment>/v<version> --repo <repository> --draft=false
    ```
    Confirm the release and expected asset exist. Never overwrite an existing
    release/tag. Find the matching `release` event run of `notify-pack-release.yml`
    and verify success. Do not send a duplicate Discord message or recreate the
    release to retrigger it; inspect for an existing message before retrying.
11. Add a concise issue result with version, MOD delta, Pages/Release/Discord results
    and verification limits. Close a dedicated completed issue with reason
    `completed`; leave failures and broader unfinished issues open. Report the
    version, Release URL and any failures briefly.
