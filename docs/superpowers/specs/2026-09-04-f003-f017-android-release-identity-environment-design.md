# F-003/F-017 Android 릴리스 서명·환경 설계

상태: `USER_IMPLEMENTATION_APPROVED` / `LOCAL_CODE_VERIFIED_EXTERNAL_RECHECK_PENDING`
작성일: 2026-09-04
대상: `DSM_Front` Android release, Google Play 배포 identity, production runtime environment
관련 audit: `F-003`, `F-017` P1; 외부 signer/환경/설치·독립 recheck gate는 열린 상태다.

2026-09-04 사용자가 전체 기획 출시와 F-005/F-003/F-017 구현을 요청했다.
실행 계약은 `../plans/2026-09-04-f003-f017-release-configuration.md`이며 아래 설계 전용
승인 경계는 최초 작성 당시의 이력이다. 코드·로컬 검증은 승인됐고 key/Console/업로드는 제외된다.
실제 구현은 `android/release-config.gradle`의 실행 가능한 validator를 task graph와
`preReleaseBuild`에 함께 연결해 direct/aggregate/mixed task 우회를 막는다.

## 1. 승인 경계

이 문서는 릴리스 서명과 릴리스 환경의 결합 계약을 정한다. 다음 작업은 포함하지 않는다.

- keystore 또는 인증서 생성·복사·회전
- 실제 password, client ID, certificate fingerprint, API URL 조회·출력·기록
- Google Play Console 또는 Google Cloud OAuth 설정 변경
- `build.gradle`, env example, README 또는 제품 코드 수정
- APK/AAB 빌드·설치·업로드·배포
- Git stage/commit/push/PR/merge

문서 self-review와 사용자 승인이 끝난 뒤에만 별도 implementation plan을 작성한다. 구현은 그 계획의 별도 승인을 다시 받아야 한다.

## 2. 문제와 현재 근거

### 2.1 F-003

- `DSM_Front/android/app/build.gradle:34-39`의 `release` build type에는 `signingConfig`가 없다.
- `DSM_Front/README.md:51`은 release signing을 별도 구성 전까지 비활성이라고 명시한다.
- 따라서 저장소만으로는 안정적인 update signer를 가진 production artifact를 만들 수 없다.
- Google Android OAuth identity는 package name과 실제 설치 APK의 signing certificate에 묶인다. signer가 정해지지 않으면 release Google login identity도 확정할 수 없다.

### 2.2 F-017

- `DSM_Front/android/app/build.gradle:5-9`은 debug를 `.env.local`에, release를 존재하지 않는 `.env`에 연결한다.
- README는 `.env.local` 절차만 설명한다.
- `react-native-config`의 Android Gradle script는 env 파일이 없어도 warning만 출력하고 빈 map으로 계속 진행한다.
- `DSM_Front/src/config/api-config.ts:28-34`는 `API_BASE_URL`이 없으면 throw한다. audit trace상 `features/auth/session-context.tsx`의 provider 생성 경로에서 첫 렌더가 중단된다.
- `DSM_Front/src/config/google-auth-config.ts:28-32`는 `GOOGLE_WEB_CLIENT_ID`가 없으면 Google login을 fail closed한다.

### 2.3 이미 고정된 호환 계약

- application ID/package name: `com.dsm.dailyup`
- React Native: `0.83.10`
- Gradle wrapper: `9.0.0`
- env loader: `react-native-config@1.6.1`
- Google provider: `react-native-nitro-google-signin@1.3.0`, explicit `webClientId` flow
- Expo/EAS 및 Firebase Google Services plugin은 사용하지 않는다.

## 3. 목표

1. Google Play에 올리는 AAB는 별도 upload key로 서명하고, 사용자의 기기에 전달되는 APK는 Play App Signing app-signing key로 서명한다.
2. debug, local release APK, Play-delivered APK의 signer identity를 분리하고 각 필요한 Android OAuth client를 명시한다.
3. release build는 서명 입력이나 runtime env가 하나라도 없거나 안전하지 않으면 artifact 생성 전에 실패한다.
4. debug build와 Android Studio sync는 release credential 없이 계속 동작한다.
5. 비밀과 실제 운영 식별자는 Git, memory, chat, Gradle log, process argument에 남기지 않는다.
6. local upload-signed APK와 Play app-signing-key로 전달된 APK 양쪽에서 startup, API, Google login, session lifecycle을 검증한다.

## 4. 비목표

