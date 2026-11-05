import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("packwiz_export", Path(__file__).parents[1] / "packwiz-export.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class PackwizExportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "pack"
        (self.root / "mods").mkdir(parents=True)
        (self.root / "pack.toml").write_text('version="1.2.3"\n[versions]\nminecraft="1.21.1"\nneoforge="21.1.252"\n')
        (self.root / "index.toml").write_text('hash-format="sha256"\n')
        self.meta = self.root / "mods" / "example.pw.toml"
        self.url = "https://cdn.modrinth.com/data/id/example.jar"
        self.sha = "a" * 128
        self.meta.write_text(f'name="Example"\nfilename="example.jar"\nside="client"\n[download]\nurl="{self.url}"\nhash-format="sha512"\nhash="{self.sha}"\n')
        self.policy = {"allowed_download_hosts": ["cdn.modrinth.com"], "blocked_mod_prefixes": [],
                       "download_conversions": [], "name": "Public", "conditions": [],
                       "publication_approved": True, "pending_permissions": []}

    def index(self):
        return {"formatVersion": 1, "game": "minecraft", "versionId": "1.2.3", "name": "Pack",
                "summary": "", "dependencies": {"minecraft": "1.21.1", "neoforge": "21.1.252"},
                "files": [{"path": "mods/example.jar", "fileSize": 123,
                           "downloads": [self.url], "hashes": {"sha1": "b" * 40, "sha512": self.sha},
                           "env": {"client": "required", "server": "unsupported"}}]}

    def archive(self, index):
        path = Path(self.tmp.name) / "export.mrpack"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("modrinth.index.json", json.dumps(index))
        return path

    def test_source_and_export_match(self):
        pack, expected = mod.read_sources(self.root, self.policy)
        index = mod.validate_export(self.archive(self.index()), pack, expected, self.policy)
        self.assertEqual(index["files"][0]["path"], "mods/example.jar")

    def test_both_side_is_exported_as_client_only(self):
        self.meta.write_text(self.meta.read_text().replace('side="client"', 'side="both"'))
        pack, expected = mod.read_sources(self.root, self.policy)
        index = self.index()
        index["files"][0]["env"]["server"] = "required"
        result = mod.validate_export(self.archive(index), pack, expected, self.policy)
        self.assertEqual(result["files"][0]["env"]["server"], "unsupported")

    def test_missing_or_changed_mod_rejected(self):
        pack, expected = mod.read_sources(self.root, self.policy)
        index = self.index()
        index["files"] = []
        with self.assertRaisesRegex(ValueError, "MOD list differs"):
            mod.validate_export(self.archive(index), pack, expected, self.policy)
        index = self.index()
        index["files"][0]["hashes"]["sha512"] = "c" * 128
        with self.assertRaisesRegex(ValueError, "metadata differs"):
            mod.validate_export(self.archive(index), pack, expected, self.policy)

    def test_unapproved_url_rejected(self):
        self.meta.write_text(self.meta.read_text().replace("cdn.modrinth.com", "example.com"))
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            mod.read_sources(self.root, self.policy)

    def test_extra_files_and_symlinks_rejected(self):
        extra = self.root / "mods" / "private.jar"
        extra.write_bytes(b"private")
        with self.assertRaisesRegex(ValueError, "Unexpected file"):
            mod.read_sources(self.root, self.policy)
        extra.unlink()
        extra.symlink_to(self.meta)
        with self.assertRaisesRegex(ValueError, "Symlinks"):
            mod.read_sources(self.root, self.policy)

    def test_no_overwrite_or_export_on_unsafe_source(self):
        output = Path(self.tmp.name) / "out.mrpack"
        output.write_bytes(b"keep")
        with patch.object(mod.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "already exists"):
                mod.export_candidate(self.root, output, self.policy)
            run.assert_not_called()
        self.assertEqual(output.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
