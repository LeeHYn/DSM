# DSM 오프라인 학습 사이트 Batch B 디자인 명세

- 상태: 2026-08-09 사용자 `ㄱ`으로 written spec 승인 완료, 상세 구현 계획 승인 대기
- 작성일: 2026-08-09
- 원본 기준: `C:\DEV`, branch `codex/m12b-front-prototype-checkpoint`, commit `960f02b`
- 선행 결과: Pilot A 사용자 승인 완료
- Batch B 주제: Social Auth와 refresh rotation
- 설명 가중치: 균형형
- 실행 경계: current root inline, no-Git

## 1. 목적

Batch B는 Pilot A의 정적 오프라인 학습 사이트를 Social Auth와 session 갱신 흐름까지 확장한다. 학습자는 login 요청이 provider 확인, 사용자 조회·생성, access/refresh token 발급으로 이어지는 과정과 JWT guard, refresh token rotation, logout의 책임·실패 경계를 원본 코드와 테스트 근거로 학습한다.

이 명세는 2026-08-09 사용자가 순서대로 승인한 다음 결정을 하나의 구현 계약으로 고정한다.

1. Pilot A를 독립 재현하고 Batch B를 누적으로 계산하는 stage-aware batch registry
2. Social login, JWT guard, refresh rotation, logout의 실제 데이터 흐름과 사실 표시 경계
3. 변경 범위, TDD·정적 검증, Browser QA와 완료 기준

이 문서의 사용자 검토가 끝나기 전에는 상세 구현 계획을 작성하지 않는다. 상세 계획까지 별도로 승인받기 전에는 `tools/learning-site/`와 `learning-site/`를 수정하지 않는다.

## 2. 기준선과 제약

### 2.1 저장소 기준선

- application text corpus: 124개 파일·13,168줄
- backend: 88개 파일·8,787줄
- frontend: 36개 파일·4,381줄
- Pilot A 처리 상태: processed 15, remaining 109, missing 0
- Pilot A 출력: source page 15개, overview page 6개, HTML 21개, local asset 3개
- Pilot A 검증: 전체 48 tests, full verifier, 1440×900·390×844 Browser QA 통과

### 2.2 보호 경계

- `DSM_Back/**`와 `DSM_Front/**`를 수정하지 않는다.
- `DSM_Back/.env`의 내용은 읽거나 복사하지 않는다.
- 실제 credential, provider token, access token, refresh token, 사용자 식별자를 학습 콘텐츠·diagram·search data·검증 보고서에 넣지 않는다.
- dependency 설치, network fetch, DB·Docker·Firebase 실행과 제품 서비스 실행은 범위 밖이다.
- Git stage·commit·push·branch/worktree 조작은 별도 승인 전 수행하지 않는다.
- 기존 Pilot A의 Task 흐름과 Auth 흐름을 합쳐 코드에 없는 직접 호출 관계를 만들지 않는다.

## 3. Batch B 원본 범위

신규 source page 대상은 Pilot A와 중복되지 않는 다음 13개 파일·883줄이다.

1. `DSM_Back/src/main.ts` — 11줄
2. `DSM_Back/src/app.bootstrap.ts` — 58줄
3. `DSM_Back/src/auth/auth.module.ts` — 13줄
4. `DSM_Back/src/auth/auth.controller.ts` — 50줄
5. `DSM_Back/src/auth/auth.service.ts` — 254줄
6. `DSM_Back/src/auth/guards/jwt-auth.guard.ts` — 49줄
7. `DSM_Back/src/auth/dto/social-login.dto.ts` — 13줄
8. `DSM_Back/src/auth/dto/refresh-token.dto.ts` — 7줄
9. `DSM_Back/src/auth/dto/token-response.dto.ts` — 4줄
10. `DSM_Back/src/auth/types/jwt-payload.type.ts` — 4줄
11. `DSM_Back/src/auth/types/social-profile.type.ts` — 6줄
12. `DSM_Back/src/auth/auth.controller.spec.ts` — 67줄
13. `DSM_Back/src/auth/auth.service.spec.ts` — 347줄

