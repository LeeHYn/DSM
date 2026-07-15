# DSM 마일스톤 12A — 알림 기반 상세 계획

## 승인 상태

- **계획 작성 승인**: 2026-07-10 사용자가 알림 방향으로 작업 진행을 승인했다.
- **현재 상태**: 구현 승인 대기.
- 이 문서의 승인은 계획 작성에만 적용된다. 아래 `DSM_Back/` 소스·테스트 변경은 사용자가 12A 구현을 명시적으로 승인한 뒤에만 시작한다.

## 1. 목표

마일스톤 12A는 실제 푸시 발송 전의 서버 기반만 구축한다.

1. 인증된 사용자가 FCM 디바이스 토큰을 등록·갱신·재활성화·폐기할 수 있는 API를 제공한다.
2. Task 생성·시간 변경·알림 설정 변경·상태 변경·완료·삭제와 `NotificationSchedule`의 `PENDING` 예약을 원자적으로 동기화한다.
3. 모든 예약 시각은 기존 `startAt` UTC 값을 그대로 `scheduledAt`에 저장한다.
4. 단위 테스트로 사용자 격리, 멱등성, 상태 전이, 과거 일정 제외와 기존 점수 재계산 호출 보존을 검증한다.

## 2. 비목표

- Firebase Admin SDK 초기화 또는 실제 FCM 발송
- `@nestjs/schedule`/Cron worker, 재시도, 다중 인스턴스 선점
- Firebase 자격증명 활성화·검증, 외부 Firebase 접근
- 모바일 알림 권한, FCM SDK, 로컬 알림, 로그인·로그아웃 연동
- WebSocket 이벤트, 실시간 랭킹, Redis·배치 랭킹
- Prisma schema/migration 변경, 패키지 설치 또는 lockfile 변경
- 사용자 전역 `notificationEnabled` 설정 API. 12A 예약은 Task 단위 플래그를 기준으로 만들고, 전역 수신 거부는 12B 발송 시 다시 확인한다.

## 3. 현재 저장소 근거와 판정

- 요구사항은 앱 실행·로그인 때 토큰을 서버에 전달하고 로그아웃 때 무효화하도록 요구한다. — `Planing Document/Requirements_Analysis_v1.3.md:38`
- 서버·DB 시간과 예약 타임스탬프는 UTC 기준이다. — `Planing Document/Requirements_Analysis_v1.3.md:46`, `Planing Document/System_Architecture_v1.3.md:69`
- `FcmToken`에는 전역 unique `token`, `platform`, 선택 `deviceId`, `userId`, `lastSeenAt`, `revokedAt`이 이미 있다. — `DSM_Back/prisma/schema.prisma:90`
- `NotificationSchedule`에는 `taskId`, `userId`, UTC `scheduledAt`, `sentAt`, 문자열 `status`, `failureReason`과 발송 조회 인덱스가 이미 있다. — `DSM_Back/prisma/schema.prisma:177`
- Task에는 `notificationEnabled`, 상태, soft-delete 시각 및 schedule 관계가 있다. — `DSM_Back/prisma/schema.prisma:120`
- Task CRUD는 현재 Task 레코드만 변경하고, mutation 뒤 `ScoresService.recompute`를 호출한다. — `DSM_Back/src/tasks/tasks.service.ts:16`, `DSM_Back/src/tasks/tasks.service.ts:59`, `DSM_Back/src/tasks/tasks.service.ts:80`, `DSM_Back/src/tasks/tasks.service.ts:89`
- Task DTO는 ISO 날짜와 `notificationEnabled`를 이미 검증한다. — `DSM_Back/src/tasks/dto/create-task.dto.ts:20`, `DSM_Back/src/tasks/dto/update-task.dto.ts:19`
- JWT 보호 컨트롤러가 `req.user.sub`를 사용자 ID로 전달하는 패턴이 존재한다. — `DSM_Back/src/tasks/tasks.controller.ts:26`, `DSM_Back/src/auth/auth.controller.ts:35`
- 현재 의존성에는 Nest, Prisma, class-validator가 있으나 Firebase Admin과 Nest schedule은 없다. — `DSM_Back/package.json:26`
- FCM 환경변수 자리와 선택적 검증은 이미 있지만 실제 자격증명은 12A에서 읽지 않는다. — `DSM_Back/.env.example:7`, `DSM_Back/src/config/env.validation.ts:44`

