import test from 'node:test';
import assert from 'node:assert/strict';

import { BATCH_B_PATHS, pathsForBatch } from '../manifest.mjs';
import {
  AUTH_EXERCISES,
  AUTH_FLOW,
  AUTH_PAGES,
  BATCH_B_FILE_GUIDES,
} from '../content/batch-b.mjs';

test('covers all 13 Batch B files with cumulative evidence links', () => {
  const cumulative = pathsForBatch('batch-b');
  assert.deepEqual(
    Object.keys(BATCH_B_FILE_GUIDES).sort(),
    [...BATCH_B_PATHS].sort(),
  );

  for (const [sourcePath, guide] of Object.entries(BATCH_B_FILE_GUIDES)) {
    assert.match(guide.role, /\S/, sourcePath);
    assert.ok(guide.focus.length >= 3 && guide.focus.length <= 6, sourcePath);
    assert.match(guide.childExplanation, /\S/, sourcePath);
    assert.match(guide.juniorExplanation, /\S/, sourcePath);
    assert.ok(guide.evidence.length > 0, sourcePath);
    assert.ok(
      guide.evidence.every((item) => cumulative.includes(item.path)),
      sourcePath,
    );
    assert.ok(
      guide.related.every((item) => cumulative.includes(item)),
      sourcePath,
    );
    assert.ok(guide.risks.length > 0, sourcePath);
    assert.ok(guide.exercises.length > 0, sourcePath);
    assert.ok(
      guide.exercises.every((id) =>
        AUTH_EXERCISES.some((item) => item.id === id)),
      sourcePath,
    );
  }
});

test('locks Auth facts without leaking fixture token values or false claims', () => {
  assert.equal(AUTH_FLOW.accessTtl, '15m');
  assert.equal(AUTH_FLOW.refreshTtl, '30일');
  assert.equal(AUTH_FLOW.meResponse, '{ userId }');
  assert.equal(AUTH_FLOW.refreshIsolation, null);
  assert.deepEqual(
    AUTH_FLOW.providers.map((item) => item.name),
    ['Google', 'Kakao', 'Apple'],
  );
  assert.equal(AUTH_FLOW.providers.at(-1).status, '409 · 미구현');
  assert.deepEqual(
    Object.keys(AUTH_PAGES).sort(),
    ['jwtSession', 'refreshRotation', 'socialLogin'],
  );

  const serialized = JSON.stringify({
    AUTH_FLOW,
    AUTH_PAGES,
    AUTH_EXERCISES,
    BATCH_B_FILE_GUIDES,
  });
  assert.doesNotMatch(
    serialized,
    /"(?:google-id-token|access-token|refresh-token|user-uuid-1)"/,
  );
  assert.doesNotMatch(serialized, /Serializable transaction/);
});
