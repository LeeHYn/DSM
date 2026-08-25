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
import { fileOutputPath } from '../lib/paths.mjs';
import {
  extractRenderedSource,
  verifyLocalLinks,
  verifyOfflineHtml,
  verifySourcePage,
} from '../verify.mjs';

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

test('accepts untouched output and rejects one-character drift', async () => {
  const outputDir = await temporaryDirectory('learning-verify-');
  const sourcePath = 'DSM_Back/src/tasks/tasks.service.ts';
  await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
    only: [`file:${sourcePath}`],
  });

  await assert.doesNotReject(() =>
    verifySourcePage({ rootDir: ROOT, outputDir, sourcePath }),
  );
  const outputPath = path.join(outputDir, fileOutputPath(sourcePath));
  const html = await readFile(outputPath, 'utf8');
  const sourceRegionStart = html.indexOf('<code data-source-code');
  const tampered =
    html.slice(0, sourceRegionStart) +
    html.slice(sourceRegionStart).replace('TasksService', 'TaskService');
  await writeFile(outputPath, tampered);
  await assert.rejects(
    () => verifySourcePage({ rootDir: ROOT, outputDir, sourcePath }),
    /SOURCE_(?:TEXT|SHA)_MISMATCH/,
  );
});

test('extracts source independently and decodes entities exactly once', () => {
  const rendered = extractRenderedSource(
    '<code data-source-code data-path="x.ts" data-sha256="abc" data-bytes="8" data-lines="1" data-line-ending="none"><span class="tok tok--plain">&amp;lt; &amp;</span></code>',
  );

  assert.equal(rendered.text, '&lt; &');
  assert.equal(rendered.path, 'x.ts');
  assert.equal(rendered.bytes, 8);
});

test('rejects remote dependencies but ignores URL-looking preserved source', async () => {
  await assert.rejects(
    () => verifyOfflineHtml('<script src="https://cdn.example/x.js"></script>'),
    /REMOTE_DEPENDENCY/,
  );
  await assert.doesNotReject(() =>
    verifyOfflineHtml(
      '<code data-source-code data-path="x.ts">const url = &quot;https://example.test&quot;;</code>',
    ),
  );
});

test('rejects broken local links and fragments', async () => {
  const outputDir = await temporaryDirectory('learning-links-');
  await writeFile(
    path.join(outputDir, 'index.html'),
    '<a href="missing.html">missing</a>',
  );
  await assert.rejects(() => verifyLocalLinks(outputDir), /BROKEN_LINK/);

  await writeFile(
    path.join(outputDir, 'index.html'),
    '<a href="target.html#missing">missing fragment</a>',
  );
  await writeFile(
    path.join(outputDir, 'target.html'),
    '<main id="present"></main>',
  );
  await assert.rejects(() => verifyLocalLinks(outputDir), /BROKEN_FRAGMENT/);
});
