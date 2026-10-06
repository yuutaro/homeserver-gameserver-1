#!/usr/bin/env python3
"""Generate public mrpacks from production; upload only verified drafts. Python stdlib."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlparse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9-]*$")
VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data, algorithm="sha256"):
    return hashlib.new(algorithm, data).hexdigest()


def load_env(path):
    """Deliberately no shell execution, interpolation or loading bot.env."""
    config = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            require("=" in line, "Invalid release .env line")
            key, value = line.split("=", 1)
            require(key in {"PACK_DATA_DIR", "PACK_OUTPUT_DIR", "PACK_REPOSITORY", "GH_TOKEN"},
                    "Unexpected release .env key")
            config[key] = value.strip().strip("\"'")
    for key in ("PACK_DATA_DIR", "PACK_OUTPUT_DIR", "PACK_REPOSITORY", "GH_TOKEN"):
        if key in os.environ:
            config[key] = os.environ[key]
    return config


def policy_for(environment):
    require(bool(IDENTIFIER.fullmatch(environment)), "Invalid environment ID")
    policy = json.loads((ROOT / "config/pack-policies" / (environment + ".json")).read_text())
    require(policy["environment"] == environment and IDENTIFIER.fullmatch(policy["game"]),
            "Invalid policy identity")
    return policy


def validate_index(index, policy):
    require(index.get("formatVersion") == 1 and index.get("game") == "minecraft", "Unsupported mrpack")
    require(bool(VERSION.fullmatch(index.get("versionId", ""))), "Use a semver pack version")
    require(isinstance(index.get("dependencies"), dict), "Missing loader dependencies")
    seen = set()
    for entry in index["files"]:
        path = entry["path"]
        require(bool(re.fullmatch(r"mods/[^/\\]+\.jar", path)) and ".." not in path,
                "Only MOD download paths are allowed")
        require(path not in seen, "Duplicate MOD path")
        seen.add(path)
        require(not any(Path(path).name.lower().startswith(p.lower())
                        for p in policy.get("blocked_mod_prefixes", [])), "Blocked MOD found")
        hashes = entry.get("hashes", {})
        for algo, length in (("sha1", 40), ("sha512", 128)):
            require(bool(re.fullmatch(r"[0-9a-f]{%d}" % length, hashes.get(algo, ""))),
                    "Missing or invalid MOD hash")
        require(type(entry.get("fileSize")) is int and entry["fileSize"] > 0, "Invalid MOD size")
        require(bool(entry.get("downloads")), "Missing download URL")
        for url in entry["downloads"]:
            parsed = urlparse(url)
            require(parsed.scheme == "https" and parsed.hostname in policy["allowed_download_hosts"]
                    and not parsed.username and not parsed.password and not parsed.query
                    and not parsed.fragment and parsed.port in (None, 443), "Unapproved download URL")


def mod_fingerprint(index):
    return digest(json.dumps(sorted(index["files"], key=lambda f: f["path"]),
                             sort_keys=True, separators=(",", ":")).encode())


def notices(index, policy):
    lines = ["# Third-party MOD notices", "", "No MOD binaries are embedded. Each MOD retains its own license.",
             "This manifest is not a grant to redistribute or monetize third-party work.", ""]
    lines += ["- " + item for item in policy["conditions"]]
    lines += ["", "## Official download references", ""]
    lines += ["- " + f["path"] + ": " + f["downloads"][0] for f in index["files"]]
    lines += ["", "## Permission review", "",
              "Approved: " + str(policy["publication_approved"])]
    lines += ["- PENDING: " + p for p in policy["pending_permissions"]]
    return "\n".join(lines) + "\n"


def public_payload(source, policy):
    with zipfile.ZipFile(source) as pack:
        names = pack.namelist()
        require(len(names) == len(set(names)), "Duplicate ZIP entry")
        require(pack.testzip() is None, "Corrupt ZIP")
        index = json.loads(pack.read("modrinth.index.json"))
        for name in names:
            require(not name.startswith("/") and ".." not in PurePosixPath(name).parts
                    and "\\" not in name, "Unsafe ZIP path")
        conversions = {c["embedded_path"]: c for c in policy["download_conversions"]}
        for name in names:
            if name.endswith(".jar"):
                require(name in conversions, "Unrecognized embedded JAR; add a verified conversion")
                c = conversions[name]
                raw = pack.read(name)
                require(digest(raw, "sha1") == c["sha1"], "Embedded JAR changed; review conversion")
                index["files"].append({"path": c["path"], "hashes": {"sha1": c["sha1"],
                    "sha512": digest(raw, "sha512")}, "env": {"client": "required", "server": "required"},
                    "downloads": [c["url"]], "fileSize": len(raw)})
        # Intentionally copy NO source overrides, even config files or old notices.
        index["name"] = policy["name"]
        index["summary"] = "Official MOD downloads; no schematics or copied configs."
        validate_index(index, policy)
        # Rebuild metadata too: never pass through arbitrary private source fields.
        dependencies = index["dependencies"]
        require(set(dependencies) <= {"minecraft", "neoforge", "forge", "fabric-loader", "quilt-loader"},
                "Unrecognized loader metadata")
        require(all(isinstance(v, str) and re.fullmatch(r"[A-Za-z0-9.+_-]+", v)
                    for v in dependencies.values()), "Invalid loader version")
        files = []
        for entry in index["files"]:
            env = entry.get("env", {"client": "required", "server": "required"})
            require(set(env) == {"client", "server"} and all(
                value in {"required", "optional", "unsupported"} for value in env.values()), "Invalid MOD environment")
            files.append({key: entry[key] for key in ("path", "hashes", "downloads", "fileSize")})
            files[-1]["hashes"] = {key: entry["hashes"][key] for key in ("sha1", "sha512")}
            files[-1]["env"] = env
        return {key: index[key] for key in ("formatVersion", "game", "versionId", "name", "summary", "dependencies")} | {"files": files}


def prepare(config, environment, policy):
    require("PACK_DATA_DIR" in config and "PACK_OUTPUT_DIR" in config, "Set PACK_DATA_DIR/PACK_OUTPUT_DIR")
    source = Path(config["PACK_DATA_DIR"]).expanduser() / environment / "client.mrpack"
    original = source.read_bytes()
    index = public_payload(source, policy)
    version = index["versionId"]
    base = Path(config["PACK_OUTPUT_DIR"]).expanduser()
    base.mkdir(parents=True, exist_ok=True)
    dest = base / policy["game"] / environment / version
    require(not dest.exists(), "Version output exists; use a new version or inspect/remove unpublished output")
    text = notices(index, policy)
    with tempfile.TemporaryDirectory(prefix="pack-release-", dir=base) as work:
        work = Path(work)
        personal = work / f"{environment}-personal-{version}.mrpack"
        personal.write_bytes(original)
        public = work / f"{environment}-public-{version}.mrpack"
        with zipfile.ZipFile(public, "w", zipfile.ZIP_DEFLATED) as pack:
            pack.writestr("modrinth.index.json", json.dumps(index, indent=2))
            pack.writestr("overrides/pack-notices/THIRD_PARTY_NOTICES.md", text)
            pack.writestr("overrides/pack-notices/README.md",
                "Public client pack. Java 21 for Minecraft 1.21.1. Import into a NEW Prism instance.\n"
                "No schematics or copied configs; client settings use MOD defaults.\n"
                "GitHub Releases does not provide automatic instance updates.\n")
        (work / "THIRD_PARTY_NOTICES.md").write_text(text)
        notes = "## 変更項目\n\n- 追加・変更したMODとバージョンを記入してください。\n"
        (work / "RELEASE_NOTES.md").write_text(notes)
        assets = [public.name, "THIRD_PARTY_NOTICES.md"]
        checksums = {name: digest((work / name).read_bytes()) for name in assets}
        (work / "SHA256SUMS").write_text("".join(f"{sha}  {name}\n" for name, sha in checksums.items()))
        manifest = {"environment": environment, "game": policy["game"], "version": version,
                    "source_sha256": digest(original), "assets": checksums,
                    "publication_approved": policy["publication_approved"],
                    "pending_permissions": policy["pending_permissions"],
                    "mod_manifest_sha256": mod_fingerprint(index)}
        (work / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        dest.parent.mkdir(parents=True, exist_ok=True)
        require(source.read_bytes() == original, "Source pack changed during generation")
        shutil.copytree(work, dest)
    print(f"Prepared: {dest}")
    approved = (policy["publication_approved"] and not policy["pending_permissions"]
                and policy.get("reviewed_mod_manifest_sha256") == mod_fingerprint(index))
    print("Upload eligibility: " + ("reviewed" if approved else "BLOCKED: permission/MOD-list review pending"))
    return dest


def publish(config, environment, version, policy, client_verified, server_verified_only=False):
    require(bool(VERSION.fullmatch(version)), "Invalid version")
    require(policy["publication_approved"] and not policy["pending_permissions"], "Publication blocked by current permission policy")
    require(client_verified or server_verified_only,
            "Pass --client-verified or explicitly acknowledge --server-verified-only")
    if server_verified_only:
        print("Client untested: publishing after server-only verification at operator request.")
    repo = config.get("PACK_REPOSITORY", "")
    require(bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo)), "Set PACK_REPOSITORY")
    require("PACK_OUTPUT_DIR" in config, "Set PACK_OUTPUT_DIR")
    folder = Path(config["PACK_OUTPUT_DIR"]).expanduser() / policy["game"] / environment / version
    manifest = json.loads((folder / "release-manifest.json").read_text())
    require(manifest["environment"] == environment and manifest["version"] == version
            and manifest["game"] == policy["game"], "Manifest identity mismatch")
    require(manifest["publication_approved"] and not manifest["pending_permissions"], "Regenerate after permission clearance")
    public = f"{environment}-public-{version}.mrpack"
    require(set(manifest["assets"]) == {public, "THIRD_PARTY_NOTICES.md"}, "Unexpected release assets")
    for name, sha in manifest["assets"].items():
        require(digest((folder / name).read_bytes()) == sha, "Artifact changed since preparation")
    require((folder / "SHA256SUMS").read_text() == "".join(
        f"{sha}  {name}\n" for name, sha in manifest["assets"].items()), "Checksums file changed")
    with zipfile.ZipFile(folder / public) as pack:
        require(set(pack.namelist()) == {"modrinth.index.json", "overrides/pack-notices/THIRD_PARTY_NOTICES.md", "overrides/pack-notices/README.md"}, "Public ZIP allowlist violation")
        index = json.loads(pack.read("modrinth.index.json"))
        validate_index(index, policy)
        require(index["versionId"] == version and index["name"] == policy["name"], "Pack identity mismatch")
        fingerprint = mod_fingerprint(index)
        require(fingerprint == manifest.get("mod_manifest_sha256")
                == policy.get("reviewed_mod_manifest_sha256"),
                "MOD list changed or is not approved; review and pin the manifest fingerprint")
    env = os.environ.copy()
    if config.get("GH_TOKEN"):
        env["GH_TOKEN"] = config["GH_TOKEN"]
    def gh(*args):
        return subprocess.run(["gh", *args], env=env, capture_output=True, text=True)
    require(gh("auth", "status").returncode == 0, "gh authentication unavailable")
    tag = f"packs/{policy['game']}/{environment}/v{version}"
    # Check existing remote tag even when no Release exists. Fail closed on API errors.
    tags = gh("api", "--paginate", f"repos/{repo}/git/matching-refs/tags/{tag}", "--jq", ".[].ref")
    require(tags.returncode == 0, "Cannot check remote tags")
    require("refs/tags/" + tag not in tags.stdout.splitlines(), "Remote tag exists; do not overwrite")
    releases = gh("api", "--paginate", f"repos/{repo}/releases", "--jq", ".[].tag_name")
    require(releases.returncode == 0, "Cannot check existing releases")
    require(tag not in releases.stdout.splitlines(), "Release already exists")
    result = gh("release", "create", tag, "--repo", repo, "--draft", "--title",
                f"{environment} {version}", "--notes-file", str(folder / "RELEASE_NOTES.md"),
                str(folder / public))
    require(result.returncode == 0, "Draft upload failed; inspect GitHub before retrying (partial draft may exist)")
    print("Draft created: " + tag + ". Review on GitHub before publishing.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / "config/pack-release.env")
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("environment")
    pub = sub.add_parser("publish")
    pub.add_argument("environment")
    pub.add_argument("version")
    verification = pub.add_mutually_exclusive_group()
    verification.add_argument("--client-verified", action="store_true")
    verification.add_argument("--server-verified-only", action="store_true",
                              help="Explicitly acknowledge that the client was not tested")
    args = parser.parse_args()
    try:
        config = load_env(args.env_file)
        policy = policy_for(args.environment)
        if args.command == "prepare":
            prepare(config, args.environment, policy)
        else:
            publish(config, args.environment, args.version, policy, args.client_verified,
                    args.server_verified_only)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
