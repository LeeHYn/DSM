# 확정 결함 우선순위 — 2026-09-11

사용자 승인: 확정57건을 정리하고 다음 수정 진행(`그래`). 기준 main@6e7988c + 기존 미커밋 변경, 시작 원장 SHA-256 `63F0E2691D5F12E1C5A858D6DA48A16F972D721536951E3AF5779030B966E2DE`.

이는 원장의 P2 39건/P3 18건을 실행 준비도·영향·의존성으로 정리한 57건 snapshot이다. 원 finding의 심각도는 변경하지 않는다. A 외 55건은 이번에 다시 재현하지 않았으며, 과거 제목은 현재 사실로 재확정한 것이 아니다. 아래 순서는 실행 제안이며 새 증거에 따라 조정한다. 보안 advisory의 현재 영향 확인은 다음 우선 작업이다. 제품 기능 전체 구현의 일괄 승인을 뜻하지 않는다.

이번 batch 완료: F-041/F-079는 HTTP 회귀·전체 Backend·정적 검사와 독립 reviewer2명 검토 후 RECHECKED다. 남은 CONFIRMED는55건(P2=37/P3=18)이다. 아래57행은 시작 snapshot을 보존하며 A의2건은 종결됐다. 최신 상태는 [원장](findings.jsonl), 검증은 [Round17 보고서](2026-09-11-task-input-validation.md), 다음 행동은 [공정표](../../memory/checklist.md)를 따른다.

## A — 이번 수정

서비스 쓰기 전에 입력을 차단한다. 실제 HTTP로 로컬 종결 가능한 데이터 무결성 문제. 두 건 모두 독립 검토 후 RECHECKED로 종결했다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-041 | P2 | 문자열 false가 true로 변환되어 Task 알림 설정이 반전됨 |
| F-079 | P2 | 존재하지 않는 달력 날짜가 다른 UTC 날짜로 정규화되어 저장됨 |

## B — 다음 보안·릴리스 현황 재검증

현재 lockfile/도구/설정과 원 증거를 먼저 대조한다. advisory는 실행 시 공식 공지와 새 audit로 확인하고 지원 버전 안에서 좁게 수정한다. 로컬 build·release gate 검증 가능; 실제 서명/배포 증거는 별도. Expo·format·memory finding은 이후 변경으로 낡았을 수 있어 현 상태 확인 없이 종결하지 않는다. Container release는 플랫폼/배포 설계가 먼저다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-019 | P2 | 인증 runtime의 axios 1.16.1이 high advisory 대상임 |
| F-020 | P2 | Nest Express production tree가 high advisory 대상 버전을 포함함 |
| F-021 | P2 | Metro·React Native tooling tree에 high advisory 패키지가 남음 |
| F-022 | P2 | 문서화한 Node 범위가 직접 test dependency engine과 충돌함 |
| F-036 | P2 | release validator가 예제용 .invalid API endpoint를 운영값으로 허용 |
| F-037 | P2 | Gradle wrapper 배포 ZIP의 기대 SHA-256이 고정되지 않음 |
| F-053 | P2 | 추적된 Claude local 설정이 위험한 정확 명령을 사전 허용함 |
| F-064 | P2 | release ABI override를 검증하지 않아 x86 전용 artifact를 만들 수 있음 |
| F-038 | P3 | JSC fallback이 동적 버전을 사용해 선택 빌드가 재현되지 않음 |
| F-055 | P3 | Clean validation이 mutable PostgreSQL image tag에 의존함 |
| F-018 | P2 | Expo splash·launcher와 내부 앱 이름이 사용자에게 노출됨 |
| F-023 | P3 | Backend Prettier check가 66 TypeScript files에서 실패함 |
| F-024 | P3 | Memory의 dependency audit 수치가 최신 감사와 충돌함 |
| F-054 | P2 | Backend application image와 container release 절차가 없음 |

## C — 인증·상태 보존·입력 계약

일시 장애에서 세션/기존 데이터 보존을 우선한다. Auth 오류 분류와 기존 server-first logout을 먼저 대조한다. HTTP/mock·store 테스트 가능, 로그인 race는 격리 PG 동시성 검사 필요. 실제 OAuth는 계정/서명 환경 필요. UTC query·timestamp 정책은 기존 계약을 확인해 mutation 수정과 별도로 처리한다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-057 | P2 | auth profile의 일시적 5xx가 유효 session과 local refresh token을 삭제함 |
| F-033 | P2 | 401 자동 세션 정리 중 기존 인증 화면과 계정 데이터가 계속 노출됨 |
| F-027 | P2 | 동시 최초 소셜 로그인 중 한 요청이 unique violation 500으로 실패 |
| F-062 | P2 | Kakao 사용자 정보 검증 요청에 timeout이 없음 |
| F-063 | P3 | Kakao 200 응답의 누락된 사용자 ID를 문자열 identity로 수용함 |
| F-004 | P3 | 동일 이메일의 다른 provider 로그인은 unique violation 500으로 실패함 |
| F-032 | P2 | CANCELLED 일과가 미완료로 표시되고 완료 동작으로 전환됨 |
| F-045 | P2 | 복구 가능한 refresh 실패가 기존 데이터를 지움 |
| F-058 | P3 | UTC 자정 이후 foreground refresh가 전날 Task와 점수를 계속 조회함 |
| F-010 | P3 | Task date query가 UTC day 대신 입력 시각부터 24시간을 조회함 |
| F-034 | P3 | 일일 점수 parser가 900점 상한을 검증하지 않아 모순된 응답을 ready로 게시 |
| F-043 | P3 | PATCH가 빈 Task title과 Category name을 허용함 |
| F-044 | P3 | Category 동시 update/delete 경합의 P2025가 HTTP 500으로 노출됨 |
| F-052 | P3 | Frontend HTTP client가 Backend 오류 envelope를 읽지 않음 |
| F-059 | P3 | timezone suffix 없는 timestamp를 parser가 허용해 기기별로 다른 시각을 만듦 |

