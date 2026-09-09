# F-067/F-068 계정 삭제·개인정보 경로 구현 계획

**상태:** 저장소 구현·검토 완료, 공개 URL 및 외부 증거 입력 대기
**대상:** Android 전용 DSM v1.3
**감사 항목:** F-067 P1, F-068 P1

## 1. 목표

소셜 로그인으로 생성된 DSM 계정을 앱 안에서 삭제할 수 있게 하고, 서버의 계정 연관 데이터를 한 트랜잭션에서 제거한 뒤 Android 클라이언트의 보안 토큰과 사용자 범위 상태를 정리한다. 로그인 화면과 마이페이지에서 실제 개인정보처리방침을 열 수 있게 하며, 앱을 다시 설치하지 않아도 삭제를 요청할 수 있는 외부 웹 경로를 release configuration으로 요구한다.

Google Play의 현재 계정 삭제 요구사항은 계정 생성 앱에 다음 두 경로를 요구한다.

- 앱 내부의 직관적이고 쉽게 찾을 수 있는 계정 삭제 경로
- 앱 재설치를 요구하지 않고 삭제를 요청할 수 있는 외부 웹 리소스

외부 경로는 기능하는 HTTPS 페이지여야 하며 앱 또는 개발자 이름과 눈에 잘 띄는 삭제 요청 수단을 포함해야 한다. 고객지원 이메일 또는 제출 양식도 요청 수단으로 인정된다.

근거:

- https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- https://support.google.com/googleplay/android-developer/answer/10787469?hl=en

## 2. 확인된 현재 상태

- `AuthService.findOrCreateUser`가 소셜 로그인 시 DSM `User`와 `SocialAccount`를 생성한다.
- Backend에는 login, refresh, logout, me, onboarding만 있고 삭제 endpoint가 없다.
- `User`의 SocialAccount, RefreshToken, FcmToken, Category, Task, DailyScore, RankingSnapshot, NotificationSchedule 관계는 사용자 삭제 시 cascade된다.
- `NotificationDelivery.fcmToken`은 `onDelete: NoAction`이다. 사용자 행만 삭제하면 기존 delivery가 FCM token 삭제를 막을 수 있다.
- 마이페이지 계정·법적 정보는 준비 중 toast이며 실제 파괴 동작은 logout뿐이다.
- 로그인 화면의 개인정보처리방침도 준비 중 toast다.
- 공개 privacy URL, 계정 삭제 URL, 고객지원 이메일은 tracked configuration과 문서에서 발견되지 않았다.
- 실제 Android device는 0대이고 `.env.release.local`과 upload keystore가 없어 signed-device 검증은 지금 수행할 수 없다.

## 3. 확정 구현 계약

### 3.1 Backend API

- `DELETE /auth/me`
- 인증: 기존 `JwtAuthGuard`의 Bearer access token
- 응답: body 없는 `204 No Content`
- 이미 삭제된 사용자 ID에는 정보 노출 없이 idempotent `204`
- 클라이언트 확인 문자열은 보안 경계가 아니므로 API body에 넣지 않는다. 사용자의 명시적 파괴 확인은 앱 UI에서 수행한다.

`AuthService.deleteAccount(userId)`는 하나의 interactive transaction에서 다음 순서를 지킨다.

1. 기존 사용자 row lock helper로 대상 user를 잠근다.
2. `schedule.userId == userId` 또는 `fcmToken.userId == userId`인 `NotificationDelivery`를 먼저 `deleteMany`한다.
3. `User`를 `deleteMany({ id: userId })`로 삭제한다.
4. DB cascade로 social identity, 모든 refresh session, FCM token, category/task, score/ranking, schedule을 제거한다.

Prisma schema와 migration은 변경하지 않는다. 실제 PostgreSQL 검증에서 `NoAction` FK를 포함한 전체 삭제가 확인되지 않으면 구현을 완료로 판정하지 않는다.

### 3.2 Android session lifecycle

`SessionControllerPort`에 single-flight `deleteAccount(): Promise<boolean>`을 추가하고 action에 `deleting-account`를 추가한다.

