import { fileOutputPath, relativeHref } from './paths.mjs';
import {
  escapeHtml,
  renderBreadcrumbs,
  renderDocument,
  renderEvidenceLegend,
  renderSourcePanel,
} from './render.mjs';

const OUTPUT_PATHS = Object.freeze({
  index: 'index.html',
  architecture: 'architecture.html',
  concept: 'concepts/serializable-transaction.html',
  feature: 'features/task-score-schedule.html',
  exercise: 'exercises/task-flow.html',
  diagram: 'diagrams/task-update-flow.html',
  authSocial: 'features/social-login.html',
  authRefresh: 'features/refresh-rotation.html',
  authConcept: 'concepts/jwt-session.html',
  authExercise: 'exercises/auth-session.html',
  authDiagram: 'diagrams/auth-session-flow.html',
});

function href(outputPath, targetPath, fragment = '') {
  return `${relativeHref(outputPath, targetPath)}${fragment}`;
}

function sourceHref(outputPath, sourcePath, fragment = '') {
  return href(outputPath, fileOutputPath(sourcePath), fragment);
}

function pageHeading(eyebrow, title, description) {
  return `<header class="page-heading">
  <p class="eyebrow">${escapeHtml(eyebrow)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">${escapeHtml(description)}</p>
</header>`;
}

function renderProjectMap() {
  return `<section class="project-map" aria-labelledby="project-map-title">
  <div class="section-heading"><p class="eyebrow">SYSTEM MAP</p><h2 id="project-map-title">프로젝트가 움직이는 두 축</h2></div>
  <div class="map-grid">
    <article class="map-card map-card--front">
      <p class="map-card__tag">DSM_Front · Expo Prototype</p>
      <h3>화면과 local mock state</h3>
      <p>현재 root 기준 제품 prototype은 화면과 로컬 상태를 먼저 검증한다.</p>
      <div class="map-edge map-edge--unknown"><span>local mock</span><span>REST API</span><strong>미연결 · 확인 필요</strong></div>
    </article>
    <article class="map-card map-card--back">
      <p class="map-card__tag">DSM_Back · NestJS</p>
      <h3>요청에서 영속성까지</h3>
      <p>NestJS → Prisma → PostgreSQL의 확인된 backend 경로다.</p>
      <div class="map-edge map-edge--confirmed"><span>NestJS</span><span>Prisma</span><span>PostgreSQL</span></div>
    </article>
  </div>
</section>`;
}

function renderPilotPath(outputPath) {
  return `<section class="pilot-path" aria-labelledby="pilot-path-title">
  <div class="section-heading"><p class="eyebrow">PILOT A · 15 FILES</p><h2 id="pilot-path-title">Task 변경 뒤 두 갈래를 함께 읽기</h2></div>
  <div class="path-flow">
    <a class="path-node" href="${href(outputPath, OUTPUT_PATHS.feature)}">Task 변경</a>
    <span class="path-split" aria-hidden="true">↗ ↘</span>
    <a class="path-node path-node--confirmed" href="${sourceHref(outputPath, 'DSM_Back/src/scores/scores.service.ts')}">점수 재계산</a>
    <a class="path-node path-node--conditional" href="${sourceHref(outputPath, 'DSM_Back/src/tasks/tasks.service.ts')}">알림 예약 상태 동기화</a>
  </div>
</section>`;
}

function renderBatchBPath(model, outputPath) {
  if (!model.auth) return '';
  return `<section class="pilot-path" aria-labelledby="batch-b-path-title">
  <div class="section-heading"><p class="eyebrow">BATCH B · 13 FILES</p><h2 id="batch-b-path-title">Social Auth와 refresh rotation</h2></div>
  <div class="path-flow">
    <a class="path-node" href="${href(outputPath, OUTPUT_PATHS.authSocial)}">Social login</a>
    <span class="path-split" aria-hidden="true">→</span>
    <a class="path-node path-node--confirmed" href="${href(outputPath, OUTPUT_PATHS.authConcept)}">JWT access guard</a>
    <a class="path-node path-node--conditional" href="${href(outputPath, OUTPUT_PATHS.authRefresh)}">refresh 단일 승자</a>
    <a class="path-node" href="${href(outputPath, OUTPUT_PATHS.authDiagram)}">Auth diagram</a>
  </div>
</section>`;
}

