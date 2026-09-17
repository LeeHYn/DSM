import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  compareSyncVersions,
  decideSyncOperation,
  hashSyncOperation,
  nextLegacySyncTime,
  parseSyncOperation,
  syncVersionForTask,
  type SyncCurrentTask,
  type SyncTaskOperation,
} from './task-sync.policy';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-09-11T12:00:00.000Z');
const task = () => ({
  title: '일과',
  description: null,
  startAt: '2026-09-11T12:00:00.000Z',
  endAt: '2026-09-11T13:00:00.000Z',
  difficulty: 'LOW',
  status: 'PENDING',
  categoryId: null,
  notificationEnabled: true,
});
const input = (overrides: Record<string, unknown> = {}) => ({
  mutationId: ID,
  taskId: ID,
  updatedAt: NOW.toISOString(),
  kind: 'create',
  task: task(),
  ...overrides,
});
const operation = (overrides: Record<string, unknown> = {}) =>
  parseSyncOperation(input(overrides), NOW);
const current = (op: SyncTaskOperation): SyncCurrentTask => ({
  updatedAt: NOW,
  deletedAt: null,
  state: {
    updatedAt: new Date(op.updatedAt),
    mutationId: op.mutationId,
    mutationHash: hashSyncOperation(op),
    createHash: op.kind === 'create' ? hashSyncOperation(op) : null,
  },
});

