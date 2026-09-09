# 적대적 검증 워크플로

이 문서는 DSM 저장소의 고위험 변경 검증과 릴리스 전 정적 감사를 위한 공통 계약입니다. 기존 계획·승인·역할·exact writable allowlist 절차를 보강할 뿐 대체하지 않습니다. 정적 LLM 판정만으로 테스트, 실제 DB 검증, 외부 연동 검증 또는 배포 승인을 대신할 수 없습니다.

## 1. 적용 모드

### `change-gate`

다음 영역을 변경할 때 메인 에이전트가 적용 여부를 판단합니다.

- 인증·인가·소유권 경계
- 데이터 무결성, transaction과 동시성
- UTC 날짜·시간 경계와 상태 전이
- 외부 인증·메시징·결제 등 실패 비용이 큰 연동

변경 범위 중심의 후보 발견, 독립 반박 검증, 승인된 수정, 수정 후 재검증을 순서대로 수행합니다.

### `release-audit`

릴리스 전 또는 사용자가 전체 감사를 요청했을 때 적용합니다. 기능 영역, 고장 유형, 결함 계열, 자유 탐색처럼 서로 겹치지 않는 lens를 라운드별로 배정합니다. 서로 다른 자유 탐색 2개 라운드에서 신규 확정 P0~P2가 연속 0건이어야 정적 감사 종료 후보가 됩니다.

## 2. 역할과 소유권

- `investigator`: 지정된 lens에서 후보 finding을 찾는 읽기 전용 finder입니다. 원장, 소스와 판정 상태를 수정하지 않습니다.
- `reviewer`: `adversarial-validation`에서 다른 validator의 판정을 보지 않고 후보를 반박하며, `fix-recheck`에서 승인된 수정 결과를 독립 재검증합니다. 소스를 수정하지 않습니다.
- 개발 역할: `CONFIRMED` finding 중 별도 구현 승인을 받은 항목만 exact writable allowlist 안에서 수정합니다.
- `context-compiler`: 복수 문서나 역할 사이 handoff에서 의미 손실 위험이 있을 때만 기존 호출 계약에 따라 사용합니다.
- 메인 에이전트: audit id, lens, round, validator 배정, fingerprint 중복 제거, 판정 병합, 상태 전이, 감사 원장과 종료 판정을 단독 소유합니다.

finder와 validator는 동일 finding에서 겸임하지 않습니다. 수정 구현자도 자신의 수정에 대한 유일한 `fix-recheck` validator가 될 수 없습니다.

## 3. 감사 식별자와 저장 위치

- audit id는 `YYYYMMDD-<mode>-<slug>` 형식을 사용합니다.
- 기계 판독 finding은 `.ai/audits/<audit-id>/findings.jsonl`에 한 줄당 JSON 객체 하나로 저장합니다.
- 감사별 범위, lens, 실행한 검증과 종료 판정은 `.ai/audits/<audit-id>/README.md`에 기록합니다.
- 객체 계약은 `.ai/audits/finding.schema.json`을 따릅니다.
- 최초 워크플로 도입만으로 audit 디렉터리나 빈 원장을 미리 만들지 않습니다.

메인 에이전트만 원장 파일을 생성·수정합니다. 서브 에이전트는 구조화된 결과를 채팅으로 반환하며 원장을 직접 쓰지 않습니다.

## 4. Finding 계약과 중복 제거

각 후보는 최소한 다음 정보를 포함해야 합니다.

- schema version, audit id, finding id, round, lens
- severity(`P0`~`P3`), title, 정확한 path와 1부터 시작하는 줄 번호
- 재현 조건, 영향, 직접 근거
- fingerprint, 현재 status와 status history
- 독립 validation 기록, fix 기록, recheck 기록, residual risk

fingerprint는 정규화한 `path | symbol-or-line | defect-class | trigger`를 UTF-8로 연결한 뒤 계산한 소문자 SHA-256입니다. 같은 원인과 발생 조건의 후보는 기존 finding의 `aliases`에 새 후보 id를 추가하고 별도 finding으로 중복 생성하지 않습니다. 위치만 같거나 증상만 비슷하면 자동 병합하지 않습니다.

기각된 finding도 삭제하지 않습니다. 반박 근거, 상태 이력과 alias를 보존해 같은 주장의 반복 비용을 줄입니다.

## 5. 상태 전이

허용 상태는 다음과 같습니다.

`NEW`, `VALIDATING`, `CONFIRMED`, `REFUTED`, `UNKNOWN`, `FIXING`, `FIXED`, `RECHECKING`, `RECHECKED`, `ACCEPTED_RISK`

정상 전이는 다음으로 제한합니다.

```text
NEW -> VALIDATING
VALIDATING -> CONFIRMED | REFUTED | UNKNOWN
UNKNOWN -> VALIDATING
CONFIRMED -> FIXING | ACCEPTED_RISK
FIXING -> FIXED | CONFIRMED
FIXED -> RECHECKING
RECHECKING -> RECHECKED | CONFIRMED | UNKNOWN
```

- `REFUTED`와 `RECHECKED`는 해당 감사에서 종료 상태입니다.
- `ACCEPTED_RISK`는 사용자만 승인할 수 있으며 수정 완료를 뜻하지 않습니다. 승인 근거와 잔여 위험을 기록합니다.
- 구현 또는 검증 실패는 숨기지 않습니다. 수정이 불완전하면 `CONFIRMED`, 증거가 불충분하면 `UNKNOWN`으로 되돌리고 이유를 남깁니다.
- 모든 상태 전이는 actor, 시각, 이전·새 상태와 근거를 status history에 추가합니다. 과거 기록을 덮어쓰지 않습니다.

