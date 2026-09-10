import { SITE_COPY } from '../content/pilot-a.mjs';
import { relativeHref } from './paths.mjs';
import { tokenizeSource } from './syntax.mjs';

const NAV_TARGETS = Object.freeze({
  '프로젝트 지도': 'index.html',
  아키텍처: 'architecture.html',
  개념: 'concepts/serializable-transaction.html',
  '기능 흐름': 'features/task-score-schedule.html',
  파일: 'index.html#files',
  연습: 'exercises/task-flow.html',
});

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hrefFrom(outputPath, target) {
  const hashIndex = target.indexOf('#');
  const targetPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : target.slice(hashIndex);
  return `${relativeHref(outputPath, targetPath)}${hash}`;
}

function renderNav(outputPath, currentNav) {
  return SITE_COPY.nav
    .map((label) => {
      const current = label === currentNav ? ' aria-current="page"' : '';
      return `<a class="nav-link" href="${escapeHtml(hrefFrom(outputPath, NAV_TARGETS[label]))}"${current}>${escapeHtml(label)}</a>`;
    })
    .join('');
}

export function renderDocument({
  outputPath,
  title,
  currentNav,
  body,
  description = 'DSM 원본 소스를 근거로 학습하는 오프라인 사이트',
}) {
  const cssHref = relativeHref(outputPath, 'assets/site.css');
  const dataHref = relativeHref(outputPath, 'assets/site-data.js');
  const scriptHref = relativeHref(outputPath, 'assets/site.js');
  const homeHref = relativeHref(outputPath, 'index.html');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} · ${SITE_COPY.brand}</title>
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
</head>
<body>
  <a class="skip-link" href="#main">본문으로 건너뛰기</a>
  <header class="site-header">
    <a class="brand" href="${escapeHtml(homeHref)}" aria-label="DSM 학습 지도 홈">${SITE_COPY.brand}</a>
    <nav class="primary-nav" aria-label="주 탐색">${renderNav(outputPath, currentNav)}</nav>
    <div class="header-actions">
      <button class="icon-button" type="button" data-search-open aria-label="검색 열기">검색</button>
      <button class="icon-button" type="button" data-theme-toggle aria-label="다크 모드 전환">다크 모드</button>
    </div>
  </header>
  <section class="search-panel" data-search-panel hidden aria-label="사이트 검색">
    <label for="global-search">${SITE_COPY.searchHint}</label>
    <input id="global-search" type="search" placeholder="${SITE_COPY.searchHint}" autocomplete="off" data-search-input>
    <div class="search-filters" data-search-filters></div>
    <div class="search-results" data-search-results aria-live="polite"></div>
  </section>
  <div class="runtime-notice" data-runtime-notice aria-live="polite"></div>
  ${body}
  <noscript><p class="noscript-note">JavaScript 없이도 원본 코드와 기본 탐색을 읽을 수 있습니다. 검색과 읽음 상태 저장은 사용할 수 없습니다.</p></noscript>
  <footer class="site-footer"><p>${SITE_COPY.scope}</p><a href="${escapeHtml(homeHref)}">프로젝트 지도</a></footer>
  <script src="${escapeHtml(dataHref)}" defer></script>
  <script src="${escapeHtml(scriptHref)}" defer></script>
</body>
</html>`;
}

export function renderSourcePanel(record) {
  const tokenHtml = tokenizeSource(record.text, record.language)
    .map(
      ({ type, text }) =>
        `<span class="tok tok--${type}">${escapeHtml(text)}</span>`,
    )
    .join('');
  const numbers = Array.from(
    { length: record.lineCount },
    (_, index) => index + 1,
  ).join('\n');
  return `<section class="source-panel" aria-labelledby="source-title">
  <div class="source-panel__head">
    <h2 id="source-title">${SITE_COPY.sourceLabel}</h2>
    <button type="button" data-copy-source>원본 코드 복사</button>
  </div>
  <div class="source-grid">
    <span class="line-numbers" aria-hidden="true">${numbers}</span>
    <pre><code data-source-code data-path="${escapeHtml(record.path)}" data-sha256="${escapeHtml(record.sha256)}" data-bytes="${record.bytes}" data-lines="${record.lineCount}" data-line-ending="${escapeHtml(record.lineEnding)}">${tokenHtml}</code></pre>
  </div>
</section>`;
}

export function decodeRenderedCode(html) {
  const match = /<code\s+data-source-code\b[^>]*>([\s\S]*?)<\/code>/.exec(html);
  if (!match) throw new Error('SOURCE_CODE_REGION_MISSING');
  return match[1]
    .replace(/<span class="tok tok--[a-z-]+">/g, '')
    .replaceAll('</span>', '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

export function renderEvidenceLegend() {
  return `<section class="evidence-legend" aria-labelledby="evidence-title">
  <h2 id="evidence-title">관계 근거 범례</h2>
  <ul>
    <li><span class="evidence-line evidence-line--confirmed" aria-hidden="true"></span><strong>확인됨</strong> · 원본 호출·쓰기 근거</li>
    <li><span class="evidence-line evidence-line--conditional" aria-hidden="true"></span><strong>조건부 확인</strong> · 조건 label이 있는 원본 근거</li>
    <li><span class="evidence-line evidence-line--inferred" aria-hidden="true"></span><strong>추론</strong> · 근거와 추론 이유 표시</li>
    <li><span class="evidence-line evidence-line--unknown" aria-hidden="true"></span><strong>확인 필요</strong> · 아직 확정하지 않은 관계</li>
  </ul>
</section>`;
}

export function renderBreadcrumbs(items) {
  const content = items
    .map((item, index) => {
      const label = escapeHtml(item.label);
      const value = item.href
        ? `<a href="${escapeHtml(item.href)}">${label}</a>`
        : `<span aria-current="page">${label}</span>`;
      return `<li>${value}${index < items.length - 1 ? '<span aria-hidden="true">/</span>' : ''}</li>`;
    })
    .join('');
  return `<nav class="breadcrumbs" aria-label="현재 위치"><ol>${content}</ol></nav>`;
}
