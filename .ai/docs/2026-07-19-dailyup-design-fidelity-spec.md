# 데일리업 Phase 1 디자인 고정 명세

- 기준일: 2026-07-19
- 구현 대상: `DSM_Front`
- 디자인 원본: `design/`
- 원칙: 원본 PNG와 `DSM Prototype 문서.dc.html`의 화면 구조, 문구, 색상, 밀도, 기능을 변경하지 않는다.
- 구현 방식: React Native/Expo 코드 네이티브 UI. PNG를 화면 배경이나 정적 UI로 사용하지 않는다.
- 반응형 경계: web에서는 원본과 같은 검정 쇼케이스 캔버스와 Android 기기 프레임을 표시하고, native에서는 앱 화면만 표시한다.

## 원본 무결성

| 파일 | 크기 | SHA-256 |
| --- | ---: | --- |
| `design/01-login.png` | 909×540 | `CD20FD0877C479EAEEF09292274D4550710EA9E8553D043CE2B90A3A14DCA270` |
| `design/02-tutorial.png` | 909×540 | `4601C2BD944EAEB8A84B13C9457DB8403DA24A0DC24411B38A6F8C74A5DAB4E5` |
| `design/03-home.png` | 909×540 | `1F88A9D9930CC37C533E2E47EA1BD0BB80D6B064522E79C8EDF929D3CEA6C780` |
| `design/04-ranking.png` | 909×540 | `AF2170E13529DCD79C80B11D08AEC96E1D4B0F41634381504D3B5F60AA508837` |
| `design/05-mypage.png` | 909×540 | `57403238E71C14A083D8FC582A916D021EF2B44F11F5DCC8DAC1DC6E841ACE6C` |
| `design/DSM Prototype 문서.dc.html` | 6,226 bytes | `9A6AD08C5DEDB9070533B68327A36D131EFBC83996C7F54BF36B73DF2028953A` |

구현과 QA 중 `design/` 파일은 수정하거나 변환하지 않는다.

## 고정 디자인 시스템

### 색상

PNG에서 관찰한 시각값을 토큰으로 고정한다. QA에서 원본과 직접 비교하여 필요한 경우 같은 토큰만 미세 조정한다.

| 역할 | Dark | Light | 사용 |
| --- | --- | --- | --- |
| showcase | `#07060B` | 동일 | web 외부 캔버스 |
| status bar | `#17171D` | `#F1F3F5` | 기기 상단 |
| app background | `#090D15` | `#F5F7F8` | 앱 전체 |
| surface | `#172127` | `#FFFFFF` | 카드, 입력, 탭 |
| raised surface | `#1D262C` | `#EEF1F3` | 선택/강조 surface |
| border | `#293139` | `#DCE1E5` | divider, 외곽선 |
| text | `#F4F5F7` | `#111820` | 본문 |
| muted text | `#8A9099` | `#69717A` | 보조 문구 |
| brand lime | `#9BEA47` | `#74C72C` | 브랜드, 선택, CTA |
| lime tint | `#1E3A0F` | `#E7F7D7` | 내 순위 카드 |
| gold | `#F6B73C` | `#C78615` | GOLD, 랭킹 |
| danger | `#FF4D5F` | `#D9364A` | 오류, 삭제 |
| success | `#27AE60` | 동일 | 완료/온라인 |

그라디언트나 장식용 glow는 원본에 없으므로 추가하지 않는다.

### 타이포그래피

- 폰트: `Noto Sans KR`
- weight: 400, 500, 600, 700, 800
- 화면 제목: 22–24px / 700–800
- 주요 수치: 26–30px / 800
- 카드 제목·버튼: 14–16px / 600–700
- 본문: 13–15px / 400–500
- 캡션·상태: 11–12px / 500–700
- 숫자는 같은 Noto Sans KR를 사용하며 별도 display font를 도입하지 않는다.

### 간격과 형태

- 앱 콘텐츠 기본 좌우 여백: 18–20px
- 카드 사이 간격: 10–14px
- 섹션 간격: 20–28px
- 카드 radius: 14–18px
- 버튼 radius: 12–14px
- 원형 아이콘 버튼과 FAB: 완전 원형
- divider: 1px
- 그림자보다 surface 대비와 border를 우선한다.
- web Android 프레임은 360×780 계열 portrait 비율을 유지하되 909×540 쇼케이스 안에 축소하여 원본처럼 배치한다.

### 아이콘

