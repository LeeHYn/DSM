import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  fileOutputPath,
  normalizeRepoPath,
  relativeHref,
  resolveInsideRoot,
} from '../lib/paths.mjs';

test('maps source paths without collisions', () => {
  assert.equal(
    fileOutputPath('DSM_Back/src/tasks/tasks.service.ts'),
    'files/DSM_Back/src/tasks/tasks.service.ts.html',
  );
  assert.equal(
    relativeHref(
      'files/DSM_Back/src/tasks/tasks.service.ts.html',
      'index.html',
    ),
    '../../../../index.html',
  );
  assert.equal(relativeHref('index.html', 'architecture.html'), './architecture.html');
});

test('rejects absolute, traversal, empty, and nul paths', () => {
  for (const value of [
    '../secret',
    'DSM_Back/../../secret',
    'C:\\secret',
    '/secret',
    '',
    'a\0b',
  ]) {
    assert.throws(() => normalizeRepoPath(value), /UNSAFE_REPO_PATH/);
  }
});

test('resolves accepted paths inside the selected root', () => {
  const root = path.resolve('C:/DEV');
  const resolved = resolveInsideRoot(root, 'DSM_Back/src/main.ts');

  assert.equal(resolved, path.join(root, 'DSM_Back', 'src', 'main.ts'));
  assert.throws(
    () => resolveInsideRoot(root, '../outside.ts'),
    /UNSAFE_REPO_PATH|PATH_OUTSIDE_ROOT/,
  );
});
