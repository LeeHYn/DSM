import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('contains approved tokens and responsive contracts', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );
  const uppercase = css.toUpperCase();

  for (const token of [
    '#FFFFFF',
    '#101827',
    '#0B1020',
    '#B9F34A',
    '#F2A93B',
  ]) {
    assert.match(uppercase, new RegExp(token));
  }
  assert.match(
    css,
    /grid-template-columns:\s*minmax\(0,\s*62fr\)\s+minmax\(0,\s*38fr\)/,
  );
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
});

test('keeps source readable and mobile panels explicit', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /white-space:\s*pre/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /data-mobile-panel/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /:focus-visible/);
});

test('styles the exact classes emitted by page and source renderers', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  for (const selector of [
    '.hero__copy',
    '.hero__actions',
    '.hero__note',
    '.map-edge--confirmed',
    '.map-edge--unknown',
    '.path-node--confirmed',
    '.path-node--conditional',
    '.status-badge--ready',
    '.evidence-line--confirmed',
    '.evidence-line--conditional',
    '.source-panel__head',
    '.line-numbers',
    '.mobile-mode',
    '.diagram-node--conditional',
    '.diagram-edge--conditional',
  ]) {
    assert.ok(css.includes(selector), `missing CSS selector ${selector}`);
  }
});

test('keeps runtime-controlled hidden regions out of layout', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
});

test('separates search metadata and scopes desktop read controls', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.search-result small\s*\{[^}]*display:\s*block/s);
  assert.ok(css.includes('.file-heading__actions'));
  assert.ok(css.includes('.desktop-read-toggle'));
});

test('renders mobile explanation and contents as bottom sheets', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /data-active-mobile-panel="explanation"[^}]*data-mobile-panel="explanation"[^}]*\{[^}]*position:\s*fixed/s,
  );
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.contents-sheet\s*\{[^}]*position:\s*fixed/s);
});

test('balances long Korean page headings without orphan characters', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.page-heading h1\s*\{[^}]*max-width:\s*22ch[^}]*text-wrap:\s*balance[^}]*word-break:\s*keep-all/s,
  );
});

test('keeps long exercise source paths inside their cards', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.exercise-sources\s*\{[^}]*display:\s*grid[^}]*gap:\s*var\(--space-1\)/s,
  );
  assert.match(
    css,
    /\.exercise-sources a\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s,
  );
});

test('wraps unbroken source hashes inside the file overview', async () => {
  const css = await readFile(
    new URL('../assets/site.css', import.meta.url),
    'utf8',
  );

  assert.match(
    css,
    /\.file-overview code\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-all/s,
  );
});
