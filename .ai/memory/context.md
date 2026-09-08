# DSM 현재 맥락 — 2026-09-09

## Checkout·책임 경계

- 조정 checkout은 `C:\DEV`의 `main`, 제품·감사 checkout은 `C:\dsm-integration-review`의 `codex/integration-main-review`다.
- F-001/F-002 제품·감사 checkpoint `a323dcad531e971ad792e8e9a20a47de29ab8c41`까지 원격 upstream에 있다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- 제품 범위는 Android 전용 DSM v1.3이다. Backend는 NestJS·Prisma 6·PostgreSQL, 클라이언트는 React Native Community CLI 기반 Android다.
- Canonical audit는 `.ai/audits/20260817-release-audit-full-project/findings.jsonl`이다. Root 완료와 release-ready 판정은 구분한다.

## Canonical audit 상태

- F-001~F-083, 83건: `62 CONFIRMED / 2 FIXING / 7 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`.
- Ledger는 342,548 bytes, SHA-256 `0292C684E7B29B3090C5382A86C4FC5C851D504F4B516E0C7875263FFEBF4E26`이다. UTF-8/LF, schema, 연속 ID, fingerprint 고유성·basis hash와 status history 검증이 통과했다.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083. `UNKNOWN`: F-003, F-013, F-017. `REFUTED`: F-066. `FIXING`: F-067, F-068. `FIXED`: F-001, F-002, F-011, F-029, F-030, F-065, F-069.
- 일곱 `FIXED` 항목은 구현자 자체 검증을 마쳤으며 독립 fix-recheck 전에는 `RECHECKED`로 올리지 않는다.

## 구현 결정

- F-005는 Home·Ranking·MyPage·TaskSheets를 authenticated REST와 user/epoch scoped ProductStore에 연결했다. Prototype context는 theme·toast UI 상태만 담당한다.
- F-083은 UUIDv4 `clientMutationId`를 Task PK로 사용한다. 동일 owner·payload replay는 중복 side effect 없이 반환하고 mismatch·foreign·deleted 정보는 409로 노출하지 않는다. Front는 ambiguous transport 오류에만 동일 ID를 보존한다.
- F-067은 `DELETE /auth/me` 204, User row lock, blocking NotificationDelivery 선삭제와 User cascade를 구현했다. Android session 삭제는 single-flight·epoch fence를 사용하고 서버 성공 뒤 Keychain과 ProductStore를 정리한다.
- F-068은 login·MyPage에 HTTPS privacy link와 내부 계정 삭제 안내를 제공한다. Release는 URL 누락, HTTP, credential, `.invalid` host를 거부한다.
- F-001/F-002는 access JWT에 refresh-family `sid`를 넣고 공용 REST guard가 unrevoked·unexpired family row를 요구한다. Logout은 access JWT 없이 refresh token으로 해당 family를 잠가 폐기한다. Android는 서버 성공 전 local token을 보존하고 실패를 retryable 상태로 노출한다.
- F-065는 API 24 지원과 exported `singleTask` launcher를 유지하면서 MainActivity에 `android:taskAffinity=""`와 `android:allowTaskReparenting="false"`를 선언했다. Package namespace affinity 상속이라는 finding 조건을 제거한다.
- F-069은 DAILY·WEEKLY·TOTAL 전체 사용자 score, competition rank, total count를 한 번의 parameterized PostgreSQL window query로 계산한다. UTC 경계를 사용하고 0점 사용자도 포함한다.
- F-011/F-029는 Redis 비구성·최종 miss에서도 같은 window query에 parameterized LIMIT을 붙여 사용한다. 반환 API는 내부 projection metadata를 제거하고 tie rank·userId 안정 정렬·전체 사용자 0점 모집단을 cache와 동일하게 유지한다.
- F-030은 요청 시작의 단일 `Date` reference를 cache I/O, projection refresh와 개인 ranking DB 조회 전체에 전달한다.
- 1분 Cron과 bootstrap warm은 local in-flight coalescing, Redis owner lock, active-generation freshness gate를 사용한다. Cache miss는 한 번의 projection 시도 뒤 bounded window-query DB 계산으로 fallback한다.
- Redis publication은 immutable generation의 user hash·leaderboard list·completion marker·active pointer 구조다. Chunk data와 TTL은 transaction으로 함께 기록하며 owner-fenced Lua가 active pointer를 교체한다. 직전 generation은 진행 중 reader를 위해 30초만 유지한다.
- 운영 환경은 유효한 `redis://` 또는 `rediss://` `REDIS_URL`을 fail-closed로 요구한다. Local compose는 loopback Redis 8 healthcheck를 사용하며 Backend 의존성은 exact `@redis/client` 6.2.1이다.

## F-069 검증 증거

