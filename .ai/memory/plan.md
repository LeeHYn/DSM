# 목표
DSM 앱의 백엔드/프론트엔드를 단계적으로 구축합니다.

# 완료된 마일스톤
1. 백엔드/프론트엔드 세팅 계획 수립 및 승인 대기
2. `DSM_Back` (NestJS) 초기 세팅
3. `DSM_Front` (React Native/Expo) 초기 세팅
4. 생성된 프로젝트 구조를 Git에 커밋 및 원격 저장소에 푸시
5. `DSM_Back` 백엔드 기반 구축 + DB/Prisma 세팅
6. `DSM_Back` 인증(Auth) 모듈 구현

7. 일과(Task) CRUD API 구현
8. 카테고리(Category) CRUD API 구현
9. 리프레시 토큰 조회 구조 개선 — 토큰에 레코드 ID 임베드(`<recordId>.<secret>`)로 O(1) 조회 (계획: docs/superpowers/plans/2026-06-06-dsm-refresh-token-lookup.md)
10. 점수(DailyScore) 집계 로직 구현 — FR-03 점수 공식 + 누적 totalScore/티어, 일과 변경 시 재계산 + 조회 API (계획: docs/superpowers/plans/2026-06-07-dsm-daily-score.md)
11. 랭킹/백분위(FR-04) 구현 — 일간/주간/누적 내 순위·상위%, TOP100 리더보드, RankingSnapshot 영속화. 조회 시 실시간 계산, 전체 유저 기준 (계획: docs/superpowers/plans/2026-06-07-dsm-rankings.md)

# 다음 마일스톤
12. **12A 알림 기반** — FCM 토큰 수명주기 API + Task-`NotificationSchedule` 동기화
   - 상세 계획: `.ai/docs/2026-07-10-milestone-12a-notification-foundation.md`
   - 범위: 토큰 등록·갱신·재활성화·폐기, Task mutation과 `PENDING/CANCELLED` 예약 상태 동기화, 단위 테스트
   - 제외: 실제 Firebase 발송·Cron(12B), 프런트 알림(12C), WebSocket(13), Redis/랭킹 배치(14)
   - 판정: 기존 Prisma 모델과 Nest 의존성으로 구현 가능. 12A에는 새 패키지·Firebase 자격증명·schema migration이 필요하지 않음(실제 DB의 현 schema 적용 여부는 구현 전 별도 확인)
   - **계획 작성 승인 기록**: 2026-07-10 사용자가 알림 방향으로 작업 진행을 승인함
   - **상태**: 상세 계획 작성 완료 — **구현 승인 대기**

# 지원 작업 계획: 서브 에이전트 운영 체계

## 목표
- `.ai/agents/`를 저장소의 서브 에이전트 역할 문서 SSOT로 만든다.
- 각 역할에 책임, 읽기 범위, 수정 가능한 파일/경로, 금지 사항, 승인 필요 작업, 완료 보고 형식을 명시한다.
- 이후 메인 에이전트가 서브 에이전트를 생성할 때 공통 규칙과 해당 역할 문서를 반드시 읽어 프롬프트에 반영하도록 연결한다.

## 역할 문서
1. `.ai/agents/README.md`: 공통 운영 계약, 우선순위, 위임 프롬프트 필수 항목, 동시 작업 충돌 방지 규칙
2. `.ai/agents/investigator.md`: 저장소 조사 전용, task assignment의 `read scope`에 지정된 소스만 읽기 가능, 파일 수정 금지
3. `.ai/agents/planner.md`: 계획 수립 전용, 소스 수정 금지, 승인된 `.ai/memory/plan.md` 및 계획 문서만 수정 가능
4. `.ai/agents/backend-developer.md`: 할당받은 `DSM_Back/` 파일과 대응 테스트만 수정 가능
5. `.ai/agents/frontend-developer.md`: 할당받은 `DSM_Front/` 파일과 대응 테스트만 수정 가능하며 `DSM_Front/AGENTS.md`의 Expo v55 규칙 준수
6. `.ai/agents/reviewer.md`: 소스와 diff 검증 전용, 소스 수정 금지, 승인된 리뷰 보고서 경로만 수정 가능

