# Batch B QA Report

## 결과

- 자동 생성·검증: **PASS**
- 인앱 브라우저 데스크톱·모바일 QA: **PASS**
- QA URL: `http://127.0.0.1:4173/` — `C:\DEV\learning-site`만 제공한 임시 서버이며 QA 후 종료
- 오프라인 진입점: `file:///C:/DEV/learning-site/index.html`

## 자동 검증

| 항목 | 결과 | 증거 |
|---|---:|---|
| Node 테스트 | PASS | 66 tests, 0 failures |
| 전체 산출물 검증 | PASS | 39 pages, 28 source pages |
| 링크·fragment | PASS | 903 links |
| source fidelity | PASS | text, SHA-256, bytes, lines, line ending 일치 |
| offline dependency | PASS | remote dependency 없음 |
| corpus progress | PASS | processed 28, remaining 96, missing 0, excluded 9 |

## 브라우저 환경

- Browser: Codex 인앱 Chromium, fallback 없음
- 데스크톱: 1440×900
- 모바일: 390×844

| 화면·기능 | 결과 | 확인 내용 |
|---|---:|---|
| 홈·Batch B 요약 | PASS | 28개 학습 가능, 96개 후속 배치 표시 |
| 검색 | PASS | `auth` 22개, `refresh` 5개, `JwtAuthGuard` 1개 |
| Auth 소스 학습 | PASS | A–G 학습 구조, 읽음·테마·위험 탭 전환 |
| Social login | PASS | Google, Kakao, Apple 409 경계 |
| Refresh rotation | PASS | 단일 승자·`updateMany`, 잘못된 Serializable 주장 없음 |
| JWT session | PASS | access 15m, refresh 30일, `{ userId }` |
| Auth 다이어그램 | PASS | 확대, 방향키 이동, 원래 크기 복귀 |
| Auth 연습 | PASS | 6개 답안 접힘, 열기 상태 전환 |
| 모바일 소스 패널 | PASS | 코드·설명 전환, 목차 열기·접기 |
| console·overlay | PASS | 경고·오류 및 framework overlay 없음 |

## QA 중 발견하고 수정한 결함

1. Auth 연습 근거 링크가 카드 밖으로 나가던 문제
   - 데스크톱 문서 폭: 1501px → 1425px, viewport 1440px
   - 모바일 문서 폭: 375px, viewport 390px
   - `.exercise-sources`를 줄바꿈 가능한 그리드로 변경
2. 소스 페이지 SHA-256이 모바일 문서 폭을 늘리던 문제
   - 모바일 문서 폭: 587px → 375px, viewport 390px
   - `.file-overview code`에 공백 없는 해시 줄바꿈 규칙 추가

## 남은 범위

- 실제 Google·Kakao 네트워크, PostgreSQL 동시성·rollback, 배포 secret은 오프라인 정적 사이트 QA 범위 밖이다.
- 이번 QA는 인앱 Chromium에서 수행했다.
