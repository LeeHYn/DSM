import Config from 'react-native-config';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';
import { appleAuthAndroid } from '@invertase/react-native-apple-authentication';

export type AdditionalProviderErrorKind = 'configuration' | 'in-progress' | 'provider' | 'protocol';
export type AdditionalSignInOutcome = { status: 'success'; token: string } | { status: 'cancelled' };
export interface AdditionalSignInAdapter {
  acquireToken(): Promise<AdditionalSignInOutcome>;
}

export class AdditionalProviderError extends Error {
  readonly name = 'AdditionalProviderError';

  constructor(readonly kind: AdditionalProviderErrorKind) {
    super('Social sign-in failed');
  }

  toJSON() {
    return { name: this.name, kind: this.kind, message: this.message };
  }
}

function configuration(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new AdditionalProviderError('configuration');
  }
  return value.trim();
}

function appleConfiguration() {
  const clientId = configuration(Config.APPLE_CLIENT_ID, 255);
  const redirectUri = configuration(Config.APPLE_REDIRECT_URI, 2048);
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(clientId)) throw new AdditionalProviderError('configuration');
  // Avoid React Native's incomplete URL getters; accept an HTTPS DNS authority.
  const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?][^\s\\#]*)?$/i.exec(redirectUri);
  if (!match) throw new AdditionalProviderError('configuration');
  const hostname = match[1].toLowerCase();
  const labels = hostname.split('.');
  const port = match[2] ? Number(match[2]) : 443;
  if (
    hostname.length > 253 || labels.length < 2 || hostname.endsWith('.localhost') ||
    !/^[a-z][a-z0-9-]*$/i.test(labels[labels.length - 1]) ||
    labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
    // eslint-disable-next-line no-control-regex -- Reject raw control bytes in native redirect configuration.
    port < 1 || port > 65535 || /[\u0000-\u0020\u007f]/.test(redirectUri)
  ) throw new AdditionalProviderError('configuration');
  return { clientId, redirectUri };
}

function tokenFrom(response: unknown, key: string): string {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new AdditionalProviderError('protocol');
  }
  const token = (response as Record<string, unknown>)[key];
  if (
    typeof token !== 'string' || token.length === 0 || token.length > 16384 ||
    // eslint-disable-next-line no-control-regex -- Provider tokens must not contain whitespace or control bytes.
    /[\s\u0000-\u001f\u007f]/.test(token)
  ) throw new AdditionalProviderError('protocol');
  return token;
}

function errorCode(error: unknown): string | undefined {
  try {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
  } catch {
    // Native errors are untrusted; do not retain getters, causes or raw messages.
  }
  return undefined;
}

let inProgress = false;

function createAdapter(provider: 'kakao' | 'apple'): AdditionalSignInAdapter {
  return {
    async acquireToken() {
      if (inProgress) throw new AdditionalProviderError('in-progress');
      inProgress = true;
      let phase: 'configuration' | 'provider' = 'configuration';
      try {
        let response: unknown;
        if (provider === 'kakao') {
          const key = configuration(Config.KAKAO_NATIVE_APP_KEY, 32);
          if (!/^[a-f0-9]{32}$/i.test(key)) throw new AdditionalProviderError('configuration');
          await initializeKakaoSDK(key);
          phase = 'provider';
          response = await login();
        } else {
          const options = appleConfiguration();
          if (!appleAuthAndroid.isSupported) throw new AdditionalProviderError('configuration');
          // Reconfigure for every attempt so the native SDK creates fresh UUID
          // state/nonce and hashes the nonce. It also checks the returned state.
          appleAuthAndroid.configure({
            ...options,
            responseType: appleAuthAndroid.ResponseType.ALL,
            scope: appleAuthAndroid.Scope.ALL,
            nonceEnabled: true,
          });
          phase = 'provider';
          response = await appleAuthAndroid.signIn();
        }
        return { status: 'success', token: tokenFrom(response, provider === 'kakao' ? 'accessToken' : 'id_token') };
      } catch (error) {
        if (error instanceof AdditionalProviderError) throw new AdditionalProviderError(error.kind);
        const code = errorCode(error);
        if (phase === 'provider') {
          if ((provider === 'kakao' && code === 'Cancelled') ||
            (provider === 'apple' && code === 'E_SIGNIN_CANCELLED_ERROR')) return { status: 'cancelled' };
          if ((provider === 'kakao' && code === 'Package-SDKNotInitialized') ||
            (provider === 'apple' && code === 'E_NOT_CONFIGURED_ERROR')) {
            throw new AdditionalProviderError('configuration');
          }
        }
        throw new AdditionalProviderError(phase);
      } finally {
        inProgress = false;
      }
    },
  };
}

export const kakaoSignInAdapter = createAdapter('kakao');
export const appleSignInAdapter = createAdapter('apple');
