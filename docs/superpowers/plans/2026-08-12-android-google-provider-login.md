# Android Google Provider Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Android Google-login placeholder with native Google ID-token acquisition that enters the existing secure DSM session flow and is verified on a physical Android device.

**Architecture:** A provider adapter owns `react-native-nitro-google-signin`, normalizes success/cancellation/failure, and returns only a Google ID token. The existing `SessionController.signIn('GOOGLE', token)` continues to own backend exchange, SecureStore persistence, routing, refresh, and logout. Native build configuration and external Google/EAS setup remain explicit gates.

**Tech Stack:** Expo SDK 55, React Native 0.83.6, React 19.2.0, TypeScript 5.9, Jest 29/jest-expo, React Native Testing Library 14, `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`, `expo-dev-client@55.0.37`, `eas-cli@21.7.1`, EAS Development Build.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-08-12-android-google-provider-login-design.md`.
- First platform/provider scope is Android + Google only. Kakao, iOS, Apple, new backend endpoints, and notification work are excluded.
- Proposed Android application ID is `com.dsm.dailyup`. Product implementation must not start until the user explicitly approves this exact identifier or supplies a replacement.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is public client configuration. Never place a client secret, DSM token, signing key, provider token, or backend credential in an `EXPO_PUBLIC_` value.
- Google ID tokens exist only long enough to call `signIn('GOOGLE', token)` and must never be persisted, logged, included in errors, or written to evidence.
- The existing session controller remains provider-neutral. Do not add Google SDK imports or Google error types to `session-controller.ts` or `session-context.tsx`.
- Each edit stage may modify or create only one or two exact files. Existing worktree changes must be preserved.
- Use TDD for behavior: focused RED, minimal GREEN, focused regression, then broader verification.
- Dependency installation, product-code writes, and local per-task Git commits require approval of this plan. Push, PR, merge, deploy, Google Console mutation, EAS login/project mutation/source upload, remote environment mutation, and device work remain separate approvals.
- Do not run `npm audit fix`, `expo prebuild --clean`, destructive Git commands, database mutations, or secret-printing commands.
- Expo Go, browser-only QA, mocks, and emulator-only checks are not physical-device completion evidence.
- This authentication change requires the repository `change-gate` before milestone closure.

---

## File map

| Path | Responsibility |
|---|---|
| `DSM_Front/package.json` | Pin the three native development dependencies |
| `DSM_Front/package-lock.json` | Reproducible dependency graph |
| `DSM_Front/src/config/google-auth-config.ts` | Validate and return the public Web OAuth client ID without leaking input |
| `DSM_Front/src/config/google-auth-config.test.ts` | Configuration boundary tests |
| `DSM_Front/src/features/auth/google-sign-in.ts` | Native SDK bridge, response normalization, cancellation, and ID-token acquisition |
| `DSM_Front/src/features/auth/google-sign-in.test.ts` | Adapter cascade, concurrency, error, and token-safety tests |
| `DSM_Front/src/app/index.tsx` | Google button orchestration and safe user feedback |
| `DSM_Front/src/__tests__/app/index.test.tsx` | Login-screen interaction and session-boundary tests |
| `DSM_Front/app.json` | Android application ID and Nitro Google config plugin |
| `DSM_Front/.env.example` | Public Google Web client-ID contract |
| `DSM_Front/eas.json` | Internal Android development-build profile |
| `.ai/docs/android-google-provider-login-smoke.md` | Sanitized physical-device evidence |
| `.ai/audits/20260812-change-gate-android-google-login/README.md` | Audit scope, rounds, and closure decision |
| `.ai/audits/20260812-change-gate-android-google-login/findings.jsonl` | Deduplicated structured findings |
| `.ai/memory/{plan,context,checklist,README}.md` | Final actual-state and gate synchronization |

## Spec coverage

| Design requirement | Implemented or verified by |
|---|---|
| Architecture | Tasks 2–4: config boundary, provider adapter, existing session boundary |
| Configuration and build | Tasks 1, 5, 6, and 8: pinned dependencies, Expo config, EAS profile, approved external setup |
| Data flow | Tasks 3 and 4: native cascade → ID token → `SessionController.signIn` |
| Error handling | Tasks 2–4: safe configuration/provider/protocol/session messages and cancellation |
| Testing strategy | Tasks 2–4 and 7: focused RED/GREEN plus full local regression |
| Physical Android smoke | Tasks 8 and 9: approved build, install, login, restart, refresh, logout evidence |
| Security and review gate | Tasks 3, 7, 9, and 10: leakage tests, sentinel scan, evidence privacy, change-gate |
| Implementation boundaries | Global constraints and every task's exact one- or two-file stage |
| Completion criteria | Tasks 7, 9, and 10: automated gate, physical evidence, independent audit, memory closure |

---

### Task 1: Pin native Google and development-build dependencies

**Files:**
- Modify: `DSM_Front/package.json`
- Modify: `DSM_Front/package-lock.json`

**Interfaces:**
- Consumes: Expo SDK `~55.0.24`, React Native `0.83.6`, React `19.2.0`.
- Produces: exact installed versions `react-native-nitro-google-signin@1.3.0`, `react-native-nitro-modules@0.36.5`, and `expo-dev-client@55.0.37`.

- [ ] **Step 1: Capture the missing-dependency baseline**

Run:

```powershell
npm.cmd ls react-native-nitro-google-signin react-native-nitro-modules expo-dev-client --depth=0
```

Expected: exit non-zero and all three packages are absent. If any package is already present, stop and compare its version and lockfile provenance before changing anything.

- [ ] **Step 2: Install only the approved exact versions**

Run:

```powershell
npm.cmd install --save-exact react-native-nitro-google-signin@1.3.0 react-native-nitro-modules@0.36.5 expo-dev-client@55.0.37
```

Expected file scope: only `package.json` and `package-lock.json` change. Do not run an automatic audit fix.

- [ ] **Step 3: Verify dependency resolution and file scope**

Run:

```powershell
npm.cmd ls react-native-nitro-google-signin react-native-nitro-modules expo-dev-client --depth=0
npx.cmd expo install --check
git diff --check -- package.json package-lock.json
git status --short -- package.json package-lock.json
```

Expected: all three exact versions resolve, Expo dependency check exits 0, and only the two allowed files changed in this task.

- [ ] **Step 4: Commit after the approved stage gate**

```powershell
git add -- package.json package-lock.json
git diff --cached --check
git diff --cached --name-only
git commit -m "build(front): add native Google sign-in"
```

---

### Task 2: Add a safe public client-ID configuration boundary

**Files:**
- Create: `DSM_Front/src/config/google-auth-config.test.ts`
- Create: `DSM_Front/src/config/google-auth-config.ts`

**Interfaces:**
- Consumes: `process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` or an injected string in unit tests.
- Produces: `getGoogleWebClientId(value?: string): string`, `GoogleAuthConfigurationError`, and `isGoogleAuthConfigurationError(value: unknown): boolean`.

- [ ] **Step 1: Write the focused failing tests**

Create `src/config/google-auth-config.test.ts` with these cases:

```ts
import {
  getGoogleWebClientId,
  GoogleAuthConfigurationError,
  isGoogleAuthConfigurationError,
} from './google-auth-config';

const originalClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
});

afterAll(() => {
  if (originalClientId === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = originalClientId;
  }
});

it.each([undefined, '', '   '])('rejects missing client ID: %p', (value) => {
  expect(() => getGoogleWebClientId(value)).toThrow(
    GoogleAuthConfigurationError,
  );
});

it('returns a trimmed public Web client ID', () => {
  expect(
    getGoogleWebClientId('  123.apps.googleusercontent.com  '),
  ).toBe('123.apps.googleusercontent.com');
});

it('serializes only a fixed safe configuration error', () => {
  let captured: unknown;
  try {
    getGoogleWebClientId('   ');
  } catch (error) {
    captured = error;
  }

  expect(isGoogleAuthConfigurationError(captured)).toBe(true);
  expect(JSON.stringify(captured)).toBe(
    '{"name":"GoogleAuthConfigurationError","message":"Google sign-in configuration is unavailable"}',
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/config/google-auth-config.test.ts
```

Expected: FAIL because `google-auth-config.ts` does not exist.

- [ ] **Step 3: Implement the minimal validated configuration**

Create `src/config/google-auth-config.ts`:

```ts
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
```

- [ ] **Step 4: Verify GREEN, types, lint, and diff**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/config/google-auth-config.test.ts
npm.cmd run typecheck
npm.cmd run lint -- src/config/google-auth-config.ts src/config/google-auth-config.test.ts
git diff --check -- src/config/google-auth-config.ts src/config/google-auth-config.test.ts
```

Expected: one suite passes; typecheck, lint, and diff check exit 0.

- [ ] **Step 5: Commit after the approved stage gate**

```powershell
git add -- src/config/google-auth-config.ts src/config/google-auth-config.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(front): validate Google client ID"
```

---

### Task 3: Implement the native Google ID-token adapter

**Files:**
- Create: `DSM_Front/src/features/auth/google-sign-in.test.ts`
- Create: `DSM_Front/src/features/auth/google-sign-in.ts`

**Interfaces:**
- Consumes: `getGoogleWebClientId()`, `GoogleOneTapSignIn`, `OneTapResponse`, official response helpers, and `statusCodes.SIGN_IN_CANCELLED`.
- Produces:

```ts
export type GoogleSignInOutcome =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' };

export type GoogleProviderErrorKind =
  | 'configuration'
  | 'in-progress'
  | 'provider'
  | 'protocol';

export interface GoogleSignInAdapter {
  acquireIdToken(): Promise<GoogleSignInOutcome>;
}

export function createGoogleSignInAdapter(
  dependencies: GoogleSignInDependencies,
): GoogleSignInAdapter;

export const googleSignInAdapter: GoogleSignInAdapter;
```

- [ ] **Step 1: Write focused adapter tests**

Use an injected `GoogleSignInDependencies` fake. The fake response type is:

```ts
export type GoogleProviderResponse =
  | { type: 'success'; idToken: string | null }
  | { type: 'no-saved-credential' }
  | { type: 'cancelled' };
```

Use this fixture and these executable test bodies:

```ts
import { GoogleAuthConfigurationError } from '@/config/google-auth-config';

import {
  createGoogleSignInAdapter,
  GoogleProviderError,
  type GoogleProviderResponse,
  type GoogleSignInDependencies,
} from './google-sign-in';

const success = (idToken: string | null): GoogleProviderResponse => ({
  type: 'success',
  idToken,
});
const noSaved: GoogleProviderResponse = { type: 'no-saved-credential' };
const cancelled: GoogleProviderResponse = { type: 'cancelled' };

function createDependencies(): jest.Mocked<GoogleSignInDependencies> {
  return {
    getWebClientId: jest.fn(() => '123.apps.googleusercontent.com'),
    configure: jest.fn(),
    checkPlayServices: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(success(' google-id-token ')),
    createAccount: jest.fn().mockResolvedValue(success('google-id-token')),
    presentExplicitSignIn: jest
      .fn()
      .mockResolvedValue(success('google-id-token')),
    isCancellationError: jest.fn(() => false),
  };
}

it('configures once and returns a trimmed ID token', async () => {
  const dependencies = createDependencies();
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });

  expect(dependencies.configure).toHaveBeenCalledTimes(1);
  expect(dependencies.configure).toHaveBeenCalledWith(
    '123.apps.googleusercontent.com',
  );
});

it('uses the documented no-saved cascade', async () => {
  const dependencies = createDependencies();
  dependencies.signIn.mockResolvedValue(noSaved);
  dependencies.createAccount.mockResolvedValue(noSaved);
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });

  expect(dependencies.signIn).toHaveBeenCalledTimes(1);
  expect(dependencies.createAccount).toHaveBeenCalledTimes(1);
  expect(dependencies.presentExplicitSignIn).toHaveBeenCalledTimes(1);
});

it.each([
  ['response', cancelled],
  ['thrown error', new Error('cancelled')],
])('maps cancellation from a %s', async (source, value) => {
  const dependencies = createDependencies();
  if (source === 'response') {
    dependencies.signIn.mockResolvedValue(value as GoogleProviderResponse);
  } else {
    dependencies.signIn.mockRejectedValue(value);
    dependencies.isCancellationError.mockReturnValue(true);
  }
  const adapter = createGoogleSignInAdapter(dependencies);

  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'cancelled',
  });
});

it.each([null, '', '   '])(
  'rejects a success response with blank token %p',
  async (idToken) => {
    const dependencies = createDependencies();
    dependencies.signIn.mockResolvedValue(success(idToken));
    const adapter = createGoogleSignInAdapter(dependencies);

    await expect(adapter.acquireIdToken()).rejects.toMatchObject({
      name: 'GoogleProviderError',
      kind: 'protocol',
      message: 'Google sign-in failed',
    });
  },
);

it('sanitizes configuration and provider failures', async () => {
  const configurationDependencies = createDependencies();
  configurationDependencies.getWebClientId.mockImplementation(() => {
    throw new GoogleAuthConfigurationError();
  });
  const configurationAdapter = createGoogleSignInAdapter(
    configurationDependencies,
  );
  await expect(configurationAdapter.acquireIdToken()).rejects.toMatchObject({
    kind: 'configuration',
  });

  const providerDependencies = createDependencies();
  providerDependencies.signIn.mockRejectedValue(
    new Error('native-detail-with-token-value'),
  );
  const providerAdapter = createGoogleSignInAdapter(providerDependencies);
  let captured: unknown;
  try {
    await providerAdapter.acquireIdToken();
  } catch (error) {
    captured = error;
  }

  expect(captured).toBeInstanceOf(GoogleProviderError);
  expect(JSON.stringify(captured)).toBe(
    '{"name":"GoogleProviderError","kind":"provider","message":"Google sign-in failed"}',
  );
  expect(JSON.stringify(captured)).not.toContain('native-detail');
  expect(JSON.stringify(captured)).not.toContain('token-value');
});

it('rejects a concurrent acquisition and recovers after settle', async () => {
  const dependencies = createDependencies();
  let resolveSignIn!: (response: GoogleProviderResponse) => void;
  dependencies.signIn.mockReturnValue(
    new Promise((resolve) => {
      resolveSignIn = resolve;
    }),
  );
  const adapter = createGoogleSignInAdapter(dependencies);

  const first = adapter.acquireIdToken();
  await expect(adapter.acquireIdToken()).rejects.toMatchObject({
    kind: 'in-progress',
  });
  expect(dependencies.signIn).toHaveBeenCalledTimes(1);

  resolveSignIn(success('google-id-token'));
  await expect(first).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
  await expect(adapter.acquireIdToken()).resolves.toEqual({
    status: 'success',
    idToken: 'google-id-token',
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/features/auth/google-sign-in.test.ts
```

Expected: FAIL because `google-sign-in.ts` and its exports do not exist.

- [ ] **Step 3: Implement the adapter and private native bridge**

Implement these rules in `src/features/auth/google-sign-in.ts`:

```ts
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
```

`createGoogleSignInAdapter()` must:

1. reject immediately with kind `in-progress` when another acquisition is active;
2. call `getWebClientId()` and `configure()` once, with retry allowed if configuration failed;
3. call `checkPlayServices()`;
4. execute `signIn()` → `createAccount()` → `presentExplicitSignIn()` only when each preceding result is `no-saved-credential`;
5. return `{ status: 'cancelled' }` for response cancellation or a thrown cancellation code;
6. trim and return a non-empty ID token;
7. throw kind `protocol` for any terminal non-success or blank token;
8. map configuration errors to kind `configuration` and all other thrown SDK errors to kind `provider`;
9. clear the in-progress flag in `finally`;
10. never include the response, exception, client ID, user profile, or token in an error or log.

The singleton and exact native configuration are included in the code block. Do not export `nativeDependencies` or `normalizeResponse`.

- [ ] **Step 4: Verify GREEN, types, lint, and token-safety assertions**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/features/auth/google-sign-in.test.ts
npm.cmd run typecheck
npm.cmd run lint -- src/features/auth/google-sign-in.ts src/features/auth/google-sign-in.test.ts
rg -n "console\.|AsyncStorage|SecureStore|idToken.*(log|error)|Authorization" src/features/auth/google-sign-in.ts
git diff --check -- src/features/auth/google-sign-in.ts src/features/auth/google-sign-in.test.ts
```

Expected: focused tests pass; typecheck/lint/diff check exit 0; the safety search returns no matches. A no-match `rg` exit code is expected.

- [ ] **Step 5: Commit after the approved stage gate**

```powershell
git add -- src/features/auth/google-sign-in.ts src/features/auth/google-sign-in.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(front): acquire Google ID tokens"
```

---

### Task 4: Connect the Google button to the existing session

**Files:**
- Modify: `DSM_Front/src/__tests__/app/index.test.tsx`
- Modify: `DSM_Front/src/app/index.tsx`

**Interfaces:**
- Consumes: `googleSignInAdapter.acquireIdToken()`, `isGoogleProviderError()`, and `useSession()` fields `action`, `error`, and `signIn`.
- Produces: one user-initiated Google acquisition, exactly one `signIn('GOOGLE', idToken)` call, safe Korean feedback, and duplicate-click prevention.

- [ ] **Step 1: Replace the placeholder test with interaction RED cases**

Mock `@/features/auth/google-sign-in` and `@/features/auth/session-context`. Preserve the existing prototype-context and router mocks. Add this fixture before the tests:

```ts
const mockAcquireIdToken = jest.fn();
const mockSignIn = jest.fn().mockResolvedValue(undefined);

type MockSessionAction = 'idle' | 'signing-in';
let mockSession: {
  action: MockSessionAction;
  error: Error | null;
  signIn: typeof mockSignIn;
  state: { status: 'unauthenticated' };
} = {
  action: 'idle',
  error: null,
  signIn: mockSignIn,
  state: { status: 'unauthenticated' },
};

function providerError(kind: string) {
  return Object.assign(new Error('Google sign-in failed'), {
    name: 'GoogleProviderError',
    kind,
  });
}

jest.mock('@/features/auth/google-sign-in', () => ({
  googleSignInAdapter: { acquireIdToken: mockAcquireIdToken },
  isGoogleProviderError: (value: unknown) =>
    value instanceof Error && value.name === 'GoogleProviderError',
}));

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockSession,
}));

