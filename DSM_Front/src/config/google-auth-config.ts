const SAFE_CONFIGURATION_MESSAGE =
  'Google sign-in configuration is unavailable';

export class GoogleAuthConfigurationError extends Error {
  readonly name = 'GoogleAuthConfigurationError';

  constructor() {
    super(SAFE_CONFIGURATION_MESSAGE);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}

export function isGoogleAuthConfigurationError(
  value: unknown,
): value is GoogleAuthConfigurationError {
  return value instanceof GoogleAuthConfigurationError;
}

export function getGoogleWebClientId(
  value = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
): string {
  const clientId = value?.trim();
  if (!clientId) {
    throw new GoogleAuthConfigurationError();
  }
  return clientId;
}
