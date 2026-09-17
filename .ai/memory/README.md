# Memory 읽기 안내 — 2026-09-17

| 문서 | 읽는 목적 |
|---|---|
| [plan](./plan.md) | 현재 목표·승인 범위·실행 순서 |
| [context](./context.md) | 구현 계약·감사 상태·검증 근거와 한계 |
| [checklist](./checklist.md) | 완료 checkpoint·열린 gate·다음 작업 |
| [오류 해결집](./error-resolution-playbook.md) | 같은 증상·환경에서 재사용 가능한 해결 record 검색 |

활성 memory는 앞의 3개다. 이 README는 routing과 byte/hash ledger이며 원문을 대체하지 않는다. 오류 해결집은 조건부 저장소이므로 전체를 매번 읽지 말고 index에서 error signature·component·환경이 일치하는 record만 찾는다.

새 세션·재개·컨텍스트 복구 때 활성 3개를 확인한다. 같은 세션에서는 목표·상태·설계·승인 범위가 바뀐 부분만 다시 읽고, 변화가 없으면 반복 작성하지 않는다.

## 현재 checkpoint

- Canonical audit 92건: `RECHECKED 83 / UNKNOWN 5 / FIXING 3 / REFUTED 1`.
- 열린 8건: F-003/F-013/F-015/F-017/F-065/F-067/F-068/F-092. 실제 signing/OAuth/FCM, 공개 legal/deletion URL, 실기기/OEM/provider 전환, production 환경 증거가 필요하다.
- Backend 43 suites/960 tests, production-start 3, build·spec typecheck·ESLint 통과. Front 51 suites/1,156 tests와 typecheck 통과, ESLint error 0/warning 44.
- 포트폴리오 Backend는 Render Free, PostgreSQL은 Neon Free, Redis는 Upstash Free다. Blueprint과 local Docker preflight는 완료했지만 계정 연결·secret 입력·공개 deploy는 아직 수행하지 않았다.
- 신규 Play Console 등록은 보류다. 로컬·합성 검증을 actual FCM/OAuth/OEM/production/Play/release 완료로 확대하지 않는다.
- 제품·감사·배포 준비 변경은 commit `27ebca3`으로 `origin/main`에 게시했고 로컬·원격 SHA 일치를 확인했다.

## 2026-09-17 압축·정리

- 활성 3개를 76,569 bytes에서 17,542 bytes로 줄였다(59,027 bytes, 77.1% 감소).
- 서로 충돌하던 85건·57건·55건 과거 snapshot과 완료 절차 반복을 제거하고, 현재 원장92건·열린8건·외부 환경 순서·최신 검증을 전면에 남겼다.
- 상세 구현과 과거 실행 증거는 감사 원장, 전체55 진행 기록, 잔여 gate 보고서, provisioning 작업표와 Git 이력으로 연결했다.
- 오류 해결집은 실제 record 77개의 적용 조건·절차·검증·위험을 보존했다. 제목 template은 record 수에 포함하지 않는다.
- strict UTF-8/LF, 활성 문서와 README의 상대 링크, playbook ID 중복 없음, 현재 원장 status 합계를 확인했다.
- recovery `*.original.md`·`*.failed-*` inventory는 비어 있다. 새 archive/snapshot은 만들지 않았다.

## 파일 크기·SHA-256

Strict UTF-8/LF bytes 기준이다. README 자신의 해시는 자기참조를 피하기 위해 제외한다.

| 파일 | 현재 bytes | SHA-256 |
|---|---:|---|
| `plan.md` | 6,363 | `A34B4D6B50612619C9FE18872FAE45433AACCF0D1BCA79311089F4FE8B770B96` |
| `context.md` | 6,963 | `12B11375096AB761802BC47B3029341C80BD3B4B854E1BF69E0EEC809F1BB42E` |
| `checklist.md` | 4,216 | `B15D6AE302C6FCA0FE515A0C82FB57612EC432684BEC862B651B0CD2D5813812` |
| `error-resolution-playbook.md` | 158,763 | `51F8C6B8506B8362F0D49FE2036EB959FD50C1C58104323871DB2B7DFCB737F0` |

## 갱신 규칙

1. 활성 3개를 실제 Git·감사 원장·현재 실행 증거와 대조한다. 과거 checkpoint를 현재 상태로 표현하지 않는다.
2. 현재 상태, 결정, 열린 gate, 다음 검증에 필요한 정보만 활성 문서에 둔다. 완료된 상세 절차와 수치는 검증 보고서로 연결한다.
3. 한 번에 1~2파일을 `apply_patch`로 변경하고 UTF-8/LF·상대 링크·내용 일관성·diff를 확인한 뒤 위 byte/hash를 갱신한다.
4. 실제 env/key·credential·keystore·private Gradle property와 local cache를 stage하지 않는다. 제품·기록 파일은 exact path로 stage한다.
5. 오류 해결집은 같은 root cause면 기존 record를 갱신하고, 새 root cause와 재현 가능한 검증이 있을 때만 새 ID를 추가한다.

Recovery `*.original.md`·`*.failed-*`는 일반 검색·handoff·재압축 입력에서 제외한다. 명시적 복구 승인 없이 읽기·수정·삭제·이름 변경·stage하지 않는다.
