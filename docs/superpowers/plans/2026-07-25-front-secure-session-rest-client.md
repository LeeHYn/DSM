# Front Secure Session and REST API Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum Backend onboarding/CORS contract and an Expo SDK 55 secure native session plus lightweight REST client, while keeping Web sessions memory-only.

**Architecture:** `DSM_Back` adds account-global onboarding state and exact-origin CORS. `DSM_Front` uses a runtime-validated `fetch` transport, public auth API, single-flight authenticated client, serialized refresh-token storage, and an explicit session state machine exposed through React context and Expo Router protected routes.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 17, Expo SDK 55, Expo Router 55, React 19.2, React Native 0.83, TypeScript, `expo-secure-store`, Jest, `jest-expo`, React Native Testing Library.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-07-25-front-secure-session-rest-client-design.md`.
- Read `DSM_Front/AGENTS.md` and the exact Expo SDK 55 documentation before Front code changes.
- Keep access tokens in memory only.
- Store refresh tokens in iOS/Android SecureStore and Web memory only.
- Do not use `localStorage`, `sessionStorage`, IndexedDB, cookies, Axios, or TanStack Query.
- Do not implement Google/Kakao provider-token acquisition or a development auth bypass.
- Do not connect Task, Category, Ranking, FCM, or WebSocket APIs.
- Use runtime response validation; TypeScript assertions alone are insufficient.
- Never log access tokens, refresh tokens, provider tokens, auth request bodies, or `Authorization` headers.
- Refresh is single-flight, never automatically retried, and each failed authenticated request is replayed at most once.
- Token-store mutation uses a serialized queue and `sessionEpoch` fencing.
- CORS uses exact browser origins, allows requests without `Origin`, and sets `credentials: false`.
- Every edit task changes at most two files.
- Every behavior task follows red-green-refactor; configuration-only tasks use explicit validation commands.
- Git stage/commit commands require action-time user approval unless the user explicitly grants plan-wide Git write approval.
- Local persistent PostgreSQL migration application requires explicit approval at execution time; remote/production DB access remains prohibited.
- Preserve the existing unrelated working-tree change in `.ai/docs/2026-07-15-current-project-architecture.md`.
- Apply the project `change-gate` because this work changes authentication, concurrency, and persisted schema.

---

## File Structure

### Backend

- `DSM_Back/prisma/schema.prisma`: nullable account-global onboarding timestamp.
- `DSM_Back/prisma/migrations/20260725_user_onboarding_completed_at/migration.sql`: append-only onboarding migration.
- `DSM_Back/src/auth/auth.service.ts`: current-user projection and idempotent onboarding completion.
- `DSM_Back/src/auth/auth.service.spec.ts`: service behavior and conditional-write tests.
- `DSM_Back/src/auth/auth.controller.ts`: expanded `/auth/me` and onboarding endpoint.
- `DSM_Back/src/auth/auth.controller.spec.ts`: controller delegation and response tests.
- `DSM_Back/src/config/env.validation.ts`: strict `CORS_ORIGINS` parser.
- `DSM_Back/src/config/env.validation.spec.ts`: allowlist validation tests.
- `DSM_Back/src/app.bootstrap.ts`: exact-origin CORS callback.
- `DSM_Back/src/app.bootstrap.spec.ts`: origin/no-origin/credential policy tests.
- `DSM_Back/.env.example`: local browser-origin example.
- `DSM_Back/test/set-env.ts`: deterministic empty CORS allowlist for tests.

### Front foundation

- `DSM_Front/package.json` and `DSM_Front/package-lock.json`: SecureStore, Jest, RNTL, ESLint dependencies and scripts.
- `DSM_Front/eslint.config.js`: Expo SDK 55 Flat Config.
- `DSM_Front/jest.config.js`: `jest-expo` configuration.
- `DSM_Front/app.json`: SecureStore config plugin.
- `DSM_Front/.env.example`: public API base URL example only.
- `DSM_Front/src/config/api-config.ts`: strict API base URL validation.
- `DSM_Front/src/config/api-config.test.ts`: URL policy tests.

### Front API

- `DSM_Front/src/lib/api/api-error.ts`: sanitized error taxonomy.
- `DSM_Front/src/lib/api/api-error.test.ts`: safe serialization tests.
- `DSM_Front/src/lib/api/auth-contracts.ts`: provider, token, and current-user runtime validators.
- `DSM_Front/src/lib/api/auth-contracts.test.ts`: boundary and malformed-response tests.
- `DSM_Front/src/lib/api/http-client.ts`: timeout-aware JSON/204 transport.
- `DSM_Front/src/lib/api/http-client.test.ts`: protocol, timeout, and no-retry tests.
- `DSM_Front/src/lib/api/auth-api.ts`: login, refresh, and best-effort logout functions.
- `DSM_Front/src/lib/api/auth-api.test.ts`: endpoint contract tests.
- `DSM_Front/src/lib/api/authenticated-client.ts`: Bearer injection, single replay, and refresh coordination.
- `DSM_Front/src/lib/api/authenticated-client.test.ts`: concurrent `401` and replay tests.

### Front session

- `DSM_Front/src/features/auth/token-store-coordinator.ts`: store contract, mutation queue, and epoch-aware writes.
- `DSM_Front/src/features/auth/token-store-coordinator.test.ts`: ordering and stale-write tests.
- `DSM_Front/src/features/auth/token-store.native.ts`: SecureStore adapter with verified clear/tombstone.
- `DSM_Front/src/features/auth/token-store.native.test.ts`: SecureStore failure-path tests.
- `DSM_Front/src/features/auth/token-store.web.ts`: module-memory adapter.
- `DSM_Front/src/features/auth/token-store.web.test.ts`: non-persistence and no-browser-storage tests.
- `DSM_Front/src/features/auth/session-controller.ts`: session state machine and actions.
- `DSM_Front/src/features/auth/session-controller.test.ts`: bootstrap, offline, login, refresh, onboarding, and logout races.
- `DSM_Front/src/features/auth/session-context.tsx`: React context and default dependency assembly.
- `DSM_Front/src/features/auth/session-context.test.tsx`: bootstrap-once and subscription tests.
- `DSM_Front/src/features/auth/session-routing.tsx`: protected-route guards.
- `DSM_Front/src/features/auth/session-routing.test.tsx`: state-to-route mapping tests.

### Front screens and integration

- `DSM_Front/src/app/session-recovery.tsx`: offline/storage recovery UI.
- `DSM_Front/src/app/session-recovery.test.tsx`: retry-state UI tests.
- `DSM_Front/src/app/_layout.tsx`: providers, splash lifetime, and protected stack.
- `DSM_Front/src/app/index.tsx`: remove prototype login bypass.
- `DSM_Front/src/app/index.test.tsx`: provider-SDK-pending login behavior.
- `DSM_Front/src/app/tutorial.tsx`: canonical onboarding completion.
- `DSM_Front/src/app/tutorial.test.tsx`: finish/skip/error behavior.
- `DSM_Front/src/app/(tabs)/mypage.tsx`: local-first session logout.
- `DSM_Front/src/app/(tabs)/mypage.test.tsx`: logout integration.

### Audit and memory

- `.ai/audits/20260725-change-gate-front-secure-session/README.md`: audit scope, evidence, and closure.
- `.ai/audits/20260725-change-gate-front-secure-session/findings.jsonl`: deduplicated findings ledger.
- `.ai/memory/context.md`: implementation and verification snapshot.
- `.ai/memory/checklist.md`: milestone progress.
- `.ai/memory/plan.md`: next authorized work and residual gates.

---

### Task 1: Add the account-global onboarding column

**Files:**

- Modify: `DSM_Back/prisma/schema.prisma`
- Create: `DSM_Back/prisma/migrations/20260725_user_onboarding_completed_at/migration.sql`

**Interfaces:**

- Produces: Prisma `User.onboardingCompletedAt: Date | null`.
- Consumes: existing PostgreSQL `User` table and UTC `timestamptz(6)` policy.

- [ ] **Step 1: Add the nullable Prisma field**

Add this exact field beside the existing user timestamps:

```prisma
onboardingCompletedAt DateTime? @db.Timestamptz(6)
```

- [ ] **Step 2: Add the append-only migration**

```sql
ALTER TABLE "User"
ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ(6);
```

- [ ] **Step 3: Format and validate without applying the migration**

Run from `DSM_Back`:

```powershell
npx.cmd prisma format
npx.cmd prisma validate
npx.cmd prisma generate
```

Expected: all commands exit `0`; no database state changes.

- [ ] **Step 4: Verify schema and SQL parity**

```powershell
rg -n "onboardingCompletedAt" prisma/schema.prisma prisma/migrations/20260725_user_onboarding_completed_at/migration.sql
```

Expected: Prisma uses `DateTime? @db.Timestamptz(6)` and SQL uses nullable `TIMESTAMPTZ(6)`.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- prisma/schema.prisma prisma/migrations/20260725_user_onboarding_completed_at/migration.sql
git commit -m "feat(auth): add onboarding timestamp"
```

### Task 2: Implement current-user and onboarding service behavior

**Files:**

- Modify: `DSM_Back/src/auth/auth.service.spec.ts`
- Modify: `DSM_Back/src/auth/auth.service.ts`

**Interfaces:**

- Produces: `CurrentUser`, `getCurrentUser(userId)`, and `completeOnboarding(userId)`.
- Consumes: `User.onboardingCompletedAt` from Task 1.

- [ ] **Step 1: Extend the Prisma mock and write failing tests**

Add `user.updateMany` to `makePrismaMock()` and add:

```ts
describe('current user onboarding', () => {
  it('returns the canonical current-user projection', async () => {
    const completedAt = new Date('2026-07-25T00:00:00.000Z');
    prismaMock.user.findUnique.mockResolvedValue({
      id: MOCK_USER.id,
      onboardingCompletedAt: completedAt,
    });

    await expect(service.getCurrentUser(MOCK_USER.id)).resolves.toEqual({
      userId: MOCK_USER.id,
      onboardingCompletedAt: completedAt,
    });
  });

  it('sets onboarding only while the canonical value is null', async () => {
    const completedAt = new Date('2026-07-25T00:00:00.000Z');
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: MOCK_USER.id,
      onboardingCompletedAt: completedAt,
    });

    const result = await service.completeOnboarding(MOCK_USER.id, completedAt);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: MOCK_USER.id,
        onboardingCompletedAt: null,
      },
      data: { onboardingCompletedAt: completedAt },
    });
    expect(result.onboardingCompletedAt).toEqual(completedAt);
  });

  it('rejects a deleted user referenced by an old access token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.getCurrentUser(MOCK_USER.id)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npm.cmd test -- --runInBand auth/auth.service.spec.ts
```