## 공통 권한과 한계
- 모든 개발 역할은 위임 프롬프트에 명시된 정확한 파일 allowlist 안에서만 수정한다.
- 모든 역할은 작업 시작 전 `.ai/memory/plan.md`, `context.md`, `checklist.md`를 읽되, 역할 문서가 허용하지 않으면 공유 memory 파일을 수정하지 않는다.
- 하위 디렉터리에 더 구체적인 `AGENTS.md`가 있으면 해당 규칙을 함께 적용하며, 충돌 시 더 높은 우선순위와 더 제한적인 규칙을 따른다.
- 동시에 실행되는 에이전트끼리 수정 파일이 겹치면 작업을 시작하지 않고 메인 에이전트에 보고한다.
- 서브 에이전트는 사용자 승인 없이 커밋, 푸시, 브랜치 변경, 의존성 설치, DB 마이그레이션, 외부 서비스 호출, 비밀정보 접근, 파괴적 명령을 실행하지 않는다.
- 범위 밖 변경이 필요하면 임의 확장하지 않고 사유와 필요한 파일을 보고한 뒤 중단한다.
- 검증 명령은 역할과 위임 범위 안에서만 실행하며, 실패를 숨기거나 우회하지 않는다.
- 완료 시 수정 파일, 실행한 검증, 실패/잔여 위험, 범위 준수 여부를 정해진 형식으로 보고한다.

## 적용 연결
1. `.ai/system_prompt.md`에 서브 에이전트 생성 전 `.ai/agents/README.md`와 선택 역할 문서를 읽는 절차를 추가한다.
2. 루트 진입 문서(`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`)의 현재 유효하지 않은 `C:/dsm/.ai/system_prompt.md` 참조를 저장소 로컬 `.ai/system_prompt.md`로 정리한다.
3. 메인 에이전트가 위임 시 역할명, 목표, 읽기 범위, 수정 파일 allowlist, 금지 범위, 검증 명령, 완료 조건을 명시하도록 강제한다.

## 실행 순서
1. 사용자 승인 후 `.ai/agents/README.md`와 역할 문서를 1~2개씩 작성한다.
2. 각 단계마다 문서의 경로 권한과 금지 규칙을 상호 검토한다.
3. `.ai/system_prompt.md`와 루트 진입 문서를 최소 단위로 연결한다.
4. 가상 위임 시나리오로 역할별 허용/거부 사례를 점검하고 `.ai/memory/checklist.md`에 결과를 기록한다.

## 승인 게이트
- 이 계획의 승인 전에는 `.ai/agents/` 생성, 역할 문서 작성, 시스템 지침 및 루트 진입 문서 수정을 시작하지 않는다.
- **승인 기록**: 2026-07-10 사용자가 이 지원 작업 계획의 구현을 명시적으로 승인했다.
- **완료 기록**: 2026-07-10 공통 계약 1개와 역할 문서 5개, 시스템 지침 연결, 루트 진입 문서 연결과 역할 계약 감사·수정을 완료했다.

# 지원 작업 계획: 에이전트 간 Context Compiler 역할

## 목표
- 에이전트가 다른 에이전트에 프롬프트를 전달하거나 여러 문서에서 작업 문맥을 추출할 때, 자연어를 고정된 기계 판독형 중간 표현인 `AgentEnvelope v1`로 변환하는 읽기 전용 역할을 추가한다.
- 번역 과정에서 권한 우선순위, 부정 표현, 숫자, 정확한 경로, 승인 상태와 중단 조건이 누락되거나 의미가 바뀌지 않도록 원문 추적성을 유지한다.
- 대상 에이전트가 결과를 다시 사람이 읽는 보고로 풀어낼 수 있도록 encode/decode 계약을 함께 정의한다.

## 역할 결정
- 역할명: `context-compiler`
- 기본 모드: `read-only`, `exact writable allowlist: none`
- 이 역할은 실제 기계어·바이너리 코드나 소스 코드를 생성하지 않는다. 입력 문맥을 구조화된 JSON envelope로 컴파일한다.
- 이 역할은 `.ai/system_prompt.md`, `.ai/agents/README.md`, 선택 역할 문서와 적용되는 `AGENTS.md`의 필수 원문 읽기를 대체하지 않는다.
- 문서에 없는 결정을 만들거나 충돌을 임의 해결하지 않고, `confirmed`, `inferred`, `unknown`, `conflict`를 구분한다.

