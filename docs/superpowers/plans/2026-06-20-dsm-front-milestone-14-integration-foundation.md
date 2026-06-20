# DSM_Front Milestone 14 Integration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DSM_Front integration foundation for authenticated REST, token persistence, protected routing, typed API modules, query hooks, and realtime client setup.

**Architecture:** Add a thin integration layer under `src/lib` and `src/features`, then route screens through `(auth)` and `(app)` groups. Keep backend calls out of screen components and use one shared HTTP client plus auth/query providers.

**Tech Stack:** Expo SDK 55, Expo Router, React 19, React Native 0.83, TypeScript strict mode, `expo-secure-store`, `@tanstack/react-query`, `socket.io-client`, optional focused test tooling.

**Execution Status:** Completed on 2026-06-21. `npm run typecheck`, `npm run lint`, and `npm run verify` pass in `DSM_Front`. Review report: `docs/reviews/2026-06-20-dsm-front-milestone-14-review.md`.

---

## File Structure

- Modify: `DSM_Front/package.json` - add scripts and integration dependencies.
- Modify: `DSM_Front/package-lock.json` - dependency lock updates.
- Create: `DSM_Front/.env.example` - document public API/WS URLs.
- Create: `DSM_Front/src/config/env.ts` - runtime env accessors.
- Create: `DSM_Front/src/lib/api/api-error.ts` - normalized API error type/parser.
- Create: `DSM_Front/src/lib/api/http-client.ts` - shared fetch client and refresh retry.
- Create: `DSM_Front/src/lib/api/query-client.ts` - React Query client defaults.
- Create: `DSM_Front/src/lib/auth/token-types.ts` - session token types.
- Create: `DSM_Front/src/lib/auth/token-storage.ts` - SecureStore/localStorage token persistence.
- Create: `DSM_Front/src/lib/auth/auth-context.tsx` - auth state/provider/actions.
- Create: `DSM_Front/src/lib/realtime/socket-client.ts` - Socket.IO auth wrapper.
- Create: `DSM_Front/src/features/auth/auth.api.ts` - auth endpoint client.
- Create: `DSM_Front/src/features/users/users.api.ts` - users endpoint client.
- Create: `DSM_Front/src/features/categories/categories.api.ts` - categories endpoint client.
- Create: `DSM_Front/src/features/tasks/tasks.api.ts` - tasks endpoint client.
- Create: `DSM_Front/src/features/scores/scores.api.ts` - scores endpoint client.
- Create: `DSM_Front/src/features/rankings/rankings.api.ts` - rankings endpoint client.
- Create: `DSM_Front/src/features/notifications/notifications.api.ts` - notifications endpoint client.
- Create: `DSM_Front/src/features/app/use-dashboard-summary.ts` - first composed authenticated hook.
- Modify: `DSM_Front/src/app/_layout.tsx` - mount providers and route guard shell.
- Create: `DSM_Front/src/app/(auth)/login.tsx` - developer provider-token login screen.
- Create: `DSM_Front/src/app/(app)/_layout.tsx` - authenticated tabs/layout.
- Create or replace: `DSM_Front/src/app/(app)/index.tsx` - dashboard smoke screen.
- Create: `DSM_Front/src/app/(app)/tasks.tsx` - tasks smoke screen.
- Create: `DSM_Front/src/app/(app)/rankings.tsx` - rankings smoke screen.
- Remove or stop routing starter `DSM_Front/src/app/explore.tsx` after moving tabs into `(app)`.
- Create: `DSM_Front/docs/integration.md` or `docs/reviews/2026-06-20-dsm-front-milestone-14-review.md` - frontend integration report.
- Modify: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md` - record milestone 14 plan/status.

---

### Task 1: Dependency and Environment Foundation

**Files:**
- Modify: `DSM_Front/package.json`
- Modify: `DSM_Front/package-lock.json`
- Create: `DSM_Front/.env.example`
- Create: `DSM_Front/src/config/env.ts`

- [ ] **Step 1: Read Expo v55 docs before code**

Open the versioned Expo docs required by `DSM_Front/AGENTS.md`:

```text
https://docs.expo.dev/versions/v55.0.0/
```

Confirm current guidance for environment variables and `expo-secure-store`.

- [ ] **Step 2: Install runtime dependencies**

Run from `DSM_Front`:

```powershell
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' install @tanstack/react-query socket.io-client
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npx.cmd' expo install expo-secure-store
```

Expected: dependencies are added to `package.json` and `package-lock.json`.

- [ ] **Step 3: Add scripts**

Add scripts to `DSM_Front/package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "verify": "npm run lint && npm run typecheck"
  }
}
```

Keep existing Expo scripts.

- [ ] **Step 4: Add env example**

Create `DSM_Front/.env.example`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_WS_URL=http://localhost:3000
```

