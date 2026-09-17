const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { scripts } = require('../package.json');

// Exercise the repository's actual npm scripts without a database or real .env.
// Only the external Prisma process and long-running server are fixture executables.
function runProduction(t, { migrationExit = 0, ignoreScripts = false } = {}) {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dsm-production-start-'),
  );
  t.after(() => {
    assert.equal(
      path.dirname(path.resolve(fixture)),
      path.resolve(os.tmpdir()),
    );
    assert(path.basename(fixture).startsWith('dsm-production-start-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const bin = path.join(fixture, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(fixture, 'dist'));
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      name: 'dsm-production-start-fixture',
      private: true,
      scripts,
    }),
  );
  fs.writeFileSync(
    path.join(fixture, 'prisma-stub.cjs'),
    `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('events.jsonl', JSON.stringify(args) + '\\n');
if (JSON.stringify(args) !== JSON.stringify(['migrate', 'deploy'])) process.exit(67);
process.exit(Number(process.env.FIXTURE_MIGRATION_EXIT));
`,
  );
  fs.writeFileSync(
    path.join(fixture, 'dist', 'main.js'),
    "require('node:fs').appendFileSync('events.jsonl', JSON.stringify('app') + '\\n');\n",
  );
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(bin, 'prisma.cmd'),
      `@"${process.execPath}" "%~dp0\\..\\..\\prisma-stub.cjs" %*\r\n`,
    );
  } else {
    fs.writeFileSync(
      path.join(bin, 'prisma'),
      "#!/usr/bin/env node\nrequire('../../prisma-stub.cjs');\n".replace(
        "'../../prisma-stub.cjs'",
        JSON.stringify(path.join(fixture, 'prisma-stub.cjs')),
      ),
      { mode: 0o755 },
    );
  }
  const args = ['run', 'start:prod'];
  if (ignoreScripts) args.push('--ignore-scripts');
  const result = spawnSync(
    process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm ${args.join(' ')}`]
      : args,
    {
      cwd: fixture,
      env: { ...process.env, FIXTURE_MIGRATION_EXIT: String(migrationExit) },
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    },
  );
  assert.ifError(result.error);
  const eventsPath = path.join(fixture, 'events.jsonl');
  const events = fs.existsSync(eventsPath)
    ? fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  return { ...result, events };
}

test('production starts the server only after migrate deploy succeeds', (t) => {
  const result = runProduction(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events, [['migrate', 'deploy'], 'app']);
});

test('a failed migration returns failure without starting the server', (t) => {
  const result = runProduction(t, { migrationExit: 42 });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.events, [['migrate', 'deploy']]);
});

test('ignore-scripts cannot bypass the production migration gate', (t) => {
  const result = runProduction(t, { migrationExit: 42, ignoreScripts: true });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.events, [['migrate', 'deploy']]);
});
