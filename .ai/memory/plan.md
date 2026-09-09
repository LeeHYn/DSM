# DSM 실행 계획 — 2026-09-09

## 세팅 재개·main 병합 — 2026-09-09

- 사용자 `세팅 작업 마저 진행하고 병합 진행해`를 기존 로컬 세팅 완료 및 `codex/integration-main-review` → `main` 병합·원격 반영 승인으로 적용한다. 이전 작업의 commit/push 금지는 이번 명시적 요청 범위에서 해제한다.
- M1: 재부팅된 Windows에서 Docker PostgreSQL·Redis healthy, 기존 8개 migration 적용, Backend API health를 확인한다. 생성된 새 PC 로컬 env는 도구 입력으로만 사용하고 값을 출력하거나 stage하지 않는다.
- M2: Backend/Front 전체 test, build·type·non-fixing lint와 DB 검증을 현재 tree에서 실행한다. 메인 에이전트가 로컬 세팅과 검증을 담당하고 독립 reviewer 1명(런타임 inherited profile)은 병합 이력·충돌·문서 gate를 읽기 전용으로 병렬 검토한다.
- M3: memory 5파일의 기존 세팅 변경을 보존·동기화하고 commit한다. 원격 main의 고유 변경을 확인해 통합하고, 최종 tree 검증 후 main을 정상 push한다. 강제 push와 기존 branch 삭제는 하지 않는다.
- Exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/README.md`, `.ai/memory/error-resolution-playbook.md`, 병합 후 clone 기준을 맞출 `README.md`, `docs/setup/windows-clone-and-development.md`; ignored `.local/dev.ps1`, `.local/env.ps1`, `.local/setup-resume.ps1`, `.local/DSM-setup.md`와 도구 생성 로그·빌드 산출물. 각 수동 수정은 1~2파일로 제한한다. Reviewer allowlist는 `none`이다.
- 제품 소스·dependency·schema·migration·audit 변경과 운영 배포는 범위 밖이다. 기존 release-audit의 상태와 외부 gate를 유지하므로 이번 개발 branch 병합은 release-ready 판정이 아니다. 신규 고위험 제품 변경이 없어 별도 change-gate는 적용하지 않는다.
- 성공 기준: 로컬 DB/Redis healthy, migrations up-to-date, API health 200, 전체 test 통과, 충돌 해결 내역 확인, main/upstream commit 일치, clean tracked tree와 memory hash 일치.
- 현재 검증: Backend 317/317·E2E 2/2·build·non-fixing lint, Front fresh-cache 229/229·typecheck·lint 0 errors/30 existing warnings, Android assembleDebug 365 tasks 성공. Keychain 기본 cache 실패 7건은 `ER-20260816-002`의 cache-only 재현으로 분리했다.
- Windows 재부팅은 적용됐다. Docker Desktop 4.90.0은 `sailor-ingest.sock` stale runtime socket rename 오류로 기동하지 못한다. 공식 stop/start·restart로도 지속되고 수동 단일 파일 삭제는 사용자 추가 승인 뒤에도 실행 정책에서 차단됐다. Docker를 종료해 두고 사용자에게 해당 파일 직접 삭제를 요청했다. DB/Redis·migration·API는 아직 미검증이며 전체 로컬 세팅 완료로 주장하지 않는다.
- 병합은 개발 통합 작업으로 독립 진행한다. Reviewer가 main 고유 제품 변경 없음과 memory 충돌 처리 방향을 확인했다. main 고유 Round 11/12/13 조건, F-083/F-005/F-039 외부 검증 한계를 보존했다. CLI GitHub 인증 부재로 연결된 GitHub API를 사용하며 main protection=false를 확인했다.

## 현재 PC D드라이브 개발 환경 준비 — 2026-09-09

- 사용자 요청: GitHub `LeeHYn/DSM`을 D드라이브에 내려받고 세팅한다. 이 요청을 clone·로컬 의존성·환경 구성·검증의 실행 승인으로 적용한다.
- 최초 clone checkpoint: `D:\DSM`, `codex/integration-main-review@32dec29`. 당시 main의 Expo 초기 코드와 memory가 불일치해 integration branch를 선택했다. 현재 병합 계획·상태는 위 세팅 재개 절을 따른다.
- 최초 clone 작업에서는 제품 소스·dependency·lockfile·schema·migration·audit과 commit/push를 제외했다. 이번 명시적 병합 요청의 승인 경계는 위 세팅 재개 절을 따른다.
- 수정 경계: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, hash ledger `.ai/memory/README.md`, 설치 중 검증한 오류 해결 기록 `.ai/memory/error-resolution-playbook.md`; 새 PC 전용 ignored `.local` 도구·로그·실행 도우미, `DSM_Back/.env`, `DSM_Front/.env.local`, `DSM_Front/android/local.properties`, `.git/info/exclude`. 기존 타 PC 환경 파일은 접근하지 않는다.
- M1: D드라이브 clone과 Node 22/npm 준비, 양쪽 `npm ci` 성공.
- M2: JDK 17·Android SDK 36·Build Tools 36.0.0·NDK 준비와 Front test/type/lint/debug build 검증.
- M3: Docker 기반 PostgreSQL·Redis, 안전한 로컬 env, Prisma generate/validate·migration·Backend test/build/lint·health 검증. Windows 관리자 권한·재부팅이 필요하면 필요한 설치물을 준비하고 의존하지 않는 검증을 먼저 완료한다.
- M4: 실제 결과와 미완료 외부 조건을 memory와 사용자 실행 안내에 기록한다. Google OAuth·실기기·release signing은 준비 여부를 구분해 보고한다.

### 재부팅 전 검증 checkpoint

- M1/M2 완료: dependency install, Backend 317·E2E 2·Front 229 tests, type/lint/build, Android 365 tasks/4 ABI APK와 API 36 로그인 화면을 확인했다. Windows Metro watcher 설정을 로컬 도우미에 보강했다.
- M3의 도구·env·Compose config·Prisma generate/validate는 완료했다. Windows가 WSL 기능 적용에 재부팅을 요구하므로 DB·Redis startup, migration deploy, backend runtime health는 미완료다.
- M4 기록을 동기화했다. Docker Desktop과 테스트용 Metro·AVD는 종료했다. 재부팅 후 `D:\DSM\.local\dev.cmd backend`로 서비스를 준비하고 실제 health를 검증한다. 아직 전체 세팅 완료로 판단하지 않는다.

## 목표·경계

- 제품 범위는 Android 전용 DSM v1.3이다.
- 제품·감사 checkout은 `codex/integration-main-review`이며 F-012 제품·감사 checkpoint `5642640cfbcd3b5d410f4bdbcbaeecedd106b213`까지 원격과 같다. 이 memory snapshot이 해당 기준을 후속 기록한다.
- F-012 범위는 ranking service/spec, Prisma schema, 새 snapshot migration·PostgreSQL spec이다. 공개 controller/API shape, Front, Android, dependency와 기존 migration은 변경하지 않았다.
- 실제 환경 파일, private Gradle property, key·keystore와 recovery snapshot은 읽기·수정·stage하지 않는다.

## Canonical audit

- F-001~F-083, 83건: 58 CONFIRMED / 2 FIXING / 11 FIXED / 1 REFUTED / 8 RECHECKED / 3 UNKNOWN.
- F-012는 공개 snapshot API를 유지하면서 사용자·period·UTC 날짜당 1행으로 신규 write를 제한해 FIXED다. Legacy 정리·CHECK validation과 독립 fix-recheck가 남았다.
- F-007/F-008/F-009는 PATCH null·completion metadata·Task interval 계약과 PostgreSQL active-row CHECK 검증을 마쳐 FIXED다. 독립 fix-recheck와 production legacy scan이 남았다.
- F-001/F-002는 refresh-authenticated server-first logout과 access `sid` 활성-family 검사, 전체·실제 PostgreSQL·Android 검증을 마쳐 FIXED다. 독립 fix-recheck가 남았다.
- F-011/F-029/F-030은 cache와 DB fallback의 tie·전체 사용자·UTC anchor 계약을 통일하고 전체·실제 서비스 검증을 마쳐 FIXED다. 독립 fix-recheck가 남았다.
- F-065는 MainActivity의 package affinity 상속을 제거하고 task reparenting을 명시적으로 막은 뒤 merged/packaged manifest, Android build/lint와 emulator task smoke를 통과해 FIXED다. 구형 OS 독립 recheck가 남았다.
- F-069는 PostgreSQL batch projection·Redis cache, 동시성·세대 수명 보강과 실제 서비스·50,000-user 합성 검증을 마쳐 FIXED다. 구현자와 독립된 fix-recheck가 남았다.
- F-067/F-068은 코드 검증을 마쳤으나 실제 privacy/deletion URL·외부 처리·signed device·Play Console 증거가 없어 FIXING이다.
- UNKNOWN은 F-003, F-013, F-017이며 signer·production OAuth·readiness·signed-device 증거가 필요하다. F-066은 Android-only 확정으로 REFUTED다.
- Release-ready가 아니다.

## 완료된 핵심 구현

- F-005 authenticated Product REST·user/epoch scoped store, F-083 Task idempotency·retry fence, F-039/F-040 test·type gate, F-035 Android release fail-closed를 종결했다.
- F-067/F-068은 authenticated account deletion, transaction cascade, Android session/Keychain/store fence, two-step UI와 legal URL gate를 구현했다.
- F-001/F-002는 access JWT와 refresh family를 `sid`로 결합했다. 명시적 logout은 서버 family 폐기 성공 뒤에만 Keychain·prototype 상태를 지우며 실패하면 인증 상태와 안전한 재시도 안내를 유지한다.
- F-007/F-009는 absent와 null 날짜를 분리하고 create·merged PATCH의 `endAt > startAt`를 service와 staged DB CHECK로 강제한다. F-008 전이 로직은 기존 `e2bda53`에서 이미 구현됐다.
- F-069는 PostgreSQL window projection과 fenced Redis generation을 cache-first로 제공하고, F-011/F-029/F-030 DB fallback도 같은 rank·population·UTC 계약으로 통일했다.
- F-065는 minSdk 24와 exported `singleTask` launcher를 유지하면서 MainActivity의 `taskAffinity`를 비우고 task reparenting을 비활성화했다.

## F-012 종결 계약

- 2026-09-09 사용자 `ㄱ` 승인에 따라 공개 API를 보존하고 사용자·period·UTC 날짜당 최초 snapshot 하나만 생성한다. 같은 날 반복 호출은 기존 immutable row를 반환해 ranking 재계산과 durable write를 생략한다.
- `snapshotDate DATE`와 non-null `NOT VALID` CHECK, non-null row 대상 partial unique index가 신규·수정 write를 제한한다. `createMany(skipDuplicates)` 뒤 winner를 읽어 동시 최초 호출도 한 row로 합친다.
- Legacy row 두 개가 같은 날짜에 있어도 null bucket으로 보존한 채 7→8 migration upgrade가 성공했다. 신규 null·중복은 거부됐고 fresh·legacy DB 모두 committed 3/3 spec을 통과했다.
- F-012는 canonical audit에서 `FIXED`다. 구현자 독립 recheck가 없으므로 `RECHECKED`가 아니며, production legacy 분류·backfill·중복 해소·CHECK validation은 별도 gate다.

## 후속 실행

1. 열한 개 FIXED finding의 구현자 독립 fix-recheck, F-008/F-009/F-012 legacy-state scan·정리와 staged CHECK validation을 수행한다.
2. F-069 운영 cardinality·capacity·latency·failover 증거를 확보한다.
3. F-067/F-068 공개 URL·외부 삭제·Play 증거를 확보하고 남은 P2→P3를 진행한다.

## 외부 PC clone·개발 문서 — 종결

- 사용자 승인 결과는 `af2ff2640b1fa27111302766baa61aada15b304d`이다. 기준 문서는 `docs/setup/windows-clone-and-development.md`이며 Root·Backend README가 연결하고, 2026-08-08 handoff 문서는 역사 기록으로 표시했다.
- 가이드는 integration clone, Node 22+, JDK 17, Android SDK 36, safe local env, Docker·Prisma, Android·OAuth, Git hygiene와 Windows 문제를 다룬다. compose가 요구하는 non-secret PostgreSQL 기본값도 `.env.example`에 추가했다.
- compose config·ignore·tracked script·Markdown link·diff 검증을 통과했다. 제품 코드·dependency·migration·audit은 변경하지 않았다.

## 불변 조건

- Audit status는 실제 source/test와 검증 증거를 기준으로만 전이한다. P0/P1 및 보안·권한·transaction·동시성·데이터 무결성 P2 종결에는 독립 검토 2건 이상이 필요하다.
- git add -A를 사용하지 않고 승인 범위의 exact path만 stage한다.
- Recovery 파일은 명시적 복구 승인 없이는 active 입력으로 사용하지 않는다.
