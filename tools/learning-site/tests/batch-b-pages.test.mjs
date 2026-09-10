import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_EXERCISES,
  AUTH_FLOW,
  AUTH_PAGES,
  BATCH_B_FILE_GUIDES,
} from '../content/batch-b.mjs';
import {
  FILE_GUIDES,
  PILOT_A_FLOW,
  PILOT_EXERCISES,
  SITE_COPY,
} from '../content/pilot-a.mjs';
import {
  renderArchitecturePage,
  renderAuthDiagramPage,
  renderAuthExercisePage,
  renderFilePage,
  renderIndexPage,
  renderJwtSessionPage,
  renderRefreshRotationPage,
  renderSocialLoginPage,
} from '../lib/pages.mjs';

const PILOT_PATH = 'DSM_Back/test/app.e2e-spec.ts';
const AUTH_PATH = 'DSM_Back/src/main.ts';

function recordFor(sourcePath, name) {
  const text = `export class ${name} {}\n`;
  return {
    path: sourcePath,
    language: 'TypeScript',
    text,
    bytes: Buffer.byteLength(text),
    sha256: 'b'.repeat(64),
    lineCount: 1,
    lineEnding: 'LF',
    symbols: [{ kind: 'class', name, line: 1 }],
    status: 'processed',
    outputPath: `files/${sourcePath}.html`,
  };
}

const TEST_MODEL = {
  batch: 'batch-b',
  learningOrder: [PILOT_PATH, AUTH_PATH],
  copy: SITE_COPY,
  flow: PILOT_A_FLOW,
  exercises: PILOT_EXERCISES,
  auth: {
    flow: AUTH_FLOW,
    pages: AUTH_PAGES,
    exercises: AUTH_EXERCISES,
  },
  records: [
    recordFor(PILOT_PATH, 'AppE2eSpec'),
    recordFor(AUTH_PATH, 'MainEntrypoint'),
  ],
  guides: {
    [PILOT_PATH]: FILE_GUIDES[PILOT_PATH],
    [AUTH_PATH]: BATCH_B_FILE_GUIDES[AUTH_PATH],
  },
  progress: { processed: 28, remaining: 96, missing: 0, excluded: [] },
};

test('home and architecture add Auth without changing the Task diagram', () => {
  const home = renderIndexPage(TEST_MODEL);
  const architecture = renderArchitecturePage(TEST_MODEL);

  assert.match(home, /BATCH B · 13 FILES/);
  assert.match(home, /Social Auth와 refresh rotation/);
  assert.match(architecture, /Auth session 근거 지도/);
  assert.match(architecture, /PATCH \/tasks\/:id/);
  assert.doesNotMatch(architecture, /Task[^<]{0,80}AuthService/);
});

test('renders five Auth pages with exact fact boundaries', () => {
  const pages = [
    renderSocialLoginPage(TEST_MODEL),
    renderRefreshRotationPage(TEST_MODEL),
    renderJwtSessionPage(TEST_MODEL),
    renderAuthDiagramPage(TEST_MODEL),
    renderAuthExercisePage(TEST_MODEL),
  ];

  assert.match(pages[0], /Google/);
  assert.match(pages[0], /Kakao/);
  assert.match(pages[0], /Apple/);
  assert.match(pages[0], /409/);
  assert.match(pages[1], /updateMany/);
  assert.match(pages[1], /no-op/);
  assert.doesNotMatch(pages[1], /Serializable/);
  assert.match(pages[2], /15m/);
  assert.match(pages[2], /30일/);
  assert.match(pages[3], /data-diagram-viewport/);
  assert.match(pages[3], /data-diagram-layer/);
  assert.equal((pages[4].match(/<details/g) ?? []).length, 6);
  assert.doesNotMatch(pages[4], /<details\s+open/);
});

test('continues previous and next navigation across the batch boundary', () => {
  const pilot = renderFilePage(TEST_MODEL, PILOT_PATH);
  const auth = renderFilePage(TEST_MODEL, AUTH_PATH);

  assert.match(pilot, /href="\.\.\/src\/main\.ts\.html">다음<\/a>/);
  assert.match(auth, /href="\.\.\/test\/app\.e2e-spec\.ts\.html">이전<\/a>/);
});
