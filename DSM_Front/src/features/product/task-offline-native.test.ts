import type { StringStorage } from './task-offline-storage';

const mockValues = new Map<string, string>();
const mockStorage: jest.Mocked<StringStorage> = {
  getItem: jest.fn(async key => mockValues.get(key) ?? null),
  setItem: jest.fn(async (key, value) => { mockValues.set(key, value); }),
  removeItem: jest.fn(async key => { mockValues.delete(key); }),
};
const mockCreateStorage = jest.fn(() => mockStorage);
const mockNativeEntropy = jest.fn(() => 'AAECAwQFBgcICQoLDA0ODw==');
const mockGetEnforcing = jest.fn(() => ({ getRandomBase64: mockNativeEntropy }));
const mockUuid = jest.fn(() => '00010203-0405-4607-8809-0a0b0c0d0e0f');
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: (...args: unknown[]) => mockCreateStorage(...args as []),
}));
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('react-native', () => ({
  TurboModuleRegistry: { getEnforcing: (...args: unknown[]) => mockGetEnforcing(...args as []) },
}));
jest.mock('uuid', () => ({ v4: (...args: unknown[]) => mockUuid(...args as []) }));

type NativeAdapter = typeof import('./task-offline-native');
type Runtime = typeof globalThis & { RN$Bridgeless?: boolean; nativeCallSyncHook?: () => void };
const runtime = globalThis as Runtime;
const originalBridgeless = runtime.RN$Bridgeless;
const originalHook = runtime.nativeCallSyncHook;
function load(): NativeAdapter {
  let adapter!: NativeAdapter;
  jest.isolateModules(() => { adapter = require('./task-offline-native'); });
  return adapter;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValues.clear();
  mockCreateStorage.mockImplementation(() => mockStorage);
  mockStorage.setItem.mockImplementation(async (key, value) => { mockValues.set(key, value); });
  mockNativeEntropy.mockReturnValue('AAECAwQFBgcICQoLDA0ODw==');
  mockGetEnforcing.mockImplementation(() => ({ getRandomBase64: mockNativeEntropy }));
  mockUuid.mockReturnValue('00010203-0405-4607-8809-0a0b0c0d0e0f');
  runtime.RN$Bridgeless = true;
  delete runtime.nativeCallSyncHook;
});

afterAll(() => {
  if (originalBridgeless === undefined) delete runtime.RN$Bridgeless;
  else runtime.RN$Bridgeless = originalBridgeless;
  if (originalHook === undefined) delete runtime.nativeCallSyncHook;
  else runtime.nativeCallSyncHook = originalHook;
});

test('opens lazily, reuses one account writer, and creates one named native database', async () => {
  const { getOfflineTaskStorage } = load();
  expect(mockCreateStorage).not.toHaveBeenCalled();
  const store = getOfflineTaskStorage('owner');
  expect(getOfflineTaskStorage('owner')).toBe(store);
  expect(mockStorage.getItem).not.toHaveBeenCalled();
  expect(mockCreateStorage).toHaveBeenCalledTimes(1);
  expect(mockCreateStorage).toHaveBeenCalledWith('dsm_tasks_v1');
  await store.open();
  expect(mockStorage.getItem).toHaveBeenCalledWith('dsm.tasks.offline.v1:owner');
});

test('different owners remain isolated in the shared native string backing', async () => {
  const { getOfflineTaskStorage } = load();
  const a = getOfflineTaskStorage('a');
  const b = getOfflineTaskStorage('b');
  expect(a).not.toBe(b);
  await a.update(draft => { draft.lastLogicalTime = 1; });
  expect((await b.open()).lastLogicalTime).toBe(0);
  expect(mockValues.has('dsm.tasks.offline.v1:a')).toBe(true);
  expect(mockValues.has('dsm.tasks.offline.v1:b')).toBe(false);
});

test('reloading the module reconstructs the envelope from native string backing', async () => {
  const first = load().getOfflineTaskStorage('owner');
  const persisted = await first.update(draft => { draft.lastLogicalTime = 12; });
  const restarted = load().getOfflineTaskStorage('owner');
  expect(restarted).not.toBe(first);
  expect(await restarted.open()).toEqual(persisted);
});

test('native write failure preserves the published and persisted revision', async () => {
  const store = load().getOfflineTaskStorage('owner');
  await store.update(draft => { draft.lastLogicalTime = 12; });
  const before = mockValues.get('dsm.tasks.offline.v1:owner');
  mockStorage.setItem.mockRejectedValueOnce(new Error('synthetic private detail'));
  await expect(store.update(draft => { draft.lastLogicalTime = 13; })).rejects.toMatchObject({ kind: 'write' });
  expect(store.getSnapshot()?.lastLogicalTime).toBe(12);
  expect(mockValues.get('dsm.tasks.offline.v1:owner')).toBe(before);
});

test('bounds account instances at ten without evicting or replacing existing writers', () => {
  const { getOfflineTaskStorage } = load();
  const first = getOfflineTaskStorage('owner-0');
  for (let i = 1; i < 10; i++) getOfflineTaskStorage(`owner-${i}`);
  expect(() => getOfflineTaskStorage('owner-10')).toThrow();
  try { getOfflineTaskStorage('owner-10'); } catch (error) {
    expect(error).toMatchObject({ kind: 'limit' });
  }
  expect(getOfflineTaskStorage('owner-0')).toBe(first);
  expect(mockStorage.removeItem).not.toHaveBeenCalled();
});

