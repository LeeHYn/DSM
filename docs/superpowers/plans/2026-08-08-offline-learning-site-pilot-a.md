# DSM Offline Learning Site Pilot A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully offline, source-verifiable DSM learning site foundation and the approved 15-file Pilot A experience for “Task 변경 → 점수 재계산 + 알림 예약 상태 동기화.”

**Architecture:** Node.js built-ins scan only the approved `DSM_Back` and `DSM_Front` application corpus, derive immutable source metadata, render static multi-page HTML, and verify rendered code against the original bytes and logical lines. Generated pages use local CSS, classic JavaScript data/runtime files, and inline SVG so the site works from `file://` without a server or network request. Pilot A is the first independently testable delivery; the remaining 109 source files stay visible as `remaining` in site data and are generated only through later approved 10–20-file batch plans.

**Tech Stack:** Node.js >=22 built-ins (`node:test`, `node:assert`, `node:fs`, `node:path`, `node:crypto`, `node:vm`), ECMAScript modules for tooling, static HTML5/CSS/JavaScript, inline SVG, browser `localStorage`; no new package and no root `package.json`.

## Global Constraints

- Source baseline is `C:\DEV`, branch `codex/m12b-front-prototype-checkpoint`, commit `960f02b`.
- The application corpus baseline is exactly 124 files and 13,168 logical lines: `DSM_Back` 88/8,787 and `DSM_Front` 36/4,381.
- Pilot A is exactly the 15 paths in `PILOT_A_PATHS`; this plan does not generate the remaining 109 file pages.
- Never read or publish `DSM_Back/.env`; exclude `.git`, `.worktrees`, `node_modules`, `dist`, `.expo`, lockfiles, media, binaries, agent memory, audits, plans, and project documents from source pages.
- Do not modify `DSM_Back/**`, `DSM_Front/**`, `.ai/docs/2026-07-15-current-project-architecture.md`, or unrelated dirty/untracked files.
- Source code may only be HTML-escaped and split into syntax-token spans whose concatenated text is byte-equivalent after UTF-8 decode; no comments, omissions, reformatting, or invented code may enter the source region.
- `TasksService` does not call `NotificationsService`; no Task flow diagram or prose may show that edge or actual FCM send.
- Confirmed relations use solid line + `#B9F34A` + text label; inferred/confirmation-needed relations use dashed line + `#F2A93B` + text label; unknown relations use gray dotted line + `확인 필요`.
- Use `#FFFFFF`, `#101827`, `#0B1020`, `#B9F34A`, `#F2A93B`, system Korean sans, and system monospace; no remote font, CDN, module script, HTTP fetch, or server dependency.
- Desktop file pages use a 62% code / 38% explanation layout; mobile uses code/explanation switching, a contents sheet, sticky previous/read/next controls, and >=44x44 CSS-pixel targets.
- JavaScript-disabled pages must still expose source code and navigation; localStorage failure falls back to in-memory state with one non-blocking notice.
- Every implementation step edits or creates at most two files. Generated output is also emitted in one- or two-file checkpoints.
- Git stage, commit, push, branch, PR, dependency installation, network access, and service startup remain forbidden unless the user explicitly authorizes them. The commit commands below are approval-gated checkpoints, not standing authorization.
- Execute from `C:\DEV` with the installed Node `v24.13.0`, while keeping code compatible with Node >=22.

---

## File Structure

### Hand-authored tooling

| Path | Responsibility |
|---|---|
| `tools/learning-site/manifest.mjs` | Corpus rules, exact Pilot A paths, public exclusions, deterministic application-path collection |
| `tools/learning-site/lib/paths.mjs` | Repository path normalization, containment, output mapping, relative hrefs |
| `tools/learning-site/lib/source.mjs` | Strict UTF-8 decode, SHA-256, byte/line/line-ending metadata, source reads |
| `tools/learning-site/lib/symbols.mjs` | Lightweight class/function/model/test symbol extraction with line numbers |
| `tools/learning-site/lib/syntax.mjs` | Lossless local syntax-token segmentation |
| `tools/learning-site/content/pilot-a.mjs` | Fixed copy, evidence relations, per-file learning guides, exercises |
| `tools/learning-site/lib/render.mjs` | Escaping, document shell, source panel, evidence legend, common components |
| `tools/learning-site/lib/pages.mjs` | Home, architecture, concept, feature, exercise, diagram, and file-page composition |
| `tools/learning-site/assets/site.css` | Approved visual system and responsive/accessibility rules |
| `tools/learning-site/assets/site.js` | Search/filter, theme/read state, disclosure, mobile modes/sheets, diagram controls |
| `tools/learning-site/generate.mjs` | CLI orchestration and one-or-two-output-file generation |
| `tools/learning-site/verify.mjs` | Source reconstruction, SHA/line/link/offline/search/progress verification and report |

### Hand-authored tests

`tools/learning-site/tests/` contains one `*.test.mjs` file for each module above. Tests create fixtures only under the OS temporary directory and remove them in `afterEach`; they never write into `DSM_Back` or `DSM_Front`.

### Generated output; never hand-edit

```text
learning-site/
├─ index.html
├─ architecture.html
├─ concepts/serializable-transaction.html
├─ features/task-score-schedule.html
├─ exercises/task-flow.html
├─ diagrams/task-update-flow.html
├─ files/DSM_Back/.../<source-name>.html   # exact source path + .html
├─ assets/site.css
├─ assets/site.js
├─ assets/site-data.js
├─ verification-report.json
└─ qa-report.md
```

`fileOutputPath('DSM_Back/src/tasks/tasks.service.ts')` is exactly `files/DSM_Back/src/tasks/tasks.service.ts.html`. The generator owns every file under `learning-site/`; fixes are made in tooling/content/assets and regenerated.

---

### Task 1: Lock Corpus and Pilot Manifest

**Files:**
- Create: `tools/learning-site/tests/manifest.test.mjs`
- Create: `tools/learning-site/manifest.mjs`

**Interfaces:**
- Produces: `SOURCE_ROOTS`, `PILOT_A_PATHS`, `PUBLIC_EXCLUSIONS`, `isApplicationSource(relativePath)`, `collectApplicationPaths(rootDir)`.
- `collectApplicationPaths(rootDir): Promise<string[]>` returns sorted POSIX-style repo-relative paths and never traverses symlinks or excluded directories.

- [ ] **Step 1: Write the failing manifest test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PILOT_A_PATHS,
  collectApplicationPaths,
  isApplicationSource,
} from '../manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('locks the approved 124-file corpus and 15-file pilot', async () => {
  const paths = await collectApplicationPaths(ROOT);
  assert.equal(paths.length, 124);
  assert.equal(paths.filter((value) => value.startsWith('DSM_Back/')).length, 88);
  assert.equal(paths.filter((value) => value.startsWith('DSM_Front/')).length, 36);
  assert.equal(PILOT_A_PATHS.length, 15);
  assert.ok(PILOT_A_PATHS.every((value) => paths.includes(value)));
});

test('excludes sensitive, generated, binary, and nested workspace paths', () => {
  assert.equal(isApplicationSource('DSM_Back/.env'), false);
  assert.equal(isApplicationSource('DSM_Back/package-lock.json'), false);
  assert.equal(isApplicationSource('DSM_Back/node_modules/x/index.js'), false);
  assert.equal(isApplicationSource('DSM_Front/assets/icon.png'), false);
  assert.equal(isApplicationSource('.worktrees/branch/DSM_Back/src/main.ts'), false);
  assert.equal(isApplicationSource('DSM_Back/.env.example'), true);
  assert.equal(isApplicationSource('DSM_Back/prisma/migrations/migration_lock.toml'), true);
});
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run: `node --test tools/learning-site/tests/manifest.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `manifest.mjs`.

- [ ] **Step 3: Implement the manifest**

Use this exact eligibility contract:

```js
export const SOURCE_ROOTS = Object.freeze(['DSM_Back', 'DSM_Front']);
const TEXT_EXTENSIONS = new Set([
  '.css', '.js', '.json', '.mjs', '.prisma', '.sql',
  '.toml', '.ts', '.tsx', '.yaml', '.yml',
]);
const TEXT_BASENAMES = new Set(['.env.example', '.prettierrc']);
const EXCLUDED_SEGMENTS = new Set([
  '.git', '.worktrees', 'node_modules', 'dist', '.expo', 'assets',
]);
const EXCLUDED_BASENAMES = new Set(['.env', 'package-lock.json']);