## `AgentEnvelope v1` 최소 계약
1. `protocol`, `mode`, `target_role`
2. 기존 위임 필수 필드인 `objective`, `read_scope`, `exact_writable_allowlist`, `forbidden_scope`, `verification`, `done_condition`
3. `instruction_precedence`, `verbatim_constraints`, `source_map`
4. `confirmed_facts`, `inferences`, `unknowns`, `conflicts`
5. `output_contract`, `stop_conditions`

## 적용 범위
- encode: 사용자·메인 에이전트의 자연어 요청과 허용된 문서 범위를 `AgentEnvelope v1` JSON으로 변환한다.
- decode: 에이전트의 구조화 결과를 한국어 보고로 변환하되, finding·실패·잔여 위험을 숨기거나 완화하지 않는다.
- 여러 문서 또는 여러 에이전트 사이의 복잡한 handoff에 사용한다. 단순 단일 파일 작업에는 메인 에이전트가 불필요한 중간 단계를 생략할 수 있다.
- 민감정보, `read scope` 밖 문서, 외부 서비스와 저장소 상태 변경은 다루지 않는다.

## 수정 대상과 실행 순서
1. 역할 계약 추가 및 레지스트리 연결
   - `.ai/agents/context-compiler.md`
   - `.ai/agents/README.md`
2. 호출 조건과 비대체 원칙 연결
   - `.ai/system_prompt.md`
3. 정적 계약 검증 후 진행 상태 기록
   - `.ai/memory/checklist.md`

각 단계는 정확한 파일 1~2개만 수정한다. 기존 사용자의 미커밋 변경은 보존하며, 역할 문서와 공통 계약의 충돌 여부를 diff로 다시 확인한다.

## 검증 시나리오
- 허용: 다중 문서에서 목표·정확한 경로·승인 게이트를 출처와 함께 envelope로 변환한다.
- 거부: 필수 위임 필드가 빠졌거나 원문 간 충돌이 해결되지 않은 상태에서 정상 envelope를 생성한다.
- 보존: `하지 않는다`, 수치, 파일 경로, `구현 승인 대기` 같은 원문 제약을 round-trip 후에도 동일하게 유지한다.
- 경계: context compiler 결과만 읽고 필수 SSOT 원문 확인을 생략하려는 위임을 거부한다.

## 승인 게이트
- 이 계획의 승인 전에는 `.ai/agents/context-compiler.md`, `.ai/agents/README.md`, `.ai/system_prompt.md`, `.ai/memory/checklist.md`를 이 작업 목적으로 수정하지 않는다.
- **승인 기록**: 2026-07-15 사용자가 Context Compiler 역할 계획의 구현을 명시적으로 승인했다.
- **완료 기록**: 2026-07-15 `context-compiler` 역할 계약과 역할 레지스트리, 시스템 호출 프로토콜 연결 및 허용·거부·round-trip·원문 비대체 정적 검증을 완료했다.
- **상태**: **구현 및 검증 완료**

# 지원 작업 계획: Context Compiler 하이브리드 Handoff 확장

## 목표
- `context-compiler`가 JSON만 반환하지 않고, 대상 에이전트가 바로 실행할 수 있는 영어 Markdown 프롬프트를 함께 제공한다.
- 원문 문서 전체 또는 구조가 필요한 경우 대상 에이전트가 정확한 `.md` 파일을 직접 읽도록 handoff에 명시한다.
- JSON은 권한, 범위, 검증, 완료 조건과 source map을 전달하는 control plane으로 유지한다.

## 기본 출력: `Handoff Package v1`
1. `English Task Prompt`
   - 자연어 작업 지시를 영어로 번역한 Markdown 프롬프트
   - 목표, 실행 순서, 금지 범위, 검증, 완료 조건과 중단 조건 포함
   - 대상 에이전트의 결과 보고 언어는 `response_language`로 지정하며 기본값은 한국어(`ko`)
2. `Required Markdown Reads`
   - 대상 에이전트가 작업 전에 직접 읽어야 할 정확한 `.md` 경로
   - 각 문서의 읽기 이유와 `full` 또는 정확한 section 범위 포함
3. `AgentEnvelope v1.1`
   - 기존 위임 필수 필드와 권한·출처·충돌 정보를 담는 JSON control block
   - `delivery_mode`, `prompt_language`, `response_language`, `required_markdown_reads`, `translation_notes` 필드 추가