Pilot A에서 이미 처리한 다음 파일은 새 source page 수에 다시 포함하지 않고 관계 근거로 연결한다.

- `DSM_Back/src/app.module.ts`
- `DSM_Back/prisma/schema.prisma`
- `DSM_Back/src/prisma/prisma.service.ts`

`auth.service.ts`와 `auth.service.spec.ts`는 분기·동시성·실패 경로가 가장 많으므로 다른 파일보다 깊게 설명한다. 나머지 파일도 생략하지 않고 균형형 흐름에서 각 책임을 연결한다.

## 4. 생성 구조 결정

### 4.1 검토한 대안

1. **stage-aware 누적 batch registry — 채택**
   - `pilot-a`와 `batch-b`의 신규 path를 각각 정의한다.
   - 선택한 stage까지의 path 합집합으로 processed 상태와 output을 계산한다.
   - Pilot A 기준선과 Batch B 누적 기준선을 각각 깨끗한 임시 output에서 재현할 수 있다.
2. **단일 processed 28-file 목록 — 제외**
   - 구현은 단순하지만 Pilot A 15/109 기준선을 독립적으로 재현할 수 없다.
3. **기존 output 위 수동 Batch B overlay — 제외**
   - 변경량은 작지만 manifest, search, progress, verifier가 서로 다른 source of truth를 가질 위험이 있다.

### 4.2 stage 계약

- `pilot-a`: processed 15, remaining 109, missing 0, 기존 HTML 21개
- `batch-b`: Pilot A∪Batch B, processed 28, remaining 96, missing 0, 예상 HTML 39개
- stage 이름이 알려지지 않았으면 쓰기 전에 `UNKNOWN_BATCH` 계열 오류로 실패한다.
- stage 안과 stage 사이에 source path 또는 output path 중복이 있으면 생성 전에 실패한다.
- Pilot A 재현 검증은 Batch B output directory를 축소·삭제하는 방식이 아니라 깨끗한 임시 directory에 `pilot-a`를 생성하는 방식으로 수행한다.
- corpus 124개 파일·13,168줄 기준선은 stage와 무관하게 동일해야 한다.

## 5. Tooling 구성요소

### 5.1 `tools/learning-site/manifest.mjs`

책임은 corpus 분류와 batch stage membership이다.

- Pilot A path와 Batch B path를 별도 immutable registry로 제공한다.
- stage 순서와 누적 path 계산 함수를 제공한다.
- 누락 source, 중복 source, 잘못된 stage를 fail-closed로 거부한다.
- 민감·생성·binary 제외 규칙과 corpus baseline은 유지한다.

학습 문구나 Auth 설명은 manifest에 넣지 않는다.

### 5.2 `tools/learning-site/content/batch-b.mjs`

책임은 Batch B 전용 학습 콘텐츠다.

- 13개 file guide
- Social login·JWT guard·refresh rotation·logout flow
- overview page용 section과 근거 link
- 연습 문제와 접힌 해설
- 위험·한계와 `확인 필요` 문구

원본 code text나 실제 token 값을 content module에 복제하지 않는다. code는 기존 source reader가 원본에서 읽는다.

### 5.3 `tools/learning-site/generate.mjs`

책임은 선택 stage의 model과 output registry를 조합해 결정적인 파일을 생성하는 것이다.

- `--batch pilot-a`와 `--batch batch-b`를 처리한다.
- 선택 stage의 누적 file guide와 overview output만 유효 output ID로 허용한다.
- Batch B model에서는 기존 Pilot A flow와 신규 Auth flow를 함께 제공하되 각 page의 주제 경계를 보존한다.
- 기존 per-file atomic write를 유지한다.
- 실제 `learning-site/` 갱신 전 깨끗한 임시 directory에서 전체 생성과 검증을 먼저 통과시킨다.

