# DSM 외부 PC 설정 및 작업 인수인계

> 확인 기준일: 2026-08-08 (Asia/Seoul)
> 저장소: `https://github.com/LeeHYn/DSM.git`
> 권장 재개 브랜치: `codex/front-secure-session-rest-client`

## 1. 문서 목적과 사실 판정 우선순위

이 문서는 다른 PC에서 DSM 저장소를 clone한 뒤 다음 작업을 수행하기 위한 단일 진입점이다.

1. `main`과 현재 개발 브랜치의 차이를 확인한다.
2. Git으로 복원되지 않는 로컬 환경을 안전하게 재구성한다.
3. Backend·Frontend의 현재 검증 상태를 새 PC에서 다시 확인한다.
4. 완료된 작업과 다음 작업을 확인하고 기존 승인 Gate를 유지하며 개발을 재개한다.

이 문서의 날짜별 스냅샷보다 다음 근거가 우선한다.

1. 현재 checkout의 실제 source와 test
2. `git status`, `git log`, `git diff`와 원격 ref
3. 현재 실행한 build·test·DB 검증 출력
4. `.ai/memory/plan.md`, `context.md`, `checklist.md`
5. 이 문서의 확인일 기준 스냅샷

문서와 실제 Git·source·test·memory가 다르면 임의로 하나를 선택하지 않는다. 먼저 차이를 기록하고 작업 기준 branch와 commit을 확정한다.

관련 저장소 근거:

- [프로젝트 AI 실행 규칙](.ai/system_prompt.md)
- [현재 계획](.ai/memory/plan.md)
- [현재 맥락](.ai/memory/context.md)
- [현재 체크리스트](.ai/memory/checklist.md)
- [Front secure session 상세 계획](docs/superpowers/plans/2026-07-25-front-secure-session-rest-client.md)

## 2. 5분 빠른 시작

새 PC의 `C:\DEV`가 비어 있을 때 권장 순서다. 다른 경로에서도 제품은 실행할 수 있지만 일부 로컬 AI 권한 기록은 `C:\DEV`를 기준으로 한다.

```powershell
git clone https://github.com/LeeHYn/DSM.git C:\DEV
Set-Location C:\DEV
git fetch --prune origin
git switch --track origin/codex/front-secure-session-rest-client
git status -sb
git branch -vv
```

필수 도구를 확인한다.

```powershell
git --version
node --version
npm --version
docker version
docker compose version
wsl --version
```

Node.js는 `v22` 이상을 사용한다. Backend와 Frontend는 독립된 npm 프로젝트이므로 각각 `npm ci`가 필요하다.

```powershell
Set-Location C:\DEV\DSM_Back
npm ci
Copy-Item .env.example .env

Set-Location C:\DEV\DSM_Front
npm ci
Copy-Item .env.example .env.local
```

`.env`와 `.env.local`을 설정한 뒤 DB·migration·test를 실행한다. 실제 값은 이 문서나 Git에 기록하지 않는다.

## 3. 확인일 기준 Git 스냅샷

2026-08-08에 원격 ref를 직접 확인한 결과다.

| 역할 | 원격 ref | Commit | 상태 |
|---|---|---:|---|
| 기본 branch | `origin/main` | `2e25d98` | 원격 upstream과 동기화됐지만 현재 기능 개발 기준은 아님 |
| 안정 checkpoint | `origin/codex/m12b-front-prototype-checkpoint` | `960f02b` | Backend 12B와 Front Phase 1 prototype checkpoint |
| 현재 개발 branch | `origin/codex/front-secure-session-rest-client` | `bb712ba` | Front Task 19 완료 상태와 memory 기록 포함 |

확인일 기준 최신 개발 branch는 `main`의 모든 commit을 포함하며 `main`보다 59 commits 앞서 있다. `main`이 `origin/main`과 동기화됐다는 사실은 현재 개발 내용이 `main`에 merge됐다는 의미가 아니다.

원격 상태는 다음 명령으로 다시 계산한다.

```powershell
git fetch --prune origin
git log -1 --format="%h %ci %s" origin/main
git log -1 --format="%h %ci %s" origin/codex/m12b-front-prototype-checkpoint
git log -1 --format="%h %ci %s" origin/codex/front-secure-session-rest-client
git rev-list --left-right --count origin/main...origin/codex/front-secure-session-rest-client
git merge-base --is-ancestor origin/main origin/codex/front-secure-session-rest-client
```

