import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

export type SyncTaskFields = {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  difficulty: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  categoryId: string | null;
  notificationEnabled: boolean;
};

type SyncOperationBase = {
  mutationId: string;
  taskId: string;
  updatedAt: string;
};
export type SyncTaskOperation = SyncOperationBase &
  ({ kind: 'create' | 'replace'; task: SyncTaskFields } | { kind: 'delete' });
export type SyncVersion = { updatedAt: Date | string; mutationId: string };
export type SyncTaskState = {
  updatedAt: Date;
  mutationId: string;
  mutationHash: string;
  createHash: string | null;
};
export type SyncCurrentTask = {
  updatedAt: Date;
  deletedAt: Date | null;
  state: SyncTaskState | null;
};
export type SyncDecision = 'apply' | 'replay' | 'superseded' | 'deleted';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_MILLISECONDS =
  /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function invalid(): never {
  throw new BadRequestException('Invalid task sync operation');
}

function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  )
    invalid();
  return result;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) invalid();
  return value.toLowerCase();
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !UTC_MILLISECONDS.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    invalid();
  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) invalid();
  return value as T;
}

function fields(value: unknown): SyncTaskFields {
  const row = record(value, [
    'title',
    'description',
    'startAt',
    'endAt',
    'difficulty',
    'status',
    'categoryId',
    'notificationEnabled',
  ]);
  if (typeof row.title !== 'string') invalid();
  const title = row.title.trim();
  if (!title || Array.from(title).length > 200) invalid();
  const description = row.description;
  if (
    description !== null &&
    (typeof description !== 'string' || Array.from(description).length > 4000)
  )
    invalid();
  const categoryId = row.categoryId;
  if (
    categoryId !== null &&
    (typeof categoryId !== 'string' ||
      !categoryId.trim() ||
      categoryId.length > 255)
  )
    invalid();
  if (typeof row.notificationEnabled !== 'boolean') invalid();
  const startAt = timestamp(row.startAt);
  const endAt = timestamp(row.endAt);
  if (Date.parse(endAt) <= Date.parse(startAt)) invalid();
  return {
    title,
    description,
    startAt,
    endAt,
    difficulty: choice(row.difficulty, ['LOW', 'MEDIUM', 'HIGH']),
    status: choice(row.status, ['PENDING', 'COMPLETED', 'CANCELLED']),
    categoryId,
    notificationEnabled: row.notificationEnabled,
  };
}

export function parseSyncOperation(
  input: unknown,
  nowDate = new Date(),
): SyncTaskOperation {
  try {
    const json = JSON.stringify(input);
    if (
      json === undefined ||
      Buffer.byteLength(json, 'utf8') > 16384 ||
      !Number.isFinite(nowDate.getTime())
    )
      invalid();
    const kind = choice((input as Record<string, unknown> | null)?.kind, [
      'create',
      'replace',
      'delete',
    ]);
    const row = record(input, [
      'mutationId',
      'taskId',
      'updatedAt',
      'kind',
      ...(kind === 'delete' ? [] : ['task']),
    ]);
    const base = {
      mutationId: uuid(row.mutationId),
      taskId: uuid(row.taskId),
      updatedAt: timestamp(row.updatedAt),
    };
    if (Date.parse(base.updatedAt) > nowDate.getTime() + 5 * 60 * 1000)
      invalid();
    if (kind === 'delete') return { ...base, kind };
    const task = fields(row.task);
    if (
      kind === 'create' &&
      (base.mutationId !== base.taskId || task.status !== 'PENDING')
    )
      invalid();
    return { ...base, kind, task };
  } catch {
    return invalid();
  }
}
export function hashSyncOperation(operation: SyncTaskOperation): string {
  const tuple: unknown[] = [
    1,
    operation.kind,
    operation.taskId,
    operation.mutationId,
    operation.updatedAt,
  ];
  if (operation.kind !== 'delete') {
    const task = operation.task;
    tuple.push(
      task.title,
      task.description,
      task.startAt,
      task.endAt,
      task.difficulty,
      task.status,
      task.categoryId,
      task.notificationEnabled,
    );
  }
  return createHash('sha256')
    .update(JSON.stringify(tuple), 'utf8')
    .digest('hex');
}
export function compareSyncVersions(
  left: SyncVersion,
  right: SyncVersion,
): number {
  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) invalid();
  if (leftTime !== rightTime) return leftTime > rightTime ? 1 : -1;
  if (left.mutationId === right.mutationId) return 0;
  return left.mutationId > right.mutationId ? 1 : -1;
}
export function syncVersionForTask(
  updatedAt: Date,
  state: SyncTaskState | null,
): SyncVersion {
  return {
    updatedAt: new Date(state?.updatedAt ?? updatedAt),
    mutationId: state?.mutationId ?? '',
  };
}
export function nextLegacySyncTime(previous: Date, now = new Date()): Date {
  const next = new Date(Math.max(previous.getTime() + 1, now.getTime()));
  if (!Number.isFinite(next.getTime())) invalid();
  return next;
}
export function decideSyncOperation(
  operation: SyncTaskOperation,
  current: SyncCurrentTask | null,
): SyncDecision {
  if (!current) {
    if (operation.kind === 'create') return 'apply';
    throw new NotFoundException('Task not found');
  }
  const hash = hashSyncOperation(operation);
  if (operation.kind === 'create') {
    if (current.state?.createHash !== hash)
      throw new ConflictException('Task sync conflict');
    return current.deletedAt ? 'deleted' : 'replay';
  }
  const comparison = compareSyncVersions(
    operation,
    syncVersionForTask(current.updatedAt, current.state),
  );
  if (
    comparison === 0 &&
    current.state &&
    current.state.mutationHash !== hash
  ) {
    throw new ConflictException('Task sync conflict');
  }
  if (current.deletedAt) return 'deleted';
  if (comparison === 0) return 'replay';
  // Deletion is terminal and intentionally dominates the LWW edit order.
  if (operation.kind === 'delete') return 'apply';
  return comparison > 0 ? 'apply' : 'superseded';
}