## 라우팅 원칙
- 단순하고 완결된 작업은 영어 프롬프트만 전달할 수 있다.
- 권한·수정 범위·검증 계약이 필요한 위임은 영어 프롬프트와 JSON control block을 함께 전달한다.
- SSOT, 표, 코드 블록, 긴 규칙, 전체 문맥 의존성이 있는 문서는 번역 요약으로 대체하지 않고 `Required Markdown Reads`에 넣어 대상 에이전트가 원본 `.md`를 직접 읽게 한다.
- `.ai/system_prompt.md`, 공유 memory, 공통 계약, 대상 역할 문서와 적용되는 `AGENTS.md`는 기존과 같이 필수 원문 직접 읽기를 유지한다.

## 영어 번역 보존 규칙
- 실행 지시와 설명은 명확한 명령형 영어로 번역한다.
- 파일 경로, 명령어, 코드 심볼, JSON 필드, 역할명, gate 이름, 수치와 인용된 원문은 번역하거나 정규화하지 않는다.
- `하지 않는다`, 승인 상태, 금지 사항과 중단 조건은 원문을 `verbatim_constraints`에 보존하고 영어 프롬프트에도 동일 의미로 반영한다.
- 번역이 둘 이상의 의미로 해석되면 임의 선택하지 않고 `translation_notes`, `unknowns` 또는 `conflicts`에 기록하고 실행용 handoff 생성을 중단한다.
- Markdown 문서 전체를 무조건 영어로 재작성하지 않는다. 필요한 원문을 직접 읽게 하고, 영어 프롬프트에는 작업에 필요한 지시만 번역한다.

## 수정 대상과 실행 순서
1. 하이브리드 출력 계약과 역할 레지스트리 갱신
   - `.ai/agents/context-compiler.md`
   - `.ai/agents/README.md`
2. 호출·라우팅 규칙과 기술 결정 갱신
   - `.ai/system_prompt.md`
   - `.ai/memory/context.md`
3. 검증 후 승인·완료 상태 기록
   - `.ai/memory/plan.md`
   - `.ai/memory/checklist.md`

각 수정 단계는 정확한 파일 1~2개로 제한하고 기존 미커밋 변경을 보존한다.

## 검증 시나리오
- 영어 번역: 한국어 작업 지시가 영어 명령형 프롬프트로 생성되는지 확인한다.
- Markdown 직접 읽기: SSOT 문서가 `required_markdown_reads`의 정확한 경로와 읽기 범위로 전달되는지 확인한다.
- 하이브리드 출력: 영어 프롬프트, Markdown read list와 JSON control block이 함께 존재하는지 확인한다.
- 원문 보존: 경로, 명령어, 코드 심볼, 수치, 부정 표현과 승인 게이트가 번역 전후 동일한지 확인한다.
- 거부: 번역 모호성, 필수 문서 누락 또는 상충하는 원문이 있으면 실행용 handoff를 만들지 않는지 확인한다.

## 승인 게이트
- 이 확장 계획의 승인 전에는 `.ai/agents/context-compiler.md`, `.ai/agents/README.md`, `.ai/system_prompt.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`를 이 작업 목적으로 수정하지 않는다.
- **승인 기록**: 2026-07-15 사용자가 Context Compiler 하이브리드 Handoff 확장을 명시적으로 승인했다.
- **완료 기록**: 2026-07-15 영어 Markdown 프롬프트, 필수 Markdown 직접 읽기 목록과 `AgentEnvelope v1.1` JSON control block으로 구성된 `Handoff Package v1` 계약, 시스템 라우팅 및 기술 결정 갱신을 완료했다. 영어 번역·원문 보존·Markdown 라우팅·JSON 일치·거부 시나리오 검증을 통과했다.
- **상태**: **구현 및 검증 완료**

# 품질 작업 계획: 현재 프로그램 전체 읽기 전용 코드 리뷰

## 목표
- 현재 checkout의 백엔드와 프런트엔드 전체 제품 코드를 읽고 실제 결함, 회귀 위험, 보안 문제, 데이터 일관성 문제와 중요한 검증 누락을 찾는다.
- 각 finding에 심각도, 정확한 `path:line`, 발생 조건·영향과 구체적인 수정 방향을 제공한다.
- 제품 소스, 테스트, 설정, 의존성, DB와 외부 시스템은 변경하지 않는다.

## 현재 기준선
- `DSM_Back`: 70개 reviewable 파일, 이 중 소스·설정 형식 69개
- `DSM_Front`: 50개 reviewable 파일, 이 중 소스·설정 형식 23개
- `DSM_Back`, `DSM_Front` 안에는 현재 미커밋 변경이 없다.
- 루트와 `.ai`, 계획 문서의 기존 미커밋 변경은 사용자 작업으로 간주하고 되돌리거나 정리하지 않는다.

