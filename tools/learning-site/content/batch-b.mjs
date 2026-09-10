function freezeGuide(guide) {
  return Object.freeze({
    ...guide,
    focus: Object.freeze(guide.focus),
    evidence: Object.freeze(
      guide.evidence.map((item) => Object.freeze(item)),
    ),
    risks: Object.freeze(guide.risks),
    related: Object.freeze(guide.related),
    exercises: Object.freeze(guide.exercises),
  });
}

export const AUTH_FLOW = Object.freeze({
  title: 'Social login → access/refresh 발급 → guard·rotation·logout',
  accessTtl: '15m',
  refreshTtl: '30일',
  meResponse: '{ userId }',
  refreshIsolation: null,
  providers: Object.freeze([
    Object.freeze({
      name: 'Google',
      check: 'verifyIdToken · configured audience',
      status: '구현됨 · live 미검증',
    }),
    Object.freeze({
      name: 'Kakao',
      check: 'GET /v2/user/me',
      status: '구현됨 · live 미검증',
    }),
    Object.freeze({
      name: 'Apple',
      check: 'ConflictException',
      status: '409 · 미구현',
    }),
  ]),
  login: Object.freeze([
    'ValidationPipe + DTO',
    'provider 확인',
    'socialAccount 조회',
    '기존 user 또는 신규 user/account',
    'access + refresh 발급',
  ]),
  guard: Object.freeze([
    'Bearer 추출',
    'JWT secret verify',
    "payload.type === 'access'",
    'request.user 부착',
    '실패는 401',
  ]),
  refresh: Object.freeze([
    '<recordId>.<secret> 파싱',
    'PK findUnique',
    'revoked/expiry/bcrypt 검사',
    'transaction conditional updateMany',
    '단일 승자 replacement 생성',
  ]),
  logout: Object.freeze([
    'access guard identity',
    'record ownership + secret 검사',
    '일치 시 revoke',
    'malformed/missing/mismatch는 no-op',
  ]),
});

export const AUTH_PAGES = Object.freeze({
  socialLogin: Object.freeze({
    title: '세 provider를 같은 성공 경로로 단정하지 않기',
    lede: 'DTO부터 socialAccount 조회·생성, token 발급까지 확인된 분기와 live 미검증 경계를 분리합니다.',
    sections: Object.freeze([
      'ValidationPipe와 SocialLoginDto',
      'Google configured audience',
      'Kakao /v2/user/me',
      'Apple 409',
      '기존 사용자와 신규 사용자',
    ]),
  }),
  refreshRotation: Object.freeze({
    title: '한 refresh token에는 한 명의 승자만 남기기',
    lede: 'id/secret 분리, hash 검증, conditional revoke, replacement 실패 전파와 logout no-op을 읽습니다.',
    sections: Object.freeze([
      'parse와 PK lookup',
      'revoked·expiry·bcrypt',
      'updateMany count === 1',
      'replacement failure propagation',
      'logout ownership',
    ]),
  }),
  jwtSession: Object.freeze({
    title: '짧은 access와 DB에 남는 refresh의 역할 나누기',
    lede: 'access payload·TTL, refresh hash·TTL, guard와 /auth/me의 실제 반환 범위를 비교합니다.',
    sections: Object.freeze([
      'access 15m',
      'refresh 30일',
      "payload type 'access'",
      'DB에는 secret hash',
      '/auth/me는 userId만',
    ]),
  }),
});

