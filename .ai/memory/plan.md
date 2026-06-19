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
9. 리프레시 토큰 조회 구조 개선 — 토큰에 레코드 ID 임베드(`<recordId>.<secret>`)로 O(1) 조회
10. 점수(DailyScore) 집계 로직 구현 — FR-03 점수 공식 + 누적 totalScore/티어, 일과 변경 시 재계산 + 조회 API
11. 랭킹/백분위(FR-04) 구현 — 일간/주간/누적 내 순위·상위%, TOP100 리더보드, RankingSnapshot 영속화
12. `DSM_Back` 프로필/알림 설정 + FCM 토큰/NotificationSchedule + WebSocket 실시간 점수/랭킹/알림 이벤트 구현
    - 설계: `docs/superpowers/specs/2026-06-20-dsm-back-milestone-12-design.md`
    - 구현 계획: `docs/superpowers/plans/2026-06-20-dsm-back-milestone-12.md`
    - 리뷰보고서: `docs/reviews/2026-06-20-dsm-back-review.md`

# 다음 마일스톤
13. `DSM_Back` 후속 안정화
    - Redis 기반 랭킹 캐싱 및 Socket.IO adapter
    - NotificationSchedule 배치/중복 방지 고도화
    - 회원 탈퇴, 프로필 이미지 스토리지
    - `npm audit` 잔여 의존성 대응
