# F-016 Android Git Handoff Design

## 목표

현재 PC에서 검증한 Android-only React Native 프로젝트를 Git을 통해 다른 PC가 그대로 checkout하고 Android Studio에서 빌드·실행할 수 있게 한다. `F-016`의 직접 원인인 `DSM_Front/android` 전체 미추적 상태를 해소하면서, 네이티브 프로젝트가 의존하는 미커밋 React Native 전환 파일도 같은 handoff 기준선에 포함한다.

## 현재 증거

- `git ls-files -- DSM_Front/android` 결과는 0개다.
- `git status --short --untracked-files=all -- DSM_Front/android`에는 handoff 대상 52개 파일이 나온다.
- `DSM_Front/package.json`, `index.js`, `src/App.tsx`, Metro/Babel/Jest 설정과 Expo 제거 변경도 아직 미커밋 상태다.
- 현재 브랜치 `codex/front-secure-session-rest-client`는 origin보다 36 commits ahead다.
- `local.properties`, `app/debug.keystore`, `.idea`, `.gradle`, `app/build`은 존재하지만 ignore 규칙으로 제외된다.

## 검토한 접근

### A. 전체 Android-only 기준선을 검증해 의도별 commit 후 push — 채택

네이티브 52개 파일과 이에 대응하는 React Native 전환 소스·설정·문서를 함께 검증한다. 비밀값과 로컬 산출물을 제외한 뒤 의도별 commit으로 나누어 현재 feature branch에 push하고, clean checkout 재현 검증을 수행한다.

장점은 다른 PC가 혼합된 Expo/React Native 상태를 받지 않고 변경 이력을 검토할 수 있다는 점이다. 단점은 기존의 큰 미커밋 전환 diff를 먼저 전수 검토해야 하며 push 시 현재 36개 선행 commit도 함께 전송된다는 점이다.

### B. `DSM_Front/android`만 commit

`F-016`의 표면 조건은 해소되지만 원격의 Expo-era `package.json`과 진입점에 결합되어 다른 PC 빌드 재현을 보장하지 못한다. 채택하지 않는다.

### C. ZIP 또는 수동 복사로 전달

Git SSOT, 변경 추적, pull 기반 handoff 목표를 충족하지 못한다. 채택하지 않는다.

## 전달 구조

1. 현재 dirty worktree를 사용자 변경으로 보존하고 파일별 diff를 읽기 전용으로 분류한다.
2. Android-only 전환 소스·설정과 52개 네이티브 source/resource 파일을 하나의 호환 기준선으로 검증한다.
3. 로컬 SDK 경로, keystore, IDE/cache/build 산출물, credential·token·OAuth 식별자 완전값이 staging 대상에 없는지 검사한다.
4. 제품 변경, native project, 문서·audit memory를 검토 가능한 commit으로 분리한다.
5. 현재 feature branch를 origin에 push한다. `main` 직접 push와 force push는 하지 않는다.
6. 별도 clean checkout에서 `npm ci`, Jest, TypeScript, ESLint, Gradle `assembleDebug`와 Git 추적 상태를 재검증한다.
7. 독립 reviewer가 원래 `F-016` 조건과 회귀 위험을 recheck한 뒤 audit ledger를 `RECHECKED`로 전이한다.

## 변경 경계

### 제품 파일

- 기존 Android-only 전환 diff는 새로 재작성하지 않고 현재 내용을 검토·검증한다.
- `DSM_Front/android`의 52개 untracked source/resource/wrapper 파일은 Git에 추가한다.
- 검증에서 실제 결함이 발견되면 즉시 범위를 확대하지 않는다. 정확한 1~2개 파일 수정 계획과 별도 승인을 먼저 받는다.

### Git 제외 파일

- `DSM_Front/.env.local`
- `DSM_Front/android/local.properties`
- `DSM_Front/android/app/debug.keystore`
- `DSM_Front/android/.idea/**`
- `DSM_Front/android/.gradle/**`
- `DSM_Front/android/app/build/**`
- 기타 `*.jks`, `*.keystore`, credential·token·secret 파일

### 외부 변경

- Google Cloud OAuth client를 추가·수정·삭제하지 않는다.
- EAS, 유료 서비스, 배포, remote DB를 사용하지 않는다.
- 현재 feature branch만 push하며 PR·merge는 범위 밖이다.

## Commit 설계

1. `refactor(front): migrate to Android-only React Native`
   - Expo 제거, React Native 진입점·navigation·session·config·toolchain 변경과 관련 테스트.
2. `build(front): track native Android project`
   - `DSM_Front/android`의 non-local source/resource/wrapper 52개.
3. `docs(front): document Android handoff`
   - Android Studio 실행·새 PC 설정·설계/구현 계획.
4. `docs(audit): record release audit state`
   - full-project audit ledger와 active memory의 검증·잔여 위험 기록.

실제 diff 분류에서 commit 간 의존성이 발견되면 순서는 유지하되 파일을 임의로 쪼개지 않고, 최종 staged diff를 commit마다 다시 검토한다.

## 검증 계약

- `git diff --check`
- frontend secret-pattern scan과 ignore 검증
- `npm test -- --runInBand`
- `npm run typecheck`
- `npm run lint`
- `android\gradlew.bat assembleDebug` with JDK 17
- `git ls-files -- DSM_Front/android`가 기대한 52개 source/resource/wrapper 파일을 반환
- clean checkout에서 ignored local 설정을 새로 구성한 뒤 동일 검증 재실행
- push 후 origin branch가 로컬 HEAD와 일치하는지 확인

## 완료 조건

- 다른 PC checkout에 Android Studio project와 호환되는 React Native 전환 기준선이 존재한다.
- local path, keystore, credential, build/cache 파일이 Git에 없다.
- current branch push와 clean-checkout build 검증이 성공한다.
- 독립 fix-recheck가 새로운 P0/P1 회귀 없이 원래 조건 제거를 확인한다.
- `F-016` audit 상태와 active memory가 실제 Git 상태와 일치한다.

## 후속 작업

F-016을 닫은 뒤 별도 설계·승인으로 `F-006` 임의 날짜 즉시 완료를 통한 누적 점수 조작 방지를 진행한다. 두 finding은 같은 구현 단계로 묶지 않는다.