function renderFileCatalog(model, outputPath) {
  const items = model.records
    .map((record) => {
      const label = `<span><strong>${escapeHtml(record.path.split('/').at(-1))}</strong><small>${escapeHtml(record.path)}</small></span>`;
      if (record.status === 'processed') {
        return `<li><a href="${sourceHref(outputPath, record.path)}">${label}<span class="status-badge status-badge--ready">학습 가능</span></a></li>`;
      }
      return `<li><span class="file-pending">${label}<span class="status-badge">후속 배치</span></span></li>`;
    })
    .join('');
  return `<section id="files" class="file-catalog" aria-labelledby="files-title">
  <div class="section-heading"><p class="eyebrow">SOURCE INDEX</p><h2 id="files-title">파일·클래스·함수로 찾아가기</h2></div>
  <p>${model.progress.processed}개 학습 가능 · ${model.progress.remaining}개 후속 배치 · ${model.progress.missing}개 누락</p>
  <ul class="file-list">${items}</ul>
</section>`;
}

export function renderIndexPage(model) {
  const body = `<main id="main" class="page-shell">
  <section class="hero">
    <div class="hero__copy">
      <p class="eyebrow">TECHNICAL FIELD NOTEBOOK</p>
      <h1>코드를 고치지 않고,<br>코드가 움직이는 길을 읽습니다.</h1>
      <p>${model.copy.scope}</p>
      <div class="hero__actions">
        <a class="button button--primary" href="${href(OUTPUT_PATHS.index, OUTPUT_PATHS.feature)}">${model.copy.cta}</a>
        <a class="button button--quiet" href="${href(OUTPUT_PATHS.index, OUTPUT_PATHS.architecture)}">아키텍처 먼저 보기</a>
      </div>
    </div>
    <aside class="hero__note"><strong>읽기 규칙</strong><p>라임 실선은 확인됨, 앰버 점선은 조건·추론, 회색 점선은 확인 필요를 뜻합니다.</p></aside>
  </section>
  ${renderProjectMap()}
  ${renderPilotPath(OUTPUT_PATHS.index)}
  ${renderBatchBPath(model, OUTPUT_PATHS.index)}
  ${renderFileCatalog(model, OUTPUT_PATHS.index)}
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.index,
    title: '프로젝트 지도',
    currentNav: '프로젝트 지도',
    body,
  });
}

function renderFlowSvg() {
  return `<svg class="architecture-svg" viewBox="0 0 1160 650" role="img" aria-labelledby="flow-title flow-desc">
  <title id="flow-title">Task update transaction 흐름</title>
  <desc id="flow-desc">PATCH 요청이 controller와 service를 지나 Serializable transaction에서 Task, 조건부 알림 예약 상태, 점수를 갱신한 뒤 Prisma와 PostgreSQL로 이어진다.</desc>
  <defs>
    <marker id="arrow-confirmed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="marker-confirmed"/></marker>
    <marker id="arrow-conditional" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="marker-conditional"/></marker>
  </defs>
  <g class="diagram-layer" data-diagram-layer>
    <g class="diagram-node"><rect x="28" y="50" width="190" height="72" rx="12"/><text x="123" y="82">PATCH /tasks/:id</text><text x="123" y="104" class="diagram-node__sub">HTTP 요청</text></g>
    <g class="diagram-node"><rect x="270" y="50" width="220" height="72" rx="12"/><text x="380" y="82">TasksController.update()</text><text x="380" y="104" class="diagram-node__sub">인증 사용자 + DTO</text></g>
    <g class="diagram-node"><rect x="542" y="50" width="220" height="72" rx="12"/><text x="652" y="82">TasksService.update()</text><text x="652" y="104" class="diagram-node__sub">mutation 조율</text></g>
    <g class="diagram-node diagram-node--transaction"><rect x="814" y="50" width="310" height="72" rx="12"/><text x="969" y="82">Prisma.$transaction</text><text x="969" y="104" class="diagram-node__sub">Serializable · P2034 bounded retry</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M218 86 H270" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M490 86 H542" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M762 86 H814" marker-end="url(#arrow-confirmed)"/>
    <g class="diagram-node"><rect x="64" y="238" width="210" height="78" rx="12"/><text x="169" y="273">Task update</text><text x="169" y="296" class="diagram-node__sub">항상</text></g>
    <g class="diagram-node diagram-node--conditional"><rect x="326" y="210" width="240" height="106" rx="12"/><text x="446" y="247">NotificationSchedule</text><text x="446" y="271" class="diagram-node__sub">일정 변경 시</text><text x="446" y="293" class="diagram-node__sub">cancel / create</text></g>
    <g class="diagram-node diagram-node--conditional"><rect x="618" y="210" width="240" height="106" rx="12"/><text x="738" y="247">NotificationDelivery</text><text x="738" y="271" class="diagram-node__sub">nonterminal 존재 시</text><text x="738" y="293" class="diagram-node__sub">cancel</text></g>
    <g class="diagram-node"><rect x="910" y="238" width="210" height="78" rx="12"/><text x="1015" y="273">ScoresService</text><text x="1015" y="296" class="diagram-node__sub">같은 transaction client</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M969 122 V168 H169 V238" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--conditional" d="M969 122 V168 H446 V210" marker-end="url(#arrow-conditional)"/><path class="diagram-edge diagram-edge--conditional" d="M969 122 V168 H738 V210" marker-end="url(#arrow-conditional)"/><path class="diagram-edge diagram-edge--confirmed" d="M969 122 V238" marker-end="url(#arrow-confirmed)"/>
    <g class="diagram-node"><rect x="784" y="408" width="190" height="72" rx="12"/><text x="879" y="441">DailyScore upsert</text><text x="879" y="462" class="diagram-node__sub">UTC day</text></g>
    <g class="diagram-node"><rect x="1000" y="408" width="140" height="72" rx="12"/><text x="1070" y="441">User</text><text x="1070" y="462" class="diagram-node__sub">total / tier</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M1015 316 V366 H879 V408" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M1015 316 V366 H1070 V408" marker-end="url(#arrow-confirmed)"/>
    <g class="diagram-node diagram-node--persistence"><rect x="428" y="548" width="150" height="64" rx="12"/><text x="503" y="585">Prisma</text></g>
    <g class="diagram-node diagram-node--persistence"><rect x="634" y="548" width="190" height="64" rx="12"/><text x="729" y="585">PostgreSQL</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M169 316 V520 H503 V548" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M879 480 V520 H503 V548" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M1070 480 V520 H503 V548" marker-end="url(#arrow-confirmed)"/><path class="diagram-edge diagram-edge--confirmed" d="M578 580 H634" marker-end="url(#arrow-confirmed)"/>
  </g>
</svg>`;
}

export function renderArchitecturePage(model) {
  const authSummary = model.auth
    ? `<section class="boundary-note" aria-labelledby="auth-map-title">
  <p class="eyebrow">AUTH EVIDENCE MAP</p>
  <h2 id="auth-map-title">Auth session 근거 지도</h2>
  <p>Social login, access guard, refresh single-winner rotation, logout no-op을 별도 흐름으로 읽습니다.</p>
  <a class="evidence-link" href="${href(OUTPUT_PATHS.architecture, OUTPUT_PATHS.authDiagram)}">Auth diagram 보기</a>
</section>`
    : '';
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.architecture, OUTPUT_PATHS.index) }, { label: '아키텍처' }])}
  ${pageHeading('EVIDENCE MAP', model.flow.title, '확인된 호출, 조건부 side effect, persistence 경계를 한 화면에 놓습니다.')}
  ${renderEvidenceLegend()}
  <section class="diagram-card" aria-labelledby="architecture-title"><h2 id="architecture-title">PATCH /tasks/:id · Serializable 흐름</h2>${renderFlowSvg()}</section>
  <aside class="boundary-note"><p class="eyebrow">BOUNDARY NOTE</p><h2>${model.flow.comparison.title}</h2><p>${model.flow.comparison.text}</p><p><strong>확인 필요:</strong> 실제 device 전달 결과는 별도 sandbox 검증 범위입니다.</p></aside>
  ${authSummary}
</main>`;
  return renderDocument({ outputPath: OUTPUT_PATHS.architecture, title: '아키텍처', currentNav: '아키텍처', body });
}

export function renderConceptPage(model) {
  const body = `<main id="main" class="page-shell reading-page">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.concept, OUTPUT_PATHS.index) }, { label: '개념' }, { label: 'Serializable transaction' }])}
  ${pageHeading('CONCEPT NOTE', '한 번에 성공하거나, 한 번에 되돌아가기', 'Task와 그에 딸린 점수·예약 상태가 같은 transaction client를 공유하는 이유를 읽습니다.')}
  <section class="concept-grid">
    <article><p class="step-number">01</p><h2>원자성</h2><p>Task write 뒤 score recompute가 실패하면 callback 전체가 실패합니다. 서로 다른 상태가 반쯤 저장되는 것을 막는 경계입니다.</p></article>
    <article><p class="step-number">02</p><h2>Serializable</h2><p>동시에 바뀌는 상태를 가장 엄격한 isolation에서 처리합니다. P2034 충돌은 callback 전체를 최대 두 번 다시 시도합니다.</p></article>
    <article><p class="step-number">03</p><h2>조건부 side effect</h2><p>schedule/delivery 변경은 모든 update에 일어나지 않습니다. 일정·상태·알림 설정의 실제 변화가 조건입니다.</p></article>
  </section>
  <a class="evidence-link" href="${sourceHref(OUTPUT_PATHS.concept, 'DSM_Back/src/tasks/tasks.service.ts')}">원본 근거 · tasks.service.ts</a>
  ${renderEvidenceLegend()}
</main>`;
  return renderDocument({ outputPath: OUTPUT_PATHS.concept, title: 'Serializable transaction', currentNav: '개념', body });
}

export function renderFeaturePage(model) {
  const branches = [
    ['create', 'Task를 만들고 미래·활성 조건이면 PENDING schedule을 함께 생성한 뒤 해당 UTC day 점수를 다시 계산합니다.'],
    ['update', '기존/새 값을 비교해 schedule 관련 변화만 취소·재생성하고, 영향받은 서로 다른 UTC day를 계산합니다.'],
    ['remove', 'nonterminal 예약·전달을 취소하고 deletedAt을 설정한 뒤 기존 날짜 점수를 계산합니다.'],
    ['complete', 'nonterminal 예약·전달을 취소하고 COMPLETED 상태와 completedAt을 저장한 뒤 점수를 계산합니다.'],
  ];
  const cards = branches.map(([name, text], index) => `<article class="branch-card"><p class="step-number">0${index + 1}</p><h2>${name}</h2><p>${text}</p><a href="${sourceHref(OUTPUT_PATHS.feature, 'DSM_Back/src/tasks/tasks.service.ts')}">service 원본 보기</a></article>`).join('');
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.feature, OUTPUT_PATHS.index) }, { label: '기능 흐름' }, { label: 'Task·점수·예약' }])}
  ${pageHeading('FEATURE FLOW', model.flow.title, 'create, update, remove, complete를 같은 원자 경계 안에서 비교합니다.')}
  <section class="branch-grid">${cards}</section>
  <aside class="boundary-note"><strong>직접 연결 아님</strong><p>NotificationsService는 token lifecycle 경계입니다. Task mutation은 Prisma transaction 안에서 schedule/delivery 상태를 직접 변경합니다.</p></aside>