export const AUTH_EXERCISES = Object.freeze([
  Object.freeze({
    id: 'auth-provider-order',
    type: 'sequence',
    difficulty: '입문',
    question: 'login 요청 뒤 token 발급까지 순서를 배열하세요.',
    answer: 'DTO 검증 → provider 확인 → socialAccount 조회 → 기존/신규 user 분기 → token 발급이다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/auth.service.ts',
    ]),
  }),
  Object.freeze({
    id: 'auth-guard-boundary',
    type: 'boundary',
    difficulty: '입문',
    question: 'guard가 거부하는 세 경계를 찾으세요.',
    answer: 'Bearer token 누락, JWT 검증 실패, access가 아닌 payload type은 401 경계다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
    ]),
  }),
  Object.freeze({
    id: 'auth-refresh-race',
    type: 'concurrency',
    difficulty: '주니어',
    question: '같은 refresh token의 동시 요청에서 패자가 생기는 근거를 찾으세요.',
    answer: 'transaction 안 conditional updateMany의 count가 1인 요청만 replacement를 만들며 나머지는 401이다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/auth/auth.service.ts',
      'DSM_Back/src/auth/auth.service.spec.ts',
    ]),
  }),
  Object.freeze({
    id: 'auth-logout-noop',
    type: 'prediction',
    difficulty: '주니어',
    question: '다른 사용자 소유 token으로 logout하면 어떤 DB write가 일어납니까?',
    answer: 'ownership이 맞지 않아 revoke update 없이 no-op으로 끝난다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/auth/auth.service.ts',
      'DSM_Back/src/auth/auth.service.spec.ts',
    ]),
  }),
  Object.freeze({
    id: 'auth-test-boundary',
    type: 'evidence',
    difficulty: '주니어',
    question: 'service spec이 확인하지 않는 실제 환경을 구분하세요.',
    answer: 'Google/Kakao live network, 실제 PostgreSQL rollback/isolation, 배포 secret과 전체 HTTP pipeline은 mock unit test 범위 밖이다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/auth/auth.controller.spec.ts',
      'DSM_Back/src/auth/auth.service.spec.ts',
    ]),
  }),
  Object.freeze({
    id: 'auth-bootstrap-risk',
    type: 'risk',
    difficulty: '주니어',
    question: 'bootstrap과 guard에서 배포 전 확인할 설정 두 가지를 찾으세요.',
    answer: 'origin:true와 credentials:true CORS, JWT_ACCESS_SECRET을 get으로 읽는 설정을 확인해야 한다.',
    sourcePaths: Object.freeze([
      'DSM_Back/src/app.bootstrap.ts',
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
    ]),
  }),
]);