- production 배포 실행 또는 release-ready 선언
- application ID, `versionCode`, `versionName` 정책 변경
- target/compile SDK, R8/ProGuard, ABI, dependency upgrade
- backend endpoint 또는 auth protocol 변경
- Firebase/`google-services.json` 도입
- CI 공급자 선택 및 pipeline 구현
- 다른 앱 스토어 동시 배포
- app-signing key rotation, compromised-key incident 실행
- F-005, F-026 또는 다른 audit finding 수정

## 5. 선행 hard gate

### 5.1 Play package 상태

구현 또는 외부 provisioning 전에 권한 있는 관리자가 `com.dsm.dailyup`의 상태를 둘 중 하나로 판정해야 한다.

- 신규·미출시 앱: Play App Signing을 활성화하고 Google이 app-signing key를 생성·보관하는 경로를 기본값으로 한다.
- 기존 출시 앱: 현재 update signer와 signing lineage를 보존한다. 새 app-signing key를 임의 생성하거나 기존 키를 대체하지 않는다.

판정 결과만 기록하고 certificate fingerprint 전체값은 기록하지 않는다.

### 5.2 배포 채널

본 설계의 기본 전제는 Google Play 단일 1차 배포다. 다른 스토어 또는 독립 APK 업데이트가 필요하면 app-signing key custody와 cross-store update 전략을 다시 설계·승인한다.

### 5.3 외부 소유권

구현 전에 다음 역할이 지정되어야 한다.

- Play Console account owner 또는 release manager
- Google Cloud OAuth 관리자
- upload keystore 보관 책임자
- CI secret 관리자
- release 검증자와 audit rechecker

한 사람이 모든 비밀과 승인 권한을 단독 보유하지 않도록 최소 권한과 2단계 인증을 적용한다.

## 6. 목표 아키텍처

    developer/CI
      │
      ├─ external upload keystore + Gradle secret properties
      ├─ ignored .env.release.local
      │
      └─ bundleRelease
             │
             ▼
        upload-key-signed AAB
             │
             ▼
        Google Play verification
             │
             ▼
        app-signing-key-signed device APK
             │
             ├─ package com.dsm.dailyup
             ├─ Android OAuth client for Play signer
             └─ Web OAuth audience shared with production backend

로컬 `assembleRelease` APK는 upload key로 서명된다. Play에서 전달되는 APK와 signer가 다르므로 두 artifact를 같은 OAuth identity로 취급하지 않는다.

## 7. 키와 인증서 모델

### 7.1 세 가지 기본 signer

| 용도 | private key 보관자 | 설치 artifact signer | OAuth 등록 필요 |
|---|---|---|---|
| debug | 각 개발 PC | 해당 PC debug key | 그 PC에서 Google login을 시험할 때 |
| local release APK / upload AAB | 조직 또는 CI | upload key | local release APK에서 Google login을 시험할 때 |
| Play testing/production track | Google Play | app-signing key | 필수 |

Internal App Sharing은 업로드 artifact를 별도의 Internal App Sharing test key로 다시 서명한다. 따라서 packaging 전달 경로 시험에는 쓸 수 있지만, Play app-signing signer의 OAuth 증거를 대신하지 않는다. Internal App Sharing에서 Google login까지 시험하려면 그 test certificate에 대한 별도 Android OAuth client가 필요하다.

### 7.2 기본 키 선택

- Play App Signing의 app-signing key와 upload key는 반드시 분리한다.
- 신규 앱이면 Google-generated app-signing key를 기본값으로 한다.
- upload key는 release 전용이며 debug key를 재사용하지 않는다.
- upload private key는 저장소 밖의 조직 승인 encrypted vault에 보관한다. 개발 PC 한 대만을 유일한 원본으로 두지 않는다.
- CI에는 build에 필요한 최소 범위로만 keystore와 password를 주입하고 job 종료 후 ephemeral copy를 폐기한다.
- upload key 유실·침해 시 Play의 upload-key reset 절차를 사용한다. app-signing key rotation은 이 설계의 자동 복구 수단이 아니다.

### 7.3 저장 금지

다음 값은 source, tracked docs, `.ai/memory`, chat, test fixture, screenshot, CI log에 저장하지 않는다.

- private key 또는 keystore bytes
- store password, key password
- 실제 key alias
- 실제 client ID 전체값
- certificate fingerprint 전체값
- 실제 production API URL