- Backend unit 25 suites/293 tests, e2e 2, build, type/lint, Prisma·dependency 검증과 PostgreSQL 17·Redis 8 통합 2/2가 통과했다. 통합은 migration 6개, cache-only API, tie, lock·stale-writer와 current/retired TTL을 확인했다.
- Benchmark artifact는 36,011 bytes, SHA-256 `B5931E479E8842766AD79FED2AEB373792B012975AB5026408227FBE6767D7DE`다. 50,000 users·350,000 scores·10 cold samples의 projection p99/max는 DAILY 927.706ms, WEEKLY 1,674.051ms, TOTAL 994.351ms였고 concurrency 25 cache p99는 TOP100 22.023ms, personal 4.628ms였다.
- Active generation은 약 51.4MB, rollover 직후 약 101.0MB, 31초 뒤 약 51.6MB였다. 기본 PostgreSQL plan은 temp block 1,121~1,160을 사용했으며 production SLO 증거가 아니다.
- Disposable service와 임시 결과를 제거하고 Docker Desktop을 원래의 정지 상태로 복구했다.

## F-001/F-002 검증 증거

- Backend auth 3 suites/32와 전체 26 suites/304, e2e 2, build, source/spec typecheck, full lint, changed-file Prettier와 Prisma validation이 통과했다. Front logout 4 suites/60과 전체 24 suites/229, typecheck, lint 0 errors/30 existing warnings가 통과했다.
- PostgreSQL 17.10 통합 1/1에서 rotation predecessor로 headerless logout한 뒤 같은 family의 access·refresh가 401이고 다른 family는 200임을 확인했다. Android assembleDebug·lintDebug는 456 tasks로 성공했다.
- Exact container를 제거하고 Docker Desktop을 원래의 정지 상태로 복구했다. Prisma schema·migration과 dependency는 변경하지 않았다.

## F-065 검증 증거

- Merged·packaged manifest가 빈 affinity와 reparenting 비활성화를 유지했고 `assembleDebug` 281 tasks와 `lintDebug` 412 tasks가 통과했다.
- API 36 emulator cold launch는 4.391초였다. `dumpsys`는 `taskAffinity=null`, MainActivity 1개와 launcher·recents의 동일 task 재사용을 확인했다. 앱·emulator·ADB는 정리했다.

## F-011/F-029/F-030 검증 증거

- Focused 2 suites/22, Backend full 25 suites/297, e2e 2, build, source/spec typecheck와 full lint가 통과했다. LIMIT binding·population 검증·fallback 위임·UTC rollover를 포함한다.
- PostgreSQL 17·Redis 8 migration 6개와 통합 2/2에서 fallback TOTAL `1,2,2`, DAILY inactive `0점/3위`, WEEKLY `1,1,3`을 확인했다. Exact container와 Docker를 정리했으며 schema·dependency·API shape·Front·Android는 변경하지 않았다.

## 잔여 위험·외부 gate

- F-069은 실제 운영 cardinality, Redis capacity, query plan, managed failover와 p50/p95/p99가 미측정이다. Cache miss가 projection 후에도 남으면 bounded window-query fallback이 DB sort 부하를 만들 수 있다. WebSocket delta는 F-074 범위다.
- F-065 app-side 설정은 공식 Android 문서상 구형 OS의 모든 StrandHogg 변형에 대한 완전한 보장이 아니다. API 24~29 malicious-app PoC, OEM patch matrix와 독립 fix-recheck가 남았다.
- F-067/F-068 공개 privacy/deletion URL과 외부 삭제 절차가 없고 Google Play 앱 이름·내부 삭제 경로·Data safety 증거를 최종 대조하지 않았다.
- F-001/F-002는 offline에서 명시적 logout을 완료할 수 없고 보호 REST 요청마다 indexed family 조회가 추가된다. Commit 전 승인된 in-flight 요청, production latency·availability와 독립 fix-recheck가 남았다.
- 실제 upload/Play signer, production OAuth, signed-device cold start·link open, readiness mapping과 운영 DB·Firebase 증거가 미완료다.
- 현재 CONFIRMED P1은 0건이다. 다음 로컬 P2는 F-007/F-008/F-009 Task date·status·시간 순서 무결성 묶음이다.

## 안전·복구 규칙

- `C:\DEV\DSM_Back\.env`, 실제 `.env`, key·keystore와 private Gradle property는 읽기·수정·stage하지 않는다.
- Prisma schema·migration, Front·Android·WebSocket은 F-069 변경에 포함하지 않았다.
- `*.original.md`, `*.failed-*`는 historical recovery이며 active 입력이 아니다. 명시적 복구 승인 없이는 읽기·수정·삭제·stage하지 않는다.
- 제품·memory·audit 수정은 `apply_patch`로 수행하고 `git add -A` 없이 exact path만 stage한다.
