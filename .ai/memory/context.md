# DSM 현재 맥락 — 2026-09-24

## 현재 대조와 증거 경계

- PUB-20260924: 리뷰·수정·memory 변경30파일을 `8e03d93b1cc4022506ceaaf7d9ac8825661c5931`로 commit하고 origin/main에 push했다. 시작 SHA는 `efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`; push 후 직접 ls-remote가 작업 commit과 일치하고 ahead/behind0/0·clean을 확인했다. 현재 문서는 그 사실을 기록하는 후속 checkpoint다. 최종 HEAD는 Git으로 확인한다.
- 게시 검사: 독립 reviewer가 staged30경로/추가1,557줄과 보고서·기존 로그를 확인했고 기밀/로컬 산출물 포함 또는 범위 불일치를 찾지 못했다. 문서12개 UTF-8/LF·링크294·memory hash4·원장92+7+2·staged/worktree byte 일치30건을 현재 확인했다. 아래 FIX 테스트는9월22일 증거이며 이번 게시에서 재실행하지 않았다. F-101/외부8건은 유지한다.

- 최신 FIX-20260922: 사용자 로컬 수정 지시로 F-093~F-100 **8건 수정·독립 RECHECKED**, F-101 **CONFIRMED 유지**. [수정 기록](../audits/20260922-change-gate-review-fixes/README.md). HEAD/기존 리뷰 보고서/canonical92를 보존했고 commit·외부 배포는 수행하지 않았다.

- MEM-20260920 시작 시 `D:\DSM`의 `main`은 clean, HEAD와 로컬 remote-tracking `origin/main`은 `efd7705`였다. 후속 REVIEW-20260920은 그 memory 정리 5파일 변경을 보존했다. 원격 서버 fetch/조회는 수행하지 않았다.
- `27ebca3`은 제품·감사·배포 준비, 후속 `efd7705`는 게시 checkpoint 문서 커밋이다. 이후 현재 dirty/SHA는 Git으로 확인한다.
- REVIEW-20260920은 현재 소스·원장·설정과 unit/HTTP/타입/lint·메모리 probe를 검증했다. 제품 코드·테스트·설정은 수정하지 않았고 기기/실DB/배포를 실행하지 않았다.
- REVIEW-20260922 시작 HEAD도 `efd7705`, 제품 diff 없음. 기존 memory5파일·20260920 리뷰3파일 변경을 보존하고 전체 소스를 재리뷰했다. 당시 새 [보고서](../codeReview/2026-09-22-full-source-review.md)·[보충 원장](../audits/20260922-release-audit-source-review/findings.jsonl)은 F-100/101 **신규 P2 2건 / 당시 CONFIRMED / 미수정**으로 기록했다. 후속 F-100 수정 상태는 위 최신 항목을 따른다. Google 인증서 fetch deadline과 일반 API의 장문 제목/앱 완료 전환 계약 불일치이며 각2명 독립 반박 검증했다.
- [감사 원장](../audits/20260817-release-audit-full-project/findings.jsonl) 92건: **RECHECKED 83 / UNKNOWN 5 / FIXING 3 / REFUTED 1**. [schema](../audits/finding.schema.json).
- 미종결 8건의 상태·필요 증거는 [checklist](./checklist.md). F-066은 Android-only 계약과 충돌해 REFUTED다. RECHECKED는 기록된 조건 안에서의 종결이며 전체 release-ready를 뜻하지 않는다.
- 이전 리뷰의 [보충 원장](../audits/20260920-release-audit-code-review/findings.jsonl)의 F-093~F-099는 **당시 P2 7건 / CONFIRMED / 미수정**이었고 후속 수정으로 모두 RECHECKED다. 세션5xx·알림 처리율·순위 읽기·E2E adapter·setup 보존·null PATCH·알림 시계 복구 문제이며 [이전 보고서](../codeReview/2026-09-20-full-code-review.md)의 조건을 유지한다. 9월22일 리뷰의 source/probe 확인 이후 fix/recheck 이력을 별도로 추가했고 원 발견 검증은 보존했다. canonical92·보충7·이번2를 구분하며 리뷰9건 중 현재 미수정은 F-101 하나다.
- 원래 CONFIRMED55 중 로컬 처리 가능 54개 분야의 구현·회귀·독립 검토가 완료된 기록이 있다. 과거 85/57/55건 snapshot을 현재 집계로 사용하지 않는다.

