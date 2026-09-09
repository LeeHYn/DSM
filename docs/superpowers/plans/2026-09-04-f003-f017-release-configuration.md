# F-003/F-017 Release Configuration Implementation Plan

> 실행: main agent가 executing-plans 순차 실행. 2026-09-04 사용자의 릴리스 구성 구현 요청을 승인 근거로 사용한다.

**Goal:** release 환경·upload signing 입력이 완전할 때만 Android release를 생성한다.

**Architecture:** 순수 Groovy 검증 모듈을 Gradle task graph 및 preReleaseBuild에 연결한다. debug/sync는 release credential 없이 허용한다. 외부 Play/OAuth provisioning은 준비 상태 확인 후 별도 수행한다.

**Tech Stack:** Gradle 9.0.0, Groovy 4, RN 0.83.10, react-native-config 1.6.1.

**Spec:** `docs/superpowers/specs/2026-09-04-f003-f017-android-release-identity-environment-design.md`.

## 적용 보완

- 검증 재현성을 위해 build.gradle 내부 검증을 `DSM_Front/android/release-config.gradle`로 분리하고 순수 Groovy 테스트를 추가한다. 실제 Gradle이 같은 closure를 호출하므로 텍스트 검사로 대체하지 않는다.
- ENVFILE는 release 요청에서 plugin 실행 전에 거부한다. mixed debug/release·aggregate task는 release graph에서 실패한다. graph check를 통해 직접 bundle/package 등 우회도 차단한다.
- signingReport는 informational이며 credential 없으면 unsigned; signed release 증거는 실제 artifact verification으로 판정한다.
- 누락된 Play package/keystore/API 정보는 코드 구현·negative test를 막지 않는다. 실제 key 생성·운영값 입력·업로드는 정보 확인 전 실행하지 않는다.

## Task 1 — 실행 가능한 validation RED/GREEN

Files: `DSM_Front/android/release-config.test.groovy` + `DSM_Front/android/release-config.gradle`.

- [x] Groovy 테스트: missing/blank 4 properties, relative/missing/directory keystore, env 없음, invalid HTTP/URL credentials/query/fragment, blank Google ID, override/mixed/aggregate input, complete synthetic inputs.
- [x] RED 확인 후 validator 구현; `validateReleaseInputs(Map)`는 sanitized error list를 반환한다. password와 alias는 trim으로 존재만 판정하고 원문 보존한다.
- [x] 임시 file은 테스트가 만든 경로만 정리한다. 실제 private key는 테스트에 필요 없다.

## Task 2 — Gradle hook

Files: `DSM_Front/android/app/build.gradle`.

- [x] mapping release=.env.release.local, 4 property conditional signingConfigs.release.
- [x] graph ready release tasks에 canonical file/provenance/project.env 검증; validateReleaseConfiguration→preReleaseBuild dependency.
- [x] release signingConfig는 외부 속성만 사용하고, 불완전한 입력은 release task graph에서 차단한다. debug key fallback 금지.
- [x] 실제 Gradle missing-input fail 확인, help/debug 무credential baseline 확인.

## Task 3 — template·운영 안내

Files: `DSM_Front/.env.release.example` + `DSM_Front/README.md`.

- [x] API_BASE_URL=https://api.example.invalid, GOOGLE_WEB_CLIENT_ID blank example.
- [x] GRADLE_USER_HOME/gradle.properties, CI ORG_GRADLE_PROJECT_DAILYUP_UPLOAD_* 사용; password command argument 금지.
- [x] local upload signer와 Play app signer별 OAuth, explicit release tasks, negative/positive commands, 실기기/Play smoke 안내.

## Task 4 — regression·결과

- [x] Groovy suite, actual Gradle negative/debug, Front full tests/type/lint, diff/secret scan.
- [x] 실제 upload keystore와 승인 env가 없으면 signed AAB/Play login 검증을 미실행으로 표시. audit는 FIXING 유지하며 운영 준비 완료로 표시하지 않는다.
- [x] 기존 design의 승인 상태·구현 보완, audit pair와 memory pairs 갱신. Git stage/commit/push는 별도 요청 없이 실행하지 않는다.

## 실행 결과 — 2026-09-05

- validator/test, build.gradle, .env.release.example, README 구현 완료. Groovy missing-module RED→행동 검증 GREEN.
- 실제 Gradle validateReleaseConfiguration와 bundleRelease --dry-run은 missing properties/canonical env 오류로 fail-closed. debug-first mixed graph와 ENVFILE override도 예상 오류로 차단.
- assembleDebug: BUILD SUCCESSFUL, 281 tasks. Front full 23/180, TypeScript PASS, lint 0 errors/30 warnings.
- real key·운영 env·Play package 상태 미확정. signed AAB/APK/설치/Play OAuth/실제 API smoke는 미실행. 키/Console 생성·업로드·Git action 없음.
- 독립 recheck 미실행이므로 F-003/F-017은 FIXING 유지. user secret 값이나 signer fingerprint를 기록하지 않았다.
