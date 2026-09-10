# DSM 현재 맥락 — 2026-09-10

## 현재 PC D드라이브 환경 구성

- 현재 작업 경로·branch는 `D:\DSM`, `main`이다. `codex/integration-main-review@32dec29`의 검증된 제품 tree가 merge commit `9e330314d100644886a4104d07c7197f12616ee5`로 원격 main에 반영됐고 로컬 main도 같은 상태다. 아래의 `C:\DEV` 등은 이전 PC checkpoint다.
- Git 2.53.0.windows.3, Node 22.23.2/npm 10.9.8, Microsoft JDK 17.0.20.1+1, Android 도구·캐시는 `D:\DSM\.local`에 있다. Docker 4.90.0은 Explorer에서 정상 per-user 설치한 `%LOCALAPPDATA%\Programs\DockerDesktop`이 현재 사용본이며 기존 D드라이브 설치본은 보존했다. 실제 WSL distro BasePath는 C드라이브 `%LOCALAPPDATA%\Docker\wsl\main`; data의 D드라이브 이전은 하지 않았다.
- Backend `.env`와 Front `.env.local`을 이 PC에서 새로 생성했다. DB/JWT는 난수이며 OAuth는 placeholder/빈 설정, FCM dispatch는 false다. Git ignore 상태를 확인했고 기존 타 PC secret은 접근하지 않았다.
- DB는 프로젝트 지침대로 Docker Compose의 PostgreSQL 17/Redis 8을 사용한다. Portable PostgreSQL은 설치하지 않았고 사전 다운로드 archive는 제거했다.
- WSL 2.7.13.0과 VirtualMachinePlatform 적용 후 재부팅됐다. Docker의 최초 installer/runtime이 Codex MSIX AppData 가상화 영향을 받아 일반 Explorer와 경로·설치 registry view가 달랐다. 공식 installer를 Explorer GUI에서 per-user 설치하고 앱을 직접 실행한 뒤 엔진 29.7.2가 정상 응답했다.
- 재개 후 현재 검증: Backend 317/317, E2E 2/2, build·non-fixing lint·Prisma validate 성공. Front 기본 cache에서 Keychain 7건 실패 후 새 isolated cache만 지정하자 24 suites/229 tests가 통과했고 typecheck·lint 0 errors/30 existing warnings도 확인했다. `ER-20260816-002` 재검증이며 제품 수정은 없었다. Prisma generate와 Android Metro bundle·24 assets는 최초 설치 때 통과했다.
- `D:\DSM\.local\env.ps1`은 도구 경로를 현재 PowerShell 세션에 설정한다. `dev.cmd backend|metro|emulator|android|build|db|stop`은 해당 실행을 돕는다. `setup-resume.ps1 -Action db|health`로 DB/migration과 API를 검증했다. CLI 경로는 정상 per-user Docker 설치본을 우선한다. 제품 코드·lockfile·schema·migration·audit은 변경하지 않았다.
- Android SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, API 36 AVD `DSM_API_36`을 설치했다. 재개 후 JDK 17/Gradle 9.0.0 `assembleDebug`도 3분 10초, 365 tasks(42 executed/323 up-to-date)로 성공했다. APK는 `DSM_Front/android/app/build/outputs/apk/debug/app-debug.apk`에 있다.
- 첫 Metro는 동시 native build의 `.cxx/CMakeTmp` 삭제로 `ENOENT` 종료됐다. 기존 Metro config를 상속하는 ignored `.local/metro.config.cjs`에서 native build 폴더만 blockList에 추가했다. 실제 bundle HTTP 200, native 임시 폴더 20개 생성·삭제 후 health 유지와 API 36 앱 로그인 화면을 확인했다. 처음 번들 로드 실패 후 reload만으로는 빈 화면이 남아 AVD를 정상 종료·재시작하고 cold launch로 재검증했다.
- Google OAuth 인증, Android 앱→Backend 연결, signed device, 운영·release 조건은 미검증이다. 현재 안내는 `.local/DSM-setup.md`이며 최초 로그인 화면은 이전 setup 작업의 `outputs/DSM-android.png`에 기록했다.
- 설치 중 JDK checksum 주소 오류는 공식 `.sha256sum.txt`로 확인해 해결했다. 기존 오류 기록과 중복을 검색한 뒤 `ER-20260909-004`와 Metro watcher `ER-20260909-005`를 기록했다.
- 소켓 삭제: virtual/physical run 디렉터리 File ID가 일치했고 Explorer에서 원래의 `sailor-ingest.sock`만 삭제해 목록 4→3과 Test-Path false를 검증했다. 이후 앱 실행 도구로 시작한 Docker가 23:22에 같은 이름의 새 소켓을 만들고 `dockerInference`에서 실패하여 Quit했다. MSIX cache의 새 소켓과 원래 다른 3개 파일은 남아 있다. 정상 사용자 설치본은 별도 실제 AppData를 사용한다. native helper 삭제는 실행하지 않았다.

