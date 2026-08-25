import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORPUS_BASELINE,
  PUBLIC_EXCLUSIONS,
  collectApplicationPaths,
  isReviewedExposure,
  pathsForBatch,
} from './manifest.mjs';
import {
  AUTH_EXERCISES,
  AUTH_FLOW,
  AUTH_PAGES,
  BATCH_B_FILE_GUIDES,
} from './content/batch-b.mjs';
import {
  FILE_GUIDES,
  PILOT_A_FLOW,
  PILOT_EXERCISES,
  SITE_COPY,
} from './content/pilot-a.mjs';
import { fileOutputPath } from './lib/paths.mjs';
import {
  OUTPUT_PATHS,
  renderArchitecturePage,
  renderAuthDiagramPage,
  renderAuthExercisePage,
  renderConceptPage,
  renderDiagramPage,
  renderExercisePage,
  renderFeaturePage,
  renderFilePage,
  renderIndexPage,
  renderJwtSessionPage,
  renderRefreshRotationPage,
  renderSocialLoginPage,
} from './lib/pages.mjs';
import { assessExposureRisk, readSourceRecord } from './lib/source.mjs';
import { extractSymbols } from './lib/symbols.mjs';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ASSET_INPUTS = Object.freeze({
  'asset:site.css': path.join(TOOL_ROOT, 'assets', 'site.css'),
  'asset:site.js': path.join(TOOL_ROOT, 'assets', 'site.js'),
});
const ASSET_OUTPUTS = Object.freeze({
  'asset:site.css': 'assets/site.css',
  'asset:site.js': 'assets/site.js',
  'asset:site-data.js': 'assets/site-data.js',
});
const BASE_PAGE_OUTPUTS = Object.freeze({
  'page:index': OUTPUT_PATHS.index,
  'page:architecture': OUTPUT_PATHS.architecture,
  'page:concepts': OUTPUT_PATHS.concept,
  'page:feature': OUTPUT_PATHS.feature,
  'page:exercise': OUTPUT_PATHS.exercise,
  'page:diagram': OUTPUT_PATHS.diagram,
});
const AUTH_PAGE_OUTPUTS = Object.freeze({
  'page:auth-social-login': OUTPUT_PATHS.authSocial,
  'page:auth-refresh-rotation': OUTPUT_PATHS.authRefresh,
  'page:auth-jwt-session': OUTPUT_PATHS.authConcept,
  'page:auth-session-exercise': OUTPUT_PATHS.authExercise,
  'page:auth-session-flow': OUTPUT_PATHS.authDiagram,
});

function pageOutputsForBatch(batch) {
  pathsForBatch(batch);
  return batch === 'batch-b'
    ? Object.freeze({ ...BASE_PAGE_OUTPUTS, ...AUTH_PAGE_OUTPUTS })
    : BASE_PAGE_OUTPUTS;
}

let temporaryCounter = 0;

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

function sumLines(records, prefix) {
  return records
    .filter((record) => record.path.startsWith(prefix))
    .reduce((sum, record) => sum + record.lineCount, 0);
}

function assertCorpusBaseline(paths, records) {
  const backend = records.filter((record) => record.path.startsWith('DSM_Back/'));
  const frontend = records.filter((record) => record.path.startsWith('DSM_Front/'));
  const actual = {
    files: paths.length,
    lines: records.reduce((sum, record) => sum + record.lineCount, 0),
    backendFiles: backend.length,
    backendLines: sumLines(records, 'DSM_Back/'),
    frontendFiles: frontend.length,
    frontendLines: sumLines(records, 'DSM_Front/'),
  };
  for (const [key, expected] of Object.entries(CORPUS_BASELINE)) {
    if (actual[key] !== expected) {
      throw new Error(
        `CORPUS_BASELINE_MISMATCH:${key}:expected=${expected}:actual=${actual[key]}`,
      );
    }
  }
}

