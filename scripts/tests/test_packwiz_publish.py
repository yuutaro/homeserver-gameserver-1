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
        (pack / "pack.toml").write_text('version="1.2.3"')
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
            with patch.object(mod, "checked", side_effect=checked), patch.object(mod, "validated_snapshot", side_effect=self.snapshot):
                mod.publish_pages(self.root, "test-server", self.policy, "owner/repo", "1.2.3")
            show = subprocess.run(["git", "--git-dir", str(bare), "show", "gh-pages:minecraft/other/pack.toml"], check=True, capture_output=True, text=True)
            self.assertEqual(show.stdout, "keep")
            subprocess.run(["git", "--git-dir", str(bare), "show", "gh-pages:minecraft/test-server/pack.toml"], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