export const PILOT_A_PATHS = Object.freeze([
  'DSM_Back/src/app.module.ts',
  'DSM_Back/prisma/schema.prisma',
  'DSM_Back/src/tasks/tasks.controller.ts',
  'DSM_Back/src/tasks/tasks.service.ts',
  'DSM_Back/src/tasks/dto/create-task.dto.ts',
  'DSM_Back/src/tasks/dto/update-task.dto.ts',
  'DSM_Back/src/scores/scores.policy.ts',
  'DSM_Back/src/scores/scores.service.ts',
  'DSM_Back/src/notifications/notifications.service.ts',
  'DSM_Back/src/notifications/notification-schedule.constants.ts',
  'DSM_Back/src/prisma/prisma.service.ts',
  'DSM_Back/src/tasks/tasks.service.spec.ts',
  'DSM_Back/src/scores/scores.service.spec.ts',
  'DSM_Back/src/notifications/notifications.service.spec.ts',
  'DSM_Back/test/app.e2e-spec.ts',
]);
```

`PUBLIC_EXCLUSIONS` must name `DSM_Back/.env` only as `민감 설정: 내용 미조회`, both lockfiles as generated files, and the excluded directories without inspecting their contents. Implement recursive `readdir({ withFileTypes: true })`, skip symbolic links, normalize separators to `/`, sort before return, and throw `CORPUS_ROOT_MISSING:<root>` when a source root is absent.

- [ ] **Step 4: Run the manifest test**

Run: `node --test tools/learning-site/tests/manifest.test.mjs`

Expected: PASS; 124 total, 88 backend, 36 frontend, 15 Pilot A.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/manifest.mjs tools/learning-site/tests/manifest.test.mjs
git commit -m "feat(learning-site): lock source manifest"
```

### Task 2: Add Safe Path Mapping

**Files:**
- Create: `tools/learning-site/tests/paths.test.mjs`
- Create: `tools/learning-site/lib/paths.mjs`

**Interfaces:**
- Produces: `normalizeRepoPath(input)`, `resolveInsideRoot(rootDir, relativePath)`, `fileOutputPath(relativePath)`, `relativeHref(fromOutputPath, toOutputPath)`.
- Consumed by source reader, renderer, generator, and verifier.

- [ ] **Step 1: Write path-safety tests**

```js
test('maps source paths without collisions', () => {
  assert.equal(
    fileOutputPath('DSM_Back/src/tasks/tasks.service.ts'),
    'files/DSM_Back/src/tasks/tasks.service.ts.html',
  );
  assert.equal(
    relativeHref(
      'files/DSM_Back/src/tasks/tasks.service.ts.html',
      'index.html',
    ),
    '../../../../index.html',
  );
});

test('rejects absolute and traversal paths', () => {
  for (const value of ['../secret', 'DSM_Back/../../secret', 'C:\\secret', '/secret', 'a\0b']) {
    assert.throws(() => normalizeRepoPath(value), /UNSAFE_REPO_PATH/);
  }
});
```

- [ ] **Step 2: Run and observe `ERR_MODULE_NOT_FOUND`**

Run: `node --test tools/learning-site/tests/paths.test.mjs`

- [ ] **Step 3: Implement canonical POSIX paths and containment**

```js
export function normalizeRepoPath(input) {
  const value = String(input).replaceAll('\\', '/');
  if (!value || value.includes('\0') || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`UNSAFE_REPO_PATH:${input}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`UNSAFE_REPO_PATH:${input}`);
  }
  return normalized;
}

export function fileOutputPath(relativePath) {
  return `files/${normalizeRepoPath(relativePath)}.html`;
}
```

`resolveInsideRoot` must compare `path.relative(root, resolved)` and throw `PATH_OUTSIDE_ROOT` when it begins with `..` or is absolute. `relativeHref` uses `path.posix.relative` and `encodeURI`, returning `./<name>` when the result has no slash prefix.

- [ ] **Step 4: Run the path tests**

Run: `node --test tools/learning-site/tests/paths.test.mjs`

Expected: PASS.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/paths.mjs tools/learning-site/tests/paths.test.mjs
git commit -m "feat(learning-site): add safe path mapping"
```

### Task 3: Read and Fingerprint Source Losslessly

**Files:**
- Create: `tools/learning-site/tests/source.test.mjs`
- Create: `tools/learning-site/lib/source.mjs`

**Interfaces:**
- Consumes: `resolveInsideRoot`.
- Produces: `decodeUtf8(buffer, relativePath)`, `logicalLineCount(text)`, `detectLineEnding(text)`, `languageForPath(path)`, `assessExposureRisk(record)`, `readSourceRecord(rootDir, relativePath)`.
- `readSourceRecord` returns `{ path, language, bytes, sha256, lineCount, lineEnding, text }`.

- [ ] **Step 1: Write strict decoding and baseline tests**

```js
test('preserves bytes, lines, and CRLF metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'learning-source-'));
  await mkdir(path.join(dir, 'DSM_Back'), { recursive: true });
  await writeFile(path.join(dir, 'DSM_Back/example.ts'), 'const a = 1;\r\nconst b = 2;\r\n');
  const record = await readSourceRecord(dir, 'DSM_Back/example.ts');
  assert.equal(record.text, 'const a = 1;\r\nconst b = 2;\r\n');
  assert.equal(record.lineCount, 2);
  assert.equal(record.lineEnding, 'CRLF');
  assert.equal(record.bytes, 28);
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
});

test('matches the approved line baseline', async () => {
  const paths = await collectApplicationPaths(ROOT);
  const records = await Promise.all(paths.map((value) => readSourceRecord(ROOT, value)));
  assert.equal(records.reduce((sum, value) => sum + value.lineCount, 0), 13168);
});

test('rejects malformed UTF-8', () => {
  assert.throws(() => decodeUtf8(Buffer.from([0xc3, 0x28]), 'bad.ts'), /INVALID_UTF8:bad.ts/);
});

test('marks credential-shaped literals for review without echoing values', () => {
  const result = assessExposureRisk({
    path: 'DSM_Back/example.ts',
    text: "const clientSecret = 'fixture-value';\n",
  });
  assert.equal(result.status, 'review-required');
  assert.deepEqual(result.reasons, ['credential-assignment']);
  assert.doesNotMatch(JSON.stringify(result), /fixture-value/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/source.test.mjs`

Expected: FAIL because `source.mjs` does not exist.

- [ ] **Step 3: Implement source metadata**

```js
const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });

export function decodeUtf8(buffer, relativePath) {
  try {
    return FATAL_UTF8.decode(buffer);
  } catch {
    throw new Error(`INVALID_UTF8:${relativePath}`);
  }
}

export function logicalLineCount(text) {
  if (text.length === 0) return 0;
  const lines = text.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(text) ? lines - 1 : lines;
}
```

`detectLineEnding` returns `CRLF`, `LF`, `CR`, `mixed`, or `none`. `readSourceRecord` reads a `Buffer`, decodes once, uses lowercase hex SHA-256, and never follows a path outside the root. Map `.ts/.tsx/.js/.mjs/.prisma/.sql/.css/.json/.yaml/.yml/.toml` and the two approved dotfiles to stable language labels.