## 포함 범위
1. 백엔드
   - `DSM_Back/src/**/*.ts`
   - `DSM_Back/prisma/schema.prisma`
   - `DSM_Back/test/**/*`
   - `DSM_Back/package.json`, lockfile, TypeScript·Nest·Jest·ESLint 설정
2. 프런트엔드
   - `DSM_Front/src/**/*`
   - `DSM_Front/scripts/reset-project.js`
   - `DSM_Front/app.json`, `package.json`, lockfile, TypeScript 설정
   - `DSM_Front/AGENTS.md`와 런타임 구조 확인에 필요한 README
3. 교차 계약
   - API route·DTO·응답 형식과 프런트 소비 코드 일치
   - 인증·인가·소유권, 환경 변수, 오류 처리와 비밀정보 노출
   - UTC 날짜 경계, 점수·랭킹 재계산, soft delete와 DB 제약
   - Expo Router 진입점, 플랫폼 분기, 테마·접근성과 런타임 설정

## 제외 범위
- `node_modules/`, `dist/`, coverage, cache와 생성 파일의 내용
- PNG·SVG 등 바이너리/시각 자산의 품질 평가. 코드 참조와 파일 존재 여부만 확인
- `.ai/`, `docs/`, `Planing Document/` 자체의 내용 리뷰
- 외부 서비스 호출, 실제 DB 연결, 배포, 인증 정보 접근
- lint, formatter, build, coverage와 e2e처럼 파일 또는 외부 상태를 바꿀 수 있는 검증

## 리뷰 순서
1. 엔트리포인트, 모듈 그래프, Prisma schema, 환경 변수와 신뢰 경계를 파악한다.
2. 백엔드의 Auth, Category, Task, Score, Ranking, 공통 filter와 Prisma 계층을 소스·테스트 쌍으로 검토한다.
3. 프런트의 Expo Router, 화면, component, hook, theme와 플랫폼별 구현을 검토한다.
4. 백엔드 API와 프런트 소비 코드, 시간·오류·상태 계약을 교차 검토한다.
5. 발견 후보를 테스트와 호출 경로로 반증하고 중복·추측·취향성 finding을 제거한다.
6. findings-first 코드 리뷰 보고서를 채팅으로 제출하고 검토하지 못한 영역과 잔여 위험을 명시한다.

## 허용 검증
- 읽기 전용 조회: `rg`, `rg --files`, `Get-Content`, `Get-ChildItem`, `git status`, `git diff`, `git log`, `git blame`
- 백엔드 unit test: local Jest를 `--runInBand --no-cache`로 실행
- 백엔드·프런트 TypeScript: local `tsc --noEmit --incremental false`
- 검증 전후 `git status --short -- DSM_Back DSM_Front` 비교
- Expo 동작에 대한 finding 후보가 있을 때만 `DSM_Front/AGENTS.md`가 지정한 Expo SDK 55 공식 문서를 읽기 전용으로 확인
- `caveman-review` 규칙에 따라 lint는 실행하지 않는다.

검증 명령이 workspace, DB 또는 외부 시스템 상태를 바꿀 가능성이 있으면 실행하지 않고 생략 사유를 보고한다.

## 결과 형식
- findings를 `P0` → `P3` 순으로 먼저 제시한다.
- 일반 finding은 `<path>:L<line>: <severity> <problem>. <fix>.` 한 줄 형식을 사용한다.
- 보안 또는 아키텍처 finding은 조건·영향·근거와 수정 방향을 충분히 설명한다.
- findings가 없으면 `발견 사항 없음`을 명시한다.
- 마지막에 검토 범위, 실행한 검증, 실패·생략 항목과 잔여 위험을 요약한다.

## 쓰기 경계와 완료 조건
- 리뷰 중 `exact writable allowlist`: `none`
- 제품 소스·테스트·설정과 리뷰 보고서 파일을 수정·생성하지 않는다.
- 승인 및 종료 상태 기록은 메인 에이전트가 `.ai/memory/plan.md`, `.ai/memory/checklist.md`에만 반영한다.
- 포함 범위의 텍스트 소스·설정을 모두 읽고, findings를 현재 줄 번호로 재검증하며, 제품 파일 변경이 없음을 확인하면 완료다.

