# 2026-05-08 매칭 의견 DB 저장 보완

## 작업 범위
- 고용지원 매칭 결과의 `AI Recommendation & Profile` 저장을 `localStorage` 단독 의존에서 기존 `caseDocuments` 저장 흐름으로 연결했다.
- 메뉴/라우트, DB 버전, Gemini 모델 정책은 변경하지 않았다.
- 인포메이트, 커뮤니티, 인트라넷은 다시 연결하지 않았다.

## 저장 위치
- IndexedDB 기존 object store: `caseDocuments`
- 문서 타입: `matching_opinion`
- 탭 구분: `employment`
- source: `matching`

## 저장 필드
- `seekerId`
- `seekerName`
- `jobId`
- `companyName`
- `jobRole`
- `content`
- `createdAt`
- `updatedAt`
- `source: 'matching'`

## localStorage 호환
- 기존 `jjss-matching-profile:*` localStorage 값은 유지한다.
- 화면을 열 때 DB에 저장된 매칭 의견이 있으면 DB 값을 우선 사용한다.
- DB 값이 없으면 기존 localStorage 값을 fallback으로 표시한다.
- 새 저장은 DB에 저장하고, localStorage에도 보조 사본을 남긴다.

## 사례 이력 연결
- `CaseHistoryPanel`에서 `matching_opinion`과 `employment_matching`을 “매칭의견”으로 표시한다.
- 필터 탭에 “매칭의견”을 추가해 이용자별 사례 이력에서 확인할 수 있게 했다.
- 매칭 의견은 매칭 화면에서 편집하는 문서이므로 사례 이력 패널의 “이어서 작성” 버튼은 비활성 표시로 유지했다.

## 검증
- `npm run build` 통과
- 남은 경고: Vite 번들 청크 크기 경고가 유지된다.

## 남은 위험 요소
- 기존 localStorage 값을 자동으로 DB에 이관하지는 않는다. 사용자가 매칭 의견을 열고 저장하면 DB에 저장된다.
- 매칭 의견의 “이어서 작성”을 사례 이력 패널에서 직접 연결하려면 매칭 화면으로 이동하면서 jobId를 전달하는 후속 라우팅 작업이 필요하다.