### 12A 가능 여부 판정

**가능하다.** 토큰 DB 수명주기와 예약 레코드 동기화는 기존 Prisma 모델, NestJS, JWT guard, class-validator만으로 구현할 수 있다. 따라서 12A 자체에는 새 패키지, Firebase 자격증명, schema 변경 또는 migration 생성이 필요하지 않다.

단, 이 판정은 실제 대상 DB가 현재 `schema.prisma`와 일치한다는 전제다. 이번 plan-only 조사에서는 migration 이력과 실제 DB를 확인하지 않았다. 구현 후 DB 통합 검증 전에 메인 에이전트가 현재 migration 적용 상태를 별도 read-only 확인해야 하며, 불일치가 발견되면 12A를 임의로 확장하지 않고 별도 migration 승인으로 중단한다.

## 4. API 계약과 토큰 수명주기

### `PUT /notifications/fcm-tokens`

- JWT 필수.
- 요청: `{ token: string, platform: 'ios' | 'android', deviceId?: string }`.
- 검증: token은 공백 불가·최대 4096자, deviceId는 선택·최대 255자, platform은 allowlist만 허용한다.
- 동작: `token` unique 키로 Prisma `upsert`한다.
  - 신규: 현재 `userId`, platform/deviceId, `lastSeenAt=now`, `revokedAt=null`로 생성.
  - 동일 사용자의 재등록: platform/deviceId와 `lastSeenAt` 갱신, `revokedAt=null`로 재활성화.
  - 다른 사용자가 같은 디바이스 토큰을 등록: 토큰 소유권을 현재 인증 사용자로 원자적으로 이전한다. 한 디바이스 토큰이 두 계정에 활성 상태로 남지 않는다.
- 응답: `200 OK`와 `{ id, platform, deviceId, lastSeenAt, revokedAt }`. 원문 token은 응답·로그에 다시 노출하지 않는다.
- 멱등성: 같은 사용자·같은 입력의 반복 PUT은 새 행을 만들지 않고 한 행을 갱신한다.

### `DELETE /notifications/fcm-tokens`

- JWT 필수.
- 요청: `{ token: string }`. 토큰을 URL path/query에 두어 접근 로그에 남기지 않는다.
- 동작: `where: { token, userId, revokedAt: null }` 조건의 `updateMany`로 `revokedAt=now`를 기록한다.
- 응답: 존재·소유 여부와 무관하게 `204 No Content`. 반복 요청도 성공하여 멱등성을 유지하고 다른 사용자의 토큰 존재 여부를 노출하지 않는다.
- 실제 로그아웃에서 이 API를 호출하는 모바일 연결은 12C 범위다. 12A는 서버 API만 제공한다.

### 토큰 상태

`ACTIVE(revokedAt=null) -> REVOKED(revokedAt!=null) -> ACTIVE(재등록)`을 허용한다. 삭제 대신 soft revoke하여 발송 실패 분석과 재로그인을 지원한다. 12B는 활성 토큰만 조회하고 FCM의 invalid/unregistered 응답을 받으면 해당 토큰을 revoke한다.

## 5. NotificationSchedule 상태와 동기화 결정

### 상태

- 12A가 생성하는 상태: `PENDING`, `CANCELLED`.
- 12B가 소유할 상태: `PROCESSING`, `SENT`, `FAILED` 및 `sentAt`/`failureReason`.
- 기존 문자열 컬럼을 사용하므로 12A migration은 없다. 오타 방지를 위해 애플리케이션 상수/타입을 사용하되 Prisma enum 변경은 하지 않는다.

### 예약 적격 조건

다음을 모두 만족할 때만 새 `PENDING` schedule을 만든다.

- Task `notificationEnabled === true`
- Task `status === PENDING`
- Task가 soft-delete되지 않음
- `startAt > now`인 미래 일정

`scheduledAt`은 Task의 UTC `startAt`과 동일하다. 제목 등 발송 내용은 schedule에 복제하지 않고 12B worker가 task를 조회하여 stale payload를 피한다.

### Task mutation별 전이