beforeEach(() => {
  mockSession = {
    action: 'idle',
    error: null,
    signIn: mockSignIn,
    state: { status: 'unauthenticated' },
  };
  mockAcquireIdToken.mockReset();
  mockSignIn.mockReset().mockResolvedValue(undefined);
  mockShowToast.mockReset();
  mockReplace.mockReset();
});
```

Add these executable cases:

```ts
it('passes one acquired Google ID token to the session', async () => {
  mockAcquireIdToken.mockResolvedValue({
    status: 'success',
    idToken: 'google-id-token',
  });
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );

  expect(mockAcquireIdToken).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledWith('GOOGLE', 'google-id-token');
  expect(mockReplace).not.toHaveBeenCalled();
});

it('silently restores the button after user cancellation', async () => {
  mockAcquireIdToken.mockResolvedValue({ status: 'cancelled' });
  await render(<LoginScreen />);

  const googleButton = screen.getByRole('button', {
    name: 'Google로 계속하기',
  });
  await fireEvent.press(googleButton);

  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockShowToast).not.toHaveBeenCalled();
  expect(googleButton).not.toBeDisabled();
});

it.each([
  ['configuration', 'Google 로그인 설정이 필요합니다.'],
  ['provider', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'],
  ['protocol', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.'],
])('shows safe feedback for %s failure', async (kind, message) => {
  mockAcquireIdToken.mockRejectedValue(providerError(kind));
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(message);
  expect(JSON.stringify(mockShowToast.mock.calls)).not.toContain(
    'provider-secret-detail',
  );
});

it('disables provider buttons and ignores duplicate presses while pending', async () => {
  let resolveAcquisition!: (value: { status: 'cancelled' }) => void;
  mockAcquireIdToken.mockReturnValue(
    new Promise((resolve) => {
      resolveAcquisition = resolve;
    }),
  );
  await render(<LoginScreen />);

  const googleButton = screen.getByRole('button', {
    name: 'Google로 계속하기',
  });
  await fireEvent.press(googleButton);
  await fireEvent.press(googleButton);

  expect(mockAcquireIdToken).toHaveBeenCalledTimes(1);
  expect(googleButton).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  ).toBeDisabled();
  expect(mockSignIn).not.toHaveBeenCalled();

  resolveAcquisition({ status: 'cancelled' });
  await waitFor(() => expect(googleButton).not.toBeDisabled());
});

it('keeps provider buttons disabled for a session sign-in action', async () => {
  mockSession.action = 'signing-in';
  await render(<LoginScreen />);

  expect(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  ).toBeDisabled();
});

it('shows a safe message for a newly published session error', async () => {
  mockSession.error = new Error('internal-session-detail');
  await render(<LoginScreen />);

  await waitFor(() =>
    expect(mockShowToast).toHaveBeenCalledWith(
      '로그인에 실패했습니다. 다시 시도해 주세요.',
    ),
  );
  expect(JSON.stringify(mockShowToast.mock.calls)).not.toContain(
    'internal-session-detail',
  );
});

it('keeps Kakao as a placeholder and never replaces routes', async () => {
  await render(<LoginScreen />);

  await fireEvent.press(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  );

  expect(mockShowToast).toHaveBeenCalledWith(
    '소셜 로그인 연결은 다음 단계에서 제공됩니다.',
  );
  expect(mockAcquireIdToken).not.toHaveBeenCalled();
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
```

Import `waitFor` from React Native Testing Library and keep the existing timer cleanup in `afterEach`.

- [ ] **Step 2: Run the focused screen test and verify RED**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/__tests__/app/index.test.tsx
```

Expected: FAIL because the Google button still calls the placeholder handler and the screen does not consume the session or adapter.

- [ ] **Step 3: Implement minimal screen orchestration**

In `src/app/index.tsx`:

- add `useEffect`, `useRef`, and `useState`;
- consume `action`, `error`, and `signIn` from `useSession()`;
- keep `googleRequestInFlightRef` as the synchronous duplicate guard;
- keep `isGooglePending` for rendering;
- call `googleSignInAdapter.acquireIdToken()`;
- return silently for cancellation;
- await `signIn('GOOGLE', result.idToken)` only on success;
- show `Google 로그인 설정이 필요합니다.` for kind `configuration`;
- show `Google 로그인에 실패했습니다. 다시 시도해 주세요.` for every other provider error;
- show `로그인에 실패했습니다. 다시 시도해 주세요.` once for each newly published session error;
- disable Google and Kakao while `isGooglePending || action === 'signing-in'`;
- leave the Kakao placeholder and Apple disabled behavior unchanged;
- do not add `useRouter`, `router.replace`, or any manual navigation.

The handler skeleton is:

```ts
const handleGooglePress = async () => {
  if (googleRequestInFlightRef.current || action === 'signing-in') {
    return;
  }

  googleRequestInFlightRef.current = true;
  setIsGooglePending(true);
  try {
    const result = await googleSignInAdapter.acquireIdToken();
    if (result.status === 'success') {
      await signIn('GOOGLE', result.idToken);
    }
  } catch (error) {
    const message =
      isGoogleProviderError(error) && error.kind === 'configuration'
        ? 'Google 로그인 설정이 필요합니다.'
        : 'Google 로그인에 실패했습니다. 다시 시도해 주세요.';
    showToast(message);
  } finally {
    googleRequestInFlightRef.current = false;
    setIsGooglePending(false);
  }
};
```

Use an error identity ref in `useEffect` so the same session error is not toasted on every render.

- [ ] **Step 4: Verify GREEN and session-boundary regressions**

Run:

```powershell
npm.cmd test -- --runTestsByPath src/__tests__/app/index.test.tsx src/features/auth/session-context.test.tsx src/features/auth/session-routing.test.tsx
npm.cmd run typecheck
npm.cmd run lint -- src/app/index.tsx src/__tests__/app/index.test.tsx
rg -n "useRouter|router\.replace|console\.|SecureStore|AsyncStorage" src/app/index.tsx
git diff --check -- src/app/index.tsx src/__tests__/app/index.test.tsx
```

Expected: all focused suites pass; typecheck/lint/diff check exit 0; the safety search returns no matches.

- [ ] **Step 5: Commit after the approved stage gate**

```powershell
git add -- src/app/index.tsx src/__tests__/app/index.test.tsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(front): connect Google login"
```

---

### Task 5: Configure the Android app and public environment contract

**Files:**
- Modify: `DSM_Front/app.json`
- Modify: `DSM_Front/.env.example`

**Interfaces:**
- Consumes: explicitly approved Android application ID and the installed config plugin.
- Produces: Android package identity, native plugin registration, and a documented blank-by-default public client-ID variable.

- [ ] **Step 1: Stop for application-ID approval**

Required decision: approve `com.dsm.dailyup` or replace it with one exact reverse-DNS identifier. Validate the final value with `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`. Do not edit `app.json` while this decision is absent.

- [ ] **Step 2: Add a failing config assertion before editing**

Run:

```powershell
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123.apps.googleusercontent.com'
npx.cmd expo config --type prebuild --json
```

Expected before the edit: output lacks `android.package` and the `react-native-nitro-google-signin` plugin.

- [ ] **Step 3: Apply the approved app configuration**

In `app.json`:

- set `expo.android.package` to the approved exact application ID;
- append `react-native-nitro-google-signin` to `expo.plugins`;
- do not add `google-services.json`, iOS URL-scheme options, OAuth client IDs, or secrets in this Android/manual-Web-client path.

In `.env.example`, append:

```dotenv
# Public Web OAuth client ID. Leave blank until local or EAS development configuration is approved.
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 4: Verify resolved Expo configuration without generating native folders**

Run:

```powershell
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123.apps.googleusercontent.com'
npx.cmd expo config --type prebuild --json
git diff --check -- app.json .env.example
```

Expected: Expo config resolves with the approved `android.package` and plugin. No `android/` or `ios/` directory is generated.

- [ ] **Step 5: Commit after the approved stage gate**

```powershell
git add -- app.json .env.example
git diff --cached --check
git diff --cached --name-only
git commit -m "build(front): configure Android Google auth"
```

---

### Task 6: Add an internal EAS development-build profile

**Files:**
- Create: `DSM_Front/eas.json`

**Interfaces:**
- Consumes: Expo app configuration from Task 5.
- Produces: an Android APK development-client profile bound to the EAS `development` environment.

- [ ] **Step 1: Confirm the profile is absent**

Run:

```powershell
Test-Path eas.json
```

Expected: `False`.

- [ ] **Step 2: Create the exact EAS profile**

Create `eas.json`:

```json
{
  "cli": {
    "version": "21.7.1"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

- [ ] **Step 3: Verify JSON and local Expo resolution**

Run:

```powershell
Get-Content -Raw eas.json | ConvertFrom-Json | Out-Null
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123.apps.googleusercontent.com'
npx.cmd expo config --type public --json
git diff --check -- eas.json
```

Expected: JSON parsing and Expo config exit 0. No EAS login, project mutation, upload, or build occurs.

- [ ] **Step 4: Commit after the approved stage gate**

```powershell
git add -- eas.json
git diff --cached --check
git diff --cached --name-only
git commit -m "build(front): add EAS development profile"
```

---

### Task 7: Run the complete local automated gate

**Files:**
- No product file changes.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: fresh local automated evidence before any external build.

- [ ] **Step 1: Run focused authentication suites**

```powershell
npm.cmd test -- --runTestsByPath src/config/google-auth-config.test.ts src/features/auth/google-sign-in.test.ts src/__tests__/app/index.test.tsx src/features/auth/session-context.test.tsx src/features/auth/session-controller.test.ts src/features/auth/session-routing.test.tsx
```

Expected: every listed suite passes with zero failed tests.

- [ ] **Step 2: Run the full frontend gate**

```powershell
npm.cmd test -- --runInBand
npm.cmd run typecheck
npm.cmd run lint
```

Expected: full Jest, TypeScript, and non-fixing ESLint exit 0. Existing lint warnings must be reported separately and must not be described as new errors.

- [ ] **Step 3: Run configuration and leakage checks**

```powershell
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123.apps.googleusercontent.com'
npx.cmd expo config --type prebuild --json
rg -n "console\.|AsyncStorage|localStorage|Authorization.*(log|error)|idToken.*(log|error)|providerToken.*(log|error)" src app.json eas.json .env.example
git diff --check
git status --short --branch
```

Expected: Expo resolution and diff check exit 0; leakage search has no new authentication match; Git status contains only the approved branch work and preserved pre-existing memory changes.

- [ ] **Step 4: Stop if any local gate is red**

Do not request EAS or Google Console approval while a local test, typecheck, lint, config resolution, or diff check is failing.

---

### Task 8: Configure Google and EAS under a separate external-action approval

**Files:**
- No repository file changes unless the approved external service returns a required project identifier that must be planned separately.

**Interfaces:**
- Consumes: approved application ID, an Expo/EAS account, a Google Cloud project, its Web OAuth client ID, an Android OAuth client, an EAS Android signing certificate SHA-1, and a physical Android device.
- Produces: an installable Android development APK and matching frontend/backend audience configuration.

- [ ] **Step 1: Stop and request explicit external authorization**

Authorization must separately cover EAS login/project mutation, EAS credential creation or inspection, source upload/build, Google Console OAuth/consent changes, and physical-device installation. Plan approval alone does not authorize this task.

- [ ] **Step 2: Establish the EAS Android signing identity without printing credentials**

After authorization, sign in to EAS, link or create the project, and establish Android development credentials. Record only the SHA-1 fingerprint required for Google registration; never copy the keystore, passwords, access tokens, or private key into chat, Git, logs, or memory.

- [ ] **Step 3: Configure one Google project**

In Google Cloud Console:

1. configure the OAuth consent screen;
2. create or select one Web OAuth client;
3. create an Android OAuth client for the approved package ID and EAS signing SHA-1;
4. keep Web and Android clients in the same Google project;
5. configure backend `GOOGLE_CLIENT_ID` to the same Web client ID used by the frontend;
6. do not create or embed a client secret in the mobile app.

- [ ] **Step 4: Add the public EAS development variable**

Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the EAS `development` environment with plain-text or sensitive visibility. Verify presence without printing the complete value. Do not add it to a committed `.env` file.

- [ ] **Step 5: Build the Android development APK**

Run only after the external approval and configuration checks:

```powershell
npx.cmd eas-cli@21.7.1 build --platform android --profile development
```

Expected: EAS build succeeds and provides an internal-install APK. A successful cloud build alone does not complete the milestone.

---

### Task 9: Execute and document the physical Android smoke

**Files:**
- Create: `.ai/docs/android-google-provider-login-smoke.md`

**Interfaces:**
- Consumes: installed development APK, running local backend reachable from the device, authorized Google test account, and EAS development configuration.
- Produces: sanitized PASS/FAIL evidence for provider login and SecureStore session lifecycle.

- [ ] **Step 1: Create the evidence file with privacy boundaries**

The document must contain:

```markdown
# Android Google Provider Login Smoke Evidence

- Scope: Android physical device + Google provider + DSM secure session
- Result: NOT RUN, PASS, or FAIL
- Application ID: approved public application ID
- App version: public semantic version
- Android version: major/minor only
- Build profile: development
- EAS build identifier: public build identifier when approved for recording
- Account data recorded: none
- Token data recorded: none

## Checks

- [ ] Development APK installs and launches
- [ ] Google account UI opens from the Google button
- [ ] Real provider login reaches onboarding or authenticated tabs
- [ ] Process termination and restart recover the DSM session
- [ ] Authenticated request succeeds after access-token refresh
- [ ] Logout reaches the login route after verified local clearing
- [ ] Restart after logout remains unauthenticated
- [ ] Captured logs contain no Google or DSM token material

## Sanitized failures

Record only step name, safe category, observed timestamp, and retry result.
```

- [ ] **Step 2: Run the smoke in order**

Do not skip restart, refresh, logout, or post-logout restart. Do not take screenshots that expose the Google account chooser, email, user ID, token, authorization header, or backend credential.

- [ ] **Step 3: Record actual evidence**

Set `Result` to `PASS` only when all eight checks pass. Otherwise set `FAIL`, leave failing checks unchecked, and record only sanitized categories. `NOT RUN` is not completion.

- [ ] **Step 4: Verify the evidence file**

Run credential/token sentinel scans approved by the repository, then:

```powershell
git diff --check -- .ai/docs/android-google-provider-login-smoke.md
```

- [ ] **Step 5: Commit only after evidence review approval**

```powershell
git add -- .ai/docs/android-google-provider-login-smoke.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs(front): record Android auth smoke"
```

---

### Task 10: Run the authentication change-gate and synchronize memory

**Files:**
- Create: `.ai/audits/20260812-change-gate-android-google-login/README.md`
- Create: `.ai/audits/20260812-change-gate-android-google-login/findings.jsonl`
- Modify in later one- or two-file stages: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/README.md`

**Interfaces:**
- Consumes: product diff, fresh automated output, physical-device evidence, `.ai/agents/verification-workflow.md`, and the audit schema.
- Produces: deduplicated findings, independent validation, fix-recheck evidence where needed, and accurate final memory.

- [ ] **Step 1: Stop and request explicit agent-delegation approval**

The repository change-gate requires independent finder/validator roles. Do not spawn agents until the user explicitly selects subagent-driven execution or separately authorizes this audit.

- [ ] **Step 2: Open the audit with exact scope and lenses**

Audit lenses:

- provider-token lifetime and leakage;
- Web client-ID/backend audience mismatch;
- duplicate and late-login races;
- session-controller boundary violations;
- cancellation versus OAuth misconfiguration;
- logout, restart, and account-switch behavior;
- dependency and native-config supply-chain risk.

Use the repository severity, validator-count, fingerprint, status-transition, and closure rules. Finder, validator, implementer, and fix-recheck reviewer must remain independent.

- [ ] **Step 3: Resolve or explicitly retain every finding**

No unresolved P0/P1, `UNKNOWN`, unvalidated `FIXED`, or unapproved `ACCEPTED_RISK` may remain at closure. Any confirmed fix requires its own plan, exact one- or two-file allowlist, TDD cycle, and user approval.

- [ ] **Step 4: Update memory in two-file stages**

Stage A: update `.ai/memory/plan.md` and `.ai/memory/checklist.md` with actual commits, tests, external evidence, audit status, and remaining gates.

Stage B: update `.ai/memory/context.md` and `.ai/memory/README.md`, recompute actual byte counts, and preserve all `*.original.md` recovery files.

- [ ] **Step 5: Run the final repository gate**

```powershell
git diff --check
git status --short --branch
```

Re-run the full frontend Jest, typecheck, lint, Expo config, token sentinel, and evidence checks after the last product fix. Report every unexecuted external or device check as unexecuted.

- [ ] **Step 6: Commit audit and memory only under explicit Git approval**

Keep each staged commit within the approved exact file scope. Do not push, open a PR, merge, or deploy without separate approval.

---

## Official references

- Expo SDK 55: <https://docs.expo.dev/versions/v55.0.0/>
- Expo Google authentication: <https://docs.expo.dev/guides/google-authentication/>
- Expo Android development build: <https://docs.expo.dev/tutorial/eas/android-development-build/>
- Expo development builds: <https://docs.expo.dev/develop/development-builds/use-development-builds/>
- EAS environment variables: <https://docs.expo.dev/eas/environment-variables/>
- Nitro Google Sign-In Expo setup: <https://react-native-nitro-google-sign-in.github.io/docs/setup/expo/>
- Nitro Google Sign-In usage: <https://react-native-nitro-google-sign-in.github.io/docs/guide/usage/>
- Nitro Google Sign-In API: <https://react-native-nitro-google-sign-in.github.io/docs/guide/api-reference/>
- Nitro Google Cloud setup: <https://react-native-nitro-google-sign-in.github.io/docs/setup/google-cloud/>
