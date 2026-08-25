import path from 'node:path';

export function normalizeRepoPath(input) {
  const original = String(input);
  const value = original.replaceAll('\\', '/');
  if (
    !value ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`UNSAFE_REPO_PATH:${original}`);
  }

  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`UNSAFE_REPO_PATH:${original}`);
  }
  return normalized;
}

export function resolveInsideRoot(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const normalized = normalizeRepoPath(relativePath);
  const resolved = path.resolve(root, ...normalized.split('/'));
  const fromRoot = path.relative(root, resolved);
  if (
    fromRoot === '..' ||
    fromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromRoot)
  ) {
    throw new Error(`PATH_OUTSIDE_ROOT:${relativePath}`);
  }
  return resolved;
}

export function fileOutputPath(relativePath) {
  return `files/${normalizeRepoPath(relativePath)}.html`;
}

export function relativeHref(fromOutputPath, toOutputPath) {
  const from = normalizeRepoPath(fromOutputPath);
  const to = normalizeRepoPath(toOutputPath);
  const relative = path.posix.relative(path.posix.dirname(from), to);
  const href = encodeURI(relative || path.posix.basename(to));
  return href.startsWith('.') ? href : `./${href}`;
}
