import type { RefreshTokenStore } from './token-store-coordinator';

let refreshToken: string | null = null;

export function createRefreshTokenStore(): RefreshTokenStore {
  return {
    async read() {
      return refreshToken;
    },
    async write(value) {
      refreshToken = value;
    },
    async clear() {
      refreshToken = null;
    },
  };
}