인증서와 client ID가 기술적으로 public identifier이더라도 이 프로젝트의 운영 정책에 따라 전체값을 기록하지 않는다. audit evidence에는 alias, 검증 시각, 사용 도구, 일치/불일치 판정만 남긴다.

## 8. Gradle signing input 계약

### 8.1 property 이름

`android/app/build.gradle`은 다음 네 Gradle project property만 읽는다.

- `DAILYUP_UPLOAD_STORE_FILE`
- `DAILYUP_UPLOAD_STORE_PASSWORD`
- `DAILYUP_UPLOAD_KEY_ALIAS`
- `DAILYUP_UPLOAD_KEY_PASSWORD`

### 8.2 입력 위치

- 로컬: repository 밖 `GRADLE_USER_HOME/gradle.properties`
- CI: secret store에서 `ORG_GRADLE_PROJECT_DAILYUP_UPLOAD_*` environment variable로 주입
- keystore path: repository 밖의 승인된 절대 경로

password를 `-P...` command-line argument로 전달하지 않는다. shell history나 process listing에 노출될 수 있기 때문이다. project-local `keystore.properties`는 만들지 않는다.

현재 `DSM_Front/.gitignore`의 `*.jks`와 `*.keystore`는 방어층으로 유지하지만, ignore 규칙을 secret storage로 간주하지 않는다.

### 8.3 release configuration

- `signingConfigs.release`는 위 네 property가 모두 nonblank일 때만 값을 채운다.
- `buildTypes.release.signingConfig`는 release signing config를 참조한다.
- 값이 없다고 debug 또는 Gradle sync 구성 자체를 실패시키지 않는다.
- `validateReleaseConfiguration` task를 `preReleaseBuild`의 선행 dependency로 연결한다.
- validation은 네 property의 존재/nonblank, keystore path의 절대 경로 여부, file 존재와 regular-file 여부를 확인한다.
- validation 실패가 artifact packaging/signing보다 먼저 발생함을 task graph test로 증명한다.

custom validation 오류에는 누락된 property 이름만 표시한다. password, alias 값, keystore 절대 경로는 표시하지 않는다. 잘못된 password/alias로 AGP 또는 JDK 자체가 출력하는 로컬 진단에 경로가 포함될 가능성은 별도 통제한다. task-local 비식별 경로를 사용하고, 공유·보존할 audit evidence에서는 해당 경로를 정제한다.

## 9. release environment 계약

### 9.1 canonical 파일

- debug: 기존 `.env.local`
- release: `.env.release.local`
- tracked template: 새 `.env.release.example`

`.env.release.local`은 기존 `.env*.local` ignore 계약으로 Git에 포함되지 않는다. template에는 실제 운영값 대신 다음 안전한 형태만 둔다.

    API_BASE_URL=https://api.example.invalid
    GOOGLE_WEB_CLIENT_ID=

두 값은 앱 binary에 포함되는 public runtime configuration이다. password, token, private key 같은 secret을 이 파일에 넣지 않는다. 실제 값은 프로젝트 정책상 repository와 memory에는 기록하지 않는다.

### 9.2 필수값과 안전 조건

release build는 다음을 모두 만족해야 한다.

- `.env.release.local`이 존재하고 regular file이다.
- `API_BASE_URL`이 nonblank이다.
- URL은 absolute `https`이고 host가 nonblank다.
- URL에 username, password, query, fragment가 없다.
- path, port, trailing slash는 현재 TypeScript runtime contract와 동일하게 허용한다.
- `GOOGLE_WEB_CLIENT_ID`가 trim 후 nonblank다.

Google client ID에 임의의 suffix regex를 강제하지 않는다. 형식보다 console-provisioned identity와 backend audience의 exact match가 신뢰 근거다.

### 9.3 `react-native-config` fail-closed 보완

현재 dependency script는 env 파일 누락을 warning으로만 처리하며 `ENVFILE`이 variant mapping보다 우선한다. 또한 `gradlew build`처럼 명시적 variant가 없는 aggregate task는 release env를 선택하지 못할 수 있다.

따라서 release validation은 다음 provenance 규칙도 강제한다.

- release artifact는 `bundleRelease`, `assembleRelease`처럼 release variant가 명시된 task로만 만든다.
- release task 실행 중 `ENVFILE` environment variable 또는 system property override가 있으면 실패한다.
- generic `build`/`assemble`이 release task graph를 끌어오면서 canonical release env가 선택되지 않은 경우 실패한다.
- validation은 canonical file을 독립 확인하고, dependency가 실제 load한 `project.ext.env`의 두 필수값도 동일한 조건으로 확인한다.

