import test from 'node:test';
import assert from 'node:assert/strict';

import { extractSymbols } from '../lib/symbols.mjs';

test('extracts TypeScript and test symbols with one-based lines', () => {
  const symbols = extractSymbols({
    language: 'TypeScript',
    text: [
      'export class TasksService {',
      '  async update() {}',
      '}',
      "describe('TasksService', () => {});",
      '',
    ].join('\n'),
  });

  assert.deepEqual(symbols, [
    { kind: 'class', name: 'TasksService', line: 1 },
    { kind: 'method', name: 'update', line: 2 },
    { kind: 'test', name: 'TasksService', line: 4 },
  ]);
});

test('extracts exported functions and arrow functions', () => {
  const symbols = extractSymbols({
    language: 'TypeScript',
    text: [
      'export function scoreFor(value: number) {',
      '  return value;',
      '}',
      'export const tierForScore = (score: number) => score;',
    ].join('\n'),
  });

  assert.deepEqual(symbols, [
    { kind: 'function', name: 'scoreFor', line: 1 },
    { kind: 'function', name: 'tierForScore', line: 4 },
  ]);
});

test('extracts Prisma models and enums', () => {
  assert.deepEqual(
    extractSymbols({
      language: 'Prisma',
      text: [
        'model Task {',
        '  id String @id',
        '}',
        'enum TaskStatus {',
        '  PENDING',
        '}',
        '',
      ].join('\n'),
    }),
    [
      { kind: 'model', name: 'Task', line: 1 },
      { kind: 'enum', name: 'TaskStatus', line: 4 },
    ],
  );
});

test('returns no symbols for unsupported text formats', () => {
  assert.deepEqual(
    extractSymbols({ language: 'YAML', text: 'class: NotAClass\n' }),
    [],
  );
});
