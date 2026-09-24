# DSM 실행 계획 — 2026-09-24

## 진행: PUB-20260924 — 현재 작업 Git 게시

- 승인: 사용자 `현재까지 작업 내역 깃에 푸쉬 진행해`. 기존 리뷰·수정·memory 변경30파일의 명시적 stage/commit 및 origin/main 일반 push를 승인 범위로 사용한다.
- 시작: main/HEAD/원격 main 모두 `efd77053c71a5e7bf4ec7a4e8e3c034594ad8ae2`, fetch/ls-remote 대조와 ahead/behind0/0 확인. Git index는 비어 있고30파일 변경이 있다.
- 실행 프로파일: 메인은 게시·memory를 담당하고 기존 reviewer1명이 변경 범위·게시 제외 파일·과거 검증 경계를 읽기 전용으로 교차 확인한다. 모델/effort 상속·전환 없음, 정확 effort 미확인. 제품 변경/새 release-audit 없이 이전 FIX-20260922 증거를 재사용한다.
- writable: memory의 plan/context/checklist/README 네 파일만 게시 상태로 갱신한다. stage allowlist는 시작 시 확인한 FIX-20260922 제품17파일과 검증 runner1파일, memory5파일, 리뷰보고서2파일, 보충감사4파일·수정감사1파일의 정확30경로다. ignored local/env/credential/cache/recovery는 포함하지 않는다.
- 절차/완료 기준: 현재 diff·이전 검증·기밀/문서 무결성 확인 → exact paths stage와 staged diff 검증 → 작업 commit/push → 확인된 게시 사실을 memory checkpoint로 commit/push → local HEAD와 원격 refs/heads/main SHA 일치 및 clean 확인. force push·제품 추가 수정·운영 배포는 수행하지 않는다. F-101/외부8건은 그대로 유지한다.

## 최근 완료: FIX-20260922 — 로컬 리뷰 결함 8건

