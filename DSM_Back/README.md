> **DSM Backend local 개발**: 새 PC clone, `.env`, Docker PostgreSQL·Redis, Prisma migration과 검증은 [Windows clone·개발 가이드](../docs/setup/windows-clone-and-development.md)를 따르세요. 아래 Nest 안내는 upstream template 보존용이며 DSM의 현재 실행·배포 절차를 대체하지 않습니다.

## DSM production 실행 계약

Node.js 지원 범위는 `^22.13.0 || >=24.0.0`이며 package.json·lockfile에 동일하게 선언합니다. 현재 검증 환경과 고정 Docker image는 Node 22 계열을 사용합니다. Node 22.0~22.12 및 23은 잠금 의존성의 engine 범위와 맞지 않아 지원하지 않습니다.

### 선택 소셜 로그인과 프로필

Apple 로그인은 `APPLE_CLIENT_ID`에 Android와 동일한 Apple Services ID를 설정하면 활성화됩니다. 고정 Apple JWKS의 RSA 서명·issuer·audience·만료·subject를 검증하며 미설정 시 해당 요청만 400으로 거부합니다. 개인키나 client secret을 앱에 넣지 않습니다. Android native state 검증과 서버 ID token 검증은 연결됐지만 실제 Apple 계정·등록 redirect와 nonce claim의 종단 검증은 별도로 필요합니다. Kakao 로그인은 기존 Kakao access token 검증 경로를 사용합니다.

인증된 `GET/PATCH /profile`은 닉네임과 선택 사진을 다룹니다. 수정 닉네임은 공백 정리 후1~20자, 사진은 JPEG/PNG base64 원본48KiB·2MP 이하로 제한하며 서버가 메타데이터 제거·128px JPEG 변환 후 최대16KiB만 기존 프로필 필드에 저장합니다. 클라이언트는 base64를 보내고 HTTPS 임의 URL을 업로드 입력으로 받지 않습니다. 새 모듈·native picker의 로컬 검증과 실제 기기 사진 선택은 구분합니다.

`npm run start:prod`는 먼저 `prisma migrate deploy`를 실행하고 성공한 경우에만 `node dist/main`으로 서버를 시작합니다. DB 연결 실패·실패한 migration·Prisma CLI 누락 시 nonzero로 종료하고 새 서버는 시작하지 않습니다. `--ignore-scripts`로 생략되는 prestart hook에 의존하지 않습니다. 기존 `start`/`start:dev`는 개발용이며 이 gate를 제공하지 않습니다.

배포 artifact는 같은 revision의 `dist/`, `prisma/schema.prisma`, 전체 `prisma/migrations/`, `package.json`·lockfile과 설치된 dependency를 포함해야 합니다. Prisma CLI는 devDependency이므로 이 실행 경로에서는 `npm ci --include=dev`로 설치합니다. `npm ci --omit=dev` 또는 배포 플랫폼의 devDependency pruning은 CLI를 제거해 시작을 차단합니다. 설치·생성·빌드는 DB를 변경하지 않는 build 단계에서 수행합니다.

```sh
# DSM_Back 디렉터리, 검토한 revision의 release artifact 준비
npm ci --include=dev
npm run prisma:generate
npm run build
npm run test:production-start

# 배포 환경이 DATABASE_URL 및 필요한 app secret을 주입한 뒤 실행
npm run start:prod
```

플랫폼의 release job을 사용할 때는 동일 artifact에서 `npm run prisma:migrate:deploy`를 실행하고 exit 0일 때만 새 인스턴스를 rollout하도록 연결합니다. 인스턴스의 `start:prod`도 gate를 재확인하며 적용 완료된 migration은 다시 실행하지 않습니다. 현재 운영 환경·CI 연결은 없으므로 위 계약을 실제 production 통과 증거로 간주하지 않습니다.

동일 DB의 release/start를 직렬화하세요. Prisma advisory lock의 제한된 대기 때문에 동시 시작은 실패할 수 있으며 lock을 끄거나 migration 실패를 무시하지 않습니다. 재시작도 DB 접근·DDL 실행 권한을 가진 migration 단계에 의존합니다. 향후 별도 migration job과 최소 권한 runtime을 분리할 때는 해당 플랫폼의 migration-before-traffic 보장을 검증한 뒤 실행 계약을 변경해야 합니다.