마지막 명령의 exit code가 `0`이면 `main`이 최신 개발 branch의 ancestor다. commit 또는 ahead·behind 수치가 이 표와 다르면 현재 명령 출력이 우선한다.

현재 작성 PC의 `.ai/docs/2026-07-15-current-project-architecture.md`에는 미커밋 변경이 있다. 이 변경은 commit·push되지 않는 한 다른 PC의 clone으로 전달되지 않는다.

이 저장소에는 Git submodule과 Git LFS 설정이 없으므로 `--recurse-submodules` 또는 `git lfs pull`은 현재 필요하지 않다.

## 4. 현재 구현 상태

### 완료된 기반

- Backend M1~M11
  - NestJS/Prisma/PostgreSQL 기반
  - Google/Kakao Auth, JWT access/refresh, logout, `/auth/me`
  - Task·Category CRUD
  - DailyScore·Tier
  - DAILY/WEEKLY/TOTAL Ranking
- Notification 12A
  - FCM token lifecycle
  - Task와 `NotificationSchedule` 원자 동기화
- Notification 12B Backend
  - ADC-only Firebase Admin provider
  - 30초 Cron dispatcher
  - per-device delivery, retry, lease·heartbeat
  - durable send marker와 terminal `UNKNOWN`
  - account-neutral data-only payload
- Front Phase 1 prototype
  - 로그인·튜토리얼·홈·랭킹·마이페이지
  - local mock Task CRUD
  - loading·empty·error·offline 상태
  - theme·logout과 responsive Browser QA

### 최신 개발 branch에서 완료된 Front 작업

`origin/codex/front-secure-session-rest-client`의 상세 계획 33개 중 Task 1~19가 완료됐다.

- Backend onboarding timestamp contract와 strict CORS
- Expo SDK 55 Jest·ESLint·SecureStore 기반
- 안전한 `EXPO_PUBLIC_API_BASE_URL` 검증
- 공통 `ApiError`와 runtime auth response validator
- one-attempt JSON transport와 public auth API
- refresh-token storage queue와 session epoch fence
- Native SecureStore adapter와 Web memory-only token store
- authenticated client의 single-flight refresh 및 1회 replay
- session state machine의 bootstrap·sign-in·refresh·onboarding·logout·recovery

최신 branch HEAD는 `bb712ba`이며 Task 19 제품 snapshot commit은 `82d03bf`다.

### 즉시 다음 작업

**Front Task 20: React session context**부터 재개한다. M12C로 바로 건너뛰지 않는다.

이후 순서는 다음과 같다.

1. Front secure session·REST client 상세 계획의 남은 Task
2. Task 31 전체 authentication `change-gate`
3. M12C notification permission·Installation rotation·authenticated current-state 표시
4. 별도 Firebase test project와 실제 device ADC·FCM sandbox
5. 검증 후 `FCM_DISPATCH_ENABLED` 활성 판단
6. M13 WebSocket realtime ranking
7. M14 Redis/batch caching

### 남은 제한과 위험

- onboarding migration 파일은 생성·검증됐지만 기존 persistent 개발 DB에는 아직 적용되지 않았다.
- Front dependency audit 55건 중 critical 1건을 포함한 별도 triage가 남아 있다.
- 실제 provider OAuth E2E와 Native SecureStore 실기기 smoke가 완료되지 않았다.
- Notification 12C와 실제 ADC·FCM 발송 검증이 완료되지 않았다.
- Task 31 authentication `change-gate`가 아직 미실행이다.
- FCM 발송 후 recall 불가와 표시 결정 직후 취소 race는 사용자 승인 `ACCEPTED_RISK`이며 해결 완료로 바꾸지 않는다.
- PR·merge·배포는 수행되지 않았다.

### 과거 검증 기준선

| 영역 | 마지막 기록된 기준선 | 새 PC에서 재실행 필요 |
|---|---|---|
| Backend unit | Jest 22 suites·198 tests | 필요 |
| Backend e2e | 1 suite·2 tests | 필요 |
| Backend 기타 | Nest build, TypeScript, lint·Prettier, Prisma validate | 필요 |
| Front 최신 branch | Jest 10 suites·101 tests, ESLint, TypeScript | 필요 |
| Local DB | 2개 기존 migration up-to-date·zero drift 기록 | 새 PC DB에 migration 전체 적용·status 확인 필요 |