### 5.4 `tools/learning-site/lib/pages.mjs`

책임은 stage model을 기존 공통 shell과 page anatomy로 렌더링하는 것이다.

- 기존 A–G file page 구조를 모든 Batch B 파일에 그대로 적용한다.
- 신규 overview 5개를 명시적 output path로 등록한다.
- `index.html`에는 Batch B 학습 경로를 추가한다.
- `architecture.html`의 기존 Task 근거 지도는 바꾸지 않고 Auth summary와 독립 Auth diagram link만 추가한다.
- 새로운 UI class가 필요하면 기존 의미·접근성 계약을 유지하며 최소한으로 추가한다.

### 5.5 `tools/learning-site/verify.mjs`

책임은 선택 stage별 required output, progress, source fidelity와 금지 조건을 검증하는 것이다.

- Pilot A와 Batch B의 processed membership·progress를 각각 검사한다.
- 선택 stage의 source page와 overview page 수를 검사한다.
- Batch B의 금지 주장과 민감값 비노출을 정적 계약으로 검사한다.
- 기존 offline, local link/fragment, search membership, source fidelity 검증을 누적 source 전체에 적용한다.

## 6. 출력 정보 구조

Batch B는 신규 source page 13개와 다음 overview page 5개를 추가한다.

- `features/social-login.html`
- `features/refresh-rotation.html`
- `concepts/jwt-session.html`
- `diagrams/auth-session-flow.html`
- `exercises/auth-session.html`

기존 출력 중 다음 페이지는 Batch B 누적 모델에 맞춰 재생성한다.

- `index.html`: Pilot A와 Batch B 학습 경로, 누적 진행률
- `architecture.html`: 기존 Task 지도 보존 + Auth summary와 diagram link
- `assets/site-data.js`: 124개 corpus record의 Batch B 처리 상태와 검색 metadata
- `verification-report.json`: Batch B 실제 검증 수치
- `qa-report.md`: Batch B Browser QA 증거와 알려진 한계

예상 누적 HTML 수는 기존 21개 + 신규 source 13개 + 신규 overview 5개 = 39개다. 최종 page·link 수는 생성 후 verifier의 실제 출력으로 확정한다.

## 7. 학습 콘텐츠 설계

### 7.1 공통 설명 층위

모든 file·overview page는 다음 세 층위를 혼합하지 않는다.

1. **12세 설명**: access token은 짧게 쓰는 출입증, refresh token은 공개 record id와 비밀 조각이 결합된 갱신 영수증으로 설명한다. DB에는 비밀 조각의 평문이 아니라 hash가 저장된다는 한계를 같이 밝힌다.
2. **주니어 설명**: DTO validation, dependency injection/module, provider verification, DB read/write, JWT guard, transaction과 concurrency를 정확한 용어로 설명한다.
3. **원본 코드**: source text를 변경 없이 표시하고 AI 설명과 line reference를 별도 DOM 영역에 둔다.

비유가 실제 보안 보장을 과장하지 않도록 “출입증”과 “영수증”은 이해 보조 표현임을 표시한다.

### 7.2 페이지별 학습 목표

- `social-login.html`: provider 분기, external identity 확인, social account 조회, 기존/신규 사용자 분기, token 발급
- `refresh-rotation.html`: token parsing, hash 비교, single-winner revoke, replacement 생성, logout의 revoke/no-op
- `jwt-session.html`: access와 refresh의 역할, payload type, TTL, DB-backed refresh record, guard 경계
- `auth-session-flow.html`: login, protected request, refresh, logout을 두 개의 명확한 lane으로 표현
- `auth-session.html`: 흐름 배열, 실패 원인 구분, race winner 예측, test 보장 범위 판단

## 8. 확인된 Auth 흐름

### 8.1 bootstrap과 validation

