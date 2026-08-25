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

## 오프라인 학습 사이트

- [x] 첨부 요구사항 UTF-8 복원·분석
- [x] 기본 checkout 전체 file inventory와 directory 구조 조사
- [x] stack·entrypoint·module·기능·핵심/반복 file 후보 분류
- [x] file별 line count와 application corpus 124 files·13,168 lines 산정
- [x] `.git`·worktree·dependency·build/cache·media·binary·lock·sensitive 제외 분류
- [x] 알려진 token/private-key pattern 비노출 scan
- [x] 정적 generator·verifier 권장안과 2개 대안 비교
- [x] pilot A/B/C file 묶음 제안
- [x] 분석 보고서와 memory plan 기록
- [x] source checkout 선택: root `960f02b`
- [x] pilot 선택: A, Task 변경 → 점수 재계산 + 알림 예약 상태 동기화 15 files
- [x] visual concept와 diagram language 설계·사용자 승인
  - [x] pilot source 실제 호출 관계 재확인
  - [x] NotificationsService 직접 호출·FCM send가 pilot 흐름 밖임을 정정
  - [x] project map desktop concept 생성·정정
  - [x] Task architecture desktop concept 생성·조건부 관계 정정
  - [x] source file desktop concept 생성
  - [x] source file mobile concept 생성
  - [x] 4개 정정 concept 원본 크기 검토
  - [x] 사용자 디자인 승인
  - [x] 승인 concept workspace 복사·design spec 고정
  - [x] asset SHA-256·명세 링크·필수 사실·금지 placeholder·whitespace 자체 검토
- [x] 서면 design spec 사용자 승인
- [x] Pilot A TDD 상세 구현 계획 작성·자체 검토
- [x] 상세 구현 계획·Subagent-Driven 실행 방식 사용자 승인
- [x] 실행 preflight 제한 해결
  - [x] current checkout이 linked worktree가 아님을 확인
  - [x] tooling/site 쓰기 가능 local sub-agent 역할 부재 확인
  - [x] Git worktree·branch·task commit 미승인 확인
  - [x] 사용자 `2`로 current root inline/no-Git 전환 승인
- [x] generator/verifier 구현
- [x] common offline template와 site skeleton
- [x] pilot 생성·source 일치 검증·사용자 승인
  - [x] Pilot A 15 source pages + 6 overview pages + 3 local assets 생성
  - [x] 전체 48 tests와 15 source fidelity·510 local link·offline verifier PASS
  - [x] 승인된 localhost server에서 1440×900·390×844 browser QA
    - [x] home·search·theme/read persistence·file 62:38·설명 탭
    - [x] mobile code/explanation·contents sheets·하단 navigation
    - [x] diagram zoom/reset·keyboard pan·pointer drag
    - [x] architecture 금지 노드·한국어 제목 줄바꿈·mobile home 여백
  - [x] QA 임시 localhost server 종료·127.0.0.1:4173 CLOSED 확인
  - [x] 2026-08-09 사용자 `Pilot A 승인`
- [/] 남은 files batch 처리
  - [x] 다음 10~20-file 기능 묶음 후보 비교·사용자 선택: B `Social Auth와 refresh rotation`
  - [x] Batch B 신규 후보 13개·883줄과 Pilot A 중복 없음 확인
  - [x] Batch B 설명 가중치·정보 구조 설계
    - [x] 설명 가중치 선택: 균형형
    - [x] 설계 1절 승인: stage-aware 누적 생성·5개 overview 정보 구조
    - [x] 설계 2절 승인: Auth 데이터 흐름·설명 경계·오류 표시 규칙
    - [x] 설계 3절 승인: 변경 범위·검증·완료 기준
  - [x] Batch B written design spec·상세 구현 계획 승인
    - [x] written design spec 작성·자체 검토
    - [x] 사용자 written design spec 검토·승인
    - [x] writing-plans 상세 구현 계획 작성·자체 검토
    - [x] 사용자 상세 구현 계획 검토·승인
  - [x] Batch B 생성·검증·사용자 승인
    - [x] Task 1 stage-aware source registry TDD: RED 확인·4 tests PASS
    - [x] Tasks 2~6 Auth content·model·pages·generator·verifier TDD
      - [x] exact reviewed exposure allowlist·reviewRequired symbol 비노출
      - [x] visible fixture token 검사에서 filename 오탐 제거
    - [x] Tasks 7~11 회귀·28 source·5 overview·report 생성
      - [x] HTML 39·source 28·asset 3, links 903
      - [x] processed 28·remaining 96·missing 0·excluded 9
      - [x] 전체 66 tests·full verifier PASS
    - [x] Task 12 desktop/mobile Browser QA·server 종료
      - [x] 1440×900 home·검색·source·overview·diagram·exercise
      - [x] 390×844 exercise·source code/explanation·contents sheet
      - [x] exercise path·SHA-256 가로 넘침 TDD 수정 및 document overflow 0
      - [x] 임시 localhost server 종료·127.0.0.1:4173 CLOSED 확인
    - [x] Tasks 13~14 scope 검증·memory closure
      - [x] `DSM_Back/**`·`DSM_Front/**` diff empty
      - [x] `.env` output 없음·내용 미조회
      - [x] QA report·plan·context·checklist·error-resolution playbook 갱신
    - [x] 2026-08-09 사용자 `Batch B 승인`
