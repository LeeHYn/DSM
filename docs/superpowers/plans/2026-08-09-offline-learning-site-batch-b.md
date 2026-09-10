# DSM Offline Learning Site Batch B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 Social Auth와 refresh rotation 원본 13개를 Pilot A에 누적해, source-verifiable HTML 39개와 오프라인 학습 흐름을 만든다.

**Architecture:** `manifest.mjs`가 `pilot-a`와 `batch-b` stage의 누적 source membership을 계산하고, 새 `content/batch-b.mjs`가 Auth 전용 설명·근거·연습을 소유한다. 기존 generator, page renderer와 verifier는 선택 stage model을 소비하도록 확장하되 Pilot A 15/109 재현 계약을 보존한다. 실제 output은 TDD와 clean temporary generation을 통과한 뒤 `--only`로 한 번에 최대 두 파일씩 갱신한다.

**Tech Stack:** Node.js >=22 built-ins (`node:test`, `node:assert`, `node:fs`, `node:path`, `node:crypto`), ECMAScript modules, static HTML5/CSS/JavaScript, inline SVG, browser `localStorage`; 새 package·CDN·network runtime 없음.

## Global Constraints

- 필수 선행 문서: `docs/superpowers/specs/2026-08-09-offline-learning-site-batch-b-design.md`와 `docs/superpowers/specs/2026-08-08-offline-learning-site-design.md`.
- source 기준은 `C:\DEV`, branch `codex/m12b-front-prototype-checkpoint`, commit `960f02b`다.
- corpus 기준선은 124 files·13,168 logical lines다: `DSM_Back` 88/8,787, `DSM_Front` 36/4,381.
- `pilot-a`는 processed 15, remaining 109, missing 0, HTML 21개를 clean temporary output에서 계속 재현해야 한다.
- `batch-b`는 Pilot A∪Batch B의 processed 28, remaining 96, missing 0, HTML 39개다.
- Batch B 신규 source는 명세의 13개·883줄이며 `auth.service.ts`와 `auth.service.spec.ts`를 가장 깊게 설명한다.
- `DSM_Back/**`, `DSM_Front/**`와 관련 없는 dirty/untracked 파일은 수정하지 않는다.
- `DSM_Back/.env`를 읽거나 노출하지 않는다. 실제 credential·token·사용자 식별자를 content, diagram, site data, report에 넣지 않는다.
- source code region은 원본 text, SHA-256, UTF-8 bytes, logical lines, line ending이 일치해야 한다. 설명은 원본 밖 DOM에 둔다.
- Google은 configured audience로 ID token을 확인하고 Kakao는 `/v2/user/me`를 호출하며 Apple은 현재 409다.
- `/auth/me`는 `{ userId }`만 반환한다. access TTL은 `15m`, refresh TTL은 30일이다.
- refresh는 `<recordId>.<secret>` parse → PK lookup → revoked/expiry/bcrypt check → transaction 안 conditional `updateMany` → replacement create 순서다.
- Auth refresh transaction을 Serializable이라고 쓰지 않는다. replacement failure spec은 failure propagation까지 확인하고 실제 PostgreSQL rollback은 integration 범위 밖이라고 표시한다.
- logout은 소유권·secret이 모두 맞을 때만 revoke하며 malformed/missing/mismatch는 no-op이다.
- controller spec은 login/refresh delegation과 supplied JWT payload의 `/auth/me` 반환을 확인할 뿐 guard 자체를 실행하지 않는다.
- permissive CORS, JWT secret의 `get`, first-login uniqueness race 가능성, Apple 미구현, live provider 미검증, mock test 한계를 표시한다.
- 기존 local CSS/JS와 diagram controls를 재사용한다. QA가 실패하기 전에는 asset source를 수정하지 않는다. 실패하면 계획을 중단하고 정확한 test·asset 파일 allowlist를 추가 승인받는다.
- 각 실행 step은 hand-authored 또는 generated file을 최대 두 개만 수정한다.
- 현재 사용자가 선택한 실행 방식은 current root inline/no-Git이다. subagent, worktree, Git stage·commit·push·branch·PR을 실행하지 않는다.
- dependency 설치, network fetch, DB·Docker·Firebase·제품 service 실행을 하지 않는다.
- Node는 현재 설치된 v24.13.0을 사용하되 code는 Node >=22와 호환한다.
- Browser QA server는 `C:\DEV\learning-site`만 제공하고 QA 직후 종료하여 port closed를 확인한다.

---

## File Structure

### Hand-authored changes

| Path | Responsibility |
|---|---|
| `tools/learning-site/manifest.mjs` | stage registry, Batch B 13 paths, cumulative membership |
| `tools/learning-site/content/batch-b.mjs` | Auth flow, overview copy, 13 file guides, exercises, risks |
| `tools/learning-site/generate.mjs` | stage model, cumulative guides/order, stage-aware output registry |
| `tools/learning-site/lib/pages.mjs` | Batch B path, Auth overview renderers, cumulative prev/next |
| `tools/learning-site/verify.mjs` | stage-specific output/progress/source/copy/secret verification |

### New focused tests

| Path | Responsibility |
|---|---|
| `tools/learning-site/tests/batches.test.mjs` | stage path/count/unknown/duplicate contract |
| `tools/learning-site/tests/batch-b-content.test.mjs` | 13 guide coverage, fact boundary, secret non-duplication |
| `tools/learning-site/tests/batch-b-generate.test.mjs` | cumulative model and exact output registry |
| `tools/learning-site/tests/batch-b-pages.test.mjs` | five Auth pages, index/architecture additions, file order |
| `tools/learning-site/tests/batch-b-verify.test.mjs` | Pilot A/Batch B full verification and prohibited claims |

### Generated output

```text
learning-site/
├─ index.html
├─ architecture.html
├─ concepts/
│  ├─ serializable-transaction.html
│  └─ jwt-session.html
├─ features/
│  ├─ task-score-schedule.html
│  ├─ social-login.html
│  └─ refresh-rotation.html
├─ diagrams/
│  ├─ task-update-flow.html
│  └─ auth-session-flow.html
├─ exercises/
│  ├─ task-flow.html
│  └─ auth-session.html
├─ files/DSM_Back/...                 # cumulative source pages 28개
├─ assets/site.css                    # 기존 파일 유지
├─ assets/site.js                     # 기존 파일 유지
├─ assets/site-data.js                # Batch B progress/search
├─ verification-report.json
└─ qa-report.md
```