describe('parseSyncOperation', () => {
  it('normalizes IDs and title without changing nullable fields or timestamps', () => {
    const raw = input({
      mutationId: ID.toUpperCase(),
      taskId: ID.toUpperCase(),
      task: { ...task(), title: '  일과  ' },
    });
    expect(parseSyncOperation(raw, NOW)).toEqual(input());
    expect(raw.mutationId).toBe(ID.toUpperCase());
  });

  it.each(['PENDING', 'COMPLETED', 'CANCELLED'])(
    'accepts complete replace state %s',
    (status) => {
      expect(
        operation({
          kind: 'replace',
          mutationId: SECOND_ID,
          task: { ...task(), status },
        }),
      ).toMatchObject({ kind: 'replace', task: { status } });
    },
  );
  it('accepts a delete without task fields', () => {
    const raw = {
      mutationId: SECOND_ID,
      taskId: ID,
      updatedAt: NOW.toISOString(),
      kind: 'delete',
    };
    expect(parseSyncOperation(raw, NOW)).toEqual(raw);
  });
  it.each([
    null,
    [],
    'input',
    {},
    input({ extra: true }),
    input({ userId: 'foreign' }),
    input({ mutationId: 'not-uuid' }),
    input({ taskId: 'not-uuid' }),
    input({ mutationId: SECOND_ID }),
    input({ kind: 'upsert' }),
    input({ kind: 'delete' }),
    input({ task: null }),
    input({ task: { ...task(), title: '' } }),
    input({ task: { ...task(), title: '  ' } }),
    input({ task: { ...task(), title: '가'.repeat(201) } }),
    input({ task: { ...task(), description: 'a'.repeat(4001) } }),
    input({ task: { ...task(), description: undefined } }),
    input({ task: { ...task(), notificationEnabled: 'true' } }),
    input({ task: { ...task(), categoryId: '' } }),
    input({ task: { ...task(), difficulty: 'EXTREME' } }),
    input({ task: { ...task(), status: 'COMPLETED' } }),
    input({ task: { ...task(), status: 'CANCELLED' } }),
    input({ task: { ...task(), completedAt: NOW.toISOString() } }),
    input({ task: { ...task(), score: 900 } }),
    input({ task: { ...task(), endAt: task().startAt } }),
    input({ task: { ...task(), endAt: '2026-09-10T13:00:00.000Z' } }),
  ])('rejects malformed input %# without retaining its payload', (raw) => {
    expect(() => parseSyncOperation(raw, NOW)).toThrow(BadRequestException);
    expect(() => parseSyncOperation(raw, NOW)).toThrow(
      'Invalid task sync operation',
    );
  });
  it.each([
    '2026-02-29T12:00:00.000Z',
    '2026-09-31T12:00:00.000Z',
    '2026-09-11T24:00:00.000Z',
    '2026-09-11T12:00:00Z',
    '2026-09-11T12:00:00.000+00:00',
    '2026-09-11T12:00:00.000',
    '0000-01-01T00:00:00.000Z',
    '2026-09-11T12:05:00.001Z',
  ])('rejects invalid or future operation timestamp %s', (updatedAt) => {
    expect(() => operation({ updatedAt })).toThrow(BadRequestException);
  });
  it('accepts leap days, year 0099 and the exact future boundary', () => {
    expect(
      operation({ updatedAt: '2024-02-29T00:00:00.000Z' }).updatedAt,
    ).toContain('2024-02-29');
    expect(
      operation({ updatedAt: '0099-01-01T00:00:00.000Z' }).updatedAt,
    ).toContain('0099');
    expect(
      operation({ updatedAt: '2026-09-11T12:05:00.000Z' }).updatedAt,
    ).toContain('12:05');
  });
  it('enforces timestamp validity for both interval fields', () => {
    for (const field of ['startAt', 'endAt']) {
      expect(() =>
        operation({ task: { ...task(), [field]: '2026-02-30T12:00:00.000Z' } }),
      ).toThrow(BadRequestException);
    }
  });
  it('accepts exact text bounds counted as Unicode code points', () => {
    const result = operation({
      task: {
        ...task(),
        title: '😀'.repeat(200),
        description: 'a'.repeat(4000),
      },
    });
    expect(result.kind === 'create' && result.task.title).toBe(
      '😀'.repeat(200),
    );
  });
  it('measures the 16 KiB limit in UTF8 bytes including otherwise valid whitespace', () => {
    const base = input();
    const size = Buffer.byteLength(JSON.stringify(base), 'utf8');
    const exact = input({
      task: { ...task(), title: `${' '.repeat(16384 - size)}일과` },
    });
    expect(Buffer.byteLength(JSON.stringify(exact), 'utf8')).toBe(16384);
    expect(parseSyncOperation(exact, NOW)).toEqual(base);
    expect(() =>
      parseSyncOperation(
        { ...exact, task: { ...exact.task, title: ` ${exact.task.title}` } },
        NOW,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      operation({
        task: {
          ...task(),
          title: '😀'.repeat(200),
          description: '😀'.repeat(4000),
        },
      }),
    ).toThrow(BadRequestException);
  });
  it('rejects missing required fields, cycles and bigint with a safe error', () => {
    const missing: Record<string, unknown> = task();
    delete missing.categoryId;
    expect(() => operation({ task: missing })).toThrow(BadRequestException);
    const cyclic: Record<string, unknown> = input();
    cyclic.task = cyclic;
    expect(() => parseSyncOperation(cyclic, NOW)).toThrow(
      'Invalid task sync operation',
    );
    expect(() => operation({ task: { ...task(), description: 1n } })).toThrow(
      'Invalid task sync operation',
    );
  });
});

describe('sync hash and decisions', () => {
  it('uses a stable hash independent of input object field order', () => {
    const first = operation();
    const reversed = Object.fromEntries(Object.entries(input()).reverse());
    const second = parseSyncOperation(reversed, NOW);
    expect(hashSyncOperation(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSyncOperation(first)).toBe(hashSyncOperation(second));
    expect(hashSyncOperation(first)).not.toBe(
      hashSyncOperation(operation({ updatedAt: '2026-09-11T11:59:59.999Z' })),
    );
  });
  it('orders timestamps first and UUID ties ordinally', () => {
    expect(
      compareSyncVersions(
        { updatedAt: NOW, mutationId: ID },
        { updatedAt: NOW.toISOString(), mutationId: ID },
      ),
    ).toBe(0);
    expect(
      compareSyncVersions(
        { updatedAt: NOW, mutationId: SECOND_ID },
        { updatedAt: NOW, mutationId: ID },
      ),
    ).toBe(1);
    expect(
      compareSyncVersions(
        { updatedAt: new Date(NOW.getTime() - 1), mutationId: SECOND_ID },
        { updatedAt: NOW, mutationId: ID },
      ),
    ).toBe(-1);
  });
  it('falls back to legacy Task time and advances legacy writes monotonically', () => {
    expect(syncVersionForTask(NOW, null)).toEqual({
      updatedAt: NOW,
      mutationId: '',
    });
    expect(nextLegacySyncTime(NOW, NOW).getTime()).toBe(NOW.getTime() + 1);
    expect(
      nextLegacySyncTime(NOW, new Date(NOW.getTime() - 1000)).getTime(),
    ).toBe(NOW.getTime() + 1);
    expect(
      nextLegacySyncTime(NOW, new Date(NOW.getTime() + 1000)).getTime(),
    ).toBe(NOW.getTime() + 1000);
    const saved = current(operation());
    expect(syncVersionForTask(new Date(0), saved.state)).toEqual({
      updatedAt: NOW,
      mutationId: ID,
    });
  });
  it('creates missing tasks but never upserts missing replace/delete targets', () => {
    expect(decideSyncOperation(operation(), null)).toBe('apply');
    expect(() =>
      decideSyncOperation(operation({ kind: 'replace' }), null),
    ).toThrow(NotFoundException);
    const deletion = parseSyncOperation(
      {
        kind: 'delete',
        taskId: ID,
        mutationId: SECOND_ID,
        updatedAt: NOW.toISOString(),
      },
      NOW,
    );
    expect(() => decideSyncOperation(deletion, null)).toThrow(
      NotFoundException,
    );
  });
  it('replays the original create after later changes or deletion', () => {
    const create = operation();
    const saved = current(create);
    saved.state!.updatedAt = new Date(NOW.getTime() + 1);
    saved.state!.mutationId = SECOND_ID;
    saved.state!.mutationHash = 'newer-hash';
    expect(decideSyncOperation(create, saved)).toBe('replay');
    saved.deletedAt = NOW;
    expect(decideSyncOperation(create, saved)).toBe('deleted');
  });
  it('rejects changed create reuse and collisions with a legacy task', () => {
    const saved = current(operation());
    expect(() =>
      decideSyncOperation(
        operation({ task: { ...task(), title: 'changed' } }),
        saved,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      decideSyncOperation(operation(), { ...saved, state: null }),
    ).toThrow(ConflictException);
  });
  it('replays matching versions, rejects changed payload, and supersedes stale versions', () => {
    const replace = operation({ kind: 'replace' });
    const saved = current(replace);
    expect(decideSyncOperation(replace, saved)).toBe('replay');
    expect(() =>
      decideSyncOperation(
        operation({ kind: 'replace', task: { ...task(), title: 'changed' } }),
        saved,
      ),
    ).toThrow(ConflictException);
    expect(
      decideSyncOperation(
        operation({ kind: 'replace', updatedAt: '2026-09-11T11:59:59.999Z' }),
        saved,
      ),
    ).toBe('superseded');
    expect(
      decideSyncOperation(
        operation({ kind: 'replace', mutationId: SECOND_ID }),
        saved,
      ),
    ).toBe('apply');
  });
  it('makes deletion terminal even for later replacement and older deletion intent', () => {
    const saved = current(operation({ kind: 'replace' }));
    const deletion = parseSyncOperation(
      {
        kind: 'delete',
        taskId: ID,
        mutationId: SECOND_ID,
        updatedAt: '2026-09-11T11:00:00.000Z',
      },
      NOW,
    );
    expect(decideSyncOperation(deletion, saved)).toBe('apply');
    saved.deletedAt = NOW;
    expect(
      decideSyncOperation(
        operation({ kind: 'replace', updatedAt: '2026-09-11T12:01:00.000Z' }),
        saved,
      ),
    ).toBe('deleted');
    expect(decideSyncOperation(deletion, saved)).toBe('deleted');
  });
  it.each([
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ])('converges to deletion for arrival order %j', (...order: number[]) => {
    const operations = [
      operation({ kind: 'replace', updatedAt: '2026-09-11T11:00:00.000Z' }),
      operation({
        kind: 'replace',
        mutationId: SECOND_ID,
        updatedAt: '2026-09-11T11:02:00.000Z',
      }),
      parseSyncOperation(
        {
          kind: 'delete',
          taskId: ID,
          mutationId: SECOND_ID,
          updatedAt: '2026-09-11T11:01:00.000Z',
        },
        NOW,
      ),
    ];
    let saved: SyncCurrentTask = {
      updatedAt: new Date('2026-09-11T10:00:00.000Z'),
      deletedAt: null,
      state: null,
    };
    for (const index of order) {
      const next = operations[index];
      if (decideSyncOperation(next, saved) === 'apply') {
        saved = {
          ...current(next),
          deletedAt: next.kind === 'delete' ? NOW : null,
        };
      }
    }
    expect(saved.deletedAt).toEqual(NOW);
  });
});