</main>`;
  return renderDocument({ outputPath: OUTPUT_PATHS.feature, title: 'Task 기능 흐름', currentNav: '기능 흐름', body });
}

export function renderExercisePage(model) {
  const exercises = model.exercises.map((exercise, index) => {
    const sources = exercise.sourcePaths.map((sourcePath) => `<a href="${sourceHref(OUTPUT_PATHS.exercise, sourcePath)}">${escapeHtml(sourcePath)}</a>`).join('');
    return `<article class="exercise-card"><div class="exercise-card__meta"><span>0${index + 1}</span><span>${escapeHtml(exercise.difficulty)}</span><span>${escapeHtml(exercise.type)}</span></div><h2>${escapeHtml(exercise.question)}</h2><div class="exercise-sources">${sources}</div><details><summary>답과 해설 보기</summary><p>${escapeHtml(exercise.answer)}</p></details></article>`;
  }).join('');
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.exercise, OUTPUT_PATHS.index) }, { label: '연습' }])}
  ${pageHeading('PRACTICE LAB', '원본 근거로 흐름을 다시 그려보기', '답은 접혀 있습니다. 먼저 파일과 다이어그램에서 근거를 찾으세요.')}
  <section class="exercise-grid">${exercises}</section>
</main>`;
  return renderDocument({ outputPath: OUTPUT_PATHS.exercise, title: '연습', currentNav: '연습', body });
}