## 제품 계약과 진입점

- DSM v1.3 Android-only: React 19.2.0 / React Native 0.83.10 Community CLI, NestJS 11 / Prisma 6.19.3 / PostgreSQL 17 / Redis.
- Android: package/namespace `com.dsm.dailyup`, 표시 이름 DailyUp, minSdk24·compile/targetSdk36. Expo·웹 prototype·learning-site는 과거 자료다.
- Front `DSM_Front/src/features/auth`는 session/epoch와 provider, `src/lib`는 API/동기화 등 기반 코드, `src/app`은 화면 진입점이다. Backend `DSM_Back/src`는 auth/tasks/scores/rankings/notifications 등 feature module, `prisma`는 DB 계약·migration이다.
- Auth는 JWT `sid`·활성 refresh family·user/epoch fence·server logout commit을 사용한다. Task/offline은 authenticated owner scope·idempotency·logical clock/server time·durable outbox로 경쟁을 방어한다.
- 알림은 Android native expiry receiver·ticket/scope cancel·client lifecycle·Firebase retry·realtime/WebSocket owner fence를 사용한다. Ranking은 PostgreSQL window projection·Redis immutable generation/fencing·completeness 검사·bounded fallback을 사용한다.
- UI는 calendar/statistics/profile/notification/offline/task sheet 접근성을 포함한다. 계정 삭제는 DB cascade transaction과 Android session/Keychain/store fence·2단계 UI다.
- Docker는 non-root·migration-before-start, liveness `/health`, PostgreSQL `SELECT 1` 기반 readiness `/health/ready`. Redis만의 장애는 readiness 실패 조건이 아니며 DB fallback·캐시 복구를 별도로 검증한다. [render.yaml](../../render.yaml)은 Singapore free Docker 서비스, `DSM_Back` context, production mode, FCM dispatch=false, 생성 JWT secret과 Dashboard-only DB/Redis/Google OAuth 입력을 선언한다.
- 배포 구성·owner 경계·실행 순서는 [plan](./plan.md). 공개 배포나 외부 gate 완료를 입증하는 새 증거는 이번 작업에 없다.

## 현재 검증 — FIX-20260922

- Backend no-cache **43 suites/970 tests**, Front no-cache **51 suites/1,175 tests**, 제외 없는 **HTTP E2E8 suites/176 tests**, production-start3/3, 양쪽 no-emit typecheck 통과. Backend non-fixing lint 통과, Front error0/기존 warning44.
- setup 고유 temp fixture에서 기존6파일2회 byte 보존·누락 생성·한국어 heading 통과. PowerShell5용 setup의 UTF-8 BOM 최종 delta를 root와 독립 reviewer가 재실행했다.
- 각 finding 수정 전 RED→수정 후 GREEN과 구현자 분리 fix-recheck 완료. dispatcher는 tick당100 schedule·20초 신규 claim 시작 예산, ranking은 관련 읽기 RepeatableRead, auth certificate fetch는5초 실제 AbortSignal·retry0이다. 이 수치는 운영 처리량/SLO 증거가 아니다.
- 실DB/Redis·기기/provider/Google/FCM·symlink 성공·build/Docker·신규 advisory 미실행. 로그·명령·개별 한계는 [수정 기록](../audits/20260922-change-gate-review-fixes/README.md).
- F-101은 REST legacy 장문 값과 sync 전체replace/title200/description4000/16KiB 계약 충돌이다. 상태 전용 sync 확장의 계약 결정·구버전/outbox 호환 검증이 필요하며 임의 데이터 수정·한도 제거는 하지 않았다.

## 같은 날 수정 전 검증 — REVIEW-20260922

