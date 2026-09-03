# Full Project Release Audit — 2026-08-17

- audit id: `20260817-release-audit-full-project`
- mode: `release-audit`
- request: 남은 검증과 프로젝트 전체 검수
- authoritative workspace: `C:\DEV\fsr`
- branch: `codex/front-secure-session-rest-client`
- mutation boundary: audit 당시에는 검증·감사 문서만 변경했다. 이후 별도 승인된 F-016 계획으로 Android-only 기준선을 feature branch에 commit/push하고 clean checkout에서 재검증했다. `main` push·force push·PR·merge·deploy·remote DB·Firebase send는 없음.

## Scope and rounds

- Round 1: authentication, authorization, mobile session, secure storage, Android trust boundaries.
- Round 2: data integrity, transactions, time/error contracts, migrations, operational readiness.
- Round 3: Android runtime/branding/handoff, dependency risk, build reproducibility, formatting and memory accuracy.
- Finder와 validator는 read-only로 분리했다. P0/P1과 security/auth/transaction/data-integrity P2는 독립 reviewer 2명 이상이 반박 검증했고, 판정이 갈린 항목은 독립 입력으로 제3 reviewer가 tie-break했다.

## Fresh verification baseline

- Backend unit: 23 suites / 214 tests PASS.
- Backend e2e: 1 suite / 2 tests PASS.
- Backend build, non-fixing ESLint, Prisma validate PASS.
- Disposable PostgreSQL 17에 migration 4개를 순서대로 적용 PASS.
- Frontend Jest: 18 suites / 162 tests PASS.
- Frontend TypeScript, ESLint(0 errors, 18 warnings), `npm ls --all`, Community CLI config PASS.
- Android `assembleDebug`: 365 tasks, BUILD SUCCESSFUL. 현재 PC debug keystore로 서명 확인, emulator 설치·launch·Metro bundle·DailyUp 로그인 화면 확인.
- 원격 feature branch의 별도 clean checkout에서 `npm ci`, Frontend Jest 162개, typecheck, ESLint, Community CLI config와 Android `assembleDebug` 365 tasks가 통과했다. Android native 52개가 추적되고 local/secret/generated 파일은 추적되지 않으며 checkout status는 clean이었다.
- Expo runtime/source/autolinking scan 0, secret-file pattern 0, TODO/FIXME 0, `git diff --check` PASS.
- Backend Prettier check FAIL: 66 TypeScript files.
- Fresh dependency audit: Backend 15건(critical 0/high 7/moderate 6/low 2), Frontend 17건(critical 0/high 11/moderate 5/low 1). 자동 fix는 실행하지 않았다.

## Runtime and external evidence

- 현재 APK는 순수 React Native Community CLI로 실행된다.
- F-006은 Node 24.19.0/npm 11.19.0과 작업 전용 PostgreSQL 17.11에서 검증했다. 공식 포터블 아카이브 SHA-256은 `6EABDF00D2893713B75DB4336A23C3FDF505F056E217EC6E2E95D901750CFEA3`, 대상 migration SHA-256은 `AA496C2C2D029D26C58083E888E360F79AA7EA8D10C876CF664F841BD16E291A`다. r2 실DB 9/9, 전체 unit 245개, 일반 e2e 2개, Prisma validate/generate, build와 ESLint가 통과했고 종료 후 전용 포트 listener는 0개였다. 공유·원격·운영 DB와 기존 Docker 컨테이너는 사용하거나 변경하지 않았다.
- F-016 수정은 `846cf1968ae0b729e0525ccb2af82f6fc5bd8e20`에 Android-only 기준선과 native 52개를 추적하고 feature branch에 push했다. 독립 reviewer가 remote/clean tree, wrapper/config, APK metadata/hash와 secret/local exclusion을 재검증해 `RECHECKED`로 판정했다.
- 기존 emulator 설치본은 signing identity가 달라 update install이 실패했다. emulator의 정확한 package `com.dsm.dailyup`만 제거한 뒤 현재 debug APK를 재설치했다.
- 첫 실제 Google 계정 인증은 Credential Manager `[16] Account reauth failed`로 provider token 전에 중단됐다. 값 제거 digest 비교에서 앱 Web client와 Cloud project는 일치했지만, 기존 same-package Android clients 두 개는 현재 Android Studio debug signer와 모두 불일치했다.
- 사용자의 action-time 승인 뒤 기존 client를 바꾸지 않고 현재 debug signer용 Android OAuth client를 별도로 생성했다. Cloud 생성 UI는 실패를 표시했지만 list/detail readback에서 matching client가 정확히 한 개 존재함을 확인했다.
- 재시도에서 Google ID-token fetch와 `/auth/login` session exchange가 성공했다. force-stop/relaunch는 authenticated Home과 refresh rotation을 복구했고, logout은 active refresh token을 0으로 만든 뒤 Login으로 복귀했으며 다시 실행해도 Login을 유지했다. 값·credential·token은 기록하지 않았다.
- 로컬 permanent PostgreSQL volume은 기존 role과 현재 예제 role이 달라 변경하지 않았다. 대신 disposable DB를 사용했다.
- 최종 evidence 확인 뒤 Metro와 local backend를 종료하고 `--rm` disposable DB container만 중지·제거했다. permanent DB와 remote state는 변경하지 않았다.

## Merged result

- canonical findings: 26
- confirmed: 21 (`P1` 3, `P2` 14, `P3` 4)
- fixing: 0
- unknown: 2 (`P2` 2)
- accepted risk: 0
- fixed/rechecked: 3 (`F-006`, Task score integrity; `F-016`, Android Git handoff; `F-025`, external Android OAuth debug signer registration)
- 주요 release blockers: 핵심 Task/Score/Ranking frontend가 prototype 상태, release signing 미구성, release 환경값 계약 부재. F-006의 애플리케이션 점수 무결성 경로, Android native Git handoff와 현재 PC debug OAuth blocker는 `RECHECKED`지만 운영 규모 migration과 직접 DB write, 다른 PC와 release/Play signer 등록은 별도 gate다.

`findings.jsonl`이 candidate alias, 독립 검증, severity와 상태의 canonical ledger다. 이번 요청은 검수 요청이므로 confirmed finding을 제품 코드에서 수정하지 않았다.

## Termination status

Release-audit는 **열린 상태**다. confirmed 21건과 `UNKNOWN` 2건이 남아 있고, 서로 다른 두 자유 탐색 라운드에서 신규 confirmed P0–P2가 0건이라는 종료 조건도 충족하지 않았다. 따라서 이 문서는 배포 승인이나 release-ready 선언이 아니다.

다음 단계는 별도 계획·승인 아래 P1부터 1–2파일 단위로 수정하고, 각 finding을 독립 recheck한 뒤 신규 자유 탐색 라운드를 반복하는 것이다.