```text
main.ts
  → configureApp()
      ├─ global ValidationPipe
      │    ├─ whitelist
      │    ├─ forbidNonWhitelisted
      │    ├─ transform
      │    └─ implicit conversion
      ├─ HttpExceptionFilter
      └─ CORS: origin=true, credentials=true
```

DTO 이전에 임의의 별도 validation layer가 있다고 설명하지 않는다. permissive CORS 설정은 현재 source의 사실이자 검토 위험으로 표시한다.

### 8.2 Social login

```text
POST /auth/login
  → ValidationPipe + SocialLoginDto
  → AuthController
  → AuthService provider branch
      ├─ Google: verifyIdToken(configured audience)
      ├─ Kakao: GET /v2/user/me
      └─ Apple: 현재 ConflictException
  → socialAccount 조회
      ├─ 기존 account: 연결된 user 사용
      └─ 신규 account: user + socialAccount 생성
  → access token + refresh token 발급
```

- Google configured client ID는 token audience 확인에 사용된다.
- Kakao live API 결과와 Google 실제 계정 동작은 offline site에서 검증한 사실로 표시하지 않는다.
- Apple branch는 현재 구성되지 않았으며 Nest `ConflictException`의 HTTP 상태는 409다.
- nickname conflict 시 random suffix를 붙이는 현재 동작을 설명하되 최초 동시 login의 uniqueness race가 완전히 해결됐다고 단정하지 않는다.

### 8.3 JWT guard와 `/auth/me`

```text
Authorization: Bearer <access-token>
  → JwtAuthGuard token 추출
  → JWT secret으로 verify
  → payload.type === "access" 확인
  → request.user 부착
  → guarded controller
```

- token 누락, malformed Bearer, verify 실패, 잘못된 payload type은 401 경계로 표시한다.
- current checkout의 `/auth/me` 응답은 `{ userId }`만 반환한다.
- JWT secret을 `getOrThrow`가 아니라 `get`으로 읽는 현재 설정은 배포 설정 확인 필요 위험이다.

### 8.4 Refresh rotation

```text
POST /auth/refresh
  → <recordId>.<secret> 파싱
  → refresh record PK findUnique(recordId)
  → revoked / expiry / bcrypt 검증
  → transaction
      ├─ conditional updateMany로 기존 record revoke
      ├─ count === 1인 요청만 승자
      ├─ replacement refresh record 생성
      └─ 새 access token 서명
```

- access token TTL은 15분, refresh token TTL은 30일인 현재 source 값을 설명한다.
- access JWT payload는 `{ sub, type: 'access' }`다.
- 동시에 같은 refresh token을 사용하면 conditional `updateMany`가 한 요청만 승자로 만든다.
- race 패자 또는 유효성 검증 실패는 401 경계다.
- replacement record 생성이 실패하면 transaction callback이 실패해 전체 rollback을 의도한 구조다. service spec이 직접 확인하는 범위는 replacement 실패 전파까지이며, 실제 PostgreSQL rollback은 이 mock test가 검증하지 않는다고 함께 표시한다.
- 현재 refresh transaction에는 명시적 Serializable option이 없으므로 `Serializable transaction`이라고 표시하지 않는다.

### 8.5 Logout

```text
POST /auth/logout
  → JwtAuthGuard로 access identity 확인
  → refresh token 파싱·lookup
  → record ownership + secret 확인
      ├─ 모두 일치: revoke
      └─ malformed / missing / mismatch: no-op
```

잘못된 refresh token이 성공적으로 revoke됐다고 표현하지 않는다. 현재 no-op 동작을 사실대로 보여주고, 보안 정책의 좋고 나쁨은 원본 동작과 분리해 위험·확인 영역에서 다룬다.

## 9. 테스트 근거의 범위

