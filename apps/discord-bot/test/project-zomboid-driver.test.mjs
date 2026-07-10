import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ProjectZomboidGameServerDriver } from '../dist/src/discord/project-zomboid-game-server.driver.js';

function serverDefinition(overrides = {}) {
  return {
    id: 'pz-main',
    gameType: 'project-zomboid',
    serverDirOnBot: '/data/pz-main',
    serverDirOnDockerHost: '/data/pz-main',
    envFilePathOnBot: '/data/pz-main/server.env',
    environment: {
      MAX_MEMORY: '8g',
      RCON_PASSWORD: 'rcon-secret',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin-secret',
      SERVER_NAME: 'pz-main',
      GAME_PORT: '16261',
      DIRECT_PORT: '16262',
      RCON_PORT: '27015',
      ...overrides,
    },
  };
}

test('project zomboid driver creates the pinned rootless two-volume UDP runtime', () => {
  const driver = new ProjectZomboidGameServerDriver(new ConfigService({
    PZ_HOST_PORT: '16261',
    PZ_DIRECT_HOST_PORT: '16262',
  }));
  const server = serverDefinition();
  driver.validate(server);
  const options = driver.createContainerOptions(server, {
    containerName: 'gameserver-prod',
    networkName: 'gameserver-net',
  });

  assert.equal(options.Image, 'sknnr/zomboid-dedicated-server:v1.1.1');
  assert.equal(options.StopTimeout, 60);
  assert.deepEqual(options.HostConfig.Binds, [
    '/data/pz-main/server-files:/home/steam/zomboid',
    '/data/pz-main/server-data:/home/steam/zomboid_data',
  ]);
  assert.deepEqual(options.HostConfig.PortBindings, {
    '16261/udp': [{ HostPort: '16261' }],
    '16262/udp': [{ HostPort: '16262' }],
  });
  assert.equal(options.HostConfig.PortBindings['27015/tcp'], undefined);
  assert.deepEqual(options.ExposedPorts['27015/tcp'], {});
});

test('project zomboid driver validates required settings before replacing the active server', () => {
  const driver = new ProjectZomboidGameServerDriver(new ConfigService({}));
  assert.throws(() => driver.validate(serverDefinition({ RCON_PASSWORD: '' })), /RCON_PASSWORD is required/);
  assert.throws(() => driver.validate(serverDefinition({ MAX_MEMORY: '8' })), /MAX_MEMORY must use a unit/);
  assert.throws(
    () => driver.validate(serverDefinition({ GAME_PORT: '16262' })),
    /GAME_PORT and DIRECT_PORT must be different/,
  );
});

test('project zomboid host ports are configurable and must be different', () => {
  const configured = new ProjectZomboidGameServerDriver(new ConfigService({
    PZ_IMAGE: 'example.invalid/project-zomboid:test',
    PZ_HOST_PORT: '26261',
    PZ_DIRECT_HOST_PORT: '26262',
  }));
  assert.equal(configured.getImage(), 'example.invalid/project-zomboid:test');
  const options = configured.createContainerOptions(serverDefinition(), {
    containerName: 'gameserver-dev',
    networkName: 'gameserver-net',
  });
  assert.equal(options.HostConfig.PortBindings['16261/udp'][0].HostPort, '26261');
  assert.equal(options.HostConfig.PortBindings['16262/udp'][0].HostPort, '26262');

  const invalid = new ProjectZomboidGameServerDriver(new ConfigService({
    PZ_HOST_PORT: '26261',
    PZ_DIRECT_HOST_PORT: '26261',
  }));
  assert.throws(() => invalid.validate(serverDefinition()), /must be different/);
});
