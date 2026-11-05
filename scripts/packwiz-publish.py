#!/usr/bin/env python3
"""Prepare a packwiz client release or publish its validated metadata to Pages."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("packwiz_export", HERE / "packwiz-export.py")
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
r = exporter.release
spec = importlib.util.spec_from_file_location("prism_instance", HERE / "prism-instance.py")
prism = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prism)
SITE_ROOT = r.ROOT / "pages"


def add_installation_page(pack, target, game, environment, repository):
    site = SITE_ROOT / game / environment
    if not site.exists():
        return
    r.require(not site.is_symlink(), "Unsafe installation page directory")
    assets = {p.name for p in site.iterdir()}
    r.require(assets == {"index.html", "style.css"}, "Unexpected installation page files")
    for name in sorted(assets):
        r.require((site / name).is_file() and not (site / name).is_symlink(), "Unsafe installation page asset")
        shutil.copy2(site / name, target / name)
    owner, repo_name = repository.split("/")
    url = f"https://{owner}.github.io/{repo_name}/{game}/{environment}/pack.toml"
    prism.build_instance(pack, target / "prism-instance.zip", url, prism.download_bootstrap())


def checked(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, stdout=subprocess.PIPE).stdout.strip()


def validated_snapshot(source, workspace, policy):
    r.require(source.is_dir() and not source.is_symlink(), "Pack source missing")
    exporter.read_sources(source, policy)
    pack = workspace / "pack"
    shutil.copytree(source, pack, symlinks=True)
    exporter.read_sources(pack, policy)
    checked("packwiz", "refresh", cwd=pack)
    candidate = workspace / "candidate.mrpack"
    index = exporter.export_candidate(pack, candidate, policy)
    fingerprint = r.mod_fingerprint(index)
    r.require(policy["publication_approved"] and not policy["pending_permissions"] and
              policy.get("reviewed_mod_manifest_sha256") == fingerprint,
              "MOD manifest is not reviewed by the current policy")
    return pack, candidate, index


def prepare(source, output_base, environment, policy):
    output_base.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="packwiz-prepare-", dir=output_base) as temp:
        work = Path(temp)
        pack, candidate, index = validated_snapshot(source, work, policy)
        version = index["versionId"]
        destination = output_base / policy["game"] / environment / version
        r.require(not destination.exists(), "Version output exists; do not overwrite")
        artifact = work / "artifact"
        artifact.mkdir()
        name = f"{environment}-public-{version}.mrpack"
        shutil.copy2(candidate, artifact / name)
        with zipfile.ZipFile(candidate) as z:
            notice = z.read("overrides/pack-notices/THIRD_PARTY_NOTICES.md")
        (artifact / "THIRD_PARTY_NOTICES.md").write_bytes(notice)
        (artifact / "RELEASE_NOTES.md").write_text("## 変更項目\n\n- 追加・変更したMODとバージョンを記入してください。\n")
        assets = {n: r.digest((artifact / n).read_bytes()) for n in (name, "THIRD_PARTY_NOTICES.md")}
        (artifact / "SHA256SUMS").write_text("".join(f"{sha}  {n}\n" for n, sha in assets.items()))
        manifest = {"environment": environment, "game": policy["game"], "version": version,
                    "source_sha256": r.digest((pack / "index.toml").read_bytes()),
                    "source_type": "packwiz", "assets": assets,
                    "publication_approved": policy["publication_approved"],
                    "pending_permissions": policy["pending_permissions"],
                    "mod_manifest_sha256": r.mod_fingerprint(index)}
        (artifact / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(artifact, destination)
    print("Prepared:", destination)


def publish_pages(source, environment, policy, repository, expected_version):
    r.require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) is not None, "Invalid repository")
    with tempfile.TemporaryDirectory(prefix="packwiz-pages-") as temp:
        work = Path(temp)
        pack, candidate, index = validated_snapshot(source, work, policy)
        r.require(index["versionId"] == expected_version, "Pack version changed since release preparation")
        repo = work / "repo"
        repo.mkdir()
        checked("git", "init", "-q", cwd=repo)
        checked("git", "remote", "add", "origin", f"https://github.com/{repository}.git", cwd=repo)
        refs = checked("git", "ls-remote", "--heads", "origin", "refs/heads/gh-pages", cwd=repo)
        if refs:
            checked("git", "fetch", "-q", "origin", "refs/heads/gh-pages", cwd=repo)
            checked("git", "checkout", "-q", "-b", "gh-pages", "FETCH_HEAD", cwd=repo)
        else:
            checked("git", "checkout", "-q", "--orphan", "gh-pages", cwd=repo)
        target = repo / policy["game"] / environment
        r.require(not target.is_symlink() and not target.parent.is_symlink(), "Unsafe Pages destination")
        if target.exists():
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(pack, target)
        with zipfile.ZipFile(candidate) as archive:
            (target / "THIRD_PARTY_NOTICES.md").write_bytes(archive.read("overrides/pack-notices/THIRD_PARTY_NOTICES.md"))
        add_installation_page(pack, target, policy["game"], environment, repository)
        (repo / ".nojekyll").touch()
        checked("git", "add", "--", ".nojekyll", f"{policy['game']}/{environment}", cwd=repo)
        changes = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo, check=False)
        r.require(changes.returncode in (0, 1), "Cannot inspect Pages changes")
        if changes.returncode == 0:
            print("Pages branch already matches; no push")
        else:
            checked("git", "commit", "-qm", f"Publish {environment} {index['versionId']}", cwd=repo)
            # Normal push, never force: concurrent publishing is rejected.
            checked("git", "push", "-q", "origin", "HEAD:refs/heads/gh-pages", cwd=repo)
            print("Pushed Pages branch:", checked("git", "rev-parse", "HEAD", cwd=repo))
        print("Pages version:", index["versionId"])
        print("Verify the deployed files and Pages workflow before reporting success.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "pages"))
    parser.add_argument("environment")
    parser.add_argument("--pack-dir", type=Path, required=True)
    parser.add_argument("--version", help="Version already prepared for release; required for pages")
    parser.add_argument("--env-file", type=Path, default=r.ROOT / "config/pack-release.env")
    args = parser.parse_args()
    try:
        policy = r.policy_for(args.environment)
        config = r.load_env(args.env_file)
        if args.command == "prepare":
            r.require("PACK_OUTPUT_DIR" in config, "Set PACK_OUTPUT_DIR")
            prepare(args.pack_dir, Path(config["PACK_OUTPUT_DIR"]).expanduser(), args.environment, policy)
        else:
            r.require(bool(args.version and r.VERSION.fullmatch(args.version)), "Set --version to the prepared version")
            publish_pages(args.pack_dir, args.environment, policy, config.get("PACK_REPOSITORY", ""), args.version)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
        print("Error:", exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