이 규칙은 stale `ENVFILE`이나 default `.env`가 production artifact에 조용히 들어가는 것을 차단한다. debug task에서의 기존 `ENVFILE` 사용은 변경하지 않는다.

### 9.4 오류 메시지

허용되는 진단 예시는 다음처럼 값 없는 식별자 수준이다.

- `Missing release environment file: .env.release.local`
- `Invalid release environment variables: API_BASE_URL`
- `Missing release environment variables: GOOGLE_WEB_CLIENT_ID`
- `ENVFILE override is not allowed for release`
- `Use an explicit release task such as bundleRelease`

URL, client ID, parsed env map을 출력하지 않는다.

## 10. OAuth identity 계약

### 10.1 Web audience

- production frontend `GOOGLE_WEB_CLIENT_ID`와 production backend `GOOGLE_CLIENT_ID`는 동일한 Web OAuth client audience여야 한다.
- 환경별로 지정 Web audience는 하나다. local/dev audience와 production audience가 반드시 같다고 가정하지 않는다.
- frontend에는 client secret이 없다.
- 현재 explicit `webClientId` 방식은 유지하며 `google-services.json`을 추가하지 않는다.

### 10.2 Android OAuth client matrix

각 Android OAuth client는 package `com.dsm.dailyup`과 해당 설치 APK certificate SHA-1의 조합으로 관리한다.

| 실행 경로 | Android OAuth certificate |
|---|---|
| 개발 PC debug | 해당 PC debug certificate |
| local `assembleRelease` APK | upload certificate |
| Play internal testing/closed/open/production track | Play app-signing certificate |
| Internal App Sharing을 사용할 때 | Internal App Sharing test certificate |

upload certificate만 등록하면 Play-delivered Google login은 동작한다고 볼 수 없다. Play가 device APK를 app-signing key로 다시 서명하기 때문이다.

### 10.3 외부 provisioning 증거

권한 있는 작업자가 Console에서 full fingerprint를 직접 대조한다. 저장 가능한 결과는 다음뿐이다.

- package name match: PASS/FAIL
- expected signer alias: debug/upload/play/internal-sharing
- Web audience frontend/backend match: PASS/FAIL
- 검증 일시와 검증자

기존 OAuth client 삭제·변경은 파괴적 외부 작업이므로 별도 승인을 받는다. 필요한 client를 먼저 추가하고 smoke가 끝난 뒤 중복 정리를 별도 판단한다.

## 11. 빌드·배포 흐름

### 11.1 local release proof

1. 승인된 외부 upload keystore와 Gradle properties를 task process에 제공한다.
2. ignored `.env.release.local`을 제공한다.
3. explicit `assembleRelease`와 `bundleRelease`를 실행한다.
4. AAB는 `jarsigner -verify -verbose -certs`로 upload-key signature를 확인한다.
5. APK는 `apksigner verify --print-certs`로 signer를 확인한다.
6. full fingerprint는 화면/로그/문서에 복사하지 않고 expected alias와 match 결과만 기록한다.
7. local release APK를 test device에 설치하고 Metro 없이 smoke한다.

### 11.2 Play delivery proof

1. 승인된 AAB를 production이 아닌 Play internal testing track에 업로드한다.
2. tester가 Play Store를 통해 설치한다.
3. 설치 APK의 signer가 Play app-signing identity와 일치함을 out-of-band로 확인한다.
4. startup, API, Google login, session lifecycle smoke를 반복한다.

Internal App Sharing은 빠른 packaging test로 추가할 수 있지만 app-signing-key OAuth proof를 대체하지 않는다. App Bundle Explorer에서 app-signing-key로 생성된 device APK를 내려받아 `adb install-multiple`로 시험하는 것도 허용된다.

### 11.3 release smoke

local upload-signed APK와 Play-delivered APK 모두에서 다음을 확인한다.

- Metro 없이 cold start
- 첫 화면 render 성공
- production HTTPS API 연결
- Google account 선택과 ID token exchange
- backend session 생성과 authenticated route 진입
- process kill/relaunch 후 refresh rotation과 session 복원
- logout 후 local credential 삭제와 backend session 종료
- error/log에 token, client ID, fingerprint, env value 미노출

## 12. 실패 처리

