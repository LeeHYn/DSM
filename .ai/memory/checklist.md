# DSM 공정표 — 2026-09-24

## PUB-20260924: 현재 작업 Git 게시

- [x] 사용자 push 승인·main/원격 일치·기존30파일 변경과 빈 index 확인.
- [/] 게시 범위·과거 테스트 증거·문서/원장 무결성·staged diff 확인.
- [ ] 작업 커밋과 origin/main 일반 push.
- [ ] 게시 결과 memory checkpoint·최종 원격 SHA/clean 확인.

## FIX-20260922: 승인된 로컬 수정

- [x] 사용자 구현 지시·현재 변경·역할 계약 대조, 수정/검증 범위 기록.
- [x] F-093/094/095/096/097/098/099/100 최소 수정·독립 RECHECKED.
- [x] F-101 호환 방식 조사: 기존 전체 replace·길이/요청 한도 유지, 상태 전용 sync 확장 제안.
- [ ] F-101 계약 확장 결정 및 구현·회귀 검증. CONFIRMED 유지, [근거·후속 범위](../audits/20260922-change-gate-review-fixes/README.md).
- [x] Backend970/Front1175·표준 E2E176·production-start3·양쪽 types/lint·setup fixture 통과. Front 기존 warning44; 8건 구현자 분리 fix-recheck 완료.
- [x] 감사 상태·수정 보고·playbook84·활성 memory 동기화. 최종 무결성은 [수정 기록](../audits/20260922-change-gate-review-fixes/README.md).

## REVIEW-20260922: 전체 소스 재리뷰

- [x] 현재 Git/계약/활성 memory 확인, 이전 변경 보존과 제품 diff 없음 확인, 실행 범위 기록.
- [x] 영역별 조사, 기존7건 대조, 현재 unit/HTTP/type/lint 검증. Backend960/Front1156·production-start3·도구20 통과, 기본 E2E 실패; 제외 진단165 통과.
- [x] 신규 F-100/101을 각 독립 reviewer2명이 반박 검증. R5/R6 별도 신규0, 제품·기기·외부 gate와 구분.
- [x] [보고서](../codeReview/2026-09-22-full-source-review.md)·[감사 기록](../audits/20260922-release-audit-source-review/README.md)·memory 동기화. 최종 무결성 결과는 감사 기록을 따른다.

### 이번 신규 코드 gate — 후속 수정 상태

- [x] F-100 RECHECKED: Google 인증서 transport의 실제 취소·종료 기한과 cold/expired cache 경합 검증.
- [ ] F-101: 일반 Task API와 full replacement의 제목 길이 계약·기존 장문 데이터 완료/완료 해제 호환성.

이번2건·아래 이전7건을 함께 유지한다. 기존 canonical92와 외부8건의 상태는 바꾸지 않았다. 리뷰 산출물 완료는 release-audit 종료가 아니다.

## REVIEW-20260920: 전체 코드 리뷰

- [x] 기존 memory 변경 보존, 역할/감사 계약·canonical92 상태 확인, 실행 범위 문서화.
- [x] 영역별 정적 리뷰와 현재 테스트/타입/lint 실행. Backend960/Front1156·production-start3 통과, 기본 E2E 실패(F-096); 제외 진단165 통과.
- [x] 후보 중복 제거·독립 반박 검증, R4/R5 서로 다른 자유 탐색 신규0 기록.
- [x] [보고서](../codeReview/2026-09-20-full-code-review.md)·[보충 원장](../audits/20260920-release-audit-code-review/findings.jsonl) 작성, 검증 주체/한계 교차검토와 memory 동기화.

### 이전 신규 코드 gate — 후속 7건 모두 RECHECKED

