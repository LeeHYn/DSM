# 목표
DSM 앱의 백엔드/프론트엔드를 단계적으로 구축합니다.

# 완료된 마일스톤
1. 백엔드/프론트엔드 세팅 계획 수립 및 승인 대기
2. `DSM_Back` (NestJS) 초기 세팅
3. `DSM_Front` (React Native/Expo) 초기 세팅
4. 생성된 프로젝트 구조를 Git에 커밋 및 원격 저장소에 푸시
5. `DSM_Back` 백엔드 기반 구축 + DB/Prisma 세팅
6. `DSM_Back` 인증(Auth) 모듈 구현

7. 일과(Task) CRUD API 구현
8. 카테고리(Category) CRUD API 구현
9. 리프레시 토큰 조회 구조 개선 — 토큰에 레코드 ID 임베드(`<recordId>.<secret>`)로 O(1) 조회 (계획: docs/superpowers/plans/2026-06-06-dsm-refresh-token-lookup.md)
10. 점수(DailyScore) 집계 로직 구현 — FR-03 점수 공식 + 누적 totalScore/티어, 일과 변경 시 재계산 + 조회 API (계획: docs/superpowers/plans/2026-06-07-dsm-daily-score.md)

# 다음 마일스톤
11. 랭킹/백분위(RankingSnapshot, FR-04) 구현
