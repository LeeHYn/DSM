# DSM 공정표 — 2026-09-09

표기: [x] 완료, [/] 진행 중, [ ] 미완료·외부 gate.

## 세팅 재개·main 병합 — 2026-09-09

- [x] 사용자 세팅 재개·병합 승인, 기존 memory와 실제 Git 상태 대조.
- [ ] Docker PostgreSQL·Redis 기동, migration·API health 검증: 재부팅 완료, stale socket 삭제 사용자 조치 대기.
- [x] Backend/Front 전체 548 tests·정적 gate·Android debug 365 tasks. 로컬 DB 검증은 위 별도 항목으로 남김.
- [x] 독립 reviewer의 main 고유 변경·충돌·병합 gate 검토 및 기존 single-branch clone 문서 수정.
- [ ] 기존 세팅 변경과 새 검증 결과 memory 동기화·commit.
- [ ] main 통합·최종 검증·원격 push와 clean tree 확인.

## 현재 PC D드라이브 세팅 — 2026-09-09

- [x] `D:\DSM` clone, 원격 branch와 현재 Windows 개발 문서 확인.
- [x] 전용 Node.js 22.23.2/npm 10.9.8 다운로드·SHA-256 검증·설치.
- [x] Backend·Frontend lockfile 기반 의존성 설치: 884/988 packages.
- [x] 새 PC 전용 ignored 환경 파일과 `.local/env.ps1`, `dev.ps1`, `dev.cmd` 실행 도우미 준비.
- [x] Backend 26 suites/317 tests, build, non-fixing lint, E2E 2 tests, Prisma Client generate/validate.
- [x] Front 24 suites/229 tests, typecheck, lint 오류 0/기존 경고 30, Android Metro bundle 생성.
- [x] JDK 17·Android SDK 36/Build Tools 36.0.0/NDK 27.1.12297006/CMake 3.22.1 및 API 36 AVD 준비.
- [x] Android `assembleDebug`: 365 tasks, 4개 ABI, APK 생성·에뮬레이터 설치 성공.
- [x] Windows Metro native build watcher 오류를 `.local/metro.config.cjs`로 회피, 폴더 생성·삭제 후 health 유지 및 bundle HTTP 200 검증.
- [x] 에뮬레이터 재시작 후 cold launch, 데일리업 로그인 화면과 native runtime 오류 없음 확인.
- [x] Docker Desktop·WSL 2.7.13.0 설치 및 Compose 구성 검증.
- [ ] WSL 기능 활성화를 위한 Windows 재부팅 후 PostgreSQL·Redis healthy, migration·API health 확인.
- [x] 실제 검증 결과·미완료 조건·실행 방법을 `outputs/DSM-setup.md`와 memory에 기록. Windows 재부팅 전 checkpoint이며 DB 포함 전체 세팅 완료는 아님.

## 완료

- [x] Canonical audit F-001~F-083 구성과 strict UTF-8·schema·fingerprint·status-history 검증.
- [x] F-005, F-006, F-016, F-025, F-035, F-039, F-040, F-083 독립 종결.
- [x] Android-only 범위 확정과 F-066 REFUTED.
- [x] F-067/F-068 URL 미정 범위의 account deletion·legal gate 구현 및 Backend·Front·Android 회귀.
- [x] F-069 window projection·fenced Redis generation 구현, Backend·PostgreSQL·Redis 검증과 50,000-user benchmark 완료.
- [x] F-069 제품·감사 `c3205dfa2e5e04524513ef8e11beba737af074e0` commit·push.
- [x] F-065 빈 task affinity·reparenting 차단, manifest/build/lint/API 36 task smoke와 제품·감사 `24d65e4788652b611d9942e60c65b8efd0004755` 게시.
- [x] F-011/F-029/F-030 DB fallback rank·population·UTC 계약 통일, 전체·PostgreSQL·Redis 검증과 제품·감사 `0c6031b862e9c777d2403e2e3b46c7e1d37c3a8e` 게시.
- [x] F-001/F-002 refresh-authenticated logout·access `sid` family 검사와 Android server-first retry UX 구현.
- [x] F-001/F-002 Backend 304·Front 229·Android 456 tasks·PostgreSQL 17.10 통합 1/1·ledger 검증 후 제품·감사 `a323dcad531e971ad792e8e9a20a47de29ab8c41` 게시.
- [x] F-007/F-008/F-009 null·state·interval 무결성, staged CHECK와 제품·감사 `317253cff1fd938b847017697f049582720261f9` 게시.
- [x] Active memory를 현재 결정·증거·gate 중심으로 재압축.