`assessExposureRisk` returns `{ status: 'safe' | 'review-required', reasons: string[] }` and never returns matched text. Flag private-key blocks, known provider-token shapes, and credential-named literal assignments as `review-required`; de-duplicate stable reason codes. The path-level `.env` exclusion happens before `readSourceRecord`, so this function must never be used to justify reading `.env`.

- [ ] **Step 4: Run the source tests**

Run: `node --test tools/learning-site/tests/source.test.mjs`

Expected: PASS with total 13,168 logical lines.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/source.mjs tools/learning-site/tests/source.test.mjs
git commit -m "feat(learning-site): fingerprint source files"
```

### Task 4: Extract Searchable Symbols

**Files:**
- Create: `tools/learning-site/tests/symbols.test.mjs`
- Create: `tools/learning-site/lib/symbols.mjs`

**Interfaces:**
- Produces: `extractSymbols(record): Array<{ kind, name, line }>`.
- Kinds are `class`, `interface`, `type`, `enum`, `function`, `method`, `model`, `test`.

- [ ] **Step 1: Write representative symbol tests**

```js
test('extracts TypeScript and test symbols with one-based lines', () => {
  const symbols = extractSymbols({
    language: 'TypeScript',
    text: "export class TasksService {\n  async update() {}\n}\ndescribe('TasksService', () => {});\n",
  });
  assert.deepEqual(symbols, [
    { kind: 'class', name: 'TasksService', line: 1 },
    { kind: 'method', name: 'update', line: 2 },
    { kind: 'test', name: 'TasksService', line: 4 },
  ]);
});

