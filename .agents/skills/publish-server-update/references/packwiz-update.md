# Update the distribution ledger

The tested production JARs are the authority for server MOD changes. Packwiz is
an editable download ledger, not a server installer or an automatic directory
mirror. Do not scan `mods/` and replace the entire client ledger: client-only
entries are absent there, while server-only entries need not be distributed.

## Inspect and reconcile

- Resolve the production environment and pack directory using repository release
  configuration and the runbook; never guess another environment's paths.
- Read current `pack.toml`, `index.toml`, `mods/*.pw.toml`, the relevant install
  manifest/work issue, and the previous public pack. Inspect JAR metadata when
  needed to distinguish the primary MOD ID, version, dependencies and bundled MODs.
- Match by MOD identity and binary hash. Retain stable metadata filenames, normally
  `<primary-mod-id>.pw.toml`. Do not register bundled dependencies as extra JARs.
- Add/update only confirmed client requirements and dependencies. Retain unchanged
  client-only entries, optional flags/defaults, and existing metadata. Keep
  `side = "client"`; it describes this client distribution, not where a MOD can run.
- For removal, delete only the matching metadata entry. For updates, replace its
  filename, URL and hash together; remove stale update-provider fields if they
  reference a different artifact. Never run an indiscriminate update-to-latest.

## Resolve official downloads

Use the exact tested version from Modrinth, CurseForge or the author's versioned
GitHub Release. Prefer the existing provider. Never reference a local file,
authenticated URL, mutable `latest` download, expiring link or personal mirror.

Download to a temporary location and compute SHA-512; compare bytes/hashes with
the tested production JAR and published provider checksums when available. For
client-only MOD changes, require equivalent tested-client evidence/artifact.
Do not infer a URL from the filename or substitute a similarly named version.
If the source cannot be established, stop and ask.

A minimal hand-editable entry is:

```toml
name = "Example MOD"
filename = "example-1.2.3.jar"
side = "client"

[download]
url = "https://cdn.modrinth.com/data/PROJECT/versions/VERSION/example-1.2.3.jar"
hash-format = "sha512"
hash = "<128 hexadecimal characters from the verified JAR>"
```

Use real values, not this example. Existing `packwiz modrinth`/`curseforge`
commands are also acceptable when explicitly pinned; inspect their output before
accepting it. Do not weaken host/permission checks or embed a JAR to work around
missing official metadata. Add official hosts/notices to policy only after review.

## Version and refresh

1. List this environment's versioned tags/releases and check Pages, source version,
   existing drafts and generated outputs. Choose an unused next patch version for
   a routine MOD change unless the user specifies a different version. Resolve
   unexpected differences or retries before bumping again.
2. Edit only the `version` field in `pack.toml`; do not change Minecraft/NeoForge
   versions without an explicitly requested and verified loader/game migration.
3. Run from the source directory:
   ```bash
   packwiz refresh
   ```
4. Verify the refreshed index references only the intended metadata, all SHA-512
   download hashes are correct, and the public candidate's delta matches the work
   record. Preserve unrelated MODs and optional choices. An empty client delta
   after a server-only change does not justify inventing a client update; ask.
5. Continue with policy approval, prepare and publish. Do not modify the ledger
   between artifact preparation and Pages verification. The generated scripts
   validate temporary snapshots; they do not maintain this source ledger for you.

Production ledger edits remain outside the application's Git history. Published
metadata is recorded in `gh-pages`, versioned mrpacks in Releases, and server work
and test limits in the issue. None of these backs up worlds or server-only data.
