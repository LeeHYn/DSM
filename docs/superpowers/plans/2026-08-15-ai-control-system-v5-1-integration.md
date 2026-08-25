# AI CONTROL SYSTEM v5.1 Project Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 프로젝트의 고유 안전 규칙을 보존하면서 `.ai/system_prompt.md`를 `AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)`으로 통합한다.

**Architecture:** 기존 문서를 기준선으로 삼고 상단 memory 계약, 중단 실행·서브에이전트 계약, 하단 기술·품질·복구 계약을 순차적으로 보강한다. 새로운 memory 파일이나 archive 구조는 만들지 않으며, 각 구간 뒤 문자열 계약과 전체 diff를 검증한다.

**Tech Stack:** Markdown, PowerShell, Git read-only validation

## Global Constraints

- 설계 SSOT는 `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md`다.
- 수정 대상은 계획에 명시된 exact writable allowlist만 허용한다.
- 기존 오류 해결 플레이북, backup 경계, 역할 기반 서브에이전트 계약, Context Compiler와 적대적 검증 규칙을 삭제하거나 약화하지 않는다.
- `.ai/memory/memory.md`와 `.ai/archive/`를 만들지 않는다.
- `DSM_Back/**`, `DSM_Front/**`, `learning-site/**`, `.ai/agents/**`, `.ai/audits/**`를 수정하지 않는다.
- dependency, network, DB·Docker·Firebase 실행을 하지 않는다.
- 기존 dirty 변경을 되돌리거나 덮어쓰지 않는다.
- Git stage·commit·push는 승인되지 않았으므로 실행하지 않는다. 각 task 끝에는 read-only diff checkpoint만 남긴다.
- 현재 역할 문서에는 시스템 프롬프트 편집 역할이 없고 작업 범위가 단일 정책 파일이므로 주 에이전트 inline 실행을 권장한다. 서브에이전트 실행에는 별도 사용자 요청과 역할 계약 보완이 필요하다.
- PowerShell 명령이 500바이트 이상이거나 quoting·분기·반복이 복잡하면 `.ai/scripts/*.ps1` 계획을 별도로 승인받기 전 실행하지 않는다.

---

### Task 1: 상단 언어·정체성·memory 계약 통합

**Files:**
- Modify: `.ai/system_prompt.md:1-38`

**Interfaces:**
- Consumes: 승인된 design spec 1~4.4절, `.ai/memory/README.md`의 활성·복구 routing
- Produces: 새 문서 제목, 0절 언어·기록 계약, 보강된 1절 정체성, 기존 파일 구조와 일치하는 2절 memory 계약

- [ ] **Step 1: 새 상단 계약이 아직 없음을 확인한다**

Run:

```powershell
rg -n -F "AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)" .ai/system_prompt.md
rg -n -F "## 0. CRITICAL: 언어와 기록" .ai/system_prompt.md
```

Expected: 두 명령 모두 match가 없어 exit code 1이다.

- [ ] **Step 2: 제목과 0절을 추가한다**

첫 줄을 아래 제목으로 바꾼다.

```markdown
# [MASTER SYSTEM DIRECTIVE: AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)]
```

제목 다음에 아래 의미를 가진 `## 0. CRITICAL: 언어와 기록`을 둔다.

```markdown
- 상위 지침이 허용하는 범위에서 모든 답변과 보고를 한국어로 작성한다.
- 코드·설정·프로젝트 변경 후 최종 보고 전에 관련 활성 memory를 동기화한다.
- 동기화하지 못한 작업은 완료로 주장하지 않고 누락 이유와 남은 작업을 보고한다.
```

- [ ] **Step 3: 1절 정체성과 의사결정 경계를 보강한다**

기존 단기 기억 상실과 근거 우선 규칙을 유지하면서 아래 계약을 같은 절에 한 번씩 포함한다.

```markdown
- 시니어 개발자이자 PM 어시스턴트로서 더 단순한 해결책이 있으면 추천안과 trade-off를 제시한다.
- 승인된 설계 안에서 best practice가 명확한 구현 세부만 자율 결정하며 이유를 사후 보고한다.
- 아키텍처, 데이터 모델, 디렉터리 구조, 핵심 기술 스택·라이브러리 선택은 선택지와 trade-off를 먼저 제시하고 승인받는다.
```

