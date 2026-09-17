# 2026-09-14 잔여 release·실기기·운영 gate 실행 기록

## 판정

- 시작 canonical 상태는 92건, `RECHECKED 82 / FIXING 4 / UNKNOWN 5 / REFUTED 1`이었고, F-047 재검증 뒤 종료 상태는 `RECHECKED 83 / FIXING 3 / UNKNOWN 5 / REFUTED 1`이다.
- 로컬에서 만들 수 있는 Android·TalkBack·Linux production bootstrap·readiness 증거를 갱신했다. 실제 Firebase/OAuth/서명 release/공개 legal URL/Play Console/운영 배포/OEM·물리 기기 증거는 만들지 않았으며 release 완료로 판정하지 않는다.
- 제품 변경은 F-047의 trigger focus 복원 경로에 한정했다. 실제 API 36 TalkBack에서 시트 진입 포커스, 배경 격리, Android Back 닫힘과 원래 FAB로의 복원을 모두 확인했다. Android Modal 접근성 창이 정리되기 전의 320~600ms 호출은 첫 홈 heading 선택에 덮였고, 공식 Fabric 경로인 `sendAccessibilityEvent(host, 'focus')`를 닫힘 1.5초 뒤 호출하면 녹색 포커스가 FAB로 돌아왔다. 회귀와 독립 재검토까지 통과해 F-047을 `RECHECKED`로 전이했다.

## Android 실행

- task AVD `dsm-remaining-api24`와 `dsm-remaining-api36`을 저장소 로컬 SDK/JDK로 만들었다. API 24에는 기존 debug APK를 설치해 native notification probe를 실행했고, API 36 Google APIs image에는 TalkBack `16.0.0.738667889`가 포함된 것을 확인했다.
- API 24 native notification probe: Firebase 기본 앱은 구성되지 않아 `configured=false`, permission은 granted였다. Notifee local display, 만료 제거, 동일 logical id 교체, 서로 다른 ticket의 요청 취소와 scope 취소는 모두 통과했다. 이는 actual FCM 송수신 증거가 아니므로 F-015를 닫지 않는다.
- API 24에서 DSM task의 `taskAffinity=null`, 단일 MainActivity task를 확인했다. 실제 악성 APK·OEM matrix·물리 기기·서명 release가 없어 F-065를 닫지 않는다.
- API 36에서는 실제 TalkBack service와 touch exploration을 켰다. 메모리 전용·network-blocked offline workspace에서 새 일과 sheet를 열었고, 열린 접근성 tree에는 홈·랭킹·마이·새로고침이 없었다. 최신 번들의 초기 포커스는 `새 일과 추가` heading에 표시됐고 Android Back으로 닫혔다.
- F-047 변경은 home FAB와 task detail trigger의 HostInstance 값을 직접 저장하지 않고, 매 opening마다 새 `{targetRef}` 요청을 보존한다. sheet chain 전체가 닫힌 뒤 캡처한 요청과 현재 요청의 identity가 같을 때만 mounted target에 포커스를 보내고 정리하므로, 같은 FAB/행을 즉시 다시 열 때 이전 cleanup이 새 요청을 지우지 않는다. 상세→수정 전환 중간에는 복원하지 않으며 삭제 등으로 trigger가 unmount되면 stale target을 호출하지 않는다. 대상 회귀 44개와 전체 Front 51 suites/1,156 tests, typecheck, ESLint error 0을 통과했다. 독립 재검토는 P0/P1/P2 없음으로 코드·자동 검증과 API 36 최종 screenshot을 승인했다. 기존 파일 전체의 Prettier check는 이 batch 이전부터 누적된 formatting 차이까지 포함해 실패하므로 자동 전체 재포맷은 하지 않았다.
- AVD 두 개와 task Metro listener는 검증 후 종료했다. screenshot/XML/프로브는 ignored `.local/remaining-gates-*`에 남겼다.

## Linux production bootstrap과 readiness

- Docker Desktop engine `29.7.2`에서 Backend 전체 43 suites/960 tests, Nest build, source/spec typecheck, ESLint, 대상 format, production-start process tests 3개를 통과했다.
- task-owned PostgreSQL 17, Redis 7, network, Backend Linux image/container를 label `dsm.remaining-gates=20260914`로 만들었다. 실제 Dockerfile/entrypoint의 `prisma migrate deploy` 뒤 서버가 기동했고 `/health/ready` 200, `/health` 200을 확인했다.
- 같은 API process에서 PostgreSQL을 중지하면 `/health/ready`가 고정 메시지로 503을 반환했고, PostgreSQL 재시작 뒤 200으로 복구했다. 별도 in-process readiness probe도 20개 동시 장애 요청이 전부 503이고 최대 약 1.03초, 같은 process 복구 약 0.27초임을 확인했다.
- task container·network·image는 label을 다시 확인한 뒤 전부 제거했다. 기존 dev PostgreSQL/Redis는 건드리지 않았다.
- 이 결과는 repository의 production bootstrap/readiness 동작 증거다. 실제 배포 플랫폼의 migration job·traffic gate·replica rollout mapping이 없으므로 F-013/F-017은 `UNKNOWN`을 유지한다.

## 남은 외부 입력과 gate

| Finding | 상태 | 현재 남은 조건 |
| --- | --- | --- |
| F-003 | UNKNOWN | release keystore/Gradle signing, production OAuth package·SHA·client identity, 서명 APK provider 확인 |
| F-013 | UNKNOWN | 실제 배포 플랫폼의 readiness probe와 traffic 전환 mapping |
| F-015 | FIXING | Android Firebase app config, 실제 FCM token·foreground/background/종료 수신, Backend FCM dispatch credential |
| F-017 | UNKNOWN | 실제 production API base URL과 release 환경 주입 |
| F-065 | UNKNOWN | 서명 release·물리/OEM 기기와 malicious same-affinity 앱을 포함한 task-hijack matrix |
| F-067 | FIXING | 공개 account deletion 처리, 실제 signed device와 외부 요청 lifecycle |
| F-068 | FIXING | 공개 privacy/deletion URL, Play Data Safety·스토어 화면 확인 |
| F-092 | UNKNOWN | 실제 provider account A→B 전환과 남은 offline outbox의 owner binding 관찰 |

## 보존 경계

- 실제 `.env`, credential, signing key/keystore의 값은 읽거나 출력하지 않았다. 파일 존재와 필요한 key 이름만 확인했다.
- Google/Firebase/Play/배포 console, 운영 DB, 공개 URL에는 변경을 가하지 않았다.
- 기존 미커밋 변경을 보존했고 commit/push를 수행하지 않았다.