- 승인: 사용자 `현재 따로 승인 없이 처리 가능한 부분을 수정 진행해`. 이 지시를 기존 리뷰9건의 비파괴 코드·회귀 수정에 대한 구현 승인으로 사용한다. 같은 승인 재요청 없이 진행한다. 외부 계정/secret/배포·실DB 데이터 변경·migration·의존성 변경·stage/commit/push는 제외한다.
- 목표: F-093~100의 명확한 로컬 결함을 수정·회귀 검증하고 F-101은 기존 데이터/오프라인 계약을 보존하는 최소 호환 방식을 조사한 뒤 범위 안에서 처리한다. 구조·데이터 정책을 새로 결정해야 하면 그 부분만 근거와 함께 남긴다. 기존 canonical92 외부 gate는 그대로 유지한다.
- 실행 프로파일 FIX-20260922: 메인+개발 역할 최대3명 병렬, 현재 모델/effort 상속·전환 없음(정확한 effort 미확인). 인증/Front/알림의 파일 소유권을 분리해 지연 감소를 기대하며 비교 측정은 없다. 상위 위임 지침을 적용한다. 구현자·finder와 다른 reviewer가 fix-recheck한다.
- change-gate `20260922-change-gate-review-fixes`: M1 범위·기존 해결 대조 → M2 각1~2파일의 RED/GREEN 수정 → M3 전체 unit/E2E/type/lint 및 독립 fix-recheck → M4 기존 두 보충 원장 상태·memory·수정 보고 동기화. 기기/실DB/provider 미검증을 별도 유지한다.
- 개발 exact writable allowlist(단계별2파일 이하로 배정): `DSM_Back/src/auth/auth.service.ts`, `DSM_Back/src/auth/auth.service.spec.ts`, `DSM_Back/src/rankings/rankings.service.ts`, `DSM_Back/src/rankings/rankings.service.spec.ts`, `DSM_Back/src/notifications/notification-dispatcher.service.ts`, `DSM_Back/src/notifications/notification-dispatcher.service.spec.ts`, `DSM_Front/src/features/auth/session-controller.ts`, `DSM_Front/src/features/auth/session-controller.test.ts`, `DSM_Front/src/features/notifications/notification-storage.ts`, `DSM_Front/src/features/notifications/notification-storage.test.ts`.
- 메인 제품 exact writable allowlist: `DSM_Back/test/app.e2e-spec.ts`, `setup-ai.ps1`, `.ai/scripts/test-setup-ai.ps1`, `DSM_Back/src/tasks/dto/update-task.dto.ts`, `DSM_Back/test/task-input.e2e-spec.ts`, `DSM_Back/src/categories/dto/update-category.dto.ts`, `DSM_Back/test/name-input.e2e-spec.ts`. F-101은 계약 조사만 수행했고 제품 writable 범위는 확장하지 않았다.
- 메인 기록/검증 exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/checklist.md`, `.ai/memory/context.md`, `.ai/memory/README.md`, `.ai/memory/error-resolution-playbook.md`, `.ai/audits/20260920-release-audit-code-review/findings.jsonl`, `.ai/audits/20260920-release-audit-code-review/README.md`, `.ai/audits/20260922-release-audit-source-review/findings.jsonl`, `.ai/audits/20260922-release-audit-source-review/README.md`, `.ai/audits/20260922-change-gate-review-fixes/README.md`, `.ai/scripts/verify-review-fixes.ps1`, `.local/fix-20260922-backend.log`, `.local/fix-20260922-frontend.log`, `.local/fix-20260922-checks.log`. 개발자는 memory/원장을 쓰지 않는다.
- 검증: 해당 회귀의 수정 전 실패/수정 후 통과, 기본 E2E 복구, 양쪽 no-cache full tests/no-emit types/non-fixing lint, setup은 확인된 별도 임시 fixture에서 재실행 보존 검증. no secret·기존 변경 보존·diff/UTF-8/links/원장 schema·memory hash 확인.
- 완료: F-093~F-100 8건 수정·독립 RECHECKED. Backend43/970, Front51/1175, 제외 없는 HTTP E2E8/176, production-start3, 양쪽 typecheck/lint와 setup fixture 통과. Front 기존 warning44. [수정·검증 기록](../audits/20260922-change-gate-review-fixes/README.md).
- F-101 조사 결과: 기존 승인 sync의 전체 snapshot·title200/description4000/요청16KiB 계약과 legacy 장문 데이터가 충돌한다. 상태 전용 operation 확장을 후속 설계로 제안하고 CONFIRMED 유지한다. 데이터/기존 계약을 임의 변경하지 않았다. 상세 원인·다음 검증은 수정 기록을 따른다.
- 기록: 보충 원장8건의 fix/recheck 이력 반영, canonical92·원 리뷰 보고서 보존. playbook은 같은 null 원인의 ER-20260909-001 확장+신규7개로84개. 과거 검증일은 해당 재검증 record 외에 변경하지 않았다.
- 기존 해결: ER-20260726-009(refresh stable state), ER-20260911-003(boolean), 순위 transaction/시간·알림 clock·Google audience 기록을 조건 대조한다. 기존 해결과 원인이 다르면 새 검증된 record를 종료 시 추가하며 과거 검증일을 덮어쓰지 않는다.

## 이전 완료: REVIEW-20260922 — 전체 소스 재리뷰

- 승인: 사용자 `전체 소스코드 리뷰 진행해`. 제품 소스 변경 없이 현재 전체 소스와 이전 finding을 재검토한다. HEAD `efd7705`; 제품 diff 없음, 기존 memory/20260920 보고서 변경 보존.
- Audit ID/mode: `20260922-release-audit-source-review` / `release-audit`. canonical92와 20260920 보충7은 읽기 전용 대조 자료이며 기존 판정/검증일을 현재 검증으로 오인하지 않는다.
- 실행 프로파일 REVIEW-20260922: 메인과 investigator 최대3명 병렬, 후보는 finder와 분리된 reviewer로 반박 검증한다. 현재 부모 모델/effort 상속, 설정 전환 없음; 구체적인 실제 effort는 미확인이다. 분리 조사로 품질/시간 개선을 기대하나 비교 측정은 없다. 상위 런타임의 위임 지침을 적용한다.
- 마일스톤: M1 계약/인벤토리/기존 상태 확인 → M2 R1 인증·서버 데이터·Front/native와 메인의 도구/운영 조사 및 테스트 → M3 독립 후보 검증과 서로 다른 자유 탐색 라운드 → M4 보고서·원장·memory 동기화. 테스트·비파괴 메모리 probe·no-emit typecheck·non-fixing lint와 diff 검사를 사용한다.
- 메인 exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/checklist.md`, `.ai/memory/context.md`, `.ai/memory/README.md`, `.ai/codeReview/2026-09-22-full-source-review.md`, `.ai/audits/20260922-release-audit-source-review/README.md`, `.ai/audits/20260922-release-audit-source-review/findings.jsonl`, `.local/review-20260922-backend-tests.log`, `.local/review-20260922-frontend-tests.log`, `.local/review-20260922-static-checks.log`. 각 편집 단계1~2파일, 서브 writable `none`.
- 완료 기준: 실제 현재 검증과 과거 증거를 구분한 범위/발생 조건/근거/심각도/수정 제안 보고서. DB·기기·provider·배포 미실행과 열린 gate를 명시한다. 제품 수정/의존성 변경/실DB 작업/외부 조치/stage/commit/push는 범위 밖이며 리뷰 산출물 완료와 release-audit 종료는 구분한다.
- 기존 해결 검색: notification/refresh/ranking/입력/E2E 키워드로 playbook을 대조했다. 기존 VERIFIED 기록의 조건을 벗어난 신규 문제는 해결됐다고 가정하지 않는다.
- 당시 결과: [현재 보고서](../codeReview/2026-09-22-full-source-review.md)와 [이번 보충 원장](../audits/20260922-release-audit-source-review/findings.jsonl)에 신규 P2 2건 F-100/101을 CONFIRMED·미수정으로 기록했다. 이전7건도 유지한다. R5/R6 신규0이나 기본 E2E 실패·외부 gate가 남아 release-audit는 열려 있다. 검증 수치·한계는 context/checklist를 따른다.

