# 남은 8건 외부 환경 제공 작업표

- 작성일: 2026-09-14
- 최신 입력: 2026-09-16 `신규 Play Console 등록 보류; ENV-D02~D05 우선`
- 대상: F-003, F-013, F-015, F-017, F-065, F-067, F-068, F-092
- 현재 원장: 92건, `RECHECKED 83 / FIXING 3 / UNKNOWN 5 / REFUTED 1`
- 목적: 외부 조건을 계정·비밀·인프라·기기·사람 확인 단위로 분해하고, 제공 직후 자동 검증을 시작할 수 있게 한다.

## 현재 결정 상태 — 2026-09-16

| 결정 | 현재 상태 | 다음 외부 작업 |
|---|---|---|
| Play Console 신규 등록 | 보류 | 재개 전까지 signer·internal track·Data safety 작업을 진행하지 않음 |
| 소유 도메인 | 미정 | API와 legal web hostname을 함께 결정 |
| Backend 배포 플랫폼 | 미정 | Docker image, PostgreSQL, Redis, HTTPS, secret injection, readiness probe 지원 여부를 확인 |
| 개인정보·삭제 책임자와 문의 채널 | 필요 | 책임 주체와 사용자가 연락할 이메일 또는 요청 채널을 확정 |
| Android 기기·provider 테스트 계정 2개 | 필요 | Google Play 지원 기기 1대 이상과 상호 격리된 A/B 계정을 준비 |

## 고정된 저장소 계약

- Android application ID와 namespace: `com.dsm.dailyup`
- 앱 표시 이름: `DailyUp`
- Front release 공개 설정: Git 제외 `.env.release.local`
- Android signing 입력: 저장소 밖 Gradle properties 또는 CI의 `ORG_GRADLE_PROJECT_DAILYUP_UPLOAD_*`
- Backend 운영 설정: 배포 플랫폼 runtime secret
- Backend Firebase 인증: Application Default Credentials와 `FCM_PROJECT_ID`
- liveness/readiness: `/health`, `/health/ready`
- 공개 URL: HTTPS `PRIVACY_POLICY_URL`, `ACCOUNT_DELETION_URL`

실제 비밀값, keystore, token, 전체 인증서 fingerprint는 이 문서·Git·채팅·일반 로그에 기록하지 않는다. 값은 소유자가 local secure store, CI secret 또는 배포 플랫폼 secret에 직접 넣고 자동 검증에는 존재 여부와 성공/실패만 전달한다.

## 1단계 — 먼저 확정할 다섯 결정

| ID | 책임 | 결정 작업 | 완료 산출물 | 연결 finding |
|---|---|---|---|---|
| ENV-D01 | 사용자/조직 | Play Console에 `com.dsm.dailyup` 기존 앱이 있는지 확인하고 기존 앱/신규 앱 중 하나를 확정 | 앱 존재 상태, package 소유권, Play App Signing 상태를 값 없는 체크 결과로 기록 | F-003, F-065, F-068 |
| ENV-D02 | 사용자/조직 | 운영 API와 legal web에 사용할 소유 도메인 확정 | `api`와 `legal` HTTPS hostname의 결정 상태 | F-013, F-017, F-067, F-068 |
| ENV-D03 | 사용자/조직 | Docker image, PostgreSQL 17, Redis 7, HTTPS, secret injection, readiness probe를 지원하는 배포 플랫폼 확정 | 플랫폼명, 프로젝트/환경명, staging/production 구분 | F-013, F-017 |
| ENV-D04 | 사용자/조직·법적 검토자 | 개인정보처리방침 책임 주체, 문의 채널, 데이터 보유·삭제 예외와 처리 안내 문구 승인 주체 확정 | 승인 담당자와 검토 상태; 실제 개인정보는 문서에 복제하지 않음 | F-067, F-068 |
| ENV-D05 | 사용자/조직 | 실제 provider 계정 2개와 Android 테스트 수단 확정 | A/B 테스트 계정 보유 여부, 최소 1대의 Google Play 지원 Android, OEM/device-farm 범위 | F-015, F-065, F-067, F-092 |

`ENV-D01`을 먼저 끝낸다. 기존 Play 앱의 signing identity를 확인하기 전에 새 upload key나 새 Android OAuth client를 만들면 기존 업데이트 경로와 다른 identity를 만들 수 있다.

### ENV-D01 접근 복구 분기 — 2026-09-15