자율 판단이 기존 계획·승인 gate를 우회하지 못한다는 문장을 함께 둔다.

- [ ] **Step 4: 2절 memory 역할과 위생 규칙을 현재 구조에 맞게 보강한다**

기본 시작·종료 파일은 기존 3개로 유지한다. `context.md` 설명에 압축된 구조 지도와 주요 흐름을 유지한다는 책임을 추가하고, 오류 해결 지식은 기존 조건부 플레이북 절을 유지한다.

새 `### 메모리 위생` 절에는 다음 계약을 넣는다.

```markdown
- 활성 3파일은 현재 상태, 활성·대기 목표와 재발 방지 계약 중심으로 유지한다.
- 완료 이력이 본문을 압도하면 사용자 승인과 exact writable allowlist 뒤에만 압축한다.
- `.ai/memory/README.md`와 기존 `*.original.md`·`*.failed-*` 복구 경계를 우선한다.
- `.ai/archive/`는 자동 도입하지 않으며 필요하면 별도 설계·승인을 받는다.
- 압축 전후 정보 보존과 strict UTF-8을 검증한다.
```

`memory.md`를 새 활성 파일로 열거하지 않는다.

- [ ] **Step 5: 상단 계약을 검증한다**

Run:

```powershell
rg -n -F "AI CONTROL SYSTEM v5.1 (DSM Project Adapted Edition)" .ai/system_prompt.md
rg -n -F "## 0. CRITICAL: 언어와 기록" .ai/system_prompt.md
rg -n -F ".ai\memory\error-resolution-playbook.md" .ai/system_prompt.md
rg -n -F ".ai/memory/README.md" .ai/system_prompt.md
git diff --check -- .ai/system_prompt.md
```

Expected: 제목·0절·플레이북·README 계약이 각각 확인되고 `git diff --check`가 exit code 0이다.

- [ ] **Step 6: read-only checkpoint를 남긴다**

Run:

```powershell
git diff --stat -- .ai/system_prompt.md
git diff -- .ai/system_prompt.md
```

Expected: `.ai/system_prompt.md` 상단 구간만 변경되고 기존 플레이북·backup 계약은 diff에 남아 있다. Git write는 실행하지 않는다.

---

### Task 2: 실행 흐름과 서브에이전트 프로파일 통합

**Files:**
- Modify: `.ai/system_prompt.md:39-88`

**Interfaces:**
- Consumes: Task 1의 memory 계약, 기존 STEP 1~5와 3.1 역할·Context Compiler·검증 워크플로
- Produces: 검증 가능한 milestone 흐름과 기존 역할 계약에 결합된 실행 프로파일 승인 형식

- [ ] **Step 1: 새 실행 프로파일 계약이 아직 없음을 확인한다**

Run:

```powershell
rg -n -F "가장 낮은 충분 수준" .ai/system_prompt.md
rg -n -F "실행 프로파일 승인 요청" .ai/system_prompt.md
```

Expected: 두 문구 모두 match가 없어 exit code 1이다.

- [ ] **Step 2: STEP 1~5를 검증 가능한 목표 흐름으로 보강한다**

기존 수동 정지와 승인 대기를 유지하고 아래 순서를 명시한다.

```text
활성 memory 확인과 실제 상태 대조
→ 오류 작업이면 플레이북 검색
→ 검증 가능한 milestone과 checklist 기록
→ 구조적 결정·exact writable allowlist·실행 주체 설명
→ 사용자 승인 대기
→ 승인 범위에서 1~2개 파일 외과적 수정
→ 비례 검증·필요 시 독립 검토
→ 최종 보고 전 memory 동기화
```

계획에는 행동이 아니라 관찰 가능한 성공 기준을 기록하도록 한다.

- [ ] **Step 3: 3.1 앞에 서브에이전트 실행 프로파일 판단 규칙을 추가한다**

아래 조건을 명시한다.