| 실패 | 처리 |
|---|---|
| signing property 누락/blank | release pre-build 실패; 누락 이름만 출력 |
| keystore file 없음 | release pre-build 실패; 절대 경로 미출력 |
| env file 없음 | release pre-build 실패 |
| API URL unsafe | release pre-build 실패; 변수 이름만 출력 |
| Google Web client ID blank | release pre-build 실패 |
| generic task/env provenance 불명 | release pre-build 실패 |
| local APK signer mismatch | 설치·OAuth 시험 중단; artifact 폐기 |
| Play signer/OAuth mismatch | track 승격 중단; correct client 추가 후 재검증 |
| frontend/backend Web audience mismatch | login 시험 중단; 값을 문서화하지 않고 관리자 대조 |
| credential 노출 의심 | 로그 배포 중단, upload key/password incident 절차 시작 |

어떤 실패에서도 unsigned 또는 partially configured artifact를 유효 산출물로 취급하지 않는다.

## 13. 검증 전략

### 13.1 negative matrix

- release credential 없이 Android Studio sync 성공
- release credential 없이 `assembleDebug` 성공
- env 없이 `bundleRelease` 조기 실패
- `API_BASE_URL` 누락, HTTP, credentials, query, fragment 각각 실패
- `GOOGLE_WEB_CLIENT_ID` blank 실패
- 네 signing property 각각 누락/blank 시 실패
- keystore path가 상대 경로이거나, 없거나, directory면 실패
- password 또는 alias가 틀리면 signing 실패하고 artifact를 수집하지 않음
- release 실행에 `ENVFILE` override가 있으면 실패
- generic `build`가 release를 포함하면 provenance 오류로 실패
- custom validation log에 secret 값과 절대 secret path가 없음
- AGP/JDK 원본 진단은 외부 공유 전 secret/path 정제
- 실패 뒤 release APK/AAB를 유효 artifact로 수집하지 않음

### 13.2 positive matrix

- explicit release inputs로 `signingReport`, `assembleRelease`, `bundleRelease` 성공
- AAB upload signature와 local APK upload signer match
- production env가 generated config에 반영되되 log에는 값 미출력
- local release smoke 전체 PASS
- Play internal testing 또는 App Bundle Explorer app-signing artifact smoke 전체 PASS
- package `com.dsm.dailyup`과 expected signer alias match

### 13.3 regression

- Front Jest 전체
- TypeScript typecheck
- non-fixing ESLint
- `assembleDebug`
- Gradle sync
- `git diff --check`
- tracked secret scan
- `git status --short`에서 keystore, `.env.release.local`, Gradle user properties, build output가 untracked change로 나타나지 않음

### 13.4 audit recheck

구현 완료 후에만 `F-003`과 `F-017`을 각각 `CONFIRMED → FIXING → FIXED → RECHECKING → RECHECKED`로 전이한다. P1이므로 구현자와 분리된 두 독립 검증 근거가 필요하다.

- F-003 recheck: repository signing path, fail-closed negative test, local upload signer, Play app signer, OAuth matrix evidence
- F-017 recheck: canonical env provenance, unsafe/missing negative test, Metro 없는 startup/API/Google login evidence

외부 Console 또는 device 증거가 없으면 repository 구현만 완료되어도 audit finding을 `RECHECKED`로 닫지 않는다.

## 14. 복구·회전

- 잘못된 repository 변경: product change를 되돌리고 unsigned release 상태로 복귀한다. 이 rollback은 외부 key/Console state를 자동 변경하지 않는다.
- 잘못된 env artifact: 배포/track 승격을 중단하고 corrected input으로 새 artifact를 만든다. 이미 Play에 업로드했다면 versioning 정책에 따른 새 version code가 별도 필요할 수 있다.
- upload key 유실·침해: Play upload-key reset 절차와 CI/local secret 교체를 수행한다.
- Play app-signing key 문제: Play Console의 공식 recovery/upgrade 절차를 별도 change gate로 처리한다.
- OAuth mismatch: correct signer client를 먼저 추가·검증한다. 기존 client 삭제는 별도 승인한다.
- production Web audience 변경: frontend release env와 backend secret을 하나의 coordinated change로 배포하고 양쪽 match를 smoke한다.

## 15. 구현 파일 경계

설계 승인 뒤 작성할 implementation plan은 다음 1~2-file stage를 기준으로 한다.

1. documentation/template stage
   - `DSM_Front/.env.release.example`
   - `DSM_Front/README.md`