## Locked Interfaces

```js
// manifest.mjs
export const BATCH_B_PATHS;
export const BATCH_PATHS;
export const BATCH_ORDER;
export function pathsForBatch(batch); // frozen cumulative string[]; unknown -> throw

// content/batch-b.mjs
export const AUTH_FLOW;
export const AUTH_PAGES;
export const AUTH_EXERCISES;
export const BATCH_B_FILE_GUIDES;

// generate.mjs model additions
{
  batch: 'pilot-a' | 'batch-b',
  learningOrder: readonly string[],
  auth: null | {
    flow: typeof AUTH_FLOW,
    pages: typeof AUTH_PAGES,
    exercises: typeof AUTH_EXERCISES,
  },
  // 기존 copy, flow, exercises, records, guides, progress 보존
}

// verify.mjs
export async function verifySite({ rootDir, outputDir, batch = 'pilot-a' });
```

---

### Task 1: Add the Stage-Aware Source Registry

**Files:**
- Create: `tools/learning-site/tests/batches.test.mjs`
- Modify: `tools/learning-site/manifest.mjs`

**Interfaces:**
- Consumes: existing `PILOT_A_PATHS` and corpus rules.
- Produces: `BATCH_B_PATHS`, `BATCH_PATHS`, `BATCH_ORDER`, `pathsForBatch(batch)`.

- [ ] **Step 1: Write the failing stage registry test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_B_PATHS,
  BATCH_ORDER,
  BATCH_PATHS,
  PILOT_A_PATHS,
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
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run: `node --test tools/learning-site/tests/batches.test.mjs`

Expected: FAIL because `BATCH_B_PATHS` is not exported.

- [ ] **Step 3: Implement the exact registry**

Add the following immutable paths and cumulative resolver after `PILOT_A_PATHS`:

```js
export const BATCH_B_PATHS = Object.freeze([
  'DSM_Back/src/main.ts',
  'DSM_Back/src/app.bootstrap.ts',
  'DSM_Back/src/auth/auth.module.ts',
  'DSM_Back/src/auth/auth.controller.ts',
  'DSM_Back/src/auth/auth.service.ts',
  'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
  'DSM_Back/src/auth/dto/social-login.dto.ts',
  'DSM_Back/src/auth/dto/refresh-token.dto.ts',
  'DSM_Back/src/auth/dto/token-response.dto.ts',
  'DSM_Back/src/auth/types/jwt-payload.type.ts',
  'DSM_Back/src/auth/types/social-profile.type.ts',
  'DSM_Back/src/auth/auth.controller.spec.ts',
  'DSM_Back/src/auth/auth.service.spec.ts',
]);

export const BATCH_ORDER = Object.freeze(['pilot-a', 'batch-b']);
export const BATCH_PATHS = Object.freeze({
  'pilot-a': PILOT_A_PATHS,
  'batch-b': BATCH_B_PATHS,
});

export function pathsForBatch(batch) {
  const lastIndex = BATCH_ORDER.indexOf(batch);
  if (lastIndex === -1) throw new Error(`UNKNOWN_BATCH:${batch}`);
  const paths = BATCH_ORDER
    .slice(0, lastIndex + 1)
    .flatMap((stage) => BATCH_PATHS[stage]);
  if (new Set(paths).size !== paths.length) {
    throw new Error(`DUPLICATE_BATCH_SOURCE:${batch}`);
  }
  return Object.freeze(paths);
}
```

- [ ] **Step 4: Run manifest tests**

Run: `node --test tools/learning-site/tests/manifest.test.mjs tools/learning-site/tests/batches.test.mjs`

Expected: PASS; corpus 124, Pilot A 15, Batch B delta 13, cumulative 28.

- [ ] **Step 5: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/manifest.mjs tools/learning-site/tests/batches.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 2: Author the Batch B Evidence Content

**Files:**
- Create: `tools/learning-site/tests/batch-b-content.test.mjs`
- Create: `tools/learning-site/content/batch-b.mjs`

**Interfaces:**
- Consumes: `BATCH_B_PATHS`, reused Pilot paths for relation evidence.
- Produces: `AUTH_FLOW`, `AUTH_PAGES`, `AUTH_EXERCISES`, `BATCH_B_FILE_GUIDES`.

- [ ] **Step 1: Write the failing content-contract test**

```js
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
  assert.deepEqual(Object.keys(BATCH_B_FILE_GUIDES).sort(), [...BATCH_B_PATHS].sort());
  for (const [sourcePath, guide] of Object.entries(BATCH_B_FILE_GUIDES)) {
    assert.match(guide.role, /\S/, sourcePath);
    assert.ok(guide.focus.length >= 3 && guide.focus.length <= 6, sourcePath);
    assert.match(guide.childExplanation, /\S/, sourcePath);
    assert.match(guide.juniorExplanation, /\S/, sourcePath);
    assert.ok(guide.evidence.every((item) => cumulative.includes(item.path)), sourcePath);
    assert.ok(guide.related.every((item) => cumulative.includes(item)), sourcePath);
    assert.ok(guide.risks.length > 0, sourcePath);
    assert.ok(guide.exercises.every((id) => AUTH_EXERCISES.some((item) => item.id === id)), sourcePath);
  }
});

test('locks Auth facts without leaking fixture token values or false claims', () => {
  assert.equal(AUTH_FLOW.accessTtl, '15m');
  assert.equal(AUTH_FLOW.refreshTtl, '30일');
  assert.equal(AUTH_FLOW.meResponse, '{ userId }');
  assert.equal(AUTH_FLOW.refreshIsolation, null);
  assert.deepEqual(AUTH_FLOW.providers.map((item) => item.name), ['Google', 'Kakao', 'Apple']);
  assert.equal(AUTH_FLOW.providers.at(-1).status, '409 · 미구현');
  assert.deepEqual(Object.keys(AUTH_PAGES).sort(), ['jwtSession', 'refreshRotation', 'socialLogin']);
  const serialized = JSON.stringify({ AUTH_FLOW, AUTH_PAGES, AUTH_EXERCISES, BATCH_B_FILE_GUIDES });
  assert.doesNotMatch(serialized, /google-id-token|access-token|refresh-token|user-uuid-1/);
  assert.doesNotMatch(serialized, /Serializable transaction/);
});
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run: `node --test tools/learning-site/tests/batch-b-content.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `content/batch-b.mjs`.