```markdown
- 런타임 상위 지침 또는 사용자가 서브에이전트 사용을 허용한 경우에만 후보를 평가한다.
- 단순·짧은 작업은 주 에이전트가 직접 수행한다.
- 위임 이점이 분명하면 실제 지원 모델·reasoning effort만 확인한다.
- 성공 기준을 만족하는 가장 낮은 충분 수준을 추천한다.
- 사용자 승인 전 구현·수정 목적 서브에이전트를 생성하지 않는다.
- 승인된 프로파일 실패 시 사전 승인된 대체안 외에는 임의 변경하지 않는다.
```

- [ ] **Step 4: 실행 프로파일 승인 요청 필드를 기존 assignment 계약과 결합한다**

다음 필드를 모두 열거한다.

```markdown
- milestone
- 실행 주체
- role과 objective
- read scope
- exact writable allowlist
- forbidden scope
- verification과 done condition
- 추천 모델과 reasoning effort
- 선택 근거와 품질·비용·지연시간 trade-off
- 서브에이전트 수, 병렬 여부와 대체 프로파일
```

기존 assignment 필드, 1~2개 파일 제한과 병렬 파일 소유권 금지를 삭제하지 않는다.

- [ ] **Step 5: 기존 고급 계약 보존을 검증한다**

Run:

```powershell
rg -n -F "가장 낮은 충분 수준" .ai/system_prompt.md
rg -n -F "exact writable allowlist" .ai/system_prompt.md
rg -n -F "Context Compiler 호출 프로토콜" .ai/system_prompt.md
rg -n -F "적대적 검증 워크플로 호출 프로토콜" .ai/system_prompt.md
rg -n -F "ACCEPTED_RISK" .ai/system_prompt.md
git diff --check -- .ai/system_prompt.md
```

Expected: 새 프로파일과 기존 역할·compiler·감사 계약이 모두 존재하고 diff check가 통과한다.

- [ ] **Step 6: read-only checkpoint를 남긴다**

Run:

```powershell
git diff --stat -- .ai/system_prompt.md
git diff -- .ai/system_prompt.md
```

Expected: 실행 프로파일은 기존 3.1 계약을 보강하며 이를 대체하지 않는다. Git write는 실행하지 않는다.

---

### Task 3: 단순성·회귀 방지·완료 보고·복구 계약 통합

**Files:**
- Modify: `.ai/system_prompt.md:89-end`

**Interfaces:**
- Consumes: Task 1~2의 승인·memory 계약과 기존 4~7절
- Produces: 보강된 기술 제약·품질 보고·소통·커밋·컨텍스트 복구 절

- [ ] **Step 1: 새 하단 계약이 아직 없음을 확인한다**

Run:

```powershell
rg -n -F "대칭적 완료성" .ai/system_prompt.md
rg -n -F "컨텍스트 복구 프로토콜" .ai/system_prompt.md
```

Expected: 두 문구 모두 match가 없어 exit code 1이다.

- [ ] **Step 2: 4절에 단순성과 회귀 방지 규칙을 추가한다**

기존 관례·안정성·보안·side effect 규칙 뒤에 아래 내용을 둔다.

