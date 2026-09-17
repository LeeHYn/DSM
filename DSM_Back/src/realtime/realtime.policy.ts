import { randomUUID } from 'node:crypto';

// Connection quotas are per server instance, not distributed Redis quotas.
export const REALTIME_LIMITS = Object.freeze({
  instanceConnections: 1000,
  pendingAuthentications: 50,
  userConnections: 4,
  sessionConnections: 2,
  maxFrameBytes: 4096,
  maxBufferedBytes: 65536,
  authenticationTimeoutMs: 5000,
  familyCheckIntervalMs: 30000,
  flushIntervalMs: 1000,
});

export const REALTIME_CLOSE_CODES = Object.freeze({
  authentication: 4001,
  revoked: 4003,
  limit: 4008,
  expired: 4010,
  unavailable: 1013,
});

export type RealtimeScope = 'scores' | 'rankings' | 'reminders';
export type AuthenticationFrame = {
  event: 'authenticate';
  data: { version: 1; accessToken: string };
};
export type ResetEvent = {
  event: 'reset';
  data: { version: 1; streamId: string; seq: 0 };
};
export type InvalidateEvent = {
  event: 'invalidate';
  data: {
    version: 1;
    streamId: string;
    seq: number;
    scopes: RealtimeScope[];
  };
};
export type RealtimeServerEvent = ResetEvent | InvalidateEvent;
export type InvalidationTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'all' };
export type RevocationTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'session'; userId: string; sessionId: string };
export type RealtimeBusEvent =
  | {
      version: 1;
      eventId: string;
      type: 'invalidate';
      target: InvalidationTarget;
      scopes: RealtimeScope[];
    }
  | {
      version: 1;
      eventId: string;
      type: 'revoke';
      target: RevocationTarget;
    };

export function createRealtimeId(): string {
  return randomUUID();
}

// Pass the complete envelope, before Nest strips `event`. Binary frames must be
// rejected by the gateway using ws's isBinary flag; this parser rejects buffers.
// The gateway owns the one-authentication-per-connection state transition.
export function parseAuthentication(
  input: unknown,
): AuthenticationFrame | null {
  return parseBounded(input, (value) => {
    if (!record(value, ['event', 'data']) || value.event !== 'authenticate') {
      return null;
    }
    const data = value.data;
    if (
      !record(data, ['version', 'accessToken']) ||
      data.version !== 1 ||
      typeof data.accessToken !== 'string' ||
      Buffer.byteLength(data.accessToken, 'utf8') >
        REALTIME_LIMITS.maxFrameBytes ||
      data.accessToken.trim().length === 0
    ) {
      return null;
    }
    return {
      event: 'authenticate',
      data: { version: 1, accessToken: data.accessToken },
    };
  });
}

export function parseServerEvent(input: unknown): RealtimeServerEvent | null {
  return parseBounded(input, (value) => {
    if (!record(value, ['event', 'data'])) return null;
    const isReset = value.event === 'reset';
    if (!isReset && value.event !== 'invalidate') return null;
    const data = value.data;
    const keys = isReset
      ? ['version', 'streamId', 'seq']
      : ['version', 'streamId', 'seq', 'scopes'];
    if (
      !record(data, keys) ||
      data.version !== 1 ||
      !uuid(data.streamId) ||
      typeof data.seq !== 'number' ||
      !Number.isSafeInteger(data.seq) ||
      data.seq < 0
    ) {
      return null;
    }
    if (isReset) {
      return data.seq === 0
        ? {
            event: 'reset',
            data: { version: 1, streamId: data.streamId, seq: 0 },
          }
        : null;
    }
    if (!scopes(data.scopes)) return null;
    return {
      event: 'invalidate',
      data: {
        version: 1,
        streamId: data.streamId,
        seq: data.seq,
        scopes: [...data.scopes],
      },
    };
  });
}

export function parseRealtimeBusEvent(input: unknown): RealtimeBusEvent | null {
  return parseBounded(input, (value) => {
    if (!plainObject(value)) return null;
    const type = Object.getOwnPropertyDescriptor(value, 'type')
      ?.value as unknown;
    if (type !== 'invalidate' && type !== 'revoke') return null;
    const keys = ['version', 'eventId', 'type', 'target'];
    if (type === 'invalidate') keys.push('scopes');
    if (!record(value, keys) || value.version !== 1 || !uuid(value.eventId)) {
      return null;
    }
    const target = value.target;
    if (!plainObject(target)) return null;
    const kind = Object.getOwnPropertyDescriptor(target, 'kind')
      ?.value as unknown;
    if (type === 'invalidate') {
      if (!scopes(value.scopes)) return null;
      let parsedTarget: InvalidationTarget;
      if (kind === 'all' && record(target, ['kind'])) {
        parsedTarget = { kind: 'all' };
      } else if (
        kind === 'user' &&
        record(target, ['kind', 'userId']) &&
        identity(target.userId)
      ) {
        parsedTarget = { kind: 'user', userId: target.userId };
      } else {
        return null;
      }
      return {
        version: 1,
        eventId: value.eventId,
        type,
        target: parsedTarget,
        scopes: [...value.scopes],
      };
    }
    let parsedTarget: RevocationTarget;
    if (
      kind === 'user' &&
      record(target, ['kind', 'userId']) &&
      identity(target.userId)
    ) {
      parsedTarget = { kind: 'user', userId: target.userId };
    } else if (
      kind === 'session' &&
      record(target, ['kind', 'userId', 'sessionId']) &&
      identity(target.userId) &&
      identity(target.sessionId)
    ) {
      parsedTarget = {
        kind: 'session',
        userId: target.userId,
        sessionId: target.sessionId,
      };
    } else {
      return null;
    }
    return { version: 1, eventId: value.eventId, type, target: parsedTarget };
  });
}

function parseBounded<T>(
  input: unknown,
  parse: (value: unknown) => T | null,
): T | null {
  try {
    let value = input;
    if (typeof input === 'string') {
      if (Buffer.byteLength(input, 'utf8') > REALTIME_LIMITS.maxFrameBytes) {
        return null;
      }
      value = JSON.parse(input) as unknown;
    }
    const parsed = parse(value);
    return parsed !== null &&
      Buffer.byteLength(JSON.stringify(parsed), 'utf8') <=
        REALTIME_LIMITS.maxFrameBytes
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function record(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  if (!plainObject(value)) return false;
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor;
    })
  );
}

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 255
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function scopes(value: unknown): value is RealtimeScope[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 ||
    value.length > 3 ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return false;
    const scope = descriptor.value as unknown;
    if (scope !== 'scores' && scope !== 'rankings' && scope !== 'reminders') {
      return false;
    }
  }
  return new Set(value).size === value.length;
}
