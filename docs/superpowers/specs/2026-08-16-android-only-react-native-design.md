# Android-only React Native 전환 설계

**작성일:** 2026-08-16
**상태:** 사용자 승인
**대상:** `DSM_Front`

## 목표

기존 화면, Google 로그인, 세션 복구, 온보딩, 홈/랭킹/마이 탭을 유지하면서 Expo 런타임과 도구 체인을 완전히 제거한다. 개발·빌드·실행의 기준은 Android Studio와 React Native Community CLI로 통일한다.

## 범위

- Android 앱과 패키지명 `com.dsm.dailyup`을 유지한다.
- 기존 `android/` 프로젝트를 제자리에서 순차 전환한다.
- Expo Router, Expo Dev Client, Expo Modules autolinking, Expo CLI를 제거한다.
- Expo에 의존하는 보안 저장소, 스플래시, 상태 표시줄, 이미지, 폰트, 아이콘, 외부 링크를 Android/React Native 대체 구현으로 바꾼다.
- web/iOS 전용 소스, 스크립트, 의존성, 테스트를 제거한다.
- EAS 빌드·배포·자격 증명은 사용하지 않는다.

## 제외 범위

- 백엔드 배포와 운영 데이터베이스 구성
- Kakao/Apple 로그인 신규 구현
- Play Store 배포
- 릴리스 서명키 교체 또는 업로드

## 선택한 접근

기존 프로젝트를 단계적으로 바꾸는 인플레이스 전환을 사용한다. 새 프로젝트로 전체 이식하는 방식보다 변경 원인을 추적하기 쉽고, 인증·세션 테스트를 각 단계에서 유지할 수 있다. Expo 모듈을 일부 남기는 하이브리드 방식은 최종 목표가 아니므로 사용하지 않는다.

## 애플리케이션 구조

### 진입점

- 루트 `index.js`가 `AppRegistry.registerComponent('main', ...)`로 앱을 등록한다.
- `src/App.tsx`가 Gesture Handler, 테마, 프로토타입 상태, 세션 공급자와 최상위 내비게이션을 조립한다.
- `package.json.main`과 Expo Router 파일 기반 진입점을 제거한다.

### 내비게이션

- `@react-navigation/native-stack`으로 세션 상태별 루트 화면을 구성한다.
- `@react-navigation/bottom-tabs`으로 홈, 랭킹, 마이페이지를 구성한다.
- 부팅 중에는 화면을 표시하지 않고, 세션 상태가 결정되면 하나의 허용된 화면 그룹만 렌더링한다.
- 화면 이동 권한은 기존 `SessionController` 상태가 계속 소유한다. 로그아웃 화면이 직접 경로를 바꾸지 않는다.
- 기존 커스텀 탭 외형과 `TaskSheets` 오버레이를 유지한다.

### 인증·보안 저장소

- Google 로그인은 기존 `react-native-nitro-google-signin` 어댑터를 유지한다.
- refresh token은 Android Keystore를 사용하는 `react-native-keychain` 저장소로 교체한다.
- 계정 식별 없이 고정 service key 하나만 사용하며, 읽기/쓰기/삭제 실패는 기존 coordinator/controller 계약으로 전달한다.
- 웹용 `localStorage` 저장소와 테스트는 제거한다.

### 환경 설정

- Expo의 `EXPO_PUBLIC_*` 주입 대신 `react-native-config`에서 `API_BASE_URL`, `GOOGLE_WEB_CLIENT_ID`를 읽는다.
- `.env.example`에는 에뮬레이터 기본값 `http://10.0.2.2:3000`을 둔다.
- 개발 빌드에만 로컬 HTTP를 허용하고 릴리스에서는 HTTPS 검증을 유지한다.
- OAuth client ID는 공개 클라이언트 설정값이며 비밀키로 취급하지 않지만, 개인 `.env`는 계속 Git에서 제외한다.

### UI 자원

- `expo-status-bar`는 React Native `StatusBar`로 바꾼다.
- Expo Google Fonts hook을 제거하고 Android 시스템 `sans-serif` 계열로 폰트 토큰을 매핑한다.
- Material Community 아이콘은 독립 React Native 아이콘 패키지로 교체한다.
- 사용되지 않는 Expo 샘플 컴포넌트와 web 전용 파일은 삭제한다.
- 네이티브 시작 테마가 앱 아이콘과 배경색을 표시하도록 하고 JS 준비 후 별도 Expo splash API 없이 루트 화면을 렌더링한다.

## Android 네이티브 구조

- `settings.gradle`은 React Native Community autolinking만 사용한다.
- 루트 Gradle에서 `expo-root-project`를 제거한다.
- 앱 Gradle은 `index.js`와 Community CLI 번들 명령을 사용한다.
- `MainApplication`은 기본 `ReactHost`를 생성하고 Expo lifecycle dispatcher를 호출하지 않는다.
- `MainActivity`는 기본 `DefaultReactActivityDelegate`를 직접 반환한다.
- Manifest에서 Expo updates metadata, dev-client scheme, 개발용 overlay 권한을 제거한다.
- Android Studio의 Gradle JDK는 설치 확인한 Microsoft OpenJDK 17을 유지한다.

## 오류 처리와 회귀 방지

- 부팅·인증·저장소 오류는 기존 session state와 recovery 화면을 통해 표시한다.
- 내비게이션 테스트는 세션 상태마다 단 하나의 루트 흐름만 노출되는지 검증한다.
- keychain adapter 테스트는 token 원문을 로그나 오류에 노출하지 않고 저장·읽기·삭제 계약을 검증한다.
- 환경 설정 테스트는 개발 HTTP 사설 주소와 운영 HTTPS 정책을 유지한다.

## 완료 조건

- `package.json`, JS/TS 소스, Gradle, Manifest에 실행 가능한 Expo 의존성이 없다.
- `npm start`는 Community Metro, `npm run android`는 Community CLI를 실행한다.
- Jest, TypeScript, ESLint, `gradlew assembleDebug`가 통과한다.
- Android Studio Run 버튼으로 API 36 에뮬레이터에 설치되고 로그인 화면이 표시된다.
- 저장소 문서가 JDK/SDK/환경변수/백엔드 주소/실행 순서를 설명한다.
