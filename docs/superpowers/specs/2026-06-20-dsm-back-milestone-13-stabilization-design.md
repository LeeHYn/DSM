# DSM Back Milestone 13 Stabilization Design

**목표:** 마일스톤 12 이후 남은 P0 누락 항목과 운영 안정성 리스크를 정리하고, 프론트엔드 본격 연동 전에 `DSM_Back`을 다중 인스턴스와 실사용 흐름에 견딜 수 있는 상태로 만든다.

**범위:** Planing Document v1.3의 FR-03 어뷰징 방지, NFR-02 WebSocket 동기화, NFR-03 서버 성능, NFR-06 확장성을 백엔드 우선으로 보강한다. 회원 탈퇴, 프로필 이미지 스토리지, 알림 방식 세부 설정은 이번 문서에서 추적하되 P1로 분리한다.

## 1. 우선순위 결정

### P0: 마일스톤 13 필수 범위

- 일일 일과 등록 개수 제한 20개를 API 레벨에서 강제한다.
- `NotificationSchedule` 중복 생성과 stale `PROCESSING` 상태를 줄인다.
- Redis 기반 랭킹 캐싱과 Socket.IO Redis adapter를 추가한다.
- `npm audit --omit=dev` 잔여 취약점을 안전하게 재검토하고 대응한다.
- 프론트 연동을 위해 변경된 백엔드 계약과 운영 환경변수를 문서화한다.

### P1: 후속 마일스톤 후보

- 회원 탈퇴 API 및 데이터 보존/삭제 정책.
- 프로필 이미지 업로드와 R2/Supabase Storage 연동.
- 알림 방식 설정(소리, 진동, 무음) 저장 구조.
- Apple Sign In 실제 검증.
- Refresh token 재사용 감지 및 전체 세션 revoke.

## 2. 일일 일과 등록 제한

`TasksService.create()`와 `TasksService.update()`에서 UTC 일자 기준 활성 일과 개수를 확인한다. 기준은 `Task.startAt`이 속한 UTC day이며, `deletedAt=null`인 일과만 카운트한다.

정책:

- 사용자는 하루에 최대 20개의 활성 일과를 가질 수 있다.
- 생성 시 해당 UTC day의 활성 일과가 이미 20개면 `409 Conflict`를 반환한다.
- 수정으로 다른 날짜로 이동할 때는 대상 UTC day의 활성 일과를 확인하되, 수정 중인 자기 자신은 제외한다.
- 소프트 삭제된 일과는 제한 개수에서 제외한다.
- `TaskStatus.CANCELLED`는 삭제가 아니므로 제한 개수에 포함한다.

## 3. NotificationSchedule 안정화

현재 구현은 Serializable transaction으로 중복 가능성을 낮췄지만, DB 레벨 보강은 아직 없다. Prisma schema는 PostgreSQL partial unique index를 직접 표현하지 못하므로 SQL migration으로 보강한다.

정책:

- 같은 `taskId`에 대해 `PENDING` 또는 `PROCESSING` schedule은 하나만 존재할 수 있다.
- `upsertTaskSchedule()`은 중복 인덱스 충돌 시 기존 pending/processing schedule을 재조회해 갱신한다.
- scheduler 시작 시 오래된 `PROCESSING` schedule을 `PENDING`으로 되돌리는 복구 루틴을 실행한다.
- 복구 기준은 `updatedAt < now - NOTIFICATION_PROCESSING_TIMEOUT_SECONDS`이며 기본값은 300초다.
- due batch 크기는 환경변수로 조정 가능하게 하되 기본 50을 유지한다.

## 4. Redis 랭킹 캐싱과 Socket.IO adapter

마일스톤 12의 WebSocket은 단일 NestJS 인스턴스 기준이다. 마일스톤 13에서는 Redis를 선택적 의존성으로 두고, `REDIS_URL`이 있을 때만 Redis adapter와 캐시를 활성화한다.

구성:

- `RedisModule`: Redis client lifecycle, `REDIS_URL` 없을 때 비활성화.
- `RealtimeRedisAdapter`: Socket.IO Redis adapter 연결.
- `RankingsCacheService`: leaderboard cache read/write/invalidate 담당.
- `RankingRealtimeService`: `score.recomputed` 이벤트에서 랭킹 캐시 invalidation 후 최신 payload를 broadcast.

정책:

- Redis 장애는 HTTP API 실패로 전파하지 않는다. 캐시 실패 시 DB live query로 fallback한다.
- 캐시 key는 `rankings:leaderboard:<period>:<limit>` 형식으로 둔다.
- TTL 기본값은 30초(`RANKING_CACHE_TTL_SECONDS`)다.
- 점수 재계산 이벤트 발생 시 DAILY/WEEKLY/TOTAL leaderboard cache를 삭제한다.
- Socket.IO adapter는 `REDIS_URL`이 없으면 기존 in-memory 동작을 유지한다.

## 5. Audit 및 의존성 안정화

마일스톤 12 리뷰 기준 `multer`와 `uuid` 계열 취약점이 남아 있다. `npm audit fix --force`는 Nest/Firebase 계열 breaking 변경을 제안하므로 강제 적용하지 않는다.

절차:

- `npm audit --omit=dev --json`으로 실제 경로를 다시 확인한다.
- 현재 registry에서 안전한 상위 버전이 존재하면 최소 범위 업데이트 또는 `overrides`로 해결한다.
- 안전한 해결책이 없으면 `docs/reviews`에 accepted risk와 추적 조건을 남긴다.
- 강제 downgrade 또는 major downgrade는 이번 마일스톤에서 금지한다.

## 6. 운영 문서화

마일스톤 13에서 새로 필요한 환경변수와 백엔드 계약을 문서화한다.

- `.env.example`: `REDIS_URL`, `RANKING_CACHE_TTL_SECONDS`, `NOTIFICATION_PROCESSING_TIMEOUT_SECONDS`, `NOTIFICATION_DUE_BATCH_SIZE`, `WS_CORS_ORIGINS`.
- `docs/api/DSM_Back_API_v0.md`: REST API 요약, WebSocket 이벤트명, auth header/handshake 방식.
- `docs/reviews/2026-06-20-dsm-back-milestone-13-review.md`: 검증 결과와 남은 리스크.

## 7. 검증 전략

- TDD 순서로 unit test를 먼저 추가한다.
- 핵심 명령:
  - `npm test -- tasks.service --runInBand`
  - `npm test -- notifications --runInBand`
  - `npm test -- rankings --runInBand`
  - `npm test -- realtime --runInBand`
  - `npm run prisma:validate`
  - `npm test -- --runInBand`
  - `npm run build`
  - `npm run lint`
  - `npm run test:e2e`
- audit 대응은 `npm audit --omit=dev` 결과를 리뷰 문서에 남긴다.

## 8. 완료 기준

- 하루 활성 일과 20개 제한이 생성/날짜 이동 수정 모두에서 동작한다.
- NotificationSchedule 중복 생성 방지가 DB 레벨과 서비스 레벨 모두에서 검증된다.
- stale `PROCESSING` schedule 복구가 테스트로 보강된다.
- `REDIS_URL`이 없을 때 기존 동작이 깨지지 않고, 있을 때 Redis cache/adapter가 활성화된다.
- audit 잔여 항목은 해결되었거나 명확한 accepted risk로 문서화된다.
- API/WebSocket/환경변수 문서가 프론트엔드 작업자가 바로 사용할 수 있는 수준으로 정리된다.