Expected: FAIL because the two service methods and mock delegate are not implemented.

- [ ] **Step 3: Implement the projection and conditional completion**

Add:

```ts
export type CurrentUser = {
  userId: string;
  onboardingCompletedAt: Date | null;
};

async getCurrentUser(userId: string): Promise<CurrentUser> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      onboardingCompletedAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedException('Authenticated user no longer exists');
  }

  return {
    userId: user.id,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

async completeOnboarding(
  userId: string,
  completedAt = new Date(),
): Promise<CurrentUser> {
  await this.prisma.user.updateMany({
    where: {
      id: userId,
      onboardingCompletedAt: null,
    },
    data: { onboardingCompletedAt: completedAt },
  });

  return this.getCurrentUser(userId);
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

```powershell
npm.cmd test -- --runInBand auth/auth.service.spec.ts
```

Expected: PASS with all existing refresh/login/logout tests unchanged.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/auth/auth.service.spec.ts src/auth/auth.service.ts
git commit -m "feat(auth): persist onboarding completion"
```

### Task 3: Expand the auth controller contract

**Files:**

- Modify: `DSM_Back/src/auth/auth.controller.spec.ts`
- Modify: `DSM_Back/src/auth/auth.controller.ts`

**Interfaces:**

- Consumes: `AuthService.getCurrentUser` and `completeOnboarding`.
- Produces: `GET /auth/me` and `PATCH /auth/me/onboarding` returning the canonical user projection.

- [ ] **Step 1: Write failing controller tests**

Extend the mock:

```ts
const CURRENT_USER = {
  userId: 'user-uuid-1',
  onboardingCompletedAt: new Date('2026-07-25T00:00:00.000Z'),
};

const makeAuthServiceMock = () => ({
  socialLogin: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
  refreshTokens: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
  logout: jest.fn().mockResolvedValue(undefined),
  getCurrentUser: jest.fn().mockResolvedValue(CURRENT_USER),
  completeOnboarding: jest.fn().mockResolvedValue(CURRENT_USER),
});
```

Replace the old `me` test and add:

```ts
it('me returns the canonical current-user projection', async () => {
  const req = { user: { sub: 'user-uuid-1', type: 'access' } } as never;

  await expect(controller.me(req)).resolves.toEqual(CURRENT_USER);
  expect(authServiceMock.getCurrentUser).toHaveBeenCalledWith('user-uuid-1');
});

it('completeOnboarding delegates with the authenticated user', async () => {
  const req = { user: { sub: 'user-uuid-1', type: 'access' } } as never;

  await expect(controller.completeOnboarding(req)).resolves.toEqual(
    CURRENT_USER,
  );
  expect(authServiceMock.completeOnboarding).toHaveBeenCalledWith(
    'user-uuid-1',
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npm.cmd test -- --runInBand auth/auth.controller.spec.ts
```

Expected: FAIL because controller delegation and the PATCH route are absent.

- [ ] **Step 3: Implement guarded controller methods**

Import `Patch` and `CurrentUser`, then use:

```ts
@Get('me')
@UseGuards(JwtAuthGuard)
me(@Req() req: Request & { user: JwtPayload }): Promise<CurrentUser> {
  return this.authService.getCurrentUser(req.user.sub);
}

@Patch('me/onboarding')
@UseGuards(JwtAuthGuard)
completeOnboarding(
  @Req() req: Request & { user: JwtPayload },
): Promise<CurrentUser> {
  return this.authService.completeOnboarding(req.user.sub);
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

```powershell
npm.cmd test -- --runInBand auth/auth.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/auth/auth.controller.spec.ts src/auth/auth.controller.ts
git commit -m "feat(auth): expose onboarding state"
```

### Task 4: Validate the browser-origin allowlist

**Files:**

- Modify: `DSM_Back/src/config/env.validation.spec.ts`
- Modify: `DSM_Back/src/config/env.validation.ts`

**Interfaces:**

- Produces: exported `parseCorsOrigins(value): string[]`.
- Consumes: comma-separated `CORS_ORIGINS`.

- [ ] **Step 1: Write failing allowlist tests**

```ts
it('normalizes exact CORS origins and removes duplicates', () => {
  const config = validateEnv({
    ...validConfig,
    CORS_ORIGINS:
      ' http://localhost:8081,https://qa.example.com,http://localhost:8081 ',
  });

  expect(config.CORS_ORIGINS).toEqual([
    'http://localhost:8081',
    'https://qa.example.com',
  ]);
});

it.each([
  '*',
  'localhost:8081',
  'https://example.com/path',
  'https://example.com?query=1',
  'https://user:password@example.com',
])('rejects unsafe CORS origin %p', (CORS_ORIGINS) => {
  expect(() => validateEnv({ ...validConfig, CORS_ORIGINS })).toThrow(
    /CORS_ORIGINS/,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npm.cmd test -- --runInBand config/env.validation.spec.ts
```

Expected: FAIL because `CORS_ORIGINS` is not parsed or retained.

- [ ] **Step 3: Implement strict origin parsing**

Add `IsArray` and:

```ts
export function parseCorsOrigins(value: unknown): string[] {
  if (value === undefined || value === '') {
    return [];
  }

  if (typeof value !== 'string') {
    throw new Error(
      'Environment validation failed: CORS_ORIGINS: must be a comma-separated string',
    );
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(
          `Environment validation failed: CORS_ORIGINS: invalid origin ${origin}`,
        );
      }

      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin !== origin ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.username !== '' ||
        url.password !== ''
      ) {
        throw new Error(
          `Environment validation failed: CORS_ORIGINS: invalid origin ${origin}`,
        );
      }

      return url.origin;
    });

  return [...new Set(origins)];
}
```

Add to `EnvironmentVariables`:

```ts
@IsArray()
@IsString({ each: true })
CORS_ORIGINS: string[] = [];
```

Pass `CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS)` into `plainToInstance`.

- [ ] **Step 4: Run the focused test and confirm GREEN**

```powershell
npm.cmd test -- --runInBand config/env.validation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/config/env.validation.spec.ts src/config/env.validation.ts
git commit -m "feat(cors): validate exact origins"
```

### Task 5: Apply exact-origin CORS at bootstrap

**Files:**

- Create: `DSM_Back/src/app.bootstrap.spec.ts`
- Modify: `DSM_Back/src/app.bootstrap.ts`

**Interfaces:**

- Consumes: `parseCorsOrigins`.
- Produces: `buildCorsOptions(rawOrigins)` and restricted Nest CORS configuration.

- [ ] **Step 1: Write failing CORS callback tests**

```ts
import { buildCorsOptions } from './app.bootstrap';

function resolveOrigin(origin: string | undefined): Promise<boolean> {
  const options = buildCorsOptions([
    'http://localhost:8081',
    'https://qa.example.com',
  ]);

  return new Promise((resolve, reject) => {
    if (typeof options.origin !== 'function') {
      reject(new Error('origin callback is required'));
      return;
    }
    options.origin(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(allowed));
    });
  });
}

it('allows exact browser origins and no-Origin clients', async () => {
  await expect(resolveOrigin('http://localhost:8081')).resolves.toBe(true);
  await expect(resolveOrigin(undefined)).resolves.toBe(true);
});

it('rejects unlisted browser origins and credentials', async () => {
  await expect(resolveOrigin('https://evil.example')).resolves.toBe(false);
  expect(buildCorsOptions([]).credentials).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npm.cmd test -- --runInBand app.bootstrap.spec.ts
```

Expected: FAIL because `buildCorsOptions` does not exist.

- [ ] **Step 3: Implement and wire the CORS options**

```ts
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { parseCorsOrigins } from './config/env.validation';

export function buildCorsOptions(origins: string[]): CorsOptions {
  const allowlist = new Set(origins);

  return {
    origin(origin, callback) {
      callback(null, origin === undefined || allowlist.has(origin));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  };
}
```

Replace the existing permissive block with:

```ts
app.enableCors(
  buildCorsOptions(parseCorsOrigins(process.env.CORS_ORIGINS)),
);
```

- [ ] **Step 4: Run focused and e2e tests**

```powershell
npm.cmd test -- --runInBand app.bootstrap.spec.ts
npm.cmd run test:e2e -- --runInBand
```

Expected: CORS unit tests and the existing two e2e tests PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/app.bootstrap.spec.ts src/app.bootstrap.ts
git commit -m "feat(cors): restrict browser origins"
```

### Task 6: Document deterministic Backend CORS configuration

**Files:**

- Modify: `DSM_Back/.env.example`
- Modify: `DSM_Back/test/set-env.ts`

**Interfaces:**

- Produces: local example origins and deterministic test environment.

- [ ] **Step 1: Add the public local-origin example**

```dotenv
CORS_ORIGINS="http://localhost:8081,http://127.0.0.1:8081"
```

- [ ] **Step 2: Pin an empty test allowlist**

```ts
process.env.CORS_ORIGINS ??= '';
```

- [ ] **Step 3: Verify configuration**

```powershell
npm.cmd test -- --runInBand config/env.validation.spec.ts app.bootstrap.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Verify no credentials were added**

```powershell
rg -n "CORS_ORIGINS|CLIENT_EMAIL|PRIVATE_KEY" .env.example test/set-env.ts
```

Expected: only public browser origins and existing non-secret test configuration.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- .env.example test/set-env.ts
git commit -m "docs(cors): add local allowlist"
```

### Task 7: Install the Front test, lint, and SecureStore foundation

**Files:**

- Modify: `DSM_Front/package.json`
- Modify: `DSM_Front/package-lock.json`

**Interfaces:**

- Produces: `expo-secure-store`, `jest-expo`, Jest, RNTL, ESLint, and stable scripts.

- [ ] **Step 1: Install SDK-compatible packages**

Run from `DSM_Front`:

```powershell
npx.cmd expo install expo-secure-store
npx.cmd expo install jest-expo jest @types/jest @testing-library/react-native eslint eslint-config-expo -- --dev
```

Expected: only `package.json` and `package-lock.json` change.

- [ ] **Step 2: Add deterministic scripts**

```json
{
  "test": "jest --runInBand",
  "test:watch": "jest --watch",
  "typecheck": "tsc --noEmit --incremental false"
}
```

Keep all existing scripts.

- [ ] **Step 3: Verify dependency resolution**

```powershell
npm.cmd ls expo-secure-store jest-expo jest @testing-library/react-native eslint eslint-config-expo
```

Expected: exit `0`, no invalid dependency tree.

- [ ] **Step 4: Confirm the lockfile matches package metadata**

```powershell
npm.cmd install --package-lock-only --ignore-scripts
git diff --check -- package.json package-lock.json
```

Expected: no additional package metadata changes and no whitespace errors.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- package.json package-lock.json
git commit -m "test(front): add auth test foundation"
```

### Task 8: Add Expo SDK 55 Jest and ESLint configuration

**Files:**

- Create: `DSM_Front/eslint.config.js`
- Create: `DSM_Front/jest.config.js`

**Interfaces:**

- Produces: `npm test` and `npm run lint` configuration compatible with React 19.

- [ ] **Step 1: Create the Flat ESLint config**

```js
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'coverage/*']),
  expoConfig,
]);
```

- [ ] **Step 2: Create the Jest config**

```js
module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.expo/',
  ],
};
```

- [ ] **Step 3: Verify both tools load**

```powershell
npm.cmd test -- --listTests
npm.cmd run lint
```

Expected: both commands exit `0`; an empty test list is acceptable before test files are added.

- [ ] **Step 4: Typecheck the existing application**

```powershell
npm.cmd run typecheck
```

Expected: exit `0`.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- eslint.config.js jest.config.js
git commit -m "chore(front): configure test and lint"
```

