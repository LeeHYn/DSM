import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORPUS_BASELINE,
  PILOT_A_PATHS,
  PUBLIC_EXCLUSIONS,
  isApplicationSource,
  pathsForBatch,
} from './manifest.mjs';
import { fileOutputPath } from './lib/paths.mjs';
import {
  detectLineEnding,
  logicalLineCount,
  readSourceRecord,
} from './lib/source.mjs';

const BASE_REQUIRED_SITE_PATHS = Object.freeze([
  'index.html',
  'architecture.html',
  'concepts/serializable-transaction.html',
  'features/task-score-schedule.html',
  'exercises/task-flow.html',
  'diagrams/task-update-flow.html',
  'assets/site.css',
  'assets/site.js',
  'assets/site-data.js',
]);
const AUTH_REQUIRED_SITE_PATHS = Object.freeze([
  'features/social-login.html',
  'features/refresh-rotation.html',
  'concepts/jwt-session.html',
  'exercises/auth-session.html',
  'diagrams/auth-session-flow.html',
]);

function requiredSitePaths(batch) {
  const sourcePaths = pathsForBatch(batch);
  return Object.freeze([
    ...BASE_REQUIRED_SITE_PATHS,
    ...(batch === 'batch-b' ? AUTH_REQUIRED_SITE_PATHS : []),
    ...sourcePaths.map(fileOutputPath),
  ]);
}

function decodeHtmlEntitiesOnce(value) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    '#39': "'",
  };
  return String(value).replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, entity) => entities[entity],
  );
}