- create: 적격하면 Task 생성의 nested write로 schedule 하나를 함께 생성한다. 과거/비활성 Task는 만들지 않는다.
- update: `startAt`, `notificationEnabled`, `status` 중 하나가 변경될 때만 기존 `PENDING`을 모두 `CANCELLED`로 바꾸고, 변경 후 Task가 적격하면 새 `PENDING` 하나를 만든다. 제목·설명·난이도·카테고리만 바뀌면 schedule을 건드리지 않는다.
- complete: Task를 `COMPLETED`로 바꾸는 동일 mutation에서 모든 `PENDING`을 `CANCELLED`로 바꾼다.
- remove: `deletedAt`을 기록하는 동일 mutation에서 모든 `PENDING`을 `CANCELLED`로 바꾼다.
- `SENT`/`FAILED` 이력은 보존한다.

Task와 schedule 변경은 Prisma nested write 한 건으로 묶어 중간 상태를 남기지 않는다. 변경 전 `findOne`은 소유권·soft-delete 확인에 사용한다. 동일 Task에 대한 동시 update는 Task 행 갱신과 nested 전이를 함께 수행하고, `PENDING` 전부 취소 후 하나를 재생성하여 잔여 중복을 정리한다. 다만 schema에 `taskId` unique 제약이 없으므로 모든 비정상 중복 가능성을 DB가 구조적으로 차단하지는 못한다. 구현 테스트에는 동시 요청을 흉내 낸 순차 전이를 포함하고, 실제 동시성 통합 검증에서 중복이 확인되면 별도 schema/migration 승인으로 `@@unique([taskId, status])` 같은 단순 제약을 바로 추가하지 말고 상태 이력 요구와 함께 재설계한다.

점수 재계산은 현재와 같이 Task mutation 성공 후 실행하며 호출 횟수·대상 날짜를 보존한다. schedule 동기화 실패 시 Task mutation도 실패하고 recompute를 호출하지 않는다.

## 6. 1~2파일 단위 구현 단계와 allowlist 후보

아래 목록은 구현 승인 후 메인 에이전트가 단계마다 새로 위임할 **후보**이며 현재 쓰기 권한이 아니다.

1. 토큰 DTO 계약
   - `DSM_Back/src/notifications/dto/register-fcm-token.dto.ts`
   - `DSM_Back/src/notifications/dto/revoke-fcm-token.dto.ts`
   - 검증: 허용 platform, 공백/과대 token, deviceId 길이 테스트는 controller pipe/e2e 또는 DTO 정적 계약에 반영.
2. 토큰 서비스 TDD
   - `DSM_Back/src/notifications/notifications.service.spec.ts`
   - `DSM_Back/src/notifications/notifications.service.ts`
   - 검증: create/update/reactivate/ownership transfer, sanitized response, 사용자 한정 멱등 revoke.
3. 토큰 컨트롤러 TDD
   - `DSM_Back/src/notifications/notifications.controller.spec.ts`
   - `DSM_Back/src/notifications/notifications.controller.ts`
   - 검증: JWT userId 위임, PUT 200, DELETE 204, 서비스 호출 인자.
4. Notifications 모듈 연결
   - `DSM_Back/src/notifications/notifications.module.ts`
   - `DSM_Back/src/app.module.ts`
   - 검증: 모듈 compile과 AppModule import.
5. Task schedule 동기화 TDD
   - `DSM_Back/src/tasks/tasks.service.spec.ts`
   - `DSM_Back/src/tasks/tasks.service.ts`
   - 검증: 미래 create 예약, 과거/disabled 제외, startAt 변경 시 cancel+create, disable/status/complete/remove cancel, 비관련 update 무변경, `SENT` 보존, schedule 실패 시 recompute 미호출, 기존 점수 테스트 유지.
6. 최종 회귀 검증(파일 수정 없음)
   - focused Jest: notifications service/controller, tasks service
   - 전체 Jest, type-check/build, lint는 저장소 명령 특성을 확인한 뒤 비자동수정 형태로 실행한다. 현재 `npm run lint`는 `--fix`이므로 그대로 실행하지 않고 승인된 non-fix ESLint 명령을 사용한다.
   - `git diff --check`, 전체 status/diff로 범위 밖 변경과 package/schema/lockfile 무변경 확인.

