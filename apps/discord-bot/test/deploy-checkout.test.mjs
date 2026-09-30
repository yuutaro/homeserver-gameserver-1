import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy-bot.yml', import.meta.url), 'utf8');
const runBlock = workflow.split('        run: |\n')[1];
assert.ok(runBlock, 'deploy workflow must contain its shell steps');
const deployCommands = [...runBlock.matchAll(/^          (.*)$/gm)].map(match => match[1]).join('\n');

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Deploy test', '-c', 'user.email=deploy-test@example.invalid', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('the actual deploy workflow preserves production changes and fast-forwards only', async t => {
  for (const scenario of ['clean', 'fresh clone', 'modified', 'staged', 'untracked', 'local commit', 'diverged commit']) {
    await t.test(scenario, () => {
      const fixture = mkdtempSync(path.join(tmpdir(), 'gameserver-deploy-test-'));
      try {
        const remote = path.join(fixture, 'remote.git');
        const seed = path.join(fixture, 'seed');
        const prod = path.join(fixture, 'prod');
        mkdirSync(seed);
        git(fixture, 'init', '--bare', '--initial-branch=main', remote);
        git(seed, 'init', '--initial-branch=main');
        mkdirSync(path.join(seed, 'scripts'));
        writeFileSync(path.join(seed, '.gitignore'), 'data/\nconfig/bot.env\n');
        writeFileSync(path.join(seed, 'tracked.txt'), 'old\n');
        writeFileSync(path.join(seed, 'scripts/deploy-bot.sh'), '#!/usr/bin/env bash\nprintf "DEPLOYED\\n"\n');
        git(seed, 'add', '.');
        git(seed, 'commit', '-m', 'initial');
        git(seed, 'remote', 'add', 'origin', remote);
        git(seed, 'push', 'origin', 'main');
        if (scenario !== 'fresh clone') git(fixture, 'clone', remote, prod);
        const before = scenario === 'fresh clone' ? null : git(prod, 'rev-parse', 'HEAD');

        if (scenario !== 'fresh clone') {
          mkdirSync(path.join(prod, 'data'));
          mkdirSync(path.join(prod, 'config'));
          writeFileSync(path.join(prod, 'data/save.dat'), 'world data');
          writeFileSync(path.join(prod, 'config/bot.env'), 'private config');
        }
        if (['modified', 'staged', 'local commit', 'diverged commit'].includes(scenario)) {
          writeFileSync(path.join(prod, 'tracked.txt'), 'production edit\n');
          if (scenario !== 'modified') git(prod, 'add', 'tracked.txt');
          if (scenario.includes('commit')) git(prod, 'commit', '-m', 'local production commit');
        }
        if (scenario === 'untracked') writeFileSync(path.join(prod, 'untracked.txt'), 'uncommitted file');
        const expectedHead = scenario === 'fresh clone' ? null : git(prod, 'rev-parse', 'HEAD');
        const expectedStatus = scenario === 'fresh clone' ? null : git(prod, 'status', '--porcelain', '--untracked-files=all');

        if (scenario !== 'local commit') {
          writeFileSync(path.join(seed, 'tracked.txt'), 'new\n');
          git(seed, 'add', 'tracked.txt');
          git(seed, 'commit', '-m', 'upstream update');
          git(seed, 'push', 'origin', 'main');
        }
        const result = spawnSync('bash', ['-s'], {
          input: deployCommands, encoding: 'utf8',
          env: {...process.env, DEPLOY_DIR:prod, REPO_URL:remote, BOT_ENV_FILE:path.join(prod, 'config/bot.env'), DATA_DIR:path.join(prod, 'data')},
        });
        assert.ifError(result.error);
        if (['clean', 'fresh clone'].includes(scenario)) {
          assert.equal(result.status, 0, result.stderr);
          assert.match(result.stdout, /DEPLOYED/);
          assert.equal(git(prod, 'rev-parse', 'HEAD'), git(seed, 'rev-parse', 'HEAD'));
          assert.equal(readFileSync(path.join(prod, 'tracked.txt'), 'utf8'), 'new\n');
          if (scenario === 'clean') assert.notEqual(git(prod, 'rev-parse', 'HEAD'), before);
        } else {
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /Refusing deploy/);
          assert.doesNotMatch(result.stdout, /DEPLOYED/);
          assert.equal(git(prod, 'rev-parse', 'HEAD'), expectedHead);
          assert.equal(git(prod, 'status', '--porcelain', '--untracked-files=all'), expectedStatus);
          if (scenario === 'untracked') assert.equal(readFileSync(path.join(prod, 'untracked.txt'), 'utf8'), 'uncommitted file');
          else assert.equal(readFileSync(path.join(prod, 'tracked.txt'), 'utf8'), 'production edit\n');
        }
        if (scenario !== 'fresh clone') {
          assert.equal(readFileSync(path.join(prod, 'data/save.dat'), 'utf8'), 'world data');
          assert.equal(readFileSync(path.join(prod, 'config/bot.env'), 'utf8'), 'private config');
        }
      } finally {
        rmSync(fixture, {recursive:true, force:true});
      }
    });
  }
});
