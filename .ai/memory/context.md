# DSM 현재 맥락 — 2026-09-08

## Checkout·책임 경계

- 조정 checkout은 `C:\DEV`의 `main`, 제품·감사 checkout은 `C:\dsm-integration-review`의 `codex/integration-main-review`다.
- F-069 제품·감사 checkpoint는 `c3205dfa2e5e04524513ef8e11beba737af074e0`이며 원격 upstream과 같다. 압축 memory가 이 기준을 후속 기록한다.
- 제품 범위는 Android 전용 DSM v1.3이다. Backend는 NestJS·Prisma 6·PostgreSQL, 클라이언트는 React Native Community CLI 기반 Android다.
- Canonical audit는 `.ai/audits/20260817-release-audit-full-project/findings.jsonl`이다. Root 완료와 release-ready 판정은 구분한다.

## Canonical audit 상태

- F-001~F-083, 83건: `68 CONFIRMED / 2 FIXING / 1 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`.
- Ledger는 325,286 bytes, SHA-256 `F47A9F4927425D5B3D9F6BDF2651936485A6C36724B89E73E5A265ABB52A6C63`이다. UTF-8/LF, schema, 연속 ID, fingerprint·basis hash 고유성, status history 검증이 통과했다.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083. `UNKNOWN`: F-003, F-013, F-017. `REFUTED`: F-066. `FIXING`: F-067, F-068. `FIXED`: F-069.
- F-069은 구현자 자체 검증을 마친 `FIXED`이며 독립 fix-recheck 전에는 `RECHECKED`로 올리지 않는다.

## 구현 결정

- F-005는 Home·Ranking·MyPage·TaskSheets를 authenticated REST와 user/epoch scoped ProductStore에 연결했다. Prototype context는 theme·toast UI 상태만 담당한다.
- F-083은 UUIDv4 `clientMutationId`를 Task PK로 사용한다. 동일 owner·payload replay는 중복 side effect 없이 반환하고 mismatch·foreign·deleted 정보는 409로 노출하지 않는다. Front는 ambiguous transport 오류에만 동일 ID를 보존한다.
- F-067은 `DELETE /auth/me` 204, User row lock, blocking NotificationDelivery 선삭제와 User cascade를 구현했다. Android session 삭제는 single-flight·epoch fence를 사용하고 서버 성공 뒤 Keychain과 ProductStore를 정리한다.
- F-068은 login·MyPage에 HTTPS privacy link와 내부 계정 삭제 안내를 제공한다. Release는 URL 누락, HTTP, credential, `.invalid` host를 거부한다.
- F-069은 DAILY·WEEKLY·TOTAL 전체 사용자 score, competition rank, total count를 한 번의 parameterized PostgreSQL window query로 계산한다. UTC 경계를 사용하고 0점 사용자도 포함한다.
- 1분 Cron과 bootstrap warm은 local in-flight coalescing, Redis owner lock, active-generation freshness gate를 사용한다. Cache miss는 한 번의 projection 시도 뒤 bounded legacy DB 계산으로 fallback한다.
- Redis publication은 immutable generation의 user hash·leaderboard list·completion marker·active pointer 구조다. Chunk data와 TTL은 transaction으로 함께 기록하며 owner-fenced Lua가 active pointer를 교체한다. 직전 generation은 진행 중 reader를 위해 30초만 유지한다.
- 운영 환경은 유효한 `redis://` 또는 `rediss://` `REDIS_URL`을 fail-closed로 요구한다. Local compose는 loopback Redis 8 healthcheck를 사용하며 Backend 의존성은 exact `@redis/client` 6.2.1이다.

## F-069 검증 증거

- Backend unit 25 suites/293 tests, e2e 2 tests, build, full TypeScript check, non-fixing ESLint, Prisma validate, `npm ls @redis/client --depth=0`, clean-install dry-run이 통과했다.
- Disposable PostgreSQL 17·Redis 8 통합 2/2에서 migration 6개, DB 차단 후 cache-only API, tie rank, owner lock, stale-writer 차단, 현재 9개 generation key TTL과 rollover 후 retired 9개 key의 30초 이하 TTL을 확인했다.
- 합성 benchmark artifact는 `.ai/audits/20260817-release-audit-full-project/f069-synthetic-performance.json`, 36,011 bytes, SHA-256 `B5931E479E8842766AD79FED2AEB373792B012975AB5026408227FBE6767D7DE`다.
- Single-host 50,000 users·350,000 DailyScore·10 cold samples에서 p99/max는 DAILY 927.706ms, WEEKLY 1,674.051ms, TOTAL 994.351ms였다. 3개 기간 cold 전체는 2,878.647ms였다.
- Concurrency 25·1,000 cache reads에서 TOP100 p99 22.023ms·1,530/s, personal p99 4.628ms·7,153/s였다.
- 세 기간 active generation은 약 51.4MB였고 rollover 직후 약 101.0MB, 31초 뒤 9 generation key·약 51.6MB로 복귀했다.
- 기본 PostgreSQL 설정의 EXPLAIN execution은 DAILY 163.706ms, WEEKLY 361.239ms, TOTAL 79.605ms였고 temp block read 1,121~1,160이 관찰됐다. 이 수치는 production SLO 증거가 아니다.
- Disposable container와 임시 결과는 제거했고 Docker Desktop은 원래의 정지 상태로 복구했다.

## 잔여 위험·외부 gate

- F-069은 실제 운영 cardinality, Redis capacity, query plan, managed failover와 p50/p95/p99가 미측정이다. Cache miss가 projection 후에도 남으면 legacy DB fallback이 부하를 만들 수 있다. WebSocket delta는 F-074 범위다.
- F-067/F-068 공개 privacy/deletion URL과 외부 삭제 절차가 없고 Google Play 앱 이름·내부 삭제 경로·Data safety 증거를 최종 대조하지 않았다.
- 실제 upload/Play signer, production OAuth, signed-device cold start·link open, readiness mapping과 운영 DB·Firebase 증거가 미완료다.
- 다음 URL 독립 작업은 F-065 Android API 24~29 task-affinity 진단·수정이다. 구현 전에 finding, manifest, activity/navigation, 공식 Android 보안 근거를 다시 대조한다.

## 안전·복구 규칙

- `C:\DEV\DSM_Back\.env`, 실제 `.env`, key·keystore와 private Gradle property는 읽기·수정·stage하지 않는다.
- Prisma schema·migration, Front·Android·WebSocket은 F-069 변경에 포함하지 않았다.
- `*.original.md`, `*.failed-*`는 historical recovery이며 active 입력이 아니다. 명시적 복구 승인 없이는 읽기·수정·삭제·stage하지 않는다.
- 제품·memory·audit 수정은 `apply_patch`로 수행하고 `git add -A` 없이 exact path만 stage한다.
