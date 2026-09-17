# F-014 production migration gate — 2026-09-11

- Audit: `20260817-release-audit-full-project`, targeted Round 16, P2 운영 schema 적용 경계. 자유 탐색 round가 아니다.
- 승인: 사용자 `작업 리스트를 띄워서 다음 작업 진행해`가 직전 F-014 제안을 계속하도록 지시했다. 기준 main@6e7988c; 이전 memory 압축 미커밋 변경은 보존했다.
- 변경: `DSM_Back/package.json`, `DSM_Back/test/production-start.test.cjs`, `DSM_Back/README.md`. API·schema·migration SQL·lockfile·dependency version·Front 변경 없음.
- 판정: 두 독립 reviewer의 RECHECKED를 반영해 F-014 RECHECKED. 실제 운영 환경은 없으며 배포 완료 판정이 아니다.

## 원인과 수정

기존 production 명령은 `node dist/main`으로 바로 시작하며 migration은 개발용 script만 있었다. 신규/이전 schema DB에서 문서의 production 절차만 실행하면 앱이 schema 불일치 상태로 요청을 받을 수 있었다.

`prisma:migrate:deploy`에 `prisma migrate deploy`를 추가하고 `start:prod`를 `npm run prisma:migrate:deploy && node dist/main`으로 변경했다. Migration의 성공 종료가 서버 실행의 선행 조건이며 npm prestart hook에 의존하지 않아 `--ignore-scripts`에도 gate가 남는다. 개발 명령은 그대로다.

현재 배포 플랫폼이 없으므로 cloud workflow를 가정하지 않았다. README는 동일 revision artifact, Prisma CLI를 포함한 `npm ci --include=dev`, 직렬 rollout, migration job의 성공 후 새 인스턴스 시작 계약과 runtime DDL 권한/재시작 의존을 명시한다. [Prisma 6 production workflow](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)와 [CLI dependency 배포 안내](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)를 확인했다. 웹 open은 Markdown content-type 오류였으며 공식 검색 결과에서 production deploy·CI/CD·CLI devDependency 요구를 확인했다.

## 검증

### npm 실행 회귀

`node --test DSM_Back/test/production-start.test.cjs`는 실제 package scripts를 임시 fixture로 복사해 실제 npm child process로 실행한다. 외부 Prisma process와 장시간 서버만 기록용 fixture 실행 파일로 대체하며 실제 env/DB를 읽지 않는다.

- 기존 코드: 3개 모두 실패. Migration 호출 없이 app만 시작했고 실패 설정과 ignore-scripts에서도 exit 0이었다.
- 수정 후: 3/3 통과. 성공 시 migrate/deploy→app 순서, migration exit42 시 nonzero/app 미시작, ignore-scripts에도 실패 차단을 확인했다.
- 임시 디렉터리는 OS temp 바로 아래의 task prefix/절대 경로를 확인하고 제거한다.

### 실제 PostgreSQL/Prisma

Windows Node22.23.2/npm10.9.8/Prisma6.19.3, Docker engine29.7.2의 PostgreSQL17을 사용했다. Task container `dsm-production-gate-pg-20260911`, label `dsm.production-gate=20260911`, loopback55346, 합성 credential/DB만 사용했다.

Repository의 실제 migration 8개와 Prisma CLI를 복사한 schema 위치에서 실행했다. `.env`를 복사하지 않았고 별도 fixture DATABASE_URL을 주입했다. 서버 위치의 sentinel은 실제 Prisma Client로 적용 완료 migration 수와 User 수를 조회한 뒤 기록하고 종료한다. 실제 Nest HTTP 서버/production readiness 검증은 아니다.

Sentinel marker는 DB 조회 뒤 생성되므로 marker 부재 하나만으로 프로세스 미진입을 증명하지 않는다. 실패 시 시작 차단 판정은 실제 CLI nonzero, shell `&&` 순서와 진입 즉시 기록하는 npm 회귀 fixture를 함께 근거로 삼는다.

| 관찰 | 종료 코드 | 서버 sentinel | 시간 ms |
|---|---:|---|---:|
| Empty DB → 8개 적용 | 0 | migration8/User0 | 2132 |
| 동일 DB 재실행 | 0 | migration8/User0, migration ID/checksum 동일 | 1922 |
| Legacy prefix6 준비(migration만 실행) | 0 | 실행 대상 아님 | 1551 |
| Prefix6 → 현재8 업그레이드 | 0 | migration8/User1, 기존 합성 User 보존 | 1995 |
| 의도적 잘못된 SQL | 1/P3018 | 미시작 | 1966 |
| 미복구 실패 migration 재시도 | 1/P3009 | 미시작 | 1889 |
| 컨테이너 정지 확인 후 실행 | 1/schema-engine error | 미시작 | 3750 |