- `auth.controller.spec.ts`의 3개 test는 login delegation, refresh delegation, 전달받은 JWT payload에서 `/auth/me`가 `userId`를 반환하는 동작을 확인한다. 이 spec이 guard 자체를 실행해 검증한다고 설명하지 않는다.
- `auth.service.spec.ts`는 Google config, refresh 정상 경로, 동시 race, replacement 생성 실패, malformed/missing/revoked/expired/wrong-secret 처리와 logout revoke/no-op을 중심으로 설명한다.
- mock 기반 service spec은 실제 Google/Kakao network, 실제 PostgreSQL isolation, 배포 secret, 전체 Nest request pipeline을 검증하지 않는다.
- test에 없는 live provider 가용성과 운영 설정을 “테스트 통과로 확인됨”이라고 표시하지 않는다.

## 10. 증거·오류 표시 규칙

색만으로 상태를 구분하지 않고 text label과 선 종류를 함께 사용한다.

- **확인됨**: source의 실제 call, branch, DB read/write, controller route, guard와 spec assertion
- **조건부**: provider 종류, 기존/신규 사용자, refresh record 유효성, race 승자·패자, logout ownership 일치
- **확인 필요**: 실제 provider 계정 동작, live provider 가용성, 배포 환경 secret 설정, 운영 DB의 실제 부하 동작
- **한계**: mock test와 offline static 분석이 검증하지 못한 항목

다음 주장은 명시적으로 금지한다.

- refresh transaction이 Serializable이라는 주장
- Apple social login이 동작한다는 주장
- `/auth/me`가 `userId` 외 profile을 반환한다는 주장
- 모든 최초 social login uniqueness race가 방지된다는 주장
- mocked service spec이 provider·DB 통합을 검증한다는 주장
- raw credential 또는 실제 token 값의 표시

## 11. 위험·확인 항목

Batch B page의 `위험·확인` 영역에는 최소한 다음 항목을 포함한다.

1. `origin: true`와 `credentials: true`의 permissive CORS
2. JWT secret lookup에 `get`을 사용하고 명시적 fail-fast가 없는 점
3. 최초 social login에서 user/socialAccount/nickname uniqueness 경합 가능성
4. Apple provider 미구현
5. Google/Kakao live behavior 미검증
6. mock 기반 service spec의 integration 한계
7. refresh transaction에 명시적 Serializable option이 없다는 사실

가능성 또는 한계는 확정 취약점처럼 단정하지 않는다. 실제 운영 위험 판정은 별도 보안·통합 검증 범위다.

## 12. TDD와 자동 검증

### 12.1 TDD 순서

1. stage registry test
   - Pilot A 15/109 재현
   - Batch B 28/96 누적 재현
   - stage·path·output 중복과 unknown stage 거부
2. Batch B content test
   - 13개 file guide가 정확히 한 번씩 존재
   - 네 Auth 흐름과 overview 5개 coverage
   - 금지 주장과 raw secret 비노출
3. generator/page test
   - clean temporary directory의 exact output registry
   - Batch B index·architecture·overview의 필수 copy와 link
   - runtime data에 source code 본문이 복제되지 않음
4. verifier test
   - stage별 required source·overview page 수와 progress
   - 한 문자 source drift, broken link/fragment, remote dependency, 민감 경로 노출 거부
5. 전체 suite와 Pilot A 회귀
   - 기존 48 tests를 포함한 전체 test 통과
   - `pilot-a` clean generation과 full verification 별도 통과

실제 output은 새 test와 clean temporary generation·verification이 통과한 뒤에만 갱신한다. 상세 구현 계획은 각 수정 단계를 1~2개 파일로 제한하고 단계별 검증 명령과 exact writable allowlist를 기록한다.

### 12.2 Batch B 정적 완료 수치

- corpus: 124개 파일·13,168줄 유지
- processed: 28
- remaining: 96
- missing: 0
- excluded metadata: 기존 공개 제외 목록과 일치
- source fidelity: 누적 28개 source page의 text, SHA-256, UTF-8 byte 수, logical line 수, line ending 일치
- HTML: 예상 39개, 실제 verifier 출력으로 확정
- local link·fragment: 전부 유효, 실제 검사 수치를 report에 기록
- runtime network dependency: 0
- application source diff: `DSM_Back`·`DSM_Front` 모두 비어 있음