## 6. 독립 반박 검증

`adversarial-validation` validator는 원 finding과 직접 근거는 보되 다른 validator의 판정·논리는 보지 않습니다. 반환 verdict는 다음 셋뿐입니다.

- `SURVIVED`: 반박을 시도했지만 condition과 impact가 근거로 유지됩니다.
- `REFUTED`: 구체적인 코드·테스트·계약 근거로 주장이 성립하지 않습니다.
- `UNKNOWN`: 필요한 런타임, DB, 외부 서비스 또는 범위 밖 근거가 없어 정적으로 확정할 수 없습니다.

필요 인원은 다음과 같습니다.

| 대상 | 최초 validator | 판정 불일치 |
|---|---:|---:|
| P0·P1 | 2명 | 제3 reviewer 타이브레이크 |
| P2 보안·권한·transaction·동시성·데이터 무결성 | 2명 | 제3 reviewer 타이브레이크 |
| 그 외 P2 | 1명 | 메인 에이전트가 추가 검증 필요성 판단 |
| P3 | 선택 | 독립 투표는 선택이며, `CONFIRMED`로 전이하면 공통 종료 조건 적용 |

2명이 모두 `SURVIVED`이면 `CONFIRMED`, 모두 `REFUTED`이면 `REFUTED`입니다. 둘의 판정이 갈리면 제3 reviewer의 독립 판정을 더해 다수결로 병합합니다. 결정 가능한 다수가 없거나 필수 근거가 부족하면 `UNKNOWN`입니다. 메인 에이전트는 validator의 원문 판정을 변경하지 않고 병합 결과와 근거만 추가합니다.

## 7. Lens와 라운드

각 assignment는 하나의 주된 lens와 겹치지 않는 read scope를 가집니다. 권장 lens는 다음과 같습니다.

- 기능 영역: Auth, Task, Category, Score, Ranking, Notification, Frontend
- 고장 유형: authorization bypass, race, partial failure, stale read, boundary input, time rollover
- 결함 계열: 보안, 데이터 무결성, transaction, 오류 계약, 운영 준비성
- 자유 탐색: 이전 라운드의 확정 finding 목록만 중복 방지용으로 제공하고 새로운 원인을 탐색

같은 lens를 이름만 바꿔 반복한 라운드는 `release-audit` 종료 조건의 서로 다른 자유 탐색으로 계산하지 않습니다.

## 8. 수정과 재검증

1. 메인 에이전트가 `CONFIRMED` finding의 정확한 수정 파일, 검증과 완료 조건을 계획합니다.
2. 사용자의 별도 구현 승인 전에는 `FIXING`으로 전이하거나 제품 파일을 수정하지 않습니다.
3. 개발 역할은 exact writable allowlist의 1~2개 파일만 수정하고 실행한 검증과 실패를 보고합니다.
4. 메인 에이전트가 diff와 범위를 확인해 `FIXED`로 전이합니다. 구현 시도만으로 `FIXED`가 되지 않습니다.
5. 원 finder·구현자와 분리된 reviewer가 `fix-recheck`를 수행합니다.
6. 원 condition 차단, 회귀 부재와 요구 검증 통과가 확인되면 `RECHECKED`로 전이합니다.

재검증은 원 finding만 닫는 데 그치지 않고 수정 diff에서 새 P0·P1이 생기지 않았는지 확인합니다. 새 결함은 별도 finding id와 fingerprint로 기록합니다.

## 9. 종료 조건

### `change-gate`

- 모든 확정 finding이 `RECHECKED` 또는 사용자 승인 `ACCEPTED_RISK`
- 미해결 P0·P1 없음
- P2별 처리 상태와 근거 명시
- 계획된 정적 검사·테스트 통과, 실패 또는 미실행 항목 명시
- 최종 diff에서 신규 P0·P1 없음
- 실제 DB, 동시성, 외부 서비스와 런타임 미검증 위험 기록

### `release-audit`

- 서로 다른 자유 탐색 2개 라운드에서 신규 확정 P0~P2 연속 0건
- `UNKNOWN` 0건
- 재검증되지 않은 `FIXED` 0건
- 정적 감사, 테스트, 실행·DB·외부 연동 게이트를 각각 기록하고 서로 대체하지 않음

종료 조건이 충족되지 않으면 완료나 배포 가능으로 보고하지 않습니다. 사용자가 일부 위험을 수용하더라도 해당 항목만 `ACCEPTED_RISK`로 전이하며 나머지 게이트는 유지합니다.

## 10. 위임 필수 항목

기존 task assignment 필수 필드에 더해 감사 작업은 다음을 포함합니다.

- audit id, mode, round와 lens
- finder인지 validator인지, reviewer라면 `adversarial-validation | fix-recheck` 모드
- 기존 finding id·fingerprint와 중복 방지 목록
- 독립성 보호를 위해 제공하지 않을 다른 validator 판정
- 요구 verdict 또는 구조화 출력 필드
- 상태 변경과 원장 쓰기가 메인 에이전트 전용이라는 금지 조건

필수 항목이 빠졌거나 독립성이 깨졌거나 원장 소유권이 겹치면 서브 에이전트는 작업을 시작하지 않고 메인 에이전트에 보고합니다.
