import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PILOT_A_PATHS,
  collectApplicationPaths,
  isApplicationSource,
} from '../manifest.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

test('locks the approved 124-file corpus and 15-file pilot', async () => {
  const paths = await collectApplicationPaths(ROOT);

  assert.equal(paths.length, 124);
  assert.equal(
    paths.filter((value) => value.startsWith('DSM_Back/')).length,
    88,
  );
  assert.equal(
    paths.filter((value) => value.startsWith('DSM_Front/')).length,
    36,
  );
  assert.equal(PILOT_A_PATHS.length, 15);
  assert.ok(PILOT_A_PATHS.every((value) => paths.includes(value)));
});

test('excludes sensitive, generated, binary, and nested workspace paths', () => {
  assert.equal(isApplicationSource('DSM_Back/.env'), false);
  assert.equal(isApplicationSource('DSM_Back/package-lock.json'), false);
  assert.equal(
    isApplicationSource('DSM_Back/node_modules/x/index.js'),
    false,
  );
  assert.equal(isApplicationSource('DSM_Front/assets/icon.png'), false);
  assert.equal(
    isApplicationSource('.worktrees/branch/DSM_Back/src/main.ts'),
    false,
  );
  assert.equal(isApplicationSource('DSM_Back/.env.example'), true);
  assert.equal(
    isApplicationSource(
      'DSM_Back/prisma/migrations/migration_lock.toml',
    ),
    true,
  );
});
