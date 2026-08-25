# 감사 원장 운영 계약

이 디렉터리는 `.ai/agents/verification-workflow.md`에 따라 수행한 `change-gate`와 `release-audit`의 기계 판독 원장을 보관합니다. 워크플로 도입 자체는 실제 감사를 시작하지 않으므로 audit별 디렉터리나 빈 `findings.jsonl`을 미리 만들지 않습니다.

## 소유권

- 메인 에이전트만 audit id를 발급하고 audit 디렉터리, `README.md`와 `findings.jsonl`을 생성·수정합니다.
- finder, validator와 개발 역할은 원장을 직접 쓰지 않고 구조화된 결과를 메인 에이전트에 반환합니다.
- 메인 에이전트는 원문 결과를 임의로 완화하지 않고 fingerprint 중복 제거, 독립 판정 병합과 상태 전이 근거를 기록합니다.
- `ACCEPTED_RISK`는 사용자의 명시적 승인과 승인 근거가 있을 때만 기록합니다.

## 디렉터리 구조

```text
.ai/audits/
├── README.md
├── finding.schema.json
└── <audit-id>/
    ├── README.md
    └── findings.jsonl
```

audit id 형식은 `YYYYMMDD-<mode>-<slug>`이며 mode는 `change-gate` 또는 `release-audit`입니다. audit별 `README.md`에는 최소한 다음 내용을 기록합니다.

- 목표, mode, 승인 근거와 범위
- round별 lens, finder와 validator 배정
- 허용 read scope, exact writable allowlist와 금지 범위
- 실행한 정적 검사·테스트·런타임·DB·외부 연동 검증을 서로 분리한 결과
- 종료 조건 판정, 미실행 검증과 잔여 위험

## `findings.jsonl` 계약

- UTF-8, LF 줄바꿈을 사용하고 한 줄당 `finding.schema.json`을 만족하는 JSON 객체 하나를 저장합니다.
- audit 안에서 `findingId`와 `fingerprint.value`는 각각 유일해야 합니다.
- finding 하나는 원장에 한 줄만 존재합니다. 상태가 바뀌면 해당 객체의 현재 필드와 `statusHistory`를 함께 갱신하며 과거 이력을 삭제하지 않습니다.
- 정규화한 fingerprint basis와 SHA-256 값은 schema의 `fingerprint` 객체에 함께 보존합니다.
- 같은 원인·조건의 재발견은 새 객체 대신 기존 객체의 `aliases`에 candidate id를 추가합니다.
- `REFUTED`, `UNKNOWN`, `ACCEPTED_RISK`도 삭제하지 않습니다.
- validation, fix와 recheck의 실패·미실행·누락 근거를 성공처럼 기록하지 않습니다.
- 비밀정보, access token, FCM token, 개인정보와 외부 자격 증명을 evidence에 복사하지 않습니다. 필요한 경우 비식별 경로·해시·요약만 기록합니다.

## 상태와 기록 규칙

상태 전이는 `.ai/agents/verification-workflow.md`의 허용 그래프를 따릅니다. 모든 전이는 `statusHistory`에 이전 상태, 새 상태, actor, 시각과 이유를 남깁니다.

- `CONFIRMED`: 요구된 독립 반박 검증을 통과한 상태
- `FIXED`: 승인된 구현과 지정 검증이 완료됐지만 독립 재검증 전인 상태
- `RECHECKED`: 원 condition 차단과 회귀 검토가 완료된 상태
- `ACCEPTED_RISK`: 사용자 승인으로 위험을 수용한 상태이며 수정 완료와 동의어가 아님

메인 에이전트는 validator별 원문 verdict를 `validations`에 분리해 저장하고, 의견이 갈린 경우 제3 reviewer 결과와 최종 병합 이유를 status history에 남깁니다.

## 스키마 검증

`finding.schema.json`은 JSON Schema Draft 2020-12 문서입니다. 감사 원장 생성 전 다음을 확인합니다.

1. schema 자체가 JSON으로 파싱됩니다.
2. top-level과 중첩 객체의 `additionalProperties` 정책이 유지됩니다.
3. 필수 필드와 status·severity·verdict enum이 워크플로 문서와 일치합니다.
4. 각 JSONL 줄이 schema를 만족하고 audit·finding id 및 fingerprint가 유일합니다.

저장소에 JSON Schema validator가 없으면 패키지를 임의 설치하지 않습니다. 계획·승인을 거쳐 validator를 사용하거나, 그 전에는 JSON 파싱과 정적 계약 검사를 수행하고 완전한 schema validation 미실행을 잔여 위험으로 기록합니다.

## 종료와 보존

- `change-gate`와 `release-audit`의 종료 조건은 워크플로 문서대로 각각 판정합니다.
- 정적 감사, 테스트, 실제 실행, DB와 외부 서비스 검증 결과는 서로를 대신하지 않습니다.
- 종료 조건이 충족되지 않은 audit을 완료 또는 배포 승인으로 표시하지 않습니다.
- 종료 후에도 원장과 기각 근거를 보존합니다. 삭제·압축·외부 전송은 별도 사용자 승인 없이는 수행하지 않습니다.
