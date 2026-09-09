# Windows에서 DSM clone·개발하기

이 문서는 새 Windows PC에서 현재 DSM integration branch를 clone해 Backend와 Android 앱을 로컬에서 개발·검증하는 기준 절차입니다. 실제 소스, `package.json`, Prisma migration, `.env.example`을 기준으로 작성했습니다.

## 범위와 안전 경계

- 대상 branch는 `codex/integration-main-review`입니다. 이 branch는 현재 작업 통합본이며 release-ready 판정은 아닙니다.
- 각 PC는 자체 `.env`, `.env.local`, Android SDK, debug keystore, Docker volume을 사용합니다. 이 파일과 값은 Git에 올리지 않습니다.
- 초기화에는 lockfile 기반 `npm ci`와 `prisma migrate deploy`를 사용합니다. `npm install`, `prisma db push`, 기존 migration 수정, production/shared DB 연결은 초기 clone 절차에 포함하지 않습니다.
- FCM dispatch는 local 기본값인 `false`를 유지합니다. release signing·Google Cloud Console·Play Console 변경은 프로젝트 관리자 승인 후에만 수행합니다.

## 준비물

| 도구 | 기준 |
|---|---|
| Git for Windows | clone과 branch 동기화 |
| Node.js | 22 이상 권장. Backend와 Frontend의 engines 조건을 모두 만족해야 함 |
| npm | Node 설치본 사용 |
| Microsoft OpenJDK | 17 |
| Android Studio | Android SDK Platform 36, Build Tools 36.0.0, Platform Tools, API 36 AVD |
| Docker Desktop | Backend의 PostgreSQL 17·Redis 8 local 서비스용 |

PowerShell에서 `npm` 실행이 정책에 막히면 문서의 `npm.cmd`와 `npx.cmd` 명령을 그대로 사용합니다.

## 1. clone과 branch 확인

원하는 상위 폴더에서 실행합니다.

```powershell
git clone --branch codex/integration-main-review --single-branch https://github.com/LeeHYn/DSM.git DSM
Set-Location .\DSM
git branch --show-current
git status --short --branch
git log -1 --oneline
```

첫 명령 뒤 branch 이름이 `codex/integration-main-review`이고 tracked 변경이 없어야 합니다. 다른 branch를 clone했다면 파일을 복사하거나 `main`을 억지로 합치지 말고, 먼저 올바른 remote branch를 fetch·switch합니다.

```powershell
git fetch origin
git switch --track origin/codex/integration-main-review
```

## 2. Backend local 환경

Backend용 `.env`는 local 전용입니다. 예시를 복사한 후 실제 로컬 값만 채웁니다.

```powershell
Set-Location .\DSM_Back
Copy-Item .env.example .env
npm.cmd ci --no-audit --no-fund
docker compose up -d --wait db redis
docker compose ps
npm.cmd run prisma:generate
npx.cmd prisma migrate deploy
npm.cmd run start:dev
```

`.env.example`의 기본 PostgreSQL 값은 같은 폴더의 `compose.yaml`과 맞습니다. 처음 실행 시 다음 local 변수들이 존재하는지 확인합니다.

| 변수 | local 기본 역할 |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Docker PostgreSQL 생성과 loopback port 설정 |
| `DATABASE_URL` | 위 PostgreSQL에 접속하는 Prisma URL |
| `REDIS_URL`, `REDIS_PORT` | local Redis URL과 loopback port |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 각 PC에서 별도로 생성하는 32자 이상 local secret |
| `GOOGLE_CLIENT_ID` | 승인된 Google Web OAuth client ID. 없으면 Google 로그인은 동작하지 않음 |
| `FCM_DISPATCH_ENABLED` | local에서는 반드시 `false` |

기본 port `5432` 또는 `6379`가 이미 사용 중이면 `POSTGRES_PORT` 또는 `REDIS_PORT`와 해당 `DATABASE_URL` 또는 `REDIS_URL`을 같은 값으로 바꿉니다. Docker가 준비되지 않았거나 compose가 실패하면 migration과 서버 실행을 진행하지 않습니다.

이 문서 작성 시점의 새 clone에는 Prisma migration이 8개입니다. 실제 개수는 tracked migration 디렉터리와 `prisma migrate deploy` 결과를 기준으로 판단합니다. migration 디렉터리를 직접 수정하거나 순서를 바꾸지 않습니다.

서버가 기동되면 별도 PowerShell에서 확인할 수 있습니다.

```powershell
Invoke-WebRequest http://127.0.0.1:3000/health
```

이 endpoint는 서버와 환경 설정 여부를 확인합니다. 실제 database migration 상태는 `prisma migrate deploy`의 성공 결과를 기준으로 판단합니다.

### Backend 검증

서버를 중지하거나 별도 terminal에서 다음을 실행합니다. `npm run lint`는 자동 수정 옵션을 포함하므로 검증 명령으로 사용하지 않습니다.

```powershell
npm.cmd test -- --runInBand --no-cache
npm.cmd run build
npx.cmd eslint "{src,apps,libs,test}/**/*.ts"
npx.cmd prisma validate
```

Prisma Client 관련 오류가 나면 lockfile을 바꾸지 말고 `npm.cmd run prisma:generate`를 다시 실행합니다.

## 3. Android 앱 local 환경

