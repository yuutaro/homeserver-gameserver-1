import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { MinecraftGameServerDriver } from '../dist/src/discord/minecraft-game-server.driver.js';
import { ServerEnvService } from '../dist/src/discord/server-env.service.js';

async function withServerEnv(contents, operation) {
  const root = await mkdtemp(path.join(tmpdir(), 'gameserver-test-'));
  const serverDir = path.join(root, 'sample-server');
  await mkdir(serverDir);
  await writeFile(path.join(serverDir, 'server.env'), contents, 'utf8');
  try {
    const service = new ServerEnvService(new ConfigService({
      BOT_DATA_DIR: root,
      DOCKER_DATA_DIR: root,
    }));
    await operation(service);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('server definitions default to minecraft without changing existing data', async () => {
  await withServerEnv('EULA=TRUE\nRCON_PASSWORD=secret\n', async (service) => {
    const server = await service.readServerDefinition('sample-server');
    assert.equal(server.gameType, 'minecraft');
    assert.equal(server.environment.EULA, 'TRUE');
    assert.equal(server.environment.RCON_PASSWORD, 'secret');
  });
});

test('GAMESERVER_TYPE is normalized and not passed to the game environment', async () => {
  await withServerEnv('GAMESERVER_TYPE=Minecraft\nRCON_PASSWORD=secret\n', async (service) => {
    const server = await service.readServerDefinition('sample-server');
    assert.equal(server.gameType, 'minecraft');
    assert.equal(server.environment.GAMESERVER_TYPE, undefined);
  });
});

test("runtime image and GPU metadata are normalized and not passed to the game environment", async () => {
  await withServerEnv(
    "GAMESERVER_IMAGE=homeserver/minecraft-cuda:test\nGAMESERVER_GPU=NVIDIA\nRCON_PASSWORD=secret\n",
    async (service) => {
      const server = await service.readServerDefinition("sample-server");
      assert.deepEqual(server.runtime, {
        image: "homeserver/minecraft-cuda:test",
        gpu: "nvidia",
      });
      assert.equal(server.environment.GAMESERVER_IMAGE, undefined);
      assert.equal(server.environment.GAMESERVER_GPU, undefined);
    },
  );
});

test("unsupported GPU metadata is rejected", async () => {
  await withServerEnv("GAMESERVER_GPU=amd\nRCON_PASSWORD=secret\n", async (service) => {
    await assert.rejects(service.readServerDefinition("sample-server"), /GAMESERVER_GPU must be nvidia/);
  });
});

test('unsafe server identifiers are rejected', async () => {
  await withServerEnv('RCON_PASSWORD=secret\n', async (service) => {
    await assert.rejects(service.readServerDefinition('../outside'), /Invalid server name/);
  });
});

test('minecraft driver preserves the current image, mount and port contract', () => {
  const driver = new MinecraftGameServerDriver(new ConfigService({
    MC_IMAGE: 'itzg/minecraft-server:java17',
    MC_HOST_PORT: '30002',
  }));
  const server = {
    id: 'sample-server',
    gameType: 'minecraft',
    serverDirOnBot: '/data/sample-server',
    serverDirOnDockerHost: '/data/sample-server',
    envFilePathOnBot: '/data/sample-server/server.env',
    environment: { EULA: 'TRUE', RCON_PASSWORD: 'secret' },
  };
  driver.validate(server);
  const options = driver.createContainerOptions(server, {
    containerName: 'gameserver-prod',
    networkName: 'gameserver-net',
  });
  assert.equal(options.Image, 'itzg/minecraft-server:java17');
  assert.deepEqual(options.HostConfig.Binds, ['/data/sample-server:/data']);
  assert.deepEqual(options.HostConfig.PortBindings['25565/tcp'], [{ HostPort: '30002' }]);
  assert.equal(options.Env.includes('EULA=TRUE'), true);
});
