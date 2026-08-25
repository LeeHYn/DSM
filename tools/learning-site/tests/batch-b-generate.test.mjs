import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSiteModel, generateSite } from '../generate.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const temporaryDirectories = [];

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

test('keeps Pilot A independently reproducible', async () => {
  const model = await buildSiteModel({ rootDir: ROOT, batch: 'pilot-a' });

  assert.equal(model.batch, 'pilot-a');
  assert.equal(model.learningOrder.length, 15);
  assert.equal(model.auth, null);
  assert.deepEqual(
    {
      processed: model.progress.processed,
      remaining: model.progress.remaining,
      missing: model.progress.missing,
    },
    { processed: 15, remaining: 109, missing: 0 },
  );
});

test('builds cumulative Batch B without duplicate source data', async () => {
  const model = await buildSiteModel({ rootDir: ROOT, batch: 'batch-b' });

  assert.equal(model.batch, 'batch-b');
  assert.equal(model.learningOrder.length, 28);
  assert.equal(new Set(model.learningOrder).size, 28);
  assert.equal(Object.keys(model.guides).length, 28);
  assert.equal(model.auth.flow.refreshIsolation, null);
  for (const sourcePath of [
    'DSM_Back/src/auth/auth.service.ts',
    'DSM_Back/src/auth/auth.controller.spec.ts',
  ]) {
    const record = model.records.find((item) => item.path === sourcePath);
    assert.equal(record.reviewRequired, true, sourcePath);
    assert.deepEqual(record.exposureReasons, ['credential-assignment']);
    assert.deepEqual(record.symbols, []);
  }
  assert.deepEqual(
    {
      processed: model.progress.processed,
      remaining: model.progress.remaining,
      missing: model.progress.missing,
    },
    { processed: 28, remaining: 96, missing: 0 },
  );
});

test('generates exact clean output sets for both stages', async () => {
  const pilotDir = await temporaryDirectory('learning-pilot-a-');
  const batchDir = await temporaryDirectory('learning-batch-b-');
  const pilot = await generateSite({
    rootDir: ROOT,
    outputDir: pilotDir,
    batch: 'pilot-a',
  });
  const batch = await generateSite({
    rootDir: ROOT,
    outputDir: batchDir,
    batch: 'batch-b',
  });

  assert.equal(pilot.written.length, 24);
  assert.equal(batch.written.length, 42);
  assert.equal(
    batch.written.filter((value) => value.endsWith('.html')).length,
    39,
  );
  assert.ok(batch.written.includes('features/social-login.html'));
  assert.ok(batch.written.includes('diagrams/auth-session-flow.html'));
});

test('rejects a Batch B output id from the Pilot A stage before writing', async () => {
  const outputDir = await temporaryDirectory('learning-cross-stage-');

  await assert.rejects(
    () => generateSite({
      rootDir: ROOT,
      outputDir,
      batch: 'pilot-a',
      only: ['page:auth-social-login'],
    }),
    /UNKNOWN_OUTPUT_ID:page:auth-social-login/,
  );
});
