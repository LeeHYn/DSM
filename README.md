# DSM

Android 전용 DSM v1.3 프로젝트입니다. Backend는 NestJS·Prisma·PostgreSQL·Redis로, 앱은 React Native Community CLI Android로 구성됩니다.

## 다른 Windows PC에서 시작하기

현재 개발 기준 branch는 `main`입니다. `codex/integration-main-review`의 작업 통합본을 병합했으며, 새 PC에서 clone, local 환경 구성, Docker 서비스 기동, Prisma migration, Android 실행과 Windows 문제 해결은 [Windows clone·개발 가이드](docs/setup/windows-clone-and-development.md)를 따르세요.

이 branch의 감사는 아직 release-ready가 아닙니다. local 개발과 검증은 가능하지만 production secret, release signing, Play Console 작업은 별도 승인과 절차가 필요합니다.

## 저장소 구성

- `DSM_Back`: NestJS API, Prisma schema·migration, PostgreSQL/Redis compose 설정
- `DSM_Front`: React Native Android 앱
- `docs/setup`: 현재 개발 환경 설정 안내
- `.ai`: 작업 계획·감사·에이전트용 기록
- `learning-site`, `tools/learning-site`: 2026-08-08~09의 오프라인 교육용 snapshot. 현재 제품 계약과 다르며 [학습 자료 안내](learning-site/README.md)에서 기준과 검증 방법을 확인할 수 있습니다.

2026-08-08의 외부 PC handoff 문서는 당시 검토 기록입니다. 현재 clone 절차에는 위 가이드를 사용하세요.
