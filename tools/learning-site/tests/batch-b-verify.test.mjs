import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { afterEach } from 'node:test';

import { generateSite } from '../generate.mjs';
import { verifySite } from '../verify.mjs';

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

test('verifies clean Pilot A output', async () => {
  const outputDir = await temporaryDirectory('verify-pilot-a-');
  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
  });

  const report = await verifySite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
  });

  assert.equal(report.pages, 21);
  assert.equal(report.sources.length, 15);
  assert.deepEqual(report.progress, {
    processed: 15,
    remaining: 109,
    missing: 0,
    excluded: 9,
  });
});

test('verifies cumulative Batch B output', async () => {
  const outputDir = await temporaryDirectory('verify-batch-b-');
  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'batch-b',
  });

  const report = await verifySite({
    rootDir: ROOT,
    outputDir,
    batch: 'batch-b',
  });

  assert.equal(report.pages, 39);
  assert.equal(report.sources.length, 28);
  assert.deepEqual(report.progress, {
    processed: 28,
    remaining: 96,
    missing: 0,
    excluded: 9,
  });
});

test('rejects a false Auth isolation claim outside preserved source', async () => {
  const outputDir = await temporaryDirectory('verify-auth-claim-');
  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'batch-b',
  });
  const outputPath = path.join(
    outputDir,
    'features',
    'refresh-rotation.html',
  );
  const html = await readFile(outputPath, 'utf8');
  await writeFile(
    outputPath,
    html.replace('isolation 근거 경계', 'Serializable transaction'),
  );

  await assert.rejects(
    () => verifySite({ rootDir: ROOT, outputDir, batch: 'batch-b' }),
    /FALSE_AUTH_SERIALIZABLE_CLAIM/,
  );
});

test('rejects fixture token text outside preserved source', async () => {
  const outputDir = await temporaryDirectory('verify-auth-exposure-');
  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'batch-b',
  });
  const outputPath = path.join(
    outputDir,
    'features',
    'social-login.html',
  );
  const html = await readFile(outputPath, 'utf8');
  await writeFile(
    outputPath,
    html.replace('</main>', '<p>google-id-token</p></main>'),
  );

  await assert.rejects(
    () => verifySite({ rootDir: ROOT, outputDir, batch: 'batch-b' }),
    /AUTH_FIXTURE_TOKEN_EXPOSED/,
  );
});