- 원본의 단순한 선형/채움 아이콘 성격을 유지한다.
- 탭: 홈, 트로피, 사용자.
- 공통: 새로고침, 체크, 더하기, chevron, 설정, 알림, 통계, 도움말, 로그아웃.
- 아이콘은 텍스트 문자가 아니라 Expo Symbols 또는 React Native 도형으로 구현한다.
- 선택 탭은 lime, 비선택 탭은 muted 색상으로 표시한다.

## 화면별 고정 명세

### 1. 로그인

- 세로 중앙 상단에 lime rounded-square `D` 로고.
- 허용 문구: `데일리업`, 서비스 소개 문구, `Google로 계속하기`, `Kakao로 계속하기`, `Apple로 계속하기`, `이용약관`, `개인정보처리방침`.
- Google/Kakao 버튼은 press → loading → 튜토리얼 이동.
- Apple 버튼은 `준비 중` 비활성 상태.
- 법적 링크는 준비 중 toast.
- 위계를 바꾸는 별도 헤더, 배지, 설명 카드 추가 금지.

### 2. 온보딩 튜토리얼

- 총 3페이지 horizontal paging.
- 페이지 문구:
  1. `일과 등록과 완료`
  2. `난이도와 일일 점수 상한`
  3. `랭킹과 6단계 티어`
- 가운데 dark rounded tile와 lime 도형을 핵심 그래픽으로 사용한다.
- `건너뛰기`, 페이지 indicator, 다음/`시작하기` 동작을 제공한다.
- 화면 전환은 220ms 내외 fade/translate, paging은 native scroll motion.

### 3. 홈

- 허용 상단 문구: `2026년 7월 19일 일요일`, `안녕하세요, 지민님`.
- 점수 카드:
  - `오늘의 점수`
  - `100 / 900`
  - `GOLD`
  - `오늘 12위`
  - `상위 8%`
  - `누적 12,450점`
- 일과 목록 상단 제목은 `오늘의 일과`.
- 첫 행: `아침 운동`, `07:00 - 08:00`, `건강`, `낮음`, 완료 상태.
- 둘째 행: `수학 과제`, `09:00 - 11:00`, `학업`, `높음`, 미완료 상태.
- 체크 press는 즉시 완료 상태 반영 후 실패 시 rollback과 toast.
- 행 press는 일과 상세 sheet.
- FAB `+` press는 새 일과 sheet.
- 개발 상태 바에서 정상/로딩/빈 상태/오류/오프라인 전환.
- 오프라인에서는 일과 변경 상호작용을 비활성화한다.

### 4. 새 일과 추가 sheet

- 하단 sheet 구조.
- 필드: 제목(필수), 설명, 시작 시간, 종료 시간, 난이도(낮음/보통/높음), 카테고리, 완료 알림.
- 종료 시간은 시작 시간보다 뒤여야 한다.
- 오류는 해당 필드 아래 인라인 표시한다.
- 저장 성공 시 sheet 닫기, 목록 반영, toast.

### 5. 일과 상세 sheet

- 제목, 시간, 카테고리, 난이도, 설명.
- 완료/완료 취소 버튼.
- 삭제는 확인 단계 후 실행.
- 닫기는 dimmed backdrop, 닫기 버튼, 시스템 back을 지원한다.

### 6. 랭킹

- 상단 제목 `랭킹`.
- segment: `일간`, `주간`, `누적`.
- 내 순위 카드: `내 순위`, `12위`, `상위 32%`, 현재 기간 점수.
- 리더보드 행: 순위, letter avatar, 닉네임, 티어, 점수.
- 원본 첫 행 데이터는 `민준`, `MASTER`, `890`; 이후 `서연`, `DIAMOND`, `845`; `도윤`, `DIAMOND`, `810`.
- segment press 시 선택 색상과 목록 데이터가 함께 변경된다.
- 실제 실시간 연결 대신 문서가 요구한 `준비 중입니다` 안내를 사용한다.

### 7. 마이페이지

- 상단 제목 `마이`.
- 프로필: `지` avatar, `지민`, `GOLD`, `누적 12,450점`.
- 메뉴:
  - `화면 테마`와 dark/light toggle
  - `프로필 · 계정 관리`
  - `알림 설정`
  - `나의 통계`
  - `도움말 · 규칙 · 법적 정보`
  - `로그아웃`
- 테마 toggle은 앱 전체 색상에 실제 반영한다.
- 준비되지 않은 메뉴는 toast.
- 로그아웃은 prototype state 초기화 후 로그인으로 이동한다.

