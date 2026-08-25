import * as Keychain from 'react-native-keychain';

import { ApiError } from '@/lib/api/api-error';

import { createRefreshTokenStore } from './token-store.native';

jest.mock(
  'react-native-keychain',
  () => ({
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
    getGenericPassword: jest.fn(),
    resetGenericPassword: jest.fn(),
    setGenericPassword: jest.fn(),
  }),
  { virtual: true },
);

const mockGetGenericPassword = jest.mocked(Keychain.getGenericPassword);
const mockResetGenericPassword = jest.mocked(Keychain.resetGenericPassword);
const mockSetGenericPassword = jest.mocked(Keychain.setGenericPassword);

const KEY = 'dsm.auth.refresh-token.v1';
const TOMBSTONE = '__dsm_logged_out_v1__';
const OPTIONS = {
  accessible: 'device-only',
  service: KEY,
};

beforeEach(() => {
  jest.resetAllMocks();
});

it('uses a versioned Android Keychain service and treats the tombstone as empty', async () => {
  mockGetGenericPassword.mockResolvedValue({
    password: TOMBSTONE,
    service: KEY,
    storage: 'keychain',
    username: 'refresh-token',
  } as never);

  await expect(createRefreshTokenStore().read()).resolves.toBeNull();
  expect(mockGetGenericPassword).toHaveBeenCalledWith({ service: KEY });
});

it('returns a stored refresh token', async () => {
  mockGetGenericPassword.mockResolvedValue({
    password: 'safe-test-token',
    service: KEY,
    storage: 'keychain',
    username: 'refresh-token',
  } as never);

  await expect(createRefreshTokenStore().read()).resolves.toBe('safe-test-token');
});

it('returns null when the keychain service is empty', async () => {
  mockGetGenericPassword.mockResolvedValue(false);

  await expect(createRefreshTokenStore().read()).resolves.toBeNull();
});

it('wraps read failures as a fixed storage error without the token', async () => {
  mockGetGenericPassword.mockRejectedValue(new Error('native read failed'));

  await expect(createRefreshTokenStore().read()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});

it('writes to the versioned service with device-only accessibility', async () => {
  mockSetGenericPassword.mockResolvedValue({ service: KEY, storage: 'keychain' } as never);

  await expect(
    createRefreshTokenStore().write('safe-test-token'),
  ).resolves.toBeUndefined();
  expect(mockSetGenericPassword).toHaveBeenCalledWith(
    'refresh-token',
    'safe-test-token',
    OPTIONS,
  );
});

it('wraps write failures as a fixed storage error without the token', async () => {
  mockSetGenericPassword.mockRejectedValue(new Error('native write failed'));

  await expect(
    createRefreshTokenStore().write('safe-test-token'),
  ).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});

it('verifies successful deletion left no value', async () => {
  mockResetGenericPassword.mockResolvedValue(true);
  mockGetGenericPassword.mockResolvedValue(false);

  await expect(createRefreshTokenStore().clear()).resolves.toBeUndefined();
  expect(mockResetGenericPassword).toHaveBeenCalledWith({ service: KEY });
  expect(mockGetGenericPassword).toHaveBeenCalledWith({ service: KEY });
  expect(mockSetGenericPassword).not.toHaveBeenCalled();
});

it('falls back to a verified tombstone when deletion fails', async () => {
  mockResetGenericPassword.mockRejectedValue(new Error('delete failed'));
  mockSetGenericPassword.mockResolvedValue({ service: KEY, storage: 'keychain' } as never);
  mockGetGenericPassword.mockResolvedValue({
    password: TOMBSTONE,
    service: KEY,
    storage: 'keychain',
    username: 'refresh-token',
  } as never);

  await expect(createRefreshTokenStore().clear()).resolves.toBeUndefined();
  expect(mockSetGenericPassword).toHaveBeenCalledWith(
    'refresh-token',
    TOMBSTONE,
    OPTIONS,
  );
});

it('uses the tombstone fallback when deletion leaves a residual value', async () => {
  mockResetGenericPassword.mockResolvedValue(true);
  mockSetGenericPassword.mockResolvedValue({ service: KEY, storage: 'keychain' } as never);
  mockGetGenericPassword
    .mockResolvedValueOnce({ password: 'residual' } as never)
    .mockResolvedValueOnce({ password: TOMBSTONE } as never);

  await expect(createRefreshTokenStore().clear()).resolves.toBeUndefined();
  expect(mockSetGenericPassword).toHaveBeenCalledWith(
    'refresh-token',
    TOMBSTONE,
    OPTIONS,
  );
});

it('throws a fixed storage error when fallback write fails', async () => {
  mockResetGenericPassword.mockRejectedValue(new Error('delete failed'));
  mockSetGenericPassword.mockRejectedValue(new ApiError('network', 'native detail'));

  await expect(createRefreshTokenStore().clear()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});
it('throws a fixed storage error when tombstone verification fails', async () => {
  mockResetGenericPassword.mockResolvedValue(true);
  mockSetGenericPassword.mockResolvedValue({ service: KEY, storage: 'keychain' } as never);
  mockGetGenericPassword
    .mockResolvedValueOnce({ password: 'residual' } as never)
    .mockResolvedValueOnce({ password: 'wrong-readback' } as never);

  await expect(createRefreshTokenStore().clear()).rejects.toMatchObject({
    kind: 'storage',
    message: 'Secure token storage failed',
  });
});
