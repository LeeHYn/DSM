import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_ROOTS = Object.freeze(['DSM_Back', 'DSM_Front']);

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.json',
  '.mjs',
  '.prisma',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const TEXT_BASENAMES = new Set(['.env.example', '.prettierrc']);
const EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.worktrees',
  '.claude',
  '.vscode',
  'node_modules',
  'dist',
  '.expo',
  'assets',
]);
const EXCLUDED_BASENAMES = new Set(['.env', 'package-lock.json']);

export const CORPUS_BASELINE = Object.freeze({
  files: 124,
  lines: 13_168,
  backendFiles: 88,
  backendLines: 8_787,
  frontendFiles: 36,
  frontendLines: 4_381,
});

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

const REVIEWED_EXPOSURES = Object.freeze({
  'DSM_Back/src/auth/auth.service.ts': Object.freeze([
    'credential-assignment',
  ]),
  'DSM_Back/src/auth/auth.controller.spec.ts': Object.freeze([
    'credential-assignment',
  ]),
});

export function isReviewedExposure(sourcePath, reasons) {
  const approved = REVIEWED_EXPOSURES[sourcePath];
  if (!approved || approved.length !== reasons.length) return false;
  return approved.every((reason) => reasons.includes(reason));
}

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

export const PUBLIC_EXCLUSIONS = Object.freeze([
  Object.freeze({ path: 'DSM_Back/.env', reason: '민감 설정: 내용 미조회' }),
  Object.freeze({
    path: 'DSM_Back/package-lock.json',
    reason: '생성 dependency lockfile',
  }),
  Object.freeze({
    path: 'DSM_Front/package-lock.json',
    reason: '생성 dependency lockfile',
  }),
  ...['.git/', '.worktrees/', 'node_modules/', 'dist/', '.expo/', 'assets/'].map(
    (excludedPath) =>
      Object.freeze({ path: excludedPath, reason: '원본 코드 페이지 제외 경로' }),
  ),
]);

function toRepoPath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isApplicationSource(relativePath) {
  const normalized = toRepoPath(relativePath);
  const segments = normalized.split('/');
  if (!SOURCE_ROOTS.includes(segments[0])) return false;
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;

  const basename = segments.at(-1) ?? '';
  if (EXCLUDED_BASENAMES.has(basename)) return false;
  if (TEXT_BASENAMES.has(basename)) return true;
  return TEXT_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
}

async function collectDirectory(rootDir, relativeDir, output) {
  const absoluteDir = path.join(rootDir, ...relativeDir.split('/'));
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (relativeDir === SOURCE_ROOTS[0] || relativeDir === SOURCE_ROOTS[1]) {
      throw new Error(`CORPUS_ROOT_MISSING:${relativeDir}`, { cause: error });
    }
    throw error;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      await collectDirectory(rootDir, relativePath, output);
      continue;
    }
    if (entry.isFile() && isApplicationSource(relativePath)) {
      output.push(toRepoPath(relativePath));
    }
  }
}

export async function collectApplicationPaths(rootDir) {
  const output = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    await collectDirectory(rootDir, sourceRoot, output);
  }
  return output.sort((left, right) => left.localeCompare(right, 'en'));
}