export const BATCH_B_FILE_GUIDES = Object.freeze({
  'DSM_Back/src/main.ts': freezeGuide({
    classification: 'support',
    role: 'Nest application을 만들고 공통 설정을 적용한 뒤 지정 port에서 듣기 시작하는 entrypoint다.',
    focus: [
      'bootstrap 함수',
      'NestFactory.create(AppModule)',
      'configureApp 호출 순서',
      'PORT 환경값과 3000 fallback',
    ],
    childExplanation: '학교 문을 열고 교무실 규칙표를 붙인 뒤 방문자를 받기 시작하는 개문 담당자와 같다.',
    juniorExplanation: 'main.ts는 AppModule로 Nest application을 만든 뒤 configureApp을 호출하고 listen한다. validation과 CORS의 상세 규칙은 app.bootstrap.ts가 소유한다.',
    evidence: [
      { path: 'DSM_Back/src/main.ts', symbol: 'bootstrap', claim: 'application entrypoint' },
      { path: 'DSM_Back/src/app.bootstrap.ts', symbol: 'configureApp', claim: 'shared bootstrap configuration' },
    ],
    risks: ['entrypoint 호출을 validation 규칙 구현 자체로 오해하지 않는다.'],
    related: [
      'DSM_Back/src/app.bootstrap.ts',
      'DSM_Back/src/app.module.ts',
    ],
    exercises: ['auth-bootstrap-risk'],
  }),
  'DSM_Back/src/app.bootstrap.ts': freezeGuide({
    classification: 'core',
    role: '전역 validation, HTTP exception filter와 CORS를 하나의 재사용 가능한 bootstrap 경계로 고정한다.',
    focus: [
      'validation error flattening',
      'whitelist와 forbidNonWhitelisted',
      'transform와 implicit conversion',
      'HttpExceptionFilter',
      'origin true와 credentials true',
    ],
    childExplanation: '모든 접수 창구가 같은 신청서 검사표와 같은 오류 안내표를 쓰게 만드는 공통 규칙판이다.',
    juniorExplanation: 'configureApp은 ValidationPipe의 허용 필드·변환·오류 envelope, global filter와 CORS를 설정한다. origin:true와 credentials:true는 현재 사실이며 배포 전 허용 origin 정책을 확인해야 한다.',
    evidence: [
      { path: 'DSM_Back/src/app.bootstrap.ts', symbol: 'configureApp', claim: 'global application policy' },
    ],
    risks: ['permissive CORS를 안전한 production allowlist로 설명하지 않는다.'],
    related: [
      'DSM_Back/src/main.ts',
      'DSM_Back/src/auth/dto/social-login.dto.ts',
      'DSM_Back/src/auth/dto/refresh-token.dto.ts',
    ],
    exercises: ['auth-bootstrap-risk'],
  }),
  'DSM_Back/src/auth/auth.module.ts': freezeGuide({
    classification: 'support',
    role: 'Auth controller, service, JWT module과 guard를 Nest DI graph에 등록하고 필요한 JWT 경계를 export한다.',
    focus: [
      'JwtModule.register',
      'AuthService provider',
      'JwtAuthGuard provider',
      'AuthController registration',
      'JwtModule과 guard exports',
    ],
    childExplanation: '로그인 창구와 확인 담당자, 출입증 검사원을 같은 부서 명단에 올리는 조직표다.',
    juniorExplanation: 'AuthModule은 dependency injection 구성을 선언한다. provider와 controller가 함께 등록됐다는 사실은 각 method의 실제 호출 순서나 성공을 증명하지 않는다.',
    evidence: [
      { path: 'DSM_Back/src/auth/auth.module.ts', symbol: 'AuthModule', claim: 'Auth DI composition' },
    ],
    risks: ['module 등록 관계를 runtime 호출 관계로 확대하지 않는다.'],
    related: [
      'DSM_Back/src/app.module.ts',
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
    ],
    exercises: ['auth-guard-boundary'],
  }),
  'DSM_Back/src/auth/auth.controller.ts': freezeGuide({
    classification: 'core',
    role: 'login, refresh, guarded logout과 me HTTP 요청을 DTO·JWT identity와 함께 AuthService 경계로 전달한다.',
    focus: [
      'POST /auth/login',
      'POST /auth/refresh',
      'guarded POST /auth/logout',
      'guarded GET /auth/me',
      '{ userId } response',
    ],
    childExplanation: '로그인과 갱신 신청서를 받아 담당자에게 넘기고, 출입증이 확인된 사람에게만 내 번호를 알려주는 창구다.',
    juniorExplanation: 'controller는 SocialLoginDto와 RefreshTokenDto를 service 인자로 전달한다. logout과 me에 JwtAuthGuard를 붙이며, current checkout의 me 응답은 userId 하나뿐이다.',
    evidence: [
      { path: 'DSM_Back/src/auth/auth.controller.ts', symbol: 'login', claim: 'social login route' },
      { path: 'DSM_Back/src/auth/auth.controller.ts', symbol: 'refresh', claim: 'refresh route' },
      { path: 'DSM_Back/src/auth/auth.controller.ts', symbol: 'me', claim: 'current identity response' },
    ],
    risks: ['/auth/me가 profile 전체를 반환한다고 과장하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.service.ts',
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
      'DSM_Back/src/auth/auth.controller.spec.ts',
    ],
    exercises: ['auth-provider-order'],
  }),
  'DSM_Back/src/auth/auth.service.ts': freezeGuide({
    classification: 'core',
    role: 'provider identity 확인, social user 연결, access/refresh 발급, refresh 단일 승자 rotation과 logout revoke를 조율한다.',
    focus: [
      'Google·Kakao·Apple provider branch',
      'socialAccount lookup과 user 생성',
      'access 15m과 refresh 30일',
      'refresh parse·bcrypt·updateMany',
      'replacement 생성과 logout ownership',
      'nickname conflict suffix',
    ],
    childExplanation: '외부 신분증을 확인해 학생 기록을 찾거나 만들고, 짧은 출입증과 한 번씩 바꾸는 갱신 영수증을 발급하는 담당자다.',
    juniorExplanation: 'Google은 configured audience, Kakao는 user info endpoint로 identity를 확인하고 Apple은 409다. refresh는 id/secret, PK lookup, bcrypt와 conditional updateMany로 한 요청만 replacement를 만들게 하며 logout은 소유권과 secret이 맞을 때만 revoke한다.',
    evidence: [
      { path: 'DSM_Back/src/auth/auth.service.ts', symbol: 'socialLogin', claim: 'provider and user orchestration' },
      { path: 'DSM_Back/src/auth/auth.service.ts', symbol: 'refreshTokens', claim: 'single-winner refresh rotation' },
      { path: 'DSM_Back/src/auth/auth.service.spec.ts', symbol: 'AuthService', claim: 'mock behavior evidence' },
    ],
    risks: [
      'refresh transaction에 명시적 Serializable option이 없다.',
      '최초 social login과 nickname uniqueness의 동시 경합 가능성은 확인 필요다.',
      'Google·Kakao live 동작과 실제 PostgreSQL rollback은 unit spec 범위 밖이다.',
    ],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
      'DSM_Back/src/auth/auth.service.spec.ts',
      'DSM_Back/prisma/schema.prisma',
    ],
    exercises: [
      'auth-provider-order',
      'auth-refresh-race',
      'auth-logout-noop',
    ],
  }),
  'DSM_Back/src/auth/guards/jwt-auth.guard.ts': freezeGuide({
    classification: 'core',
    role: 'Bearer access token을 추출·검증하고 access payload만 request.user로 전달하는 HTTP guard다.',
    focus: [
      'Authorization Bearer parsing',
      'JWT_ACCESS_SECRET lookup',
      'jwtService.verify',
      "payload.type === 'access'",
      'request.user attachment와 401 mapping',
    ],
    childExplanation: '문 앞에서 출입증을 꺼내고 진짜인지와 출입용 종류인지 확인한 뒤 이름표를 붙여 주는 검사원이다.',
    juniorExplanation: 'guard는 Bearer token이 없거나 verification/type 확인이 실패하면 401을 던진다. secret은 ConfigService.get으로 읽으므로 배포 설정의 fail-fast 여부는 별도 확인 대상이다.',
    evidence: [
      { path: 'DSM_Back/src/auth/guards/jwt-auth.guard.ts', symbol: 'canActivate', claim: 'access guard boundary' },
    ],
    risks: ['ConfigService.get 결과가 없을 때의 배포 동작을 unit 근거 없이 단정하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/types/jwt-payload.type.ts',
      'DSM_Back/src/app.bootstrap.ts',
    ],
    exercises: ['auth-guard-boundary', 'auth-bootstrap-risk'],
  }),
  'DSM_Back/src/auth/dto/social-login.dto.ts': freezeGuide({
    classification: 'support',
    role: 'social login body의 provider enum과 비어 있지 않은 token 문자열을 선언한다.',
    focus: [
      'SocialProvider enum',
      'provider validation',
      'token string validation',
      'non-empty constraint',
    ],
    childExplanation: '어느 신분증을 냈는지와 빈 종이가 아닌지를 확인하는 로그인 신청서다.',
    juniorExplanation: 'class-validator는 provider와 token의 HTTP 입력 형식을 확인한다. DTO 통과는 Google·Kakao 검증 성공이나 Apple 지원을 보장하지 않는다.',
    evidence: [
      { path: 'DSM_Back/src/auth/dto/social-login.dto.ts', symbol: 'SocialLoginDto', claim: 'login input contract' },
    ],
    risks: ['DTO 유효성을 provider identity 성공으로 확대하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/auth.service.ts',
    ],
    exercises: ['auth-provider-order'],
  }),
  'DSM_Back/src/auth/dto/refresh-token.dto.ts': freezeGuide({
    classification: 'support',
    role: 'refresh와 logout body에 비어 있지 않은 refresh token 문자열이 필요함을 선언한다.',
    focus: [
      'refreshToken property',
      'string validation',
      'non-empty constraint',
      'refresh와 logout 재사용',
    ],
    childExplanation: '갱신 영수증 칸이 비어 있지 않은지만 먼저 확인하는 공통 신청서다.',
    juniorExplanation: 'DTO는 문자열 존재까지만 검증한다. id/secret 형식, DB record, expiry, hash와 ownership 검증은 AuthService 책임이다.',
    evidence: [
      { path: 'DSM_Back/src/auth/dto/refresh-token.dto.ts', symbol: 'RefreshTokenDto', claim: 'refresh input contract' },
    ],
    risks: ['non-empty 문자열을 유효한 refresh credential로 간주하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/auth.service.ts',
    ],
    exercises: ['auth-refresh-race'],
  }),
  'DSM_Back/src/auth/dto/token-response.dto.ts': freezeGuide({
    classification: 'support',
    role: 'login과 refresh 성공 응답이 access와 refresh 두 문자열을 가진다는 shape를 선언한다.',
    focus: [
      'accessToken property',
      'refreshToken property',
      'shared response shape',
      'runtime validation 부재',
    ],
    childExplanation: '발급 봉투 안에 짧은 출입증과 갱신 영수증 두 칸이 있다는 목록표다.',
    juniorExplanation: '이 class는 TypeScript response shape를 제공한다. TTL, signing, hash 저장과 rotation 정책은 AuthService가 결정한다.',
    evidence: [
      { path: 'DSM_Back/src/auth/dto/token-response.dto.ts', symbol: 'TokenResponseDto', claim: 'token response shape' },
    ],
    risks: ['response DTO만 보고 token 보안 속성이나 만료를 단정하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/auth.service.ts',
    ],
    exercises: ['auth-test-boundary'],
  }),
  'DSM_Back/src/auth/types/jwt-payload.type.ts': freezeGuide({
    classification: 'support',
    role: 'access JWT payload의 사용자 subject와 literal access type을 TypeScript 수준에서 고정한다.',
    focus: [
      'sub user id',
      "type literal 'access'",
      'guard request.user shape',
      'compile-time type boundary',
    ],
    childExplanation: '출입증에 학생 번호와 출입용이라는 종류 칸이 있어야 한다는 양식이다.',
    juniorExplanation: 'JwtPayload type은 compile-time 계약이다. 실제 token signature와 payload type을 runtime에서 확인하는 책임은 JwtAuthGuard에 있다.',
    evidence: [
      { path: 'DSM_Back/src/auth/types/jwt-payload.type.ts', symbol: 'JwtPayload', claim: 'access payload contract' },
    ],
    risks: ['type alias가 runtime token verification을 대신한다고 설명하지 않는다.'],
    related: [
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
      'DSM_Back/src/auth/auth.controller.ts',
    ],
    exercises: ['auth-guard-boundary'],
  }),
  'DSM_Back/src/auth/types/social-profile.type.ts': freezeGuide({
    classification: 'support',
    role: 'provider별 응답을 공통 provider id, nullable email/image와 nickname으로 정규화한 내부 shape다.',
    focus: [
      'providerUserId',
      'nullable email',
      'nickname',
      'nullable profileImageUrl',
    ],
    childExplanation: '서로 다른 신분증에서 꼭 필요한 칸만 같은 학생 카드 양식으로 옮긴 결과다.',
    juniorExplanation: 'SocialProfile은 Google·Kakao 응답을 service 내부 공통 shape로 바꾼 뒤 user/account 처리에 사용한다. provider raw response 전체와 같은 타입이 아니다.',
    evidence: [
      { path: 'DSM_Back/src/auth/types/social-profile.type.ts', symbol: 'SocialProfile', claim: 'normalized provider profile' },
    ],
    risks: ['nullable field와 provider 원본 응답의 차이를 숨기지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.service.ts',
      'DSM_Back/src/auth/dto/social-login.dto.ts',
    ],
    exercises: ['auth-provider-order'],
  }),
  'DSM_Back/src/auth/auth.controller.spec.ts': freezeGuide({
    classification: 'core',
    role: 'AuthController의 login·refresh delegation과 supplied JWT payload 기반 me 응답을 확인하는 unit evidence다.',
    focus: [
      'login delegation',
      'refresh delegation',
      'me userId response',
      'AuthService test double',
      'guard 실행 범위 부재',
    ],
    childExplanation: '창구가 신청서를 담당자에게 그대로 넘기고 받은 학생 번호를 돌려주는지 확인한 검사 기록이다.',
    juniorExplanation: '세 test는 controller method를 직접 호출해 delegation과 me 반환을 확인한다. guard 자체, logout route, 전체 HTTP pipeline을 실행하는 test가 아니다.',
    evidence: [
      { path: 'DSM_Back/src/auth/auth.controller.spec.ts', symbol: 'AuthController', claim: 'controller unit evidence' },
      { path: 'DSM_Back/src/auth/auth.controller.ts', symbol: 'AuthController', claim: 'controller under test' },
    ],
    risks: ['controller spec을 JwtAuthGuard 또는 e2e 인증 증거로 확대하지 않는다.'],
    related: [
      'DSM_Back/src/auth/auth.controller.ts',
      'DSM_Back/src/auth/guards/jwt-auth.guard.ts',
      'DSM_Back/src/auth/auth.service.spec.ts',
    ],
    exercises: ['auth-test-boundary'],
  }),
  'DSM_Back/src/auth/auth.service.spec.ts': freezeGuide({
    classification: 'core',
    role: 'Google config와 refresh rotation의 정상·race·실패·invalid 분기, logout revoke/no-op을 검증하는 mock unit evidence다.',
    focus: [
      'Google client ID와 audience',
      'valid refresh 발급',
      'losing race와 replacement failure',
      'malformed·missing·revoked·expired·wrong secret',
      'logout revoke와 no-op',
      'mock transaction boundary',
    ],
    childExplanation: '같은 갱신 영수증을 두 번 내거나 틀린 비밀 조각을 내는 여러 상황을 담당자에게 시험한 검사 기록이다.',
    juniorExplanation: 'spec은 Prisma와 JWT double로 service branch와 failure propagation을 확인한다. Google·Kakao live network, 실제 PostgreSQL rollback/isolation, 전체 Nest request pipeline은 검증하지 않는다.',
    evidence: [
      { path: 'DSM_Back/src/auth/auth.service.spec.ts', symbol: 'AuthService', claim: 'service behavior tests' },
      { path: 'DSM_Back/src/auth/auth.service.ts', symbol: 'refreshTokens', claim: 'implementation under test' },
    ],
    risks: [
      'replacement creation test는 failure propagation을 확인하지만 실제 DB rollback을 실행하지 않는다.',
      'mock unit evidence를 live provider·integration evidence로 확대하지 않는다.',
    ],
    related: [
      'DSM_Back/src/auth/auth.service.ts',
      'DSM_Back/src/auth/auth.controller.spec.ts',
      'DSM_Back/prisma/schema.prisma',
    ],
    exercises: [
      'auth-refresh-race',
      'auth-logout-noop',
      'auth-test-boundary',
    ],
  }),
});
