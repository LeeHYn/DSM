import * as SecureStore from 'expo-secure-store';

import { ApiError } from '@/lib/api/api-error';

import type { RefreshTokenStore } from './token-store-coordinator';

const KEY = 'dsm.auth.refresh-token.v1';
const TOMBSTONE = '__dsm_logged_out_v1__';
const OPTIONS = { requireAuthentication: false };

function storageError(cause?: unknown): ApiError {
  return new ApiError('storage', 'Secure token storage failed', { cause });
}

export function createRefreshTokenStore(): RefreshTokenStore {
  return {
    async read() {
      try {
        const refreshToken = await SecureStore.getItemAsync(KEY);
        return refreshToken === TOMBSTONE ? null : refreshToken;
      } catch (cause) {
        throw storageError(cause);
      }
    },

    async write(refreshToken) {
      try {
        await SecureStore.setItemAsync(KEY, refreshToken, OPTIONS);
      } catch (cause) {
        throw storageError(cause);
      }
    },

    async clear() {
      try {
        await SecureStore.deleteItemAsync(KEY);
        if ((await SecureStore.getItemAsync(KEY)) === null) {
          return;
        }
      } catch {
        // Fall back to a durable logged-out marker when deletion cannot verify.
      }

      try {
        await SecureStore.setItemAsync(KEY, TOMBSTONE, OPTIONS);
      } catch (cause) {
        throw storageError(cause);
      }

      let readback: string | null;
      try {
        readback = await SecureStore.getItemAsync(KEY);
      } catch (cause) {
        throw storageError(cause);
      }

      if (readback !== TOMBSTONE) {
        throw storageError();
      }
    },
  };
}
