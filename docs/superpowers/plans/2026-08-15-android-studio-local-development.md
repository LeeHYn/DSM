# Android Studio Local Development Implementation Plan

> **Current status (2026-08-16): COMPLETE, then superseded by the Android-only migration.**
> Expo prebuild/EAS instructions below are retained only as historical evidence. The current project is a tracked pure React Native 0.83 Android project; do not run Expo prebuild or EAS for local development. See [Android-only design](../specs/2026-08-16-android-only-react-native-design.md) and [migration plan](2026-08-16-remove-expo-android-only.md).

## Current Android Studio runbook

1. Verify installations:
   - Android Studio: `C:\Users\jemie\AppData\Local\Programs\AndroidStudioQuail\android-studio\bin\studio64.exe`
   - Android SDK: `C:\Users\jemie\AppData\Local\Android\Sdk`
   - JDK 17: `C:\Users\jemie\.jdks\ms-17.0.20`
   - AVD: `Medium_Phone` / API 36
2. Install Node `>=20.19.4 <21` or `>=22`. From `DSM_Front`, run `npm ci` and copy `.env.example` to ignored `.env.local`. Set only `API_BASE_URL` and public `GOOGLE_WEB_CLIENT_ID`; never add a client secret.
3. Start Metro with `npm start`. If Metro reports a corrupt cache, use `npm start -- --reset-cache`; Windows Temp cleanup may require host permission.
4. Open `DSM_Front/android` in Android Studio, select the `app` configuration and `Medium_Phone`, then press Run (`Shift+F10`).
5. Verify the project tree contains Community modules such as `react-native-config`, `react-native-keychain`, and `react-native-screens`, with no Expo modules.
6. On every new PC, run `android\gradlew.bat signingReport`, use the debug SHA-1 only in the approved Google Cloud Console form, and register a same-project Android OAuth client for package `com.dsm.dailyup`. Never record the full fingerprint or client ID in Git, memory, docs, or chat. Keep release signing separate and unconfigured until its own approval.
7. Before handoff, run `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, `android\gradlew.bat assembleDebug`, and `git diff --check`.

Verified evidence: pure React Native `assembleDebug` succeeded in 19m 1s (365 tasks); Android Studio Gradle sync, Run build, APK install, Metro `index.js` bundle, and unauthenticated login screen render succeeded. No EAS build or paid service was used for this migration.

---

## Historical Expo/EAS plan (do not execute)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Android Studio on Windows and establish a reproducible local Android build/run path for the existing Expo SDK 55 `DSM_Front` application.

**Architecture:** Keep EAS as the canonical distribution/signing path while adding a separate local debug path. Expo prebuild generates the ignored native Android project, Android Studio owns SDK/emulator/Gradle execution, and Google Cloud receives a distinct Android OAuth client for the local debug keystore SHA-1. The frontend and backend continue to share the existing Web OAuth client ID as the Google token audience.

**Tech Stack:** Android Studio Quail 3 2026.1.3 Patch 1, Android SDK/Platform Tools/Emulator, JDK 17, Expo SDK 55, React Native 0.83.10, Gradle, `react-native-nitro-google-signin` 1.3.0.

## Global Constraints

- Preserve EAS credentials, EAS OAuth client, and the completed EAS APK build.
- Use application ID `com.dsm.dailyup`.
- Never print or commit OAuth client IDs, SHA-1 values, keystores, passwords, access tokens, or ID tokens.
- Use the existing Web OAuth client for both `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and backend `GOOGLE_CLIENT_ID`.
- Register the local debug keystore SHA-1 as a separate Android OAuth client in the same Google Cloud project.
- Keep generated `DSM_Front/android` and local `.env.local` artifacts uncommitted.
- Do not install an APK on, or control, a physical device without the separate Task 9 device approval.

---

### Task 1: Install and verify Android Studio

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: Google official Windows installer and its published SHA-256 checksum.
- Produces: Android Studio, Android SDK, Platform Tools, emulator tooling, and a discoverable SDK path.