- [ ] **Step 5: Implement env accessor**

Create `DSM_Front/src/config/env.ts`:

```ts
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return trimTrailingSlash(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  );
}

export function getWebSocketUrl(): string {
  return trimTrailingSlash(
    process.env.EXPO_PUBLIC_WS_URL ?? getApiBaseUrl(),
  );
}
```

- [ ] **Step 6: Verify**

Run:

```powershell
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run typecheck
```

Expected: TypeScript passes.

---

### Task 2: Typed API Client and Token Storage

**Files:**
- Create: `DSM_Front/src/lib/api/api-error.ts`
- Create: `DSM_Front/src/lib/api/http-client.ts`
- Create: `DSM_Front/src/lib/auth/token-types.ts`
- Create: `DSM_Front/src/lib/auth/token-storage.ts`

- [ ] **Step 1: Add token types**

Create `DSM_Front/src/lib/auth/token-types.ts`:

```ts
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
```

- [ ] **Step 2: Add API error parser**

Create `DSM_Front/src/lib/api/api-error.ts`:

```ts
export type ApiErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(formatApiErrorMessage(status, body));
    this.name = 'ApiError';
  }
}

function formatApiErrorMessage(
  status: number,
  body: ApiErrorBody | null,
): string {
  const message = body?.message;
  if (Array.isArray(message)) {
    return message.join('\n');
  }
  return message ?? body?.error ?? `Request failed with status ${status}`;
}

export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body);
  } catch {
    return new ApiError(response.status, null);
  }
}
```

- [ ] **Step 3: Add token storage**

Create `DSM_Front/src/lib/auth/token-storage.ts`:

```ts
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from './token-types';

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
    return JSON.parse(raw) as AuthTokens;
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
```

- [ ] **Step 4: Add HTTP client**

Create `DSM_Front/src/lib/api/http-client.ts`:

```ts
import { getApiBaseUrl } from '@/config/env';
import { parseApiError } from './api-error';
import type { AuthTokens } from '@/lib/auth/token-types';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type TokenController = {
  getTokens: () => AuthTokens | null;
  setTokens: (tokens: AuthTokens | null) => Promise<void>;
  refreshTokens: (refreshToken: string) => Promise<AuthTokens>;
};

export type ApiRequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  authenticated?: boolean;
};

let tokenController: TokenController | null = null;

export function configureHttpClient(controller: TokenController): void {
  tokenController = controller;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return requestWithOptionalRefresh<T>(path, options, true);
}

async function requestWithOptionalRefresh<T>(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && allowRefresh && options.authenticated !== false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return requestWithOptionalRefresh<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildHeaders(options: ApiRequestOptions): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const tokens = tokenController?.getTokens();
  if (options.authenticated !== false && tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  return headers;
}

async function refreshSession(): Promise<boolean> {
  const tokens = tokenController?.getTokens();
  if (!tokenController || !tokens?.refreshToken) {
    return false;
  }

  try {
    const nextTokens = await tokenController.refreshTokens(tokens.refreshToken);
    await tokenController.setTokens(nextTokens);
    return true;
  } catch {
    await tokenController.setTokens(null);
    return false;
  }
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run typecheck
```

Expected: TypeScript passes.

---

### Task 3: Backend API Modules

**Files:**
- Create: `DSM_Front/src/features/auth/auth.api.ts`
- Create: `DSM_Front/src/features/users/users.api.ts`
- Create: `DSM_Front/src/features/categories/categories.api.ts`
- Create: `DSM_Front/src/features/tasks/tasks.api.ts`
- Create: `DSM_Front/src/features/scores/scores.api.ts`
- Create: `DSM_Front/src/features/rankings/rankings.api.ts`
- Create: `DSM_Front/src/features/notifications/notifications.api.ts`

- [ ] **Step 1: Add auth API**

Create `DSM_Front/src/features/auth/auth.api.ts`:

```ts
import { apiRequest } from '@/lib/api/http-client';
import type { AuthTokens } from '@/lib/auth/token-types';

export type SocialProvider = 'GOOGLE' | 'KAKAO' | 'APPLE';

export type SocialLoginRequest = {
  provider: SocialProvider;
  token: string;
};

export function loginWithProviderToken(
  body: SocialLoginRequest,
): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', {
    method: 'POST',
    body,
    authenticated: false,
  });
}

export function refreshAuthTokens(refreshToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    authenticated: false,
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
  });
}
```

- [ ] **Step 2: Add users API**

Create `DSM_Front/src/features/users/users.api.ts` with `User`, profile,
notification settings, and social account calls:

