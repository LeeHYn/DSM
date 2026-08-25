# External PC Setup and Handoff 문서 설계

## 목표

외부 PC에서 저장소를 clone한 사람이 다음 세 가지를 한 문서만으로 수행할 수 있게 한다.

1. `main`과 현재 개발 브랜치의 차이를 확인하고 올바른 브랜치를 선택한다.
2. Git으로 복원되지 않는 로컬 환경을 안전하게 재구성하고 backend·frontend를 검증한다.
3. 실제 Git·`.ai/memory` 근거로 현재 진척도와 다음 작업을 다시 확인한 뒤 기존 승인 gate를 유지하며 작업을 재개한다.

최종 산출물은 저장소 루트의 `EXTERNAL_PC_SETUP_AND_HANDOFF.md` 한 파일이다. 루트 `README.md`, 제품 코드, 테스트, 설정과 기존 architecture 문서는 수정하지 않는다.

## 선택한 접근

루트에 안정적인 이름의 self-contained handoff 문서를 둔다. 날짜별 상태를 문서에 고정된 사실처럼만 적지 않고, 다음 두 층으로 나눈다.

- **검증된 스냅샷**: 확인일, 원격 branch, commit, 구현·미구현 범위와 검증 이력.
- **재확인 절차**: `git fetch`, `git branch`, `git rev-list`, `.ai/memory` 읽기 명령으로 외부 PC가 현재 사실을 다시 계산한다.

문서와 실제 Git 또는 memory가 충돌하면 실제 source·test·Git diff·현재 검증 출력이 우선하고 불일치를 보고하도록 명시한다.

## 문서 구조

최종 문서는 아래 순서를 사용한다.

1. 문서 목적과 판정 우선순위
2. 5분 빠른 시작
3. 현재 원격 branch·commit 스냅샷
4. 현재 구현 완료·진행 중·미구현 상태
5. 필수 프로그램과 플랫폼별 도구
6. clone·branch checkout·upstream 확인
7. backend 환경변수 이름과 Compose 전용 누락 변수
8. PostgreSQL 17 생성·Prisma migration·DB 상태 검증
9. frontend 환경변수와 Web·Android Emulator·실기기 API 주소
10. backend·frontend 설치·build·test·실행 명령
11. Git으로 전달되지 않는 로컬 파일·데이터·자격 증명
12. OAuth·Firebase·원격 DB·deploy 승인 gate
13. 다른 PC에서 현재 진척도를 재확인하는 명령
14. 다음 작업을 선택하고 재개하는 절차
15. Windows 문제 해결과 금지 명령
16. handoff 문서 갱신 규칙과 완료 체크리스트

## 상태 스냅샷 계약

작성 시점의 직접 확인값은 다음과 같이 기록하되 `확인일 기준`임을 표시한다.

- `origin/main`: `2e25d98`
- 안정 checkpoint: `origin/codex/m12b-front-prototype-checkpoint` `960f02b`
- 현재 가장 진행된 개발 branch: `origin/codex/front-secure-session-rest-client` `bb712ba`
- `origin/main`은 원격 upstream과 일치하지만 최신 개발 branch보다 59 commits 이전이다.
- 외부 PC에서 현재 개발을 이어갈 기본 선택은 `codex/front-secure-session-rest-client`다.
- 최신 개발 branch는 Front secure session·REST client 상세 계획의 Task 1~19를 완료했고, 즉시 재개 지점은 Task 20 React session context다.
- 전체 authentication `change-gate`는 Task 31이며 아직 미실행이다. M12C는 secure session·REST client 계획을 마친 뒤의 후속 milestone이다.
- root checkout의 미커밋 `.ai/docs/2026-07-15-current-project-architecture.md` 변경은 Git으로 전달되지 않는다.

branch 이름이나 commit이 바뀌었으면 문서의 스냅샷을 신뢰하지 않고 원격 ref와 `.ai/memory/checklist.md`를 다시 확인한다.

## 환경과 보안 계약