### 8. 하단 탭·공통

- 탭: `홈`, `랭킹`, `마이`.
- 탭 바는 dark surface, 상단 divider, safe-area 포함.
- 선택 아이콘/레이블 lime, 비선택 muted.
- toast는 모든 앱 화면에서 탭 바 위에 표시한다.
- 로그인과 튜토리얼에는 탭 바를 표시하지 않는다.

## 상태·애니메이션

| 상태/행동 | 고정 표현 |
| --- | --- |
| 초기 화면 | 콘텐츠 160–220ms fade/translate-in |
| loading | 카드/리스트 skeleton + 낮은 강도의 pulse |
| empty | 점선 border, 안내 문구, `새 일과 추가` CTA |
| error | danger banner, `다시 시도` |
| offline | 상단 배너, 변경 기능 비활성 |
| sheet | dim fade + 아래에서 220ms slide-up |
| task completion | optimistic check/strike 전환, 실패 시 rollback toast |
| toast | 탭 위 fade/translate, 자동 닫힘 |
| reduced motion | 반복 pulse를 정지하고 즉시 상태 전환 |

## 허용된 Phase 1 범위와 의도적 제한

- Google/Kakao OAuth, backend JWT, Task/Score/Ranking API, FCM, WebSocket, DB 연결은 하지 않는다.
- 위 기능은 local typed seed state와 짧은 simulated loading으로 사용자 흐름만 동작시킨다.
- Apple 로그인은 원본 문서대로 비활성이다.
- 실제 배포, store build, Git stage/commit/push는 범위 밖이다.

## QA fidelity ledger

완료 검증에서 각 행의 원본 증거, 렌더 증거, 수정 결과를 기록한다.

| 비교 지점 | 원본 증거 | 렌더 증거 | 결과 |
| --- | --- | --- | --- |
| showcase와 Android frame | 909×540에서 caption y≈44, frame x≈249·y≈77 | 동일 viewport에서 caption y≈44, frame x≈249·y≈77, 360×720 내부 canvas | 일치 |
| 로그인 copy와 logo 위계 | logo y≈323, 제목 y≈405, 설명 y≈442 | logo y≈323, 제목 y≈405, 설명 y≈442 | 일치 |
| 튜토리얼 artwork 위치 | tile y≈381, 제목 y≈499, desktop frame 안에서 하단 crop | tile y≈380, 제목 y≈502, 동일 frame·crop | 허용 오차 내 일치 |
| 홈 score card와 list density | score card y≈207, 일과 제목 y≈373, 2개 행 노출 | score card y≈207, 일과 제목 y≈373, 동일 행 높이·간격 | 일치 |
| 랭킹 segment와 lime/gold 사용 | 제목 y≈150, segment y≈187, 내 순위 y≈244, 첫 행 y≈358 | 제목 y≈150, segment y≈186, 내 순위 y≈241, 첫 행 y≈357 | 허용 오차 내 일치 |
| 마이 프로필·메뉴 divider | avatar y≈148, profile divider y≈339, 테마 행 y≈340 | avatar y≈147, profile divider y≈339, 테마 행 y≈340 | 일치 |
| Noto Sans KR scale/weight | 한글 제목 bold, 보조 copy regular, 수치 extra-bold | Noto Sans KR 400·500·600·700·800을 역할별 적용 | 일치 |
| 하단 탭 선택 상태 | HTML 명세의 dark surface·lime selected·muted unselected | 390×844에서 홈 lime, 랭킹·마이 muted, safe area 포함 | 일치 |
| 909×540와 mobile overflow | PNG 5종은 909×540 showcase, HTML은 Android mobile canvas | Browser 909×540 및 390×844에서 가로 overflow·오류 overlay 없음 | 통과 |

## Above-the-fold copy gate

- 로그인, 튜토리얼, 홈, 랭킹, 마이 화면의 첫 viewport에서 위 화면별 고정 명세에 없는 제목·badge·kicker·설명 블록을 추가하지 않는다.
- 접근성 label은 시각적으로 표시하지 않는다.
- 오류·로딩·toast 문구는 사용자 행동이나 상태 전환 후에만 표시한다.
- 튜토리얼의 페이지 indicator·다음·건너뛰기는 원본 PNG의 첫 crop 아래에 위치하며, 390×844 실제 mobile viewport에서만 보이는 승인된 기능 UI다.
