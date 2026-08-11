# Android Google Provider Login Design

- **Date:** 2026-08-12
- **Status:** Approved for detailed planning; product implementation is not yet approved
- **Target:** `DSM_Front` on Expo SDK 55, Android first
- **Decision:** Acquire a Google ID token through a native adapter, then reuse the existing provider-neutral session controller

## 1. Goal

Replace the Google login placeholder with a real Android Google sign-in flow while preserving the existing secure-session contract:

1. acquire a Google ID token on the device;
2. call the existing `SessionController.signIn('GOOGLE', idToken)` path;
3. exchange the provider token through `POST /auth/login`;
4. persist only the DSM refresh token in Native SecureStore;
5. keep the DSM access token in memory;
6. route through the existing profile and onboarding state;
7. verify process restart, refresh, and verified-clear logout on a physical Android device.

This milestone does not implement Kakao, iOS Google login, Apple login, notification client work, or a new backend authentication endpoint.

## 2. Constraints and prerequisites

- Expo SDK 55 is authoritative for Expo configuration and development-build behavior.
- The selected provider library is `react-native-nitro-google-signin`, using its Expo config plugin and Android Credential Manager support.
- The native module requires a development build. Expo Go is not completion evidence.
- The current Windows machine has no Android SDK, `adb`, or emulator. The approved validation path is an EAS cloud development build installed on a physical Android device.
- EAS project creation, source upload, Google Console changes, credential registration, and physical-device use are external actions. Each remains blocked until the user explicitly authorizes that action.
- The Android application ID is not assigned by this design. It must be selected and approved before Google Console registration or the first native build; no placeholder package ID may be registered or shipped.
- The frontend Web client ID is public application configuration, not a secret. The backend Google client ID remains server configuration. Both values must identify the same Google OAuth Web client so backend audience verification succeeds.

## 3. Architecture

Provider acquisition and DSM session management remain separate.

### 3.1 Google sign-in adapter

A small adapter owns all calls to the native Google library. Its public operation returns one of three outcomes:

- success with a non-empty Google ID token;
- user cancellation;
- a sanitized provider failure.

The adapter:

- configures the native library once at the application/provider boundary;
- reads the public Web client ID from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`;
- rejects a missing or blank client ID before opening native sign-in;
- validates that the SDK result contains a non-empty ID token;
- normalizes provider-specific cancellation and error codes;
- never persists, logs, serializes, or exposes the token in an error.

The adapter does not call the DSM backend and does not own DSM session state.

### 3.2 Login screen

The login screen calls the adapter after a Google-button press. On success it immediately passes the ID token to the existing `signIn('GOOGLE', token)` operation.

The screen owns only interaction state:

- prevent duplicate provider acquisition while one request is active;
- remain disabled while provider acquisition or DSM sign-in is active;
- treat cancellation as a return to idle without an error toast;
- show a safe Korean message for configuration, provider, network, or backend failure;
- restore the button after every terminal failure.

The Kakao button retains its current placeholder behavior in this milestone.

### 3.3 Existing session controller

The existing session controller remains provider-neutral and unchanged unless a failing integration test proves a contract gap. It continues to own:

- `POST /auth/login`;
- runtime validation of the DSM token pair;
- refresh-token persistence;
- access-token publication;
- `/auth/me` loading;
- onboarding/authenticated routing;
- epoch fencing and cleanup after late or failed operations.

No Google SDK type or provider-specific error is allowed to cross into the session controller.

## 4. Configuration and build

The frontend environment template adds `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Because every `EXPO_PUBLIC_` value is embedded in the client bundle, this variable may contain only the public OAuth client identifier.

The Expo application configuration adds:

- the native Google sign-in config plugin;
- an approved Android application ID;
- only the plugin options required by the selected library and Google project.

The EAS configuration defines a `development` profile with a development client. Remote development variables are scoped to the EAS `development` environment. No provider client secret, DSM token, signing private key, or backend credential is committed to Git or exposed through an `EXPO_PUBLIC_` variable.

Native build configuration proceeds only after these values agree:

1. approved Android application ID;
2. Google Console Android OAuth client application ID and signing certificate fingerprint;
3. Google Console Web OAuth client ID;
4. frontend `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`;
5. backend `GOOGLE_CLIENT_ID` audience.

## 5. Data flow

1. The user presses Google login.
2. The screen enters provider-acquisition pending state and disables duplicate submission.
3. The adapter invokes native Google sign-in.
4. Cancellation returns directly to idle.
5. A successful non-empty ID token is passed to `SessionController.signIn('GOOGLE', idToken)`.
6. The existing auth API sends the token to `POST /auth/login`.
7. The backend verifies the Google token and audience, then returns a DSM access/refresh pair.
8. The session controller persists the DSM refresh token before publishing the access token.
9. The controller loads `/auth/me` and routes to onboarding or the authenticated tabs.
10. The Google ID token is released after the exchange call and is never persisted.