- [ ] **Step 3: Implement immutable Auth flow, pages and exercises**

Use this exact top-level structure:

```js
function freezeGuide(guide) {
  return Object.freeze({
    ...guide,
    focus: Object.freeze(guide.focus),
    evidence: Object.freeze(guide.evidence.map((item) => Object.freeze(item))),
    risks: Object.freeze(guide.risks),
    related: Object.freeze(guide.related),
    exercises: Object.freeze(guide.exercises),
  });
}

export const AUTH_FLOW = Object.freeze({
  title: 'Social login → access/refresh 발급 → guard·rotation·logout',
  accessTtl: '15m',
  refreshTtl: '30일',
  meResponse: '{ userId }',
  refreshIsolation: null,
  providers: Object.freeze([
    Object.freeze({ name: 'Google', check: 'verifyIdToken · configured audience', status: '구현됨 · live 미검증' }),
    Object.freeze({ name: 'Kakao', check: 'GET /v2/user/me', status: '구현됨 · live 미검증' }),
    Object.freeze({ name: 'Apple', check: 'ConflictException', status: '409 · 미구현' }),
  ]),
  login: Object.freeze(['ValidationPipe + DTO', 'provider 확인', 'socialAccount 조회', '기존 user 또는 신규 user/account', 'access + refresh 발급']),
  guard: Object.freeze(['Bearer 추출', 'JWT secret verify', "payload.type === 'access'", 'request.user 부착', '실패는 401']),
  refresh: Object.freeze(['<recordId>.<secret> 파싱', 'PK findUnique', 'revoked/expiry/bcrypt 검사', 'transaction conditional updateMany', '단일 승자 replacement 생성']),
  logout: Object.freeze(['access guard identity', 'record ownership + secret 검사', '일치 시 revoke', 'malformed/missing/mismatch는 no-op']),
});

export const AUTH_PAGES = Object.freeze({
  socialLogin: Object.freeze({
    title: '세 provider를 같은 성공 경로로 단정하지 않기',
    lede: 'DTO부터 socialAccount 조회·생성, token 발급까지 확인된 분기와 live 미검증 경계를 분리합니다.',
    sections: Object.freeze(['ValidationPipe와 SocialLoginDto', 'Google configured audience', 'Kakao /v2/user/me', 'Apple 409', '기존 사용자와 신규 사용자']),
  }),
  refreshRotation: Object.freeze({
    title: '한 refresh token에는 한 명의 승자만 남기기',
    lede: 'id/secret 분리, hash 검증, conditional revoke, replacement 실패 전파와 logout no-op을 읽습니다.',
    sections: Object.freeze(['parse와 PK lookup', 'revoked·expiry·bcrypt', 'updateMany count === 1', 'replacement failure propagation', 'logout ownership']),
  }),
  jwtSession: Object.freeze({
    title: '짧은 access와 DB에 남는 refresh의 역할 나누기',
    lede: 'access payload·TTL, refresh hash·TTL, guard와 /auth/me의 실제 반환 범위를 비교합니다.',
    sections: Object.freeze(['access 15m', 'refresh 30일', "payload type 'access'", 'DB에는 secret hash', '/auth/me는 userId만']),
  }),
});

export const AUTH_EXERCISES = Object.freeze([
  Object.freeze({ id: 'auth-provider-order', type: 'sequence', difficulty: '입문', question: 'login 요청 뒤 token 발급까지 순서를 배열하세요.', answer: 'DTO 검증 → provider 확인 → socialAccount 조회 → 기존/신규 user 분기 → token 발급이다.', sourcePaths: Object.freeze(['DSM_Back/src/auth/auth.controller.ts', 'DSM_Back/src/auth/auth.service.ts']) }),
  Object.freeze({ id: 'auth-guard-boundary', type: 'boundary', difficulty: '입문', question: 'guard가 거부하는 세 경계를 찾으세요.', answer: 'Bearer token 누락, JWT 검증 실패, access가 아닌 payload type은 401 경계다.', sourcePaths: Object.freeze(['DSM_Back/src/auth/guards/jwt-auth.guard.ts']) }),
  Object.freeze({ id: 'auth-refresh-race', type: 'concurrency', difficulty: '주니어', question: '같은 refresh token의 동시 요청에서 패자가 생기는 근거를 찾으세요.', answer: 'transaction 안 conditional updateMany의 count가 1인 요청만 replacement를 만들며 나머지는 401이다.', sourcePaths: Object.freeze(['DSM_Back/src/auth/auth.service.ts', 'DSM_Back/src/auth/auth.service.spec.ts']) }),
  Object.freeze({ id: 'auth-logout-noop', type: 'prediction', difficulty: '주니어', question: '다른 사용자 소유 token으로 logout하면 어떤 DB write가 일어납니까?', answer: 'ownership이 맞지 않아 revoke update 없이 no-op으로 끝난다.', sourcePaths: Object.freeze(['DSM_Back/src/auth/auth.service.ts', 'DSM_Back/src/auth/auth.service.spec.ts']) }),
  Object.freeze({ id: 'auth-test-boundary', type: 'evidence', difficulty: '주니어', question: 'service spec이 확인하지 않는 실제 환경을 구분하세요.', answer: 'Google/Kakao live network, 실제 PostgreSQL rollback/isolation, 배포 secret과 전체 HTTP pipeline은 mock unit test 범위 밖이다.', sourcePaths: Object.freeze(['DSM_Back/src/auth/auth.controller.spec.ts', 'DSM_Back/src/auth/auth.service.spec.ts']) }),
  Object.freeze({ id: 'auth-bootstrap-risk', type: 'risk', difficulty: '주니어', question: 'bootstrap과 guard에서 배포 전 확인할 설정 두 가지를 찾으세요.', answer: 'origin:true와 credentials:true CORS, JWT_ACCESS_SECRET을 get으로 읽는 설정을 확인해야 한다.', sourcePaths: Object.freeze(['DSM_Back/src/app.bootstrap.ts', 'DSM_Back/src/auth/guards/jwt-auth.guard.ts']) }),
]);
```