- [ ] **Step 1: Download the official Windows installer**

Download `android-studio-quail3-patch1-windows.exe` from Google and verify SHA-256 `d08a374ba59a07c7b12b4a1f13f5282fe4d5f548eb8a2e59ba81aa1f8a7b8bc9` before execution.

- [ ] **Step 2: Install Android Studio**

Use the standard installation directory, include Android Virtual Device support, and do not enable unrelated cloud integrations.

- [ ] **Step 3: Complete the standard setup wizard**

Install the recommended Android SDK, Platform Tools, Build Tools, command-line tools, and emulator. Accept only the Android SDK licenses required for these packages.

- [ ] **Step 4: Verify the toolchain**

Verify `studio64.exe`, SDK Manager, `adb version`, emulator availability, and JDK 17 compatibility without changing repository files.

---

### Task 2: Generate and validate the local native Android project

**Files:**
- Generate, ignored: `DSM_Front/android/**`
- Create, ignored and only from the approved EAS development environment: `DSM_Front/.env.local`

**Interfaces:**
- Consumes: installed SDK, Expo app config, and existing Web OAuth client ID.
- Produces: a Gradle Android project that Android Studio can sync and build.

- [ ] **Step 1: Verify ignore and environment boundaries**

Confirm `android/` and `.env.local` are ignored. Stop before writing any credential value if either path would be tracked.

- [ ] **Step 2: Configure the local public Web client ID**

Pull `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` from the approved EAS `development` environment into ignored `DSM_Front/.env.local`; do not use the Android OAuth client ID and do not print the value.

- [ ] **Step 3: Generate the Android project**

Run `npx.cmd expo prebuild --platform android --no-install` from `DSM_Front`. Do not use `--clean`.

- [ ] **Step 4: Verify native integration**

Run Expo config resolution and inspect Gradle autolinking for `NitroGoogleSigninPackage`, package `com.dsm.dailyup`, and absence of secret material.

---

### Task 3: Register the local debug signing identity

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: generated Gradle project and local debug keystore.
- Produces: a same-project Android OAuth client for `com.dsm.dailyup` plus local debug SHA-1.

- [ ] **Step 1: Generate or locate the standard debug keystore**

Use Gradle's debug signing configuration. Do not replace or export the EAS keystore.

- [ ] **Step 2: Read the signing report without disclosure**

Run `DSM_Front/android/gradlew.bat signingReport`; retain the debug SHA-1 only for the Google Console form and do not record its full value in Git, memory, or chat.

- [ ] **Step 3: Confirm before persistent OAuth creation**

At action time, confirm creation of one additional Android OAuth client in the existing Google Cloud project.

- [ ] **Step 4: Create and verify the local Android OAuth client**

Use package `com.dsm.dailyup` and the local debug SHA-1. Verify the client exists without printing its complete ID or fingerprint.

---

### Task 4: Open, sync, build, and run from Android Studio

**Files:**
- No tracked repository changes expected.

**Interfaces:**
- Consumes: generated Android project, local OAuth registration, Android emulator or separately approved physical device.
- Produces: a successful local debug Gradle build and an Android Studio run configuration.

- [ ] **Step 1: Open the native project**

Open `DSM_Front/android` in Android Studio and allow Gradle sync to finish.

- [ ] **Step 2: Create an emulator when hardware support is available**

Use a Google APIs image compatible with the installed SDK. If virtualization is unavailable, stop at a successful build and request separate physical-device approval.

- [ ] **Step 3: Build the debug APK**

Run `gradlew.bat assembleDebug` and verify exit code 0 plus an APK under `app/build/outputs/apk/debug`.

- [ ] **Step 4: Start Metro and run from Android Studio**

Start Expo with the development-client option, select the approved emulator/device, and run the `app` configuration. Do not perform the authenticated Task 9 smoke without its separate approval and backend audience configuration.

- [ ] **Step 5: Verify repository boundaries**

Run `git status --short`, `git diff --check`, and secret-pattern scans. Record only sanitized installation/build evidence in project memory.
