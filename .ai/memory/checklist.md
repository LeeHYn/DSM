# 프로젝트 공정표

## 제품 마일스톤

- [x] M1~M5: 계획·NestJS/Expo 초기화·최초 push·Prisma/PostgreSQL 기반
- [x] M6 Auth: Google/Kakao, JWT access/refresh, bcrypt hash, logout, guard, `/auth/me`
- [x] M7 Task CRUD: create/list/get/update/soft-delete/complete + service/controller tests
- [x] M8 Category CRUD: user/default 경계, default read-only, foreign owner 숨김, duplicate 409
- [x] M9 Refresh O(1): `<recordId>.<secret>`, PK lookup + 단일 bcrypt compare
  - [ ] 선택 보류: revoked token 재사용 감지 hook
- [x] M10 DailyScore: UTC day recompute, cap 900, 6 tiers, Task 연동
  - [ ] 보류: UTC 자정 마감 Cron
- [x] M11 Ranking: DAILY/WEEKLY/TOTAL, percentile, leaderboard, snapshot
  - [ ] 보류: batch/Redis, WebSocket, 자동 snapshot Cron
- [x] M12A 알림 기반: FCM token lifecycle, Task-`NotificationSchedule` 원자 동기화, module·tests
- [/] M12B Firebase Admin + Cron
  - [x] branch A + per-device `NotificationDelivery` schema·2 migrations
  - [x] Docker persistent PostgreSQL 17 적용·zero drift·FK·index plan·restart persistence
  - [x] ADC-only provider, 30초 Cron, lease/heartbeat, per-device finalize/retry
  - [x] F-001~F-005·F-008~F-014 `RECHECKED`
  - [x] F-004 durable send marker + terminal `UNKNOWN` at-most-once
  - [x] F-010 cross-user token/FID transfer 409 + account-neutral payload
  - [x] F-007 backend 완화 + 사용자 `ACCEPTED_RISK`
  - [x] 전체 Jest 22 suites·198 tests, e2e 2, AppModule compile, TypeScript, lint·Prettier·Prisma·diff
  - [ ] 12C authenticated current-state client gate
  - [ ] 실제 ADC·FCM sandbox/test device

## 지원 작업

- [x] Sub-agent roles + exact allowlist + main integration 계약
- [x] Context Compiler `Handoff Package v1`/`AgentEnvelope v1.1`
- [x] 전체 read-only code review + 지정 품질 5건 수정
- [x] `change-gate`/`release-audit` + JSONL finding schema
- [x] 현재 프로젝트 architecture 문서
- [x] frontend 15-screen requirements 문서
- [x] design Phase 1 Expo prototype + Browser responsive QA
- [x] Docker Desktop 4.82.0 + WSL 2.7.10 + persistent local DB
- [x] 오류 해결 playbook 22 records; audit 12 `VERIFIED` + F-007 `MITIGATION_ONLY`, 과거 5 + compression 복구 1 + Obsidian cache 복구 1 + Windows npm/Jest 검증 환경 복구 2
- [x] `.ai/memory` 압축·정리
  - [x] 사용자 Anthropic 전송 승인·비밀값 scan
  - [x] exact local backup: `plan`, `checklist`, `error-resolution-playbook`
  - [x] Anthropic CLI timeout·Windows CP949 failure 확인, external 경로 중단
  - [x] `context.md` 최신 SSOT 기반 UTF-8 복구·압축
  - [x] `checklist.md` 상태 중심 압축
  - [x] `plan.md` 현재 계획 중심 압축
  - [x] structured conditional playbook 유지·default read 제외
  - [x] memory `README.md`, backup/failed artifact ignore·system routing
  - [x] size·hash·UTF-8·Markdown·핵심 invariant·diff 최종 검증
- [x] Obsidian `AiWiki` Vault와 DSM junction 연결
  - [x] 사용자 `DSM junction 연결 승인`
  - [x] 일반 directory `C:\AiWiki\AiProject` 생성
  - [x] `C:\AiWiki\AiProject\DSM` → `C:\DEV` junction 생성
  - [x] Obsidian 1.12.7에서 `C:\AiWiki` Vault 등록
  - [x] backend·front `node_modules` 제외 경로 저장
  - [x] junction target·문서 접근·비순환 구조·Obsidian 설정 readback 검증
- [x] Obsidian DSM 문서 큐레이션
  - [x] 문서 41개 전수 목록화·Obsidian 실제 노출·현재 소스 대조
  - [x] exact writable allowlist와 단계별 수정 계획 기록
  - [x] 사용자 `DSM 문서 정리 승인`
  - [x] `DSM-Current` → `.ai/docs` junction 생성·검증
  - [x] AI 지침·starter README·agent history Obsidian 색인 제외
  - [x] `DSM Overview.md` 생성과 문서 역할별 internal link 구성
  - [x] v1.3 기획 문서 4개 상태 경고 추가
  - [x] Overview 렌더링·internal link 9개·Git diff·memory 종료 검증
  - [x] junction 아래 `node_modules` Quick Switcher hard isolation
    - [x] exact path·정규식 제외와 Vault cache rebuild 재검증
    - [x] 별도 승인 후 기존 `DSM` full-source junction을 일반 컨테이너로 교체