2. Gradle behavior stage
   - `DSM_Front/android/app/build.gradle`
3. audit opening/closure stage
   - `.ai/audits/20260817-release-audit-full-project/findings.jsonl`
   - `.ai/audits/20260817-release-audit-full-project/README.md`
4. memory stages
   - `.ai/memory/plan.md` + `.ai/memory/context.md`
   - `.ai/memory/checklist.md` + `.ai/memory/README.md`

`.gitignore` 변경은 계획하지 않는다. 기존 `DSM_Front/.gitignore`의 `.env*.local`, `*.jks`, `*.keystore`가 의도한 local 파일을 이미 방어하며 keystore와 Gradle secret file 자체는 repository 밖에 둔다.

명령 단위 RED/GREEN 검증을 먼저 정의하고 `build.gradle`을 최소 변경한다. 별도 helper script나 automated Gradle test가 필요하다고 확인되면 implementation plan에서 새 exact path와 이유를 제시하고 다시 승인받는다.

## 16. 완료 판정

### F-003

- explicit upload signing config와 외부 secret input 계약 존재
- missing signing input이 artifact 전에 fail closed
- upload-key AAB/local APK와 Play app-signing APK의 signer 역할 분리 증명
- 필요한 Android OAuth client matrix provision 및 두 release 경로 Google login smoke

### F-017

- release가 canonical ignored env를 사용
- missing/unsafe env와 ambiguous provenance가 artifact 전에 fail closed
- production HTTPS API와 Web audience pair가 runtime에서 동작
- Metro 없는 first render, API, Google login/session smoke

두 목록과 audit 독립 recheck가 모두 끝나기 전에는 release-ready라고 선언하지 않는다.

## 17. 대안과 기각 이유

### debug key를 release에 재사용

PC별 identity, 유출 위험, Play update continuity 때문에 기각한다.

### keystore와 password를 repository 또는 project-local properties에 저장

Git history·backup·log 유출 위험 때문에 기각한다.

### release도 `.env` 또는 tracked env를 사용

debug/release provenance가 불명확하고 실제 운영값의 accidental commit 위험이 있어 기각한다.

### runtime throw만 신뢰

설치 후 첫 렌더에서야 실패하므로 artifact 생성·업로드를 막지 못한다. Gradle pre-build validation이 필요하다.

### upload certificate OAuth client만 등록

Play-delivered APK signer가 다르므로 기각한다.

### Internal App Sharing만으로 production signer 검증

별도 test key로 재서명되므로 app-signing-key OAuth proof를 제공하지 못해 기각한다.

### Firebase/`google-services.json` 도입

현재 explicit Web client ID architecture에 필요하지 않고 scope를 확대하므로 기각한다.

## 18. 미결정 항목

다음은 설계 결함이 아니라 implementation/external action 전 필수 입력이다.

1. `com.dsm.dailyup`의 신규/기존 Play package 상태
2. Google Play 외 배포 채널 필요 여부
3. Play/OAuth/release/CI 각 권한 보유자
4. 승인된 upload keystore 보관 위치와 CI secret provider
5. production API endpoint와 production Web OAuth audience의 out-of-band 값
6. physical test device와 Play internal tester

값 자체가 아니라 결정과 PASS/FAIL 결과만 repository audit evidence에 기록한다.

## 19. 근거 자료

- React Native 0.83 Android signing: https://reactnative.dev/docs/0.83/signed-apk-android
- Android app signing: https://developer.android.com/studio/publish/app-signing
- Android build variants/signing config: https://developer.android.com/build/build-variants
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756?hl=en
- Internal App Sharing signer: https://support.google.com/googleplay/android-developer/answer/9844679?hl=en-EN
- Google Android client authentication: https://developers.google.com/android/guides/client-auth
- Gradle project properties: https://docs.gradle.org/current/userguide/project_properties.html
- `react-native-config` Android loader: https://github.com/react-native-config/react-native-config/blob/master/android/dotenv.gradle

## 20. 승인 요청

이 문서는 구현 계약의 written design이다. self-review에서는 current source/audit/dependency behavior 대조, required contract anchor, 경로·링크, placeholder/secret pattern, ignore rule, strict UTF-8, `git diff --check`를 확인했다. 결과는 `PASS`다.

사용자가 이 문서를 승인하면 별도 implementation plan을 작성한다. 승인 전에는 제품 파일, key, Console, artifact, Git state를 변경하지 않는다.
