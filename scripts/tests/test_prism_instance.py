import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("prism_instance", Path(__file__).parents[1] / "prism-instance.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class PrismInstanceTest(unittest.TestCase):
    def test_minimal_zip_and_command_quotes(self):
        raw = b"test bootstrap"
        with tempfile.TemporaryDirectory() as tmp, patch.object(mod, "BOOTSTRAP_SHA256", hashlib.sha256(raw).hexdigest()):
            root = Path(tmp)
            (root / "pack.toml").write_text('[versions]\nminecraft="1.21.1"\nneoforge="21.1.252"\n')
            url = "https://example.org/pack.toml"
            for name in ["one.zip", "two.zip"]:
                mod.build_instance(root, root / name, url, raw)
            self.assertEqual((root / "one.zip").read_bytes(), (root / "two.zip").read_bytes())
            with zipfile.ZipFile(root / "one.zip") as archive:
                self.assertEqual(set(archive.namelist()), {"instance.cfg", "mmc-pack.json", "README.txt",
                    "minecraft/packwiz-installer-bootstrap.jar", "packwiz-installer-bootstrap.LICENSE.txt"})
                self.assertEqual(archive.read("minecraft/packwiz-installer-bootstrap.jar"), raw)
                cfg = archive.read("instance.cfg").decode()
                command = next(line.split("=", 1)[1] for line in cfg.splitlines() if line.startswith("PreLaunchCommand="))
                self.assertEqual(json.loads(command), f'"$INST_JAVA" -jar packwiz-installer-bootstrap.jar {url}')
                components = json.loads(archive.read("mmc-pack.json"))["components"]
                self.assertEqual({x["uid"]: x["version"] for x in components},
                                 {"net.minecraft": "1.21.1", "net.neoforged": "21.1.252"})
                self.assertIn(b"MIT License", archive.read("packwiz-installer-bootstrap.LICENSE.txt"))
            with self.assertRaises(FileExistsError):
                mod.build_instance(root, root / "one.zip", url, raw)

    def test_unverified_bootstrap_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(ValueError, "checksum"):
                mod.build_instance(root, root / "instance.zip", "https://example.org/pack.toml", b"bad")
            self.assertFalse((root / "instance.zip").exists())


if __name__ == "__main__":
    unittest.main()