Define `BATCH_B_FILE_GUIDES` with the existing guide shape. The exact per-file contract is:

| Source | Class | Focus | Required risk | Exercise |
|---|---|---|---|---|
| `main.ts` | support | `bootstrap`, `NestFactory.create`, `configureApp`, `PORT ?? 3000` | entrypoint는 validation 구현 자체가 아님 | `auth-bootstrap-risk` |
| `app.bootstrap.ts` | core | flatten errors, whitelist, forbid, transform, filter, CORS | permissive CORS | `auth-bootstrap-risk` |
| `auth.module.ts` | support | JwtModule, providers, controller, exports | DI 등록은 runtime 호출 증거가 아님 | `auth-guard-boundary` |
| `auth.controller.ts` | core | four routes, DTO forwarding, guards, `{ userId }` | `/auth/me` profile 과장 금지 | `auth-provider-order` |
| `auth.service.ts` | core | provider verify, social account, TTL, refresh race, logout | no Serializable claim; first-login race 확인 필요 | `auth-provider-order`, `auth-refresh-race`, `auth-logout-noop` |
| `jwt-auth.guard.ts` | core | Bearer, verify, access type, request.user, 401 | secret uses `get` | `auth-guard-boundary`, `auth-bootstrap-risk` |
| `social-login.dto.ts` | support | enum, string, non-empty | DTO 통과는 provider 성공 보장이 아님 | `auth-provider-order` |
| `refresh-token.dto.ts` | support | string, non-empty, controller boundary | 형식·hash 검증은 service 책임 | `auth-refresh-race` |
| `token-response.dto.ts` | support | accessToken, refreshToken, response shape | TTL·저장 정책은 DTO가 정하지 않음 | `auth-test-boundary` |
| `jwt-payload.type.ts` | support | sub, literal access type | runtime verify를 type alias가 대신하지 않음 | `auth-guard-boundary` |
| `social-profile.type.ts` | support | provider id, nullable email/image, nickname | provider별 raw response와 동일하지 않음 | `auth-provider-order` |
| `auth.controller.spec.ts` | core | login delegation, refresh delegation, me userId | guard 자체·logout 미검증 | `auth-test-boundary` |
| `auth.service.spec.ts` | core | Google config, refresh happy/race/failure/invalid, logout | mock은 live provider·실제 DB 통합이 아님 | `auth-refresh-race`, `auth-logout-noop`, `auth-test-boundary` |

For every guide, set `childExplanation` to one short analogy tied to the role, `juniorExplanation` to the exact focus and failure boundary above, `evidence` to its own source plus service/spec when named, and `related` only to paths returned by `pathsForBatch('batch-b')`. Do not copy dummy token literals from the specs.

- [ ] **Step 4: Run the content tests**

Run: `node --test tools/learning-site/tests/content.test.mjs tools/learning-site/tests/batch-b-content.test.mjs`

Expected: PASS; 15 Pilot guides and 13 Batch B guides remain separate and complete.

- [ ] **Step 5: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/content/batch-b.mjs tools/learning-site/tests/batch-b-content.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 3: Build a Cumulative Stage Model

**Files:**
- Create: `tools/learning-site/tests/batch-b-generate.test.mjs`
- Modify: `tools/learning-site/generate.mjs`

**Interfaces:**
- Consumes: `pathsForBatch`, Pilot content, Batch B content.
- Produces: `buildSiteModel({ rootDir, batch })` with `batch`, `learningOrder`, merged guides and optional `auth`.

- [ ] **Step 1: Write the failing cumulative-model tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteModel } from '../generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('keeps Pilot A independently reproducible', async () => {
  const model = await buildSiteModel({ rootDir: ROOT, batch: 'pilot-a' });
  assert.equal(model.batch, 'pilot-a');
  assert.equal(model.learningOrder.length, 15);
  assert.equal(model.auth, null);
  assert.deepEqual({ processed: model.progress.processed, remaining: model.progress.remaining, missing: model.progress.missing }, { processed: 15, remaining: 109, missing: 0 });
});

test('builds cumulative Batch B without duplicate source data', async () => {
  const model = await buildSiteModel({ rootDir: ROOT, batch: 'batch-b' });
  assert.equal(model.batch, 'batch-b');
  assert.equal(model.learningOrder.length, 28);
  assert.equal(new Set(model.learningOrder).size, 28);
  assert.equal(Object.keys(model.guides).length, 28);
  assert.equal(model.auth.flow.refreshIsolation, null);
  assert.deepEqual({ processed: model.progress.processed, remaining: model.progress.remaining, missing: model.progress.missing }, { processed: 28, remaining: 96, missing: 0 });
});
```

- [ ] **Step 2: Run and observe failure**

Run: `node --test tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: FAIL because only `pilot-a` is accepted and `learningOrder` is absent.

- [ ] **Step 3: Implement the stage model**

Replace `assertPilotBatch` and direct `PILOT_A_PATHS` membership with `pathsForBatch(batch)`. Merge content without mutating imported objects:

```js
function contentForBatch(batch) {
  if (batch === 'pilot-a') {
    return Object.freeze({
      learningOrder: pathsForBatch(batch),
      guides: FILE_GUIDES,
      auth: null,
    });
  }
  return Object.freeze({
    learningOrder: pathsForBatch(batch),
    guides: Object.freeze({ ...FILE_GUIDES, ...BATCH_B_FILE_GUIDES }),
    auth: Object.freeze({
      flow: AUTH_FLOW,
      pages: AUTH_PAGES,
      exercises: AUTH_EXERCISES,
    }),
  });
}
```