function kindForPath(sourcePath) {
  return /(?:^|\/)(?:test\/|[^/]+\.(?:spec|test)\.[^/]+$)/.test(sourcePath)
    ? 'test'
    : 'source';
}

function areaForPath(sourcePath) {
  return sourcePath.startsWith('DSM_Back/') ? 'backend' : 'frontend';
}

function assertUniqueOutputPaths(records) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.outputPath)) {
      throw new Error(`DUPLICATE_OUTPUT_PATH:${record.outputPath}`);
    }
    seen.add(record.outputPath);
  }
}

export async function buildSiteModel({ rootDir, batch = 'pilot-a' }) {
  const content = contentForBatch(batch);
  const paths = await collectApplicationPaths(rootDir);
  const sourceRecords = await Promise.all(
    paths.map((sourcePath) => readSourceRecord(rootDir, sourcePath)),
  );
  assertCorpusBaseline(paths, sourceRecords);

  const pathSet = new Set(paths);
  for (const sourcePath of content.learningOrder) {
    if (!pathSet.has(sourcePath)) {
      throw new Error(`BATCH_SOURCE_MISSING:${batch}:${sourcePath}`);
    }
  }

  const processedSet = new Set(content.learningOrder);
  const records = sourceRecords.map((sourceRecord) => {
    const exposure = assessExposureRisk(sourceRecord);
    const processed = processedSet.has(sourceRecord.path);
    if (
      processed &&
      exposure.status === 'review-required' &&
      !isReviewedExposure(sourceRecord.path, exposure.reasons)
    ) {
      throw new Error(
        `BATCH_EXPOSURE_REVIEW_REQUIRED:${batch}:${sourceRecord.path}`,
      );
    }
    const reviewRequired = exposure.status === 'review-required';
    const symbols = reviewRequired ? [] : extractSymbols(sourceRecord);
    return Object.freeze({
      ...sourceRecord,
      area: areaForPath(sourceRecord.path),
      kind: kindForPath(sourceRecord.path),
      symbols: Object.freeze(symbols),
      status: processed ? 'processed' : 'remaining',
      outputPath: fileOutputPath(sourceRecord.path),
      reviewRequired,
      exposureReasons: Object.freeze([...exposure.reasons]),
    });
  });
  assertUniqueOutputPaths(records);

  const processed = records.filter((record) => record.status === 'processed').length;
  const remaining = records.length - processed;
  return Object.freeze({
    batch,
    learningOrder: content.learningOrder,
    copy: SITE_COPY,
    flow: PILOT_A_FLOW,
    exercises: PILOT_EXERCISES,
    auth: content.auth,
    records: Object.freeze(records),
    guides: content.guides,
    progress: Object.freeze({
      processed,
      remaining,
      missing: 0,
      excluded: PUBLIC_EXCLUSIONS,
    }),
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

function runtimeData(model) {
  const records = model.records.map((record) => ({
    area: record.area,
    filename: path.posix.basename(record.path),
    kind: record.kind,
    language: record.language,
    lineCount: record.lineCount,
    outputPath: record.status === 'processed' ? record.outputPath : null,
    path: record.path,
    reviewRequired: record.reviewRequired,
    sha256: record.sha256,
    status: record.status,
    symbols: record.symbols.map((symbol) => symbol.name),
  }));
  return stableCopy({
    exclusions: [...model.progress.excluded]
      .map((item) => ({ path: item.path, reason: item.reason }))
      .sort((left, right) => left.path.localeCompare(right.path, 'en')),
    progress: {
      missing: model.progress.missing,
      processed: model.progress.processed,
      remaining: model.progress.remaining,
    },
    records,
  });
}

function renderRuntimeData(model) {
  return `globalThis.DSM_LEARNING_DATA = Object.freeze(${JSON.stringify(runtimeData(model))});\n`;
}

function allOutputIds(batch) {
  const pageOutputs = pageOutputsForBatch(batch);
  return [
    ...Object.keys(ASSET_OUTPUTS),
    ...Object.keys(pageOutputs),
    ...pathsForBatch(batch).map((sourcePath) => `file:${sourcePath}`),
  ];
}

function validateOutputIds(only, batch) {
  const available = allOutputIds(batch);
  const valid = new Set(available);
  const requested = only && only.length > 0 ? only : available;
  const unique = [];
  const seen = new Set();
  for (const outputId of requested) {
    if (!valid.has(outputId)) throw new Error(`UNKNOWN_OUTPUT_ID:${outputId}`);
    if (!seen.has(outputId)) {
      unique.push(outputId);
      seen.add(outputId);
    }
  }
  return unique;
}

function pageContents(outputId, model) {
  const renderers = {
    'page:index': renderIndexPage,
    'page:architecture': renderArchitecturePage,
    'page:concepts': renderConceptPage,
    'page:feature': renderFeaturePage,
    'page:exercise': renderExercisePage,
    'page:diagram': renderDiagramPage,
    'page:auth-social-login': renderSocialLoginPage,
    'page:auth-refresh-rotation': renderRefreshRotationPage,
    'page:auth-jwt-session': renderJwtSessionPage,
    'page:auth-session-exercise': renderAuthExercisePage,
    'page:auth-session-flow': renderAuthDiagramPage,
  };
  return renderers[outputId](model);
}

async function outputContents(outputId, model) {
  if (ASSET_INPUTS[outputId]) return readFile(ASSET_INPUTS[outputId], 'utf8');
  if (outputId === 'asset:site-data.js') return renderRuntimeData(model);
  if (pageOutputsForBatch(model.batch)[outputId]) {
    return pageContents(outputId, model);
  }
  if (outputId.startsWith('file:')) {
    return renderFilePage(model, outputId.slice('file:'.length));
  }
  throw new Error(`UNKNOWN_OUTPUT_ID:${outputId}`);
}

function outputPathForId(outputId, batch) {
  if (ASSET_OUTPUTS[outputId]) return ASSET_OUTPUTS[outputId];
  const pageOutputs = pageOutputsForBatch(batch);
  if (pageOutputs[outputId]) return pageOutputs[outputId];
  if (outputId.startsWith('file:')) {
    return fileOutputPath(outputId.slice('file:'.length));
  }
  throw new Error(`UNKNOWN_OUTPUT_ID:${outputId}`);
}

async function writeAtomically(outputDir, relativeOutputPath, contents) {
  const destination = path.join(outputDir, ...relativeOutputPath.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  temporaryCounter += 1;
  const temporary = `${destination}.tmp-${process.pid}-${temporaryCounter}`;
  try {
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function generateSite({
  rootDir,
  outputDir,
  batch = 'pilot-a',
  only = [],
}) {
  pathsForBatch(batch);
  const requested = validateOutputIds(only, batch);
  const model = await buildSiteModel({ rootDir, batch });
  const written = [];
  for (const outputId of requested) {
    const relativeOutputPath = outputPathForId(outputId, batch);
    const contents = await outputContents(outputId, model);
    await writeAtomically(outputDir, relativeOutputPath, contents);
    written.push(relativeOutputPath);
  }
  return Object.freeze({
    written: Object.freeze(written),
    progress: model.progress,
  });
}

export function parseGenerateArgs(argv) {
  const options = { batch: 'pilot-a', only: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') options.rootDir = argv[++index];
    else if (argument === '--out') options.outputDir = argv[++index];
    else if (argument === '--batch') options.batch = argv[++index];
    else if (argument === '--only') options.only.push(argv[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT:${argument}`);
  }
  if (!options.rootDir) throw new Error('MISSING_ARGUMENT:--root');
  if (!options.outputDir) throw new Error('MISSING_ARGUMENT:--out');
  return options;
}

async function main() {
  const options = parseGenerateArgs(process.argv.slice(2));
  const result = await generateSite(options);
  process.stdout.write(`${JSON.stringify({ written: result.written })}\n`);
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