과거 PASS 기록은 새 PC의 현재 검증을 대체하지 않는다.

## 5. 필수 프로그램과 플랫폼 도구

### 공통 필수

- Git
- Node.js `>=22`
- npm
- Docker Desktop 또는 호환 Docker Engine·Compose
- PostgreSQL client를 직접 설치할 필요는 없으며 `postgres:17-alpine` image를 사용한다.

정확한 Node patch와 npm 버전은 `.nvmrc`, `.node-version`, Volta 등으로 고정돼 있지 않다. 환경 차이를 줄이려면 팀에서 동일한 Node 22 patch를 선택해 기록한다.

### Windows

- WSL2
- BIOS/UEFI hardware virtualization
- Docker Desktop WSL2 backend

[Docker Desktop Windows 공식 설치 문서](https://docs.docker.com/desktop/setup/install/windows-install/)에서 현재 지원 OS와 WSL 요구사항을 다시 확인한다.

### Android 개발 시

- JDK 17
- Android Studio
- Android SDK Platform 36
- Android Emulator, Build Tools, Platform Tools
- `ANDROID_HOME`
- `platform-tools`를 포함한 PATH

[Expo Android Emulator 공식 설정](https://docs.expo.dev/workflow/android-studio-emulator/)을 따른다.

### iOS 개발 시

- macOS
- Expo SDK 55 기준 지원되는 Xcode
- iOS simulator 또는 실제 기기

Windows에서는 iOS simulator와 로컬 Xcode build를 실행할 수 없다. [Expo SDK 55 공식 버전표](https://docs.expo.dev/versions/v55.0.0/)에서 현재 Node·React Native·Android·iOS 요구사항을 확인한다.

### 계정·도구

- clone만 할 때 공개 저장소라면 GitHub 인증이 필요하지 않을 수 있다.
- push가 필요하면 승인된 GitHub 계정 또는 SSH key와 `git user.name`, `git user.email`을 설정한다.
- Firebase, OAuth와 signing 자격 증명은 기능별 승인 단계에서 별도로 준비한다.

## 6. Clone과 작업 브랜치 선택

### 새 PC의 권장 clone

```powershell
git clone https://github.com/LeeHYn/DSM.git C:\DEV
Set-Location C:\DEV
git remote -v
git fetch --prune origin
git switch --track origin/codex/front-secure-session-rest-client
git status -sb
git branch -vv
```

새 clone에서 tracking branch가 이미 만들어졌다면 다음 명령으로 전환한다.

```powershell
git switch codex/front-secure-session-rest-client
```

### `main`을 사용해야 하는 경우

`main`은 현재 기능 개발 branch가 아니다. `main`에서 작업해야 한다면 먼저 최신 개발 branch의 PR·review·merge 여부를 확인한다. 승인 없이 직접 merge, rebase 또는 force-push하지 않는다.

### 작업 시작 전 확인

```powershell
git status --short --branch
git branch -vv
git remote -v
git log -5 --oneline --decorate
git diff --check
```

다른 PC에서 만들어진 미커밋 파일, Docker volume, `.worktrees`와 IDE 상태는 clone으로 복원되지 않는다.

## 7. Backend 로컬 환경변수

Backend 실제 환경파일은 Git에서 제외된다.

```powershell
Set-Location C:\DEV\DSM_Back
Copy-Item .env.example .env
```

실제 `.env`를 Git에 추가하거나 채팅·문서·로그로 공유하지 않는다.

### 애플리케이션 변수

| 변수 | 요구사항 |
|---|---|
| `NODE_ENV` | `development`, `test`, `production`; 기본 `development` |
| `PORT` | 양의 정수; 기본 `3000` |
| `DATABASE_URL` | 필수 PostgreSQL 연결 URL |
| `JWT_ACCESS_SECRET` | 필수, 32자 이상 별도 생성값 |
| `JWT_REFRESH_SECRET` | 필수, 32자 이상 별도 생성값 |
| `GOOGLE_CLIENT_ID` | 필수; 실제 Google 로그인에는 프로젝트의 정확한 OAuth Client ID 필요 |
| `CORS_ORIGINS` | browser origin exact allowlist, comma-separated |
| `FCM_DISPATCH_ENABLED` | 정확히 `true` 또는 `false`; 현재 반드시 `false` |
| `FCM_PROJECT_ID` | dispatch가 `true`일 때만 필수; 현재 활성화 금지 |
| `REDIS_URL` | 선택; Redis 기능은 아직 미구현 |

최신 branch의 local Web 예시는 다음 origin을 허용한다.

```dotenv
CORS_ORIGINS="http://localhost:8081,http://127.0.0.1:8081"
```

### Compose 전용으로 추가할 변수

현재 Backend `.env.example`에는 Compose가 요구하는 세 변수가 빠져 있다. `.env`에 다음 이름을 추가하고 비밀번호를 반드시 교체한다.

```dotenv
POSTGRES_USER=dsm
POSTGRES_PASSWORD=CHANGE_ME_LOCAL_ONLY
POSTGRES_DB=dsm
POSTGRES_PORT=5432
```

`DATABASE_URL`은 위 값과 일치해야 한다.

```dotenv
DATABASE_URL="postgresql://dsm:CHANGE_ME_LOCAL_ONLY@localhost:5432/dsm?schema=public"
```

비밀번호에 URL 예약문자가 있으면 `DATABASE_URL` 안에서는 URL encode한다. 위 값은 형식 예시이며 실제 공용·운영 credential로 사용하지 않는다.

`JWT_ACCESS_SECRET`과 `JWT_REFRESH_SECRET`은 서로 다른 고엔트로피 값으로 생성한다. 실제 Google 로그인을 검증하려면 프로젝트 관리자에게 `GOOGLE_CLIENT_ID`를 안전한 경로로 받는다.

## 8. PostgreSQL과 Prisma 초기화

아래 절차는 **새 외부 PC의 빈 로컬 PostgreSQL** 전용이다. 실행 전 `DATABASE_URL`이 `localhost` 또는 `127.0.0.1`을 가리키는지 확인한다. 기존 persistent 개발 DB나 원격·운영 DB 적용은 별도 action-time 승인이 필요하다.

```powershell
Set-Location C:\DEV\DSM_Back
docker compose config --quiet
docker compose up -d db
docker compose ps
```

Compose 계약:

- PostgreSQL `17-alpine`
- UTC timezone
- host `127.0.0.1` loopback bind
- 기본 host port `5432`
- named volume `dsm-back-postgres-data`
- healthcheck와 `unless-stopped`

의존성을 설치한 뒤 Prisma를 준비한다.

```powershell
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npx prisma migrate status
```

최신 branch의 migration 목록:

1. `20260716_init`
2. `20260720_notification_delivery_outcome_policy`
3. `20260725_user_onboarding_completed_at`

주의:

- Git은 기존 Docker volume과 DB 데이터를 복사하지 않는다.
- 새 PC DB는 빈 상태에서 추적된 migration으로 재구성한다.
- 표준 seed script가 없다.
- 단순 onboarding에서 `prisma migrate dev`로 새 migration을 만들거나 `prisma db push`로 history를 우회하지 않는다.
- unit/e2e test는 `NODE_ENV=test`에서 실제 Prisma 연결을 차단하므로 test PASS만으로 DB 준비 완료를 주장하지 않는다.
- `/health`의 `database.configured`는 `DATABASE_URL` 존재 여부만 나타내며 DB query health가 아니다.

## 9. Frontend 로컬 환경변수

최신 개발 branch에는 `DSM_Front/.env.example`이 있다. 실제 로컬 파일은 commit되지 않는 `.env.local`을 사용한다.

```powershell
Set-Location C:\DEV\DSM_Front
Copy-Item .env.example .env.local
```

Web 또는 iOS simulator:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
```

Android Emulator:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

실제 모바일 기기:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://PC_LAN_IP:3000
```

실기기 사용 조건:

- PC와 기기가 같은 LAN/Wi-Fi에 있어야 한다.
- `PC_LAN_IP`를 실제 private IPv4 주소로 교체한다.
- Windows Firewall에서 개발용 Backend port 접근을 허용해야 할 수 있다.
- Backend가 해당 기기에서 접근 가능한 interface에 listen하는지 확인한다.

Production에서는 HTTPS만 사용한다. `EXPO_PUBLIC_*`는 앱 bundle에 공개되므로 OAuth secret, JWT secret, token, Firebase private key 등을 넣지 않는다.

Web 요청을 사용할 때 Backend `CORS_ORIGINS`가 실제 browser origin과 정확히 일치해야 한다. Native·CLI 요청은 일반적으로 Origin header가 없으며 최신 Backend CORS 계약은 Origin 없는 요청을 허용한다.

## 10. 설치·검증·실행 명령

두 프로젝트의 lockfile이 별도로 존재하므로 root에서 한 번만 설치하면 안 된다.

### Backend

```powershell
Set-Location C:\DEV\DSM_Back
npm ci
npm run prisma:generate
npm run prisma:validate
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run start:dev
```

서버 기동 후 기본 확인:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
npx prisma migrate status
```

`npm run lint`는 Backend에서 `--fix`, `npm run format`은 `--write`를 사용하므로 상태 확인만을 위한 명령이 아니다. 실행하면 source가 변경될 수 있다.

### Frontend 최신 branch

```powershell
Set-Location C:\DEV\DSM_Front
npm ci
npm run typecheck
npm test
npm run lint
npm run web
```

플랫폼 실행:

```powershell
npm run android
npm run ios
```

`npm run ios`는 macOS/Xcode 환경이 필요하다. Expo global CLI 설치는 요구되지 않으며 project-local `expo`를 npm script가 사용한다.

### 검증 판정

- 각 명령의 실제 exit code가 `0`인지 확인한다.
- test summary뿐 아니라 마지막 cache·permission 오류까지 확인한다.
- 새 PC에서 재실행하지 않은 항목은 `미실행`으로 기록한다.
- Backend test와 실제 DB migration status를 별도로 기록한다.
- Native device smoke, OAuth E2E, Firebase sandbox는 실행하지 않았다면 완료로 표시하지 않는다.

## 11. Git으로 전달되지 않는 항목

| 항목 | 이유 | 외부 PC 처리 |
|---|---|---|
| `DSM_Back/.env` | ignored local secret/config | `.env.example` 기반 재작성 |
| `DSM_Front/.env.local` | ignored local public config | `.env.example` 기반 재작성 |
| `node_modules/` | ignored dependency output | Backend·Frontend 각각 `npm ci` |
| `.expo/` | Expo local cache | Expo 실행 시 재생성 |
| `dist/`, `build/`, coverage | 생성물 | build/test 시 재생성 |
| `/ios`, `/android` | generated native folders | 필요할 때 Expo workflow로 재생성 |
| Docker image/container/volume/data | Git 외부 runtime state | 새 local DB 구성 또는 별도 승인된 backup 복원 |
| Firebase ADC | OS·사용자 credential state | 승인된 sandbox 단계에서 별도 로그인 |
| OAuth token·signing key·certificate | 민감한 외부 상태 | 프로젝트 관리자의 안전한 채널로 별도 준비 |
| `.worktrees/` | PC별 Git worktree | 필요 시 새 PC에서 다시 생성 |
| 전역 Codex skills/plugins | 사용자 전역 설치 | AI 작업에 필요할 때 별도 설치·검증 |
| Obsidian Vault·junction·IndexedDB cache | PC 로컬 문서 환경 | 제품 실행에는 불필요; 사용 시 clone 경로에 맞춰 재구성 |
| 모든 미커밋 변경 | Git history에 없음 | 기존 PC에서 commit·push하거나 별도 승인된 방식으로 전달 |

반대로 package lockfile, Backend `.env.example`, Compose, Prisma migrations, Front 최신 branch `.env.example`, product source·test와 `.ai` 운영 문서는 Git에 포함된다.

## 12. 외부 서비스와 승인 Gate

### Firebase/FCM

- 현재 `FCM_DISPATCH_ENABLED=false`를 유지한다.
- M12C와 승인된 test project/device evidence 전에는 실제 message를 발송하지 않는다.
- Backend는 ADC-only provider 계약을 사용한다.
- service-account JSON이나 private key를 저장소에 복사하지 않는다.
- 승인된 sandbox에서만 [Firebase Admin 공식 ADC 설정](https://firebase.google.com/docs/admin/setup)을 따른다.

### OAuth

- 실제 Google login에는 Backend audience와 일치하는 `GOOGLE_CLIENT_ID`가 필요하다.
- Kakao 실제 검증에는 외부 API 접근과 실제 사용자 access token이 필요하다.
- Front provider token 획득 SDK와 완전한 OAuth E2E 상태는 현재 별도로 확인한다.
- Apple Sign In은 아직 구성 완료 상태가 아니다.

### Database

- 원격·운영 DB 접속, migration, reset, drop은 별도 승인 전 금지한다.
- onboarding migration의 기존 persistent 개발 DB 적용도 별도 action-time 승인 대상이다.
- `DATABASE_URL`을 출력하거나 로그에 남기지 않는다.

### Git·배포

- stage, commit, push, PR, merge, rebase, force-push와 deploy는 각각 현재 승인 범위를 확인한다.
- `main` 직접 push로 feature branch merge 절차를 우회하지 않는다.

### 위험 상태

- `ACCEPTED_RISK`를 구현 완료, 검증 완료 또는 `RECHECKED`로 바꾸지 않는다.
- dependency audit 55건은 자동/force fix하지 않고 별도 compatibility·security triage를 수행한다.

## 13. 현재 진척도 재확인

### Git 기준선 확인

```powershell
Set-Location C:\DEV
git fetch --prune origin
git status --short --branch
git branch -a -vv
git log -10 --oneline --decorate
git rev-list --left-right --count origin/main...origin/codex/front-secure-session-rest-client
```

### 현재 checkout의 memory 확인

```powershell
Get-Content -Raw -Encoding UTF8 .ai\system_prompt.md
Get-Content -Raw -Encoding UTF8 .ai\memory\plan.md
Get-Content -Raw -Encoding UTF8 .ai\memory\context.md
Get-Content -Raw -Encoding UTF8 .ai\memory\checklist.md
```

현재 checkout이 최신 개발 branch가 아니라면 checkout을 바꾸지 않고 원격 branch의 memory를 확인할 수 있다.

```powershell
git show origin/codex/front-secure-session-rest-client:.ai/memory/plan.md
git show origin/codex/front-secure-session-rest-client:.ai/memory/context.md
git show origin/codex/front-secure-session-rest-client:.ai/memory/checklist.md
```

### 다음 작업 evidence 확인

```powershell
git show origin/codex/front-secure-session-rest-client:.ai/memory/checklist.md |
  Select-String -Pattern "Task 20|Task 31|12C|실제 ADC|M13|M14" -Context 2,6
```

Task 20이 이미 완료됐으면 상세 계획과 최신 checklist에서 첫 번째 미완료 Task를 선택한다. 숫자만 보고 건너뛰지 않고 바로 앞 Task의 commit·test·review evidence도 확인한다.

## 14. 다음 작업 재개 절차

1. `git fetch --prune origin`으로 원격 ref를 갱신한다.
2. 현재 branch·HEAD·upstream·working tree를 확인한다.
3. `.ai/system_prompt.md`와 active memory 3종을 읽는다.
4. 최신 개발 branch의 memory와 실제 source·test를 대조한다.
5. Node·npm·Docker·환경파일·DB·Frontend local state를 재구성한다.
6. Backend·Frontend 검증을 새 PC에서 다시 실행하고 exit code를 기록한다.
7. Front 상세 계획의 **Task 20 React session context**부터 재개한다.
8. Task 20이 원격에서 이미 완료됐다면 상세 계획의 첫 미완료 Task로 이동한다.
9. 제품 수정 전 계획, exact 1~2-file writable allowlist, 검증 명령과 사용자 승인을 기록한다.
10. Task 31 authentication `change-gate`를 완료하기 전 전체 인증 완료를 주장하지 않는다.
11. secure session·REST client 계획을 마친 뒤 M12C로 이동한다.
12. Firebase·원격 DB·deploy·Git write Gate를 계속 유지한다.

관련 상세 계획:

- [Front secure session·REST client 설계](docs/superpowers/specs/2026-07-25-front-secure-session-rest-client-design.md)
- [Front secure session·REST client 실행 계획](docs/superpowers/plans/2026-07-25-front-secure-session-rest-client.md)
- [현재 프로젝트 architecture](.ai/docs/2026-07-15-current-project-architecture.md)

새 PC에서는 기존 `.worktrees`가 없으므로 제품 수정 전에 현재 프로젝트 규칙에 맞는 isolated worktree 필요 여부를 확인한다. worktree 생성·branch 이동도 승인 범위와 현재 Git 상태를 먼저 확인한다.

## 15. Windows 문제 해결과 금지 명령

### PowerShell에서 `npm.ps1`이 차단될 때

증상은 `PSSecurityException`과 script 실행 정책 오류다.

```powershell
Get-Command npm -All
Get-Command npx -All
npm.cmd --version
npx.cmd --version
```

`npm.ps1`과 `npm.cmd`가 같은 Node 설치에 속하면 `npm.cmd`, `npx.cmd`를 사용한다. 시스템 전체 ExecutionPolicy를 완화하거나 영구 `Bypass`하지 않는다.

### Jest가 마지막에 Windows Temp `EPERM`으로 실패할 때

- test assertion 결과와 cache write 오류를 분리한다.
- `jest-transform-cache`, `perf-cache`, `@jest/transform` 또는 `@jest/test-sequencer` stack인지 확인한다.
- 제품 코드를 임의 수정하지 않는다.
- 승인된 writable temp 또는 sandbox 밖 동일 명령으로 재검증하고 실제 exit code를 확인한다.

### Docker가 시작되지 않을 때

```powershell
wsl --version
wsl --status
docker version
docker compose version
```

WSL2, hardware virtualization과 Docker Desktop Engine 상태를 확인한다. 문제 해결을 위해 기존 volume을 삭제하거나 DB를 reset하지 않는다.

### 실행하면 안 되는 초기화 명령

- root `setup-ai.ps1`
  - 현재 `.ai/system_prompt.md`와 memory 파일을 덮어쓸 수 있다.
- Frontend `npm run reset-project`
  - 기존 source를 이동하거나 삭제하고 starter app을 다시 만들 수 있다.
- `git reset --hard`, force checkout, force-push
  - 기존 미커밋 작업을 손실시킬 수 있다.
- `prisma db push`
  - migration history를 우회한다.
- onboarding 목적의 `prisma migrate dev`
  - 기존 migration 적용 대신 새 migration을 만들 수 있다.
- Backend `npm run lint`, `npm run format`을 읽기 전용 검사로 간주
  - 각각 `--fix`, `--write`로 파일을 변경한다.

Git의 LF→CRLF 안내만으로 실패라고 단정하지 않는다. `git diff --check`의 실제 whitespace error와 working tree diff를 확인한다.

## 16. 문서 갱신 규칙과 완료 체크리스트

이 문서는 handoff 시점마다 다음 항목만 근거와 함께 갱신한다.

- 확인일과 timezone
- `origin/main`, checkpoint, 현재 개발 branch와 commit
- ahead·behind
- 완료된 마지막 Task와 다음 Task
- 최신 build·test·lint·DB migration 검증 결과
- 새로 적용되거나 남은 migration
- 미해결 dependency/security triage
- FCM·OAuth·remote DB·deploy·Git write Gate
- Git으로 전달되지 않는 미커밋 변경

실제 `.env`, token, key, 사용자 식별값과 운영 데이터는 절대 기록하지 않는다.

### 외부 PC setup 완료 체크리스트

- [ ] 권장 branch와 upstream을 확인했다.
- [ ] Node.js `>=22`, npm, Docker·Compose와 플랫폼 도구를 확인했다.
- [ ] Backend·Frontend에서 각각 `npm ci`를 실행했다.
- [ ] Backend `.env`와 Frontend `.env.local`을 Git 밖에서 만들었다.
- [ ] Compose `POSTGRES_*`와 `DATABASE_URL`을 일치시켰다.
- [ ] 새 local DB에 승인된 tracked migrations를 적용하고 status를 확인했다.
- [ ] Backend build·unit·e2e·Prisma 검증의 실제 exit code를 확인했다.
- [ ] Front Jest·ESLint·TypeScript와 선택 플랫폼 실행을 확인했다.
- [ ] 실제 device·OAuth·Firebase를 미실행했다면 완료로 표시하지 않았다.
- [ ] active memory와 실제 source·Git 상태의 불일치를 확인했다.
- [ ] 다음 작업이 Task 20 또는 최신 checklist의 첫 미완료 Task인지 확인했다.
- [ ] Task 31과 M12C 순서 및 모든 승인 Gate를 유지했다.
- [ ] 다음 수정 전 exact 1~2-file 계획과 사용자 승인을 기록했다.

### handoff 작성자 완료 체크리스트

- [ ] 새 commit·branch·test evidence를 문서 스냅샷에 반영했다.
- [ ] outdated branch·Task·migration 수치를 제거했다.
- [ ] 비밀값과 운영 데이터를 포함하지 않았다.
- [ ] 명령이 현재 `package.json`·Compose·Prisma·Expo 설정과 일치한다.
- [ ] `git diff --check`와 `git status`를 확인했다.
- [ ] 미커밋 변경과 미실행 검증을 명시했다.
