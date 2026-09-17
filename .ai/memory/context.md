# DSM 현재 맥락 — 2026-09-17

## 프로젝트 기준

- 작업 checkout은 `D:\DSM`, branch는 `main`, upstream은 `origin/main`이다. 정확한 현재 SHA와 dirty 상태는 Git을 직접 확인한다.
- DSM v1.3은 Android-only다. Front는 React 19.2.0 / React Native 0.83.10 Community CLI, Backend는 NestJS 11 / Prisma 6.19.3 / PostgreSQL 17 / Redis다.
- Android identity는 package/namespace `com.dsm.dailyup`, 표시 이름 `DailyUp`, minSdk 24, compile/targetSdk 36이다. 과거 Expo·웹 prototype과 learning-site 자료는 현재 제품 계약이 아니다.
- branch 통합은 완료되어 main만 유지한다. 과거 `C:\DEV`와 `C:\dsm-integration-review`는 현재 checkout이 아니다.

## Canonical audit

- 원장: [findings.jsonl](../audits/20260817-release-audit-full-project/findings.jsonl), schema: [finding.schema.json](../audits/finding.schema.json).
- 현재 92건은 `RECHECKED 83 / UNKNOWN 5 / FIXING 3 / REFUTED 1`이다.
- UNKNOWN은 F-003/F-013/F-017/F-065/F-092, FIXING은 F-015/F-067/F-068, REFUTED는 Android-only 계약과 충돌한 F-066이다.
- 원래 CONFIRMED 55건의 로컬 처리와 독립 분석 반복은 끝났고 추가 재현 가능한 코드 수정 사항은 없었다. 이 결과는 외부 증거가 필요한 8건이나 전체 release 완료를 뜻하지 않는다.
- 상세 상태 이력, fingerprint, fix/recheck, residual risk는 원장을 사용한다. 과거 memory의 85건·57건·55건 수치는 각 checkpoint일 뿐 현재 상태가 아니다.

## 구현 checkpoint

- Auth/session: access JWT `sid`, 활성 refresh family, user/epoch fence, logout commit 경계, provider/profile 복구 경쟁을 방어한다. 실제 provider 계정 전환과 운영 guard latency는 미검증이다.
- Task/offline: authenticated user scope, idempotency, logical clock와 server time, durable outbox, owner 전환 fence, 날짜·interval·completion 및 DTO 입력을 방어한다. 실제 socket-cut·구버전 rollout·실기기 재실행은 남아 있다.
- Notification/realtime: Android native expiry receiver, ticket/scope cancel, notification client lifecycle, Firebase retry, realtime bus/WebSocket와 owner fence를 구현했다. actual FCM과 다중 인스턴스 운영은 미검증이다.
- Product UI: calendar, statistics, profile, notification panel, offline 상태, task sheet 접근성과 opener focus 복원을 구현했다. F-047은 API36 TalkBack16 AVD와 독립 검토로 RECHECKED다.
- Ranking: PostgreSQL window projection, Redis immutable generation과 fencing, cache completeness 검증, bounded fallback을 구현했다. 실제 production cardinality·SLO·managed failover는 미검증이다.
- Backend production: Docker non-root 실행, migration-before-start, liveness `/health`, dependency readiness `/health/ready`를 구현했다. 실제 platform traffic mapping은 미검증이다.
- Account deletion/legal: DB cascade transaction, Android session/Keychain/store fence와 2단계 UI를 구현했다. 공개 URL·외부 요청 절차·Play Data safety·signed-device 증거가 없어 F-067/F-068은 FIXING이다.

## 2026-09-17 현재 검증