- 현재 런타임(2026-09-10 19:53 KST 검증): 정지 상태였던 Docker와 Backend를 다시 실행했다. Compose PostgreSQL 17·Redis 8은 각각 127.0.0.1:5432/6379에서 healthy, migration 8개 schema up-to-date, Redis PONG, Backend `/health` HTTP 200/status ok다. `/health`의 configured 값은 DB readiness를 대신하지 않으므로 실제 migration·Prisma 기동·Compose 결과와 함께 판단했다. Backend PID 22108과 두 container는 실행 중이다. 이번 로그는 `.local/logs/resume-docker-db-20260910.log`, `resume-backend-health-20260910.log`다.
- Docker GUI 확인 완료: Computer Use로 정상 C드라이브 설치본을 Explorer에서 실행해 `Containers - Docker Desktop`, `Engine running`, 실행 중인 `dsm-back-dev`를 화면과 접근성 트리에서 확인했다. 약관·온보딩 차단 창이 없어 이전 확인 대기를 닫았다. 로컬 안내 `.local/DSM-setup.md`에 시작 방법과 미검증 OAuth·release gate를 유지한다. 제품·audit tree는 기존 검증한 integration `32dec29`와 동일하며 전체 test/build는 재실행하지 않았다.

## Checkout·책임 경계

- 현재 PC의 개발·감사 기준은 `D:\DSM/main`이다. 병합 당시 원격 main과 integration 양쪽 ancestry, 로컬·GitHub tree 일치, 제품·audit 무변경과 clean tracked tree를 확인했다. 아래 두 C드라이브 경로는 이전 PC 이력이며 현재 checkout으로 사용하지 않는다.

- 이전 PC의 조정 checkout은 `C:\DEV/main`, 제품·감사 checkout은 `C:\dsm-integration-review/codex/integration-main-review`였다.
- F-012 제품·감사 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`와 외부 PC 문서 `af2ff2640b1fa27111302766baa61aada15b304d`까지 원격 upstream에 있다.
- 제품 범위는 Android 전용 DSM v1.3이다. Backend는 NestJS·Prisma 6·PostgreSQL, 클라이언트는 React Native Community CLI 기반 Android다.
- Canonical audit는 `.ai/audits/20260817-release-audit-full-project/findings.jsonl`이다. Root 완료와 release-ready 판정은 구분한다.

## Canonical audit 상태

- F-001~F-083, 83건: `58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN / 0 VALIDATING`.
- Ledger는 352,219 bytes, SHA-256 `CF538F3AD9FBF186F51DDAEB1B7601D9C1B232F2415BC7C11314AE1DF69DA15C`이다. UTF-8/LF, schema, 연속 ID, fingerprint 고유성·basis hash와 status history 검증이 통과했다.
- `RECHECKED`: F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083. `UNKNOWN`: F-003, F-013, F-017. `REFUTED`: F-066. `FIXING`: F-067, F-068. `FIXED`: F-001, F-002, F-007, F-008, F-009, F-011, F-012, F-029, F-030, F-065, F-069.
- 열한 개 `FIXED` 항목은 구현자 자체 검증을 마쳤으며 독립 fix-recheck 전에는 `RECHECKED`로 올리지 않는다.
- main 고유 기록 보존: Round 12·13은 targeted revalidation이므로 자유 탐색 연속 조건에서 제외하며 Round 11만 zero-new-confirmed-P0~P2 1회로 계산한다.

## 구현 결정

- F-005/F-083은 authenticated user-scoped 제품 상태와 Task idempotency를 종결했다. F-067/F-068은 account deletion·session fence·legal URL gate를 구현했으나 외부 URL·Play 증거가 남았다.
- F-001/F-002는 access JWT와 refresh family를 `sid`로 결합하고 Android가 server-first logout 실패를 재시도 가능하게 유지한다. F-007/F-009는 null·parse·merged interval을 service와 staged CHECK에서 방어하며 F-008 completion 전이는 `e2bda53`에서 구현됐다.
- F-011/F-029/F-030/F-069는 cache·DB fallback의 tie·전체 사용자·UTC 계약, PostgreSQL window projection과 fenced Redis generation을 제공한다. F-065는 MainActivity의 package affinity를 비우고 reparenting을 막는다.
- F-012는 공개 POST를 유지하고 사용자·period·UTC 날짜당 immutable snapshot 하나만 허용한다. Service의 선행 조회와 conflict-safe insert를 partial unique index가 보강한다.

## 로컬 검증 checkpoint

- F-001/F-002는 Backend 304·Front 229·Android 456·PostgreSQL 1/1, F-007/F-008/F-009는 Backend 314·PostgreSQL fresh 3/3·legacy upgrade를 통과했다.
- F-011/F-029/F-030은 Backend 297·PostgreSQL/Redis 2/2, F-069는 Backend 293·통합 2/2와 50,000-user 합성 benchmark, F-065는 manifest·build·lint·API 36 smoke를 통과했다. 합성 수치는 production SLO 증거가 아니다.
- F-012는 focused 18, Backend 317, e2e 2와 모든 정적 gate를 통과했다. PostgreSQL fresh·legacy 3/3, legacy row 2개 보존, 20개 동시 호출 1 ID를 확인했다.
- 외부 PC 문서는 tracked scripts·ignore·Android/compose 설정과 대조했고 `docker compose --env-file .env.example config --quiet`이 통과했다. 이는 문서·template 검증이며 제품 test·build·runtime을 새로 실행한 결과는 아니다.
- 이전 PC 검증 종료 이력: 당시 task-owned service·container·임시 prefix를 제거하고 Docker Desktop을 원래의 정지 상태로 복구했다. 현재 PC의 실행 상태는 위 현재 런타임 항목을 따른다.

## F-012 종결

- 반복 호출마다 row를 생성하던 원인은 service와 schema에 idempotency bucket과 uniqueness가 없었던 것이다. UTC 날짜 bucket, 선행 재사용, conflict-safe insert와 DB 제약으로 신규 증가량을 사용자당 하루 최대 세 period로 제한했다.
- Nullable bucket과 staged CHECK는 과거 row를 재작성하지 않는다. 실제 7-migration legacy DB의 같은 날짜 row 두 개가 null bucket으로 보존된 채 upgrade됐고 이후 신규 null·중복 write는 거부됐다.
- Canonical 상태는 `FIXED`; 제품·감사 commit은 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`이다. 독립 fix-recheck와 production legacy 정리가 남았다.

