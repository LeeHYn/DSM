import * as Keychain from 'react-native-keychain';

import { ApiError } from '@/lib/api/api-error';

import type { RefreshTokenStore } from './token-store-coordinator';

const KEY = 'dsm.auth.refresh-token.v1';
const TOMBSTONE = '__dsm_logged_out_v1__';
const USERNAME = 'refresh-token';
const OPTIONS = {
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  service: KEY,
};

function storageError(cause?: unknown): ApiError {
  return new ApiError('storage', 'Secure token storage failed', { cause });
}

export function createRefreshTokenStore(): RefreshTokenStore {
  return {
    async read() {
      try {
        const credentials = await Keychain.getGenericPassword({ service: KEY });
        const refreshToken = credentials === false ? null : credentials.password;
        return refreshToken === TOMBSTONE ? null : refreshToken;
      } catch (cause) {
        throw storageError(cause);
      }
    },

    async write(refreshToken) {
      try {
        await Keychain.setGenericPassword(USERNAME, refreshToken, OPTIONS);
      } catch (cause) {
        throw storageError(cause);
      }
    },

    async clear() {
      try {
        await Keychain.resetGenericPassword({ service: KEY });
        if ((await Keychain.getGenericPassword({ service: KEY })) === false) {
          return;
        }
      } catch {
        // Fall back to a durable logged-out marker when deletion cannot verify.
      }

      try {
        await Keychain.setGenericPassword(USERNAME, TOMBSTONE, OPTIONS);
      } catch (cause) {
        throw storageError(cause);
      }

      let readback: false | Keychain.UserCredentials;
      try {
        readback = await Keychain.getGenericPassword({ service: KEY });
      } catch (cause) {
        throw storageError(cause);
      }

      if (readback === false || readback.password !== TOMBSTONE) {
        throw storageError();
      }
    },
  };
}
