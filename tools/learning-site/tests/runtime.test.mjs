import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadRuntime() {
  const code = await readFile(new URL('../assets/site.js', import.meta.url), 'utf8');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'site.js' });
  return sandbox.DsmLearningRuntime;
}

test('searches path, filename, class, and function with filters', async () => {
  const runtime = await loadRuntime();
  const items = [
    {
      path: 'DSM_Back/src/tasks/tasks.service.ts',
      filename: 'tasks.service.ts',
      symbols: ['TasksService', 'update'],
      area: 'backend',
      language: 'TypeScript',
      kind: 'source',
      status: 'processed',
      read: false,
    },
    {
      path: 'DSM_Front/src/app/index.tsx',
      filename: 'index.tsx',
      symbols: ['Index'],
      area: 'frontend',
      language: 'TSX',
      kind: 'source',
      status: 'remaining',
      read: true,
    },
  ];

  assert.deepEqual(
    Array.from(
      runtime.filterSearch(items, ' UPDATE ', { area: 'backend' }),
      (item) => item.path,
    ),
    [items[0].path],
  );
  assert.deepEqual(
    Array.from(
      runtime.filterSearch(items, 'index', { batch: 'remaining' }),
      (item) => item.path,
    ),
    [items[1].path],
  );
  assert.equal(runtime.normalizeQuery('  Tasks_SERVICE  '), 'tasks service');
});

test('falls back to memory when localStorage throws', async () => {
  const runtime = await loadRuntime();
  const storage = runtime.createStorageAdapter({
    getItem() {
      throw new Error('blocked');
    },
  });

  storage.set('theme', 'dark');
  assert.equal(storage.get('theme'), 'dark');
  assert.equal(storage.persistent, false);
});

test('copies exact source text through clipboard or fallback', async () => {
  const runtime = await loadRuntime();
  const writes = [];

  await runtime.copySourceText(
    'a < b\r\n',
    null,
    async (value) => writes.push(value),
  );

  assert.deepEqual(writes, ['a < b\r\n']);
});

test('clamps diagram scale and translation', async () => {
  const runtime = await loadRuntime();

  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.clampTransform({ x: 5000, y: -5000, scale: 8 }))),
    { x: 1200, y: -1200, scale: 2.5 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.clampTransform({ x: -4, y: 7, scale: 0.2 }))),
    { x: -4, y: 7, scale: 0.75 },
  );
});