In `buildSiteModel`, use `content.learningOrder` for missing-source and processed checks, then return:

```js
return Object.freeze({
  batch,
  learningOrder: content.learningOrder,
  copy: SITE_COPY,
  flow: PILOT_A_FLOW,
  exercises: PILOT_EXERCISES,
  auth: content.auth,
  records: Object.freeze(records),
  guides: content.guides,
  progress: Object.freeze({ processed, remaining, missing: 0, excluded: PUBLIC_EXCLUSIONS }),
});
```

Keep `runtimeData(model)` metadata-only; do not add guide prose, raw source text, or token-shaped values.

- [ ] **Step 4: Run model and original generator tests**

Run: `node --test tools/learning-site/tests/generate.test.mjs tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: PASS for Pilot A and cumulative Batch B model tests.

- [ ] **Step 5: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/generate.mjs tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 4: Render the Batch B Learning Path and Five Auth Pages

**Files:**
- Create: `tools/learning-site/tests/batch-b-pages.test.mjs`
- Modify: `tools/learning-site/lib/pages.mjs`

**Interfaces:**
- Consumes: `model.learningOrder`, `model.auth`, existing document shell and diagram runtime selectors.
- Produces: `renderSocialLoginPage`, `renderRefreshRotationPage`, `renderJwtSessionPage`, `renderAuthDiagramPage`, `renderAuthExercisePage`; new `OUTPUT_PATHS` keys.

- [ ] **Step 1: Write the failing page tests**

Build a small `TEST_MODEL` with one Pilot record, one Auth record, `learningOrder` containing both, and `auth` copied from Batch B content. Assert:

```js
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
  assert.equal((pages[4].match(/<details/g) ?? []).length, 6);
});
```

Also render the final Pilot file and first Batch B file; assert the Pilot file's `다음` points to `main.ts.html` and the first Batch B file's `이전` points to `app.e2e-spec.ts.html`.

- [ ] **Step 2: Run and observe missing exports**

Run: `node --test tools/learning-site/tests/batch-b-pages.test.mjs`

Expected: FAIL because the five Auth renderers and output keys do not exist.

- [ ] **Step 3: Add output paths and cumulative file navigation**

Extend `OUTPUT_PATHS` exactly:

```js
authSocial: 'features/social-login.html',
authRefresh: 'features/refresh-rotation.html',
authConcept: 'concepts/jwt-session.html',
authExercise: 'exercises/auth-session.html',
authDiagram: 'diagrams/auth-session-flow.html',
```

Remove the `PILOT_A_PATHS` import. In `renderFilePage`, calculate previous/next with `model.learningOrder`. Add `allExercises(model)` returning Pilot exercises plus `model.auth?.exercises ?? []` only for file-guide lookup; keep `renderExercisePage` Pilot-only.

- [ ] **Step 4: Add the Batch B home and architecture summaries**

`renderBatchBPath(model, outputPath)` returns an empty string when `model.auth` is null; for Batch B it renders `BATCH B · 13 FILES`, `Social Auth와 refresh rotation`, and links to social login, refresh rotation and Auth diagram. `renderIndexPage` inserts it after Pilot A.

`renderArchitecturePage` must preserve `renderFlowSvg()` unchanged and append this separate summary:

```html
<section class="boundary-note" aria-labelledby="auth-map-title">
  <p class="eyebrow">AUTH EVIDENCE MAP</p>
  <h2 id="auth-map-title">Auth session 근거 지도</h2>
  <p>Social login, access guard, refresh single-winner rotation, logout no-op을 별도 흐름으로 읽습니다.</p>
  <a class="evidence-link" href="diagrams/auth-session-flow.html">Auth diagram 보기</a>
</section>
```

Use `href()` for the actual relative link.

- [ ] **Step 5: Implement the five Auth pages with existing components**

- Social page: `AUTH_PAGES.socialLogin`, provider cards, service source links, `확인 필요` live boundary.
- Refresh page: parse/check/updateMany/replacement/logout cards, explicit `Serializable 아님`, mock rollback limitation.
- JWT concept: 15m/30일, access payload, refresh hash, `{ userId }`, secret `get` risk.
- Diagram: inline SVG with two labeled lanes, `data-diagram-layer`, confirmed/conditional/unknown line classes, existing zoom toolbar and `data-diagram-viewport`.
- Exercise: exactly six `model.auth.exercises`, closed `<details>`, source links from each exercise.

All dynamic text goes through `escapeHtml`. All links use `href` or `sourceHref`. Use only existing classes: `page-shell`, `page-heading`, `branch-grid`, `branch-card`, `concept-grid`, `diagram-card`, `diagram-toolbar`, `diagram-viewport`, `architecture-svg`, `diagram-layer`, `exercise-grid`, `exercise-card`, `boundary-note`, and evidence classes.

- [ ] **Step 6: Run page and style contracts**

Run: `node --test tools/learning-site/tests/pages.test.mjs tools/learning-site/tests/batch-b-pages.test.mjs tools/learning-site/tests/style.test.mjs`

Expected: PASS. No CSS/JS source change.

- [ ] **Step 7: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/lib/pages.mjs tools/learning-site/tests/batch-b-pages.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 5: Make the Generator Output Registry Stage-Aware

**Files:**
- Modify: `tools/learning-site/tests/batch-b-generate.test.mjs`
- Modify: `tools/learning-site/generate.mjs`

**Interfaces:**
- Consumes: five new page renderers and `pathsForBatch(batch)`.
- Produces: exact Pilot A 24 generated files and Batch B 42 generated files before reports.

- [ ] **Step 1: Add failing output-registry tests**

Use temporary directories and cleanup in `afterEach`. Add:

```js
test('generates exact clean output sets for both stages', async () => {
  const pilotDir = await temporaryDirectory('learning-pilot-a-');
  const batchDir = await temporaryDirectory('learning-batch-b-');
  const pilot = await generateSite({ rootDir: ROOT, outputDir: pilotDir, batch: 'pilot-a' });
  const batch = await generateSite({ rootDir: ROOT, outputDir: batchDir, batch: 'batch-b' });
  assert.equal(pilot.written.length, 24); // 3 assets + 6 overview + 15 source
  assert.equal(batch.written.length, 42); // 3 assets + 11 overview + 28 source
  assert.equal(batch.written.filter((value) => value.endsWith('.html')).length, 39);
  assert.ok(batch.written.includes('features/social-login.html'));
  assert.ok(batch.written.includes('diagrams/auth-session-flow.html'));
});

