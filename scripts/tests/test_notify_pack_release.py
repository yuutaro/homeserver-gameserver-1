import copy
import importlib.util
import pathlib
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

SPEC = importlib.util.spec_from_file_location('notify_pack_release', pathlib.Path(__file__).parents[1] / 'notify-pack-release.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class NotifyTests(unittest.TestCase):
    def setUp(self):
        self.event = {'action': 'published', 'repository': {'full_name': 'owner/repo'},
                      'release': {'id': 123, 'draft': False, 'tag_name': 'packs/minecraft/test/v1.2.3',
                                  'name': 'Test 1.2.3', 'body': 'Changes @everyone',
                                  'html_url': 'https://github.com/owner/repo/releases/tag/test',
                                  'published_at': '2026-10-05T00:00:00Z'}}
        self.channel = '1556537643502932060'
        self.guild = '1555243086060200000'

    def test_embed_and_mentions(self):
        p = m.payload(self.event)
        self.assertEqual(p['allowed_mentions'], {'parse': []})
        self.assertEqual(p['embeds'][0]['description'], 'Changes @everyone')
        self.assertEqual(p['nonce'], m.payload(copy.deepcopy(self.event))['nonce'])

    def test_long_body_is_trimmed(self):
        self.event['release']['body'] = 'x' * 10000
        self.assertLessEqual(len(m.payload(self.event)['embeds'][0]['description']), 4096)

    def test_only_published_pack_releases(self):
        self.event['release']['draft'] = True
        with self.assertRaises(ValueError): m.payload(self.event)
        self.event['release']['draft'] = False
        self.event['release']['tag_name'] = 'app/v1.2.3'
        with self.assertRaises(ValueError): m.payload(self.event)

    def test_wrong_guild_never_posts(self):
        with patch.object(m, 'discord_request', return_value={'guild_id': 'wrong', 'type': 0}) as api:
            with self.assertRaises(ValueError): m.send(self.event, 'token', self.channel, self.guild)
            self.assertEqual(api.call_count, 1)

    def test_send_existing_bot_identity(self):
        with patch.object(m, 'discord_request', side_effect=[{'guild_id': self.guild, 'type': 0},
                                                             {'id': '42', 'embeds': [{}]}]) as api:
            self.assertEqual(m.send(self.event, 'token', self.channel, self.guild), '42')
            self.assertEqual(api.call_args.args[:3], ('POST', '/channels/' + self.channel + '/messages', 'token'))

    def test_missing_token_does_not_call_api(self):
        with patch.object(m, 'discord_request') as api:
            with self.assertRaises(ValueError): m.send(self.event, '', self.channel, self.guild)
            api.assert_not_called()

    def test_error_does_not_include_secret(self):
        error = HTTPError('https://discord.com/api/v10', 403, 'secret-token', {}, None)
        with patch.object(m, 'urlopen', side_effect=error):
            with self.assertRaises(ValueError) as caught: m.discord_request('GET', '/channels/1', 'secret-token')
            self.assertNotIn('secret-token', str(caught.exception))
            self.assertIn('Embed Links', str(caught.exception))

    def test_network_failure_not_retried(self):
        with patch.object(m, 'urlopen', side_effect=URLError('private')) as api:
            with self.assertRaises(ValueError): m.discord_request('POST', '/channels/1/messages', 'token', {})
            self.assertEqual(api.call_count, 1)


if __name__ == '__main__':
    unittest.main()
