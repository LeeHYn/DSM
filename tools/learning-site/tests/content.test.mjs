import test from 'node:test';
import assert from 'node:assert/strict';

import { PILOT_A_PATHS } from '../manifest.mjs';
import {
  FILE_GUIDES,
  PILOT_A_FLOW,
  PILOT_EXERCISES,
  SITE_COPY,
} from '../content/pilot-a.mjs';

test('covers every pilot file exactly once with usable learning content', () => {
  assert.deepEqual(Object.keys(FILE_GUIDES).sort(), [...PILOT_A_PATHS].sort());

  for (const [sourcePath, guide] of Object.entries(FILE_GUIDES)) {
    assert.match(guide.role, /\S/, sourcePath);
    assert.ok(guide.focus.length >= 3 && guide.focus.length <= 6, sourcePath);
    assert.match(guide.childExplanation, /\S/, sourcePath);
    assert.match(guide.juniorExplanation, /\S/, sourcePath);
    assert.ok(guide.evidence.length > 0, sourcePath);
    assert.ok(
      guide.evidence.every((item) => PILOT_A_PATHS.includes(item.path)),
      sourcePath,
    );
    assert.ok(guide.related.every((item) => PILOT_A_PATHS.includes(item)));
    assert.ok(guide.risks.length > 0, sourcePath);
    assert.ok(guide.exercises.length > 0, sourcePath);
  }
});

test('keeps NotificationsService and FCM send outside the Task call graph', () => {
  assert.equal(
    PILOT_A_FLOW.edges.some(
      (edge) =>
        edge.from === 'tasks-service' && edge.to === 'notifications-service',
    ),
    false,
  );
  assert.equal(
    PILOT_A_FLOW.nodes.some((node) => node.id === 'fcm-send'),
    false,
  );
  assert.equal(PILOT_A_FLOW.transaction.isolation, 'Serializable');
});

test('locks approved navigation copy and exercise types', () => {
  assert.equal(SITE_COPY.brand, 'DSM 학습 지도');
  assert.equal(SITE_COPY.searchHint, '파일·클래스·함수 검색');
  assert.equal(SITE_COPY.sourceLabel, '원본 코드 · 변경 없음');
  assert.equal(SITE_COPY.explanationLabel, 'AI 설명 · 원본 밖');
  assert.deepEqual(
    new Set(PILOT_EXERCISES.map((exercise) => exercise.type)),
    new Set([
      'sequence',
      'responsibility',
      'transaction',
      'prediction',
      'policy',
      'evidence',
      'diagram-fix',
    ]),
  );
});