- [x] F-093 RECHECKED: refresh5xx의 token/grant 보존과 cold bootstrap/offline 재시도 복구.
- [x] F-094 RECHECKED: 알림 dispatch의 여러 schedule 처리량과5분 조회창.
- [x] F-095 RECHECKED: 개인 순위의 일관된 DB 읽기와 snapshot 저장.
- [x] F-096 RECHECKED: E2E AppModule의 custom WebSocket adapter 초기화.
- [x] F-097 RECHECKED: setup 재실행 시 현재 prompt/memory 보존.
- [x] F-098 RECHECKED: required scalar null PATCH와 Prisma 저장 계약 일치.
- [x] F-099 RECHECKED: 정상 시계 보정 후 notification history 복구·신규 알림/설정 유지.

후속 사용자 지시로 위7건의 로컬 수정·독립 재검토를 완료했다. 기존 canonical92와 아래 외부8건은 이번 보충 원장7건과 구분한다. 리뷰 산출물 완료는 release-audit 종료가 아니다.

## MEM-20260920: 문서 정리

- [x] 시작 Git clean·main/로컬 origin/main `efd7705`, 감사 원장 92건의 상태 확인.
- [x] 역할별 중복 압축, 과거 테스트와 이번 문서 검증 분리, 오류 해결집 검색 index·과거 링크 정리.
- [x] strict UTF-8/LF·상대 링크·77개 record 본문/ID·열린 gate 상태·변경 범위 검증. 크기/hash는 README에 기록.

## 제품 checkpoint

- [x] 로컬 구현·회귀·독립 재검토와 API24 알림/API36 TalkBack, 격리 Docker migration/readiness 검증 기록 보존.
- [x] Render Blueprint·local Docker preflight와 Render/Neon/Upstash 선택 기록 보존.
- 상세 수치·실행일·한계는 [context](./context.md), 목표·승인·준비 순서는 [plan](./plan.md). 아래 미완료 항목은 이번 문서 작업의 실행 범위가 아니다.

## 열린 finding — 원장 대조 2026-09-22

| ID | 상태 | 종결에 필요한 직접 증거 |
|---|---|---|
| F-003 / F-017 | UNKNOWN | 실제 upload/Play signer·production OAuth/API identity, signed artifact의 실기기 cold start·link open |
| F-013 | UNKNOWN | 실제 platform의 readiness traffic mapping·DB 장애 제외/복구·production bootstrap |
| F-015 | FIXING | Firebase ADC·Android app·실제 토큰, foreground/background/종료 FCM 수신·notification lifecycle |
| F-065 | UNKNOWN | signed release·malicious-app PoC·Recents/OAuth return·구형 Android/OEM patch matrix |
| F-067 / F-068 | FIXING | 공개 privacy/account-deletion URL·외부 삭제 요청 수단·책임자/문의 채널·signed-device 삭제·Play Data safety 일치 |
| F-092 | UNKNOWN | 실제 provider A→B 전환 시 이전 engine/outbox/notification의 새 계정 접근 차단 |

## 다음 검증 순서

1. [ ] **ENV-1:** Render/Neon/Upstash 계정 연결·Dashboard secret·공개 deploy 후 migration/health/readiness 확인. DB 장애의503·트래픽 제외/복구, Redis만 장애인 경우 readiness 유지·DB fallback·캐시 복구를 분리 검증.
2. [ ] **ENV-2:** legal URL·책임자·문의 채널 확정, privacy/deletion 페이지·외부 요청 처리 게시와 문구/실제 동작 대조.
3. [ ] **ENV-3:** Play 재개 시 기존 계정/초대 확인. 신규 등록·결제는 보류; upload key/Play App Signing→Web/Android OAuth→Firebase Android app/ADC→internal track.
4. [ ] **ENV-4:** 실제 Android/OEM 기기·provider 계정 2개 준비 후 위 8개 gate 실행. 증거가 생긴 finding만 상태 전이.
5. [ ] **운영 공통:** legacy data backfill/validate, socket-cut·구버전 rollout·실기기 재실행, guard/cache 성능, managed Redis failover·다중 인스턴스·rollout/rollback, release 후보 dependency audit.

로컬·합성 통과는 actual FCM/OAuth/OEM/production/Play/release 완료가 아니다. 실제 env/key/credential/keystore·local cache와 recovery 파일의 보존 경계는 [README](./README.md)를 따른다.
