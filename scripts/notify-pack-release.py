#!/usr/bin/env python3
"""Notify a published pack release using the existing Discord bot identity."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

API = 'https://discord.com/api/v10'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def payload(event):
    release = event['release']
    require(event.get('action') == 'published' and not release.get('draft'), 'Not a published release')
    require(release['tag_name'].startswith('packs/'), 'Not a pack release')
    url = release['html_url']
    parsed = urlparse(url)
    require(parsed.scheme == 'https' and parsed.hostname == 'github.com'
            and not parsed.username and not parsed.password, 'Invalid release URL')
    title = (release.get('name') or release['tag_name'])[:256]
    description = (release.get('body') or '新しいクライアントパックを公開しました。').strip()
    if len(description) > 4096:
        description = description[:4050] + '\n\n…続きはリリースページをご覧ください。'
    embed = {'title': title, 'url': url, 'description': description, 'color': 0x5865F2,
             'footer': {'text': release['tag_name'][:256]}}
    if release.get('published_at'):
        embed['timestamp'] = release['published_at']
    # Discord enforces nonce uniqueness only for recently sent messages, not forever.
    nonce = hashlib.sha256((event['repository']['full_name'] + ':' + str(release['id'])).encode()).hexdigest()[:24]
    return {'embeds': [embed], 'allowed_mentions': {'parse': []}, 'nonce': nonce, 'enforce_nonce': True}


def discord_request(method, path, token, body=None):
    encoded = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    headers = {'Authorization': 'Bot ' + token, 'Content-Type': 'application/json',
               'User-Agent': 'homeserver-release-notifier (GitHub Actions)'}
    for attempt in range(4):
        try:
            request = Request(API + path, data=encoded, headers=headers, method=method)
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                try:
                    delay = float(json.loads(exc.read()).get('retry_after', 1))
                except (ValueError, TypeError):
                    delay = 1
                require(0 <= delay <= 60, 'Discord rate-limit delay exceeds retry budget')
                time.sleep(delay + 0.1)
                continue
            # Do not log response bodies, request headers or tokens.
            hints = {401: 'check DISCORD_TOKEN secret',
                     403: 'check View Channel / Send Messages / Embed Links permissions',
                     404: 'check channel ID and bot guild membership'}
            raise ValueError(f'Discord HTTP {exc.code}: ' + hints.get(exc.code, 'notification failed')) from None
        except URLError:
            # No retry for ambiguous network failures: the POST may have succeeded.
            raise ValueError('Discord network error; inspect channel before retrying') from None
    raise ValueError('Discord rate-limit retries exhausted')


def send(event, token, channel, guild):
    require(bool(token), 'DISCORD_TOKEN Environment Secret is required')
    require(bool(re.fullmatch(r'[0-9]{15,22}', channel)), 'Invalid RELEASE_NOTIFICATION_CHANNEL')
    require(bool(re.fullmatch(r'[0-9]{15,22}', guild)), 'Invalid RELEASE_NOTIFICATION_GUILD')
    message = payload(event)
    details = discord_request('GET', '/channels/' + channel, token)
    require(details.get('guild_id') == guild, 'Channel belongs to a different guild; refusing to send')
    require(details.get('type') in (0, 5), 'Use a guild text or announcement channel')
    sent = discord_request('POST', '/channels/' + channel + '/messages', token, message)
    require(bool(sent.get('embeds')), 'Discord returned no embed; check Embed Links permission')
    return sent['id']


def main():
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        message_id = send(event, os.environ.get('DISCORD_TOKEN', ''),
                          os.environ.get('RELEASE_NOTIFICATION_CHANNEL', ''),
                          os.environ.get('RELEASE_NOTIFICATION_GUILD', ''))
        print('Release embed sent. Message ID: ' + message_id)
    except (ValueError, KeyError, OSError) as exc:
        print('Error: ' + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
