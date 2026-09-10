import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeRenderedCode,
  renderDocument,
  renderEvidenceLegend,
  renderSourcePanel,
} from '../lib/render.mjs';

test('renders hostile-looking source without executable markup', () => {
  const source = '</code><script>alert("x")</script> & <Task>\r\n';
  const html = renderSourcePanel({
    path: 'DSM_Back/example.ts',
    language: 'TypeScript',
    text: source,
    bytes: Buffer.byteLength(source),
    sha256: 'a'.repeat(64),
    lineCount: 1,
    lineEnding: 'CRLF',
    symbols: [],
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;\/code&gt;/);
  assert.equal(decodeRenderedCode(html), source);
});

test('document shell uses depth-correct local assets and semantic fallbacks', () => {
  const rootHtml = renderDocument({
    outputPath: 'index.html',
    title: '지도',
    currentNav: '프로젝트 지도',
    body: '<main id="main">ok</main>',
  });
  const nestedHtml = renderDocument({
    outputPath: 'files/DSM_Back/src/main.ts.html',
    title: 'main.ts',
    currentNav: '파일',
    body: '<main id="main">ok</main>',
  });

  assert.match(rootHtml, /\.\/assets\/site\.css/);
  assert.match(nestedHtml, /\.\.\/\.\.\/\.\.\/assets\/site\.css/);
  assert.doesNotMatch(rootHtml, /https?:\/\//);
  assert.match(rootHtml, /<noscript>/);
  assert.match(rootHtml, /본문으로 건너뛰기/);
  assert.match(rootHtml, /aria-label="주 탐색"/);
});

test('evidence legend includes text and line-style labels', () => {
  const html = renderEvidenceLegend();

  assert.match(html, /확인됨/);
  assert.match(html, /조건부 확인/);
  assert.match(html, /추론/);
  assert.match(html, /확인 필요/);
});