| ID | 책임 | 작업 | 비용/비가역 경계 | 완료 결과 |
|---|---|---|---|---|
| ENV-A01 | 사용자 | 소유 가능성이 있는 Google 계정으로 [Play Console](https://play.google.com/console/)에 로그인하고 화면 상태를 확인 | 읽기 전용·무과금; 비밀번호·인증 코드는 공유하지 않음 | `대시보드 진입 / 가입 화면 / 접근 거부` 중 하나 |
| ENV-A02 | 사용자 | Google 계정 메일에서 Play Console 초대, developer registration, package `com.dsm.dailyup` 관련 이력을 검색 | 읽기 전용·무과금; 메일 본문·개인정보를 저장소에 복제하지 않음 | 기존 owner/admin 연락 가능 여부와 기존 앱 가능성 |
| ENV-A03 | 기존 owner/admin | 기존 developer account가 있으면 대상 Google 계정을 app-level 또는 필요한 최소 권한으로 초대 | 외부 권한 변경이므로 owner/admin이 직접 실행 | 초대 수락 뒤 All apps에서 package 존재 여부 확인 |
| ENV-A04 | 사용자/조직 | 기존 계정이 없을 때만 개인/조직 developer account 유형과 공개 developer identity를 확정 | 공개 배포용 full distribution은 현재 USD 25 1회 등록비; 약관 동의·등록비·신원 확인 전 사용자 명시 결정 필요 | account type과 등록 담당 owner 확정 |
| ENV-A05 | account owner | 신규 account 등록, 연락처·신원 확인, 필요한 실제 Android 기기 확인 완료 | 결제·법적 정보·OTP는 owner가 Google 화면에서 직접 처리 | Play Console dashboard 진입과 developer account 활성 상태 |

화면 판정은 다음과 같이 기록한다.

- developer account dashboard가 열리면 `기존 접근 있음`이다. All apps에서 `com.dsm.dailyup`을 검색하고, 없더라도 즉시 새 앱을 만들지 않고 account owner와 package 이력을 먼저 확인한다.
- developer account 생성 wizard가 열리면 해당 Google 계정에는 활성 developer account가 없는 후보 상태다. 2026-09-15 사용자 확인으로 현재 후보 계정은 유료 등록 단계까지 진입했다. 다른 조직 계정·초대 메일 확인을 끝낸 뒤 `ENV-A04`로 이동한다.
- 권한 또는 초대 안내가 나오면 새 account를 만들지 않고 기존 owner/admin에게 invite를 요청한다. 공식 Play 도움말상 초대된 admin/user는 별도 developer registration fee를 내지 않는다.

신규 등록을 선택하면 개인 계정은 법적 이름·주소, 검증 가능한 연락처와 developer email이 필요하고 신규 개인 계정은 Play Console 모바일 앱을 이용한 실제 Android 기기 확인이 필요하다. 조직 계정은 조직 정보, website, 연락처와 일반적으로 D-U-N-S 및 조직 확인 자료가 필요하다. 실제 입력 항목은 account 생성 화면과 공식 도움말을 최종 기준으로 삼는다.

## 2단계 — 서명·OAuth·Firebase·secret 준비

| ID | 선행 | 책임 | 제공 작업 | 저장 위치/전달 경계 | 완료 증거 |
|---|---|---|---|---|---|
| ENV-S01 | D01 | 사용자/조직 | 기존 앱이면 현재 upload key를 복구하고, 신규 앱이면 별도 upload key와 Play App Signing 방식을 확정 | keystore는 저장소 밖 암호화 저장소; 암호는 local/CI secret | release validation이 네 Gradle property의 존재를 확인하고 AAB 서명 성공 |
| ENV-S02 | S01 | 사용자/조직 | upload certificate와 Play app-signing certificate의 공개 SHA를 확보 | Google/Play Console에 직접 등록; 채팅·Git에 전체 값 기록 금지 | 두 certificate identity에 대한 등록 완료 체크 |
| ENV-S03 | D01,S02 | 사용자/조직 | Google Cloud에서 Backend와 Front가 공유할 Web OAuth audience 및 Android OAuth client를 구성 | client ID는 해당 runtime secret/public release env에 직접 주입 | upload-signed와 Play-signed 설치본 모두 Google 로그인 성공 |
| ENV-S04 | D01 | 사용자/조직 | Firebase project에 package `com.dsm.dailyup` Android app 등록 | `google-services.json`은 local/CI가 build 직전에 `DSM_Front/android/app`에 제공; commit 정책 확정 전 staging 금지 | release 앱의 Firebase default app configured=true, FCM token 발급 |
| ENV-S05 | S04,D03 | 사용자/조직 | Backend 실행 identity에 Firebase Messaging 권한을 부여 | workload identity 권장; JSON key 사용 시 배포 secret/file mount이며 저장소·이미지 제외 | ADC로 project identity 일치, dry-run 또는 승인된 sandbox send 성공 |
| ENV-S06 | D02,D03,S03,S05 | 사용자/조직 | Backend runtime secret을 구성 | 배포 플랫폼 secret: `DATABASE_URL`, `REDIS_URL`, JWT secrets, `GOOGLE_CLIENT_ID`, `FCM_PROJECT_ID`; 실제 발송 시에만 `FCM_DISPATCH_ENABLED=true` | secret echo 없이 startup validation과 readiness 통과 |
| ENV-S07 | D02,S03,D04 | 사용자/조직 | Front release 공개 설정을 구성 | Git 제외 `.env.release.local`: HTTPS API/legal URL과 public OAuth identifiers만 포함 | `:app:validateReleaseConfiguration` 통과 |

Android 공식 문서는 Play App Signing의 app-signing key와 upload key를 분리하고, API provider 등록에는 각 공개 certificate fingerprint를 사용하도록 안내한다. Firebase FCM client는 Google Play가 설치된 Android 6.0+ 기기 또는 Google APIs emulator가 필요하다.

## 3단계 — 운영·공개 web·Play 테스트 환경

| ID | 선행 | 책임 | 환경 제공 작업 | 완료 증거 | 연결 finding |
|---|---|---|---|---|---|
| ENV-I01 | D02,D03,S06 | 사용자/조직+에이전트 | 고정 revision의 Backend image, PostgreSQL 17, Redis 7을 staging에 배포하고 TLS API hostname 연결 | migration 성공, `/health` 200, `/health/ready` 200, DB 장애 503와 복구 200 | F-013, F-017 |
| ENV-I02 | D02,D04 | 사용자/조직+법적 검토자 | 공개 privacy page와 앱 없이 접근 가능한 account-deletion request resource 게시 | HTTPS 200, DailyUp 또는 developer 명시, 삭제 요청 경로가 눈에 띄고 앱 재설치를 요구하지 않음 | F-067, F-068 |
| ENV-I03 | D01,I02 | 사용자/조직 | Play Console Data safety와 account deletion 응답을 실제 처리 방식에 맞게 작성 | 제출 전 내부 검토, 공개 URL 검사, Console validation 결과 | F-068 |
| ENV-I04 | S01,S07,I01 | 사용자/조직+에이전트 | release AAB 생성 후 Play internal testing draft에 업로드 | upload signer 확인, Play app-signing 설치본 확보, production 공개 전 internal track 상태 | F-003, F-065, F-067 |
| ENV-I05 | D05,I04 | 사용자/조직 | 실제 기기/device farm matrix 준비 | API 24와 최신 Android 각 1개, Google Play 지원 기기, 가능한 OEM 2종 이상과 테스트 APK 설치 권한 | F-015, F-065, F-067, F-092 |

Google Play의 현재 계정 삭제 정책상 계정을 만들 수 있는 앱은 앱 내부 삭제 경로와 web 삭제 요청 resource를 모두 제공해야 한다. Web resource는 작동하고 관련 범위가 분명해야 하며 앱 또는 developer 이름을 표시하고, 사용자가 앱을 다시 설치하지 않아도 요청할 수 있어야 한다. 정책 답변과 법적 보유 기간은 실제 처리 방식 및 법적 검토 결과와 일치시킨다.

## 4단계 — 환경 제공 뒤 실행할 gate

| Gate | 자동 실행 | 사람 확인 | 종결 기준 |
|---|---|---|---|
| GATE-003 | release config validation, AAB/APK signer·package·embedded public config 검사, cold-start/session 회귀 | upload-signed와 Play-signed 앱에서 실제 Google 로그인·로그아웃 | 두 signer와 OAuth identity가 일치하고 release artifact에서 전 과정 통과 |
| GATE-013 | staging deploy, migration/start 로그, readiness 200→DB 장애503→복구200, 새 revision traffic probe | 플랫폼의 실제 readiness/traffic 설정 화면 대조 | 새 revision이 readiness 전 traffic을 받지 않고 실패 revision이 차단됨 |
| GATE-015 | FCM token 등록·refresh·revoke, Backend sandbox dispatch, foreground/background/terminated 수신과 중복·취소 검사 | 실제 기기의 권한 허용, 앱 상태 전환, 수신 관찰 | 동일 project identity에서 token부터 실제 전달·폐기까지 통과 |
| GATE-017 | signed build의 API hostname 추출, TLS/HTTP 계약, cold-start·refresh·deep-link 연결 검사 | production/staging endpoint 소유권 확인 | placeholder가 없고 signed 앱이 의도한 HTTPS API만 사용 |
| GATE-065 | taskAffinity probe, malicious same-affinity test APK, task/back-stack matrix 자동 수집 | OEM별 최근 앱 화면과 task 전환 관찰 | upload/Play-signed 앱과 물리/OEM matrix에서 hijack 재현 없음 |
| GATE-067 | signed 앱 내부 삭제→Backend transaction→session/keychain/offline/notification 정리, web 요청 ticket lifecycle probe | 실제 계정과 외부 요청 채널에서 완료 통지·재로그인 상태 확인 | 앱 내부 및 web 경로가 설명된 범위대로 삭제를 완료 |
| GATE-068 | 공개 URL HTTPS/내용/앱명/anchor 검사, signed 앱 link open, Data safety evidence matrix 생성 | 법적 승인과 Play Console 제출 결과 확인 | 공개 URL과 Console 응답이 실제 수집·삭제 동작과 일치 |
| GATE-092 | 계정 A offline outbox 생성→logout/switch→B 로그인·sync·notification 추적 자동 계측 | provider A/B의 대화형 로그인 수행 | A 데이터가 B 권한·알림·POST/list에 도달하지 않고 owner binding 유지 |

각 gate는 token, credential, 개인 계정 식별자를 로그에 남기지 않는다. 실패 시 finding 상태를 유지하고 sanitized error class, 단계, 시간과 artifact hash만 기록한다.

## 권장 실행 순서

1. 현재는 신규 Play Console 등록을 보류하고 `ENV-D02`~`D05` 도메인·플랫폼·법적 담당·테스트 자원을 확정한다.
2. Play 작업을 재개하면 `ENV-D01`의 기존/신규 앱 여부를 확인한다.
3. `ENV-S01`~`S07`을 순서대로 구성해 하나의 package/signing/OAuth/Firebase identity를 만든다.
4. staging Backend와 legal web을 먼저 올리고 자동 HTTP 검증을 끝낸다.
5. release AAB를 Play internal testing까지만 올려 Play signer 설치본을 확보한다.
6. 실제 FCM, account deletion, task hijack, A→B 전환을 같은 signed build에서 실행한다.
7. 증거를 독립 재검토한 뒤 F-003/013/015/017/065/067/068/092를 각각 전이한다.

## 첫 handoff에 필요한 비민감 응답

다음 항목은 값이나 credential 없이 상태만 받는다.

- Play Console 확인 결과: `대시보드 진입 / 가입 화면 / 접근 거부`
- 기존 초대·등록 메일 또는 owner/admin 연락 가능성: `있음 / 없음 / 확인 중`
- 소유 도메인: `있음 / 구매 예정 / 미정`
- Backend 배포 플랫폼: `선정됨 / 후보 있음 / 미정`
- privacy/deletion 문구 승인 담당: `있음 / 필요`
- Android 실제 기기 또는 device farm: `있음 / 필요`
- provider 테스트 계정 2개: `있음 / 필요`

## 공식 기준

- [Play Console 시작과 USD 25 1회 등록비](https://support.google.com/googleplay/android-developer/answer/6112435?hl=ko)
- [Google Play 계정 삭제 요구](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Android 앱 서명과 Play App Signing](https://developer.android.com/studio/publish/app-signing)
- [Firebase Android FCM 설정](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [Google API client 인증과 signing fingerprint](https://developers.google.com/android/guides/client-auth)
- [Play Console 계정 생성에 필요한 정보](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en)
- [Play Console 사용자 초대와 권한](https://support.google.com/googleplay/android-developer/answer/9844686?hl=en-GB)
- [신규 개인 계정의 Android 기기 확인](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en)