## 승인 게이트
- 이 계획의 승인 전에는 전체 소스 리뷰, 테스트, 타입 검사를 시작하지 않는다.
- **승인 기록**: 2026-07-15 사용자가 전체 읽기 전용 코드 리뷰 실행을 명시적으로 승인했다.
- **완료 기록**: 2026-07-15 포함 범위의 백엔드·프런트엔드 텍스트 소스와 설정을 모두 검토했다. 백엔드 Jest 16개 스위트·78개 테스트와 백엔드 TypeScript 검사는 통과했고, 프런트 TypeScript 검사는 CSS module 선언 누락 1건으로 실패했다. 보안·권한·원자성·랭킹·입력 계약·운영 준비 findings를 현재 줄 번호로 재검증했으며 제품 파일 변경은 없었다.
- **상태**: **리뷰 및 검증 완료 — 후속 수정 미수행**

# 품질 수정 계획: 즉시 처리 5건

## 목표
- 전체 코드 리뷰에서 확인된 항목 중 사용자가 지정한 아래 5건만 수정한다.
  1. Google 로그인 audience 검증 강제
  2. Refresh token 동시 재사용 차단
  3. Task의 타 사용자 Category 연결 차단
  4. Task 변경과 점수 재계산의 원자성 보장
  5. 프런트 CSS module TypeScript 오류 해소
- 기존 API route와 정상 응답 형식은 유지하고 Prisma schema 및 migration은 변경하지 않는다.
- 각 수정은 회귀 테스트를 먼저 보강하거나 같은 단계에서 보강하고, 단계별 수정 파일을 1~2개로 제한한다.

## 현재 기준선
- `DSM_Back`, `DSM_Front` 제품 디렉터리에는 미커밋 변경이 없다.
- 백엔드 Jest는 16 suites, 78 tests가 통과하고 백엔드 TypeScript 검사도 통과한다.
- 프런트 TypeScript 검사는 `src/components/animated-icon.web.tsx:5`의 CSS module import에서 `TS2307` 1건으로 실패한다.
- 루트와 `.ai`, 계획 문서의 기존 미커밋 변경은 사용자 작업으로 간주하고 보존한다.

## 설계 결정

### 1. Google audience 검증
- 현재 API가 `GOOGLE` provider를 노출하므로 `GOOGLE_CLIENT_ID`를 선택 설정이 아닌 non-empty 필수 설정으로 변경한다.
- `AuthService`는 `ConfigService.getOrThrow('GOOGLE_CLIENT_ID')`로 값을 한 번 읽어 Google client 생성과 `verifyIdToken`의 `audience`에 동일한 값을 사용한다.
- `.env.example`의 빈 문자열은 실제 client ID를 요구하는 placeholder로 교체한다.
- provider feature flag 도입이나 Google 로그인 제거는 이번 범위에 포함하지 않는다.

### 2. Refresh token 단일 사용 보장
- token hash 비교는 기존처럼 record 조회 후 수행하되, 검증 성공 후 `id`, `revokedAt: null`, `expiresAt > now`를 조건으로 `updateMany`를 실행한다.
- 갱신 건수가 정확히 1인 요청만 승자로 인정하고, 0이면 재사용 또는 경합으로 간주해 `UnauthorizedException`을 반환한다.
- 기존 token revoke와 새 refresh token record 생성을 하나의 Prisma interactive transaction에서 처리한다.
- `issueTokens`가 transaction client를 받을 수 있게 하여 신규 token 생성 실패 시 기존 token revoke도 rollback되게 한다.
- token 형식, Access/Refresh TTL, logout 동작과 Prisma schema는 변경하지 않는다.

### 3. Category 소유권 경계
- Task 생성 또는 `categoryId` 변경 시 category가 `userId === actor`이거나 `isDefault === true`인지 mutation 전에 확인한다.
- 존재하지 않거나 타 사용자 소유인 category는 동일하게 `NotFoundException`으로 처리해 소유 여부를 노출하지 않는다.
- category 검증과 task mutation은 동일 transaction client를 사용한다.
- `categoryId`가 없거나 update에서 변경되지 않으면 추가 조회하지 않는다.

