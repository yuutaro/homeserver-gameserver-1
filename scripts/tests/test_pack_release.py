import copy
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('pack_release', pathlib.Path(__file__).parents[1] / 'pack-release.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class PackReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.policy = {'game': 'minecraft', 'environment': 'test-server', 'name': 'Test pack',
                       'allowed_download_hosts': ['cdn.modrinth.com'], 'publication_approved': True,
                       'pending_permissions': [], 'download_conversions': [], 'conditions': [],
                       'blocked_mod_prefixes': ['ftb-']}
        self.index = {'formatVersion': 1, 'game': 'minecraft', 'versionId': '1.2.3', 'name': 'private',
                      'dependencies': {'minecraft': '1.21.1', 'neoforge': '21.1.252'},
                      'files': [{'path': 'mods/test.jar', 'hashes': {'sha1': 'a'*40, 'sha512': 'b'*128},
                                 'fileSize': 10, 'downloads': ['https://cdn.modrinth.com/data/a/test.jar']}]}
        self.config = {'PACK_DATA_DIR': str(self.root / 'data'), 'PACK_OUTPUT_DIR': str(self.root / 'out'),
                       'PACK_REPOSITORY': 'owner/repo'}
        self.source = self.root / 'data/test-server/client.mrpack'
        self.source.parent.mkdir(parents=True)
        self.make_source()
        self.policy['reviewed_mod_manifest_sha256'] = m.mod_fingerprint(
            m.public_payload(self.source, self.policy))

    def tearDown(self):
        self.temp.cleanup()

    def make_source(self, extra=None):
        with zipfile.ZipFile(self.source, 'w') as z:
            z.writestr('modrinth.index.json', json.dumps(self.index))
            z.writestr('overrides/schematics/private.nbt', b'private')
            z.writestr('overrides/config/bot.env', 'DISCORD_TOKEN=secret')
            z.writestr('overrides/config/client.toml', 'private_ip=secret')
            for name, value in (extra or {}).items():
                z.writestr(name, value)

    def test_prepare_excludes_private_content_and_keeps_source(self):
        before = self.source.read_bytes()
        folder = m.prepare(self.config, 'test-server', self.policy)
        self.assertEqual(before, self.source.read_bytes())
        self.assertEqual(before, (folder / 'test-server-personal-1.2.3.mrpack').read_bytes())
        with zipfile.ZipFile(folder / 'test-server-public-1.2.3.mrpack') as z:
            self.assertEqual(len(z.namelist()), 3)
            self.assertFalse(any('secret' in z.read(n).decode() for n in z.namelist()))

    def test_arbitrary_metadata_is_not_copied(self):
        self.index['private_token'] = 'secret'
        self.index['files'][0]['private_token'] = 'secret'
        self.make_source()
        self.assertNotIn('secret', json.dumps(m.public_payload(self.source, self.policy)))

    def test_unreviewed_mod_list_blocks_upload(self):
        m.prepare(self.config, 'test-server', self.policy)
        self.policy['reviewed_mod_manifest_sha256'] = '0' * 64
        with patch.object(m.subprocess, 'run') as run:
            with self.assertRaises(ValueError): m.publish(self.config, 'test-server', '1.2.3', self.policy, True)
            run.assert_not_called()

    def test_duplicate_mod_rejected(self):
        self.index['files'].append(copy.deepcopy(self.index['files'][0]))
        with self.assertRaises(ValueError): m.validate_index(self.index, self.policy)

    def test_bad_url_rejected(self):
        for url in ['http://cdn.modrinth.com/a', 'https://evil.example/a', 'https://cdn.modrinth.com/a?token=secret',
                    'https://user:secret@cdn.modrinth.com/a']:
            self.index['files'][0]['downloads'] = [url]
            with self.assertRaises(ValueError): m.validate_index(self.index, self.policy)

    def test_blocked_mod_and_traversal_rejected(self):
        for path in ['mods/ftb-library.jar', 'mods/../secret.jar', 'config/secret.jar']:
            self.index['files'][0]['path'] = path
            with self.assertRaises(ValueError): m.validate_index(self.index, self.policy)

    def test_hash_required(self):
        self.index['files'][0]['hashes'] = {}
        with self.assertRaises(ValueError): m.validate_index(self.index, self.policy)

    def test_unknown_embedded_jar_rejected(self):
        self.make_source({'overrides/mods/unknown.jar': b'jar'})
        with self.assertRaises(ValueError): m.public_payload(self.source, self.policy)

    def test_embedded_conversion_hash_checked(self):
        raw = b'known jar'
        self.make_source({'overrides/mods/known.jar': raw})
        self.policy['download_conversions'] = [{'embedded_path': 'overrides/mods/known.jar', 'path': 'mods/known.jar',
            'sha1': m.digest(raw, 'sha1'), 'url': 'https://cdn.modrinth.com/known.jar'}]
        self.assertEqual(len(m.public_payload(self.source, self.policy)['files']), 2)
        self.policy['download_conversions'][0]['sha1'] = 'a'*40
        with self.assertRaises(ValueError): m.public_payload(self.source, self.policy)

    def test_env_is_data_not_shell(self):
        p = self.root / '.env'
        p.write_text('PACK_DATA_DIR=$(touch /tmp/should-not-execute)\n')
        self.assertTrue(m.load_env(p)['PACK_DATA_DIR'].startswith('$('))
        p.write_text('DISCORD_TOKEN=secret\n')
        with self.assertRaises(ValueError): m.load_env(p)

    def test_prepare_existing_output_rejected(self):
        m.prepare(self.config, 'test-server', self.policy)
        with self.assertRaises(ValueError): m.prepare(self.config, 'test-server', self.policy)

    def test_publish_permissions_and_client_gate(self):
        self.policy['publication_approved'] = False
        with patch.object(m.subprocess, 'run') as run:
            with self.assertRaises(ValueError): m.publish(self.config, 'test-server', '1.2.3', self.policy, True)
            run.assert_not_called()
        self.policy['publication_approved'] = True
        with self.assertRaises(ValueError): m.publish(self.config, 'test-server', '1.2.3', self.policy, False)

    def test_publish_only_public_assets_as_draft(self):
        m.prepare(self.config, 'test-server', self.policy)
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')) as run:
            m.publish(self.config, 'test-server', '1.2.3', self.policy, True)
        command = run.call_args_list[-1].args[0]
        self.assertIn('--draft', command)
        self.assertTrue(any(x.endswith('-public-1.2.3.mrpack') for x in command))
        self.assertFalse(any('-personal-' in x for x in command))

    def test_remote_existing_tag_or_api_failure_blocks(self):
        m.prepare(self.config, 'test-server', self.policy)
        for result in [subprocess.CompletedProcess([], 0, 'refs/tags/packs/minecraft/test-server/v1.2.3\n', ''),
                       subprocess.CompletedProcess([], 1, '', 'failure')]:
            with patch.object(m.subprocess, 'run', side_effect=[subprocess.CompletedProcess([], 0, '', ''), result]) as run:
                with self.assertRaises(ValueError): m.publish(self.config, 'test-server', '1.2.3', self.policy, True)
                self.assertEqual(run.call_count, 2)

    def test_changed_public_pack_blocks_upload(self):
        folder = m.prepare(self.config, 'test-server', self.policy)
        (folder / 'test-server-public-1.2.3.mrpack').write_bytes(b'tampered')
        with patch.object(m.subprocess, 'run') as run:
            with self.assertRaises(ValueError): m.publish(self.config, 'test-server', '1.2.3', self.policy, True)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