test('rejects a Batch B output id from the Pilot A stage before writing', async () => {
  const outputDir = await temporaryDirectory('learning-cross-stage-');
  await assert.rejects(
    () => generateSite({ rootDir: ROOT, outputDir, batch: 'pilot-a', only: ['page:auth-social-login'] }),
    /UNKNOWN_OUTPUT_ID:page:auth-social-login/,
  );
});
```

- [ ] **Step 2: Run and observe count/unknown-output failures**

Run: `node --test tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: FAIL because output IDs are still Pilot-only.

- [ ] **Step 3: Implement stage page registries**

Keep the existing six page IDs as `BASE_PAGE_OUTPUTS`. Add:

```js
const AUTH_PAGE_OUTPUTS = Object.freeze({
  'page:auth-social-login': OUTPUT_PATHS.authSocial,
  'page:auth-refresh-rotation': OUTPUT_PATHS.authRefresh,
  'page:auth-jwt-session': OUTPUT_PATHS.authConcept,
  'page:auth-session-exercise': OUTPUT_PATHS.authExercise,
  'page:auth-session-flow': OUTPUT_PATHS.authDiagram,
});

function pageOutputsForBatch(batch) {
  pathsForBatch(batch); // validates before any write
  return batch === 'batch-b'
    ? Object.freeze({ ...BASE_PAGE_OUTPUTS, ...AUTH_PAGE_OUTPUTS })
    : BASE_PAGE_OUTPUTS;
}
```

Make `allOutputIds(batch)`, `validateOutputIds(only, batch)`, `pageContents(outputId, model)`, and `outputPathForId(outputId, batch)` stage-aware. Map the five IDs to their exact renderers. Source output IDs come from `pathsForBatch(batch)`, not `PILOT_A_PATHS`. Validate all IDs before building or writing.

- [ ] **Step 4: Run generator tests**

Run: `node --test tools/learning-site/tests/generate.test.mjs tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: PASS; exact 24/42 output counts and 39 Batch B HTML.

- [ ] **Step 5: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/generate.mjs tools/learning-site/tests/batch-b-generate.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 6: Verify Both Stages and Auth Fact Boundaries

**Files:**
- Create: `tools/learning-site/tests/batch-b-verify.test.mjs`
- Modify: `tools/learning-site/verify.mjs`

**Interfaces:**
- Consumes: `pathsForBatch(batch)`, stage output paths and generated site data.
- Produces: `verifySite({ rootDir, outputDir, batch })` reports with 21/39 pages and 15/28 sources.

- [ ] **Step 1: Write failing full-stage tests**

```js
test('verifies clean Pilot A output', async () => {
  const pilotDir = await temporaryDirectory('verify-pilot-a-');
  await generateSite({ rootDir: ROOT, outputDir: pilotDir, batch: 'pilot-a' });
  const pilot = await verifySite({ rootDir: ROOT, outputDir: pilotDir, batch: 'pilot-a' });
  assert.equal(pilot.pages, 21);
  assert.equal(pilot.sources.length, 15);
  assert.deepEqual(pilot.progress, { processed: 15, remaining: 109, missing: 0, excluded: 9 });
});

test('verifies cumulative Batch B output', async () => {
  const batchDir = await temporaryDirectory('verify-batch-b-');
  await generateSite({ rootDir: ROOT, outputDir: batchDir, batch: 'batch-b' });
  const batch = await verifySite({ rootDir: ROOT, outputDir: batchDir, batch: 'batch-b' });
  assert.equal(batch.pages, 39);
  assert.equal(batch.sources.length, 28);
  assert.deepEqual(batch.progress, { processed: 28, remaining: 96, missing: 0, excluded: 9 });
});
```

Add a second test that writes `Serializable transaction` into `features/refresh-rotation.html` and expects `FALSE_AUTH_SERIALIZABLE_CLAIM`. Add a third that writes `google-id-token` outside a preserved source region and expects `AUTH_FIXTURE_TOKEN_EXPOSED`.

- [ ] **Step 2: Run and observe stage mismatch**

Run: `node --test tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: FAIL because verifier hard-codes Pilot A membership and counts.

- [ ] **Step 3: Make required paths and progress stage-aware**

Implement `requiredSitePaths(batch)` from three assets, six base pages, five Auth pages only for Batch B, and `pathsForBatch(batch).map(fileOutputPath)`. Pass `batch` through `assertRequiredFiles`, `assertProgressAndSearch`, `verifyRequiredCopy`, and `verifySite`. Expected progress derives from `pathsForBatch(batch).length` and `CORPUS_BASELINE.files`.

`assertRequiredFiles` must assert exact source page count 15/28 and exact HTML count 21/39 in clean output. `verifySite` loops over `pathsForBatch(batch)` for source fidelity.

- [ ] **Step 4: Add Auth copy and exposure checks**

For Batch B, require these strings in the designated pages:

```js
const AUTH_REQUIRED_COPY = Object.freeze({
  'features/social-login.html': ['Google', 'Kakao', 'Apple', '409', '확인 필요'],
  'features/refresh-rotation.html': ['updateMany', '단일 승자', 'no-op', '실제 PostgreSQL'],
  'concepts/jwt-session.html': ['15m', '30일', '{ userId }', 'get'],
  'diagrams/auth-session-flow.html': ['data-diagram-viewport', 'provider', 'refresh'],
  'exercises/auth-session.html': ['답과 해설 보기', 'mock'],
});
```

Scan only the five Auth overview pages for `Serializable` and throw `FALSE_AUTH_SERIALIZABLE_CLAIM:<path>`. Scan all generated HTML after `withoutPreservedSource` and `assets/site-data.js` for `google-id-token`, `access-token`, `refresh-token`, `user-uuid-1`; throw `AUTH_FIXTURE_TOKEN_EXPOSED:<path>`. Preserved source regions remain exempt because source fidelity requires their exact test literals.

