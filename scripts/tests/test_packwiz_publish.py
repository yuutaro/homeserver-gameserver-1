import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("packwiz_publish", Path(__file__).parents[1] / "packwiz-publish.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class PackwizPublishTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.policy = {"game": "minecraft", "publication_approved": True, "pending_permissions": []}
        self.index = {"versionId": "1.2.3", "files": []}

    def snapshot(self, source, work, policy):
        pack = work / "pack"
        pack.mkdir()
        (pack / "pack.toml").write_text('version="1.2.3"\n[versions]\nminecraft="1.21.1"\nneoforge="21.1.252"\n')
        (pack / "index.toml").write_text('files=[]')
        candidate = work / "candidate.mrpack"
        with zipfile.ZipFile(candidate, "w") as z:
            z.writestr("modrinth.index.json", json.dumps(self.index))
            z.writestr("overrides/pack-notices/THIRD_PARTY_NOTICES.md", "notice")
        return pack, candidate, self.index

    def test_prepare_manifest_and_refuse_overwrite(self):
        out = self.root / "out"
        with patch.object(mod, "validated_snapshot", side_effect=self.snapshot):
            mod.prepare(self.root, out, "test-server", self.policy)
            dest = out / "minecraft/test-server/1.2.3"
            manifest = json.loads((dest / "release-manifest.json").read_text())
            self.assertEqual(manifest["source_type"], "packwiz")
            self.assertTrue((dest / "test-server-public-1.2.3.mrpack").exists())
            with self.assertRaisesRegex(ValueError, "exists"):
                mod.prepare(self.root, out, "test-server", self.policy)

    def test_pages_preserves_other_environment(self):
        bare = self.root / "remote.git"
        subprocess.run(["git", "init", "--bare", "-q", str(bare)], check=True)
        seed = self.root / "seed"
        seed.mkdir()
        env = {"GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "test@example.org",
               "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "test@example.org"}
        with patch.dict(os.environ, env):
            def git(*a):
                return subprocess.run(["git", *a], cwd=seed, check=True, capture_output=True)
            git("init", "-q")
            git("checkout", "-q", "-b", "gh-pages")
            other = seed / "minecraft/other/pack.toml"
            other.parent.mkdir(parents=True)
            other.write_text("keep")
            git("add", ".")
            git("commit", "-qm", "seed")
            git("remote", "add", "origin", str(bare))
            git("push", "-q", "origin", "gh-pages")
            original = mod.checked
            def checked(*args, cwd=None):
                if args[:4] == ("git", "remote", "add", "origin"):
                    args = (*args[:4], str(bare))
                return original(*args, cwd=cwd)
            site_root = self.root / "pages"
            site = site_root / "minecraft/test-server"
            site.mkdir(parents=True)
            (site / "index.html").write_text("installation instructions")
            (site / "style.css").write_text("body { color: black; }")
            raw = b"test bootstrap"
            with patch.object(mod, "checked", side_effect=checked), patch.object(mod, "validated_snapshot", side_effect=self.snapshot), \
                 patch.object(mod, "SITE_ROOT", site_root), patch.object(mod.prism, "download_bootstrap", return_value=raw), \
                 patch.object(mod.prism, "BOOTSTRAP_SHA256", mod.hashlib.sha256(raw).hexdigest()):
                # Repeated publication regenerates the same ZIP and preserves the guide.
                mod.publish_pages(self.root, "test-server", self.policy, "owner/repo", "1.2.3")
                mod.publish_pages(self.root, "test-server", self.policy, "owner/repo", "1.2.3")
            show = subprocess.run(["git", "--git-dir", str(bare), "show", "gh-pages:minecraft/other/pack.toml"], check=True, capture_output=True, text=True)
            self.assertEqual(show.stdout, "keep")
            for asset in ["index.html", "style.css", "prism-instance.zip"]:
                subprocess.run(["git", "--git-dir", str(bare), "show", f"gh-pages:minecraft/test-server/{asset}"],
                               check=True, capture_output=True)
            index = subprocess.run(["git", "--git-dir", str(bare), "show", "gh-pages:minecraft/test-server/index.toml"],
                                   check=True, capture_output=True, text=True).stdout
            self.assertEqual(index, "files=[]")
            subprocess.run(["git", "--git-dir", str(bare), "show", "gh-pages:minecraft/test-server/pack.toml"], check=True, capture_output=True)

    def test_page_rejects_unexpected_assets(self):
        site = self.root / "minecraft/test-server"
        site.mkdir(parents=True)
        (site / "private.txt").write_text("not public")
        with patch.object(mod, "SITE_ROOT", self.root), self.assertRaisesRegex(ValueError, "Unexpected"):
            mod.add_installation_page(self.root, self.root, "minecraft", "test-server", "owner/repo")


if __name__ == "__main__":
    unittest.main()