- 현재 authenticated session과 epoch를 캡처한다.
- `AuthenticatedClient`로 `DELETE /auth/me`를 호출해 401 refresh replay를 기존 방식으로 처리한다.
- 서버 `204`가 확인된 경우에만 epoch를 증가시키고 memory access token을 제거한다.
- `TokenStoreCoordinator.readAndClear()`로 Keychain refresh token을 지운다.
- local clear 성공 시 unauthenticated, 실패 시 기존 `storage-error(clear)` 복구 상태로 보낸다.
- network/timeout/HTTP 오류에는 계정 삭제 성공을 추정하지 않고 현재 session을 유지하며 안전한 오류만 게시한다.
- 중복 탭, 지연된 refresh/profile 응답, 계정 전환이 새 session에 결과를 적용하지 못하게 epoch와 promise identity를 검사한다.
- `ProductProvider`는 `deleting-account` 동안 store를 unmount/dispose해 삭제와 동시에 refresh/mutation이 시작되지 않게 한다.

### 3.3 Android UI

마이페이지의 계정 관리 placeholder를 실제 경로로 바꾼다.

- 접근성 이름 `계정 삭제`
- 삭제될 데이터 범위를 설명하는 첫 화면/Alert
- 취소와 destructive `계정 삭제`를 분리한 명시적 최종 확인
- 요청 중 중복 탭 비활성화
- 서버 성공 후 prototype/local account-scoped state 초기화
- 실패 시 내부 응답이나 token을 노출하지 않는 재시도 안내

로그인 화면과 마이페이지에는 실제 `개인정보처리방침` 링크를 둔다. 마이페이지에는 `계정 삭제 안내` 외부 링크도 둔다. 이용약관은 이번 finding의 필수 범위가 아니므로 별도 placeholder 상태를 확장하지 않는다.

### 3.4 Legal URL configuration

새 runtime contract:

- `PRIVACY_POLICY_URL`
- `ACCOUNT_DELETION_URL`

두 값은 HTTPS와 host를 요구하고 embedded credentials를 거부한다. 삭제 URL의 anchor는 Google 안내가 허용하는 prominent deletion section을 지원하기 위해 허용한다. debug example에는 비밀이 아닌 `example.invalid` 값을 기록하고, release validator는 두 key의 존재와 URL 구조를 fail-closed로 검사한다.

실제 URL의 접근 가능성, 페이지의 DailyUp/Play 개발자 표시명, 삭제 요청 수단과 정책 내용은 네트워크 release gate에서 별도로 검증한다. 저장소에 공개 URL이 없으므로 임의의 운영자명, 이메일, 보존 기간 또는 데이터 공유 관행을 만들어내지 않는다.

## 4. 최소 단위 구현 순서

각 단계는 1~2개 파일만 수정하고 해당 focused test를 먼저 실패시킨 뒤 구현한다.

1. **Backend deletion service**
   - `DSM_Back/src/auth/auth.service.spec.ts`
   - `DSM_Back/src/auth/auth.service.ts`
   - delivery 선삭제, row lock, user delete 순서와 missing-user idempotence를 검증한다.

2. **Backend controller contract**
   - `DSM_Back/src/auth/auth.controller.spec.ts`
   - `DSM_Back/src/auth/auth.controller.ts`
   - authenticated subject 전달과 `204` endpoint를 검증한다.

3. **실제 PostgreSQL cascade 검증**
   - `DSM_Back/test/account-deletion.pg-spec.ts` 신규
   - 모든 사용자 관계와 delivery를 seed하고 삭제 후 사용자 범위 row가 0인지 확인한다. disposable PostgreSQL URL만 process-local로 주입한다.

4. **Session deletion state machine**
   - `DSM_Front/src/features/auth/session-controller.test.ts`
   - `DSM_Front/src/features/auth/session-controller.ts`
   - success, duplicate press, HTTP failure, ambiguous timeout, local clear failure, late refresh/profile, newer-session fence를 검증한다.