### Task 9: Configure SecureStore and the public API URL example

**Files:**

- Modify: `DSM_Front/app.json`
- Create: `DSM_Front/.env.example`

**Interfaces:**

- Produces: Expo SecureStore native configuration and a non-secret URL example.

- [ ] **Step 1: Add the SecureStore plugin**

Add `"expo-secure-store"` once in the existing `expo.plugins` array.

- [ ] **Step 2: Add the public URL example**

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
```

- [ ] **Step 3: Verify Expo configuration**

```powershell
npx.cmd expo config --type public
```

Expected: config resolves with `expo-secure-store`; no secret is present.

- [ ] **Step 4: Verify `.env.local` remains ignored**

```powershell
git check-ignore .env.local
```

Expected: `.env.local` is ignored by `.env*.local`.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- app.json .env.example
git commit -m "chore(front): configure secure storage"
```

### Task 10: Validate the Front API base URL

**Files:**

- Create: `DSM_Front/src/config/api-config.test.ts`
- Create: `DSM_Front/src/config/api-config.ts`

**Interfaces:**

- Produces: `getApiBaseUrl(raw?, isDevelopment?)`.

- [ ] **Step 1: Write failing URL policy tests**

```ts
import { getApiBaseUrl } from './api-config';

it('normalizes a private development URL', () => {
  expect(getApiBaseUrl('http://192.168.0.10:3000/', true)).toBe(
    'http://192.168.0.10:3000',
  );
});

it('allows public HTTPS in production', () => {
  expect(getApiBaseUrl('https://api.example.com/', false)).toBe(
    'https://api.example.com',
  );
});

it.each([
  [undefined, true],
  ['http://example.com', true],
  ['http://api.example.com', false],
  ['https://user:pass@example.com', false],
  ['https://api.example.com?token=x', false],
  ['https://api.example.com#fragment', false],
])('rejects unsafe base URL %p', (raw, isDevelopment) => {
  expect(() => getApiBaseUrl(raw, isDevelopment)).toThrow(
    /EXPO_PUBLIC_API_BASE_URL/,
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/config/api-config.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement strict parsing**

Implement:

```ts
function isPrivateDevelopmentHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') {
    return true;
  }

  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function getApiBaseUrl(
  raw = process.env.EXPO_PUBLIC_API_BASE_URL,
  isDevelopment = __DEV__,
): string {
  if (!raw) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required');
  }

  const url = new URL(raw);
  const developmentHttp =
    isDevelopment &&
    url.protocol === 'http:' &&
    isPrivateDevelopmentHost(url.hostname);

  if (
    (url.protocol !== 'https:' && !developmentHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is unsafe');
  }

  return url.toString().replace(/\/+$/, '');
}
```

Wrap `new URL(raw)` errors with the same safe configuration error.

- [ ] **Step 4: Run tests and typecheck**

```powershell
npm.cmd test -- src/config/api-config.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/config/api-config.test.ts src/config/api-config.ts
git commit -m "feat(front): validate API base URL"
```

### Task 11: Add sanitized API errors

**Files:**

- Create: `DSM_Front/src/lib/api/api-error.test.ts`
- Create: `DSM_Front/src/lib/api/api-error.ts`

**Interfaces:**

- Produces: `ApiErrorKind`, `ApiError`, and `isApiError`.

- [ ] **Step 1: Write failing safe-error tests**

```ts
import { ApiError, isApiError } from './api-error';