- Node.js는 backend 계약인 `>=22`를 공통 기준으로 사용한다.
- backend와 frontend는 root workspace가 아닌 별도 npm project이므로 각각 `npm ci`를 실행한다.
- backend 실제 `.env`와 frontend `.env.local`은 Git에서 복원되지 않는다.
- 문서에는 환경변수 이름, 형식, 안전한 placeholder만 기록하고 실제 credential·token·private key·사용자 식별값을 넣지 않는다.
- Compose 필수 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`가 backend `.env.example`에 누락된 사실과 `DATABASE_URL` 일치 조건을 명시한다.
- frontend `EXPO_PUBLIC_API_BASE_URL`에는 공개 base URL만 허용하며 secret을 넣지 않는다.
- 12C와 실제 sandbox 검증 전 `FCM_DISPATCH_ENABLED=false`를 유지한다.
- Firebase는 승인된 test project의 ADC-only 경계를 따르고 service-account JSON이나 private key를 저장소에 복사하지 않는다.
- 원격·운영 DB migration, deploy, 실제 FCM send, Git push·merge는 각 별도 승인 없이는 실행하지 않는다.

## 재개 절차 계약

외부 PC에서 다음 순서로 진행 상황을 복원한다.

1. `git fetch --prune origin` 후 현재 branch와 upstream을 확인한다.
2. `origin/main`, checkpoint, 현재 개발 branch의 ahead·behind와 최신 commit을 확인한다.
3. `.ai/system_prompt.md`, `.ai/memory/plan.md`, `context.md`, `checklist.md`를 읽는다.
4. 실제 checkout의 source·test·Git status를 memory snapshot과 대조한다.
5. 최신 branch의 Task 1~19 완료 evidence를 확인하고 Task 20 React session context부터 재개한다. Task 31 authentication `change-gate`와 이후 M12C 순서를 유지한다.
6. 다음 변경은 계획, exact 1~2-file writable allowlist와 사용자 승인을 먼저 기록한다.
7. 실제 Firebase, 원격 DB, deploy와 Git write gate는 유지한다.

## 오류·예외 처리

- `main`만 clone돼 있으면 최신이라고 단정하지 않고 원격 개발 branch를 비교한다.
- `.env`가 없으면 template을 기반으로 새로 만들되 기존 PC의 secret 전송을 요구하지 않는다.
- Docker volume은 Git으로 오지 않으므로 빈 DB로 간주하고 기존 migration을 `migrate deploy`로 적용한다.
- 테스트 통과와 실제 DB 연결 검증을 분리한다. Jest는 test 환경에서 Prisma 실제 연결을 차단하므로 `prisma migrate status`를 별도로 실행한다.
- Windows PowerShell에서 `npm.ps1`이 차단되면 ExecutionPolicy를 완화하지 않고 동일 Node 설치의 `npm.cmd`·`npx.cmd`를 사용한다.
- `setup-ai.ps1`과 `npm run reset-project`는 기존 상태를 덮어쓰거나 이동·삭제하므로 clone 후 초기화 명령으로 실행하지 않는다.
- 문서의 branch·commit·진척도와 현재 Git 결과가 다르면 작업을 시작하지 않고 불일치를 먼저 기록한다.

## 검증 계획

최종 문서를 작성한 뒤 다음 읽기 전용 검증을 수행한다.

1. 필수 section 16개와 branch·commit·다음 작업·gate가 모두 존재하는지 `rg`로 확인한다.
2. 실제 `.env`를 읽지 않고 tracked example, package scripts, Compose, Prisma migration tree, 최신 branch의 frontend config와 교차 대조한다.
3. 예시 명령이 현재 저장소의 script·path와 일치하는지 확인한다.
4. 미확정·미완성 marker, 실제 secret처럼 보이는 값과 private-key marker가 없는지 검사한다.
5. `git diff --check -- EXTERNAL_PC_SETUP_AND_HANDOFF.md`와 최종 `git status`로 기존 변경 보존을 확인한다.
6. Git stage·commit·push는 수행하지 않는다.

## 범위 밖

- 의존성 설치·컨테이너 실행·migration 실제 적용
- product source·test·config 수정
- 실제 `.env`, Firebase ADC, OAuth token, signing key 열람·복사
- 현재 branch 전환·merge·PR·deploy
- 기존 offline learning-site 작업과 dirty architecture 문서 수정

## 승인 기록

- 2026-08-08 사용자 `ㄱ`: 루트 `EXTERNAL_PC_SETUP_AND_HANDOFF.md` 접근과 위 목적의 문서화 진행 승인.
- 설계 명세 검토 후 최종 문서 생성은 별도 실행 단계로 진행한다.