저장소 root에서 Frontend 의존성과 local 환경 파일을 준비합니다.

```powershell
Set-Location .\DSM_Front
Copy-Item .env.example .env.local
npm.cmd ci --no-audit --no-fund
npm.cmd test -- --no-cache
npm.cmd run typecheck
npm.cmd run lint
Set-Location .\android
.\gradlew.bat assembleDebug --no-daemon
```

`.env.local`의 emulator 기본 `API_BASE_URL`은 `http://10.0.2.2:3000`입니다. Android emulator에서는 host PC의 Backend를 가리킵니다. 실제 기기는 PC의 사설 IP를 사용하고 같은 네트워크에 연결해야 합니다. API URL과 Google client ID는 APK에 포함될 수 있는 public configuration이므로 서버 secret을 넣지 않습니다.

Android Studio에서 `DSM_Front/android`를 열고 Gradle JDK를 17로 설정합니다. SDK path는 Android Studio가 생성하는 local `local.properties`에만 두며 Git에 추가하지 않습니다. SDK·JDK 문제로 Gradle이 실패하면 Platform 36, Build Tools 36.0.0, API 36 AVD와 JDK 17 선택을 먼저 확인합니다.

Backend와 emulator가 준비된 뒤 앱을 실행합니다.

```powershell
# terminal A, DSM_Front
npm.cmd run start

# terminal B, DSM_Front
npm.cmd run android
```

### 새 PC의 Google 로그인

Android debug keystore는 PC마다 달라 Google 로그인은 별도 등록이 필요합니다. 앱 build 자체에는 필요 없지만 sign-in smoke에는 필요합니다.

```powershell
# DSM_Front에서 실행
Set-Location .\android
.\gradlew.bat signingReport
```

프로젝트 관리자 승인 후, 이 PC의 debug SHA-1을 같은 Google Cloud project의 package `com.dsm.dailyup` Android OAuth client에 등록합니다. fingerprint·client ID·token·keystore 값은 Git, 문서, 채팅, build log에 기록하지 않습니다. `.env.local`의 `GOOGLE_WEB_CLIENT_ID`와 Backend의 `GOOGLE_CLIENT_ID`는 같은 승인된 Web OAuth audience를 사용해야 합니다.

## 4. 일상 동기화와 Git hygiene

작업 시작 전과 pull 전에는 local 환경 파일을 제외한 변경을 확인합니다.

```powershell
Set-Location ..\..
git status --short --branch
git fetch origin
git pull --ff-only origin codex/integration-main-review
git status --short --branch
```

의도하지 않은 변경이 있으면 pull·reset·clean을 실행하지 말고 먼저 보존하거나 소유자를 확인합니다. `.env`, `.env.local`, keystore, `android/local.properties`, Docker volume은 stage하지 않습니다. 변경한 소스에는 관련 테스트와 형식 검사를 실행하고, `git add -A` 대신 필요한 경로만 명시해 stage합니다.

Docker 서비스를 멈출 때 local 데이터를 유지하려면 다음만 실행합니다.

```powershell
Set-Location .\DSM_Back
docker compose stop
```

`docker compose down -v`는 해당 PC의 PostgreSQL volume을 삭제하므로 의도적으로 local 개발 데이터를 초기화할 때만 사용합니다.

## 문제 해결 빠른 표

| 증상 | 먼저 할 일 |
|---|---|
| PowerShell이 `npm.ps1`을 차단함 | `npm.cmd` 또는 `npx.cmd`를 사용 |
| `POSTGRES_* is required` | 최신 `.env.example`을 다시 복사하거나 local `.env`의 네 PostgreSQL 변수를 확인 |
| Prisma Client를 찾지 못함 | Backend에서 `npm.cmd run prisma:generate` 실행 |
| migration 연결 실패 | Docker Desktop과 `docker compose ps`, `DATABASE_URL`의 host·port·database 확인 |
| emulator가 Backend에 연결하지 못함 | Backend가 3000에서 실행 중인지, emulator URL이 `10.0.2.2`인지, Windows firewall을 확인 |
| Google sign-in이 취소·실패함 | 이 PC debug signer 등록 여부와 Web OAuth audience 일치 여부를 관리자와 확인 |
| Gradle/SDK 오류 | JDK 17, SDK Platform 36, Build Tools 36.0.0, Android Studio SDK 경로 확인 |

## 완료 확인

- [ ] 올바른 integration branch에서 clone했고 `git status`가 깨끗하다.
- [ ] Backend `.env`와 Frontend `.env.local`은 local 전용이며 Git ignore 상태다.
- [ ] Docker PostgreSQL·Redis가 healthy이고 문서 작성 시점의 8개 Prisma migration이 적용됐다.
- [ ] Backend test·build·non-fixing lint·Prisma validation이 통과했다.
- [ ] Frontend test·typecheck·lint와 Android debug build가 통과했다.
- [ ] Emulator에서 Backend 연결을 확인했고, Google login은 승인된 새 PC debug OAuth 등록 후에만 검증했다.
- [ ] release signing, production secret, external console, production database는 변경하지 않았다.

이 문서는 local 개발·검증 절차입니다. release 조건과 독립 감사 재검토 상태는 [release audit](../../.ai/audits/20260817-release-audit-full-project/README.md)를 따릅니다.