- Backend: Jest 43 suites/960 tests, production-start 3/3, Nest build, `tsc --noEmit -p tsconfig.spec.json`, non-fixing ESLint가 통과했다. Ranking Redis unavailable 경고는 test fallback 경로에서 예상된 로그다.
- Front: Jest 51 suites/1,156 tests와 `tsc --noEmit --incremental false`가 통과했다. ESLint는 error 0, warning 44이며 `--max-warnings 0`에서 경고 budget 때문에 exit 1이다.
- Git: 변경 후보의 일반적인 private-key/token 패턴을 경로 단위로 검사했다. 발견 항목은 test fixture의 placeholder token/secret 문자열이며 실제 credential은 확인되지 않았다.
- `git diff --check`는 memory 압축 전 통과했다. memory 편집 뒤 UTF-8/LF, link, hash와 최종 staged diff를 다시 확인한다.

## 이전 실환경에 가까운 로컬 증거

- API24 debug APK에서 taskAffinity=null, native notification display/expiry/replacement/ticket·scope cancel, process kill 뒤 receiver 재시작을 확인했다.
- API36 AVD에서 실제 TalkBack service/touch exploration으로 task sheet heading focus, 배경 tree 격리, Android Back 닫힘, opener focus 복원을 확인했다.
- 격리 PostgreSQL17/Redis와 Linux Docker image에서 9 migrations, uid1000, migration→start, readiness 200→DB stop 503→복구 200, migration 실패 exit 1을 확인했다.
- 50,000 user/350,000 score 단일 호스트 합성 benchmark와 장애·복구를 실행했다. 이 수치는 production SLO, managed Redis failover, 다중 인스턴스 증거가 아니다.
- 최신 설치 audit는 Backend high 3, Front moderate 12/high 0이었다. dependency 경고가 남아 있으므로 audit 0 또는 release-ready로 표현하지 않는다.

## 배포 결정과 외부 경계

- 포트폴리오 Backend는 Render Free Web Service, DB는 Neon Free, Redis는 Upstash Free로 결정했다. `render.yaml`의 local Docker preflight는 통과했다.
- 신규 Play Console 등록은 보류한다. Render/Neon/Upstash 계정 연결, secret 입력, 공개 deploy, legal URL/DNS, Firebase/OAuth/signing, 실제 기기·provider 계정은 아직 제공되지 않았다.
- 공개 배포·결제·약관·Console·운영 DB·credential·keystore는 owner action이다. 실제 값은 Git·문서·채팅·일반 로그에 남기지 않는다.
- 열린 finding별 준비·자동 probe·사람 확인·종결 증거는 [외부 환경 작업표](../docs/2026-09-14-external-environment-provisioning.md)와 [잔여 gate 보고서](../audits/20260817-release-audit-full-project/2026-09-14-remaining-gates.md)를 따른다.

## 로컬 실행

- `. .local/env.ps1` 후 `.local/dev.cmd backend|metro|emulator|android|build|db|stop`, `.local/setup-resume.ps1 -Action db|health`를 사용한다.
- Metro의 `FallbackWatcher`/`CMakeTmp ENOENT`는 `.local/metro.config.cjs`의 native build blocklist와 cold reset으로 처리한다. Jest Keychain failure가 cache에만 나타나면 fresh project-local cache에서 재검증하고 fail-closed storage를 유지한다.
- Docker Desktop은 per-user 설치본을 사용한다. 실제 DB 작업은 `docker compose up -d --wait db redis`→Prisma generate/migrate→test/build/lint→loopback health 순서다.
- `.local` 산출물과 실제 env/key, memory recovery 파일은 일반 검색·stage·handoff 입력에서 제외한다.

## 근거 라우팅

- 현재 목표·다음 순서: [plan.md](./plan.md)
- 열린 gate와 완료 checkpoint: [checklist.md](./checklist.md)
- 전체55 구현·검증: [2026-09-11-all55-progress.md](../audits/20260817-release-audit-full-project/2026-09-11-all55-progress.md)
- release·실기기·운영 보충: [2026-09-14-remaining-gates.md](../audits/20260817-release-audit-full-project/2026-09-14-remaining-gates.md)
- 조건부 오류 재사용: [error-resolution-playbook.md](./error-resolution-playbook.md)
