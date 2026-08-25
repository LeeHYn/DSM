import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATCH_B_PATHS,
  BATCH_ORDER,
  BATCH_PATHS,
  PILOT_A_PATHS,
  isReviewedExposure,
  pathsForBatch,
} from '../manifest.mjs';

test('reproduces Pilot A and cumulative Batch B membership', () => {
  assert.deepEqual(BATCH_ORDER, ['pilot-a', 'batch-b']);
  assert.equal(PILOT_A_PATHS.length, 15);
  assert.equal(BATCH_B_PATHS.length, 13);
  assert.equal(pathsForBatch('pilot-a').length, 15);
  assert.equal(pathsForBatch('batch-b').length, 28);
  assert.deepEqual(pathsForBatch('batch-b').slice(0, 15), PILOT_A_PATHS);
  assert.deepEqual(pathsForBatch('batch-b').slice(15), BATCH_B_PATHS);
  assert.equal(new Set(pathsForBatch('batch-b')).size, 28);
  assert.deepEqual(BATCH_PATHS['batch-b'], BATCH_B_PATHS);
});

test('rejects an unknown batch before generation', () => {
  assert.throws(() => pathsForBatch('pilot-c'), /UNKNOWN_BATCH:pilot-c/);
});

test('approves only exact reviewed exposure paths and reasons', () => {
  assert.equal(
    isReviewedExposure(
      'DSM_Back/src/auth/auth.service.ts',
      ['credential-assignment'],
    ),
    true,
  );
  assert.equal(
    isReviewedExposure(
      'DSM_Back/src/auth/auth.service.ts',
      ['credential-assignment', 'provider-token'],
    ),
    false,
  );
  assert.equal(
    isReviewedExposure(
      'DSM_Back/src/auth/auth.service.spec.ts',
      ['credential-assignment'],
    ),
    false,
  );
});