```ts
import { apiRequest } from '@/lib/api/http-client';
import type { SocialProvider } from '@/features/auth/auth.api';

export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER';

export type User = {
  id: string;
  nickname: string | null;
  profileImageUrl: string | null;
  notificationEnabled: boolean;
  totalScore: number;
  tier: Tier;
};

export function getMe(): Promise<User> {
  return apiRequest<User>('/users/me');
}

export function updateProfile(body: {
  nickname?: string;
  profileImageUrl?: string | null;
}): Promise<User> {
  return apiRequest<User>('/users/me/profile', { method: 'PATCH', body });
}

export function updateNotificationSettings(body: {
  notificationEnabled: boolean;
}): Promise<User> {
  return apiRequest<User>('/users/me/notification-settings', {
    method: 'PATCH',
    body,
  });
}

export function getSocialAccounts(): Promise<SocialProvider[]> {
  return apiRequest<SocialProvider[]>('/users/me/social-accounts');
}
```

- [ ] **Step 3: Add domain API modules**

Create modules for categories, tasks, scores, rankings, and notifications using
the endpoint contract in `docs/api/DSM_Back_API_v0.md`. Use these exported enum
types exactly:

```ts
export type TaskDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type TaskStatus = 'PENDING' | 'COMPLETED';
export type RankingPeriod = 'DAILY' | 'WEEKLY' | 'TOTAL';
```

Each module must export request/response types and functions. Required
functions:

- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`
- `getTasksByDate`, `createTask`, `updateTask`, `deleteTask`, `completeTask`
- `getDailyScore`, `getScoreSummary`
- `getMyRanking`, `getLeaderboard`, `createRankingSnapshot`
- `registerFcmToken`, `revokeFcmToken`

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
```

Expected: TypeScript passes.

---

### Task 4: Auth Provider, Query Provider, and Route Protection

**Files:**
- Create: `DSM_Front/src/lib/api/query-client.ts`
- Create: `DSM_Front/src/lib/auth/auth-context.tsx`
- Modify: `DSM_Front/src/app/_layout.tsx`
- Create: `DSM_Front/src/app/(auth)/login.tsx`
- Create: `DSM_Front/src/app/(app)/_layout.tsx`

- [ ] **Step 1: Add Query client**

Create `DSM_Front/src/lib/api/query-client.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
    },
  });
}
```

- [ ] **Step 2: Add AuthProvider**

Create `DSM_Front/src/lib/auth/auth-context.tsx` with:

- token bootstrap from `readStoredTokens`,
- `configureHttpClient`,
- `loginWithProviderToken`,
- `refreshAuthTokens`,
- `logout`,
- state values `bootstrapping`, `signedOut`, `signedIn`, `error`.

The provider must expose:

```ts
export type AuthContextValue = {
  status: 'bootstrapping' | 'signedOut' | 'signedIn' | 'error';
  tokens: AuthTokens | null;
  signInWithProviderToken: (provider: SocialProvider, token: string) => Promise<void>;
  signOut: () => Promise<void>;
};
```

- [ ] **Step 3: Mount providers**

Modify `DSM_Front/src/app/_layout.tsx` so it mounts:

- `ThemeProvider`
- `QueryClientProvider`
- `AuthProvider`
- existing splash overlay
- Expo Router `Slot`

Do not keep starter `AppTabs` at the root; tabs move into `(app)/_layout.tsx`.

- [ ] **Step 4: Add auth login route**

Create `DSM_Front/src/app/(auth)/login.tsx`.

For this milestone, use a developer provider-token form:

- provider selector: `GOOGLE`, `KAKAO`, `APPLE`
- token text input
- submit calls `signInWithProviderToken`
- show loading/error states

Native OAuth UX is deferred.

- [ ] **Step 5: Add authenticated route layout**

Create `DSM_Front/src/app/(app)/_layout.tsx`.

Behavior:

- if auth status is `bootstrapping`, show a centered loading state.
- if signed out, redirect to `/(auth)/login`.
- if signed in, render tabs for dashboard, tasks, and rankings.

- [ ] **Step 6: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both commands pass.

---

### Task 5: First Authenticated Data Hooks and Smoke Screens

**Files:**
- Create: `DSM_Front/src/features/app/use-dashboard-summary.ts`
- Create or replace: `DSM_Front/src/app/(app)/index.tsx`
- Create: `DSM_Front/src/app/(app)/tasks.tsx`
- Create: `DSM_Front/src/app/(app)/rankings.tsx`
- Remove or stop exposing: `DSM_Front/src/app/explore.tsx`

- [ ] **Step 1: Add dashboard hook**