### 4. Task·점수 원자성
- transaction의 최상위 소유자는 `TasksService`로 정한다.
- create, update, remove, complete 각각에서 task 조회·mutation, 영향받은 UTC day의 `DailyScore` upsert, `User.totalScore/tier` 갱신을 하나의 transaction callback 안에서 처리한다.
- `ScoresService.recompute`와 내부 누적 합계 갱신은 선택적인 Prisma transaction client를 받아 모든 query를 동일 client로 실행한다. 독립 호출 시에는 기존 `PrismaService`를 사용한다.
- update가 날짜를 옮기면 기존 날짜와 새 날짜를 중복 제거한 뒤 같은 transaction에서 모두 재계산한다.
- 점수 계산 공식, 일일 상한, tier 기준과 API 응답은 변경하지 않는다.

### 5. 프런트 TypeScript 오류
- 구현 전에 `DSM_Front/AGENTS.md`가 지정한 Expo SDK 55 공식 문서를 확인한다.
- `src/types/css-modules.d.ts`를 추가해 `*.module.css`의 default export를 `Record<string, string>`으로 선언한다.
- 현재 `tsconfig.json`의 `**/*.ts` include가 declaration 파일을 포함하므로 설정 파일은 수정하지 않는다.

## 단계별 수정 순서

### Phase 0. 기준선 재확인 — 수정 없음
- 제품 디렉터리 Git 상태, 백엔드 78개 테스트, 양쪽 TypeScript 결과를 다시 확인한다.
- 기준선이 위 기록과 다르면 구현을 시작하지 않고 차이를 보고한다.

### Phase 1A. Google 환경 계약
- 수정 파일:
  - `DSM_Back/src/config/env.validation.ts`
  - `DSM_Back/src/config/env.validation.spec.ts`
- 검증:
  - 유효한 `GOOGLE_CLIENT_ID`를 반환한다.
  - 누락값과 빈 문자열을 모두 거부한다.

### Phase 1B. 환경 예시 동기화
- 수정 파일:
  - `DSM_Back/.env.example`
- 검증:
  - 예시가 빈 client ID를 정상 설정처럼 제공하지 않는지 확인한다.

### Phase 2. Google service enforcement와 Refresh token rotation
- 수정 파일:
  - `DSM_Back/src/auth/auth.service.ts`
  - `DSM_Back/src/auth/auth.service.spec.ts`
- 검증:
  - service 생성 시 필수 Google client ID를 읽고 동일 audience를 사용한다.
  - 정상 refresh는 조건부 revoke 1건 후 같은 transaction에서 새 token을 생성한다.
  - 조건부 revoke가 0건이면 401이며 새 token을 만들지 않는다.
  - 신규 token 생성 오류 시 transaction 오류가 전파된다.
  - malformed, missing, revoked, expired, wrong-secret 및 logout 기존 테스트를 유지한다.

### Phase 3. ScoresService transaction client 계약
- 수정 파일:
  - `DSM_Back/src/scores/scores.service.ts`
  - `DSM_Back/src/scores/scores.service.spec.ts`
- 검증:
  - 명시적으로 전달한 client가 task 조회, DailyScore upsert·aggregate와 User update 모두에 사용된다.
  - client를 전달하지 않은 기존 호출과 점수 계산 결과는 유지된다.

### Phase 4. Task transaction과 Category 권한 검증
- 수정 파일:
  - `DSM_Back/src/tasks/tasks.service.ts`
  - `DSM_Back/src/tasks/tasks.service.spec.ts`
- 검증:
  - create/update에서 사용자 소유 category와 default category는 허용한다.
  - 타 사용자 category와 존재하지 않는 category는 task write 전에 404로 거부한다.
  - create/update/remove/complete가 `$transaction` 안에서 task mutation과 `ScoresService.recompute(..., tx)`를 실행한다.
  - update의 이전·이후 UTC day 재계산과 동일 날짜 중복 제거를 유지한다.
  - 재계산 실패가 mutation API 실패로 전파되고 transaction 밖의 후속 write가 없는지 확인한다.

### Phase 5. 프런트 CSS module declaration
- 수정 파일:
  - `DSM_Front/src/types/css-modules.d.ts` (신규)
- 검증:
  - `animated-icon.web.tsx`의 기존 import를 변경하지 않고 프런트 TypeScript 검사가 통과한다.

### Phase 6. 통합 검증 — 수정 없음
- 백엔드 대상 테스트:
  - `env.validation.spec.ts`
  - `auth.service.spec.ts`
  - `scores.service.spec.ts`
  - `tasks.service.spec.ts`