각 단계는 이전 단계 검증 후 진행하고, allowlist 밖 파일이 필요하면 해당 정확한 경로와 이유를 보고한 뒤 새 승인을 기다린다.

## 7. 테스트·오류·보안 체크

- Prisma unique 충돌은 upsert로 흡수하고 토큰 원문을 예외 메시지·로그에 포함하지 않는다.
- revoke는 타 사용자 토큰과 존재하지 않는 토큰 모두 204로 처리한다.
- 모든 endpoint에 `JwtAuthGuard`를 적용하고 body의 userId는 받지 않는다.
- FCM token/deviceId는 식별자로 취급하여 최소한만 저장·반환한다.
- 고정 `now`로 과거/미래 경계를 결정하는 테스트를 작성한다. `startAt === now`는 예약하지 않는다.
- Task mutation과 schedule nested write의 성공/실패 경계를 테스트하고, 점수 재계산 회귀를 보존한다.
- 12A는 FCM 환경변수·private key를 읽거나 유효성 검사하지 않는다.

## 8. 후속 마일스톤 경계

- **12B Firebase Admin + Cron**: `firebase-admin`, `@nestjs/schedule` 설치와 lockfile 변경, FCM env의 production 필수 검증, Admin 초기화, due schedule 선점, 중복 발송 방지, 재시도/실패 분류, invalid token revoke, `SENT/FAILED` 기록. 패키지 설치·자격증명·외부 발송은 각각 명시 승인 필요.
- **12C 프런트 알림**: Expo/RN 알림 권한, FCM token 획득·PUT, 로그아웃 DELETE, token refresh, 로컬 알림/포그라운드 처리. `DSM_Front/AGENTS.md`와 Expo SDK 55 공식 문서 확인 후 별도 계획·승인.
- **13 WebSocket**: 인증 gateway와 사용자 채널, 포그라운드 알림 및 점수/랭킹 이벤트, 중복 알림 event-id 정책. 12A/12B의 REST·DB 상태와 분리.
- **14 Redis/배치**: 랭킹 캐시, 배치 계산, 자동 snapshot, 다중 인스턴스 Cron lock. 알림의 기본 DB schedule 동기화를 Redis에 의존시키지 않는다.

## 9. 위험과 롤백

- 실제 DB가 schema와 다르면 API 런타임이 실패한다. 구현 전 migration 상태 확인 후 불일치 시 별도 승인으로 중단한다.
- 문자열 status는 오타 위험이 있다. 애플리케이션 상수와 테스트로 제한하며 enum migration은 이번 범위 밖이다.
- `taskId` unique 부재는 비정상 동시성에서 중복 가능성을 남긴다. nested atomic transition과 전체 PENDING 취소로 완화하고 통합 테스트 근거가 생긴 뒤 schema 변경을 판단한다.
- 롤백은 `NotificationsModule` import와 신규 notifications 파일, TasksService의 nested schedule 변경만 되돌리는 코드 롤백이다. schema/package 변경이 없으므로 DB rollback은 없다. 이미 생성된 `PENDING` 행은 임의 삭제하지 않고 기능 비활성화 시 worker가 없으므로 발송되지 않는다.

## 10. 미결정·구현 전 확인 사항

- 실제 DB에 현재 FcmToken/NotificationSchedule 테이블이 적용됐는지 확인.
- FCM token 최대 길이 4096, deviceId 255, platform 값 `ios|android` 확정 여부.
- 실제 로그아웃 한 번에 현재 디바이스만 revoke할지 모든 사용자 디바이스를 revoke할지는 12C UX에서 확정. 12A API는 현재 token 한 개 revoke로 제한.
- Task 생성 최대 20개 제한은 기존 FR-03 잔여 요구지만 12A 범위에 섞지 않는다.

## 11. 구현 승인 체크포인트

사용자가 아래 범위를 명시적으로 승인해야 12A 구현을 시작한다.

- 승인 대상: 6절 1~5단계의 정확한 파일 후보와 6단계 read-only 검증.
- 승인 제외: package/lockfile, env, Prisma schema/migration, Firebase 자격증명·외부 호출, 12B~14 구현.
- 구현 중 승인 대상 밖 변경 필요 시 즉시 중단하고 정확한 추가 파일·명령·이유를 제시한다.

**현재 결론: 12A 상세 계획 완료, 소스 구현 승인 대기.**
