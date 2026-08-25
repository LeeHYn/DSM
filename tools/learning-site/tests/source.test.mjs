import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { collectApplicationPaths } from '../manifest.mjs';
import {
  assessExposureRisk,
  decodeUtf8,
  readSourceRecord,
} from '../lib/source.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

test('preserves bytes, lines, and CRLF metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'learning-source-'));
  try {
    await mkdir(path.join(directory, 'DSM_Back'), { recursive: true });
    const text = 'const a = 1;\r\nconst b = 2;\r\n';
    await writeFile(path.join(directory, 'DSM_Back', 'example.ts'), text);

    const record = await readSourceRecord(directory, 'DSM_Back/example.ts');

    assert.equal(record.text, text);
    assert.equal(record.lineCount, 2);
    assert.equal(record.lineEnding, 'CRLF');
    assert.equal(record.bytes, 28);
    assert.equal(record.language, 'TypeScript');
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('matches the approved logical-line baseline', async () => {
  const paths = await collectApplicationPaths(ROOT);
  const records = await Promise.all(
    paths.map((value) => readSourceRecord(ROOT, value)),
  );

  assert.equal(
    records.reduce((sum, value) => sum + value.lineCount, 0),
    13_168,
  );
});

test('rejects malformed UTF-8', () => {
  assert.throws(
    () => decodeUtf8(Buffer.from([0xc3, 0x28]), 'bad.ts'),
    /INVALID_UTF8:bad.ts/,
  );
});

test('marks credential-shaped literals without echoing matched values', () => {
  const result = assessExposureRisk({
    path: 'DSM_Back/example.ts',
    text: "const clientSecret = 'fixture-value';\n",
  });

  assert.equal(result.status, 'review-required');
  assert.deepEqual(result.reasons, ['credential-assignment']);
  assert.doesNotMatch(JSON.stringify(result), /fixture-value/);
});
