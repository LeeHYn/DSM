# Expo 제거 및 Android Studio 전환 구현 계획

> **대상:** `DSM_Front`를 Android 전용 순수 React Native 앱으로 전환한다.

**목표:** Expo 런타임, Router, Dev Client, CLI 및 모듈을 제거하고 Android Studio/Community CLI에서 기존 기능을 실행한다.

**전략:** 테스트 가능한 JS 계층부터 의존성을 끊고, 마지막에 패키지와 Android Gradle 연결을 제거한다. 각 단계는 실패 테스트를 먼저 확인하고 관련 테스트·타입검사·Gradle 빌드로 닫는다.

---

## 작업 1: React Native 진입점과 세션 내비게이션

**파일**

- 추가: `DSM_Front/index.js`
- 추가: `DSM_Front/src/App.tsx`
- 추가: `DSM_Front/src/navigation/app-navigator.tsx`
- 수정: `DSM_Front/src/features/auth/session-routing.tsx`
- 수정: `DSM_Front/src/features/auth/session-routing.test.tsx`
- 수정: `DSM_Front/src/app/(tabs)/_layout.tsx`
- 수정: 화면 테스트의 Expo Router mock

**TDD**

1. 세션 상태별 루트 화면과 탭 전환을 React Navigation 계약으로 검증하는 테스트를 작성한다.
2. 기존 Expo Router 구현에서 실패함을 확인한다.
3. `NavigationContainer`, native stack, bottom tabs로 최소 구현한다.
4. focused Jest와 TypeScript를 실행한다.

## 작업 2: Android Keystore 기반 refresh token 저장소

**파일**

- 수정: `DSM_Front/src/features/auth/token-store.native.ts`
- 수정: `DSM_Front/src/features/auth/token-store.native.test.ts`
- 삭제: `DSM_Front/src/features/auth/token-store.web.ts`
- 삭제: `DSM_Front/src/features/auth/token-store.web.test.ts`
- 수정: `DSM_Front/package.json`
- 수정: `DSM_Front/package-lock.json`

**TDD**

1. keychain service key, 저장·읽기·삭제 및 오류 전파 테스트를 먼저 작성한다.
2. `expo-secure-store` 구현에서 실패함을 확인한다.
3. `react-native-keychain` adapter를 구현한다.
4. token store와 session controller 테스트를 실행한다.

## 작업 3: Expo UI 모듈 제거

**파일**

- 수정: `DSM_Front/src/App.tsx`
- 수정: `DSM_Front/src/app/index.tsx`
- 수정: `DSM_Front/src/components/dailyup/primitives.tsx`
- 수정: `DSM_Front/src/constants/dailyup-theme.ts`
- 삭제: Expo 샘플 및 web 전용 컴포넌트
- 수정/추가: 관련 렌더링 테스트

**TDD**

1. 로그인/탭/공통 primitive가 Expo mock 없이 렌더링되는 테스트를 만든다.
2. React Native `StatusBar`, 시스템 폰트, 독립 아이콘 모듈로 교체한다.
3. 사용되지 않는 Expo image/browser/symbol 샘플을 제거한다.
4. 전체 Jest와 TypeScript를 실행한다.

## 작업 4: 환경변수 계약 전환

**파일**

- 수정: `DSM_Front/src/config/api-config.ts`
- 수정: `DSM_Front/src/config/api-config.test.ts`
- 수정: `DSM_Front/src/config/google-auth-config.ts`
- 수정: `DSM_Front/src/config/google-auth-config.test.ts`
- 수정: `DSM_Front/.env.example`
- 추가: `DSM_Front/react-native-config.d.ts`
- 수정: `DSM_Front/package.json`

**TDD**

1. `API_BASE_URL`과 `GOOGLE_WEB_CLIENT_ID` 계약 테스트를 작성한다.
2. Expo 변수명 구현에서 실패함을 확인한다.
3. `react-native-config` adapter와 타입 선언을 추가한다.
4. 개발 사설 HTTP/운영 HTTPS 보안 테스트를 유지한다.

## 작업 5: Community CLI/Jest/TypeScript 도구 체인

**파일**

- 수정: `DSM_Front/package.json`
- 수정: `DSM_Front/package-lock.json`
- 추가/수정: `DSM_Front/babel.config.js`
- 추가/수정: `DSM_Front/metro.config.js`
- 수정: `DSM_Front/jest.config.js`
- 수정: `DSM_Front/tsconfig.json`
- 삭제: `DSM_Front/app.json`, `DSM_Front/expo-env.d.ts`

**검증**

1. Community CLI, Babel preset, TypeScript config 의존성을 고정한다.
2. `start`/`android` 스크립트를 React Native CLI로 바꾼다.
3. Expo Jest preset과 tsconfig 확장을 제거한다.
4. `npm test`, `npm run typecheck`, `npm run lint`를 실행한다.

## 작업 6: Android Gradle과 네이티브 진입점 정리

**파일**

- 수정: `DSM_Front/android/settings.gradle`
- 수정: `DSM_Front/android/build.gradle`
- 수정: `DSM_Front/android/app/build.gradle`
- 수정: `DSM_Front/android/gradle.properties`
- 수정: `DSM_Front/android/app/src/main/AndroidManifest.xml`
- 수정: `DSM_Front/android/app/src/main/java/com/dsm/dailyup/MainApplication.kt`
- 수정: `DSM_Front/android/app/src/main/java/com/dsm/dailyup/MainActivity.kt`
- 수정: Android splash/theme 리소스
- 삭제: Expo secure-store 전용 backup XML

**검증**

1. Gradle 설정의 Expo plugin/autolinking 참조를 제거한다.
2. 기본 React Native host/activity delegate로 교체한다.
3. debug 전용 로컬 HTTP 정책과 릴리스 정책을 분리한다.
4. JDK 17로 `gradlew clean assembleDebug`를 실행한다.
5. Gradle dependency tree에 Expo 모듈이 없는지 확인한다.

## 작업 7: Android Studio 런타임 및 문서 검증

**파일**

- 수정: `docs/superpowers/plans/2026-08-15-android-studio-local-development.md`
- 수정: `.ai/memory/README.md`
- 수정: `.ai/memory/checklist.md`
- 수정: `.ai/memory/context.md`
- 수정: `.ai/memory/error-resolution-playbook.md`
- 수정: `.ai/memory/plan.md`

**검증**

1. Metro를 Community CLI로 시작한다.
2. Android Studio Run 버튼으로 API 36 AVD에 설치한다.
3. 로그인 화면, 세션 상태 전환, 탭, 로그아웃을 확인한다.
4. `git grep -n -i expo -- DSM_Front` 결과에서 의도된 역사 문서/자산 외 실행 의존성이 없는지 확인한다.
5. `git diff --check`와 변경 범위를 확인한다.