export function renderDiagramPage(model) {
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.diagram, OUTPUT_PATHS.index) }, { label: '다이어그램' }, { label: 'Task update' }])}
  ${pageHeading('ZOOMABLE DIAGRAM', model.flow.title, '버튼, 방향키, pointer drag로 근거 지도를 탐색할 수 있습니다.')}
  <div class="diagram-toolbar" aria-label="다이어그램 조작"><button type="button" data-diagram-zoom="out" aria-label="축소">−</button><button type="button" data-diagram-reset>원래 크기</button><button type="button" data-diagram-zoom="in" aria-label="확대">+</button></div>
  <div class="diagram-viewport" data-diagram-viewport tabindex="0" aria-label="Task update 흐름 다이어그램. 방향키로 이동">${renderFlowSvg()}</div>
  ${renderEvidenceLegend()}
</main>`;
  return renderDocument({ outputPath: OUTPUT_PATHS.diagram, title: 'Task update 다이어그램', currentNav: '아키텍처', body });
}

function requireAuth(model) {
  if (!model.auth) throw new Error('AUTH_CONTENT_MISSING');
  return model.auth;
}

function renderAuthSections(sections) {
  return sections
    .map(
      (section, index) =>
        `<article class="branch-card"><p class="step-number">${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(section)}</h2></article>`,
    )
    .join('');
}

export function renderSocialLoginPage(model) {
  const auth = requireAuth(model);
  const page = auth.pages.socialLogin;
  const providers = auth.flow.providers
    .map(
      (provider) => `<article class="branch-card">
  <h2>${escapeHtml(provider.name)}</h2>
  <p>${escapeHtml(provider.check)}</p>
  <p><strong>${escapeHtml(provider.status)}</strong></p>
