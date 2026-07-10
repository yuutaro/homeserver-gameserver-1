import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { GameServerManager } from '../dist/src/discord/game-server-manager.service.js';
import { ServerEnvService } from '../dist/src/discord/server-env.service.js';
import { ServerRegistryService } from '../dist/src/discord/server-registry.service.js';

test('registry caches only profile metadata and never server secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gameserver-registry-'));
  const serverDir = path.join(root, 'mc-adventure-1');
  await mkdir(serverDir);
  await writeFile(
    path.join(serverDir, 'server.env'),
    'GAMESERVER_TYPE=minecraft\nRCON_PASSWORD=must-not-be-cached\n',
    'utf8',
  );
  try {
    const env = new ServerEnvService(new ConfigService({
      BOT_DATA_DIR: root,
      DOCKER_DATA_DIR: root,
    }));
    const registry = new ServerRegistryService(env);
    const snapshot = await registry.refresh();
    assert.deepEqual(snapshot.servers, [{ id: 'mc-adventure-1', gameType: 'minecraft' }]);
    assert.equal(JSON.stringify(snapshot).includes('must-not-be-cached'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('shared runtime uses generic names and stable defaults', () => {
  const defaults = new GameServerManager(new ConfigService({}), {}, {});
  assert.equal(defaults.getContainerName(), 'gameserver-prod');
  assert.equal(defaults.getNetworkName(), 'gameserver-net');

  const configured = new GameServerManager(
    new ConfigService({
      GAMESERVER_CONTAINER_NAME: ' custom-gameserver ',
      GAMESERVER_NETWORK: ' shared-net ',
    }),
    {},
    {},
  );
  assert.equal(configured.getContainerName(), 'custom-gameserver');
  assert.equal(configured.getNetworkName(), 'shared-net');
});