최종 7관찰 PASS. 시간은 이 단일 로컬 실행 관찰치이며 운영 성능 기준이 아니다. 두 번의 lab 실행 모두 label 확인 후 컨테이너·익명 volume·임시 fixture를 정리했다.

### Backend·정적 검사

- Unit 328/328, 27 suites 통과. 기존 cache-unavailable warning은 fallback 테스트 로그다.
- Nest build, source/spec TypeScript no-emit, 전체 TypeScript non-fixing ESLint 통과.
- Changed package/CJS Prettier 확인 통과. 제품 API/서비스가 바뀌지 않아 Front/Android·HTTP E2E는 재실행하지 않았다.
- Raw evidence: `.local/logs/production-gate-red.log`, `production-gate-green.log`, `production-gate-static.log`, `production-gate-db.log`; 최종 `.local/production-gate-results.json`. DB log는 최초 실패와 전체 재실행을 append로 보존했다.

## 시행착오·환경 복구

- Static helper가 cwd를 바꿔 상대 Tee 경로가 잘못 해석된 첫 실행을 절대 로그 경로로 정정했다. Unit/build/type/lint 이후 CJS Prettier 실패를 수정하고 formatting·3개 process tests를 재검증했다.
- Jest 상대 cache가 `DSM_Back/.local/jest-production-gate`에 생성됐다. Task cache의 root `.local` 이동·빈 부모 삭제는 자동 승인 검토에서 정책상 차단돼 실행하지 않았다(구체적 사유 미제공). 캐시는 untracked 실행 산출물로 남겼고 helper의 다음 실행 경로만 절대로 정정했다. 제품 변경/stage 대상이 아니다.
- 최초 lab의 DB 중단에서 nonzero/app 미시작은 맞았지만 helper가 P1001만 기대해 실패했다. 실제 Prisma CLI는 일반 schema-engine error를 반환했다. 컨테이너 정지 상태와 실패 종료/app 미시작 계약으로 검증하고 전체 lab을 다시 실행했다. 제품 수정으로 오류를 숨긴 것이 아니다.
- Docker engine은 시작 시 정지 상태였다. 공식 CLI/direct launch는 엔진이 열리지 않았으며 Computer Use로 탐색기의 공식 per-user Docker Desktop을 실행한 뒤29.7.2 연결을 확인했다. 소켓·설정·dev DB/volume 삭제는 하지 않았다. 첫 UI API 이름 오류와 비활성 주소 입력을 관찰 갱신·Ctrl+L로 정정했다.
- 종료 관찰: dev DB/Redis는127.0.0.1:5432/6379에서 healthy이며 Docker를 개발에 사용 가능한 상태로 유지했다. Task55346과 Backend3000 listener는 없다. 기존 dev container/volume은 변경하지 않았다.

## 잔여 조건

실제 production/CI 연결, Linux shell npm 실행, 동시 replica의 advisory lock 경합, cloud rollout/rollback·HTTP readiness, schema drift와 legacy backfill/CHECK VALIDATE는 미검증이다. Migrate deploy는 drift 탐지나 데이터 정책을 대체하지 않는다. CLI가 없는 artifact는 시작에 실패하고 재시작에도 migration DB 접근 권한이 필요하다. 기존 서버가 동작하는 환경에서는 별도 호환성·backup/복구·직렬 rollout 정책이 필요하다.

F-003/F-013/F-017/F-065 UNKNOWN과 F-067/F-068 FIXING, 나머지 finding의 운영 gate는 그대로다. 전체 release-ready 판정은 하지 않는다.

## 독립 검토·CCTV

- Reviewer `/root/production_gate_review_a`, `/root/production_gate_review_b`: 각각 RECHECKED, 신규 P0/P1 발견 없음. 두 검토자는 다른 reviewer 판정을 열람하지 않고 scoped diff·현재 로그·helper를 읽기 전용으로 확인했다. B가 명시한 sentinel marker 한계를 위 검증 설명에 반영했다. 추가 테스트/DB 실행은 하지 않았다.
- 수정·추가 파일: 제품/문서3개, memory5개, canonical 원장/README와 이 보고서. Ignored 도우미·로그는 plan의 정확한 경로만 사용했다.
- 원장에는 F-014의 승인·FIXING→FIXED→RECHECKING→RECHECKED 이력·검증·위험만 추가했다. 나머지84행·fingerprint·기존 이력은 보존했다. 최종85행은57 CONFIRMED/2 FIXING/1 REFUTED/21 RECHECKED/4 UNKNOWN이다. Memory·해시 동기화와 최종 schema/이력/범위/링크/UTF-8 검증 PASS. 기존 ER65개 본문을 보존하고 신규1개를 추가했다. 정리 차단된 Jest cache154파일은 untracked 실행 산출물이다. Git commit/push는 하지 않았다.
- 셀프 체크: 새 dependency/기능/DDL 없음, 실제 secret 접근 없음, 실패 증거 보존. 남은 운영 조건은 위 목록을 따른다.