- 백엔드 전체 Jest: local Jest `--runInBand --no-cache`
- 백엔드 TypeScript: local `tsc --noEmit --incremental false`
- 프런트 TypeScript: local `tsc --noEmit --incremental false`
- `git diff --check`와 `git status --short -- DSM_Back DSM_Front`로 범위와 비의도 변경을 확인한다.
- 실제 PostgreSQL, 외부 Google API, build, e2e와 `--fix`가 포함된 lint script는 실행하지 않는다. transaction 단일 승자와 rollback은 query 계약 단위 테스트로 검증하고 실제 DB 동시성 검증은 잔여 위험으로 보고한다.

### Phase 7. 공유 memory 종료 기록
- 1차 수정 파일:
  - `.ai/memory/plan.md`
  - `.ai/memory/context.md`
- 2차 수정 파일:
  - `.ai/memory/checklist.md`
- 승인, 실제 변경 파일, 테스트 결과, transaction ownership 결정과 잔여 위험을 기록한다.

## 구현 단계 전체 exact writable allowlist
- `DSM_Back/.env.example`
- `DSM_Back/src/config/env.validation.ts`
- `DSM_Back/src/config/env.validation.spec.ts`
- `DSM_Back/src/auth/auth.service.ts`
- `DSM_Back/src/auth/auth.service.spec.ts`
- `DSM_Back/src/scores/scores.service.ts`
- `DSM_Back/src/scores/scores.service.spec.ts`
- `DSM_Back/src/tasks/tasks.service.ts`
- `DSM_Back/src/tasks/tasks.service.spec.ts`
- `DSM_Front/src/types/css-modules.d.ts`
- `.ai/memory/plan.md`
- `.ai/memory/context.md`
- `.ai/memory/checklist.md`

## 명시적 제외 범위
- 나머지 코드 리뷰 findings 전부: DB migration 부재, 소셜 계정 최초 생성 race, 랭킹, 날짜·상태 DTO, CORS, health/readiness, 예외 logging, reset script, 기타 입력 검증
- Prisma schema와 migration, controller, route, DTO, package dependency와 lockfile 변경
- API 기능 추가, 리팩터링 확장, formatting 일괄 변경

## 완료 조건
- 지정한 5건의 회귀 테스트와 전체 기존 테스트가 통과한다.
- 백엔드와 프런트 TypeScript 검사가 모두 통과한다.
- category 권한 검사와 task·score mutation이 같은 transaction 경계에 있음을 diff와 테스트로 확인한다.
- refresh rotation에서 조건부 revoke가 단일 승자를 보장하고 새 token 생성까지 같은 transaction에 있음을 확인한다.
- exact writable allowlist 밖 제품 파일에 변경이 없고 나머지 findings는 손대지 않는다.

## 승인 게이트
- 이 계획 작성 단계의 writable allowlist는 `.ai/memory/plan.md` 하나뿐이다.
- 사용자 승인 전에는 위 제품 파일, 테스트, 환경 예시, context와 checklist를 수정하지 않는다.
- **승인 기록**: 2026-07-15 사용자가 지정 5건의 구현 계획을 명시적으로 승인했다.
- **실행 방식 기록**: 사용자의 추가 지시에 따라 제품 수정은 항상 역할 계약과 exact writable allowlist를 받은 서브 에이전트를 통해 수행하며, 메인 에이전트는 승인·공유 memory·diff 통합 검증을 담당한다.
- **완료 기록**: 2026-07-15 `backend-developer` 2개 작업 흐름과 `frontend-developer`가 파일 소유권을 분리해 5건을 구현했다. `reviewer`가 기본 `Read Committed`의 stale score 가능성 P2를 발견해 `TasksService`에 `Serializable` isolation과 Prisma `P2034` 최대 2회 재시도를 추가했고, 재검토에서 기존 finding 해결 및 신규 finding 없음으로 확인했다.
- **최종 검증**: 백엔드 Jest 16 suites, 99 tests 통과. 백엔드·프런트 `tsc --noEmit --incremental false` 통과. 계획된 제품 경로 10개 외 신규 제품 변경 없음.
- **잔여 위험**: 실제 PostgreSQL 병렬 transaction, 외부 Google token, Expo runtime build는 실행하지 않았다. 고경합에서 3회 시도 모두 `P2034`이면 요청은 실패하지만 stale score는 commit하지 않는다.
- **상태**: **구현·독립 재검토·검증 완료**