- [x] Obsidian DSM 일반 컨테이너 전환
  - [x] 현재 junction·target과 Current/Planning 문서 목록 재검증
  - [x] exact 구조·단계·writable allowlist 기록
  - [x] 사용자 `DSM 일반 컨테이너 전환 승인`
  - [x] full-source junction 제거와 일반 `DSM` directory 생성
  - [x] `Current`·`Planning` child junction 생성
  - [x] Overview 이동·링크 및 기획 문서 architecture 링크 갱신
  - [x] stale Obsidian 제외 필터 제거·cache rebuild
    - [x] 앱 재실행과 2분 이상 대기로 cache 정체 재검증
    - [x] Computer Use helper 회복 후 `Alt+F4`·닫기 버튼 정상 종료 실패 재검증
    - [x] IndexedDB stale `node_modules` cache 확인·플레이북 일치 record 없음
    - [x] Obsidian process 제한 강제 종료·exact backup 이동 기반 cache 복구 사용자 승인
    - [x] 기존 cache 삭제 없이 `.pre-dsm-20260721` exact backup 이동·새 cache와 workspace 정상 로드
    - [x] Settings UI 제외 필터 제거·cache rebuild
      - [x] stale 제외 필터 11개 UI 삭제 action-time 사용자 확인
      - [x] 사용자 입력 중단 후 나머지 10개 제거·저장
      - [x] `app.json` readback `userIgnoreFilters: null`
      - [x] 보관함 cache rebuild UI action-time 사용자 확인·실행
  - [x] Quick Switcher·링크·junction·Git diff·memory 종료 검증

## 다음 실행 순서

1. [/] Front secure session·API client 연결 계획
   - [x] 범위·플랫폼 token 정책·온보딩·offline 정책 결정
   - [x] 경량 `fetch` client + 명시적 session state machine 선택
   - [x] 보안·동시성·Expo SDK 55 공식 문서 기준 전체 설계 재검토
   - [x] 보완된 전체 설계 사용자 승인
   - [x] 승인 설계 명세 작성·자체 검토
   - [x] 설계 명세 사용자 검토와 Git commit
   - [x] 상세 TDD 구현 계획 작성·자체 검토
   - [x] 상세 계획 사용자 검토와 Git commit 승인
   - [x] exact 1~2-file 제품 코드 구현·단계별 local commit·subagent-driven 실행 승인
   - [/] 격리 workspace 확인 후 상세 TDD 계획 실행
2. [ ] M12C permission + logout/account-switch Installation rotation + authenticated current-state sync/display
3. [ ] 별도 Firebase test project/device ADC·FCM sandbox
4. [ ] 검증 후 `FCM_DISPATCH_ENABLED` 활성 판단
5. [ ] M13 WebSocket 실시간 ranking
6. [ ] M14 Redis/batch caching

## 계속 유지할 gate

- [ ] 실제 FCM credential·message send는 sandbox 승인·12C 완료 전 금지
- [ ] 원격/운영 DB migration·reset·drop은 별도 승인 전 금지
- [ ] deploy와 Git stage·commit·push는 명시 승인 전 금지
- [ ] `ACCEPTED_RISK`를 `RECHECKED`/해결 완료로 표시하지 않음

## Front secure session·REST client 체크포인트 — 2026-07-25

- [x] Task 1~6 Backend onboarding contract와 strict CORS
- [x] Task 7~9 Expo SDK 55 test/lint/SecureStore 설정 기반
- [x] Task 10 strict API base URL policy
- [x] Task 11 safe `ApiError`
- [x] Task 12 runtime auth contract validators
- [x] Task 13 one-attempt JSON HTTP transport
- [x] Task 14 public auth API
- [x] Front 전체 Jest 9 suites·74 tests
- [x] Front `expo lint`
- [x] Front TypeScript
- [x] Tasks 7~18 로컬 커밋과 독립 검토
- [x] Task 15 token-store coordinator 직렬화·epoch race
- [x] Task 16 Native SecureStore adapter
- [x] Task 17 Web module-memory token store — reload 시 빈 상태, 독립 검토 clean
- [x] Task 18 authenticated client — single-flight·generation reuse·session ownership fence
- [ ] Task 19 이후 session state machine
- [ ] Prisma onboarding migration 실제 개발 DB 적용 — 별도 action-time 승인 필요
- [ ] dependency audit 55건 별도 compatibility/security triage
- [ ] 원격 push·PR·merge·배포 — 미승인/미실행
