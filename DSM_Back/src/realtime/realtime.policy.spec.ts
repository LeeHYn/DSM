import {
  createRealtimeId,
  parseAuthentication,
  parseRealtimeBusEvent,
  parseServerEvent,
  REALTIME_CLOSE_CODES,
  REALTIME_LIMITS,
} from './realtime.policy';

const streamId = 'c90ed846-0a13-4f09-901d-cecad7bffbf1';
const auth = {
  event: 'authenticate',
  data: { version: 1, accessToken: 'synthetic.token.signature' },
};
const reset = { event: 'reset', data: { version: 1, streamId, seq: 0 } };
const invalidate = {
  event: 'invalidate',
  data: { version: 1, streamId, seq: 1, scopes: ['scores', 'rankings'] },
};
const bus = {
  version: 1,
  eventId: streamId,
  type: 'invalidate',
  target: { kind: 'user', userId: 'user-1' },
  scopes: ['reminders'],
};

describe('realtime wire policy', () => {
  it('accepts the exact authentication envelope as text and parsed input', () => {
    expect(parseAuthentication(JSON.stringify(auth))).toEqual(auth);
    expect(parseAuthentication(auth)).toEqual(auth);
  });

  it.each([
    null,
    undefined,
    [],
    true,
    1,
    '{}',
    '{',
    'null',
    Buffer.from(JSON.stringify(auth)),
    new ArrayBuffer(8),
    new Uint8Array(8),
    { ...auth, extra: true },
    { ...auth, event: 'refresh' },
    { ...auth, data: null },
    { ...auth, data: [] },
    { ...auth, data: { ...auth.data, version: '1' } },
    { ...auth, data: { ...auth.data, extra: true } },
    { ...auth, data: { ...auth.data, accessToken: '' } },
    { ...auth, data: { ...auth.data, accessToken: '  ' } },
    { ...auth, data: { ...auth.data, accessToken: 123 } },
    { ...auth, data: { version: 1 } },
    JSON.stringify(auth).replace('"data":', '"__proto__":{},"data":'),
    JSON.stringify(auth).replace('"version":1', '"constructor":{},"version":1'),
    Object.assign(Object.create({ inherited: true }) as object, auth),
  ])('rejects malformed authentication input %#', (input) => {
    expect(parseAuthentication(input)).toBeNull();
  });

  it('does not invoke accessors or custom serializers', () => {
    const getter = jest.fn(() => auth.data);
    const input = { event: 'authenticate' };
    Object.defineProperty(input, 'data', { enumerable: true, get: getter });
    expect(parseAuthentication(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const toJSON = jest.fn(() => auth);
    expect(parseAuthentication({ ...auth, toJSON })).toBeNull();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('enforces UTF-8 bytes on both text and parsed frames including envelope', () => {
    const prefix = JSON.stringify({
      ...auth,
      data: { ...auth.data, accessToken: '' },
    });
    const remaining = 4096 - Buffer.byteLength(prefix);
    const exact = {
      ...auth,
      data: { ...auth.data, accessToken: 'a'.repeat(remaining) },
    };
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(4096);
    expect(parseAuthentication(exact)).toEqual(exact);
    expect(parseAuthentication(JSON.stringify(exact))).toEqual(exact);
    const oversized = {
      ...auth,
      data: { ...auth.data, accessToken: '😀'.repeat(1024) },
    };
    expect(parseAuthentication(oversized)).toBeNull();
    expect(parseAuthentication(JSON.stringify(oversized))).toBeNull();
    expect(parseAuthentication(JSON.stringify(exact) + ' ')).toBeNull();
  });

  it('accepts only neutral reset and invalidate server envelopes', () => {
    expect(parseServerEvent(JSON.stringify(reset))).toEqual(reset);
    expect(parseServerEvent(invalidate)).toEqual(invalidate);
    expect(
      parseServerEvent({
        ...invalidate,
        data: { ...invalidate.data, seq: Number.MAX_SAFE_INTEGER },
      }),
    ).not.toBeNull();
  });

  it.each([
    { ...reset, data: { ...reset.data, seq: 1 } },
    { ...reset, data: { ...reset.data, scopes: ['scores'] } },
    { ...invalidate, data: { ...invalidate.data, seq: -1 } },
    { ...invalidate, data: { ...invalidate.data, seq: 0.5 } },
    {
      ...invalidate,
      data: { ...invalidate.data, seq: Number.MAX_SAFE_INTEGER + 1 },
    },
    { ...invalidate, data: { ...invalidate.data, seq: NaN } },
    { ...invalidate, data: { ...invalidate.data, seq: '1' } },
    { ...invalidate, data: { ...invalidate.data, streamId: 'not-a-uuid' } },
    {
      ...invalidate,
      data: {
        ...invalidate.data,
        streamId: streamId.replace('-4f09-', '-1f09-'),
      },
    },
    { ...invalidate, data: { ...invalidate.data, scopes: [] } },
    {
      ...invalidate,
      data: { ...invalidate.data, scopes: ['scores', 'scores'] },
    },
    { ...invalidate, data: { ...invalidate.data, scopes: ['profile'] } },
    {
      ...invalidate,
      data: {
        ...invalidate.data,
        scopes: ['scores', 'rankings', 'reminders', 'scores'],
      },
    },
    { ...invalidate, data: { ...invalidate.data, title: 'private' } },
    { ...invalidate, extra: true },
    { ...invalidate, data: { ...invalidate.data, version: 2 } },
    auth,
  ])('rejects invalid server event %#', (input) => {
    expect(parseServerEvent(input)).toBeNull();
  });

  it('accepts scoped or global invalidation and separate session/user revocation', () => {
    expect(parseRealtimeBusEvent(JSON.stringify(bus))).toEqual(bus);
    const global = { ...bus, target: { kind: 'all' } };
    expect(parseRealtimeBusEvent(global)).toEqual(global);
    for (const target of [
      { kind: 'user', userId: 'user-1' },
      { kind: 'session', userId: 'user-1', sessionId: 'family-1' },
    ]) {
      const revoke = { version: 1, eventId: streamId, type: 'revoke', target };
      expect(parseRealtimeBusEvent(revoke)).toEqual(revoke);
    }
  });

  it.each([
    { ...bus, eventId: 'bad' },
    { ...bus, version: 2 },
    { ...bus, token: 'private' },
    { ...bus, scopes: ['scores', 'scores'] },
    { ...bus, target: { kind: 'user', userId: '' } },
    { ...bus, target: { kind: 'user', userId: ' '.repeat(5) } },
    { ...bus, target: { kind: 'user', userId: 'a'.repeat(256) } },
    { ...bus, target: { kind: 'all', userId: 'user-1' } },
    { ...bus, target: { kind: 'session', userId: 'u', sessionId: 's' } },
    { ...bus, type: 'revoke' },
    { version: 1, eventId: streamId, type: 'revoke', target: { kind: 'all' } },
    {
      version: 1,
      eventId: streamId,
      type: 'revoke',
      target: { kind: 'session', userId: 'u' },
    },
    {
      version: 1,
      eventId: streamId,
      type: 'revoke',
      target: { kind: 'session', userId: 'u', sessionId: null },
    },
  ])('rejects invalid or data-bearing internal events %#', (input) => {
    expect(parseRealtimeBusEvent(input)).toBeNull();
  });

  it('generates unique native UUIDv4 event and stream IDs', () => {
    const ids = Array.from({ length: 100 }, () => createRealtimeId());
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) {
      expect(
        parseServerEvent({ ...reset, data: { ...reset.data, streamId: id } }),
      ).not.toBeNull();
    }
  });

  it('rejects prototype, symbol and accessor keys in every parser', () => {
    const pairs = [
      { parse: parseAuthentication, frame: auth },
      { parse: parseServerEvent, frame: reset },
      { parse: parseRealtimeBusEvent, frame: bus },
    ];
    for (const { parse, frame } of pairs) {
      expect(parse({ ...frame, [Symbol('extra')]: true })).toBeNull();
      expect(parse({ ...frame, constructor: {} })).toBeNull();
      expect(parse('null')).toBeNull();
      expect(parse('[]')).toBeNull();
      expect(parse(JSON.stringify(frame) + ' '.repeat(4096))).toBeNull();
      expect(parse(Buffer.from(JSON.stringify(frame)))).toBeNull();
    }
  });

  it('rejects scope getters and sparse arrays without evaluating them', () => {
    const getter = jest.fn(() => 'scores');
    const values = ['scores'];
    Object.defineProperty(values, '0', { get: getter });
    for (const scopes of [values, new Array<unknown>(1)]) {
      expect(
        parseServerEvent({
          ...invalidate,
          data: { ...invalidate.data, scopes },
        }),
      ).toBeNull();
      expect(parseRealtimeBusEvent({ ...bus, scopes })).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('returns a detached allowlisted projection', () => {
    const source = {
      ...invalidate,
      data: { ...invalidate.data, scopes: ['scores'] },
    };
    const parsed = parseServerEvent(source);
    source.data.scopes.push('private');
    expect(parsed).toEqual({
      ...invalidate,
      data: { ...invalidate.data, scopes: ['scores'] },
    });
  });

  it('exposes immutable instance caps, timers and non-sensitive close codes', () => {
    expect(REALTIME_LIMITS).toEqual({
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
    expect(Object.isFrozen(REALTIME_LIMITS)).toBe(true);
    expect(REALTIME_CLOSE_CODES).toEqual({
      authentication: 4001,
      revoked: 4003,
      limit: 4008,
      expired: 4010,
      unavailable: 1013,
    });
    expect(Object.isFrozen(REALTIME_CLOSE_CODES)).toBe(true);
  });
});
