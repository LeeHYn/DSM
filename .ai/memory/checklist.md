# DSM 공정표 — 2026-09-17

## 현재 게시·memory 정리

- [x] `main`/`origin/main` 시작 기준과 전체 tracked/untracked 변경 목록 확인.
- [x] actual secret 후보 검사. test placeholder 외 실제 credential 없음.
- [x] Backend 43 suites/960 tests, production-start 3, build·spec typecheck·ESLint 통과.
- [x] Front 51 suites/1,156 tests, typecheck 통과. ESLint error 0/warning 44; strict warning budget만 실패.
- [x] 활성 memory의 과거 snapshot·중복 계획을 제거하고 현재 원장·외부 gate 중심으로 압축.
- [/] exact 파일 stage, diff·UTF-8/LF·link/hash 검증, commit, `origin/main` push, 원격 SHA 대조.
- [x] `DSM_Back/.local/` Jest cache는 보존하고 Git stage에서 제외.

## 로컬 구현·검증 완료

- [x] Canonical92 중 83 RECHECKED, 1 REFUTED. 원래 CONFIRMED55의 로컬 처리 가능 54개 분야와 추가 F-088~F-091 종결.
- [x] Auth/session, profile, notification, realtime, offline sync, calendar, statistics, ranking, Task 입력/동시성 방어 구현과 자동 회귀.
- [x] API24 notification/task-affinity/process-kill receiver, API36 TalkBack task-sheet 진입·격리·Back·opener focus 복원.
- [x] Docker migration-before-start, non-root image, liveness/readiness, DB 장애 503·복구 200.
- [x] Render Blueprint과 local Docker image preflight. production·FCM dispatch는 외부 설정 전 비활성화.
- [x] 감사 원장·보고서·error-resolution playbook 동기화.

## 외부 환경 준비

- [x] Render Free + Neon Free + Upstash Free 선택.
- [x] `render.yaml`에 Docker context, Singapore free service, `/health/ready`, secret 전달 경계 선언.
- [ ] Render/Neon/Upstash 계정 연결과 Dashboard secret 입력, 공개 deploy.
- [ ] 소유 domain 또는 공개 legal URL, 개인정보·삭제 책임자와 문의 채널 확정.
- [ ] 실제 Android/OEM 기기와 provider A/B 테스트 계정 2개 준비.
- [ ] Play 기존 계정·초대 여부 확인. 신규 등록과 USD 25 결제는 보류.
- [ ] upload key·Play App Signing·Web/Android OAuth·Firebase Android app와 ADC identity 구성.
- [ ] privacy/account-deletion web resource와 실제 외부 삭제 처리 수단 게시.

## 열린 finding gate

- [ ] F-003/F-017 UNKNOWN: 실제 signer, production OAuth/API, signed artifact cold start·link open.
- [ ] F-013 UNKNOWN: 실제 platform에서 readiness traffic mapping, DB 장애 제외·복구, production bootstrap.
- [ ] F-015 FIXING: actual FCM foreground/background/종료 수신과 notification lifecycle.
- [ ] F-065 UNKNOWN: malicious-app PoC, Recents·OAuth return, signed release, 구형 Android/OEM matrix.
- [ ] F-067/F-068 FIXING: 공개 privacy/deletion URL, 외부 요청 수단, 책임자·지원 채널, signed-device 삭제, Play Data safety.
- [ ] F-092 UNKNOWN: 실제 provider A→B 전환 중 old engine/outbox/notification 격리.
- [ ] 운영 공통: legacy data backfill/validate, guard/cache 성능, managed Redis failover, 다중 인스턴스, rollout/rollback.

## 다음 실행 순서

1. [ ] Render/Neon/Upstash 연결 후 migration과 공개 `/health`·`/health/ready` 검증.
2. [ ] legal URL·책임자·문의 채널을 확정하고 privacy/deletion 실제 동작과 문구 대조.
3. [ ] Play 재개 시 기존 account/초대 확인→signing→OAuth→Firebase→internal track 순서로 구성.
4. [ ] 실제 기기·provider 계정으로 8개 gate를 실행하고 직접 증거가 생긴 finding만 전이.
5. [ ] release 후보에서 dependency audit, OEM/rollout/rollback, production 성능과 장애 복구를 재검증.

## 유지 규칙

- 현재 상태는 [context.md](./context.md), 목표·순서는 [plan.md](./plan.md), 상세 과거 증거는 연결된 감사 보고서를 따른다.
- 로컬·합성 통과를 actual FCM/OAuth/OEM/production/Play/release 완료로 표현하지 않는다.
- 실제 env/key/credential/keystore와 recovery `*.original.md`·`*.failed-*`는 명시적 복구 작업 외에는 읽기·수정·삭제·stage하지 않는다.
- 오류 해결은 [error-resolution-playbook.md](./error-resolution-playbook.md)에서 환경·버전·signature가 일치하는 VERIFIED record만 재사용한다.