</article>`,
    )
    .join('');
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.authSocial, OUTPUT_PATHS.index) }, { label: '기능 흐름' }, { label: 'Social login' }])}
  ${pageHeading('AUTH FEATURE', page.title, page.lede)}
  <section class="branch-grid" aria-label="provider 확인 경계">${providers}</section>
  <section class="concept-grid" aria-label="login 처리 순서">${renderAuthSections(page.sections)}</section>
  <aside class="boundary-note"><strong>확인 필요</strong><p>Google·Kakao의 실제 계정과 live provider 가용성은 이 오프라인 분석에서 실행하지 않았습니다. Apple은 현재 409입니다.</p></aside>
  <a class="evidence-link" href="${sourceHref(OUTPUT_PATHS.authSocial, 'DSM_Back/src/auth/auth.service.ts')}">원본 근거 · auth.service.ts</a>
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.authSocial,
    title: 'Social login',
    currentNav: '기능 흐름',
    body,
  });
}

export function renderRefreshRotationPage(model) {
  const auth = requireAuth(model);
  const page = auth.pages.refreshRotation;
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.authRefresh, OUTPUT_PATHS.index) }, { label: '기능 흐름' }, { label: 'refresh rotation' }])}
  ${pageHeading('AUTH FEATURE', page.title, page.lede)}
  <section class="branch-grid" aria-label="refresh 처리 순서">${renderAuthSections(page.sections)}</section>
  <section class="concept-grid">
    <article><p class="step-number">01</p><h2>단일 승자</h2><p>transaction 안 conditional updateMany의 count가 1인 요청만 replacement를 만듭니다. 경쟁 패자는 401입니다.</p></article>
    <article><p class="step-number">02</p><h2>replacement 실패</h2><p>service spec은 실패 전파를 확인합니다. 실제 PostgreSQL rollback은 mock unit test 범위 밖입니다.</p></article>
    <article><p class="step-number">03</p><h2>logout no-op</h2><p>소유권과 secret이 맞을 때만 revoke합니다. malformed, missing, mismatch는 no-op입니다.</p></article>
  </section>
  <aside class="boundary-note"><strong>isolation 근거 경계</strong><p>현재 refresh callback에는 명시적 isolation option이 없습니다. Task mutation의 transaction 설정을 이 흐름에 옮기지 않습니다.</p></aside>
  <a class="evidence-link" href="${sourceHref(OUTPUT_PATHS.authRefresh, 'DSM_Back/src/auth/auth.service.ts')}">원본 근거 · auth.service.ts</a>
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.authRefresh,
    title: 'refresh rotation',
    currentNav: '기능 흐름',
    body,
  });
}

export function renderJwtSessionPage(model) {
  const auth = requireAuth(model);
  const page = auth.pages.jwtSession;
  const body = `<main id="main" class="page-shell reading-page">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.authConcept, OUTPUT_PATHS.index) }, { label: '개념' }, { label: 'JWT session' }])}
  ${pageHeading('AUTH CONCEPT', page.title, page.lede)}
  <section class="concept-grid">
    <article><p class="step-number">01</p><h2>access · ${escapeHtml(auth.flow.accessTtl)}</h2><p>payload는 sub와 access type을 가지며 guard가 signature와 type을 확인합니다.</p></article>
    <article><p class="step-number">02</p><h2>refresh · ${escapeHtml(auth.flow.refreshTtl)}</h2><p>client는 id와 secret 조합을 받고 DB에는 secret 평문 대신 bcrypt hash가 남습니다.</p></article>
    <article><p class="step-number">03</p><h2>/auth/me</h2><p>현재 응답은 ${escapeHtml(auth.flow.meResponse)} 하나뿐입니다. profile 전체 응답이 아닙니다.</p></article>
  </section>
  <aside class="boundary-note"><strong>배포 전 확인</strong><p>JWT_ACCESS_SECRET은 ConfigService.get으로 읽습니다. 값 누락 시 fail-fast 계약은 별도 확인 대상입니다.</p></aside>
  <a class="evidence-link" href="${sourceHref(OUTPUT_PATHS.authConcept, 'DSM_Back/src/auth/guards/jwt-auth.guard.ts')}">원본 근거 · jwt-auth.guard.ts</a>
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.authConcept,
    title: 'JWT session',
    currentNav: '개념',
    body,
  });
}

