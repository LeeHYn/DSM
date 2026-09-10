import assert from 'node:assert/strict';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { afterEach } from 'node:test';

import { buildSiteModel, generateSite } from '../generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectories = [];

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test('generates only requested outputs in a temporary directory', async () => {
  const outputDir = await temporaryDirectory('learning-generate-');
  const result = await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
    only: [
      'asset:site.css',
      'file:DSM_Back/src/tasks/tasks.service.ts',
    ],
  });

  assert.deepEqual(result.written.slice().sort(), [
    'assets/site.css',
    'files/DSM_Back/src/tasks/tasks.service.ts.html',
  ]);
  await assert.rejects(() => access(path.join(outputDir, 'index.html')), {
    code: 'ENOENT',
  });
  assert.match(
    await readFile(
      path.join(
        outputDir,
        'files/DSM_Back/src/tasks/tasks.service.ts.html',
      ),
      'utf8',
    ),
    /data-source-code/,
  );
});

test('builds the exact corpus model without duplicating source into runtime data', async () => {
  const outputDir = await temporaryDirectory('learning-data-');
  const model = await buildSiteModel({ rootDir: ROOT, batch: 'pilot-a' });

  assert.deepEqual(model.progress, {
    processed: 15,
    remaining: 109,
    missing: 0,
    excluded: model.progress.excluded,
  });
  assert.equal(model.records.length, 124);
  assert.equal(model.records.reduce((sum, record) => sum + record.lineCount, 0), 13_168);

  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
    only: ['asset:site-data.js'],
  });
  const dataScript = await readFile(path.join(outputDir, 'assets/site-data.js'), 'utf8');
  assert.match(dataScript, /globalThis\.DSM_LEARNING_DATA/);
  assert.doesNotMatch(dataScript, /export class TasksService/);
});

test('fails closed when baseline counts drift', async () => {
  const brokenRoot = await temporaryDirectory('learning-broken-');
  await mkdir(path.join(brokenRoot, 'DSM_Back'), { recursive: true });
  await mkdir(path.join(brokenRoot, 'DSM_Front'), { recursive: true });

  await assert.rejects(
    () => buildSiteModel({ rootDir: brokenRoot, batch: 'pilot-a' }),
    /CORPUS_BASELINE_MISMATCH/,
  );
});

test('rejects unknown output identifiers before writing', async () => {
  const outputDir = await temporaryDirectory('learning-unknown-');
  await assert.rejects(
    () => generateSite({
      rootDir: ROOT,
      outputDir,
      batch: 'pilot-a',
      only: ['page:not-real'],
    }),
    /UNKNOWN_OUTPUT_ID:page:not-real/,
  );
});