## 6. Error handling

| Failure | Session effect | UI behavior |
|---|---|---|
| Missing public Web client ID | No session call | Safe configuration message; button restored |
| User cancels Google UI | No session call | Silent return to idle |
| Native SDK unavailable or fails | No session call | Generic Google-login failure message |
| SDK success without an ID token | No session call | Safe provider-response failure message |
| DSM network, protocol, or backend rejection | Existing session policy | Existing safe sign-in error; no provider detail |
| Duplicate press | Join neither operation nor start another | Ignore while pending |
| Logout after successful sign-in | Existing verified-clear policy | Existing logout/recovery UI |

Diagnostic output may contain an error category and sanitized code, but never an ID token, DSM token, authorization header, raw auth body, user identifier, or unsanitized provider response.

## 7. Testing strategy

Implementation follows test-driven development in one- or two-file stages.

### 7.1 Adapter tests

- valid configuration and SDK success return the ID token;
- missing or blank client ID fails before the SDK opens;
- cancellation is distinguishable from failure;
- missing ID token becomes a sanitized provider-response error;
- provider errors do not expose raw responses or token-like data;
- concurrent invocation is rejected or prevented by the caller contract.

### 7.2 Login-screen tests

- Google success forwards exactly one token to `signIn('GOOGLE', token)`;
- cancellation does not call the session controller or show an error;
- acquisition failure shows a safe Korean message;
- acquisition and session-pending states disable duplicate presses;
- Kakao retains its current placeholder behavior;
- no manual route replacement bypasses session-owned routing.

### 7.3 Regression verification

- focused adapter and login-screen Jest suites;
- existing frontend Jest suite;
- TypeScript typecheck;
- non-fixing ESLint;
- `git diff --check`;
- dependency/config inspection for accidental secrets and token logging;
- existing session and routing regression tests.

### 7.4 Physical Android smoke

Mocked tests and Web QA do not complete this milestone. A physical Android device must demonstrate:

1. development-build installation and launch;
2. real Google account selection and login;
3. correct onboarding or authenticated destination;
4. process termination and restart with SecureStore session recovery;
5. an authenticated request after access-token refresh;
6. logout with verified local credential clearing;
7. restart after logout returning to the login route;
8. no token or authorization material in captured application logs.

Evidence records the build/profile, application version, Android version, test result, and sanitized failure category only. It never records account identifiers or token values.

## 8. Security and review gate

This change touches provider authentication and credential handling, so the project `change-gate` applies before the milestone can be closed. Review lenses include:

- provider-token lifetime and leakage;
- client-ID/audience mismatch;
- duplicate or late login races;
- session-controller boundary violations;
- logout and restart behavior;
- dependency/configuration supply-chain risk.

No static review replaces the physical-device smoke. No physical-device smoke replaces automated regression tests.

## 9. Implementation boundaries

The detailed plan must keep each implementation stage to one or two exact writable files and preserve existing worktree changes. Expected stages are:

1. dependency and native plugin configuration;
2. public environment contract and validated configuration;
3. native Google adapter and its focused tests;
4. login-screen integration and focused tests;
5. automated frontend regression verification;
6. separately approved EAS and Google Console setup;
7. physical Android smoke evidence;
8. authentication `change-gate` and memory closure.

Git stage, commit, push, pull request, merge, deployment, Google Console mutation, EAS upload, and remote environment mutation each remain subject to the repository's explicit approval gates.

## 10. Completion criteria

The milestone is complete only when:

- the Google button performs real Android provider acquisition;
- a valid Google ID token reaches the existing provider-neutral session controller exactly once;
- provider tokens are neither stored nor logged;
- only the DSM refresh token persists in Native SecureStore;
- cancellation and all defined failures restore a usable login screen;
- automated frontend verification passes;
- the physical Android smoke passes every step;
- the authentication change-gate has no unresolved blocking finding;
- memory documents match the actual code, tests, Git state, and external evidence.

The following are not completion evidence:

- Expo Go;
- browser-only OAuth;
- mocked provider success;
- emulator-only SecureStore behavior;
- an EAS build that was not installed and exercised;
- hardcoded or logged provider credentials;
- a backend-only Google token test.

## 11. Official references

- Expo SDK 55: <https://docs.expo.dev/versions/v55.0.0/>
- Expo Google authentication: <https://docs.expo.dev/guides/google-authentication/>
- Expo authentication overview: <https://docs.expo.dev/guides/authentication/>
- Expo Android development build: <https://docs.expo.dev/tutorial/eas/android-development-build/>
- Expo development builds: <https://docs.expo.dev/develop/development-builds/use-development-builds/>
- Expo environment variables: <https://docs.expo.dev/guides/environment-variables/>
- EAS environment variables: <https://docs.expo.dev/eas/environment-variables/>
- Google OpenID Connect: <https://developers.google.com/identity/openid-connect/openid-connect>