- [x] search/navigation/read-state/dark/diagram zoom 통합
  - [x] runtime unit contract와 정적 selector/output 검증
  - [x] 실제 browser interaction·persistence·responsive 관찰
- [x] Pilot A source 일치 검증 보고서
- [ ] full corpus final source 일치 검증 보고서

### 학습 사이트 승인 gate

- [x] checkout·pilot 선택 전 HTML/CSS/JavaScript/SVG를 생성하지 않음
- [x] visual design 승인 전 implementation 금지 준수
- [x] 서면 design spec 승인 전 implementation 금지 준수
- [x] 상세 구현 계획·실행 방식 승인 전 implementation 금지 준수
- [x] 실행 preflight 제한을 inline/no-Git 승인으로 해소한 뒤 구현
- [x] `DSM_Back/.env` 내용 조회·노출 금지 준수
- [x] 기존 application source와 dirty architecture document 수정 금지 준수
- [x] dependency 설치·network fetch·Git write 금지 준수

## 외부 PC setup·handoff 문서

- [x] 현재 branch·원격 ref·ahead/behind와 최신 개발 진행 기준 조사
- [x] 외부 PC setup·Git 비전달 항목·환경변수·DB·검증·승인 Gate 계약 조사
- [x] root 단일 handoff 문서 접근과 설계 사용자 승인
- [x] 설계 명세 작성·자체 검토
- [x] 상세 구현 계획 작성·자체 검토와 inline 실행 승인
- [x] root `EXTERNAL_PC_SETUP_AND_HANDOFF.md` 작성
- [x] 번호 섹션 1~16, 필수 기준값, 명령·package·env·Compose·migration 계약 검증
- [x] 내부 링크, UTF-8, trailing whitespace, secret-like pattern과 Git 상태 검증
- [x] 즉시 다음 Task 20, Task 31 change-gate와 이후 M12C 순서 명시
- [x] 기존 dirty·동시 작업 변경 보존, `.env` 비조회와 Git write·service 실행 금지 유지

## AI CONTROL SYSTEM v5.1 프로젝트 통합

- [x] 첨부 v5.1·현재 `.ai/system_prompt.md`·memory 구조·Git 상태 비교
- [x] 통합 방식 선택: 기존 프로젝트 규칙 보존 + 호환 규칙 선별 통합
- [x] 대화형 통합 설계 사용자 승인
- [x] written design spec 작성·자체 검토
- [x] written design spec 사용자 검토·승인
- [x] 상세 구현 계획 작성·자체 검토
- [x] 상세 구현 계획 사용자 검토·주 에이전트 inline/no-Git 실행 승인
- [x] `.ai/system_prompt.md` 외과적 통합
- [x] 중복·충돌·경로·Markdown·strict UTF-8·BOM·`git diff --check` 검증
- [x] 제품 소스 무변경과 기존 dirty 변경 보존 확인
- [x] memory 종료 동기화 및 결과 보고
- [x] Git stage·commit·push 미실행

## Git branch publish·동기화 — 2026-08-25

- [x] 현재 branch·upstream·dirty working tree 사전 확인
- [x] root 6 tracked·89 untracked와 `fsr` clean ahead-1 확인
- [x] 3개 commit 그룹·기존 변경 보존·`--ff-only` 동기화 계획 기록
- [x] 사용자 실행 승인
- [x] full fetch와 branch divergence 재확인
- [x] learning 66 tests·28-source verifier, backend unit 198·e2e 2·build, front TypeScript, diff 검증
- [x] root content/docs 2 commits와 `fsr` ahead-1 commit push
- [x] root·fsr·main `0/0` 확인; fast-forward pull 불필요
- [/] memory closure commit·push와 최종 working tree 검증