## 이전 완료: REVIEW-20260920 — 전체 코드 리뷰 산출물

- 승인: 사용자 `전체 코드 리뷰 진행해`. 제품 수정 없이 결함·회귀·검증 공백을 검토하고 보고한다.
- Audit ID/mode: `20260920-release-audit-code-review` / `release-audit`. 기존 canonical92는 중복 대조용으로 읽고 이번 원장은 별도 유지한다. 외부 UNKNOWN gate가 남으면 release audit 종료·배포 가능으로 선언하지 않는다.
- 실행 프로파일 REVIEW-20260920: 메인+읽기 전용 investigator 최대 3명 병렬, 후보별 finder와 분리된 reviewer 검증. 현재 부모 모델/effort 상속, 명시적 전환 없음. 분리된 영역 조사로 시간 절약을 기대하나 비교 측정은 없다.
- R1: Backend 인증/사용자·알림, Backend Task/Score/Ranking/DB, Front session/offline/UI/native. 메인은 운영/배포/도구와 테스트 검증을 담당한다. 이후 서로 다른 자유 탐색 라운드와 발견 후보의 독립 반박 검증을 수행한다.
- 메인 exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/README.md`, `.ai/audits/20260920-release-audit-code-review/README.md`, `.ai/audits/20260920-release-audit-code-review/findings.jsonl`, `.ai/codeReview/2026-09-20-full-code-review.md`; 로컬 검증 로그 `.local/review-20260920-backend-tests.log`, `.local/review-20260920-frontend-tests.log`, `.local/review-20260920-static-checks.log`. 서브 writable allowlist는 `none`.
- 검증: 현재 unit tests·production-start·no-emit typecheck·non-fixing lint, 후보별 정적/비파괴 재현, 소스 변경 없음·기존 memory 정리 보존 확인. DB/실기기/외부 provider/FCM/배포는 실제 실행하지 않으면 미검증으로 남긴다.
- 산출물 완료 기준: 범위/근거/심각도/발생 조건/수정 제안과 잔여 gate가 있는 리뷰 보고서·검증 결과·원장·memory 동기화. 제품 수정·의존성 변경·DB 작업·외부 조치·commit/push는 범위 밖이다.
- 당시 결과: [리뷰 보고서](../codeReview/2026-09-20-full-code-review.md)에 신규 P2 7건 F-093~F-099를 기록했다. [보충 원장](../audits/20260920-release-audit-code-review/findings.jsonl)은 모두 미수정 CONFIRMED, 기존 canonical92는 유지했다. R4/R5 서로 다른 자유 탐색의 신규0을 확인했지만 기본 E2E 실패와 외부 gate 때문에 release-audit는 열려 있다.

## 완료 작업: MEM-20260920

- 승인: 사용자 요청 `.ai/memory 폴더를 압축 정리 갱신해`.
- 실행 프로파일: 메인 에이전트 단독·현재 세션 유지. 별도 모델/effort 전환과 위임 없음; 문서 작업으로 제품 change-gate 비대상.
- Exact writable allowlist: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/README.md`, `.ai/memory/error-resolution-playbook.md`.
- 절차: Git·감사 원장 대조 → 중복 압축·과거 검증 분리·링크 정리 → UTF-8/LF·정보 보존·diff 검증.
- 완료 기준: 활성 3파일 축소, 열린 8건·외부 승인 경계·오류 해결 77건의 조건/절차/검증/위험 보존. 결과는 [checklist](./checklist.md), 크기·해시는 [README](./README.md).
- 제품·감사 원장·recovery 수정, archive 도입, stage/commit/push와 외부 배포는 이번 범위 밖이다.

