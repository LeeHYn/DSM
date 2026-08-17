# Full Project Release Audit — 2026-08-17

- audit id: `20260817-release-audit-full-project`
- mode: `release-audit`
- request: 남은 검증과 프로젝트 전체 검수
- authoritative workspace: `C:\DEV\fsr`
- branch: `codex/front-secure-session-rest-client`
- mutation boundary: 검증·감사 문서만. 제품 수정, Git stage/commit/push/PR/merge, remote DB, deploy, Firebase send 없음.

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
- Expo runtime/source/autolinking scan 0, secret-file pattern 0, TODO/FIXME 0, `git diff --check` PASS.
- Backend Prettier check FAIL: 66 TypeScript files.
- Fresh dependency audit: Backend 15건(critical 0/high 7/moderate 6/low 2), Frontend 17건(critical 0/high 11/moderate 5/low 1). 자동 fix는 실행하지 않았다.

## Runtime and external evidence

- 현재 APK는 순수 React Native Community CLI로 실행된다.
- 기존 emulator 설치본은 signing identity가 달라 update install이 실패했다. emulator의 정확한 package `com.dsm.dailyup`만 제거한 뒤 현재 debug APK를 재설치했다.
- 첫 실제 Google 계정 인증은 Credential Manager `[16] Account reauth failed`로 provider token 전에 중단됐다. 값 제거 digest 비교에서 앱 Web client와 Cloud project는 일치했지만, 기존 same-package Android clients 두 개는 현재 Android Studio debug signer와 모두 불일치했다.
- 사용자의 action-time 승인 뒤 기존 client를 바꾸지 않고 현재 debug signer용 Android OAuth client를 별도로 생성했다. Cloud 생성 UI는 실패를 표시했지만 list/detail readback에서 matching client가 정확히 한 개 존재함을 확인했다.
- 재시도에서 Google ID-token fetch와 `/auth/login` session exchange가 성공했다. force-stop/relaunch는 authenticated Home과 refresh rotation을 복구했고, logout은 active refresh token을 0으로 만든 뒤 Login으로 복귀했으며 다시 실행해도 Login을 유지했다. 값·credential·token은 기록하지 않았다.
- 로컬 permanent PostgreSQL volume은 기존 role과 현재 예제 role이 달라 변경하지 않았다. 대신 disposable DB를 사용했다.
- 최종 evidence 확인 뒤 Metro와 local backend를 종료하고 `--rm` disposable DB container만 중지·제거했다. permanent DB와 remote state는 변경하지 않았다.

## Merged result

- canonical findings: 26
- confirmed: 23 (`P1` 5, `P2` 14, `P3` 4)
- unknown: 2 (`P2` 2)
- accepted risk: 0
- fixed/rechecked: 1 (`F-025`, external Android OAuth debug signer registration)
- 주요 release blockers: Android native project 전체 Git 미추적, 핵심 Task/Score/Ranking frontend가 prototype 상태, 임의 날짜 점수 누적 조작 경로, release signing 미구성, release 환경값 계약 부재. 현재 PC debug OAuth blocker는 `RECHECKED`지만 다른 PC와 release/Play signer 등록은 별도 gate다.

`findings.jsonl`이 candidate alias, 독립 검증, severity와 상태의 canonical ledger다. 이번 요청은 검수 요청이므로 confirmed finding을 제품 코드에서 수정하지 않았다.

## Termination status

Release-audit는 **열린 상태**다. confirmed P1/P2와 `UNKNOWN` 2건이 남아 있고, 서로 다른 두 자유 탐색 라운드에서 신규 confirmed P0–P2가 0건이라는 종료 조건도 충족하지 않았다. 따라서 이 문서는 배포 승인이나 release-ready 선언이 아니다.

다음 단계는 별도 계획·승인 아래 P1부터 1–2파일 단위로 수정하고, 각 finding을 독립 recheck한 뒤 신규 자유 탐색 라운드를 반복하는 것이다.