function renderAuthFlowSvg() {
  return `<svg class="architecture-svg" viewBox="0 0 1160 650" role="img" aria-labelledby="auth-flow-title auth-flow-desc">
  <title id="auth-flow-title">Auth session login과 refresh 흐름</title>
  <desc id="auth-flow-desc">위쪽 provider login lane과 아래쪽 refresh single-winner lane을 분리해 표시한다.</desc>
  <defs>
    <marker id="auth-arrow-confirmed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="marker-confirmed"/></marker>
    <marker id="auth-arrow-conditional" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" class="marker-conditional"/></marker>
  </defs>
  <g class="diagram-layer" data-diagram-layer>
    <text x="30" y="35" class="diagram-node__sub">LOGIN · provider lane</text>
    <g class="diagram-node"><rect x="30" y="55" width="190" height="72" rx="12"/><text x="125" y="88">POST /auth/login</text><text x="125" y="108" class="diagram-node__sub">DTO validation</text></g>
    <g class="diagram-node diagram-node--conditional"><rect x="280" y="55" width="210" height="72" rx="12"/><text x="385" y="88">provider 확인</text><text x="385" y="108" class="diagram-node__sub">Google · Kakao · Apple 409</text></g>
    <g class="diagram-node"><rect x="550" y="55" width="220" height="72" rx="12"/><text x="660" y="88">socialAccount</text><text x="660" y="108" class="diagram-node__sub">기존 / 신규 user</text></g>
    <g class="diagram-node"><rect x="830" y="55" width="280" height="72" rx="12"/><text x="970" y="88">access + refresh 발급</text><text x="970" y="108" class="diagram-node__sub">15m · 30일</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M220 91 H280" marker-end="url(#auth-arrow-confirmed)"/><path class="diagram-edge diagram-edge--conditional" d="M490 91 H550" marker-end="url(#auth-arrow-conditional)"/><path class="diagram-edge diagram-edge--confirmed" d="M770 91 H830" marker-end="url(#auth-arrow-confirmed)"/>
    <text x="30" y="260" class="diagram-node__sub">ROTATION · refresh lane</text>
    <g class="diagram-node"><rect x="30" y="280" width="190" height="86" rx="12"/><text x="125" y="315">id.secret parse</text><text x="125" y="338" class="diagram-node__sub">PK findUnique</text></g>
    <g class="diagram-node diagram-node--conditional"><rect x="280" y="280" width="210" height="86" rx="12"/><text x="385" y="315">유효성 검사</text><text x="385" y="338" class="diagram-node__sub">revoked · expiry · bcrypt</text></g>
    <g class="diagram-node diagram-node--transaction"><rect x="550" y="280" width="220" height="86" rx="12"/><text x="660" y="315">updateMany</text><text x="660" y="338" class="diagram-node__sub">count === 1</text></g>
    <g class="diagram-node"><rect x="830" y="280" width="280" height="86" rx="12"/><text x="970" y="315">replacement refresh</text><text x="970" y="338" class="diagram-node__sub">단일 승자</text></g>
    <path class="diagram-edge diagram-edge--confirmed" d="M220 323 H280" marker-end="url(#auth-arrow-confirmed)"/><path class="diagram-edge diagram-edge--conditional" d="M490 323 H550" marker-end="url(#auth-arrow-conditional)"/><path class="diagram-edge diagram-edge--confirmed" d="M770 323 H830" marker-end="url(#auth-arrow-confirmed)"/>
    <g class="diagram-node diagram-node--conditional"><rect x="550" y="470" width="220" height="86" rx="12"/><text x="660" y="505">race loser</text><text x="660" y="528" class="diagram-node__sub">401</text></g>
    <path class="diagram-edge diagram-edge--conditional" d="M660 366 V470" marker-end="url(#auth-arrow-conditional)"/>
    <text x="30" y="620" class="diagram-node__sub">확인 필요 · live provider와 실제 DB 통합 동작</text>
  </g>
</svg>`;
}

