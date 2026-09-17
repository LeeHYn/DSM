# DSM 실행 계획 — 2026-09-17

## 현재 목표

- 사용자의 현재 요청은 지금까지의 저장소 변경을 정리해 `main`에 커밋하고 `origin/main`으로 push하는 것이다.
- 함께 수행할 기록 작업은 활성 memory를 현재 상태와 남은 gate 중심으로 압축하고, 상세 완료 이력은 감사 보고서와 Git 이력으로 연결하는 것이다.
- 시작 기준은 `main`과 `origin/main`이 `6e7988c`에서 일치한 상태다. 제품·감사·운영 문서의 기존 미커밋 변경은 보존해 게시 대상에 포함한다.
- 실제 secret·credential·keystore·로컬 env·recovery 파일과 `DSM_Back/.local/` Jest cache는 stage하지 않는다. cache는 삭제하지 않고 Git ignore 대상으로만 정리한다.
- 완료 기준은 전체 자동 검증 결과 기록, memory hash 갱신, exact 파일 stage, Conventional Commit, `origin/main` push, 로컬 HEAD와 원격 SHA 일치 확인이다.

## 제품·감사 현재 상태

- Canonical audit는 92건이며 `RECHECKED 83 / UNKNOWN 5 / FIXING 3 / REFUTED 1`이다. 열린 8건은 F-003/F-013/F-015/F-017/F-065/F-067/F-068/F-092다.
- 원래 CONFIRMED 55건 가운데 로컬에서 처리 가능한 54개 분야는 구현·회귀·독립 재검토를 마쳤다. F-015의 actual FCM과 나머지 7건의 외부 조건은 로컬 증거로 종결하지 않는다.
- 최신 로컬 전체 검증은 Backend 43 suites/960 tests, production-start 3 tests, build·spec typecheck·ESLint 통과다. Front는 51 suites/1,156 tests와 typecheck가 통과했고 ESLint는 error 0/warning 44다.
- API24 notification/task-affinity와 API36 TalkBack의 F-047 포커스 복원, 격리 Linux Docker의 migration→startup→readiness 장애·복구 검증은 완료했다. 실제 FCM, signed release, provider 계정 전환, OEM/Play/운영 검증은 남아 있다.
- 상세 구현·판정·검증 근거는 [전체55 진행 기록](../audits/20260817-release-audit-full-project/2026-09-11-all55-progress.md), [잔여 gate 결과](../audits/20260817-release-audit-full-project/2026-09-14-remaining-gates.md), [감사 원장](../audits/20260817-release-audit-full-project/findings.jsonl)을 SSOT로 사용한다.

## 외부 환경 계획

- 포트폴리오 Backend는 Render Free Web Service, PostgreSQL은 Neon Free, Redis는 Upstash Free로 결정했다. 공개 API는 우선 Render `onrender.com` HTTPS 주소를 사용한다.
- `render.yaml`은 `DSM_Back` Docker context, Singapore free service, `/health/ready`, production mode, FCM dispatch 비활성화, Render 생성 JWT secret과 Dashboard-only DB/Redis/Google OAuth 입력을 선언한다. local Docker image preflight는 통과했다.
- 신규 Play Console 등록은 보류한다. 기존 초대·등록 여부 확인, 새 계정 유형·USD 25 등록비, 소유 도메인, 개인정보·삭제 책임자와 문의 채널, 실제 Android/OEM 기기, provider 테스트 계정 2개가 미결정 또는 미제공 상태다.
- 계정 생성, 결제·약관 동의, Console 변경, secret 입력, 공개 deploy, DNS/legal 게시, Firebase 활성화, signed artifact 업로드는 owner의 외부 작업이다. 값은 Git·문서·채팅·일반 로그에 기록하지 않는다.
- 전체 순서와 finding별 종결 증거는 [외부 환경 작업표](../docs/2026-09-14-external-environment-provisioning.md)를 따른다.

## 열린 gate

1. F-003/F-017: upload/Play signer와 production OAuth/API identity를 구성하고 signed artifact의 cold start·link open을 실제 기기에서 검증한다.
2. F-013: 실제 배포 플랫폼에서 `/health`와 `/health/ready`의 traffic mapping, DB 장애 제외와 복구, production bootstrap을 관찰한다.
3. F-015: Firebase ADC·Android app·실제 토큰을 연결해 foreground/background/종료 상태의 FCM 수신과 lifecycle을 검증한다.
4. F-065: signed release와 malicious-app PoC, Recents·OAuth return, 구형 Android/OEM patch matrix로 task hijack 잔여 위험을 확인한다.
5. F-067/F-068: 공개 privacy/account-deletion URL, 외부 삭제 요청 수단, 책임자·문의 채널, signed-device 삭제, Play Data safety 일치를 증명한다.
6. F-092: 실제 provider A→B 전환 중 이전 engine·outbox·notification이 새 계정에 도달하지 않는지 기기에서 검증한다.
7. 운영 공통: legacy data, guard/cache 성능, managed Redis failover, 다중 인스턴스, rollout/rollback을 실제 환경에서 검증한다.

## 유지 계약

- DSM v1.3은 Android-only다. Front는 React Native Community CLI, Backend는 NestJS/Prisma/PostgreSQL/Redis 계약을 사용한다.
- Android package/namespace는 `com.dsm.dailyup`. Front release 공개값은 Git 제외 `.env.release.local`, signing은 저장소 밖 Gradle property/CI secret, Backend는 runtime secret과 Firebase ADC를 사용한다.
- `RECHECKED`는 기록된 조건과 검증 범위의 종결이다. 외부 환경이 없는 항목까지 release-ready로 확대하지 않는다.
- 오류 재발 시 전체 기록을 읽지 말고 [오류 해결집](./error-resolution-playbook.md)의 index에서 error signature·component·환경이 일치하는 VERIFIED record만 적용한다.

## 다음 실행 순서

1. 현재 변경을 게시한 뒤 owner가 Render/Neon/Upstash 계정을 연결하고 secret을 Dashboard에 입력한다.
2. 공개 Backend에서 migration, `/health`, `/health/ready`, DB/Redis 장애·복구를 확인한다.
3. 소유 도메인 또는 공개 legal URL, 책임자·문의 채널, 개인정보·삭제 문구를 확정한다.
4. Play 작업을 재개할 때 기존 계정/초대 여부부터 확인하고 signing→OAuth→Firebase→internal test 순서로 진행한다.
5. 실제 기기·provider 계정으로 열린 8건을 검증하고 직접 증거가 생긴 finding만 전이한다.

## 이력 진입점

- 통합·세팅·Windows 실행: [Windows 가이드](../../docs/setup/windows-clone-and-development.md)
- 확정 finding 실행 계획: [전체 계획](../docs/2026-09-11-confirmed-closure-plan.md)
- F-014 production migration: [검증 보고서](../audits/20260817-release-audit-full-project/2026-09-11-production-migration-gate.md)
- F-013 readiness: [검증 보고서](../audits/20260817-release-audit-full-project/2026-09-11-readiness-contract.md)
- F-041/F-079 입력 검증: [검증 보고서](../audits/20260817-release-audit-full-project/2026-09-11-task-input-validation.md)
- Android·운영 모사: [검증 보고서](../audits/20260817-release-audit-full-project/2026-09-10-android-operations-validation.md)
