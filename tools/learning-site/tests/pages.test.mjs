import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILE_GUIDES,
  PILOT_A_FLOW,
  PILOT_EXERCISES,
  SITE_COPY,
} from '../content/pilot-a.mjs';
import {
  renderArchitecturePage,
  renderDiagramPage,
  renderExercisePage,
  renderFilePage,
  renderIndexPage,
} from '../lib/pages.mjs';

const TEST_PATH = 'DSM_Back/src/tasks/tasks.service.ts';
const TEST_MODEL = {
  copy: SITE_COPY,
  flow: PILOT_A_FLOW,
  exercises: PILOT_EXERCISES,
  records: [
    {
      path: TEST_PATH,
      language: 'TypeScript',
      text: 'export class TasksService {}\n',
      bytes: 29,
      sha256: 'a'.repeat(64),
      lineCount: 277,
      lineEnding: 'LF',
      symbols: [{ kind: 'class', name: 'TasksService', line: 1 }],
      status: 'processed',
      outputPath: 'files/DSM_Back/src/tasks/tasks.service.ts.html',
    },
  ],
  guides: { [TEST_PATH]: FILE_GUIDES[TEST_PATH] },
  progress: { processed: 15, remaining: 109, missing: 0, excluded: [] },
};

test('architecture page labels evidence states without a false service edge', () => {
  const html = renderArchitecturePage(TEST_MODEL);

  assert.match(html, /PATCH \/tasks\/:id/);
  assert.match(html, /Serializable/);
  assert.match(html, /일정 변경 시/);
  assert.match(html, /확인 필요/);
  assert.doesNotMatch(html, /TasksService[^<]{0,80}NotificationsService/);
  assert.doesNotMatch(html, /FCM send/);
});

test('file page exposes the A through G learning anatomy', () => {
  const html = renderFilePage(TEST_MODEL, TEST_PATH);

  for (const label of [
    '위치와 역할',
    '먼저 볼 것',
    '원본 코드 · 변경 없음',
    'AI 설명 · 원본 밖',
    '관계와 근거',
    '위험·확인',
    '연습과 다음 단계',
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /TypeScript · 277줄 · 핵심 파일/);
  assert.match(html, /코드/);
  assert.match(html, /설명/);
  assert.match(html, /읽음/);
  assert.match(html, /file-heading__actions[\s\S]*data-read-toggle/);
  assert.equal((html.match(/data-read-toggle/g) ?? []).length, 2);
});

test('home and exercise pages expose scope, CTA, and collapsed answers', () => {
  const home = renderIndexPage(TEST_MODEL);
  const exercise = renderExercisePage(TEST_MODEL);

  assert.match(home, /124개 파일 · 13,168줄 · 오프라인/);
  assert.match(home, /Task 흐름 학습 시작/);
  assert.match(home, /미연결 · 확인 필요/);
  assert.match(home, /id="files"/);
  assert.match(home, /<main id="main" class="page-shell">/);
  assert.equal((exercise.match(/<details/g) ?? []).length, 7);
  assert.doesNotMatch(exercise, /<details\s+open/);
});

test('diagram page exposes pointer and keyboard controls', () => {
  const html = renderDiagramPage(TEST_MODEL);

  assert.match(html, /data-diagram-viewport/);
  assert.match(html, /data-diagram-zoom="in"/);
  assert.match(html, /data-diagram-zoom="out"/);
  assert.match(html, /data-diagram-reset/);
  assert.match(html, /tabindex="0"/);
});
