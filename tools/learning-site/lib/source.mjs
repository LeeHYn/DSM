import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveInsideRoot } from './paths.mjs';

const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });

export function decodeUtf8(buffer, relativePath) {
  try {
    return FATAL_UTF8.decode(buffer);
  } catch (error) {
    throw new Error(`INVALID_UTF8:${relativePath}`, { cause: error });
  }
}

export function logicalLineCount(text) {
  if (text.length === 0) return 0;
  const count = text.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(text) ? count - 1 : count;
}

export function detectLineEnding(text) {
  const crlfCount = (text.match(/\r\n/g) ?? []).length;
  const withoutCrlf = text.replaceAll('\r\n', '');
  const lfCount = (withoutCrlf.match(/\n/g) ?? []).length;
  const crCount = (withoutCrlf.match(/\r/g) ?? []).length;
  const present = [crlfCount > 0, lfCount > 0, crCount > 0].filter(Boolean)
    .length;
  if (present === 0) return 'none';
  if (present > 1) return 'mixed';
  if (crlfCount > 0) return 'CRLF';
  if (lfCount > 0) return 'LF';
  return 'CR';
}

export function languageForPath(relativePath) {
  const basename = path.posix.basename(String(relativePath).replaceAll('\\', '/'));
  if (basename === '.env.example') return 'Environment';
  if (basename === '.prettierrc') return 'JSON';
  const extension = path.posix.extname(basename).toLowerCase();
  return (
    {
      '.css': 'CSS',
      '.js': 'JavaScript',
      '.json': 'JSON',
      '.mjs': 'JavaScript',
      '.prisma': 'Prisma',
      '.sql': 'SQL',
      '.toml': 'TOML',
      '.ts': 'TypeScript',
      '.tsx': 'TSX',
      '.yaml': 'YAML',
      '.yml': 'YAML',
    }[extension] ?? 'Text'
  );
}

export function assessExposureRisk(record) {
  const reasons = [];
  const text = record.text;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    reasons.push('private-key-block');
  }
  if (
    /\b(?:AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{30,}|xox[baprs]-[0-9A-Za-z-]{20,})\b/.test(
      text,
    )
  ) {
    reasons.push('provider-token');
  }
  if (
    /\b(?:api[_-]?key|client[_-]?secret|jwt[_-]?secret|access[_-]?token|refresh[_-]?token|password|private[_-]?key|clientSecret|jwtSecret|accessToken|refreshToken|privateKey)\s*[:=]\s*['"`][^'"`\r\n]+['"`]/i.test(
      text,
    )
  ) {
    reasons.push('credential-assignment');
  }
  return Object.freeze({
    status: reasons.length === 0 ? 'safe' : 'review-required',
    reasons: Object.freeze([...new Set(reasons)]),
  });
}

export async function readSourceRecord(rootDir, relativePath) {
  const absolutePath = resolveInsideRoot(rootDir, relativePath);
  const buffer = await readFile(absolutePath);
  const text = decodeUtf8(buffer, relativePath);
  return Object.freeze({
    path: String(relativePath).replaceAll('\\', '/'),
    language: languageForPath(relativePath),
    bytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    lineCount: logicalLineCount(text),
    lineEnding: detectLineEnding(text),
    text,
  });
}
