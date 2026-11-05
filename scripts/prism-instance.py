#!/usr/bin/env python3
"""Build a minimal Prism import ZIP; game MODs are fetched on first launch."""
import hashlib
import json
from pathlib import Path
import tomllib
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_URL = "https://github.com/packwiz/packwiz-installer-bootstrap/releases/download/v0.0.3/packwiz-installer-bootstrap.jar"
BOOTSTRAP_SHA256 = "a8fbb24dc604278e97f4688e82d3d91a318b98efc08d5dbfcbcbcab6443d116c"


def download_bootstrap():
    with urllib.request.urlopen(BOOTSTRAP_URL, timeout=60) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
    if hashlib.sha256(raw).hexdigest() != BOOTSTRAP_SHA256:
        raise ValueError("Bootstrap checksum mismatch")
    return raw


def build_instance(pack_dir, output, pack_url, bootstrap):
    if hashlib.sha256(bootstrap).hexdigest() != BOOTSTRAP_SHA256:
        raise ValueError("Bootstrap checksum mismatch")
    pack = tomllib.loads((pack_dir / "pack.toml").read_text())
    command = f'"$INST_JAVA" -jar packwiz-installer-bootstrap.jar {pack_url}'
    # Prism's ConfigVersion 1.3 uses QSettings INI: preserve the Java quotes.
    cfg = ("[General]\nConfigVersion=1.3\nInstanceType=OneSix\n"
           "name=Create Aeronautics\nOverrideCommands=true\n"
           f"PreLaunchCommand={json.dumps(command)}\n"
           "PreLoadCommand=\nWrapperCommand=\nPostExitCommand=\n")
    components = {"formatVersion": 1, "components": [
        {"uid": "net.minecraft", "version": pack["versions"]["minecraft"], "important": True},
        {"uid": "net.neoforged", "version": pack["versions"]["neoforge"], "important": True},
    ]}
    readme = ("Create Aeronautics / Prism Launcher\n\n"
              "Prism Launcher: Add Instance > Import from zip. Use Java 21.\n"
              "MODs download before each launch. Internet access is required.\n"
              "This ZIP contains no game MODs, saves, accounts or private settings.\n\n"
              f"Pack: {pack_url}\n"
              "Includes packwiz-installer-bootstrap v0.0.3 (MIT):\n"
              "https://github.com/packwiz/packwiz-installer-bootstrap\n"
              f"Source asset: {BOOTSTRAP_URL}\n")
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        files = {"instance.cfg": cfg.encode(),
                 "mmc-pack.json": (json.dumps(components, indent=2) + "\n").encode(),
                 "minecraft/packwiz-installer-bootstrap.jar": bootstrap,
                 "README.txt": readme.encode(),
                 "packwiz-installer-bootstrap.LICENSE.txt":
                     (ROOT / "config/packwiz-installer-bootstrap.LICENSE.txt").read_bytes()}
        for name, content in files.items():
            # Stable ZIP bytes: no build timestamps or host permissions.
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
