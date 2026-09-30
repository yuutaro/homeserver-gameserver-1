import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { GameServerManager } from '../dist/src/discord/game-server-manager.service.js';

test('a previously named managed container is discovered by its server label', async () => {
  const manager = new GameServerManager(new ConfigService({}), {}, {});
  const legacyContainer = {
    inspect: async () => ({
      Config: {
        Labels: {
          'com.homeserver.serverName': 'mc-adventure-1',
        },
      },
      State: { Running: true },
    }),
  };
  manager.docker = {
    getContainer: (id) => {
      if (id === 'legacy-container-id') return legacyContainer;
      return { inspect: async () => { throw new Error('not found'); } };
    },
    listContainers: async (options) => {
      assert.deepEqual(options.filters.label, ['com.homeserver.serverName']);
      return [{ Id: 'legacy-container-id' }];
    },
  };

  assert.deepEqual(await manager.status(), {
    status: 'running',
    serverId: 'mc-adventure-1',
    gameType: 'minecraft',
  });
});

test('multiple labeled game-server containers are rejected', async () => {
  const manager = new GameServerManager(new ConfigService({}), {}, {});
  manager.docker = {
    getContainer: () => ({ inspect: async () => { throw new Error('not found'); } }),
    listContainers: async () => [{ Id: 'first' }, { Id: 'second' }],
  };
  await assert.rejects(manager.status(), /Multiple managed game-server containers found/);
});

test("profile runtime image and NVIDIA GPU request are applied when starting", async () => {
  const server = {
    id: "gpu-server",
    gameType: "minecraft",
    serverDirOnBot: "/data/gpu-server",
    serverDirOnDockerHost: "/data/gpu-server",
    envFilePathOnBot: "/data/gpu-server/server.env",
    environment: { RCON_PASSWORD: "secret" },
    runtime: { image: "homeserver/minecraft-cuda:test", gpu: "nvidia" },
  };
  const driver = {
    validate: () => {},
    getImage: () => "default-image",
    createContainerOptions: () => ({
      Image: "default-image",
      HostConfig: { Binds: ["/data/gpu-server:/data"] },
    }),
  };
  const manager = new GameServerManager(
    new ConfigService({}),
    { readServerDefinition: async () => server },
    { get: () => driver },
  );
  let createdOptions;
  manager.docker = {
    listNetworks: async () => [{ Id: "network" }],
    getImage: (image) => {
      assert.equal(image, "homeserver/minecraft-cuda:test");
      return { inspect: async () => ({}) };
    },
    getContainer: () => ({ inspect: async () => { throw new Error("not found"); } }),
    listContainers: async () => [],
    createContainer: async (options) => {
      createdOptions = options;
      return { start: async () => {} };
    },
  };

  await manager.startExclusive("gpu-server");

  assert.equal(createdOptions.Image, "homeserver/minecraft-cuda:test");
  assert.deepEqual(createdOptions.HostConfig.DeviceRequests, [{
    Driver: "nvidia",
    Count: -1,
    Capabilities: [["gpu", "compute", "utility"]],
  }]);
  assert.equal(createdOptions.Env, undefined);
});