- [ ] **Step 5: Add `--batch` to verifier CLI**

`parseVerifyArgs` defaults to `{ batch: 'pilot-a', sources: [], full: false }`, accepts `--batch <name>`, and passes it only to full verification. `pathsForBatch` validates unknown stage before report writing.

- [ ] **Step 6: Run verifier tests**

Run: `node --test tools/learning-site/tests/verify.test.mjs tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: PASS for Pilot A, Batch B, source drift, offline, links, false claim and token exposure tests.

- [ ] **Step 7: No-Git checkpoint**

Run: `git diff --check -- tools/learning-site/verify.mjs tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: exit 0. Do not stage or commit.

---

### Task 7: Run the Complete Tooling Regression in Temporary Output

**Files:**
- Modify: none

- [ ] **Step 1: Run all Node tests**

Run: `node --test tools/learning-site/tests/*.test.mjs`

Expected: all existing 48 tests plus all new Batch B tests PASS with 0 failures. Record the actual final test count; do not predeclare it in reports.

- [ ] **Step 2: Generate and verify Pilot A in a clean test-owned temporary directory**

Run: `node --test --test-name-pattern="verifies clean Pilot A output" tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: PASS; report object asserts 21 HTML and 15/109/0.

- [ ] **Step 3: Generate and verify Batch B in a clean test-owned temporary directory**

Run: `node --test --test-name-pattern="verifies cumulative Batch B output" tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: PASS; report object asserts 39 HTML and 28/96/0.

- [ ] **Step 4: Confirm protected source remains unchanged**

Run: `git diff --quiet -- DSM_Back DSM_Front`

Expected: exit 0 and no output.

Stop before writing `learning-site/` if any step fails.

---

### Task 8: Regenerate the 28 Cumulative Source Pages in Two-File Checkpoints

**Files:**
- Modify: the exact two generated files named in each step; no hand-authored file.

For each row, run one generator command with two `--only file:<source>` arguments, then one verifier command with the same two `--source` arguments. Expected for every row: generator writes exactly two paths; verifier returns `status:"PASS"` and `sources:2`.

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only file:<SOURCE_1> --only file:<SOURCE_2>
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source <SOURCE_1> --source <SOURCE_2>
```

- [ ] **Step 1:** `DSM_Back/src/app.module.ts` + `DSM_Back/prisma/schema.prisma`
- [ ] **Step 2:** `DSM_Back/src/tasks/tasks.controller.ts` + `DSM_Back/src/tasks/tasks.service.ts`
- [ ] **Step 3:** `DSM_Back/src/tasks/dto/create-task.dto.ts` + `DSM_Back/src/tasks/dto/update-task.dto.ts`
- [ ] **Step 4:** `DSM_Back/src/scores/scores.policy.ts` + `DSM_Back/src/scores/scores.service.ts`
- [ ] **Step 5:** `DSM_Back/src/notifications/notifications.service.ts` + `DSM_Back/src/notifications/notification-schedule.constants.ts`
- [ ] **Step 6:** `DSM_Back/src/prisma/prisma.service.ts` + `DSM_Back/src/tasks/tasks.service.spec.ts`
- [ ] **Step 7:** `DSM_Back/src/scores/scores.service.spec.ts` + `DSM_Back/src/notifications/notifications.service.spec.ts`
- [ ] **Step 8:** `DSM_Back/test/app.e2e-spec.ts` + `DSM_Back/src/main.ts`
- [ ] **Step 9:** `DSM_Back/src/app.bootstrap.ts` + `DSM_Back/src/auth/auth.module.ts`
- [ ] **Step 10:** `DSM_Back/src/auth/auth.controller.ts` + `DSM_Back/src/auth/auth.service.ts`
- [ ] **Step 11:** `DSM_Back/src/auth/guards/jwt-auth.guard.ts` + `DSM_Back/src/auth/dto/social-login.dto.ts`
- [ ] **Step 12:** `DSM_Back/src/auth/dto/refresh-token.dto.ts` + `DSM_Back/src/auth/dto/token-response.dto.ts`
- [ ] **Step 13:** `DSM_Back/src/auth/types/jwt-payload.type.ts` + `DSM_Back/src/auth/types/social-profile.type.ts`
- [ ] **Step 14:** `DSM_Back/src/auth/auth.controller.spec.ts` + `DSM_Back/src/auth/auth.service.spec.ts`

- [ ] **Step 15: Check source output count**

Run: `(Get-ChildItem -Recurse -File C:\DEV\learning-site\files -Filter '*.html').Count`

Expected: `28`.

---

### Task 9: Generate the Five Auth Overview Pages in Two-File Checkpoints

**Files:**
- Modify: the exact generated page(s) named in each step.

- [ ] **Step 1: Generate social login and refresh rotation**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only page:auth-social-login --only page:auth-refresh-rotation
```

Expected writes: `features/social-login.html`, `features/refresh-rotation.html`.

- [ ] **Step 2: Generate JWT concept and Auth diagram**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only page:auth-jwt-session --only page:auth-session-flow
```

Expected writes: `concepts/jwt-session.html`, `diagrams/auth-session-flow.html`.

- [ ] **Step 3: Generate Auth exercise**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only page:auth-session-exercise
```

Expected write: `exercises/auth-session.html` only.

- [ ] **Step 4: Confirm all five pages exist and contain no remote dependency**

Run: `node --test tools/learning-site/tests/batch-b-verify.test.mjs`

Expected: PASS.

---

### Task 10: Update Shared Entry Pages and Search Data

**Files:**
- Modify: at most two generated files per step.

- [ ] **Step 1: Generate home and architecture**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only page:index --only page:architecture
```

Expected writes: `index.html`, `architecture.html`.

- [ ] **Step 2: Generate cumulative search/progress data**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --only asset:site-data.js
```

Expected write: `assets/site-data.js`; 124 records, processed 28, remaining 96, missing 0, source text absent.

