# DSM 오프라인 학습 자료 — 과거 snapshot

이 사이트는 2026-08-08~09의 소스를 설명하는 교육용 자료입니다. 원본 기준은 `43145b6e0407c3c539ca66deb1813ddbc2e97ec8`이며, 2026-09-10 브랜치 통합 때 보존했습니다. **현재 DSM 제품의 코드·API·보안 계약을 설명하는 문서가 아닙니다.**

[학습 사이트 열기](./index.html). 서버나 외부 CDN 없이 HTML을 열 수 있습니다. 화면의 소스·hash·테스트 수와 `qa-report.md`, `verification-report.json`은 당시 snapshot 기준입니다. 최신 제품에는 JWT `sid`, 세션 폐기 검사, ranking projection 등 후속 변경이 있으므로 실제 코드는 현재 `DSM_Back`·`DSM_Front`를 확인하세요.

`tools/learning-site`도 같은 snapshot의 생성·검증 도구입니다. 현재 main 소스를 입력해 재생성하면 고정 corpus 검사에서 실패합니다. 기준 commit의 소스와 도구를 별도의 임시 디렉터리에 준비한 뒤 그곳에서 실행합니다.

```powershell
node --test "tools/learning-site/tests/*.test.mjs"
node tools/learning-site/verify.mjs --root <원본-snapshot-경로> --out <학습-site-경로> --batch batch-b --full --report <임시-report.json>
```

원본 corpus는 Backend 88파일·8,787줄, Front 36파일·4,381줄입니다. Git에 없는 생성 선언 `DSM_Front/expo-env.d.ts`도 필요합니다. 아래 정확한 3줄을 UTF-8/LF로 쓰되 파일 끝 개행을 붙이지 않습니다. SHA-256은 `6fc02634da46d3edc5a88eec9173ba6bf709726be3cba83c73ebd8e859d5c147`입니다.

```typescript
/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be in your git ignore
```

실제 `.env`·키·자격 증명은 검증 입력에 포함하지 않습니다. 2026-09-10 이 준비로 전용 테스트 66개와 보존된 소스 페이지 28개 검증이 통과했습니다. 당시 계획·디자인 문서는 역사 자료이며 현재 실행 승인은 활성 `.ai/memory`와 사용자 지시를 따릅니다. 통합 판단과 잔여 기능은 [브랜치 비교 보고서](../docs/reviews/2026-09-10-branch-consolidation.md)를 참고하세요.