## 제품 목표와 결정

리뷰9건 중8건은 후속 사용자 지시에 따라 수정·RECHECKED했다. 남은 F-101의 장문 데이터 호환은 기존 sync 계약 확장 결정 후 구현한다. 이후 DSM v1.3 Android 앱의 공개 Backend와 legal/signing/OAuth/Firebase/실기기 환경을 준비해 기존 미종결 finding을 검증한다. 현재 구현·감사 집계·검증은 [context](./context.md), finding별 상태는 [checklist](./checklist.md)에 둔다.

- 배포 구성: Render Free Web Service + Neon Free PostgreSQL + Upstash Free Redis. 공개 API는 우선 Render `onrender.com` HTTPS 주소.
- Blueprint·local Docker preflight 완료 기록은 공개 deploy 증거가 아니다. Render 설정은 production mode이며 FCM dispatch만 비활성화돼 있다.
- 신규 Play Console 등록은 보류. 재개 시 기존 계정·초대, 계정 유형과 USD 25 등록비부터 확인한다.
- 계정 생성·결제·약관·Console 변경·secret 입력·공개 deploy·DNS/legal 게시·Firebase 활성화·signed artifact 업로드는 owner 작업이다. 실제 값은 Git·문서·채팅·일반 로그에 남기지 않는다.
- 도메인 또는 공개 legal URL, 개인정보·삭제 책임자/문의 채널, 실제 Android/OEM 기기와 provider 테스트 계정 2개가 필요하다. 준비 상태는 외부 직접 증거로 갱신한다.

## 다음 마일스톤

1. **ENV-1 Backend:** owner의 Render/Neon/Upstash 연결·Dashboard secret 입력 후 migration, 공개 `/health`·`/health/ready`, DB 장애 시 readiness503·트래픽 제외/복구와 production bootstrap 확인. Redis만 장애이면 readiness 유지·DB fallback·캐시 복구를 별도로 검증한다.
2. **ENV-2 Legal:** URL·책임자·문의 채널·개인정보/삭제 문구 확정, 공개 페이지와 외부 삭제 요청 처리 수단 게시.
3. **ENV-3 Identity:** Play 작업 재개 시 계정/초대 확인 → signing → OAuth → Firebase → internal test. release 공개값은 Git 제외 `.env.release.local`, signing은 저장소 밖 Gradle property/CI secret, Backend는 runtime secret/Firebase ADC.
4. **ENV-4 Device/operations:** 실기기·provider A/B와 운영 환경에서 열린 8건 및 공통 운영 gate를 검증한다. 직접 증거가 확보된 finding만 전이한다.

전체 절차는 [외부 환경 작업표](../docs/2026-09-14-external-environment-provisioning.md)를 따른다. 외부 작업은 이번 문서 정리 승인으로 자동 착수하지 않는다.