- [ ] **Step 3: Re-run runtime and page tests**

Run: `node --test tools/learning-site/tests/runtime.test.mjs tools/learning-site/tests/pages.test.mjs tools/learning-site/tests/batch-b-pages.test.mjs`

Expected: PASS. `assets/site.css` and `assets/site.js` remain unchanged.

---

### Task 11: Produce the Batch B Verification Report

**Files:**
- Modify: `learning-site/verification-report.json`

- [ ] **Step 1: Run full Batch B verification and atomically write the report**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --batch batch-b --full --report C:\DEV\learning-site\verification-report.json
```

Expected stdout: `{"status":"PASS","sources":28}`.

- [ ] **Step 2: Read back machine counts**

```powershell
$report = Get-Content -Raw -Encoding UTF8 C:\DEV\learning-site\verification-report.json | ConvertFrom-Json
$report.status
$report.pages
$report.progress | ConvertTo-Json -Compress
$report.linkCount
$report.sources.Count
```

Expected: `PASS`, `39`, progress `28/96/0` with excluded `9`, positive link count, sources `28`.

- [ ] **Step 3: Re-run the full test suite after actual output generation**

Run: `node --test tools/learning-site/tests/*.test.mjs`

Expected: all tests PASS; record actual test count and 0 failures.

---

### Task 12: Run Desktop and Mobile Browser QA

**Files:**
- Modify: `learning-site/qa-report.md`

**Precondition:** full verifier PASS. Use the available in-app Browser control first. The temporary server may expose only `C:\DEV\learning-site` on `127.0.0.1`.

- [ ] **Step 1: Start the already approved scoped static server**

Use the previously approved command pattern for `C:\DEV\learning-site` only and record process id and port. Do not expose `C:\DEV` root.

- [ ] **Step 2: Desktop QA at 1440×900**

Verify home Batch B route, `auth`/`refresh`/`JwtAuthGuard` search and filters, `auth.service.ts` 62/38 file view, 12세/주니어 tabs, read/theme persistence, social/refresh overview, Auth diagram zoom/reset/keyboard/pointer, closed exercise answers, no overflow and no sensitive value outside preserved source.

- [ ] **Step 3: Mobile QA at 390×844**

Verify home spacing, long Korean headings, code/explanation switch, explanation and contents sheets, sticky previous/read/next, >=44px targets, Auth pages and diagram without horizontal page clipping.

- [ ] **Step 4: Handle any QA defect safely**

If a defect appears, stop this task. Record the selector, viewport, reproduction and screenshot; invoke systematic debugging in a new approved step. Do not edit CSS/JS/pages under this plan without an exact failing test and a revised 1–2-file allowlist.

- [ ] **Step 5: Stop the server and verify the port is closed**

Expected: server process ended and connection to the recorded port fails.

- [ ] **Step 6: Replace `qa-report.md` with Batch B evidence**

Record actual test count, 28-source fidelity, actual link count, 39 HTML, 28/96/0, desktop/mobile scenarios, server URL, shutdown/port state, application source diff and these known limits: one Chromium engine, JS-disabled path static-only, storage denial unit-only, live provider/DB integration untested.

- [ ] **Step 7: Validate the report**

Run: `git diff --check -- learning-site/qa-report.md`

Expected: exit 0.

---

### Task 13: Verify Scope, Security Boundaries and Final Batch Evidence

**Files:**
- Modify: none

- [ ] **Step 1: Confirm product source diff is empty**

Run: `git diff --quiet -- DSM_Back DSM_Front`

Expected: exit 0.

- [ ] **Step 2: Confirm no environment file page or search record exists**

```powershell
if (Get-ChildItem -Recurse -File C:\DEV\learning-site | Where-Object { $_.FullName -match '\\.env(?:\\|\.|$)' }) { throw 'SENSITIVE_OUTPUT_PRESENT' }
if (Select-String -Path C:\DEV\learning-site\assets\site-data.js -Pattern 'DSM_Back/.env' -SimpleMatch) { throw 'SENSITIVE_SEARCH_RECORD_PRESENT' }
```

Expected: no output and exit 0.

- [ ] **Step 3: Confirm hand-authored and output whitespace**

Run: `git diff --check -- tools/learning-site learning-site docs/superpowers/specs/2026-08-09-offline-learning-site-batch-b-design.md docs/superpowers/plans/2026-08-09-offline-learning-site-batch-b.md`

Expected: exit 0; line-ending warnings are not whitespace errors.

- [ ] **Step 4: Capture final actual counts**

Read `verification-report.json` and `qa-report.md`. Final response must report actual tests, sources, HTML, links, progress, excluded count, QA viewports, server shutdown, source diff, `.env` non-read, live integration limits, and no-Git status.

---

### Task 14: Close Memory and Wait for Batch B Approval

**Files:**
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify in a separate step: `.ai/memory/checklist.md`

- [ ] **Step 1: Update plan and context together**

Record exact final counts, generated paths, full test/verifier/Browser QA output, source diff empty, server port closed, `.env` non-read, known limits and no-Git status. Mark implementation complete but user Batch B approval pending.

- [ ] **Step 2: Update checklist separately**

Mark detailed plan execution, 13 source pages, five overview pages, Pilot A regression, full verifier, desktop/mobile QA and server cleanup complete. Leave `Batch B 사용자 승인` in progress and all later batches pending.

- [ ] **Step 3: Validate memory and all scoped files**

Run: `git diff --check -- .ai/memory/plan.md .ai/memory/context.md .ai/memory/checklist.md tools/learning-site learning-site`

Expected: exit 0.

- [ ] **Step 4: Stop at the user gate**

Present the Batch B report with `[CCTV 기록]` and `[셀프 체크 리마인더]`. Do not start another batch until the user explicitly approves Batch B.

---

## Execution Gate

This plan is documentation only. The approved execution mode is current-root inline/no-Git. After the user reviews and approves this plan, invoke `superpowers:executing-plans`, execute task-by-task with the listed 1–2-file checkpoints, and stop on any scope expansion, source diff, verifier failure, QA defect requiring an unlisted file, or approval requirement.