수치가 기준선과 다르면 자동 보정하거나 설명으로 덮지 않고 생성·검증을 실패시킨다.

## 13. Browser QA

정적 검증 통과 뒤 `C:\DEV\learning-site`만 제공하는 임시 localhost server에서 다음을 확인한다.

### 13.1 viewport

- desktop: 1440×900
- mobile: 390×844

### 13.2 시나리오

- home의 Pilot A·Batch B 경로와 누적 진행률
- `auth`, `refresh`, `JwtAuthGuard` path·filename·class/function 검색
- 대표 source page의 원본 code, 12세/주니어 설명, line anchor, 관련 파일
- social login과 refresh rotation overview 탐색
- Auth diagram zoom/reset, keyboard pan, pointer drag
- exercise의 접힌 답·해설
- theme, 읽음 상태, mobile code/explanation와 목차 sheet persistence
- 긴 한국어 제목·path·code line의 overflow와 44px touch target
- 실제 token·secret과 민감 경로가 UI나 search result에 나타나지 않음

QA 중 발견한 결함은 test로 재현한 뒤 수정한다. QA 종료 시 server process를 멈추고 사용한 port가 closed인지 확인한다. 결과와 알려진 한계는 `learning-site/qa-report.md`에 기록한다.

## 14. 변경 범위

상세 계획에서 정확한 파일별 allowlist를 다시 승인받지만, 설계상 변경 후보는 다음 범위로 제한한다.

### Tooling

- `tools/learning-site/manifest.mjs`
- `tools/learning-site/content/batch-b.mjs` 신규
- `tools/learning-site/generate.mjs`
- `tools/learning-site/lib/pages.mjs`
- `tools/learning-site/verify.mjs`
- 필요한 기존 test file과 Batch B 전용 test file
- 새 UI contract에 실제로 필요한 경우에만 기존 local CSS/JS source

### Generated output

- `learning-site/index.html`
- `learning-site/architecture.html`
- 신규 source page 13개
- 신규 overview page 5개
- `learning-site/assets/site-data.js`
- 필요 시 변경된 local CSS/JS
- `learning-site/verification-report.json`
- `learning-site/qa-report.md`

관련 없는 문서·제품 code·설정은 수정하지 않는다. 기존 dirty 변경은 사용자 소유로 보존한다.

## 15. 완료 기준과 다음 gate

Batch B는 다음 조건을 모두 만족할 때만 사용자 승인 후보가 된다.

1. 승인된 13개 source page와 overview 5개가 생성된다.
2. Pilot A 15/109와 Batch B 28/96 stage가 각각 clean output에서 재현된다.
3. 누적 28개 source fidelity가 모두 통과한다.
4. Social login, JWT guard, refresh rotation, logout이 source와 test 근거대로 설명된다.
5. 금지 주장과 raw secret/token 노출이 없다.
6. 기존 전체 test, 신규 Batch B test, Pilot A 회귀와 Batch B full verifier가 모두 통과한다.
7. desktop·mobile Browser QA와 server 종료·port closed 확인이 끝난다.
8. `DSM_Back/**`·`DSM_Front/**` diff가 비고 `.env`를 읽지 않았다.
9. 실제 page·test·link·progress 수치와 known limitation을 Batch B report로 사용자에게 제시한다.
10. 사용자가 Batch B 결과를 승인하기 전에는 다음 batch를 시작하지 않는다.

이 written spec을 사용자가 검토·승인하면 다음 단계는 `superpowers:writing-plans`를 사용한 TDD 기반 상세 구현 계획 작성이다. 그 계획도 사용자 승인 전에는 실행하지 않는다. Git write는 별도 승인이 없으므로 이 문서를 commit하지 않는다.