```markdown
- 필요한 최소 구현만 작성하고 요구하지 않은 기능·추상화·리팩터링을 추가하지 않는다.
- 확인되지 않은 DB·API·도메인 규약을 추측해 validation이나 제약을 추가하지 않는다.
- 한 도메인의 경로를 수정하면 같은 계약을 공유하는 형제 경로의 영향도 점검하되, 불필요하게 함께 수정하지 않는다.
- 코드나 동작 변경에는 회귀 검증을 동반하고 문서 전용 변경은 Markdown·링크·형식·내용 일관성 검증으로 대체한다.
- DB를 사용하는 DSM 로컬 환경은 Docker와 `127.0.0.1` 바인딩을 유지한다.
- 500바이트 이상이거나 quoting·분기·반복이 복잡한 PowerShell 명령은 `.ai/scripts/*.ps1`로 저장한 뒤 실행한다.
```

- [ ] **Step 3: 5절 완료 보고 형식을 보강한다**

CCTV 기록에 아래 항목을 포함한다.

```markdown
- 이번 작업에서 수정·추가·삭제한 파일 목록
- 관련 `.ai/memory/` 문서 동기화 여부
- 요청과 직접 연결되지 않은 변경 여부
- 실행한 검증과 미실행 검증
- 남은 위험과 승인 gate
```

셀프 체크에는 단순성, 기존 변경 보존, 요구 성공 기준, 오류 작업의 플레이북 검색 여부를 포함한다. 끝에는 실제 `checklist.md`의 `[ ]`·`[/]` 항목을 근거로 다음 작업 1~2개만 제안하고 승인 없이 시작하지 않는 규칙을 둔다.

- [ ] **Step 4: 7절 소통 규칙을 정리하고 커밋 메시지 규칙을 추가한다**

한국어 강제 문구는 0절에만 두고 7절에는 건조하고 명확한 보고, 추천안과 근거·trade-off 제시, 선택한 구현 세부의 사후 보고를 둔다.

새 `### 커밋 메시지 규칙`에는 다음을 넣는다.

```markdown
- Conventional Commits 유형과 구체적인 변경 대상을 제목에 쓴다.
- 제목만으로 이유가 불명확하면 본문에 이유와 영향 범위를 적는다.
- Git write는 현재 사용자 승인 범위 안에서만 수행한다.
```

- [ ] **Step 5: 새 8절 컨텍스트 복구 프로토콜을 추가한다**

아래 순서를 포함한다.

```text
대화 초기화 또는 “이어서 작업해”
→ 활성 plan/context/checklist 확인
→ 실제 소스·Git 상태 대조
→ 오류 작업이면 플레이북 검색
→ 현재 위치·불일치·다음 검증 가능한 행동·승인 gate 보고
```

`*.original.md`와 `*.failed-*`는 명시적인 복구·감사 승인 없이는 읽지 않는다는 기존 경계를 반복 확인한다.

- [ ] **Step 6: 하단 계약을 검증한다**

Run:

```powershell
rg -n -F "대칭적 완료성" .ai/system_prompt.md
rg -n -F "127.0.0.1" .ai/system_prompt.md
rg -n -F "### 커밋 메시지 규칙" .ai/system_prompt.md
rg -n -F "## 8. 컨텍스트 복구 프로토콜" .ai/system_prompt.md
rg -n -F "크로스 코드 리뷰 모드" .ai/system_prompt.md
git diff --check -- .ai/system_prompt.md
```

Expected: 새 하단 계약과 기존 크로스 리뷰 절이 함께 존재하고 diff check가 통과한다.

- [ ] **Step 7: read-only checkpoint를 남긴다**

Run:

```powershell
git diff --stat -- .ai/system_prompt.md
git diff -- .ai/system_prompt.md
```

Expected: 기존 4~7절의 의미가 보존되고 새 커밋·복구 계약만 추가된다. Git write는 실행하지 않는다.

---

### Task 4: 전체 문서 정적 검증

**Files:**
- Verify: `.ai/system_prompt.md`
- Verify: `docs/superpowers/specs/2026-08-15-ai-control-system-v5-1-integration-design.md`

**Interfaces:**
- Consumes: Tasks 1~3의 통합 문서
- Produces: 제목·보존 규칙·금지 구조·Markdown·UTF-8·수정 범위 검증 증거

- [ ] **Step 1: 필수 heading과 보존 계약을 확인한다**

Run:

```powershell
rg -n "^#{1,4} " .ai/system_prompt.md
rg -n -F "error-resolution-playbook.md" .ai/system_prompt.md
rg -n -F "Context Compiler 호출 프로토콜" .ai/system_prompt.md
rg -n -F "적대적 검증 워크플로 호출 프로토콜" .ai/system_prompt.md
rg -n -F "ACCEPTED_RISK" .ai/system_prompt.md
```

Expected: 0~8절 구조와 기존 네 안전 계약이 확인된다.

- [ ] **Step 2: 금지 구조가 생성되지 않았음을 확인한다**

Run:

```powershell
Test-Path .ai/memory/memory.md
Test-Path .ai/archive
rg -n "memory\.md|\.ai/archive" .ai/system_prompt.md
```

Expected: 두 `Test-Path`는 `False`다. `rg` 결과는 새 파일과 archive를 만들지 않는다는 부정 계약만 보여야 한다.

- [ ] **Step 3: strict UTF-8과 whitespace를 확인한다**

Run:

```powershell
$b=[IO.File]::ReadAllBytes('.ai/system_prompt.md')
$u=[Text.UTF8Encoding]::new($false,$true)
$null=$u.GetString($b)
git diff --check -- .ai/system_prompt.md
```

Expected: UTF-8 decode 예외가 없고 diff check가 exit code 0이다.

- [ ] **Step 4: 승인 범위와 기존 제품 변경 보존을 확인한다**

Run:

```powershell
git status --short
git diff --name-only -- .ai/system_prompt.md
git diff --quiet -- DSM_Back DSM_Front
```

Expected: 이번 구현 대상은 `.ai/system_prompt.md` 하나다. 마지막 명령은 exit code 0이며 제품 소스에 새 diff가 없다. 기존 dirty 파일은 그대로 남아 있다.

- [ ] **Step 5: 명세 요구사항을 문서 diff와 대조한다**

설계 4.1~4.9의 각 항목을 `.ai/system_prompt.md`의 정확한 절에 매핑한다. 누락, 중복, 반대 의미의 자율 실행 문구가 하나라도 있으면 완료하지 않고 해당 task로 돌아가 최소 수정한다.

- [ ] **Step 6: 최종 read-only checkpoint를 남긴다**

Run:

```powershell
git diff --check
git diff --stat
```

Expected: whitespace error가 없고 승인 범위 밖의 새 변경이 없다. Git write는 실행하지 않는다.

---

### Task 5: 활성 memory 종료 동기화

**Files:**
- Modify: `.ai/memory/plan.md`
- Modify: `.ai/memory/checklist.md`

**Interfaces:**
- Consumes: Task 4의 실제 검증 출력
- Produces: 최종 구현 상태, 검증 증거, 남은 승인 gate와 다음 작업이 반영된 활성 memory

- [ ] **Step 1: 구현 결과를 plan에 기록한다**

아래 실제 사실만 기록한다.

```markdown
- `.ai/system_prompt.md` 통합 완료 여부와 최종 제목
- 보존한 기존 계약과 채택한 v5.1 계약
- 실행한 검증 결과
- 제품 소스 미변경과 기존 dirty 변경 보존 여부
- Git write 미실행 상태
```

검증하지 않은 항목을 통과로 기록하지 않는다.

- [ ] **Step 2: checklist 상태를 실제 결과에 맞게 갱신한다**

상세 구현 계획 승인, 프롬프트 통합, 정적 검증, memory 종료 동기화를 실제 상태에 따라 `[x]`, `[/]`, `[ ]`로 바꾼다. 실패하거나 미실행인 검증은 완료 표시하지 않는다.

- [ ] **Step 3: context 갱신 필요성을 판단한다**

이번 변경은 제품 구조가 아니라 작업 제어 정책 변경이므로 `context.md`의 제품 snapshot이 그대로 정확하면 수정하지 않는다. 실제 구조 지도나 운영 환경 사실이 달라졌을 때만 새 exact allowlist와 승인 뒤 별도 단계로 갱신한다.

- [ ] **Step 4: memory와 전체 diff를 검증한다**

Run:

```powershell
git diff --check -- .ai/memory/plan.md .ai/memory/checklist.md .ai/system_prompt.md
git status --short
git diff --stat
```

Expected: diff check가 통과하고 이번 작업 파일과 기존 dirty 변경이 구분 가능하다.

- [ ] **Step 5: CCTV 형식으로 보고한다**

최종 보고에는 수정·추가 파일, memory 동기화 여부, 요청 직접 연관 여부, 실행·미실행 검증, 남은 위험과 승인 gate를 포함한다. `checklist.md`의 미완료·진행 중 항목에서 다음 작업 1~2개만 제안하고 자동 시작하지 않는다.

Git stage·commit·push는 실행하지 않는다.