export function renderAuthDiagramPage(model) {
  const auth = requireAuth(model);
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.authDiagram, OUTPUT_PATHS.index) }, { label: '다이어그램' }, { label: 'Auth session' }])}
  ${pageHeading('ZOOMABLE AUTH DIAGRAM', auth.flow.title, 'provider login과 refresh single-winner rotation을 서로 다른 lane에서 읽습니다.')}
  <div class="diagram-toolbar" aria-label="다이어그램 조작"><button type="button" data-diagram-zoom="out" aria-label="축소">−</button><button type="button" data-diagram-reset>원래 크기</button><button type="button" data-diagram-zoom="in" aria-label="확대">+</button></div>
  <div class="diagram-viewport" data-diagram-viewport tabindex="0" aria-label="Auth session 흐름 다이어그램. 방향키로 이동">${renderAuthFlowSvg()}</div>
  ${renderEvidenceLegend()}
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.authDiagram,
    title: 'Auth session 다이어그램',
    currentNav: '아키텍처',
    body,
  });
}

export function renderAuthExercisePage(model) {
  const auth = requireAuth(model);
  const exercises = auth.exercises
    .map((exercise, index) => {
      const sources = exercise.sourcePaths
        .map(
          (sourcePath) =>
            `<a href="${sourceHref(OUTPUT_PATHS.authExercise, sourcePath)}">${escapeHtml(sourcePath)}</a>`,
        )
        .join('');
      return `<article class="exercise-card"><div class="exercise-card__meta"><span>${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(exercise.difficulty)}</span><span>${escapeHtml(exercise.type)}</span></div><h2>${escapeHtml(exercise.question)}</h2><div class="exercise-sources">${sources}</div><details><summary>답과 해설 보기</summary><p>${escapeHtml(exercise.answer)}</p></details></article>`;
    })
    .join('');
  const body = `<main id="main" class="page-shell">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(OUTPUT_PATHS.authExercise, OUTPUT_PATHS.index) }, { label: '연습' }, { label: 'Auth session' }])}
  ${pageHeading('AUTH PRACTICE LAB', 'login과 rotation의 증거 경계 다시 그리기', '답은 접혀 있습니다. source와 mock test가 보장하는 범위를 먼저 구분하세요.')}
  <section class="exercise-grid">${exercises}</section>
</main>`;
  return renderDocument({
    outputPath: OUTPUT_PATHS.authExercise,
    title: 'Auth session 연습',
    currentNav: '연습',
    body,
  });
}

function renderGuideEvidence(outputPath, guide) {
  return guide.evidence.map((item) => `<li><a href="${sourceHref(outputPath, item.path, '#source-title')}">${escapeHtml(item.path)}${item.symbol ? ` · ${escapeHtml(item.symbol)}` : ''}</a><span>${escapeHtml(item.claim)}</span></li>`).join('');
}

function renderRelated(outputPath, paths) {
  return paths.map((sourcePath) => `<li><a href="${sourceHref(outputPath, sourcePath)}">${escapeHtml(sourcePath)}</a></li>`).join('');
}

