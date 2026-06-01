# 목표
DSM_Back 백엔드의 기반 계층을 구축합니다. 환경변수 검증, PostgreSQL/Prisma 스키마, PrismaService, 전역 ValidationPipe, 공통 HTTP 예외 응답, Health Check API를 먼저 완성하여 이후 인증/일과/점수/랭킹 기능을 얹을 수 있는 구조를 마련합니다.

# 완료된 마일스톤
1. 백엔드/프론트엔드 세팅 계획 수립 및 승인 대기
2. `DSM_Back` (NestJS) 초기 세팅
3. `DSM_Front` (React Native/Expo) 초기 세팅
4. 생성된 프로젝트 구조를 Git에 커밋 및 원격 저장소에 푸시

# 진행 중 마일스톤
5. `DSM_Back` 백엔드 기반 구축 + DB/Prisma 세팅

# 마일스톤 5 작업 단위
1. 환경변수 검증 및 테스트 환경 구성
2. Prisma/PostgreSQL 스키마 작성 및 PrismaService 구성
3. 전역 ValidationPipe, 공통 HTTP 예외 응답, CORS 구성
4. `GET /health` 엔드포인트 추가
5. unit/e2e/build/lint/prisma 검증
