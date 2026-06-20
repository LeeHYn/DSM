import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isAuthTokens, type AuthTokens } from './token-types';

const STORAGE_KEY = 'dsm.auth.tokens';

function canUseWebStorage(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

export async function readStoredTokens(): Promise<AuthTokens | null> {
  const raw = canUseWebStorage()
    ? window.localStorage.getItem(STORAGE_KEY)
    : await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isAuthTokens(parsed)) {
      return parsed;
    }

    await clearStoredTokens();
    return null;
  } catch {
    await clearStoredTokens();
    return null;
  }
}

export async function writeStoredTokens(tokens: AuthTokens): Promise<void> {
  const raw = JSON.stringify(tokens);
  if (canUseWebStorage()) {
    window.localStorage.setItem(STORAGE_KEY, raw);
    return;
  }

  await SecureStore.setItemAsync(STORAGE_KEY, raw);
}

export async function clearStoredTokens(): Promise<void> {
  if (canUseWebStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