## 현재

- [x] F-001/F-002 인증 폐기 범위·결합 영향 진단과 무 migration 설계 확정.
- [x] Backend refresh-authenticated family logout·access `sid` 활성 검사 구현과 회귀 검증.
- [x] Android server-first logout·실패 재시도 UX 구현과 회귀 검증.
- [x] F-001/F-002 self-review·전체 gate·canonical audit FIXED 전이.
- [x] F-007 PATCH date `null`이 validation 0건으로 통과하는 현재 실패 재현.
- [x] F-008 status/completedAt 동기화가 `e2bda53a`에 이미 구현됐고 focused 81/81이 통과함을 source·blame으로 확인.
- [x] F-009 server·migration 부재와 Android full-date update 호환성 진단.
- [x] F-007/F-009 최소 구현·`NOT VALID` CHECK·실제 PostgreSQL 검증 계획 승인.
- [x] F-007/F-009 regression·DTO/service 방어·PostgreSQL CHECK 구현.
- [x] Focused 91, Backend 314·e2e 2·build/type/lint/format과 PostgreSQL fresh 3/3·legacy upgrade 검증.
- [x] F-007/F-008/F-009 audit FIXED 전이와 제품·감사 commit·push.
- [x] F-012 공개 POST·service·schema·소비자·요구사항과 과거 deferred branch 진단.
- [x] Focused ranking baseline 2 suites/15 tests와 반복 호출당 신규 durable row 생성 확인.
- [x] 사용자 `ㄱ`으로 공개 API 보존형 일일 멱등화와 exact allowlist 승인.
- [x] F-012 unit RED 4건, service·schema/migration과 PostgreSQL spec 구현.
- [x] Focused 18, Backend 317·e2e 2·build/type/lint/format·Prisma 검증.
- [x] PostgreSQL fresh·legacy 3/3, legacy 2행 보존과 20개 동시 호출 1 ID 검증.
- [x] F-012 audit FIXED 전이와 제품·감사 `5642640cfbcd3b5d410f4bdbcbaeecedd106b213` commit·push.
- [x] 외부 PC Windows guide·root/Backend 진입점·역사 handoff 경고·compose-safe example, 정적 검증과 `af2ff2640b1fa27111302766baa61aada15b304d` commit·push.

## 열린 gate

- [ ] F-065 API 24~29 malicious-app PoC·OEM patch matrix와 독립 fix-recheck.
- [ ] F-001/F-002 구현자와 독립된 fix-recheck와 production guard latency·availability 관찰.
- [ ] F-007/F-008/F-009 독립 fix-recheck; F-008/F-009 legacy row scan·정정과 F-009 CHECK validation.
- [ ] F-012 legacy snapshot 분류·backfill·중복 정책과 staged CHECK validation.
- [ ] F-011/F-029/F-030 구현자와 독립된 fix-recheck.
- [ ] F-069 구현자와 독립된 fix-recheck.
- [ ] F-069 실제 운영 cardinality·capacity·managed Redis failover·latency 증거.
- [ ] F-067/F-068 공개 privacy/deletion URL·외부 처리·signed-device·Play Console/Data safety 증거.
- [ ] F-003/F-017 signer·production OAuth·signed artifact/device와 F-013 readiness mapping.
- [ ] 남은 CONFIRMED finding 수정·recheck와 zero-new-confirmed-P0~P2 연속 두 자유 탐색 round.

## 유지 규칙

- [x] 실제 .env, key·keystore·private Gradle property와 recovery 파일 미접근·미변경.
- [x] F-012에서 controller/API response·Front·Android·dependency·기존 migration을 보존.
- [x] 제품·감사는 integration branch에 게시했고 root checkout은 미변경.
- [x] stage 시 git add -A 없이 exact path만 사용.
