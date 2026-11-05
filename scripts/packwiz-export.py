#!/usr/bin/env python3
"""Export a reviewed URL-only packwiz client pack to a public mrpack candidate."""
import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path
from urllib.parse import urlparse
import zipfile

SPEC = importlib.util.spec_from_file_location("pack_release", Path(__file__).with_name("pack-release.py"))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


def read_sources(root, policy):
    """Reject unmanaged files and unsupported metadata before running packwiz."""
    files = list(root.rglob("*"))
    release.require(not any(p.is_symlink() for p in files), "Symlinks are not allowed")
    for path in files:
        if path.is_dir():
            release.require(path == root / "mods", "Only the mods directory is allowed")
        else:
            release.require(path in (root / "pack.toml", root / "index.toml") or
                            (path.parent == root / "mods" and path.name.endswith(".pw.toml")),
                            "Unexpected file in packwiz source")
    pack = tomllib.loads((root / "pack.toml").read_text())
    release.require(release.VERSION.fullmatch(pack.get("version", "")) is not None,
                    "Invalid pack version")
    release.require(set(pack.get("versions", {})) == {"minecraft", "neoforge"},
                    "Expected Minecraft and NeoForge versions")
    expected = {}
    for path in sorted((root / "mods").glob("*.pw.toml")):
        item = tomllib.loads(path.read_text())
        filename = item.get("filename", "")
        release.require(re.fullmatch(r"[^/\\]+\.jar", filename) is not None and ".." not in filename,
                        "Invalid MOD filename")
        release.require(filename not in expected, "Duplicate MOD filename")
        download = item.get("download", {})
        url = download.get("url", "")
        parsed = urlparse(url)
        release.require(parsed.scheme == "https" and parsed.hostname in policy["allowed_download_hosts"]
                        and not parsed.username and not parsed.password and not parsed.query
                        and not parsed.fragment and parsed.port in (None, 443), "Unapproved download URL")
        release.require(download.get("hash-format") == "sha512" and
                        re.fullmatch(r"[0-9a-f]{128}", download.get("hash", "")) is not None,
                        "Expected SHA-512 MOD hash")
        release.require(item.get("side") in ("client", "both"), "Unsupported MOD side")
        optional = item.get("option", {}).get("optional", False)
        release.require(type(optional) is bool and not (optional and item["side"] == "both"),
                        "Unsupported optional MOD")
        expected[filename] = {"url": url, "sha512": download["hash"], "side": item["side"],
                              "optional": optional}
    release.require(bool(expected), "No MOD metadata")
    return pack, expected


def validate_export(exported, pack, expected, policy):
    index = release.public_payload(exported, policy)
    release.require(index["versionId"] == pack["version"], "Exported version differs")
    release.require(index["dependencies"] == pack["versions"], "Exported loader versions differ")
    actual = {entry["path"][5:]: entry for entry in index["files"]}
    release.require(set(actual) == set(expected), "Exported MOD list differs from packwiz source")
    for filename, ref in expected.items():
        entry = actual[filename]
        env = {"client": "optional" if ref["optional"] else "required",
               "server": "required" if ref["side"] == "both" else "unsupported"}
        release.require(entry["downloads"] == [ref["url"]] and
                        entry["hashes"]["sha512"] == ref["sha512"] and entry["env"] == env,
                        "Exported MOD metadata differs: " + filename)
        # The public mrpack is a client pack, independent of packwiz's side metadata.
        entry["env"]["server"] = "unsupported"
    return index


def export_candidate(source, output, policy):
    release.require(source.is_dir() and not source.is_symlink(), "Packwiz source does not exist")
    release.require(not output.exists(), "Output already exists")
    pack, expected = read_sources(source, policy)
    with tempfile.TemporaryDirectory(prefix="packwiz-export-") as temp:
        work = Path(temp)
        shutil.copytree(source, work / "pack")
        exported = work / "export.mrpack"
        result = subprocess.run(["packwiz", "modrinth", "export", "--restrictDomains=false",
                                 "-o", str(exported)], cwd=work / "pack", check=False)
        release.require(result.returncode == 0 and exported.is_file(), "packwiz export failed")
        index = validate_export(exported, pack, expected, policy)
        text = release.notices(index, policy)
        with output.open("xb") as target:
            with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("modrinth.index.json", json.dumps(index, indent=2))
                archive.writestr("overrides/pack-notices/THIRD_PARTY_NOTICES.md", text)
                archive.writestr("overrides/pack-notices/README.md",
                    "Public client pack. Java 21 for Minecraft 1.21.1. Import into a NEW Prism instance.\n"
                    "No schematics or copied configs; client settings use MOD defaults.\n")
    print("Candidate:", output)
    print("MOD fingerprint:", release.mod_fingerprint(index))
    print("Policy reviewed:", policy.get("reviewed_mod_manifest_sha256") == release.mod_fingerprint(index))
    return index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment")
    parser.add_argument("--pack-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        export_candidate(args.pack_dir, args.output, release.policy_for(args.environment))
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, tomllib.TOMLDecodeError) as exc:
        print("Error:", exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