5. **Session context exposure**
   - `DSM_Front/src/features/auth/session-context.test.tsx`
   - `DSM_Front/src/features/auth/session-context.tsx`
   - context가 동일 controller method와 epoch를 노출하는지 확인한다.

6. **ProductStore deletion fence**
   - `DSM_Front/src/features/product/product-context.test.tsx`
   - `DSM_Front/src/features/product/product-context.tsx`
   - `deleting-account` 동안 provider가 사라지고 store가 dispose되는지 확인한다.

7. **Legal URL parser/opener**
   - `DSM_Front/src/config/legal-links.test.ts` 신규
   - `DSM_Front/src/config/legal-links.ts` 신규
   - HTTPS/host/credentials 규칙과 `Linking.openURL` 실패의 안전한 오류를 검증한다.

8. **로그인 개인정보 링크**
   - `DSM_Front/src/__tests__/app/index.test.tsx`
   - `DSM_Front/src/app/index.tsx`
   - placeholder toast를 실제 privacy 링크로 교체하고 중복/오류 피드백을 검증한다.

9. **마이페이지 삭제·법적 링크**
   - `DSM_Front/src/__tests__/app/tabs/mypage.test.tsx`
   - `DSM_Front/src/app/(tabs)/mypage.tsx`
   - 두 단계 확인, pending disable, delete success/failure, privacy/deletion 링크를 검증한다.

10. **Release fail-closed URL gate**
    - `DSM_Front/android/release-config.test.groovy`
    - `DSM_Front/android/release-config.gradle`
    - 두 URL의 missing/blank/unsafe case와 secret-free error를 검증한다.

11. **환경 예시 계약**
    - `DSM_Front/.env.example`
    - `DSM_Front/.env.release.example`
    - key와 공개 placeholder만 추가한다. `.env.release.local`은 읽거나 생성하지 않는다.

12. **감사 상태와 handoff**
    - 구현 승인 후 F-067/F-068을 `FIXING`으로 전이한다.
    - code/test 완료만으로 `RECHECKED`하지 않는다. 실제 공개 URL과 외부 삭제 요청 흐름, signed Android device, Play Console Data safety 증거까지 확보한 뒤 독립 P1 recheck 2명을 배정한다.

## 5. 검증 행렬

### Focused

- Backend auth service/controller unit tests
- Front legal config, session controller/context, product context, login, MyPage tests
- Groovy release configuration behavior test
- disposable PostgreSQL account-deletion cascade test

### Full regression

- Backend unit, e2e, build, typecheck, lint
- Front full Jest, TypeScript, lint
- Android `assembleDebug`
- public-fixture release configuration negative/positive dry-run

### External release gates

- 실제 `PRIVACY_POLICY_URL`이 로그인·마이페이지에서 열림
- 실제 `ACCOUNT_DELETION_URL`이 앱 설치 없이 열리고 DailyUp/개발자 이름과 요청 수단을 표시함
- 외부 요청을 실제 운영자가 수신·처리할 수 있음
- signed release 기기에서 삭제 성공 후 cold start 시 session과 account-scoped data가 복원되지 않음
- Play Console Data safety와 account-deletion URL 제출 내용이 실제 동작과 일치함

## 6. 승인 시 필요한 입력

구현 코드는 placeholder contract로 시작할 수 있지만 release closure에는 다음 실제 값이 필요하다.

1. 공개 `PRIVACY_POLICY_URL`
2. 공개 `ACCOUNT_DELETION_URL` — privacy page의 prominent anchor도 가능

아직 URL이 없으면 “URL 미정”으로 승인할 수 있다. 이 경우 Backend·Android 경로와 fail-closed configuration까지 구현하고 F-067/F-068은 외부 URL gate가 남은 `FIXING` 상태로 유지한다.

## 7. 비범위

- Google/Kakao/Apple provider 계정 자체 삭제
- 법률 자문이나 임의의 개인정보처리방침 본문 작성
- 이용약관 작성
- Play Console 제출, 배포, DNS/웹 호스팅 변경
- 기존 F-002 access-token revocation, 다른 confirmed finding의 동시 수정
