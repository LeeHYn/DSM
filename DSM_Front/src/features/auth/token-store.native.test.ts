const mockDeleteItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

import { createRefreshTokenStore } from './token-store.native';

const KEY = 'dsm.auth.refresh-token.v1';
const TOMBSTONE = '__dsm_logged_out_v1__';
const OPTIONS = { requireAuthentication: false };

beforeEach(() => {
  jest.resetAllMocks();
});

it('uses the versioned key and treats the tombstone as empty', async () => {
  mockGetItemAsync.mockResolvedValue(TOMBSTONE);
  const store = createRefreshTokenStore();

  await expect(store.read()).resolves.toBeNull();
  expect(mockGetItemAsync).toHaveBeenCalledWith(KEY);
});

it('returns a stored refresh token', async () => {
  mockGetItemAsync.mockResolvedValue('safe-test-token');
  const store = createRefreshTokenStore();

  await expect(store.read()).resolves.toBe('safe-test-token');
});

it('wraps read failures as a fixed storage error without the token', async () => {
  mockGetItemAsync.mockRejectedValue(new Error('native read failed'));
  const store = createRefreshTokenStore();

  await expect(store.read()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});

it('writes with the versioned key and fixed options', async () => {
  const store = createRefreshTokenStore();

  await expect(store.write('safe-test-token')).resolves.toBeUndefined();
  expect(mockSetItemAsync).toHaveBeenCalledWith(KEY, 'safe-test-token', OPTIONS);
});

it('wraps write failures as a fixed storage error without the token', async () => {
  mockSetItemAsync.mockRejectedValue(new Error('native write failed'));
  const store = createRefreshTokenStore();

  await expect(store.write('safe-test-token')).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});

it('verifies successful deletion left no value', async () => {
  mockGetItemAsync.mockResolvedValue(null);
  const store = createRefreshTokenStore();

  await expect(store.clear()).resolves.toBeUndefined();
  expect(mockDeleteItemAsync).toHaveBeenCalledWith(KEY);
  expect(mockGetItemAsync).toHaveBeenCalledWith(KEY);
  expect(mockSetItemAsync).not.toHaveBeenCalled();
});

it('falls back to a verified tombstone when delete fails', async () => {
  mockDeleteItemAsync.mockRejectedValue(new Error('delete failed'));
  mockGetItemAsync.mockResolvedValue(TOMBSTONE);
  const store = createRefreshTokenStore();

  await expect(store.clear()).resolves.toBeUndefined();
  expect(mockSetItemAsync).toHaveBeenCalledWith(KEY, TOMBSTONE, OPTIONS);
  expect(mockGetItemAsync).toHaveBeenCalledWith(KEY);
});

it('uses the tombstone fallback when deletion leaves a residual value', async () => {
  mockGetItemAsync
    .mockResolvedValueOnce('safe-residual-value')
    .mockResolvedValueOnce(TOMBSTONE);
  const store = createRefreshTokenStore();

  await expect(store.clear()).resolves.toBeUndefined();
  expect(mockSetItemAsync).toHaveBeenCalledWith(KEY, TOMBSTONE, OPTIONS);
});

it('throws a storage error when delete and tombstone verification fail', async () => {
  mockDeleteItemAsync.mockRejectedValue(new Error('delete failed'));
  mockSetItemAsync.mockRejectedValue(new Error('write failed'));
  const store = createRefreshTokenStore();

  await expect(store.clear()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});

it('throws a storage error when tombstone readback is not the exact marker', async () => {
  mockGetItemAsync
    .mockResolvedValueOnce('safe-residual-value')
    .mockResolvedValueOnce('safe-wrong-readback');
  const store = createRefreshTokenStore();

  await expect(store.clear()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});