test('extracts Prisma models and enums', () => {
  assert.deepEqual(
    extractSymbols({ language: 'Prisma', text: 'model Task {\n  id String @id\n}\nenum TaskStatus {\n  PENDING\n}\n' }),
    [
      { kind: 'model', name: 'Task', line: 1 },
      { kind: 'enum', name: 'TaskStatus', line: 4 },
    ],
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/symbols.test.mjs`

- [ ] **Step 3: Implement deterministic line-based extraction**

Use anchored patterns so prose inside strings is not treated as a declaration:

```js
const RULES = [
  ['class', /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/],
  ['interface', /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/],
  ['type', /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/],
  ['enum', /^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/],
  ['function', /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/],
  ['method', /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\s*\{/],
];
```

Add Prisma `model`/`enum` rules and `describe`/`it`/`test` names. De-duplicate by `kind:name:line`, preserve source order, and return an empty array for unsupported languages.

- [ ] **Step 4: Run the symbol tests**

Run: `node --test tools/learning-site/tests/symbols.test.mjs`

Expected: PASS.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/symbols.mjs tools/learning-site/tests/symbols.test.mjs
git commit -m "feat(learning-site): extract searchable symbols"
```

### Task 5: Add Lossless Syntax Segmentation

**Files:**
- Create: `tools/learning-site/tests/syntax.test.mjs`
- Create: `tools/learning-site/lib/syntax.mjs`

**Interfaces:**
- Produces: `tokenizeSource(text, language): Array<{ type, text }>` and `joinTokenText(tokens)`.
- Token types are `plain`, `comment`, `string`, `keyword`, `number`, `decorator`.

- [ ] **Step 1: Write conservation tests**

```js
for (const sample of [
  { language: 'TypeScript', text: "@Patch(':id')\nasync update(id: string) { return 42; }\n" },
  { language: 'Prisma', text: 'model Task {\n  id String @id\n}\n' },
  { language: 'SQL', text: 'CREATE TABLE "Task" ("id" TEXT);\n' },
  { language: 'TSX', text: 'export const View = () => <Text>{"<ok>"}</Text>;\n' },
]) {
  test(`preserves every character for ${sample.language}`, () => {
    const tokens = tokenizeSource(sample.text, sample.language);
    assert.equal(joinTokenText(tokens), sample.text);
    assert.ok(tokens.every((token) => token.text.length > 0));
  });
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/syntax.test.mjs`

- [ ] **Step 3: Implement a left-to-right lossless tokenizer**

Use one combined sticky regular expression per language family. At each index, emit a matched classified token; if no pattern matches, emit exactly one `plain` code point. Merge adjacent tokens of the same type. Never normalize whitespace or line endings.

```js
export function joinTokenText(tokens) {
  return tokens.map(({ text }) => text).join('');
}

export function tokenizeSource(text, language) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const match = matchTokenAt(text, index, language);
    const token = match ?? { type: 'plain', text: text[index] };
    pushMerged(tokens, token);
    index += token.text.length;
  }
  return tokens;
}
```

Cover comments, quoted/template strings, numeric literals, decorators, and a fixed keyword set for TypeScript/TSX/JavaScript/Prisma/SQL. Unsupported languages return one `plain` token containing the full text.

- [ ] **Step 4: Run the syntax tests**

Run: `node --test tools/learning-site/tests/syntax.test.mjs`

Expected: PASS for every sample.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/syntax.mjs tools/learning-site/tests/syntax.test.mjs
git commit -m "feat(learning-site): preserve syntax token text"
```

### Task 6: Encode the Approved Pilot Learning Content

**Files:**
- Create: `tools/learning-site/tests/content.test.mjs`
- Create: `tools/learning-site/content/pilot-a.mjs`

**Interfaces:**
- Consumes: `PILOT_A_PATHS`.
- Produces: `SITE_COPY`, `PILOT_A_FLOW`, `FILE_GUIDES`, `PILOT_EXERCISES`.
- Each guide is `{ classification, role, focus, childExplanation, juniorExplanation, evidence, risks, related, exercises }`.

- [ ] **Step 1: Write content-contract tests**

```js
test('covers every pilot file exactly once', () => {
  assert.deepEqual(Object.keys(FILE_GUIDES).sort(), [...PILOT_A_PATHS].sort());
  for (const [sourcePath, guide] of Object.entries(FILE_GUIDES)) {
    assert.match(guide.role, /\S/);
    assert.ok(guide.focus.length >= 3 && guide.focus.length <= 6, sourcePath);
    assert.match(guide.childExplanation, /\S/);
    assert.match(guide.juniorExplanation, /\S/);
    assert.ok(guide.evidence.every((item) => PILOT_A_PATHS.includes(item.path)));
  }
});

test('keeps NotificationsService and FCM outside the task call graph', () => {
  assert.equal(PILOT_A_FLOW.edges.some((edge) =>
    edge.from === 'TasksService' && edge.to === 'NotificationsService'
  ), false);
  assert.equal(PILOT_A_FLOW.nodes.some((node) => node.id === 'fcm-send'), false);
  assert.equal(PILOT_A_FLOW.transaction.isolation, 'Serializable');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/content.test.mjs`

- [ ] **Step 3: Implement fixed copy and evidence data**

Use these exact global values:

```js
export const SITE_COPY = Object.freeze({
  brand: 'DSM 학습 지도',
  nav: ['프로젝트 지도', '아키텍처', '개념', '기능 흐름', '파일', '연습'],
  searchHint: '파일·클래스·함수 검색',
  scope: '124개 파일 · 13,168줄 · 오프라인',
  cta: 'Task 흐름 학습 시작',
  sourceLabel: '원본 코드 · 변경 없음',
  explanationLabel: 'AI 설명 · 원본 밖',
});
```

`PILOT_A_FLOW` must encode:

```text
PATCH /tasks/:id → TasksController.update() → TasksService.update()
→ Prisma.$transaction [Serializable]
→ Task update
→ scheduleRelevantChange일 때 NotificationSchedule cancel/create
→ nonterminal delivery가 있을 때 NotificationDelivery cancel
→ ScoresService.recompute(transaction client)
→ DailyScore upsert → User totalScore/tier update → Prisma → PostgreSQL
```

Use `confirmed`, `conditional`, `inferred`, `unknown` relation states. `NotificationsService` appears only in a separate comparison note: FCM token register/revoke boundary, no direct Task mutation edge.

Populate the 15 guides with the following concrete roles and study focus:

| Source | Role | Required focus |
|---|---|---|
| `src/app.module.ts` | Nest composition root | module imports, Prisma/Scores/Tasks wiring, Notifications boundary |
| `prisma/schema.prisma` | persistence contract | Task, DailyScore, NotificationSchedule, NotificationDelivery, User relations |
| `tasks.controller.ts` | authenticated HTTP adapter | route decorators, DTO boundary, `req.user.sub`, service forwarding |
| `tasks.service.ts` | atomic Task mutation orchestration | ownership lookup, Serializable retry, schedule condition, delivery cancellation, score recompute |
| `create-task.dto.ts` | create validation contract | required fields, date/enum validation, notification input |
| `update-task.dto.ts` | partial update contract | optional fields, status/date/category changes, schedule relevance |
| `scores.policy.ts` | pure score rule | difficulty base, timing multiplier, daily cap, tier thresholds |
| `scores.service.ts` | score persistence | UTC day range, completed-task aggregation, DailyScore upsert, User total/tier update |
| `notifications.service.ts` | token lifecycle boundary | register/revoke, ownership conflict, explicit non-edge from TasksService |
| `notification-schedule.constants.ts` | shared schedule vocabulary | nonterminal states, status constants, cancellation predicates |
| `prisma.service.ts` | database client lifecycle | PrismaClient inheritance, connect, disconnect |
| `tasks.service.spec.ts` | Task behavior evidence | transaction retry, ownership, schedule/delivery conditions, recompute calls |
| `scores.service.spec.ts` | score behavior evidence | UTC boundaries, policy result persistence, user aggregate update |
| `notifications.service.spec.ts` | token-boundary evidence | same-user update, foreign-owner conflict, revoke behavior |
| `app.e2e-spec.ts` | application HTTP smoke evidence | bootstrapping, request envelope, what the e2e suite does not prove |

Every guide must contain one child-level analogy, one junior-level input/output/dependency/failure explanation, explicit evidence path/symbol references, at least one risk or `확인 필요`, related-file order, and one collapsed-answer exercise. Never invent a source line number in this file; the generator resolves symbol lines from `extractSymbols`.

- [ ] **Step 4: Run the content tests**

Run: `node --test tools/learning-site/tests/content.test.mjs`

Expected: PASS with 15 exact guide keys and no prohibited Task→NotificationsService edge.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/content/pilot-a.mjs tools/learning-site/tests/content.test.mjs
git commit -m "feat(learning-site): add pilot learning content"
```

### Task 7: Render Safe HTML Primitives

**Files:**
- Create: `tools/learning-site/tests/render.test.mjs`
- Create: `tools/learning-site/lib/render.mjs`

**Interfaces:**
- Consumes: `tokenizeSource`, `relativeHref`, `SITE_COPY`.
- Produces: `escapeHtml`, `decodeRenderedCode`, `renderDocument`, `renderSourcePanel`, `renderEvidenceLegend`, `renderBreadcrumbs`.

- [ ] **Step 1: Write escaping and reconstruction tests**

```js
test('renders hostile-looking source without executable markup', () => {
  const source = '</code><script>alert("x")</script> & <Task>\r\n';
  const html = renderSourcePanel({
    path: 'DSM_Back/example.ts', language: 'TypeScript', text: source,
    bytes: Buffer.byteLength(source), sha256: 'a'.repeat(64),
    lineCount: 1, lineEnding: 'CRLF', symbols: [],
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;\/code&gt;/);
  assert.equal(decodeRenderedCode(html), source);
});

test('document shell uses only relative local assets', () => {
  const html = renderDocument({ outputPath: 'index.html', title: '지도', currentNav: '프로젝트 지도', body: '<main>ok</main>' });
  assert.match(html, /\.\/assets\/site\.css/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /<noscript>/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/render.test.mjs`

- [ ] **Step 3: Implement semantic rendering primitives**

`escapeHtml` must replace `&`, `<`, `>`, `"`, and `'` in that order. `renderSourcePanel` emits a separate `aria-hidden` line-number gutter and one `<code data-source-code>` region containing only escaped token spans; no line wrapper may inject characters into reconstructed code.

```js
export function renderSourcePanel(record) {
  const tokenHtml = tokenizeSource(record.text, record.language)
    .map(({ type, text }) => `<span class="tok tok--${type}">${escapeHtml(text)}</span>`)
    .join('');
  const numbers = Array.from({ length: record.lineCount }, (_, index) => index + 1).join('\n');
  return `<section class="source-panel" aria-labelledby="source-title">
    <div class="source-panel__head"><h2 id="source-title">${SITE_COPY.sourceLabel}</h2></div>
    <div class="source-grid"><span class="line-numbers" aria-hidden="true">${numbers}</span>
    <pre><code data-source-code data-path="${escapeHtml(record.path)}" data-sha256="${record.sha256}" data-bytes="${record.bytes}" data-lines="${record.lineCount}" data-line-ending="${record.lineEnding}">${tokenHtml}</code></pre></div>
  </section>`;
}
```

`renderDocument` includes skip link, header/nav/search shell, `<main>`, footer, `site-data.js` before `site.js`, a visible `<noscript>` message, and depth-correct local asset links.

- [ ] **Step 4: Run the render tests**

Run: `node --test tools/learning-site/tests/render.test.mjs`

Expected: PASS; hostile text stays inert and reconstructs exactly.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/render.mjs tools/learning-site/tests/render.test.mjs
git commit -m "feat(learning-site): render source safely"
```

### Task 8: Compose Every Page Type

**Files:**
- Create: `tools/learning-site/tests/pages.test.mjs`
- Create: `tools/learning-site/lib/pages.mjs`

**Interfaces:**
- Consumes: render primitives, source records, symbols, `SITE_COPY`, `PILOT_A_FLOW`, `FILE_GUIDES`, `PILOT_EXERCISES`.
- Produces: `renderIndexPage`, `renderArchitecturePage`, `renderConceptPage`, `renderFeaturePage`, `renderExercisePage`, `renderDiagramPage`, `renderFilePage`.
- Every renderer except the file renderer consumes one `SiteModel`; `renderFilePage(siteModel, sourcePath)` adds the exact source selection.
- `SiteModel` is `{ copy, flow, exercises, records, guides, progress }`, where `records` is an array of source records extended with `{ symbols, status, outputPath }` and `progress` is `{ processed, remaining, missing, excluded }`.

- [ ] **Step 1: Write required-copy and fact tests**

```js
const TEST_PATH = 'DSM_Back/src/tasks/tasks.service.ts';
const TEST_MODEL = {
  copy: SITE_COPY,
  flow: PILOT_A_FLOW,
  exercises: PILOT_EXERCISES,
  records: [{
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
  }],
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

test('file page exposes A through G learning regions', () => {
  const html = renderFilePage(TEST_MODEL, TEST_PATH);
  for (const label of ['위치와 역할', '먼저 볼 것', '원본 코드 · 변경 없음', 'AI 설명 · 원본 밖', '관계와 근거', '위험·확인', '연습과 다음 단계']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /TypeScript · 277줄 · 핵심 파일/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/pages.test.mjs`

- [ ] **Step 3: Implement page composition**

Page-specific requirements:

- `index`: hero, `124개 파일 · 13,168줄 · 오프라인`, CTA, project map, Expo local mock → REST API dashed amber `미연결 · 확인 필요`, Pilot A two-branch path, progress summary.
- `architecture`: full evidence legend and inline SVG for controller → service → Serializable transaction → Task/schedule/delivery/score → Prisma/PostgreSQL.
- `concept`: transaction atomicity, same transaction client, conditional side effects, P2034 retry note grounded in `tasks.service.ts`.
- `feature`: create/update/remove/complete branches and exact source/test links.
- `exercise`: all approved question types using native `<details>` with collapsed answers.
- `diagram`: the same evidence graph in a keyboard-operable zoom container with reset control.
- `file`: breadcrumb; computed metadata; five tabs; A–G regions; 62/38 shell; mobile mode controls; `이전`, `다음`, `관련 파일`, `핵심 파일`, `접기`, `읽음`, `다크 모드`, `검색`, source-copy controls; symbol anchors; no fabricated line number.
- Navigation targets are `index.html`, `architecture.html`, `concepts/serializable-transaction.html`, `features/task-score-schedule.html`, `index.html#files`, and `exercises/task-flow.html`, resolved relative to each output page.

Use `inlineSvgIcon(name)` with a fixed allowlist of `search`, `home`, `previous`, `next`, `check`, `sun`, `moon`, `zoom-in`, `zoom-out`, `reset`; every icon-bearing control retains visible Korean text or an accessible name.

- [ ] **Step 4: Run the page tests**

Run: `node --test tools/learning-site/tests/pages.test.mjs`

Expected: PASS for fixed copy, A–G anatomy, evidence labels, and prohibited-edge checks.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/lib/pages.mjs tools/learning-site/tests/pages.test.mjs
git commit -m "feat(learning-site): compose learning pages"
```

### Task 9: Implement the Approved Visual System

**Files:**
- Create: `tools/learning-site/tests/style.test.mjs`
- Create: `tools/learning-site/assets/site.css`

**Interfaces:**
- Produces the CSS copied verbatim to `learning-site/assets/site.css`.
- Class names must match `render.mjs` and `pages.mjs`.

- [ ] **Step 1: Write design-token and responsive tests**

```js
test('contains approved tokens and responsive contracts', async () => {
  const css = await readFile(new URL('../assets/site.css', import.meta.url), 'utf8');
  for (const token of ['#FFFFFF', '#101827', '#0B1020', '#B9F34A', '#F2A93B']) {
    assert.match(css.toUpperCase(), new RegExp(token));
  }
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*62fr\)\s+minmax\(0,\s*38fr\)/);
  assert.match(css, /min-(?:height|inline-size):\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/style.test.mjs`

- [ ] **Step 3: Implement the complete local CSS**

Start with these variables and layout rules:

```css
:root {
  --surface: #FFFFFF;
  --ink: #101827;
  --code: #0B1020;
  --confirmed: #B9F34A;
  --attention: #F2A93B;
  --muted: #667085;
  --border: #D8DEE8;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  color-scheme: light;
  font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
}
.file-study { display: grid; grid-template-columns: minmax(0, 62fr) minmax(0, 38fr); }
.source-panel code { font-family: "Cascadia Code", Consolas, "SFMono-Regular", monospace; white-space: pre; }
```

Add semantic focus rings, evidence line styles, sticky explanation, independent horizontal code scrolling, dark theme through `[data-theme="dark"]`, mobile mode visibility at `760px`, bottom sheet, sticky mobile controls, >=44px targets, print styles, and reduced-motion overrides. Do not hide source content when JavaScript is absent.

- [ ] **Step 4: Run the style tests**

Run: `node --test tools/learning-site/tests/style.test.mjs`

Expected: PASS.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/assets/site.css tools/learning-site/tests/style.test.mjs
git commit -m "feat(learning-site): add approved visual system"
```

### Task 10: Implement Offline Runtime Interactions

**Files:**
- Create: `tools/learning-site/tests/runtime.test.mjs`
- Create: `tools/learning-site/assets/site.js`

**Interfaces:**
- Produces global `DsmLearningRuntime` with `normalizeQuery`, `filterSearch`, `createStorageAdapter`, `copySourceText`, `clampTransform`, and `init(document, data)`.
- Consumes global `DSM_LEARNING_DATA`; makes no network request.

- [ ] **Step 1: Write pure-runtime tests with `node:vm`**

```js
async function loadRuntime() {
  const code = await readFile(new URL('../assets/site.js', import.meta.url), 'utf8');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'site.js' });
  return sandbox.DsmLearningRuntime;
}

test('searches path, filename, class, and function with filters', async () => {
  const runtime = await loadRuntime();
  const items = [
    { path: 'DSM_Back/src/tasks/tasks.service.ts', filename: 'tasks.service.ts', symbols: ['TasksService', 'update'], area: 'backend', kind: 'source', read: false },
    { path: 'DSM_Front/src/app/index.tsx', filename: 'index.tsx', symbols: ['Index'], area: 'frontend', kind: 'source', read: true },
  ];
  assert.deepEqual(runtime.filterSearch(items, 'UPDATE', { area: 'backend' }).map((item) => item.path), [items[0].path]);
});

test('falls back to memory when localStorage throws', async () => {
  const runtime = await loadRuntime();
  const storage = runtime.createStorageAdapter({ getItem() { throw new Error('blocked'); } });
  storage.set('theme', 'dark');
  assert.equal(storage.get('theme'), 'dark');
  assert.equal(storage.persistent, false);
});

test('copies exact source text through clipboard or fallback', async () => {
  const runtime = await loadRuntime();
  const writes = [];
  await runtime.copySourceText('a < b\r\n', null, async (value) => writes.push(value));
  assert.deepEqual(writes, ['a < b\r\n']);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/runtime.test.mjs`

- [ ] **Step 3: Implement one classic-script runtime**

Wrap the file in an IIFE and export the same API to `globalThis.DsmLearningRuntime`. `init` must:

- render debounced search results from local data only;
- apply backend/frontend, language, source/test, read, and batch filters;
- render `remaining` search hits as non-linked `후속 배치` results instead of broken anchors;
- persist `dsm-learning:theme`, `dsm-learning:read`, and disclosure keys;
- announce localStorage fallback once through an `aria-live` region;
- toggle dark theme, read state, explanations, mobile code/explanation modes, contents sheet, and native `<details>`;
- copy the exact `data-source-code` text through `navigator.clipboard.writeText` when available and a selection-based local fallback otherwise;
- implement diagram `+`, `-`, pointer drag, arrow-key pan, and reset with transform clamped to scale 0.75–2.5 and translation ±1200;
- preserve normal anchors and content when runtime initialization fails.

Do not use `fetch`, `XMLHttpRequest`, dynamic `import()`, `eval`, or remote URLs.

- [ ] **Step 4: Run the runtime tests**

Run: `node --test tools/learning-site/tests/runtime.test.mjs`

Expected: PASS.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/assets/site.js tools/learning-site/tests/runtime.test.mjs
git commit -m "feat(learning-site): add offline interactions"
```

### Task 11: Build the Selective Static Generator

**Files:**
- Create: `tools/learning-site/tests/generate.test.mjs`
- Create: `tools/learning-site/generate.mjs`

**Interfaces:**
- Consumes all manifest/source/symbol/content/page modules and source assets.
- Produces `buildSiteModel({ rootDir, batch })`, `generateSite({ rootDir, outputDir, batch, only })`, `parseGenerateArgs(argv)`.
- `buildSiteModel` returns the exact `SiteModel` contract defined in Task 8.
- CLI: `node tools/learning-site/generate.mjs --root <root> --out <out> --batch pilot-a --only <id> [--only <id>]`.

- [ ] **Step 1: Write an actual-repository integration test**

```js
test('generates only requested outputs in a temporary directory', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'learning-generate-'));
  const result = await generateSite({
    rootDir: ROOT,
    outputDir,
    batch: 'pilot-a',
    only: ['asset:site.css', 'file:DSM_Back/src/tasks/tasks.service.ts'],
  });
  assert.deepEqual(result.written.sort(), [
    'assets/site.css',
    'files/DSM_Back/src/tasks/tasks.service.ts.html',
  ]);
  await assert.rejects(() => access(path.join(outputDir, 'index.html')), { code: 'ENOENT' });
  assert.match(await readFile(path.join(outputDir, result.written[1]), 'utf8'), /data-source-code/);
});

test('fails closed when baseline counts drift', async () => {
  const brokenRoot = await mkdtemp(path.join(tmpdir(), 'learning-broken-'));
  await mkdir(path.join(brokenRoot, 'DSM_Back'), { recursive: true });
  await mkdir(path.join(brokenRoot, 'DSM_Front'), { recursive: true });
  await assert.rejects(
    () => buildSiteModel({ rootDir: brokenRoot, batch: 'pilot-a' }),
    /CORPUS_BASELINE_MISMATCH/,
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/generate.test.mjs`

- [ ] **Step 3: Implement deterministic generation**

`buildSiteModel` must:

1. collect 124 eligible paths;
2. read strict UTF-8 records and assert 13,168 total lines plus backend/frontend splits;
3. extract symbols for all 124 records;
4. mark the 15 pilot paths `processed` and the other 109 `remaining`;
5. attach `FILE_GUIDES` only to pilot records;
6. expose `PUBLIC_EXCLUSIONS` without reading excluded content;
7. mark non-pilot exposure candidates `remaining` with `reviewRequired: true` and omit their symbols from runtime data;
8. throw `PILOT_EXPOSURE_REVIEW_REQUIRED:<path>` if any Pilot A record is flagged, without printing matched text;
9. throw for a missing pilot path, duplicate output path, or invalid UTF-8.

Supported output IDs are exactly:

```text
asset:site.css
asset:site.js
asset:site-data.js
page:index
page:architecture
page:concepts
page:feature
page:exercise
page:diagram
file:<one exact PILOT_A_PATHS value>
```

`site-data.js` assigns a JSON-serializable frozen object to `globalThis.DSM_LEARNING_DATA` and contains metadata/symbols only, never duplicate source text. Write through a temporary sibling file followed by `rename`; create only directories required by requested IDs. Unknown IDs fail with `UNKNOWN_OUTPUT_ID:<id>`. Sort keys and arrays for repeatable output; do not include the current time.

- [ ] **Step 4: Run generator tests and inspect the two-file result**

Run: `node --test tools/learning-site/tests/generate.test.mjs`

Expected: PASS; exactly two temporary output files.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/generate.mjs tools/learning-site/tests/generate.test.mjs
git commit -m "feat(learning-site): add selective generator"
```

### Task 12: Build the Independent Verifier

**Files:**
- Create: `tools/learning-site/tests/verify.test.mjs`
- Create: `tools/learning-site/verify.mjs`

**Interfaces:**
- Produces `extractRenderedSource(html)`, `verifyOfflineHtml(html)`, `verifyLocalLinks(outputDir)`, `verifySourcePage({ rootDir, outputDir, sourcePath })`, `verifySite({ rootDir, outputDir })`, `parseVerifyArgs(argv)`.
- CLI supports repeated `--source <path>` for checkpoint verification and `--full --report <path>` for final verification.

- [ ] **Step 1: Write tamper-detection tests**

```js
test('accepts untouched output and rejects one-character drift', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'learning-verify-'));
  const sourcePath = 'DSM_Back/src/tasks/tasks.service.ts';
  await generateSite({ rootDir: ROOT, outputDir, batch: 'pilot-a', only: [`file:${sourcePath}`] });
  await assert.doesNotReject(() => verifySourcePage({ rootDir: ROOT, outputDir, sourcePath }));
  const outputPath = path.join(outputDir, fileOutputPath(sourcePath));
  const html = await readFile(outputPath, 'utf8');
  await writeFile(outputPath, html.replace('TasksService', 'TaskService'));
  await assert.rejects(
    () => verifySourcePage({ rootDir: ROOT, outputDir, sourcePath }),
    /SOURCE_(?:TEXT|SHA)_MISMATCH/,
  );
});

test('rejects remote dependencies and broken local links', async () => {
  await assert.rejects(() => verifyOfflineHtml('<script src="https://cdn.example/x.js"></script>'), /REMOTE_DEPENDENCY/);
  const outputDir = await mkdtemp(path.join(tmpdir(), 'learning-links-'));
  await writeFile(path.join(outputDir, 'index.html'), '<a href="missing.html">missing</a>');
  await assert.rejects(() => verifyLocalLinks(outputDir), /BROKEN_LINK/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tools/learning-site/tests/verify.test.mjs`

- [ ] **Step 3: Implement verification without sharing renderer internals**

The verifier independently:

- locates the single `<code data-source-code>` region;
- removes only generated `<span class="tok ...">` tags;
- decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;` once;
- compares text, UTF-8 byte count, SHA-256, logical lines, and line-ending metadata to `readSourceRecord`;
- resolves every local `href`/`src` and fragment anchor;
- removes source-code regions before dependency scanning, then rejects remote `href`/`src`, protocol-relative dependency URLs, CSS `@import`/remote `url()`, and runtime `fetch(`, `XMLHttpRequest`, or dynamic import; URL/network text inside preserved original code is not treated as a site dependency;
- rejects duplicate source pages/slugs, missing `site-data.js`, and search/progress inconsistencies;
- asserts processed=15, remaining=109, missing=0 and exact Pilot A membership;
- checks required copy, A–G regions, evidence legend, no Task→NotificationsService edge, and no FCM send node;
- checks that no `.env` page/path exists, `PUBLIC_EXCLUSIONS` contains only public path/reason metadata, and no source roots outside the approved corpus are represented; it never reads `.env` and therefore never claims to compare unknown credential values.

On success, `--report learning-site/verification-report.json` writes deterministic JSON with baseline, per-file hashes, link/search/offline checks, `processed/remaining/missing/excluded`, and `status: "PASS"`. On failure it exits non-zero and does not overwrite an existing passing report.

- [ ] **Step 4: Run verifier tests and the complete tool test suite**

Run:

```powershell
node --test tools/learning-site/tests/verify.test.mjs
node --test "tools/learning-site/tests/*.test.mjs"
```

Expected: all tests PASS; the tampered fixture fails only inside `assert.rejects`.

- [ ] **Step 5: Approval-gated checkpoint commit**

```powershell
git add -- tools/learning-site/verify.mjs tools/learning-site/tests/verify.test.mjs
git commit -m "feat(learning-site): verify source fidelity"
```

### Task 13: Generate the Two Shared Runtime Assets

**Files:**
- Create: `learning-site/assets/site.css`
- Create: `learning-site/assets/site.js`

**Interfaces:** Generated copies of the approved hand-authored assets.

- [ ] **Step 1: Generate exactly two files**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only asset:site.css --only asset:site.js
```

Expected: `written` lists exactly `assets/site.css` and `assets/site.js`.

- [ ] **Step 2: Verify byte-for-byte asset copies**

```powershell
Get-FileHash tools\learning-site\assets\site.css,learning-site\assets\site.css -Algorithm SHA256
Get-FileHash tools\learning-site\assets\site.js,learning-site\assets\site.js -Algorithm SHA256
```

Expected: each source/output pair has the same SHA-256.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/assets/site.css learning-site/assets/site.js
git commit -m "feat(learning-site): generate local assets"
```

### Task 14: Generate Architecture and Diagram Pages

**Files:**
- Create: `learning-site/architecture.html`
- Create: `learning-site/diagrams/task-update-flow.html`

- [ ] **Step 1: Generate exactly two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only page:architecture --only page:diagram
```

- [ ] **Step 2: Assert the corrected graph facts**

```powershell
rg -n "PATCH /tasks/:id|Serializable|일정 변경 시|확인 필요" learning-site\architecture.html learning-site\diagrams\task-update-flow.html
$forbidden = Select-String -Path learning-site\architecture.html,learning-site\diagrams\task-update-flow.html -Pattern 'TasksService.{0,80}NotificationsService|FCM send'
if ($forbidden) { $forbidden; throw 'Forbidden Task notification edge found' }
```

Expected: the first command finds every label; the second returns no matches.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/architecture.html learning-site/diagrams/task-update-flow.html
git commit -m "feat(learning-site): generate task architecture"
```

### Task 15: Generate Concept and Feature Pages

**Files:**
- Create: `learning-site/concepts/serializable-transaction.html`
- Create: `learning-site/features/task-score-schedule.html`

- [ ] **Step 1: Generate exactly two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only page:concepts --only page:feature
```

- [ ] **Step 2: Check required branches and evidence links**

Run: `rg -n "create|update|remove|complete|P2034|ScoresService\.recompute|NotificationSchedule|NotificationDelivery" learning-site\concepts\serializable-transaction.html learning-site\features\task-score-schedule.html`

Expected: all mutation branches and transaction evidence terms appear.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/concepts/serializable-transaction.html learning-site/features/task-score-schedule.html
git commit -m "feat(learning-site): generate task learning flow"
```

### Task 16: Generate Exercises and the Composition-Root File Page

**Files:**
- Create: `learning-site/exercises/task-flow.html`
- Create: `learning-site/files/DSM_Back/src/app.module.ts.html`

- [ ] **Step 1: Generate exactly two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only page:exercise --only "file:DSM_Back/src/app.module.ts"
```

- [ ] **Step 2: Verify the source page and collapsed answers**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/app.module.ts
rg -n "<details|위치와 역할|원본 코드 · 변경 없음|AI 설명 · 원본 밖" learning-site\exercises\task-flow.html learning-site\files\DSM_Back\src\app.module.ts.html
```

Expected: source verification PASS and exercise answers use closed `<details>` elements.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/exercises/task-flow.html learning-site/files/DSM_Back/src/app.module.ts.html
git commit -m "feat(learning-site): generate exercises and app module"
```

### Task 17: Generate Schema and Controller File Pages

**Files:**
- Create: `learning-site/files/DSM_Back/prisma/schema.prisma.html`
- Create: `learning-site/files/DSM_Back/src/tasks/tasks.controller.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/prisma/schema.prisma" --only "file:DSM_Back/src/tasks/tasks.controller.ts"
```

- [ ] **Step 2: Verify both source regions**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/prisma/schema.prisma --source DSM_Back/src/tasks/tasks.controller.ts
```

Expected: both PASS with original SHA, bytes, lines, and text.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/prisma/schema.prisma.html learning-site/files/DSM_Back/src/tasks/tasks.controller.ts.html
git commit -m "feat(learning-site): generate schema and controller"
```

### Task 18: Generate Task Service and Create DTO Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/tasks/tasks.service.ts.html`
- Create: `learning-site/files/DSM_Back/src/tasks/dto/create-task.dto.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/tasks/tasks.service.ts" --only "file:DSM_Back/src/tasks/dto/create-task.dto.ts"
```

- [ ] **Step 2: Verify source fidelity and 277-line computed metadata**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/tasks/tasks.service.ts --source DSM_Back/src/tasks/dto/create-task.dto.ts
rg -n "TypeScript · 277줄 · 핵심 파일|Prisma\.\$transaction|ScoresService" learning-site\files\DSM_Back\src\tasks\tasks.service.ts.html
```

Expected: both source checks PASS; Task service metadata says 277 lines.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/tasks/tasks.service.ts.html learning-site/files/DSM_Back/src/tasks/dto/create-task.dto.ts.html
git commit -m "feat(learning-site): generate task service study"
```

### Task 19: Generate Update DTO and Score Policy Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/tasks/dto/update-task.dto.ts.html`
- Create: `learning-site/files/DSM_Back/src/scores/scores.policy.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/tasks/dto/update-task.dto.ts" --only "file:DSM_Back/src/scores/scores.policy.ts"
```

- [ ] **Step 2: Verify both source regions**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/tasks/dto/update-task.dto.ts --source DSM_Back/src/scores/scores.policy.ts
```

Expected: both PASS.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/tasks/dto/update-task.dto.ts.html learning-site/files/DSM_Back/src/scores/scores.policy.ts.html
git commit -m "feat(learning-site): generate dto and score policy"
```

### Task 20: Generate Score and Token-Boundary Service Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/scores/scores.service.ts.html`
- Create: `learning-site/files/DSM_Back/src/notifications/notifications.service.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/scores/scores.service.ts" --only "file:DSM_Back/src/notifications/notifications.service.ts"
```

- [ ] **Step 2: Verify both pages and the explicit non-edge explanation**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/scores/scores.service.ts --source DSM_Back/src/notifications/notifications.service.ts
rg -n "FCM token|직접 호출 경로가 아니다|DailyScore|totalScore|tier" learning-site\files\DSM_Back\src\scores\scores.service.ts.html learning-site\files\DSM_Back\src\notifications\notifications.service.ts.html
```

Expected: source checks PASS and token lifecycle is explicitly separated from Task mutation.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/scores/scores.service.ts.html learning-site/files/DSM_Back/src/notifications/notifications.service.ts.html
git commit -m "feat(learning-site): generate score and token services"
```

### Task 21: Generate Notification Constants and Prisma Service Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/notifications/notification-schedule.constants.ts.html`
- Create: `learning-site/files/DSM_Back/src/prisma/prisma.service.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/notifications/notification-schedule.constants.ts" --only "file:DSM_Back/src/prisma/prisma.service.ts"
```

- [ ] **Step 2: Verify both source regions**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/notifications/notification-schedule.constants.ts --source DSM_Back/src/prisma/prisma.service.ts
```

Expected: both PASS.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/notifications/notification-schedule.constants.ts.html learning-site/files/DSM_Back/src/prisma/prisma.service.ts.html
git commit -m "feat(learning-site): generate notification and prisma references"
```

### Task 22: Generate Task and Score Test Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/tasks/tasks.service.spec.ts.html`
- Create: `learning-site/files/DSM_Back/src/scores/scores.service.spec.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/tasks/tasks.service.spec.ts" --only "file:DSM_Back/src/scores/scores.service.spec.ts"
```

- [ ] **Step 2: Verify both source regions and evidence labels**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/tasks/tasks.service.spec.ts --source DSM_Back/src/scores/scores.service.spec.ts
rg -n "테스트가 보장|테스트가 보장하지" learning-site\files\DSM_Back\src\tasks\tasks.service.spec.ts.html learning-site\files\DSM_Back\src\scores\scores.service.spec.ts.html
```

Expected: source checks PASS and both pages distinguish evidence limits.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/tasks/tasks.service.spec.ts.html learning-site/files/DSM_Back/src/scores/scores.service.spec.ts.html
git commit -m "feat(learning-site): generate task and score evidence"
```

### Task 23: Generate Notification and E2E Test Pages

**Files:**
- Create: `learning-site/files/DSM_Back/src/notifications/notifications.service.spec.ts.html`
- Create: `learning-site/files/DSM_Back/test/app.e2e-spec.ts.html`

- [ ] **Step 1: Generate the two pages**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only "file:DSM_Back/src/notifications/notifications.service.spec.ts" --only "file:DSM_Back/test/app.e2e-spec.ts"
```

- [ ] **Step 2: Verify both source regions**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --source DSM_Back/src/notifications/notifications.service.spec.ts --source DSM_Back/test/app.e2e-spec.ts
```

Expected: both PASS; all 15 Pilot A file pages now exist.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/files/DSM_Back/src/notifications/notifications.service.spec.ts.html learning-site/files/DSM_Back/test/app.e2e-spec.ts.html
git commit -m "feat(learning-site): generate notification and e2e evidence"
```

### Task 24: Generate Search Data and Home Page

**Files:**
- Create: `learning-site/assets/site-data.js`
- Create: `learning-site/index.html`

- [ ] **Step 1: Generate the final two runtime inputs**

```powershell
node tools/learning-site/generate.mjs --root C:\DEV --out C:\DEV\learning-site --batch pilot-a --only asset:site-data.js --only page:index
```

- [ ] **Step 2: Assert progress and offline data shape**

```powershell
rg -n "processed|remaining|missing|excluded|124개 파일 · 13,168줄 · 오프라인|Task 흐름 학습 시작" learning-site\assets\site-data.js learning-site\index.html
$remote = Select-String -Path learning-site\assets\site-data.js,learning-site\index.html -Pattern 'https?://|fetch\(|XMLHttpRequest|import\('
if ($remote) { $remote; throw 'Remote dependency found' }
```

Expected: first command finds progress/copy; second returns no matches. Runtime data reports 15 processed, 109 remaining, 0 missing.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/assets/site-data.js learning-site/index.html
git commit -m "feat(learning-site): generate map and search data"
```

### Task 25: Run Full Verification and Browser QA

**Files:**
- Create: `learning-site/verification-report.json`
- Create: `learning-site/qa-report.md`

**Interfaces:** Final machine-readable and human-readable acceptance evidence.

- [ ] **Step 1: Run every tooling test from a fresh process**

Run: `node --test "tools/learning-site/tests/*.test.mjs"`

Expected: all tests PASS with zero skipped tests.

- [ ] **Step 2: Produce the deterministic full verification report**

```powershell
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --full --report C:\DEV\learning-site\verification-report.json
```

Expected: exit 0, `status: "PASS"`, 15 processed, 109 remaining, 0 missing, 15 source-page fidelity passes, zero broken links, zero remote dependencies, zero forbidden Task→NotificationsService/FCM edges.

- [ ] **Step 3: Perform browser QA using the in-app Browser first**

Open `file:///C:/DEV/learning-site/index.html` and test at 1440×900 and 390×844:

1. Navigate every primary nav item and all 15 file pages.
2. Search `TasksService`, `update`, `schema.prisma`; apply backend, TypeScript, test, unread, pilot-a filters.
3. Mark one page read, reload, and verify persistence; repeat with localStorage throwing and verify the single fallback notice.
4. Toggle dark mode, file tabs, code/explanation mobile modes, contents sheet, answer disclosures, previous/next/related links.
5. Zoom, pan with pointer and keyboard, and reset the diagram.
6. Disable JavaScript and verify source code, headings, breadcrumbs, nav, previous/next, and exercise answers remain readable.
7. Check visible focus, heading/landmark order, 44×44 targets, reduced-motion mode, horizontal code scrolling, and desktop 62/38 layout.
8. Compare screenshots with the four approved assets in `docs/superpowers/specs/assets/offline-learning-site/`; layout/color/copy are binding, generated source text overrides image artifacts.

If the in-app Browser is unavailable, record that reason and use regular Playwright; `file://` must still be the tested URL.

- [ ] **Step 4: Write exact QA evidence**

Create `qa-report.md` with these fixed sections: environment/URL/viewports, navigation, search/filters, persistence/fallback, theme, mobile controls, diagram, JavaScript-disabled path, accessibility, concept comparison, failures. Write `PASS` only for observed behavior; for any failure write the exact page, viewport, selector/control, observed result, and return to the owning tooling task before continuing.

- [ ] **Step 5: Verify repository preservation**

```powershell
git diff --check
git diff --name-only -- DSM_Back DSM_Front
git status --short
```

Expected: `git diff --check` exit 0; no `DSM_Back`/`DSM_Front` diff; only approved learning-site/tooling/docs/memory changes plus pre-existing unrelated changes.

- [ ] **Step 6: Approval-gated checkpoint commit**

```powershell
git add -- learning-site/verification-report.json learning-site/qa-report.md
git commit -m "test(learning-site): record pilot verification"
```

### Task 26: Record Pilot Completion in Plan and Context

**Files:**
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`

- [ ] **Step 1: Update only the offline learning-site sections**

Record actual test counts, generated file counts, source/hash/link/search/browser results, exact unresolved failures, and whether Git writes were authorized. Mark M3–M6 complete only when their acceptance evidence exists. Keep M7–M9 pending until Pilot A is reviewed by the user.

- [ ] **Step 2: Re-read the changed sections and check unrelated memory content**

Run:

```powershell
Select-String -Path .ai\memory\plan.md,.ai\memory\context.md -Pattern "오프라인 학습 사이트|Pilot A|M3|M4|M5|M6" -Context 1,4
git diff -- .ai/memory/plan.md .ai/memory/context.md
```

Expected: only the offline learning-site sections changed; external-PC and Front-session records remain intact.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- .ai/memory/plan.md .ai/memory/context.md
git commit -m "docs(memory): record learning-site pilot"
```

### Task 27: Close the Pilot Checklist and Request Review

**Files:**
- Modify: `.ai/memory/checklist.md`

- [ ] **Step 1: Update exact checklist state**

Mark generator/verifier, common offline template, Pilot A generation, and completed interaction/verification items `[x]` only when Task 25 evidence passed. Keep remaining-file batches and full-corpus final verification `[ ]`. Add Pilot A user review as `[/]` and stop before generating any of the remaining 109 pages.

- [ ] **Step 2: Run final non-mutating checks**

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
node tools/learning-site/verify.mjs --root C:\DEV --out C:\DEV\learning-site --full
git diff --check
git diff --name-only -- DSM_Back DSM_Front
```

Expected: tests and verifier PASS, diff check exit 0, application diff empty.

- [ ] **Step 3: Approval-gated checkpoint commit**

```powershell
git add -- .ai/memory/checklist.md
git commit -m "docs(memory): request pilot review"
```

- [ ] **Step 4: Hand the Pilot A site to the user**

Report the clickable `C:\DEV\learning-site\index.html`, verification/QA results, processed=15, remaining=109, missing/excluded counts, source preservation evidence, known limitations, and whether Git commits were skipped. Request Pilot A approval before drafting the next 10–20-file batch plan.

---

## Spec Coverage Matrix

| Design requirement | Plan coverage |
|---|---|
| 124-file/13,168-line corpus and 15-file Pilot | Tasks 1, 3, 11, 12, 24–25 |
| Original text/SHA/bytes/lines/line ending | Tasks 3, 5, 7, 12, 16–23, 25 |
| Offline `file://`, no CDN/fetch/server | Tasks 7, 9–12, 24–25 |
| Project map and exact Task architecture | Tasks 6, 8, 14–15, 24 |
| No TasksService→NotificationsService or FCM send | Tasks 6, 8, 12, 14, 20, 25 |
| Search, filters, read state, theme, fallback | Tasks 4, 10–12, 24–25 |
| File A–G anatomy and exercises | Tasks 6–8, 16–23 |
| 62/38 desktop and mobile modes/sheet/sticky controls | Tasks 8–10, 25 |
| Evidence styles and accessible SVG diagram controls | Tasks 6, 8–10, 14, 25 |
| Missing/invalid/sensitive/broken-link failure states | Tasks 1–3, 11–12, 25 |
| Processed/remaining/missing/excluded reporting | Tasks 1, 11–12, 24–25, 27 |
| Application-source preservation | Tasks 12, 25, 27 |
| Remaining 109 files in 10–20-file batches | Explicitly gated after Task 27 user review |

## Execution Boundary

This plan authorizes no implementation by itself. Execution begins only after the user chooses an execution mode and approves the plan. Git writes require separate explicit approval even after execution is approved. The remaining 109 source pages are outside this plan and require Pilot A approval plus new 10–20-file batch plans.