## D — 알림 신뢰성·자원 상한

먼저 worker 취소 종결·timeout·같은 token 재등록을 검증한다. 이어 Task/Category 목록·FCM fan-out·refresh row의 상한/retention을 설계한다. Mock clock·격리 PG 동시성/부하 검증 가능, 실제 Firebase delivery는 별도. 페이지네이션·보존 기간은 제품 계약/호환성 확인 뒤 구현한다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-028 | P2 | 모든 delivery가 claim 검증에서 취소되면 schedule이 PROCESSING에 잔류 |
| F-031 | P2 | 종료되지 않는 Firebase send가 전체 notification Cron을 무기한 점유 |
| F-081 | P2 | 동일 FCM token 재등록이 유효 delivery를 잘못 취소함 |
| F-082 | P2 | 사용자별 FCM token 상한이 없어 schedule별 delivery fan-out이 무제한임 |
| F-080 | P2 | 날짜를 생략한 Task 목록이 사용자 전체 이력을 제한 없이 materialize함 |
| F-042 | P2 | Category 총량과 목록 응답에 경계가 없음 |
| F-061 | P2 | refresh rotation이 폐기된 token row를 제한 없이 누적함 |

## E — Android 조작·접근성

Back/TalkBack·OAuth 오류 표시·복구 행동을 먼저 점검한다. Component/store 회귀와 emulator 테스트 가능, 실제 계정/OEM/TalkBack 조작은 별도 확인. Offline logout은 기존 서버 family 폐기 계약과 충돌할 수 있어 요구를 재확인한다. 이후 dirty form·touch target·목록 렌더링·loading·본인 강조를 검증한다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-026 | P2 | Account reauth·OAuth 오류를 사용자 취소로 조용히 무시함 |
| F-046 | P2 | Android Back이 열린 Task sheet를 닫지 않음 |
| F-047 | P2 | 열린 Task sheet가 TalkBack focus와 배경 action을 격리하지 않음 |
| F-056 | P2 | Offline 복구 화면에서 local logout과 계정 전환에 도달할 수 없음 |
| F-048 | P3 | Dirty Task form을 확인 없이 폐기함 |
| F-050 | P3 | 주요 toggle과 close touch target이 44×44보다 작음 |
| F-051 | P3 | 최대 100명 ranking을 비가상화 ScrollView로 모두 mount함 |
| F-049 | P3 | Production 초기 loading이 구조적 skeleton을 사용하지 않음 |
| F-060 | P3 | leaderboard에서 현재 사용자 행을 강조하지 않음 |

## F — 기능 단위 설계·통합

독립된 기능 범위와 완료 기준을 먼저 설계한다. Backend API→Frontend 순서(프로필72→73, socket74→75), OAuth70/71은 Android 지원 요구와 provider 설정 재확인, 알림15는 worker 안정화 뒤 연결. Offline76은 durable intent/idempotency/LWW 충돌 정책이 선행한다. Calendar77·통계78은 조회 API/시간 기준과 함께 검증한다. 로컬 계약 검증과 실제 provider/Firebase/기기 통합 증거를 구분한다.

| ID | 원 심각도 | 원장 제목 |
|---|---|---|
| F-015 | P2 | Android notification client와 설정 기능이 아직 없음 |
| F-070 | P2 | Backend가 모든 Apple 로그인을 무조건 거부함 |
| F-071 | P2 | Frontend에서 Kakao 로그인은 placeholder이고 Apple 로그인은 비활성임 |
| F-072 | P2 | 닉네임과 프로필 이미지 설정·수정 API가 없음 |
| F-073 | P2 | Frontend onboarding과 MyPage에 nickname·profile image 편집 경로가 없음 |
| F-074 | P2 | Backend에 WebSocket gateway와 ranking·notification broadcast 경로가 없음 |
| F-075 | P2 | Frontend ranking 화면에 WebSocket 실시간 갱신 경로가 없음 |
| F-076 | P2 | 오프라인 Task CRUD queue와 updatedAt 기반 LWW 동기화가 없음 |
| F-077 | P2 | 월간·주간 캘린더와 날짜별 Task·달성률 indicator가 없음 |
| F-078 | P2 | 카테고리별 성취 통계 화면과 데이터 요청이 없음 |

## 병행 유지할 외부 gate

위 57건에 포함되지 않는 FIXING F-067/F-068과 UNKNOWN F-003/F-013/F-017/F-065는 운영·공개 URL·서명/OEM·OAuth 증거가 필요하다. 사용자는 아직 운영 환경이 없다고 확인했다. 로컬 수정의 종결이 전체 release-ready를 뜻하지 않으며 자유 탐색 연속2회 조건도 유지한다.