function parseAttributes(source) {
  const attributes = {};
  const expression = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(expression)) {
    attributes[match[1]] = decodeHtmlEntitiesOnce(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

export function extractRenderedSource(html) {
  const matches = Array.from(
    String(html).matchAll(
      /<code\s+([^>]*\bdata-source-code\b[^>]*)>([\s\S]*?)<\/code>/gi,
    ),
  );
  if (matches.length === 0) throw new Error('SOURCE_CODE_REGION_MISSING');
  if (matches.length !== 1) throw new Error('SOURCE_CODE_REGION_DUPLICATE');

  const attributes = parseAttributes(matches[0][1]);
  const encodedText = matches[0][2]
    .replace(/<span\s+class="tok tok--[a-z-]+">/g, '')
    .replaceAll('</span>', '');
  if (/<\/?[A-Za-z][^>]*>/.test(encodedText)) {
    throw new Error('SOURCE_CODE_UNEXPECTED_MARKUP');
  }

  return Object.freeze({
    path: attributes['data-path'],
    sha256: attributes['data-sha256'],
    bytes: Number(attributes['data-bytes']),
    lines: Number(attributes['data-lines']),
    lineEnding: attributes['data-line-ending'],
    text: decodeHtmlEntitiesOnce(encodedText),
  });
}

function withoutPreservedSource(html) {
  return String(html).replace(
    /<code\s+[^>]*\bdata-source-code\b[^>]*>[\s\S]*?<\/code>/gi,
    '<code data-source-code></code>',
  );
}

function visibleTextOutsideSource(html) {
  return decodeHtmlEntitiesOnce(
    withoutPreservedSource(html).replace(/<[^>]+>/g, ' '),
  );
}

function assertNoFixtureTokenText(html, label) {
  const fixtureTokens = new Set([
    'google-id-token',
    'access-token',
    'refresh-token',
    'user-uuid-1',
  ]);
  const exposed = visibleTextOutsideSource(html)
    .split(/\s+/)
    .map((value) => value.replace(/^[([{'"]+|[\])},'";:!?]+$/g, ''))
    .some((value) => fixtureTokens.has(value));
  if (exposed) {
    throw new Error(`AUTH_FIXTURE_TOKEN_EXPOSED:${label}`);
  }
}

function assertNoFixtureTokenData(script, label) {
  if (
    /"(?:google-id-token|access-token|refresh-token|user-uuid-1)"/.test(
      String(script),
    )
  ) {
    throw new Error(`AUTH_FIXTURE_TOKEN_EXPOSED:${label}`);
  }
}

function assertOfflineText(text, label) {
  const scoped = withoutPreservedSource(text);
  if (/\b(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i.test(scoped)) {
    throw new Error(`REMOTE_DEPENDENCY:${label}:href-src`);
  }
  if (/@import\s+(?:url\s*\()?\s*["']?(?:https?:)?\/\//i.test(scoped)) {
    throw new Error(`REMOTE_DEPENDENCY:${label}:css-import`);
  }
  if (/url\s*\(\s*["']?(?:https?:)?\/\//i.test(scoped)) {
    throw new Error(`REMOTE_DEPENDENCY:${label}:css-url`);
  }
  if (/\bfetch\s*\(/.test(scoped)) {
    throw new Error(`NETWORK_RUNTIME:${label}:fetch`);
  }
  if (/\bXMLHttpRequest\b/.test(scoped)) {
    throw new Error(`NETWORK_RUNTIME:${label}:xhr`);
  }
  if (/\bimport\s*\(/.test(scoped)) {
    throw new Error(`NETWORK_RUNTIME:${label}:dynamic-import`);
  }
}

export async function verifyOfflineHtml(html) {
  assertOfflineText(html, 'html');
  return true;
}

function digestUtf8(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

export async function verifySourcePage({ rootDir, outputDir, sourcePath }) {
  const relativeOutputPath = fileOutputPath(sourcePath);
  const html = await readFile(
    path.join(outputDir, ...relativeOutputPath.split('/')),
    'utf8',
  );
  const rendered = extractRenderedSource(html);
  const source = await readSourceRecord(rootDir, sourcePath);

  if (rendered.path !== sourcePath) {
    throw new Error(`SOURCE_PATH_MISMATCH:${sourcePath}`);
  }
  if (rendered.text !== source.text) {
    throw new Error(`SOURCE_TEXT_MISMATCH:${sourcePath}`);
  }
  const renderedDigest = digestUtf8(rendered.text);
  if (rendered.sha256 !== source.sha256 || renderedDigest !== source.sha256) {
    throw new Error(`SOURCE_SHA_MISMATCH:${sourcePath}`);
  }
  if (
    rendered.bytes !== source.bytes ||
    Buffer.byteLength(rendered.text, 'utf8') !== source.bytes
  ) {
    throw new Error(`SOURCE_BYTES_MISMATCH:${sourcePath}`);
  }
  if (
    rendered.lines !== source.lineCount ||
    logicalLineCount(rendered.text) !== source.lineCount
  ) {
    throw new Error(`SOURCE_LINES_MISMATCH:${sourcePath}`);
  }
  if (
    rendered.lineEnding !== source.lineEnding ||
    detectLineEnding(rendered.text) !== source.lineEnding
  ) {
    throw new Error(`SOURCE_LINE_ENDING_MISMATCH:${sourcePath}`);
  }
  await verifyOfflineHtml(html);

  return Object.freeze({
    path: sourcePath,
    outputPath: relativeOutputPath,
    sha256: source.sha256,
    bytes: source.bytes,
    lines: source.lineCount,
    lineEnding: source.lineEnding,
  });
}

async function collectFiles(directory, relativeDirectory = '') {
  const absoluteDirectory = relativeDirectory
    ? path.join(directory, ...relativeDirectory.split('/'))
    : directory;
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const output = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      output.push(...await collectFiles(directory, relativePath));
    } else if (entry.isFile()) {
      output.push(relativePath);
    }
  }
  return output;
}

function isExternalOrSpecialReference(reference) {
  return /^(?:data:|mailto:|tel:|javascript:)/i.test(reference);
}

function normalizeReference(reference) {
  try {
    return decodeURI(reference);
  } catch (_) {
    throw new Error(`BROKEN_LINK_ENCODING:${reference}`);
  }
}

function idsInHtml(html) {
  const ids = new Set();
  for (const match of String(html).matchAll(/\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    ids.add(decodeHtmlEntitiesOnce(match[1] ?? match[2]));
  }
  return ids;
}

function insideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function verifyLocalLinks(outputDir) {
  const root = path.resolve(outputDir);
  const files = await collectFiles(root);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const htmlCache = new Map();
  let checked = 0;

  async function loadHtml(relativePath) {
    if (!htmlCache.has(relativePath)) {
      htmlCache.set(
        relativePath,
        await readFile(path.join(root, ...relativePath.split('/')), 'utf8'),
      );
    }
    return htmlCache.get(relativePath);
  }

  for (const sourceFile of htmlFiles) {
    const html = await loadHtml(sourceFile);
    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const rawReference = decodeHtmlEntitiesOnce(match[1] ?? match[2] ?? '').trim();
      if (!rawReference || isExternalOrSpecialReference(rawReference)) continue;
      if (/^(?:https?:)?\/\//i.test(rawReference)) {
        throw new Error(`REMOTE_DEPENDENCY:${sourceFile}:${rawReference}`);
      }

      const normalized = normalizeReference(rawReference);
      const hashIndex = normalized.indexOf('#');
      const withoutHash = hashIndex === -1 ? normalized : normalized.slice(0, hashIndex);
      const fragment = hashIndex === -1 ? '' : normalized.slice(hashIndex + 1);
      const withoutQuery = withoutHash.split('?')[0];
      const sourceDirectory = path.dirname(path.join(root, ...sourceFile.split('/')));
      let destination = withoutQuery
        ? path.resolve(sourceDirectory, ...withoutQuery.replaceAll('\\', '/').split('/'))
        : path.join(root, ...sourceFile.split('/'));
      if (!insideDirectory(root, destination)) {
        throw new Error(`BROKEN_LINK_OUTSIDE_ROOT:${sourceFile}:${rawReference}`);
      }
      try {
        const destinationStat = await stat(destination);
        if (destinationStat.isDirectory()) destination = path.join(destination, 'index.html');
        await access(destination);
      } catch (_) {
        throw new Error(`BROKEN_LINK:${sourceFile}:${rawReference}`);
      }
      checked += 1;

      if (fragment) {
        if (path.extname(destination).toLowerCase() !== '.html') {
          throw new Error(`BROKEN_FRAGMENT:${sourceFile}:${rawReference}`);
        }
        const destinationRelative = path
          .relative(root, destination)
          .split(path.sep)
          .join('/');
        let decodedFragment;
        try {
          decodedFragment = decodeURIComponent(fragment);
        } catch (_) {
          throw new Error(`BROKEN_FRAGMENT_ENCODING:${sourceFile}:${rawReference}`);
        }
        if (!idsInHtml(await loadHtml(destinationRelative)).has(decodedFragment)) {
          throw new Error(`BROKEN_FRAGMENT:${sourceFile}:${rawReference}`);
        }
      }
    }
  }
  return Object.freeze({ checked, htmlFiles: htmlFiles.length });
}

function parseRuntimeData(script) {
  const match = /^globalThis\.DSM_LEARNING_DATA\s*=\s*Object\.freeze\((\{[\s\S]*\})\);\s*$/.exec(
    String(script).trim(),
  );
  if (!match) throw new Error('SITE_DATA_FORMAT_INVALID');
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error('SITE_DATA_JSON_INVALID', { cause: error });
  }
}

function assertIncludes(html, values, label) {
  for (const value of values) {
    if (!html.includes(value)) throw new Error(`REQUIRED_COPY_MISSING:${label}:${value}`);
  }
}

function assertProgressAndSearch(data, batch) {
  if (!data || !Array.isArray(data.records)) throw new Error('SITE_DATA_RECORDS_MISSING');
  if (data.records.length !== CORPUS_BASELINE.files) {
    throw new Error(`SEARCH_COUNT_MISMATCH:${data.records.length}`);
  }
  const paths = new Set();
  for (const record of data.records) {
    if (paths.has(record.path)) throw new Error(`SEARCH_DUPLICATE_PATH:${record.path}`);
    paths.add(record.path);
    if (!isApplicationSource(record.path)) {
      throw new Error(`SEARCH_PATH_OUTSIDE_CORPUS:${record.path}`);
    }
    if (record.path.endsWith('/.env') || record.path === 'DSM_Back/.env') {
      throw new Error('SENSITIVE_PATH_EXPOSED:DSM_Back/.env');
    }
    if (record.reviewRequired && record.symbols.length !== 0) {
      throw new Error(`REVIEW_SYMBOLS_EXPOSED:${record.path}`);
    }
    if (record.status === 'remaining' && record.outputPath !== null) {
      throw new Error(`REMAINING_OUTPUT_LINKED:${record.path}`);
    }
  }

  const processedPaths = data.records
    .filter((record) => record.status === 'processed')
    .map((record) => record.path)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const expectedProcessed = [...pathsForBatch(batch)]
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (JSON.stringify(processedPaths) !== JSON.stringify(expectedProcessed)) {
    throw new Error('PROCESSED_MEMBERSHIP_MISMATCH');
  }
  const expectedProcessedCount = expectedProcessed.length;
  if (
    data.progress?.processed !== expectedProcessedCount ||
    data.progress?.remaining !== CORPUS_BASELINE.files - expectedProcessedCount ||
    data.progress?.missing !== 0
  ) {
    throw new Error('PROGRESS_MISMATCH');
  }

  if (!Array.isArray(data.exclusions)) throw new Error('EXCLUSIONS_MISSING');
  for (const exclusion of data.exclusions) {
    const keys = Object.keys(exclusion).sort().join(',');
    if (keys !== 'path,reason') throw new Error(`EXCLUSION_METADATA_INVALID:${keys}`);
  }
  const publicExcludedPaths = [...PUBLIC_EXCLUSIONS]
    .map((item) => item.path)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const runtimeExcludedPaths = data.exclusions
    .map((item) => item.path)
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (JSON.stringify(publicExcludedPaths) !== JSON.stringify(runtimeExcludedPaths)) {
    throw new Error('EXCLUSION_MEMBERSHIP_MISMATCH');
  }
}

async function assertRequiredFiles(outputDir, batch) {
  const allFiles = await collectFiles(outputDir);
  const fileSet = new Set(allFiles);
  for (const requiredPath of requiredSitePaths(batch)) {
    if (!fileSet.has(requiredPath)) throw new Error(`REQUIRED_OUTPUT_MISSING:${requiredPath}`);
  }
  const sourcePages = allFiles.filter((file) => file.startsWith('files/') && file.endsWith('.html'));
  const expectedSources = pathsForBatch(batch).length;
  if (sourcePages.length !== expectedSources) {
    throw new Error(`SOURCE_PAGE_COUNT_MISMATCH:${sourcePages.length}`);
  }
  const htmlPages = allFiles.filter((file) => file.endsWith('.html'));
  const expectedHtml = batch === 'batch-b' ? 39 : 21;
  if (htmlPages.length !== expectedHtml) {
    throw new Error(`HTML_PAGE_COUNT_MISMATCH:${htmlPages.length}`);
  }
  if (sourcePages.some((file) => /(?:^|\/)\.env(?:\.|\/|$)/.test(file))) {
    throw new Error('SENSITIVE_PAGE_EXPOSED');
  }
  return allFiles;
}

function diagramRegion(html) {
  const match = /<svg\s+class="architecture-svg"[\s\S]*?<\/svg>/.exec(html);
  if (!match) throw new Error('ARCHITECTURE_DIAGRAM_MISSING');
  return match[0];
}

async function verifyRequiredCopy(outputDir, batch) {
  const index = await readFile(path.join(outputDir, 'index.html'), 'utf8');
  const architecture = await readFile(path.join(outputDir, 'architecture.html'), 'utf8');
  const diagram = await readFile(
    path.join(outputDir, 'diagrams', 'task-update-flow.html'),
    'utf8',
  );
  assertIncludes(index, ['124개 파일 · 13,168줄 · 오프라인', '후속 배치'], 'index');
  assertIncludes(
    architecture,
    ['PATCH /tasks/:id', 'Serializable', '일정 변경 시', '확인 필요'],
    'architecture',
  );
  for (const [label, html] of [['architecture', architecture], ['diagram', diagram]]) {
    const svg = diagramRegion(html);
    if (svg.includes('NotificationsService')) {
      throw new Error(`FALSE_TASK_NOTIFICATION_EDGE:${label}`);
    }
    if (svg.includes('FCM send')) throw new Error(`FALSE_FCM_SEND_NODE:${label}`);
  }

  const anatomy = [
    'A. 위치와 역할',
    'B. 먼저 볼 것',
    'C. 원본 코드',
    'D. 설명',
    'E. 관계와 근거',
    'F. 위험·확인',
    'G. 연습과 다음 단계',
  ];
  const representative = await readFile(
    path.join(outputDir, ...fileOutputPath(PILOT_A_PATHS[0]).split('/')),
    'utf8',
  );
  assertIncludes(representative, anatomy, 'file-anatomy');

  if (batch === 'batch-b') {
    const authRequiredCopy = Object.freeze({
      'features/social-login.html': [
        'Google',
        'Kakao',
        'Apple',
        '409',
        '확인 필요',
      ],
      'features/refresh-rotation.html': [
        'updateMany',
        '단일 승자',
        'no-op',
        '실제 PostgreSQL',
      ],
      'concepts/jwt-session.html': ['15m', '30일', '{ userId }', 'get'],
      'diagrams/auth-session-flow.html': [
        'data-diagram-viewport',
        'provider',
        'refresh',
      ],
      'exercises/auth-session.html': ['답과 해설 보기', 'mock'],
    });
    for (const [relativePath, requiredCopy] of Object.entries(authRequiredCopy)) {
      const html = await readFile(
        path.join(outputDir, ...relativePath.split('/')),
        'utf8',
      );
      assertIncludes(html, requiredCopy, relativePath);
      if (/\bSerializable\b/.test(visibleTextOutsideSource(html))) {
        throw new Error(`FALSE_AUTH_SERIALIZABLE_CLAIM:${relativePath}`);
      }
    }
  }
}

export async function verifySite({ rootDir, outputDir, batch = 'pilot-a' }) {
  const allFiles = await assertRequiredFiles(outputDir, batch);
  const dataScript = await readFile(path.join(outputDir, 'assets', 'site-data.js'), 'utf8');
  const data = parseRuntimeData(dataScript);
  assertProgressAndSearch(data, batch);
  assertNoFixtureTokenData(dataScript, 'assets/site-data.js');

  const sourceReports = [];
  for (const sourcePath of pathsForBatch(batch)) {
    sourceReports.push(await verifySourcePage({ rootDir, outputDir, sourcePath }));
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
  for (const htmlFile of htmlFiles) {
    const html = await readFile(path.join(outputDir, ...htmlFile.split('/')), 'utf8');
    await verifyOfflineHtml(html);
    assertNoFixtureTokenText(html, htmlFile);
  }
  for (const assetPath of ['assets/site.css', 'assets/site.js']) {
    assertOfflineText(
      await readFile(path.join(outputDir, ...assetPath.split('/')), 'utf8'),
      assetPath,
    );
  }

  const links = await verifyLocalLinks(outputDir);
  await verifyRequiredCopy(outputDir, batch);
  sourceReports.sort((left, right) => left.path.localeCompare(right.path, 'en'));

  return Object.freeze({
    status: 'PASS',
    baseline: stableCopy(CORPUS_BASELINE),
    checks: Object.freeze({
      links: 'PASS',
      offline: 'PASS',
      progress: 'PASS',
      search: 'PASS',
      sourceFidelity: 'PASS',
    }),
    linkCount: links.checked,
    pages: htmlFiles.length,
    progress: Object.freeze({
      processed: data.progress.processed,
      remaining: data.progress.remaining,
      missing: data.progress.missing,
      excluded: data.exclusions.length,
    }),
    sources: Object.freeze(sourceReports),
  });
}

function stableCopy(value) {
  if (Array.isArray(value)) return value.map(stableCopy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, stableCopy(value[key])]),
    );
  }
  return value;
}

async function writeReport(reportPath, report) {
  const destination = path.resolve(reportPath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, `${JSON.stringify(stableCopy(report), null, 2)}\n`, 'utf8');
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export function parseVerifyArgs(argv) {
  const options = { batch: 'pilot-a', sources: [], full: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') options.rootDir = argv[++index];
    else if (argument === '--out') options.outputDir = argv[++index];
    else if (argument === '--batch') options.batch = argv[++index];
    else if (argument === '--source') options.sources.push(argv[++index]);
    else if (argument === '--full') options.full = true;
    else if (argument === '--report') options.reportPath = argv[++index];
    else throw new Error(`UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!options.rootDir) throw new Error('MISSING_ARGUMENT:--root');
  if (!options.outputDir) throw new Error('MISSING_ARGUMENT:--out');
  if (!options.full && options.sources.length === 0) {
    throw new Error('MISSING_VERIFICATION_SCOPE');
  }
  return options;
}

async function main() {
  const options = parseVerifyArgs(process.argv.slice(2));
  let result;
  if (options.full) {
    result = await verifySite(options);
  } else {
    const sources = [];
    for (const sourcePath of options.sources) {
      sources.push(await verifySourcePage({
        rootDir: options.rootDir,
        outputDir: options.outputDir,
        sourcePath,
      }));
    }
    result = { status: 'PASS', sources };
  }
  if (options.reportPath) await writeReport(options.reportPath, result);
  process.stdout.write(`${JSON.stringify({ status: result.status, sources: result.sources.length })}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