## 잔여 위험·외부 gate

- main 고유 기록 보존: F-083 process restart/offline durable intent, device socket-cut, 구버전 rollout 검증과 F-005/F-039 physical-device relaunch는 남아 있다.

- F-069은 실제 운영 cardinality, Redis capacity, query plan, managed failover와 p50/p95/p99가 미측정이다. Cache miss가 projection 후에도 남으면 bounded window-query fallback이 DB sort 부하를 만들 수 있다. WebSocket delta는 F-074 범위다.
- F-065 app-side 설정은 공식 Android 문서상 구형 OS의 모든 StrandHogg 변형에 대한 완전한 보장이 아니다. API 24~29 malicious-app PoC, OEM patch matrix와 독립 fix-recheck가 남았다.
- F-067/F-068 공개 privacy/deletion URL과 외부 삭제 절차가 없고 Google Play 앱 이름·내부 삭제 경로·Data safety 증거를 최종 대조하지 않았다.
- F-001/F-002는 offline에서 명시적 logout을 완료할 수 없고 보호 REST 요청마다 indexed family 조회가 추가된다. Commit 전 승인된 in-flight 요청, production latency·availability와 독립 fix-recheck가 남았다.
- F-007/F-008/F-009는 독립 fix-recheck가 남았다. F-008의 역사적 contradictory row와 same-value COMPLETED의 legacy null은 자동 보정하지 않으며, F-009는 production invalid-row scan·정정 또는 soft-delete 뒤 CHECK validation이 필요하다.
- F-012 legacy snapshot은 null bucket으로 남아 있다. Production에서 날짜 정책을 정해 분류·backfill·중복 해소한 뒤 CHECK를 validate해야 하며 SQL-only partial index의 migration drift도 감시해야 한다.
- 실제 upload/Play signer, production OAuth, signed-device cold start·link open, readiness mapping과 운영 DB·Firebase 증거가 미완료다.
- 현재 CONFIRMED P1은 0건이다. 다음 finding은 canonical 우선순위와 새 계획·승인을 기준으로 선택한다.

## 안전·복구 규칙

- `C:\DEV\DSM_Back\.env`, 실제 `.env`, key·keystore와 private Gradle property는 읽기·수정·stage하지 않는다.
- F-012 범위 밖인 controller/API response, Front, Android, dependency와 기존 migration은 변경하지 않았다.
- `*.original.md`, `*.failed-*`는 historical recovery이며 active 입력이 아니다. 명시적 복구 승인 없이는 읽기·수정·삭제·stage하지 않는다.
- 제품·memory·audit 수정은 `apply_patch`로 수행하고 `git add -A` 없이 exact path만 stage한다.