export function renderFilePage(model, sourcePath) {
  const record = model.records.find((item) => item.path === sourcePath);
  const guide = model.guides[sourcePath];
  if (!record) throw new Error(`SOURCE_RECORD_MISSING:${sourcePath}`);
  if (!guide) throw new Error(`FILE_GUIDE_MISSING:${sourcePath}`);

  const outputPath = record.outputPath ?? fileOutputPath(sourcePath);
  const learningOrder = model.learningOrder ?? model.records
    .filter((item) => item.status === 'processed')
    .map((item) => item.path);
  const orderIndex = learningOrder.indexOf(sourcePath);
  const previousPath = orderIndex > 0 ? learningOrder[orderIndex - 1] : null;
  const nextPath = orderIndex >= 0 && orderIndex < learningOrder.length - 1
    ? learningOrder[orderIndex + 1]
    : null;
  const classification = guide.classification === 'core' ? '핵심 파일' : '보조 파일';
  const symbols = record.symbols.length > 0
    ? record.symbols.map((symbol) => `<li><a href="#source-title">${escapeHtml(symbol.kind)} · ${escapeHtml(symbol.name)} <span>line ${symbol.line}</span></a></li>`).join('')
    : '<li>추출된 class/function symbol 없음</li>';
  const allExercises = [
    ...model.exercises,
    ...(model.auth?.exercises ?? []),
  ];
  const exerciseItems = guide.exercises.map((exerciseId) => allExercises.find((item) => item.id === exerciseId)).filter(Boolean).map((exercise) => `<details><summary>${escapeHtml(exercise.question)}</summary><p>${escapeHtml(exercise.answer)}</p></details>`).join('');
  const bottomPrevious = previousPath ? `<a href="${sourceHref(outputPath, previousPath)}">이전</a>` : '<span aria-disabled="true">이전</span>';
  const bottomNext = nextPath ? `<a href="${sourceHref(outputPath, nextPath)}">다음</a>` : '<span aria-disabled="true">다음</span>';

  const body = `<main id="main" class="file-page" data-file-page data-source-path="${escapeHtml(sourcePath)}">
  ${renderBreadcrumbs([{ label: '프로젝트 지도', href: href(outputPath, OUTPUT_PATHS.index) }, { label: '파일', href: href(outputPath, OUTPUT_PATHS.index, '#files') }, { label: sourcePath }])}
  <header class="file-heading">
    <div><p class="eyebrow">SOURCE STUDY</p><h1>${escapeHtml(sourcePath.split('/').at(-1))}</h1><p class="file-path">${escapeHtml(sourcePath)}</p></div>
    <div class="file-heading__actions"><p class="file-meta">${escapeHtml(record.language)} · ${record.lineCount}줄 · ${classification}</p><button class="icon-button desktop-read-toggle" type="button" data-read-toggle>읽음</button></div>
  </header>
  <nav class="file-tabs" aria-label="파일 학습 탭"><button type="button" data-file-tab="child">12세 설명</button><button type="button" data-file-tab="junior" aria-selected="true">주니어 설명</button><button type="button" data-file-tab="source">원본 코드</button><button type="button" data-file-tab="risk">위험·확인</button><button type="button" data-file-tab="exercise">연습</button></nav>
  <div class="mobile-mode" aria-label="모바일 학습 화면"><button type="button" data-mobile-mode="code" aria-pressed="true">코드</button><button type="button" data-mobile-mode="explanation" aria-pressed="false">설명</button><button type="button" data-contents-open>이 파일에서 볼 것</button></div>
  <aside class="contents-sheet" data-contents-sheet hidden><button type="button" data-contents-close>접기</button><h2>이 파일에서 볼 것</h2><ul>${guide.focus.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>
  <section class="file-overview" aria-labelledby="position-role"><h2 id="position-role">A. 위치와 역할</h2><p>${escapeHtml(guide.role)}</p><dl><div><dt>SHA-256</dt><dd><code>${record.sha256}</code></dd></div><div><dt>bytes</dt><dd>${record.bytes}</dd></div><div><dt>line ending</dt><dd>${record.lineEnding}</dd></div></dl></section>
  <section class="focus-card" aria-labelledby="focus-title"><h2 id="focus-title">B. 먼저 볼 것</h2><ul>${guide.focus.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><div class="symbol-index"><h3>심볼</h3><ul>${symbols}</ul></div></section>
  <div class="file-study">
    <div class="file-study__code" data-mobile-panel="code"><h2 class="visually-hidden">C. 원본 코드</h2>${renderSourcePanel(record)}</div>
    <aside class="explanation-panel" data-mobile-panel="explanation" aria-labelledby="explanation-title">
      <div class="panel-label">${model.copy.explanationLabel}</div>
      <h2 id="explanation-title">D. 설명</h2>
      <section data-explanation="child"><h3>12세 설명</h3><p>${escapeHtml(guide.childExplanation)}</p></section>
      <section data-explanation="junior"><h3>주니어 설명</h3><p>${escapeHtml(guide.juniorExplanation)}</p></section>
      <section><h2>E. 관계와 근거</h2><ul class="evidence-list">${renderGuideEvidence(outputPath, guide)}</ul></section>
      <section><h2>F. 위험·확인</h2><ul>${guide.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul></section>
      <section><h2>G. 연습과 다음 단계</h2>${exerciseItems}<h3>관련 파일</h3><ul>${renderRelated(outputPath, guide.related)}</ul></section>
    </aside>
  </div>
  <nav class="mobile-progress" aria-label="파일 진행">${bottomPrevious}<button type="button" data-read-toggle>읽음</button>${bottomNext}</nav>
</main>`;
  return renderDocument({ outputPath, title: sourcePath.split('/').at(-1), currentNav: '파일', body, description: `${sourcePath} 원본과 학습 설명` });
}

export { OUTPUT_PATHS };
