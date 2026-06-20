import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  loginWithProviderToken,
  logout,
  refreshAuthTokens,
  type SocialProvider,
} from '@/features/auth/auth.api';
import { ApiError } from '@/lib/api/api-error';
import { configureHttpClient } from '@/lib/api/http-client';
import type { AuthTokens } from '@/lib/auth/token-types';
import {
  clearStoredTokens,
  readStoredTokens,
  writeStoredTokens,
} from '@/lib/auth/token-storage';

export type AuthStatus = 'bootstrapping' | 'signedOut' | 'signedIn' | 'error';

export type AuthContextValue = {
  status: AuthStatus;
  tokens: AuthTokens | null;
  signInWithProviderToken: (
    provider: SocialProvider,
    token: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const tokensRef = useRef<AuthTokens | null>(null);

  const applySessionTokens = useCallback((nextTokens: AuthTokens | null) => {
    tokensRef.current = nextTokens;
    setTokens(nextTokens);
    setStatus(nextTokens ? 'signedIn' : 'signedOut');
  }, []);

  const setSessionTokens = useCallback(async (nextTokens: AuthTokens | null) => {
    if (nextTokens) {
      await writeStoredTokens(nextTokens);
      applySessionTokens(nextTokens);
      return;
    }

    try {
      await clearStoredTokens();
    } finally {
      applySessionTokens(null);
    }
  }, [applySessionTokens]);

  useEffect(() => {
    configureHttpClient({
      getTokens: () => tokensRef.current,
      setTokens: setSessionTokens,
      refreshTokens: refreshAuthTokens,
    });
  }, [setSessionTokens]);

  useEffect(() => {
    let mounted = true;

    async function bootstrapTokens() {
      try {
        const storedTokens = await readStoredTokens();
        if (!mounted) {
          return;
        }

        applySessionTokens(storedTokens);
      } catch {
        if (mounted) {
          applySessionTokens(null);
          setStatus('error');
        }
      }
    }

    void bootstrapTokens();

    return () => {
      mounted = false;
    };
  }, [applySessionTokens]);

  const signInWithProviderToken = useCallback(
    async (provider: SocialProvider, token: string) => {
      const nextTokens = await loginWithProviderToken({ provider, token });
      await setSessionTokens(nextTokens);
    },
    [setSessionTokens],
  );

  const signOut = useCallback(async () => {
    const currentTokens = tokensRef.current;

    if (currentTokens) {
      try {
        await logout({ refreshToken: currentTokens.refreshToken });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            const nextTokens = await refreshAuthTokens(
              currentTokens.refreshToken,
            );
            applySessionTokens(nextTokens);
            await logout({ refreshToken: nextTokens.refreshToken });
          } catch {
            // Local session cleanup should still complete when revoke fails.
          }
        }
        // Local session cleanup should still complete when logout is rejected.
      }
    }

    await setSessionTokens(null);
  }, [applySessionTokens, setSessionTokens]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      tokens,
      signInWithProviderToken,
      signOut,
    }),
    [signInWithProviderToken, signOut, status, tokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
