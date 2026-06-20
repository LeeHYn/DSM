# DSM_Front Milestone 14 Integration Foundation Design

## Goal

Build the frontend integration foundation for `DSM_Front` so later product
screens can consume the completed `DSM_Back` API safely and consistently.

This milestone does not aim to finish all DSM product screens. It prepares the
API, auth, routing, data-fetching, and realtime seams that those screens will
use.

## Current State

- `DSM_Back` API v0 is documented in `docs/api/DSM_Back_API_v0.md`.
- `DSM_Front` is an Expo Router starter app under `DSM_Front/src/app`.
- The app currently has starter `index` and `explore` screens, themed
  components, tab helpers, and no backend integration layer.
- `DSM_Front/AGENTS.md` requires checking the exact Expo v55 docs before
  writing code.

## Scope

Milestone 14 includes:

- Environment-based backend URLs.
- A typed HTTP client with access token injection, refresh handling, and
  normalized API errors.
- Secure token persistence with native secure storage and a web fallback.
- Auth session provider and route protection.
- Query/data provider setup for backend reads and mutation invalidation.
- Minimal typed API modules for Auth, Users, Categories, Tasks, Scores,
  Rankings, and Notifications.
- Socket.IO client wrapper prepared for authenticated realtime connections.
- Starter authenticated app shell that proves protected API calls can be wired
  into screens.
- Frontend docs and memory updates.

Milestone 14 excludes:

- Full visual redesign of DSM screens.
- Native Google/Kakao/Apple social login UX.
- Push notification device-token collection and permission prompts.
- Offline sync.
- Production app signing, store release, and EAS setup.
- Full realtime UI subscriptions beyond the reusable socket client wrapper.

## Recommended Approach

Use a small feature-based integration layer instead of putting fetch calls
inside screens.

Recommended structure:

```text
DSM_Front/src/
  app/
    _layout.tsx
    (auth)/login.tsx
    (app)/_layout.tsx
    (app)/index.tsx
    (app)/tasks.tsx
    (app)/rankings.tsx
  config/
    env.ts
  lib/
    api/
      api-error.ts
      http-client.ts
      query-client.ts
    auth/
      auth-context.tsx
      token-storage.ts
      token-types.ts
    realtime/
      socket-client.ts
  features/
    auth/auth.api.ts
    users/users.api.ts
    categories/categories.api.ts
    tasks/tasks.api.ts
    scores/scores.api.ts
    rankings/rankings.api.ts
    notifications/notifications.api.ts
```

## Architecture Decisions

### API Client

The frontend should use one shared HTTP client. The client owns:

- Base URL resolution from `EXPO_PUBLIC_API_BASE_URL`.
- JSON request/response handling.
- `Authorization: Bearer <accessToken>` injection.
- One retry after `401` when a refresh token exists.
- Logout/session clear when refresh fails.
- API error normalization into a stable `ApiError` shape.

The client must not know about React components. It should accept token access
callbacks from the auth provider so it stays testable and reusable.

### Token Storage

Token storage should be abstracted behind `token-storage.ts`.

- Native platforms use `expo-secure-store`.
- Web uses `localStorage` only as a development/web fallback.
- Stored session shape is:

```ts
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
```

### Auth Provider

`AuthProvider` bootstraps stored tokens on app start, exposes session state,
and provides `loginWithProviderToken`, `refresh`, and `logout`.

States:

- `bootstrapping`
- `signedOut`
- `signedIn`
- `error`

The first implementation can call the backend social login endpoint but does
not need to implement native provider SDK flows. The login screen can expose a
developer/provider-token form until real OAuth UX is designed.

### Routing

Use Expo Router route groups:

- `(auth)` for signed-out screens.
- `(app)` for authenticated app screens.

Root layout mounts global providers and redirects based on auth state. This
keeps screen files simple and prevents protected API calls from firing before a
session exists.

### Data Fetching

Use `@tanstack/react-query` for server-state management. It gives:

- cache keys per API resource,
- loading/error states,
- mutation invalidation,
- easy refresh on focus/reconnect later.

Initial query hooks:

- `useMe`
- `useCategories`
- `useTasksByDate`
- `useScoreSummary`
- `useMyRanking`
- `useLeaderboard`

Mutation hooks:

- create/update/delete/complete task,
- update profile,
- update notification settings,
- register/revoke FCM token later.

### Realtime

Add a `socket-client.ts` wrapper using `socket.io-client`.

It should:

- connect only when an access token exists,
- pass token through `auth.token`,
- expose subscribe/unsubscribe helpers for ranking periods,
- leave UI-level event handling for later screen milestones.

### Error Handling

The API layer should map backend errors into:

```ts
export type ApiErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};
```

The UI should display short user-facing messages and keep raw error details out
of normal screens.

### Testing and Verification

Milestone 14 should add at least:

- TypeScript typecheck script.
- Pure tests for token storage fallback, API error parsing, and refresh retry.
- `npm run lint`.
- `npm run typecheck`.
- App startup smoke check with Expo web if available.

If test tooling is added, keep it focused on pure integration utilities first.
Full component tests can come after the main UI structure is stable.

## Success Criteria

- The app has a documented API base URL configuration.
- A session can be stored, restored, refreshed, and cleared through one auth
  provider.
- Protected API modules use the shared HTTP client, not ad hoc fetch calls.
- Route groups prevent unauthenticated access to `(app)` screens.
- At least one authenticated starter screen reads backend data through query
  hooks.
- The project passes lint and typecheck.
- Docs and `.ai/memory` identify the next milestone as product screen
  integration.

## Deferred Work

- Native social login UX and provider SDK setup.
- Push notification permission flow and FCM token registration.
- Full task/calendar UI.
- Full scores/rankings dashboards.
- Profile image upload/storage.
- Offline-first cache and sync.