- Backend no-cache **43 suites/960 tests**, Front no-cache **51 suites/1,156 tests**, production-start3/3와 양쪽 no-emit typecheck 통과. Backend package TS glob non-fixing ESLint 통과, Front error0/warning44. 과거 learning 도구의 독립 paths/runtime/syntax/render/symbols20통과; 고정 corpus 전체suite 미실행.
- **기본 HTTP E2E exit1**: AppModule test의 custom WebSocket adapter 누락(F-096). 해당 harness 제외 원인 분리 실행만7 suites/165 tests 통과. 전체 E2E 통과가 아니다.
- 실제 클래스/pipe·메모리 의존성으로 F-093/095/098/099/100/101 조건을 재현했다. F-094 처리량 probe는9월20일 증거이며 이번에는 소스만 대조했다. setup 파괴적 실행 없음. R5/R6 별도 신규0이나 release-audit는 열려 있다.
- build·strict warning budget·실DB/Redis·Docker·실기기·provider/FCM·새 dependency audit는 미실행이다. 이번 실행·독립 판정·로그는 [현재 감사 기록](../audits/20260922-release-audit-source-review/README.md), 이전 실행은 [9월20일 감사](../audits/20260920-release-audit-code-review/README.md).

## 이전 로컬 증거 — 이번 재실행 아님

- 2026-09-17 Backend build·secret 검사 기록은 과거 결과다. 테스트 placeholder 외 실제 credential을 찾지 못했다는 당시 결과를 현재 재검사로 표현하지 않는다.
- 이전 로컬 실행: API24 debug APK의 taskAffinity=null·알림 display/expiry/replacement/ticket·scope cancel·process-kill receiver, API36 AVD/TalkBack16의 sheet heading·배경 격리·Back·opener focus 복원(F-047 RECHECKED).
- 격리 PostgreSQL17/Redis/Linux Docker: 9 migrations, uid1000, migration→start, readiness 200→DB stop503→복구200, migration 실패 exit1.
- 단일 호스트 합성 benchmark는 50,000 users/350,000 scores. 과거 dependency audit는 Backend high3, Front moderate12/high0. 현재 취약점 수·production SLO·managed failover·다중 인스턴스 증거가 아니다.
- actual FCM, signed release/OAuth, OEM/Play, provider 전환, socket-cut/구버전 rollout/실기기 재실행, legacy data·guard/cache 성능·운영 장애 복구는 별도 gate다.

## 로컬 실행과 근거 탐색

- [Windows 가이드](../../docs/setup/windows-clone-and-development.md): `. .local/env.ps1` 후 `.local/dev.cmd backend|metro|emulator|android|build|db|stop`; `.local/setup-resume.ps1 -Action db|health`.
- per-user Docker Desktop에서 DB/Redis 준비 → Prisma generate/migrate → test/build/lint → loopback health. npm/npx는 Windows에서 `npm.cmd`/`npx.cmd` 사용.
- Metro `FallbackWatcher/CMakeTmp ENOENT`는 native-build blocklist·cold reset, cache에서만 나타나는 Jest Keychain 실패는 fresh project-local cache로 재검증한다. fail-closed storage를 약화하지 않는다.
- [오류 해결집](./error-resolution-playbook.md)은 signature·환경·root cause가 일치하는 VERIFIED record만 현재 checkout에서 재검증해 사용한다. MITIGATION_ONLY와 과거 Expo/web 기록을 현재 해결로 오인하지 않는다.
- 상세 구현: [전체55 진행 기록](../audits/20260817-release-audit-full-project/2026-09-11-all55-progress.md), [확정 finding 계획](../docs/2026-09-11-confirmed-closure-plan.md).
- 실환경 한계: [잔여 gate 보고서](../audits/20260817-release-audit-full-project/2026-09-14-remaining-gates.md), [Android·운영 모사](../audits/20260817-release-audit-full-project/2026-09-10-android-operations-validation.md).
- 계약별 근거: [production migration](../audits/20260817-release-audit-full-project/2026-09-11-production-migration-gate.md), [readiness](../audits/20260817-release-audit-full-project/2026-09-11-readiness-contract.md), [Task 입력 검증](../audits/20260817-release-audit-full-project/2026-09-11-task-input-validation.md).