이 gate는 미적용 SQL 적용을 보장하는 시작 순서일 뿐, schema drift·legacy 데이터 정리·CHECK VALIDATE·이전 서버와의 schema 호환성을 보장하지 않습니다. 기존 트래픽이 있으면 검토된 expand/contract·backup/복구·rollout 정책을 따르세요. 실패한 migration은 원인을 조사하고 검토된 복구 절차를 사용하며 `migrate reset`/`db push`/임의 `migrate resolve`로 우회하지 않습니다. 프로세스 관리자의 시작 제한 시간은 migration을 포함해야 합니다.

공식 근거: [Prisma 6 production workflow](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production), [migration 배포와 CLI dependency](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate).

## DSM health probe 계약

| 경로 | 용도 | 응답 |
|---|---|---|
| `GET /health` | 프로세스 liveness | 기존 200 `status: ok`, timestamp/uptime, DB URL 설정 유무. 실제 DB 연결을 확인하지 않음 |
| `GET /health/ready` | DB를 사용하는 요청의 readiness | Prisma `SELECT 1` 성공 시 200 `{"status":"ready"}`, 실패 또는 1초 초과 시 503 `Database is not ready` |

배포 플랫폼의 readiness/트래픽 분배 probe는 `/health/ready`, liveness/프로세스 재시작 probe는 `/health`에 연결합니다. Readiness 실패는 트래픽 제외 조건으로 사용하고 DB 장애만으로 프로세스를 반복 재시작하지 않도록 역할을 구분합니다. 외부 probe의 HTTP 제한 시간은 내부 1초에 네트워크 여유를 더해 정하고, 시작 유예는 migration·앱 초기화 시간을 포함해야 합니다. 실제 플랫폼의 주기·실패 임계값·복구 조건은 배포 시 검증해야 하며 현재 운영 환경은 없습니다.

Readiness 응답에는 `Cache-Control: no-store`를 적용하며 DB 오류·연결 정보는 공개하지 않습니다. 동시 probe는 하나의 조회를 공유합니다. 1초 제한은 응답 대기 제한으로, 진행 중인 Prisma query를 취소하지는 않습니다. Timeout 이후 그 query가 끝날 때까지 추가 DB 조회 없이 503을 유지하고 다음 probe에서 복구를 확인합니다. Event loop가 막히면 타이머 응답도 지연될 수 있습니다.

이 probe는 연결·간단한 조회 성공만 확인하며 schema/migration 완료·쓰기 권한·전체 API·OAuth/Firebase·Redis 상태를 보장하지 않습니다. Redis는 DB fallback이 가능한 선택적 cache이므로 필수 readiness 조건에 포함하지 않습니다. Migration gate와 실제 요청 검증은 별도로 유지합니다.

공식 근거: [NestJS health checks](https://docs.nestjs.com/v11/recipes/terminus), [Kubernetes liveness/readiness 역할](https://kubernetes.io/docs/concepts/workloads/pods/probes/). 특정 플랫폼 설정을 저장소에 추가하거나 실제 운영 probe 연결을 검증한 것은 아닙니다.

---

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Application container

Build the repository revision and its lockfile with `docker build -t dailyup-backend:<revision> .`.
The image pins Node 22 by digest, generates Prisma in Linux, and runs as the `node` user.
It includes the locked Prisma CLI dependencies because startup runs `prisma migrate deploy`
before executing the server. A failed migration prevents the HTTP server from starting.
Development dependencies remain in this image to keep that CLI reproducible.

Supply `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and
`GOOGLE_CLIENT_ID` at runtime through the deployment platform's secret configuration.
Both JWT secrets require at least 32 characters. Set `FCM_DISPATCH_ENABLED=false`
until Firebase service identity and delivery verification are available. Do not bake
environment files or signing keys into the image; `.dockerignore` excludes them.

Publish container port 3000 behind the platform's HTTPS endpoint. Use `/health` for
process liveness and `/health/ready` for DB readiness. Run migrations as a serialized
rollout step and wait for readiness before sending traffic to a new revision.
Back up the database before schema changes. The pinned PostgreSQL image in
`compose.yaml` is the local validation baseline; production backup, TLS, credentials,
replication, Redis availability, and rollout policy must be configured on the actual host.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