Create `DSM_Front/src/features/app/use-dashboard-summary.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/features/users/users.api';
import { getScoreSummary } from '@/features/scores/scores.api';
import { getMyRanking } from '@/features/rankings/rankings.api';

export function useDashboardSummary() {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });
  const scoreSummary = useQuery({
    queryKey: ['scores', 'summary'],
    queryFn: getScoreSummary,
  });
  const totalRanking = useQuery({
    queryKey: ['rankings', 'me', 'TOTAL'],
    queryFn: () => getMyRanking('TOTAL'),
  });

  return { me, scoreSummary, totalRanking };
}
```

- [ ] **Step 2: Add dashboard smoke screen**

Replace starter dashboard with a DSM screen at
`DSM_Front/src/app/(app)/index.tsx`.

It should render:

- greeting from `useDashboardSummary().me`,
- total score/tier,
- total ranking,
- short loading and error states.

- [ ] **Step 3: Add tasks smoke screen**

Create `DSM_Front/src/app/(app)/tasks.tsx`.

It should:

- call `getTasksByDate` for today's `YYYY-MM-DD`,
- list task titles/status,
- show empty/loading/error states,
- not implement full create/update UI yet.

- [ ] **Step 4: Add rankings smoke screen**

Create `DSM_Front/src/app/(app)/rankings.tsx`.

It should:

- call `getLeaderboard('TOTAL', 100)`,
- show rank, nickname, score,
- show empty/loading/error states.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both commands pass.

---

### Task 6: Realtime Client Wrapper and Documentation

**Files:**
- Create: `DSM_Front/src/lib/realtime/socket-client.ts`
- Create: `docs/reviews/2026-06-20-dsm-front-milestone-14-review.md`
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/context.md`
- Modify: `.ai/memory/checklist.md`

- [ ] **Step 1: Add Socket.IO client wrapper**

Create `DSM_Front/src/lib/realtime/socket-client.ts`:

```ts
import { io, type Socket } from 'socket.io-client';
import { getWebSocketUrl } from '@/config/env';
import type { RankingPeriod } from '@/features/rankings/rankings.api';

export type DsmSocket = Socket;

export function createDsmSocket(accessToken: string): DsmSocket {
  return io(getWebSocketUrl(), {
    transports: ['websocket'],
    auth: { token: accessToken },
    autoConnect: false,
  });
}

export function subscribeRanking(socket: DsmSocket, period: RankingPeriod): void {
  socket.emit('ranking.subscribe', { period });
}

export function unsubscribeRanking(socket: DsmSocket, period: RankingPeriod): void {
  socket.emit('ranking.unsubscribe', { period });
}
```

- [ ] **Step 2: Write review document**

Create `docs/reviews/2026-06-20-dsm-front-milestone-14-review.md` with:

```md
# DSM_Front Milestone 14 Review Report

## Summary

Milestone 14 establishes the DSM_Front backend integration foundation.

## Implemented

- Environment URL configuration.
- Shared HTTP client with token injection and refresh retry.
- Token storage abstraction.
- Auth provider and protected route groups.
- Typed API modules for DSM_Back API v0.
- React Query provider and initial data hooks.
- Socket.IO client wrapper.

## Verification

- `npm run typecheck`:
- `npm run lint`:
- `npm run verify`:

## Residual Risks

- Native social login provider UX is deferred.
- Push token collection/registration is deferred.
- Product-grade task/ranking/profile screens are deferred.
```

- [ ] **Step 3: Update `.ai/memory`**

Update:

- `.ai/memory/plan.md`: move milestone 14 into active/completed depending on execution state and set next milestone to DSM_Front product screens.
- `.ai/memory/context.md`: record the frontend integration architecture.
- `.ai/memory/checklist.md`: add milestone 14 task checklist.

- [ ] **Step 4: Final verification**

Run:

```powershell
cd C:\DSM\DSM_Front
npm run typecheck
npm run lint
npm run verify
cd C:\DSM
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Expected:

- TypeScript passes.
- Expo lint passes.
- Verify script passes.
- Git status shows only milestone 14 frontend integration files and docs.

---

## Final Verification

Run:

```powershell
cd C:\DSM\DSM_Front
$env:PATH='C:\DSM\.tools\node-v24.14.0-win-x64;' + $env:PATH
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run typecheck
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run lint
& 'C:\DSM\.tools\node-v24.14.0-win-x64\npm.cmd' run verify
cd C:\DSM
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Expected:

- TypeScript passes.
- Lint passes.
- Verify passes.
- Git shows intended milestone 14 changes only.

## Self-Review

- Spec coverage: covers API base URL config, token persistence, auth routing,
  typed API modules, query setup, and realtime wrapper.
- Scope check: product screen polish, native OAuth UX, push permission flow,
  and offline sync are explicitly deferred.
- Placeholder scan: no unresolved placeholder fields remain in this plan.
