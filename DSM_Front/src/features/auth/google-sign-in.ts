import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  type OneTapResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import {
  getGoogleWebClientId,
  isGoogleAuthConfigurationError,
} from '@/config/google-auth-config';

export type GoogleSignInOutcome =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' };

export type GoogleProviderErrorKind =
  | 'configuration'
  | 'in-progress'
  | 'provider'
  | 'protocol';

export class GoogleProviderError extends Error {
  readonly name = 'GoogleProviderError';

  constructor(readonly kind: GoogleProviderErrorKind) {
    super('Google sign-in failed');
  }

  toJSON() {
    return { name: this.name, kind: this.kind, message: this.message };
  }
}

export function isGoogleProviderError(
  value: unknown,
): value is GoogleProviderError {
  return value instanceof GoogleProviderError;
}

export type GoogleProviderResponse =
  | { type: 'success'; idToken: string | null }
  | { type: 'no-saved-credential' }
  | { type: 'cancelled' };

export interface GoogleSignInDependencies {
  getWebClientId(): string;
  configure(webClientId: string): void;
  checkPlayServices(): Promise<void>;
  signIn(): Promise<GoogleProviderResponse>;
  createAccount(): Promise<GoogleProviderResponse>;
  presentExplicitSignIn(): Promise<GoogleProviderResponse>;
  isCancellationError(error: unknown): boolean;
}

export interface GoogleSignInAdapter {
  acquireIdToken(): Promise<GoogleSignInOutcome>;
}

export function createGoogleSignInAdapter(
  dependencies: GoogleSignInDependencies,
): GoogleSignInAdapter {
  let configured = false;
  let inProgress = false;

  return {
    async acquireIdToken() {
      if (inProgress) {
        throw new GoogleProviderError('in-progress');
      }

      inProgress = true;
      try {
        if (!configured) {
          dependencies.configure(dependencies.getWebClientId());
          configured = true;
        }

        await dependencies.checkPlayServices();
        let response = await dependencies.signIn();
        if (response.type === 'no-saved-credential') {
          response = await dependencies.createAccount();
        }
        if (response.type === 'no-saved-credential') {
          response = await dependencies.presentExplicitSignIn();
        }
        if (response.type === 'cancelled') {
          return { status: 'cancelled' };
        }
        if (response.type !== 'success') {
          throw new GoogleProviderError('protocol');
        }

        const idToken = response.idToken?.trim();
        if (!idToken) {
          throw new GoogleProviderError('protocol');
        }
        return { status: 'success', idToken };
      } catch (error) {
        if (dependencies.isCancellationError(error)) {
          return { status: 'cancelled' };
        }
        if (isGoogleAuthConfigurationError(error)) {
          throw new GoogleProviderError('configuration');
        }
        if (isGoogleProviderError(error)) {
          throw error;
        }
        throw new GoogleProviderError('provider');
      } finally {
        inProgress = false;
      }
    },
  };
}

function normalizeResponse(response: OneTapResponse): GoogleProviderResponse {
  if (isSuccessResponse(response)) {
    return { type: 'success', idToken: response.data.idToken };
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    return { type: 'no-saved-credential' };
  }
  if (isCancelledResponse(response)) {
    return { type: 'cancelled' };
  }
  throw new GoogleProviderError('protocol');
}

const nativeDependencies: GoogleSignInDependencies = {
  getWebClientId: getGoogleWebClientId,
  configure(webClientId) {
    GoogleOneTapSignIn.configure({
      webClientId,
      offlineAccess: false,
      autoSelectOnSignIn: false,
    });
  },
  checkPlayServices: () => GoogleOneTapSignIn.checkPlayServices(),
  signIn: async () => normalizeResponse(await GoogleOneTapSignIn.signIn()),
  createAccount: async () =>
    normalizeResponse(await GoogleOneTapSignIn.createAccount()),
  presentExplicitSignIn: async () =>
    normalizeResponse(await GoogleOneTapSignIn.presentExplicitSignIn()),
  isCancellationError(error) {
    return (
      isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED
    );
  },
};

export const googleSignInAdapter =
  createGoogleSignInAdapter(nativeDependencies);