it('serializes only safe fields', () => {
  const error = new ApiError('http', 'Request failed', {
    status: 409,
    code: 'CONFLICT',
  });

  expect(error.toJSON()).toEqual({
    name: 'ApiError',
    kind: 'http',
    message: 'Request failed',
    status: 409,
    code: 'CONFLICT',
  });
  expect(isApiError(error)).toBe(true);
  expect(JSON.stringify(error)).not.toContain('Bearer');
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/lib/api/api-error.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the error type**

```ts
export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'http'
  | 'unauthorized'
  | 'protocol'
  | 'storage';

type ApiErrorOptions = {
  status?: number;
  code?: string;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly name = 'ApiError';
  readonly status?: number;
  readonly code?: string;

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      status: this.status,
      code: this.code,
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
```

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/lib/api/api-error.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/lib/api/api-error.test.ts src/lib/api/api-error.ts
git commit -m "feat(front): add safe API errors"
```

### Task 12: Add runtime auth contract validators

**Files:**

- Create: `DSM_Front/src/lib/api/auth-contracts.test.ts`
- Create: `DSM_Front/src/lib/api/auth-contracts.ts`

**Interfaces:**

- Produces: `SocialProvider`, `TokenPair`, `CurrentUser`, `parseTokenPair`, and `parseCurrentUser`.

- [ ] **Step 1: Write failing boundary tests**

```ts
import { parseCurrentUser, parseTokenPair } from './auth-contracts';

it('accepts valid token and current-user responses', () => {
  expect(
    parseTokenPair({
      accessToken: 'header.payload.signature',
      refreshToken: 'record.secret',
    }),
  ).toEqual({
    accessToken: 'header.payload.signature',
    refreshToken: 'record.secret',
  });

  expect(
    parseCurrentUser({
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    }),
  ).toEqual({
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it.each([
  null,
  {},
  { accessToken: '', refreshToken: 'record.secret' },
  { accessToken: 'access', refreshToken: 'missing-separator' },
  { accessToken: 'a'.repeat(16 * 1024 + 1), refreshToken: 'record.secret' },
  { accessToken: 'access', refreshToken: `r.${'x'.repeat(1024)}` },
])('rejects invalid token response %#', (value) => {
  expect(() => parseTokenPair(value)).toThrow(/token response/i);
});

it('rejects a non-canonical onboarding timestamp', () => {
  expect(() =>
    parseCurrentUser({
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25',
    }),
  ).toThrow(/current user response/i);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/lib/api/auth-contracts.test.ts
```

Expected: FAIL because validators are missing.

- [ ] **Step 3: Implement exact validators**

Use `Record<string, unknown>` guards, maximum lengths, refresh separator validation, and:

```ts
export type SocialProvider = 'GOOGLE' | 'KAKAO';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type CurrentUser = {
  userId: string;
  onboardingCompletedAt: string | null;
};

function isCanonicalIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
```

Throw `new ApiError('protocol', 'Invalid token response')` or `new ApiError('protocol', 'Invalid current user response')`. Do not include the rejected values in the message.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/lib/api/auth-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/lib/api/auth-contracts.test.ts src/lib/api/auth-contracts.ts
git commit -m "feat(front): validate auth contracts"
```

### Task 13: Build the base HTTP transport

**Files:**

- Create: `DSM_Front/src/lib/api/http-client.test.ts`
- Create: `DSM_Front/src/lib/api/http-client.ts`

**Interfaces:**

- Consumes: `ApiError`.
- Produces: `JsonValue`, `HttpRequest`, `HttpClient`, and `createHttpClient`.

- [ ] **Step 1: Write failing transport tests**

Use these exact tests:

```ts
it('parses validated JSON and accepts 204', async () => {
  const makeResponse = (status: number, text: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: jest.fn().mockResolvedValue(text),
    }) as unknown as Response;
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(makeResponse(200, '{"ok":true}'))
    .mockResolvedValueOnce(makeResponse(204, ''));
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl,
  });

  await expect(
    client.request({
      path: '/json',
      validate: (value) => value as { ok: boolean },
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    client.request({ path: '/empty', responseMode: 'empty' }),
  ).resolves.toBeUndefined();
});

it('classifies unauthorized and other HTTP failures', async () => {
  const cases = [
    { status: 401, kind: 'unauthorized' },
    { status: 500, kind: 'http' },
  ] as const;

  for (const testCase of cases) {
    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: jest.fn().mockResolvedValue(
        {
          ok: false,
          status: testCase.status,
          text: jest.fn().mockResolvedValue('{"error":"safe"}'),
        } as unknown as Response,
      ),
    });
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      kind: testCase.kind,
      status: testCase.status,
    });
  }
});

it('classifies network failure without retrying', async () => {
  const fetchImpl = jest
    .fn()
    .mockRejectedValue(new TypeError('Network request failed'));
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl,
  });

  await expect(client.request({ path: '/x' })).rejects.toMatchObject({
    kind: 'network',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('classifies timeout and malformed JSON', async () => {
  jest.useFakeTimers();
  const abortError = Object.assign(new Error('aborted'), {
    name: 'AbortError',
  });
  const timeoutFetch = jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError));
      }),
  );
  const timeoutClient = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: timeoutFetch,
  });
  const timeoutRequest = timeoutClient.request({
    path: '/slow',
    timeoutMs: 10,
  });

  jest.advanceTimersByTime(10);
  await expect(timeoutRequest).rejects.toMatchObject({ kind: 'timeout' });
  jest.useRealTimers();

  const protocolClient = createHttpClient({
    baseUrl: 'https://api.example.com',
    fetchImpl: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('not-json'),
    } as unknown as Response),
  });
  await expect(
    protocolClient.request({ path: '/broken' }),
  ).rejects.toMatchObject({ kind: 'protocol' });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/lib/api/http-client.test.ts
```

Expected: FAIL because the transport is missing.

- [ ] **Step 3: Implement the transport**

Define:

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HttpRequest<T> = {
  path: `/${string}`;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: JsonValue;
  accessToken?: string;
  responseMode?: 'json' | 'empty';
  validate?: (value: unknown) => T;
  timeoutMs?: number;
};

export interface HttpClient {
  request<T = unknown>(request: HttpRequest<T>): Promise<T>;
}
```

`createHttpClient` must:

- join `baseUrl` and `path`;
- create an `AbortController`;
- abort after `timeoutMs ?? 10_000`;
- attach `Accept`, conditional `Content-Type`, and conditional Bearer headers;
- read text once;
- map `401` to `unauthorized`, other non-2xx to `http`, invalid JSON/validator failure to `protocol`, abort to `timeout`, and other fetch rejection to `network`;
- clear the timer in `finally`;
- never include request headers or auth bodies in errors.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/lib/api/http-client.test.ts
```

Expected: PASS with one fetch per request.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/lib/api/http-client.test.ts src/lib/api/http-client.ts
git commit -m "feat(front): add JSON HTTP transport"
```

### Task 14: Add public auth API functions

**Files:**

- Create: `DSM_Front/src/lib/api/auth-api.test.ts`
- Create: `DSM_Front/src/lib/api/auth-api.ts`

**Interfaces:**

- Consumes: `HttpClient`, `SocialProvider`, `TokenPair`, and `parseTokenPair`.
- Produces: `AuthApi.exchangeProviderToken`, `rotateRefreshToken`, and `revokeSession`.

- [ ] **Step 1: Write failing endpoint tests**

```ts
it('uses public login and refresh endpoints without recursive auth', async () => {
  const TOKEN_PAIR = {
    accessToken: 'header.payload.signature',
    refreshToken: 'record.secret',
  };
  const http = { request: jest.fn().mockResolvedValue(TOKEN_PAIR) };
  const api = createAuthApi(http);

  await api.exchangeProviderToken('GOOGLE', 'provider-token');
  await api.rotateRefreshToken('old.record-secret');

  expect(http.request).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      path: '/auth/login',
      method: 'POST',
      body: { provider: 'GOOGLE', token: 'provider-token' },
    }),
  );
  expect(http.request).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      path: '/auth/refresh',
      method: 'POST',
      body: { refreshToken: 'old.record-secret' },
    }),
  );
});

it('sends captured tokens once for best-effort logout', async () => {
  const http = { request: jest.fn().mockResolvedValue(undefined) };
  const api = createAuthApi(http);

  await api.revokeSession('access', 'record.secret');

  expect(http.request).toHaveBeenCalledWith({
    path: '/auth/logout',
    method: 'POST',
    accessToken: 'access',
    body: { refreshToken: 'record.secret' },
    responseMode: 'empty',
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/lib/api/auth-api.test.ts
```

Expected: FAIL because `createAuthApi` is missing.

- [ ] **Step 3: Implement the public API**

```ts
export interface AuthApi {
  exchangeProviderToken(
    provider: SocialProvider,
    providerToken: string,
  ): Promise<TokenPair>;
  rotateRefreshToken(refreshToken: string): Promise<TokenPair>;
  revokeSession(accessToken: string, refreshToken: string): Promise<void>;
}
```

Use the exact requests from the tests and `parseTokenPair` as the login/refresh validator.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/lib/api/auth-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/lib/api/auth-api.test.ts src/lib/api/auth-api.ts
git commit -m "feat(front): add public auth API"
```

### Task 15: Serialize refresh-token storage

**Files:**

- Create: `DSM_Front/src/features/auth/token-store-coordinator.test.ts`
- Create: `DSM_Front/src/features/auth/token-store-coordinator.ts`

**Interfaces:**

- Produces: `RefreshTokenStore` and `TokenStoreCoordinator`.
- Consumes: a `getCurrentEpoch` callback supplied by the session controller.

- [ ] **Step 1: Write failing race tests**

```ts
function createDeferredStore(initial: string | null = null) {
  let value = initial;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const calls: string[] = [];

  return {
    calls,
    release: releaseGate,
    read: jest.fn(async () => {
      calls.push('read');
      return value;
    }),
    write: jest.fn(async (refreshToken: string) => {
      await gate;
      calls.push(`write:${refreshToken}`);
      value = refreshToken;
    }),
    clear: jest.fn(async () => {
      calls.push('clear');
      value = null;
    }),
  };
}

it('skips a stale queued write', async () => {
  let epoch = 1;
  const store = createDeferredStore();
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  const write = coordinator.writeIfCurrent('record.secret', 1);
  epoch = 2;
  store.release();

  await expect(write).resolves.toBe(false);
  expect(store.write).not.toHaveBeenCalled();
});

it('clears a write whose epoch changes during storage', async () => {
  let epoch = 1;
  const store = {
    read: jest.fn().mockResolvedValue(null),
    write: jest.fn(async () => {
      epoch = 2;
    }),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  await expect(
    coordinator.writeIfCurrent('new.secret', 1),
  ).resolves.toBe(false);
  expect(store.clear).toHaveBeenCalledTimes(1);
});

it('orders stale cleanup before logout read-and-clear', async () => {
  let epoch = 1;
  const store = createDeferredStore('old.secret');
  const coordinator = new TokenStoreCoordinator(store, () => epoch);

  const write = coordinator.writeIfCurrent('new.secret', 1);
  const clear = coordinator.readAndClear();
  epoch = 2;
  store.release();

  await write;
  await expect(clear).resolves.toBeNull();
  expect(store.calls).toEqual([
    'write:new.secret',
    'clear',
    'read',
    'clear',
  ]);
});
```

The test helper must be local to the test file and expose deterministic promises, calls, and Jest mocks.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/token-store-coordinator.test.ts
```

Expected: FAIL because the coordinator is missing.

- [ ] **Step 3: Implement a failure-safe queue**

```ts
export interface RefreshTokenStore {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export class TokenStoreCoordinator {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: RefreshTokenStore,
    private readonly getCurrentEpoch: () => number,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  read(): Promise<string | null> {
    return this.enqueue(() => this.store.read());
  }

  writeIfCurrent(refreshToken: string, epoch: number): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.getCurrentEpoch() !== epoch) {
        return false;
      }
      await this.store.write(refreshToken);
      if (this.getCurrentEpoch() !== epoch) {
        await this.store.clear();
        return false;
      }
      return true;
    });
  }

  readAndClear(): Promise<string | null> {
    return this.enqueue(async () => {
      const refreshToken = await this.store.read();
      await this.store.clear();
      return refreshToken;
    });
  }
}
```

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/features/auth/token-store-coordinator.test.ts
```

Expected: PASS and the queue remains usable after a rejected operation.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/token-store-coordinator.test.ts src/features/auth/token-store-coordinator.ts
git commit -m "feat(front): serialize token storage"
```

### Task 16: Implement the Native SecureStore adapter

**Files:**

- Create: `DSM_Front/src/features/auth/token-store.native.test.ts`
- Create: `DSM_Front/src/features/auth/token-store.native.ts`

**Interfaces:**

- Consumes: `RefreshTokenStore`.
- Produces: `createRefreshTokenStore()` backed by SecureStore.

- [ ] **Step 1: Write failing adapter tests**

Mock `expo-secure-store` and test:

```ts
const mockDeleteItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

it('uses the versioned key and treats the tombstone as empty', async () => {
  mockGetItemAsync.mockResolvedValue('__dsm_logged_out_v1__');
  const store = createRefreshTokenStore();

  await expect(store.read()).resolves.toBeNull();
  expect(mockGetItemAsync).toHaveBeenCalledWith(
    'dsm.auth.refresh-token.v1',
  );
});

it('falls back to a verified tombstone when delete fails', async () => {
  mockDeleteItemAsync.mockRejectedValue(new Error('delete failed'));
  mockGetItemAsync.mockResolvedValue('__dsm_logged_out_v1__');
  const store = createRefreshTokenStore();

  await expect(store.clear()).resolves.toBeUndefined();
  expect(mockSetItemAsync).toHaveBeenCalledWith(
    'dsm.auth.refresh-token.v1',
    '__dsm_logged_out_v1__',
    expect.objectContaining({ requireAuthentication: false }),
  );
});

it('throws a storage error when delete and tombstone verification fail', async () => {
  mockDeleteItemAsync.mockRejectedValue(new Error('delete failed'));
  mockSetItemAsync.mockRejectedValue(new Error('write failed'));
  const store = createRefreshTokenStore();

  await expect(store.clear()).rejects.toMatchObject({ kind: 'storage' });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/token-store.native.test.ts
```

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement read/write/verified clear**

Use:

```ts
const KEY = 'dsm.auth.refresh-token.v1';
const TOMBSTONE = '__dsm_logged_out_v1__';
const OPTIONS = { requireAuthentication: false };
```

`write` calls `setItemAsync(KEY, token, OPTIONS)`. `clear` attempts `deleteItemAsync`, verifies `getItemAsync(KEY) === null`, then falls back to tombstone write and exact marker verification. Wrap native failures in `ApiError('storage', 'Secure token storage failed', { cause })` without token content.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/features/auth/token-store.native.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/token-store.native.test.ts src/features/auth/token-store.native.ts
git commit -m "feat(front): secure native refresh token"
```

### Task 17: Implement the Web memory token store

**Files:**

- Create: `DSM_Front/src/features/auth/token-store.web.test.ts`
- Create: `DSM_Front/src/features/auth/token-store.web.ts`

**Interfaces:**

- Consumes: `RefreshTokenStore`.
- Produces: Web `createRefreshTokenStore()` with module-memory lifetime.

- [ ] **Step 1: Write failing non-persistence tests**

```ts
it('stores only in module memory and clears deterministically', async () => {
  const setItem = jest.fn();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem },
  });
  const store = createRefreshTokenStore();

  await store.write('record.secret');
  await expect(store.read()).resolves.toBe('record.secret');
  await store.clear();
  await expect(store.read()).resolves.toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

it('starts empty after module reload', async () => {
  await createRefreshTokenStore().write('record.secret');
  jest.resetModules();
  const reloaded = await import('./token-store.web');

  await expect(reloaded.createRefreshTokenStore().read()).resolves.toBeNull();
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/token-store.web.test.ts
```

Expected: FAIL because the Web adapter is missing.

- [ ] **Step 3: Implement module-memory storage**

```ts
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
```

- [ ] **Step 4: Run under the Web test environment**

```powershell
npm.cmd test -- src/features/auth/token-store.web.test.ts
```

Expected: PASS and no browser persistence API calls.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/token-store.web.test.ts src/features/auth/token-store.web.ts
git commit -m "feat(front): keep web session in memory"
```

### Task 18: Add the authenticated client

**Files:**

- Create: `DSM_Front/src/lib/api/authenticated-client.test.ts`
- Create: `DSM_Front/src/lib/api/authenticated-client.ts`

**Interfaces:**

- Consumes: `HttpClient`, `HttpRequest`, and session callbacks.
- Produces: `AuthenticatedClient.request`.

- [ ] **Step 1: Write failing concurrency and replay tests**

```ts
it('coalesces concurrent 401 recovery and replays each request once', async () => {
  const http = {
    request: jest
      .fn()
      .mockRejectedValueOnce(new ApiError('unauthorized', 'expired', { status: 401 }))
      .mockRejectedValueOnce(new ApiError('unauthorized', 'expired', { status: 401 }))
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 }),
  };
  let accessToken = 'expired';
  const refreshAccessToken = jest.fn(async () => {
    accessToken = 'fresh';
    return accessToken;
  });
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => accessToken,
    refreshAccessToken,
    onUnauthorized: jest.fn(),
  });

  await expect(
    Promise.all([
      client.request({ path: '/one' }),
      client.request({ path: '/two' }),
    ]),
  ).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(http.request).toHaveBeenCalledTimes(4);
});

it('ends the session after one replay also returns 401', async () => {
  const http = {
    request: jest
      .fn()
      .mockRejectedValue(
        new ApiError('unauthorized', 'expired', { status: 401 }),
      ),
  };
  const onUnauthorized = jest.fn();
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'expired',
    refreshAccessToken: jest.fn().mockResolvedValue('fresh'),
    onUnauthorized,
  });

  await expect(client.request({ path: '/one' })).rejects.toMatchObject({
    kind: 'unauthorized',
  });
  expect(http.request).toHaveBeenCalledTimes(2);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

it('does not refresh network or timeout failures', async () => {
  const refreshAccessToken = jest.fn();
  const http = {
    request: jest
      .fn()
      .mockRejectedValue(new ApiError('network', 'Network unavailable')),
  };
  const client = createAuthenticatedClient(http, {
    getAccessToken: () => 'access',
    refreshAccessToken,
    onUnauthorized: jest.fn(),
  });

  await expect(client.request({ path: '/one' })).rejects.toMatchObject({
    kind: 'network',
  });
  expect(refreshAccessToken).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/lib/api/authenticated-client.test.ts
```

Expected: FAIL because the client is missing.

- [ ] **Step 3: Implement one-refresh/one-replay behavior**

Define:

```ts
type SessionCallbacks = {
  getAccessToken(): string | null;
  refreshAccessToken(): Promise<string>;
  onUnauthorized(): Promise<void> | void;
};

export interface AuthenticatedClient {
  request<T>(request: HttpRequest<T>): Promise<T>;
}
```

Keep one module-instance `refreshPromise`. Only catch `ApiError` with `kind === 'unauthorized'`. Replay the original JSON request once with the returned access token. On replay `401`, await `onUnauthorized()` and rethrow. Clear `refreshPromise` in `finally`.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/lib/api/authenticated-client.test.ts
```

Expected: PASS; N initial `401` responses share one refresh call.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/lib/api/authenticated-client.test.ts src/lib/api/authenticated-client.ts
git commit -m "feat(front): refresh authenticated requests"
```

### Task 19: Implement the session state machine

**Files:**

- Create: `DSM_Front/src/features/auth/session-controller.test.ts`
- Create: `DSM_Front/src/features/auth/session-controller.ts`

**Interfaces:**

- Consumes: `AuthApi`, `AuthenticatedClient`, `TokenStoreCoordinator`, `parseCurrentUser`.
- Produces: `SessionController`, `SessionControllerPort`, `SessionState`, `SessionAction`, `getEpoch()`, subscription, and UI actions.

- [ ] **Step 1: Write the failing state-transition matrix**

Create these exact local fixtures before the tests:

```ts
const TOKEN_PAIR = {
  accessToken: 'header.payload.signature',
  refreshToken: 'record.secret',
};

let resolveRefresh!: (pair: typeof TOKEN_PAIR) => void;
let refreshDeferred!: Promise<typeof TOKEN_PAIR>;

const tokenStore: jest.Mocked<SessionTokenStore> = {
  read: jest.fn(),
  writeIfCurrent: jest.fn(),
  readAndClear: jest.fn(),
};
const authApi: jest.Mocked<AuthApi> = {
  exchangeProviderToken: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeSession: jest.fn().mockResolvedValue(undefined),
};
const authenticatedClient: jest.Mocked<AuthenticatedClient> = {
  request: jest.fn(),
};

let controller: SessionController;

beforeEach(() => {
  jest.clearAllMocks();
  refreshDeferred = new Promise<typeof TOKEN_PAIR>((resolve) => {
    resolveRefresh = resolve;
  });
  authApi.rotateRefreshToken.mockReturnValue(refreshDeferred);
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  tokenStore.readAndClear.mockResolvedValue(null);
  controller = new SessionController({
    authApi,
    authenticatedClient,
    tokenStore,
  });
});
```

Then add:

```ts
it.each([
  ['missing token', null, 'unauthenticated'],
  ['completed account', 'record.secret', 'authenticated'],
  ['new account', 'record.secret', 'onboarding'],
])('bootstraps %s to %s', async (_label, stored, expected) => {
  tokenStore.read.mockResolvedValue(stored);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockResolvedValue({
    userId: 'user-1',
    onboardingCompletedAt:
      expected === 'authenticated' ? '2026-07-25T00:00:00.000Z' : null,
  });

  await controller.bootstrap();

  expect(controller.getSnapshot().state.status).toBe(expected);
});

it('preserves the stored token on bootstrap network failure', async () => {
  tokenStore.read.mockResolvedValue('record.secret');
  authApi.rotateRefreshToken.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.bootstrap();

  expect(controller.getSnapshot().state.status).toBe('offline');
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it('logout fences a late refresh write', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  const refresh = controller.refreshAccessToken();
  const logout = controller.logout();
  resolveRefresh(TOKEN_PAIR);

  await Promise.allSettled([refresh, logout]);

  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  expect(controller.getAccessToken()).toBeNull();
});

it('clears the session after refresh returns 401', async () => {
  tokenStore.read.mockResolvedValue('record.secret');
  tokenStore.readAndClear.mockResolvedValue('record.secret');
  authApi.rotateRefreshToken.mockRejectedValue(
    new ApiError('unauthorized', 'expired', { status: 401 }),
  );

  await expect(controller.refreshAccessToken()).rejects.toMatchObject({
    kind: 'unauthorized',
  });

  expect(tokenStore.readAndClear).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('revokes a rotated pair when secure storage write fails', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);

  await controller.bootstrap();

  expect(authApi.revokeSession).toHaveBeenCalledWith(
    TOKEN_PAIR.accessToken,
    TOKEN_PAIR.refreshToken,
  );
  expect(controller.getSnapshot().state.status).toBe('storage-error');
});

it('does not persist or authenticate a malformed login response', async () => {
  authApi.exchangeProviderToken.mockRejectedValue(
    new ApiError('protocol', 'Invalid token response'),
  );

  await controller.signIn('GOOGLE', 'provider-token');

  expect(tokenStore.writeIfCurrent).not.toHaveBeenCalled();
  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
});

it('keeps the rotated token when profile loading is offline', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.bootstrap();

  expect(controller.getSnapshot().state).toEqual({
    status: 'offline',
    retry: 'profile',
  });
  expect(tokenStore.readAndClear).not.toHaveBeenCalled();
});

it('uses the canonical onboarding timestamp returned by the server', async () => {
  tokenStore.read.mockResolvedValue('old.secret');
  tokenStore.writeIfCurrent.mockResolvedValue(true);
  authApi.rotateRefreshToken.mockResolvedValue(TOKEN_PAIR);
  authenticatedClient.request
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: null,
    })
    .mockResolvedValueOnce({
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    });

  await controller.bootstrap();
  await controller.completeOnboarding();

  expect(controller.getSnapshot().state).toEqual({
    status: 'authenticated',
    userId: 'user-1',
    onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
  });
});

it('logs out locally when server revocation is offline', async () => {
  tokenStore.readAndClear.mockResolvedValue('record.secret');
  authApi.revokeSession.mockRejectedValue(
    new ApiError('network', 'Network unavailable'),
  );

  await controller.logout();

  expect(controller.getSnapshot().state.status).toBe('unauthenticated');
  expect(controller.getAccessToken()).toBeNull();
});

it('blocks in storage-error when local clear cannot be verified', async () => {
  tokenStore.readAndClear.mockRejectedValue(
    new ApiError('storage', 'Secure token storage failed'),
  );

  await controller.logout();

  expect(controller.getSnapshot().state).toEqual({
    status: 'storage-error',
    operation: 'clear',
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/session-controller.test.ts
```

Expected: FAIL because the state machine is missing.

- [ ] **Step 3: Implement stable state and snapshot types**

```ts
export type SessionState =
  | { status: 'bootstrapping' }
  | { status: 'offline'; retry: 'bootstrap' | 'profile' }
  | { status: 'storage-error'; operation: 'read' | 'write' | 'clear' }
  | { status: 'unauthenticated' }
  | {
      status: 'onboarding';
      userId: string;
      onboardingCompletedAt: null;
    }
  | {
      status: 'authenticated';
      userId: string;
      onboardingCompletedAt: string;
    };

export type SessionAction =
  | 'idle'
  | 'signing-in'
  | 'refreshing'
  | 'completing-onboarding'
  | 'logging-out'
  | 'recovering';

export type SessionSnapshot = {
  state: SessionState;
  action: SessionAction;
  error: ApiError | null;
};

export type SessionTokenStore = Pick<
  TokenStoreCoordinator,
  'read' | 'writeIfCurrent' | 'readAndClear'
>;

export type SessionControllerDependencies = {
  authApi: AuthApi;
  authenticatedClient: AuthenticatedClient;
  tokenStore: SessionTokenStore;
};

export interface SessionControllerPort {
  bootstrap(): Promise<void>;
  completeOnboarding(): Promise<void>;
  endUnauthorizedSession(): Promise<void>;
  getAccessToken(): string | null;
  getEpoch(): number;
  getSnapshot(): SessionSnapshot;
  logout(): Promise<void>;
  refreshAccessToken(): Promise<string>;
  retryRecovery(): Promise<void>;
  signIn(provider: SocialProvider, providerToken: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}
```

Use these exact authenticated profile requests:

```ts
private getCurrentUser(): Promise<CurrentUser> {
  return this.authenticatedClient.request({
    path: '/auth/me',
    validate: parseCurrentUser,
  });
}

private patchOnboarding(): Promise<CurrentUser> {
  return this.authenticatedClient.request({
    path: '/auth/me/onboarding',
    method: 'PATCH',
    validate: parseCurrentUser,
  });
}
```

Use one refresh promise and keep commit ordering explicit:

```ts
refreshAccessToken(): Promise<string> {
  if (this.refreshPromise) {
    return this.refreshPromise;
  }

  const epoch = this.epoch;
  const operation = this.rotateAndCommit(epoch);
  this.refreshPromise = operation;
  const clear = () => {
    if (this.refreshPromise === operation) {
      this.refreshPromise = null;
    }
  };
  void operation.then(clear, clear);
  return operation;
}

private async rotateAndCommit(epoch: number): Promise<string> {
  const currentRefreshToken = await this.tokenStore.read();
  if (!currentRefreshToken) {
    const error = new ApiError('unauthorized', 'Session is unavailable');
    await this.endUnauthorizedSession();
    throw error;
  }

  let pair: TokenPair;
  try {
    pair = await this.authApi.rotateRefreshToken(currentRefreshToken);
  } catch (error) {
    if (isApiError(error) && error.kind === 'unauthorized') {
      await this.endUnauthorizedSession();
    }
    throw error;
  }

  try {
    const committed = await this.tokenStore.writeIfCurrent(
      pair.refreshToken,
      epoch,
    );
    if (!committed) {
      throw new ApiError('unauthorized', 'Session changed during refresh');
    }
  } catch (error) {
    await this.revokeBestEffort(pair);
    if (isApiError(error) && error.kind === 'storage') {
      this.publish({
        state: { status: 'storage-error', operation: 'write' },
        action: 'idle',
        error,
      });
    }
    throw error;
  }

  this.accessToken = pair.accessToken;
  return pair.accessToken;
}
```

`revokeBestEffort(pair)` calls `authApi.revokeSession` once and swallows its sanitized failure. `signIn` uses the same `writeIfCurrent → publish access → getCurrentUser` order. `completeOnboarding` calls `patchOnboarding` and publishes only the returned canonical timestamp.

Implement logout and replay-`401` cleanup through one local cleanup path:

```ts
async logout(): Promise<void> {
  const accessToken = this.accessToken;
  this.epoch += 1;
  this.accessToken = null;
  this.setAction('logging-out');

  try {
    const refreshToken = await this.tokenStore.readAndClear();
    this.publishUnauthenticated();
    if (accessToken && refreshToken) {
      await this.revokeCapturedBestEffort(accessToken, refreshToken);
    }
  } catch (error) {
    this.publishStorageError('clear', error);
  }
}

async endUnauthorizedSession(): Promise<void> {
  this.epoch += 1;
  this.accessToken = null;
  try {
    await this.tokenStore.readAndClear();
    this.publishUnauthenticated();
  } catch (error) {
    this.publishStorageError('clear', error);
  }
}
```

The controller must:

- maintain `epoch`, in-memory `accessToken`, listeners, bootstrap single-flight, and refresh single-flight;
- expose `getEpoch(): number` only for storage coordination;
- expose `endUnauthorizedSession(): Promise<void>` as an idempotent replay-`401` callback;
- publish a token only after `writeIfCurrent` returns `true`;
- best-effort revoke a newly issued pair when its write fails or its epoch becomes stale;
- clear on refresh/replay `401`;
- preserve the token on network/timeout;
- load `/auth/me` and patch `/auth/me/onboarding` through the authenticated client;
- capture access, increment epoch, call `readAndClear`, then best-effort revoke during logout;
- expose `retryRecovery()` for offline/profile/storage recovery;
- sanitize every stored error through `ApiError`.

- [ ] **Step 4: Run the state-machine tests and typecheck**

```powershell
npm.cmd test -- src/features/auth/session-controller.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/session-controller.test.ts src/features/auth/session-controller.ts
git commit -m "feat(front): add session state machine"
```

### Task 20: Expose the session through React context

**Files:**

- Create: `DSM_Front/src/features/auth/session-context.test.tsx`
- Create: `DSM_Front/src/features/auth/session-context.tsx`

**Interfaces:**

- Consumes: configuration, HTTP/auth clients, platform token store, coordinator, and controller.
- Produces: `SessionContextValue`, `SessionProvider`, and `useSession`.

- [ ] **Step 1: Write failing provider tests**

Use an injected fake controller:

```tsx
function Probe() {
  const session = useSession();
  return <Text>{session.state.status}</Text>;
}

function createFakeController() {
  let snapshot: SessionSnapshot = {
    state: { status: 'bootstrapping' },
    action: 'idle',
    error: null,
  };
  const listeners = new Set<() => void>();

  return {
    bootstrap: jest.fn().mockResolvedValue(undefined),
    completeOnboarding: jest.fn().mockResolvedValue(undefined),
    endUnauthorizedSession: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue(null),
    getEpoch: jest.fn().mockReturnValue(0),
    getSnapshot: jest.fn(() => snapshot),
    logout: jest.fn().mockResolvedValue(undefined),
    refreshAccessToken: jest.fn().mockResolvedValue('access'),
    retryRecovery: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(next: SessionSnapshot) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

it('starts bootstrap once and publishes controller snapshots', async () => {
  const controller = createFakeController();
  render(
    <SessionProvider controller={controller}>
      <Probe />
    </SessionProvider>,
  );

  expect(controller.bootstrap).toHaveBeenCalledTimes(1);
  act(() =>
    controller.emit({
      state: { status: 'unauthenticated' },
      action: 'idle',
      error: null,
    }),
  );
  expect(await screen.findByText('unauthenticated')).toBeOnTheScreen();
});

it('rejects useSession outside SessionProvider', () => {
  function OutsideProbe() {
    useSession();
    return null;
  }

  expect(() => render(<OutsideProbe />)).toThrow(
    'useSession must be used inside SessionProvider',
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/session-context.test.tsx
```

Expected: FAIL because the context is missing.

- [ ] **Step 3: Implement dependency assembly and subscription**

Use `useSyncExternalStore` for snapshots and a one-time effect for `bootstrap()`. The default controller factory must:

```ts
export type SessionContextValue = SessionSnapshot & Pick<
  SessionControllerPort,
  'completeOnboarding' | 'logout' | 'retryRecovery' | 'signIn'
>;

const http = createHttpClient({ baseUrl: getApiBaseUrl() });
const authApi = createAuthApi(http);
const store = createRefreshTokenStore();
let controller!: SessionController;
const coordinator = new TokenStoreCoordinator(
  store,
  () => controller.getEpoch(),
);
const authenticatedClient = createAuthenticatedClient(http, {
  getAccessToken: () => controller.getAccessToken(),
  refreshAccessToken: () => controller.refreshAccessToken(),
  onUnauthorized: () => controller.endUnauthorizedSession(),
});
controller = new SessionController({
  authApi,
  authenticatedClient,
  tokenStore: coordinator,
});
```

`endUnauthorizedSession()` is an idempotent public coordination method that clears the current session without accepting tokens or user data. Type the optional test injection as `controller?: SessionControllerPort`; do not expose a production auth bypass.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/features/auth/session-context.test.tsx
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/session-context.test.tsx src/features/auth/session-context.tsx
git commit -m "feat(front): expose secure session context"
```

### Task 21: Define protected session routing

**Files:**

- Create: `DSM_Front/src/features/auth/session-routing.test.tsx`
- Create: `DSM_Front/src/features/auth/session-routing.tsx`

**Interfaces:**

- Consumes: `SessionState.status`.
- Produces: `getSessionRouteGuards` and `SessionStack`.

- [ ] **Step 1: Write failing route-matrix tests**

```ts
it.each([
  ['bootstrapping', [false, false, false, false]],
  ['unauthenticated', [true, false, false, false]],
  ['offline', [false, true, false, false]],
  ['storage-error', [false, true, false, false]],
  ['onboarding', [false, false, true, false]],
  ['authenticated', [false, false, false, true]],
])('maps %s to one route group', (status, expected) => {
  const guards = getSessionRouteGuards(status as SessionState['status']);
  expect([
    guards.unauthenticated,
    guards.recovery,
    guards.onboarding,
    guards.authenticated,
  ]).toEqual(expected);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/features/auth/session-routing.test.tsx
```

Expected: FAIL because routing helpers are missing.

- [ ] **Step 3: Implement one declaration per route**

`SessionStack` must declare:

```tsx
<Stack>
  <Stack.Protected guard={guards.unauthenticated}>
    <Stack.Screen name="index" />
    <Stack.Screen name="explore" />
  </Stack.Protected>
  <Stack.Protected guard={guards.recovery}>
    <Stack.Screen name="session-recovery" />
  </Stack.Protected>
  <Stack.Protected guard={guards.onboarding}>
    <Stack.Screen name="tutorial" />
  </Stack.Protected>
  <Stack.Protected guard={guards.authenticated}>
    <Stack.Screen name="(tabs)" />
  </Stack.Protected>
</Stack>
```

Return `null` while bootstrapping. Keep existing stack screen options as props supplied by the root layout.

- [ ] **Step 4: Run route tests**

```powershell
npm.cmd test -- src/features/auth/session-routing.test.tsx
```

Expected: PASS and exactly one guard is true for every non-bootstrap state.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/features/auth/session-routing.test.tsx src/features/auth/session-routing.tsx
git commit -m "feat(front): guard session routes"
```

### Task 22: Add the recovery screen

**Files:**

- Create: `DSM_Front/src/app/session-recovery.test.tsx`
- Create: `DSM_Front/src/app/session-recovery.tsx`

**Interfaces:**

- Consumes: `useSession().state`, `error`, and `retryRecovery`.
- Produces: safe offline and storage cleanup recovery UI.

- [ ] **Step 1: Write failing UI tests**

```tsx
const mockUseSession = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

function makeSessionValue(
  state: SessionState,
  retryRecovery = jest.fn().mockResolvedValue(undefined),
) {
  return {
    state,
    action: 'idle' as const,
    error: null,
    completeOnboarding: jest.fn(),
    logout: jest.fn(),
    retryRecovery,
    signIn: jest.fn(),
  };
}

it.each([
  ['offline', '인터넷 연결을 확인해 주세요'],
  ['storage-error', '보안 저장소를 정리하지 못했어요'],
])('renders %s recovery copy', (status, copy) => {
  mockUseSession.mockReturnValue(
    makeSessionValue(
      status === 'offline'
        ? { status: 'offline', retry: 'bootstrap' }
        : { status: 'storage-error', operation: 'clear' },
    ),
  );
  render(
    <PrototypeProvider>
      <SessionRecoveryScreen />
    </PrototypeProvider>,
  );

  expect(screen.getByText(copy)).toBeOnTheScreen();
});

it('invokes retry without exposing diagnostic token data', () => {
  const retryRecovery = jest.fn();
  mockUseSession.mockReturnValue(
    makeSessionValue(
      { status: 'offline', retry: 'bootstrap' },
      retryRecovery,
    ),
  );
  render(
    <PrototypeProvider>
      <SessionRecoveryScreen />
    </PrototypeProvider>,
  );

  fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(retryRecovery).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/app/session-recovery.test.tsx
```

Expected: FAIL because the screen is missing.

- [ ] **Step 3: Implement recovery-only UI**

Use existing Dailyup primitives and this state selection:

```tsx
const { action, retryRecovery, state } = useSession();
const storageFailure = state.status === 'storage-error';
const title = storageFailure
  ? '보안 저장소를 정리하지 못했어요'
  : '인터넷 연결을 확인해 주세요';

return (
  <PrototypeFrame>
    <View style={styles.container}>
      <AppText variant="screenTitle">{title}</AppText>
      <AppText variant="muted">
        {storageFailure
          ? '다시 시도해 로컬 로그인 정보를 안전하게 정리해 주세요.'
          : '연결이 복구되면 세션을 다시 확인할 수 있어요.'}
      </AppText>
      <AppButton
        disabled={action === 'recovering'}
        onPress={() => void retryRecovery()}>
        다시 시도
      </AppButton>
    </View>
  </PrototypeFrame>
);
```

Do not render `error.cause`, HTTP response bodies, or token values.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/app/session-recovery.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/app/session-recovery.test.tsx src/app/session-recovery.tsx
git commit -m "feat(front): add session recovery UI"
```

### Task 23: Integrate providers, splash lifetime, and protected routes

**Files:**

- Modify: `DSM_Front/src/app/_layout.tsx`

**Interfaces:**

- Consumes: `SessionProvider`, `useSession`, and `SessionStack`.
- Produces: application-level secure session bootstrap.

- [ ] **Step 1: Move splash completion behind both prerequisites**

Keep the existing font load. Remove the root effect that hides the splash immediately after fonts load. Inside the session-aware navigator, hide the splash only when the session state is not `bootstrapping`.

- [ ] **Step 2: Nest providers**

Use:

```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <PrototypeProvider>
    <SessionProvider>
      <DailyupNavigator />
    </SessionProvider>
  </PrototypeProvider>
</GestureHandlerRootView>
```

- [ ] **Step 3: Replace the unguarded stack**

Read session state with `useSession()` and render `SessionStack` with the existing theme, animation, background, and hidden-header options.

- [ ] **Step 4: Run focused integration verification**

```powershell
npm.cmd test -- src/features/auth/session-routing.test.tsx src/features/auth/session-context.test.tsx
npm.cmd run typecheck
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/app/_layout.tsx
git commit -m "feat(front): bootstrap protected session"
```

### Task 24: Remove the prototype login bypass

**Files:**

- Create: `DSM_Front/src/app/index.test.tsx`
- Modify: `DSM_Front/src/app/index.tsx`

**Interfaces:**

- Produces: login UI that cannot enter authenticated routes without provider-token acquisition.

- [ ] **Step 1: Write a failing no-bypass test**

```tsx
const replace = jest.fn();
const showToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => ({
    showToast,
    theme: 'dark',
    toastMessage: null,
  }),
}));

it('does not simulate authentication without a provider token', () => {
  jest.useFakeTimers();
  render(<LoginScreen />);

  fireEvent.press(
    screen.getByRole('button', { name: 'Google로 계속하기' }),
  );
  jest.advanceTimersByTime(680);
  fireEvent.press(
    screen.getByRole('button', { name: 'Kakao로 계속하기' }),
  );

  expect(replace).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    '소셜 로그인 연결은 다음 단계에서 제공됩니다.',
  );
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/app/index.test.tsx
```

Expected: FAIL because the 680 ms prototype timer still navigates to tutorial.

- [ ] **Step 3: Remove timer navigation**

Remove `useRouter`, timer refs, loading state, and simulated navigation. Both provider buttons call:

```ts
const explainProviderStep = () => {
  showToast('소셜 로그인 연결은 다음 단계에서 제공됩니다.');
};
```

Keep Apple disabled. Do not call `signIn` with a fabricated token.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/app/index.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/app/index.test.tsx src/app/index.tsx
git commit -m "fix(front): remove prototype auth bypass"
```

### Task 25: Persist tutorial completion

**Files:**

- Create: `DSM_Front/src/app/tutorial.test.tsx`
- Modify: `DSM_Front/src/app/tutorial.tsx`

**Interfaces:**

- Consumes: `useSession().completeOnboarding`, action, and safe error.
- Produces: account-global completion for Finish and Skip.

- [ ] **Step 1: Write failing finish/skip tests**

```tsx
const mockUseSession = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

function makeOnboardingSession(
  completeOnboarding: jest.MockedFunction<() => Promise<void>>,
  error: ApiError | null = null,
) {
  return {
    state: {
      status: 'onboarding' as const,
      userId: 'user-1',
      onboardingCompletedAt: null,
    },
    action: 'idle' as const,
    error,
    completeOnboarding,
    logout: jest.fn(),
    retryRecovery: jest.fn(),
    signIn: jest.fn(),
  };
}

it.each(['시작하기', '건너뛰기'])(
  '%s completes canonical onboarding',
  async (label) => {
    const completeOnboarding = jest.fn().mockResolvedValue(undefined);
    mockUseSession.mockReturnValue(
      makeOnboardingSession(completeOnboarding),
    );
    render(
      <PrototypeProvider>
        <TutorialScreen />
      </PrototypeProvider>,
    );

    if (label === '시작하기') {
      for (let index = 1; index < tutorialPages.length; index += 1) {
        fireEvent.press(screen.getByRole('button', { name: '다음' }));
      }
    }
    fireEvent.press(screen.getByRole('button', { name: label }));

    await waitFor(() =>
      expect(completeOnboarding).toHaveBeenCalledTimes(1),
    );
  },
);

it('keeps tutorial retry available after a network failure', () => {
  const completeOnboarding = jest.fn().mockResolvedValue(undefined);
  mockUseSession.mockReturnValue(
    makeOnboardingSession(
      completeOnboarding,
      new ApiError('network', 'Network unavailable'),
    ),
  );
  render(
    <PrototypeProvider>
      <TutorialScreen />
    </PrototypeProvider>,
  );

  expect(
    screen.getByText('완료 상태를 저장하지 못했어요. 다시 시도해 주세요.'),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '건너뛰기' }));
  expect(completeOnboarding).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- src/app/tutorial.test.tsx
```

Expected: FAIL because the screen routes locally without calling the API.

- [ ] **Step 3: Use the session action**

Replace `router.replace('/(tabs)')` with:

```ts
const { action, completeOnboarding, error } = useSession();
const finish = () => {
  if (action !== 'completing-onboarding') {
    void completeOnboarding();
  }
};
const completionFailed =
  error?.kind === 'network' || error?.kind === 'timeout';
```

Disable finish/skip while `action === 'completing-onboarding'` and render `완료 상태를 저장하지 못했어요. 다시 시도해 주세요.` when `completionFailed`. Routing changes only through the session guard after the canonical timestamp response.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- src/app/tutorial.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- src/app/tutorial.test.tsx src/app/tutorial.tsx
git commit -m "feat(front): persist onboarding completion"
```

### Task 26: Wire local-first logout

**Files:**

- Create: `DSM_Front/src/app/(tabs)/mypage.test.tsx`
- Modify: `DSM_Front/src/app/(tabs)/mypage.tsx`

**Interfaces:**

- Consumes: `useSession().logout`.
- Produces: session logout without manual route bypass.

- [ ] **Step 1: Write the failing logout test**

```tsx
const mockUseSession = jest.fn();
const mockUsePrototype = jest.fn();

jest.mock('@/features/auth/session-context', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/prototype/prototype-context', () => ({
  usePrototype: () => mockUsePrototype(),
}));

function makeAuthenticatedSession(
  logout: jest.MockedFunction<() => Promise<void>>,
) {
  return {
    state: {
      status: 'authenticated' as const,
      userId: 'user-1',
      onboardingCompletedAt: '2026-07-25T00:00:00.000Z',
    },
    action: 'idle' as const,
    error: null,
    completeOnboarding: jest.fn(),
    logout,
    retryRecovery: jest.fn(),
    signIn: jest.fn(),
  };
}

it('resets prototype state and invokes secure logout without manual routing', () => {
  const logout = jest.fn().mockResolvedValue(undefined);
  const resetPrototype = jest.fn();
  mockUseSession.mockReturnValue(
    makeAuthenticatedSession(logout),
  );
  mockUsePrototype.mockReturnValue({
    resetPrototype,
    setTheme: jest.fn(),
    showToast: jest.fn(),
    theme: 'dark',
  });
  render(<MyPageScreen />);

  fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));

  expect(resetPrototype).toHaveBeenCalledTimes(1);
  expect(logout).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm.cmd test -- "src/app/(tabs)/mypage.test.tsx"
```

Expected: FAIL because the screen still routes to `/explore`.

- [ ] **Step 3: Replace manual routing**

Remove `useRouter` and use:

```ts
const { action, logout } = useSession();

const logoutSession = () => {
  resetPrototype();
  void logout();
};
```

Set `onPress={logoutSession}` and `disabled={action === 'logging-out'}`. Expo Router guards own the route transition.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
npm.cmd test -- "src/app/(tabs)/mypage.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Commit after Git approval**

```powershell
git add -- "src/app/(tabs)/mypage.test.tsx" "src/app/(tabs)/mypage.tsx"
git commit -m "feat(front): wire secure logout"
```

### Task 27: Run the complete Backend verification gate

**Files:**

- No file changes.

**Interfaces:**

- Verifies: Tasks 1–6.

- [ ] **Step 1: Run unit and e2e tests**

```powershell
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
```

Expected: all suites PASS with zero failures.

- [ ] **Step 2: Run build and Prisma static checks**

```powershell
npm.cmd run build
npx.cmd prisma validate
npx.cmd prisma generate
```

Expected: exit `0`.

- [ ] **Step 3: Run non-fixing lint on changed Backend files**

```powershell
npx.cmd eslint src/auth/auth.controller.ts src/auth/auth.controller.spec.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/config/env.validation.ts src/config/env.validation.spec.ts src/app.bootstrap.ts src/app.bootstrap.spec.ts test/set-env.ts
```

Expected: zero errors.

- [ ] **Step 4: Check the Backend diff**

```powershell
git diff --check -- DSM_Back
```

Expected: exit `0`.

### Task 28: Apply and verify the persistent local migration

**Files:**

- No source file changes; local PostgreSQL state changes.

**Interfaces:**

- Consumes: explicit action-time approval and the loopback Docker development database.
- Produces: applied onboarding migration with zero drift.

- [ ] **Step 1: Confirm the exact database target before mutation**

```powershell
docker compose ps
npx.cmd prisma migrate status
```

Expected: PostgreSQL 17 is healthy at `127.0.0.1`; datasource is the approved local development database. Stop if the URL is remote or ambiguous.

- [ ] **Step 2: Request explicit local migration approval**

Do not run the next command until the user approves this exact persistent local DB target.

- [ ] **Step 3: Apply the append-only migration**

```powershell
npx.cmd prisma migrate deploy
```

Expected: `20260725_user_onboarding_completed_at` applied once.

- [ ] **Step 4: Verify status and zero drift**

```powershell
npx.cmd prisma migrate status
npx.cmd prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: migrations up to date and diff exit `0`.

- [ ] **Step 5: Verify the live column without modifying data**

```powershell
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT column_name, data_type, datetime_precision, is_nullable FROM information_schema.columns WHERE table_schema = ''public'' AND table_name = ''User'' AND column_name = ''onboardingCompletedAt'';"'
```

Expected: `onboardingCompletedAt|timestamp with time zone|6|YES`.

### Task 29: Run the complete Front verification gate

**Files:**

- No file changes.

**Interfaces:**

- Verifies: Tasks 7–26.

- [ ] **Step 1: Run all Front tests**

```powershell
npm.cmd test
```

Expected: all Jest suites PASS with zero failures.

- [ ] **Step 2: Run typecheck and lint**

```powershell
npm.cmd run typecheck
npm.cmd run lint
```

Expected: exit `0`.

- [ ] **Step 3: Export the Web QA build**

```powershell
npx.cmd expo export --platform web
```

Expected: static Web export succeeds without embedding secrets.

- [ ] **Step 4: Run secret and persistence scans**

```powershell
rg -n -g "!*.test.ts" -g "!*.test.tsx" "localStorage|sessionStorage|indexedDB|Authorization.*console|accessToken.*console|refreshToken.*console" src
```

Expected: no forbidden persistence or token-logging implementation.

- [ ] **Step 5: Verify the Front diff**

```powershell
git diff --check -- DSM_Front
```

Expected: exit `0`.

### Task 30: Perform manual Web and Native session QA

**Files:**

- No source file changes.

**Interfaces:**

- Verifies: routing and platform persistence behavior.

- [ ] **Step 1: Web unauthenticated QA**

Run:

```powershell
npm.cmd run web
```

Verify at 909×540 and 390×844:

- login renders;
- Google/Kakao cannot bypass auth;
- reload returns to unauthenticated;
- recovery screens render safe copy;
- no token appears in console/network logs.

- [ ] **Step 2: Android real-device SecureStore smoke**

No device-only auth bypass or temporary route is introduced by this plan. Run this step only when a separately approved device harness or the provider-token acquisition milestone can exercise the production adapter:

- store a test refresh token through the production adapter;
- terminate and restart the process;
- confirm refresh bootstrap;
- logout and restart;
- confirm the token is absent.

- [ ] **Step 3: iOS real-device SecureStore smoke**

Repeat the same four checks on a real iOS device under the same separately approved prerequisite. Emulator/simulator-only evidence does not close this gate.

- [ ] **Step 4: Record unavailable external evidence honestly**

If a device or approved execution path is unavailable, leave this task incomplete and record the exact missing platform or missing harness/provider prerequisite. Do not claim native session completion.

### Task 31: Run the authentication change-gate

**Files:**

- Create: `.ai/audits/20260725-change-gate-front-secure-session/README.md`
- Create: `.ai/audits/20260725-change-gate-front-secure-session/findings.jsonl`

**Interfaces:**

- Consumes: implementation diff and fresh verification evidence.
- Produces: deduplicated security/concurrency/data-integrity findings and closure state.

- [ ] **Step 1: Initialize the audit**

Use audit id `20260725-change-gate-front-secure-session`, mode `change-gate`, and lenses:

- token confidentiality;
- logout/login/refresh races;
- refresh single-flight and replay limits;
- storage failure/tombstone behavior;
- onboarding idempotency and migration integrity;
- CORS exact-origin policy;
- no-bypass routing.

- [ ] **Step 2: Record findings**

Every JSONL record must contain the project-required fingerprint, severity, evidence, status, validator assignment, and residual risk fields. Do not mark a finding `FIXED` without implementation and independent recheck evidence.

- [ ] **Step 3: Apply closure policy**

- no unresolved P0/P1;
- security, concurrency, and data-integrity P2 findings receive the required independent validation;
- accepted risks remain `ACCEPTED_RISK`;
- missing real-device evidence remains an open gate, not a passing test.

- [ ] **Step 4: Commit audit artifacts after Git approval**

```powershell
git add -- .ai/audits/20260725-change-gate-front-secure-session/README.md .ai/audits/20260725-change-gate-front-secure-session/findings.jsonl
git commit -m "docs(audit): verify secure session gate"
```

### Task 32: Update completion memory

**Files:**

- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`

**Interfaces:**

- Consumes: fresh Backend, Front, DB, device, and change-gate evidence.
- Produces: current implementation snapshot and truthful checklist status.

- [ ] **Step 1: Update context with exact evidence**

Record:

- implemented endpoints and Front session layers;
- exact test suite/test counts;
- build, lint, typecheck, Web export, Prisma status, and zero-drift results;
- Android/iOS device evidence or the exact missing platform;
- change-gate finding counts and unresolved risks;
- provider OAuth and M12C remaining scope.

- [ ] **Step 2: Update checklist status**

Mark only verified items complete. Keep the parent Front session item `[/]` if native device or change-gate evidence remains incomplete.

- [ ] **Step 3: Verify memory consistency**

```powershell
rg -n "Front secure session|onboardingCompletedAt|change-gate|실기기|provider" .ai/memory/context.md .ai/memory/checklist.md
git diff --check -- .ai/memory/context.md .ai/memory/checklist.md
```

Expected: evidence and incomplete gates agree across both files.

- [ ] **Step 4: Commit after Git approval**

```powershell
git add -- .ai/memory/context.md .ai/memory/checklist.md
git commit -m "docs(memory): record secure session status"
```

### Task 33: Update next-work authorization boundaries

**Files:**

- Modify: `.ai/memory/plan.md`

**Interfaces:**

- Consumes: Task 32 status.
- Produces: the next authorized milestone and residual gates.

- [ ] **Step 1: Update the current and next milestones**

Move to M12C only if Front session requirements actually pass. Keep these explicit:

- Google/Kakao provider acquisition remains separate unless implemented;
- FCM credentials/message send remain prohibited before sandbox approval;
- remote/production DB migration remains prohibited;
- lost refresh-response recovery remains a known limitation;
- offline logout server-token expiry risk remains accepted;
- unresolved device evidence remains a gate.

- [ ] **Step 2: Re-read all three memory files**

```powershell
Get-Content -Raw -Encoding utf8 .ai/memory/plan.md
Get-Content -Raw -Encoding utf8 .ai/memory/context.md
Get-Content -Raw -Encoding utf8 .ai/memory/checklist.md
```

Expected: no contradictory completion state.

- [ ] **Step 3: Run final repository checks**

```powershell
git diff --check
git status --short --branch
```

Expected: only the intended final memory change is unstaged.

- [ ] **Step 4: Commit after Git approval**

```powershell
git add -- .ai/memory/plan.md
git commit -m "docs(memory): advance secure session plan"
```

---

## Final Verification Checklist

- [ ] Backend full Jest and e2e suites pass with fresh output.
- [ ] Backend build, non-fixing lint, Prisma validate, generate, migration status, and zero drift pass.
- [ ] Persistent local DB contains nullable `timestamptz(6)` onboarding field.
- [ ] Front full Jest, TypeScript, Expo lint, and Web export pass.
- [ ] Web has no persistent token API use.
- [ ] Concurrent `401` tests prove one refresh and one replay per request.
- [ ] Logout-race tests prove no late token resurrection.
- [ ] Storage deletion failure proves tombstone fallback and blocking recovery.
- [ ] Account-global onboarding returns the canonical server timestamp.
- [ ] CORS accepts exact listed browser origins and no-Origin clients only.
- [ ] Android and iOS real-device evidence is recorded or left explicitly incomplete.
- [ ] Change-gate has no unresolved P0/P1 and no unvalidated security/concurrency P2.
- [ ] `.ai/memory` truthfully matches the current checkout and evidence.
- [ ] The unrelated `.ai/docs/2026-07-15-current-project-architecture.md` change remains preserved unless separately authorized.