test('invalid owners do not occupy the account cache', () => {
  const { getOfflineTaskStorage } = load();
  for (let i = 0; i < 15; i++) expect(() => getOfflineTaskStorage(' ')).toThrow();
  expect(() => getOfflineTaskStorage('owner')).not.toThrow();
});

test('native database creation errors are safe and a later call can recover', () => {
  const { getOfflineTaskStorage } = load();
  mockCreateStorage.mockImplementationOnce(() => { throw new Error('synthetic private detail'); });
  try { getOfflineTaskStorage('owner'); } catch (error) {
    expect(String(error)).not.toContain('private');
    expect(JSON.stringify(error)).not.toContain('private');
  }
  expect(() => getOfflineTaskStorage('owner')).not.toThrow();
});

test('passes exactly sixteen decoded native bytes to uuid v4 and never uses Math.random', () => {
  const { createTaskMutationId } = load();
  const random = jest.spyOn(Math, 'random').mockImplementation(() => { throw new Error('insecure'); });
  try {
    expect(createTaskMutationId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(mockGetEnforcing).toHaveBeenCalledWith('RNGetRandomValues');
    expect(mockNativeEntropy).toHaveBeenCalledWith(16);
    expect(mockUuid).toHaveBeenCalledWith({ random: Uint8Array.from({ length: 16 }, (_, i) => i) });
    expect(random).not.toHaveBeenCalled();
  } finally { random.mockRestore(); }
});

test('each ID requests fresh native bytes', () => {
  const { createTaskMutationId } = load();
  createTaskMutationId(); createTaskMutationId();
  expect(mockNativeEntropy).toHaveBeenCalledTimes(2);
  expect(mockUuid).toHaveBeenCalledTimes(2);
});

test('decodes all byte values correctly across base64 boundaries', () => {
  const { createTaskMutationId } = load();
  for (let offset = 0; offset < 256; offset += 16) {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => offset + i);
    mockNativeEntropy.mockReturnValue(Buffer.from(bytes).toString('base64'));
    createTaskMutationId();
    expect(mockUuid).toHaveBeenLastCalledWith({ random: bytes });
  }
});

test('rejects the remote Chrome fallback environment before any random generation', () => {
  const { createTaskMutationId } = load();
  runtime.RN$Bridgeless = false;
  delete runtime.nativeCallSyncHook;
  expect(() => createTaskMutationId()).toThrow();
  expect(mockNativeEntropy).not.toHaveBeenCalled();
  expect(mockUuid).not.toHaveBeenCalled();
});

test('accepts a native synchronous hook in a non-bridgeless runtime', () => {
  const { createTaskMutationId } = load();
  runtime.RN$Bridgeless = false;
  runtime.nativeCallSyncHook = () => {};
  expect(createTaskMutationId()).toMatch(/^[a-f0-9-]{36}$/);
});

test('missing native entropy fails closed with a safe error', () => {
  const { createTaskMutationId } = load();
  mockGetEnforcing.mockImplementation(() => { throw new Error('synthetic private detail'); });
  expect(() => createTaskMutationId()).toThrow('Task identifier could not be generated');
  try { createTaskMutationId(); } catch (error) {
    expect(String(error)).not.toContain('private');
    expect(JSON.stringify(error)).not.toContain('private');
  }
  expect(mockUuid).not.toHaveBeenCalled();
});

test('does not use existing global crypto providers', () => {
  const { createTaskMutationId } = load();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const getRandomValues = jest.fn(() => { throw new Error('unexpected JS random'); });
  const randomUUID = jest.fn(() => { throw new Error('unexpected JS UUID'); });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true, value: { getRandomValues, randomUUID },
  });
  try {
    expect(() => createTaskMutationId()).not.toThrow();
    expect(getRandomValues).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'crypto', previous);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

test.each(['', 'AAECAwQFBgcICQoLDA0ODw=', 'AAECAwQFBgcICQoLDA0ODx==',
  'AAECAwQFBgcICQoLDA0ODw==\n', '!!!!!!!!!!!!!!!!!!!!!!==',
  'AAECAwQFBgcICQoLDA0ODxA='])('rejects malformed native base64 %p', value => {
  const { createTaskMutationId } = load();
  mockNativeEntropy.mockReturnValue(value);
  expect(() => createTaskMutationId()).toThrow();
  expect(mockUuid).not.toHaveBeenCalled();
});

test('native random failure is redacted and retry uses the native provider again', () => {
  const { createTaskMutationId } = load();
  mockNativeEntropy.mockImplementationOnce(() => { throw new Error('synthetic private detail'); });
  expect(() => createTaskMutationId()).toThrow('Task identifier could not be generated');
  expect(() => createTaskMutationId()).not.toThrow();
});

test('rejects invalid uuid provider output', () => {
  const { createTaskMutationId } = load();
  mockUuid.mockReturnValue('malformed');
  expect(() => createTaskMutationId()).toThrow();
});
