# 2026-05-08 이전 업데이트 기능 복구 매핑 계획

## 1. 복구 원칙

- 전체 롤백은 하지 않는다. 현재 안정화된 코드 위에 남아 있는 업데이트 기능을 다시 UI에 정리해서 연결한다.
- 현재 안정화된 DB/API 키/IndexedDB/caseDocuments/trainingState 흐름은 유지한다.
- 사용자가 누를 수 있는 메뉴와 버튼은 실제 작동하는 기능만 노출한다.
- 미구현 기능, 검증되지 않은 버튼, 저장 흐름이 없는 UI는 숨긴다.
- 새 IndexedDB object store 생성은 최소화한다.
- 기존 문서 저장은 우선 `caseDocuments`를 활용한다.
- 직업훈련의 누적 상태는 기존 `trainingState`를 유지한다.
- 인포메이트, 인트라넷, 커뮤니티/소통 공간은 현재 보류 또는 제거 상태를 유지한다.
- 기능 복구는 UI 재연결과 탭 재배치를 우선하고, 데이터 구조 변경은 후순위로 둔다.
- 각 단계마다 `npm run build`를 통과시킨 뒤 다음 단계로 진행한다.

## 2. 기능 분류표

| 스크린샷/기능 영역 | 기능명 | 현재 코드 위치 | 현재 상태 | 복구 방식 | 저장 위치 | 주의사항 |
|---|---|---|---|---|---|---|
| 스크린샷 1 | 직업평가 결과분석기 | `src/pages/VocationalEvaluation.tsx`, `src/services/gemini.ts` | 살아 있음 | 2단계 연결 완료: 탭 정리, 파일/텍스트 입력 분리, 저장/보완/복사/초기화 버튼 정리 | 화면 이력 localStorage | PDF/이미지/텍스트 분석이 무한 로딩 없이 끝나는지 계속 확인 |
| 스크린샷 2 | 직업평가 종합소견서 | `src/pages/VocationalEvaluation.tsx`, `src/services/gemini.ts` | 살아 있음 | 2단계 연결 완료: 탭/액션 버튼 정리, 다운로드 유지 | 화면 이력 localStorage | 결과분석 내용을 종합소견서 생성에 이어서 쓰는 흐름 유지 |
| 스크린샷 1~2 | 직업평가 저장 문서/이력 | `src/pages/VocationalEvaluation.tsx` | 살아 있음 | 2단계 연결 완료: DB 변경 없이 화면 이력 탭 추가 | `localStorage: jjss:vocational-evaluation-history` | 기관별/이용자별 영구 사례문서 저장은 후속 단계에서 `caseDocuments` 연계 검토 |
| 스크린샷 3 | 직업훈련 메뉴 | `src/App.tsx`, `src/components/Navbar.tsx`, `src/pages/WorkTraining.tsx` | 살아 있음 | 2단계 유지 | `trainingState` | `/training` 라우트 유지, 메뉴 순서 변경 시 다른 제거 메뉴 재연결 금지 |
| 스크린샷 3 | 훈련실관리 | `src/pages/WorkTraining.tsx` | 살아 있음 | 2단계 UI 정리 유지 | `trainingState` | 이용자 배정/해제 시 작성 기록 삭제 금지 |
| 스크린샷 3~5 | 계획 및 일지 작성 및 공유 | `src/pages/WorkTraining.tsx`, `src/services/documentRegenerationService.ts` | 살아 있음 | 2단계 탭 재배치 완료, 문서 버튼 명칭 정리 | `trainingState` | 현재 내용 기반 보완 기능 유지 |
| 스크린샷 3 | 출석관리 | `src/pages/WorkTraining.tsx` | 살아 있음 | 2단계 탭 위치 정리 완료 | `trainingState` | 출석 저장 후 앱 재시작 시 유지 확인 필요 |
| 스크린샷 3 | 훈련상황/진도 | `src/pages/WorkTraining.tsx` | 살아 있음 | 2단계 탭 위치/라벨 정리 완료 | `trainingState` | 연간 프로그램 진도와 훈련생 선택 상태 연결 확인 |
| 스크린샷 6 | 고용지원 AI 매칭 | `src/pages/WorkMate.tsx`, `src/components/MatchingView.tsx`, `src/services/matching.ts` | 살아 있음 | 기존 유지 + 탭 재배치 | `caseDocuments`, local compatibility | 미구현 이력서/파일생성 버튼은 계속 숨김 |
| 스크린샷 6 | 매칭 의견 저장 | `src/components/MatchingView.tsx`, `src/store/dataStore.ts`, `src/types/caseDocument.ts` | 살아 있음 | 기존 유지 | `caseDocuments` (`type: matching_opinion`, `tab: employment`, `source: matching`) | jobId 없을 때 companyName + jobRole + location 조합 유지 필요 |
| 스크린샷 6 | 사례관리 문서 연속작성 | `src/pages/WorkMate.tsx`, `src/store/dataStore.ts` | 살아 있음 | 3단계 탭명 정리 완료 | `caseDocuments` (`tab: case`) | seeker.id/seekerId 기준 조회 유지, 이름 단독 매칭 금지 |
| 스크린샷 6 | 면접일지 작성 | `src/pages/WorkMate.tsx`, `src/services/gemini.ts` | 살아 있음 | 3단계 탭 연결 완료 | `caseDocuments` (`type: interview_note`, `tab: employment`) | 새 store 없이 이용자별 고용지원 문서로 저장 |
| 스크린샷 7 | 직무분석지 작성 | `src/pages/WorkMate.tsx`, `src/services/gemini.ts` | 살아 있음 | 3단계 탭 연결 완료 | `caseDocuments` (`type: job_analysis`, `tab: employment`) | 새 store 없이 이용자별 고용지원 문서로 저장 |
| 스크린샷 8 | 작성 내용 점검 | `src/components/DocumentReviewTab.tsx`, `src/pages/WorkMate.tsx` | 살아 있음 | 3단계 탭 연결 완료 | 자동 저장 없음, 제안 결과 복사 | 원문을 자동으로 덮어쓰지 않음 |
| 스크린샷 9~10 | OCR | `src/components/OCRView.tsx`, `src/services/ocr.ts`, `src/pages/BudgetManagement.tsx` | 살아 있음 | 4단계 카테고리 연결 완료 | 자동 저장 없음, 예산 OCR은 form 반영 | 문서 OCR과 예산 OCR 용도 구분 안내 |
| 스크린샷 10 | 개인정보 비식별화 | `src/components/MaskingView.tsx`, `src/utils/anonymizer.ts`, `src/pages/AITools.tsx` | 살아 있음 | 4단계 카테고리 연결 완료 | 화면 결과 중심 | 민감정보 처리 안내 유지 필요 |
| 스크린샷 12 | 위기대응 시뮬레이터 | `src/pages/CrisisManual.tsx`, `src/data/crisisScenarios.ts`, `src/pages/AITools.tsx` | 살아 있음 | 4단계 기획 및 위기대응 배치 완료 | 저장 없음 | AI 실패 시 기본 템플릿 표시 유지 |
| 스크린샷 11 | 나노바나나 일정표 | `src/components/ScheduleDesignView.tsx`, `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 4단계 홍보 및 시각화 배치 완료 | 화면 결과/다운로드 중심 | 이미지 생성 실패가 다른 AI 기능에 영향 주지 않게 유지 |
| 스크린샷 11 | 나노바나나 홍보물/포스터 | `src/components/PromoDesignView.tsx`, `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 4단계 홍보 및 시각화 배치 완료 | 화면 결과/다운로드 중심 | 권한/quota 실패 시 대체 흐름 안내 |
| 스크린샷 9 | 회의 녹취록 전문 분석 | `src/components/MinutesView.tsx`, `src/pages/AITools.tsx` | 살아 있음 | 4단계 핵심 문서 작성 배치 완료 | 화면 결과 중심 | 긴 텍스트 처리 실패 메시지 확인 필요 |
| 스크린샷 9 | AI 상담스파링 파트너 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 일부 있음 | 후속 개발 또는 숨김 | 미정 | 실제 작동 화면/저장 흐름 확인 전 버튼 노출 금지 |
| 스크린샷 9 | 공문서 작성 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 생성 실패 시 입력 내용 유지 |
| 스크린샷 9 | 문장 개선기 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 기존 입력 덮어쓰기 주의 |
| 스크린샷 9 | 쉬운 글 변환기 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 원문 보존 필요 |
| 스크린샷 10 | AI 문서 질의응답 | `src/components/DocumentChatView.tsx`, `src/pages/AITools.tsx` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 상태 중심 | 파일 업로드/질의 실패 시 안내 확인 |
| 스크린샷 10 | 만능 텍스트 유틸리티 | `src/components/UtilitiesView.tsx`, `src/pages/AITools.tsx` | 살아 있음 | 기존 유지 + 카테고리 정리 | 저장 없음 | 오프라인 기능은 API 키 없이 작동하도록 유지 |
| 스크린샷 11 | 데이터 대시보드 자동 생성 | `src/components/DashboardView.tsx`, `src/pages/AITools.tsx` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 상태 중심 | 시각화 결과 저장/다운로드가 미구현이면 버튼 숨김 |
| 스크린샷 12 | 보도자료 작성 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 기관 공식문서 톤 유지 |
| 스크린샷 12 | 전문 블로그 작성 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 분량 옵션 유지 |
| 스크린샷 12 | 창의적인 이름/제목 생성 | `src/pages/AITools.tsx`, `src/services/gemini.ts` | 살아 있음 | 기존 유지 + 카테고리 정리 | 화면 결과 중심 | 업무도구 내부에만 유지 |
| 스크린샷 13 | 홈 화면 주요 기능 카드 | `src/pages/Home.tsx` | 살아 있음 | 5단계 정리 완료 | 저장 없음 | 실제 연결된 6개 기능만 표시 |
| 스크린샷 3/기타 | 인포메이트 | `src/pages/InfoMate.tsx` | 보류 | 숨김 | 미정 | 파일이 있어도 현재 메뉴/라우트 연결하지 않음 |
| 이전 구현 | 인트라넷 | `src/pages/WelfareLauncher.tsx` 등 | 보류 | 숨김 | 미정 | 구현 보류이므로 연결하지 않음 |
| 이전 구현 | 커뮤니티/소통 공간 | `src/pages/Community.tsx`, `resources/posts/comments` | 보류 | 숨김 | `posts`, `comments` store 존재 | v2.2 제거 상태 유지, 메뉴/라우트 연결 금지 |

## 3. 보류 기능 명시

- 인포메이트는 파일이 있어도 현재는 메뉴에 연결하지 않는다.
- 인트라넷은 구현 보류 기능이므로 라우트와 메뉴에 연결하지 않는다.
- 커뮤니티/소통 공간은 제거 상태를 유지한다.
- 실제 작동하지 않는 버튼은 사용자 화면에 노출하지 않는다.
- 파일은 삭제하지 않고, 우선 import/route/menu 연결 여부만 관리한다.

## 4. 다음 작업 순서 제안

1. 직업평가 + 직업훈련 UI 정리 - 2단계 완료
   - `src/pages/VocationalEvaluation.tsx`
   - `src/pages/WorkTraining.tsx`
   - 기능 로직은 유지하고 탭, 결과 패널, 액션 버튼 배치를 스크린샷 기준으로 정리한다.

2. 고용지원 탭 구조 복구
   - `src/pages/WorkMate.tsx`
   - `src/components/MatchingView.tsx`
   - `src/components/DocumentReviewTab.tsx`
   - 탭 후보: 사례관리 문서 연속작성, AI 정밀 매칭, 면접일지 작성, 직무분석지 작성, 작성 내용 점검.
   - 저장은 가능한 한 `caseDocuments`를 활용한다.

3. 업무지원도구 카테고리 정리
   - `src/pages/AITools.tsx`
   - 기존 도구를 핵심 문서 작성, 문서 분석 및 보안, 홍보 및 시각화, 기획 및 위기대응으로 재배치한다.
   - 작동 검증이 안 된 도구는 숨기거나 후속 개발로 분류한다.

4. 홈 화면 카드 정리
   - `src/pages/Home.tsx`
   - 현재 제공하는 기능 기준으로 주요 기능 문구를 조정한다.
   - 인포메이트/인트라넷/커뮤니티처럼 보류된 기능을 암시하지 않는다.

5. `TEST_CHECKLIST.md` 갱신
   - 복구된 탭과 카테고리를 수동 테스트 항목에 반영한다.
   - DB/API 키/IndexedDB/caseDocuments/trainingState 보존 테스트는 계속 유지한다.

## 5. 다음 단계에서 수정할 파일 제안

- `src/pages/VocationalEvaluation.tsx`
- `src/pages/WorkTraining.tsx`
- `src/pages/WorkMate.tsx`
- `src/components/MatchingView.tsx`
- `src/components/DocumentReviewTab.tsx`
- `src/pages/AITools.tsx`
- `src/pages/Home.tsx`
- `TEST_CHECKLIST.md`

## 6. 1단계 변경 범위

- 1단계에서는 기능 코드를 수정하지 않았다.
- 1단계 산출물은 이 문서 하나였다.
- 이후 작업은 이 문서를 기준으로 작은 단위로 나누어 진행한다.

## 7. 2단계 반영 결과

- 직업평가 탭 구조를 `결과분석기`, `종합소견서`, `저장 문서/이력`으로 정리했다.
- 결과분석기는 PDF/이미지 업로드와 직접 텍스트 입력을 분리해 표시한다.
- 직업평가 결과 영역에는 분석 실행, 현재 내용 기반 보완, 저장, 복사, 초기화 버튼을 정리했다.
- 종합소견서 영역에는 소견서 생성, 현재 내용 기반 보완, 저장, 복사, 다운로드, 초기화 버튼을 정리했다.
- 직업평가 저장 문서/이력은 DB 구조 변경 없이 localStorage 기반 화면 이력으로만 추가했다.
- 직업훈련 탭 구조를 `훈련실관리`, `출석관리`, `훈련상황/진도`, `계획 및 일지 작성 및 공유` 순서로 정리했다.
- 직업훈련 문서 영역의 버튼 명칭을 `새 초안 생성`, `현재 내용 기반 보완`, `저장`, `복사`, `초기화` 흐름으로 맞췄다.
- `DB_VERSION`, object store, `caseDocuments`, `trainingState`, Gemini 모델 정책은 변경하지 않았다.

## 8. 3단계 반영 결과

- 고용지원 화면 탭 구조를 `사례관리 문서 연속작성`, `AI 정밀 매칭`, `면접일지 작성`, `직무분석지 작성`, `작성 내용 점검`으로 복구했다.
- 사례관리 문서 연속작성은 기존 `caseDocuments` 저장 흐름을 유지했다.
- AI 정밀 매칭은 기존 `MatchingView`, `saveMatchingOpinion`, `matching_opinion` 저장 흐름을 유지했다.
- 면접일지는 새 store 없이 `caseDocuments`에 `type: interview_note`, `tab: employment`, `source: employment`로 저장한다.
- 직무분석지는 새 store 없이 `caseDocuments`에 `type: job_analysis`, `tab: employment`, `source: employment`로 저장한다.
- 작성 내용 점검은 `DocumentReviewTab`을 고용지원 탭에 연결했고, 점검 결과는 원문을 자동 덮어쓰지 않는 제안 형태로 표시한다.
- `DB_VERSION`, IndexedDB store 목록, Gemini 모델 정책은 변경하지 않았다.
- 이력서 보기/파일 생성 버튼은 다시 노출하지 않았다.

## 9. 4단계 반영 결과

- 업무지원도구 화면을 `핵심 문서 작성`, `문서 분석 및 보안`, `홍보 및 시각화`, `기획 및 위기대응` 4개 카테고리로 정리했다.
- 각 도구 카드에 기능 설명, 필요한 API 키, 실패 시 대체 흐름을 표시했다.
- 이미지 생성 계열 도구에는 권한/quota에 따라 실패할 수 있고, 문서/HTML/PDF 방식으로 대체할 수 있음을 안내했다.
- 문서 OCR은 업무도구에서 텍스트 추출용으로, 예산 OCR은 예산 지출 등록 보조 기능으로 설명을 구분했다.
- 실제 작동이 확인되지 않은 AI 상담스파링 파트너 카드는 노출하지 않았다.
- 기존 도구 내부 컴포넌트 로직, Gemini 모델 정책, API 키 저장 흐름, DB 구조는 변경하지 않았다.

## 10. 5단계 반영 결과

- 홈 화면 주요 기능 카드를 현재 실제 연결된 기능 기준으로 6개로 정리했다.
- 표시 카드: 이용자 및 사업체 관리, 직업평가, 직업훈련, 고용지원/사례관리 및 매칭, 예산 관리, 업무 지원 도구.
- 각 카드 클릭 경로를 실제 라우트(`/manage`, `/evaluation`, `/training`, `/workmate`, `/budget`, `/tools`)와 맞췄다.
- 인포메이트, 인트라넷, 커뮤니티/소통 공간 카드는 표시하지 않았다.
- 홈 설명 문구를 사회복지 기관의 직업재활 업무 흐름과 현재 복구된 기능 중심으로 수정했다.
- Navbar, DB 구조, 저장 흐름, Gemini 모델 정책은 변경하지 않았다.

## 11. 6단계 최종 문서화 반영 결과

- 6단계에서는 새 기능 추가와 코드 구조 변경 없이 문서 갱신과 빌드 확인만 진행한다.
- `TEST_CHECKLIST.md`를 최신 복구 기능 기준으로 갱신했다.
- 체크리스트에는 홈 카드 6개 클릭, 직업평가 탭/저장 이력, 직업훈련 탭, 고용지원 5개 탭, 면접일지, 직무분석지, 작성 내용 점검, 업무지원도구 4개 카테고리, 문서 OCR, 개인정보 비식별화, 홍보물 이미지 생성, 나노바나나 일정표, 위기대응 시뮬레이터 테스트를 포함했다.
- `RECOVERY_NOTES.md`에 이전 업데이트 기능 복구 1~6단계 요약, 남은 위험 요소, 커밋 제외 대상을 정리했다.
- 인포메이트, 인트라넷, 커뮤니티/소통 공간은 계속 연결하지 않는다.
- 현재 안정화된 DB/API 키/IndexedDB/caseDocuments/trainingState 흐름은 변경하지 않았다.

## 12. 최종 남은 위험 요소

- OCR/PDF/이미지 생성은 API 키 권한, quota, 모델 상태에 따라 실패할 수 있다.
- 실패하더라도 사용자 안내가 표시되고 작성 중인 내용이 유지되면 1차 통과로 본다.
- 번들 크기 경고는 현재 릴리즈 차단 요소는 아니며, 추후 lazy loading 개선 대상으로 관리한다.
- 직업평가 저장 문서/이력은 현재 localStorage 기반이므로, 장기적으로 `caseDocuments` 연계를 검토한다.
- 직업평가는 이용자 기반 연결 안정성이 낮아 이번 버전의 최근 기록 참고 대상에서 제외한다.
- 최근 기록 참고 기능은 직업훈련·고용지원 기록만 대상으로 한다.

## 13. 커밋 제외 대상

- `release/`
- `dist/`
- `node_modules/`
- `.env`
- `.env.local`
- 실제 API 키가 들어간 파일
- 개인정보가 들어간 DB/백업 파일
- `.temp_app_extract/`
- 설치 파일(`*.exe`, `*.app`, `*.zip`, `*.blockmap`)
- `CHATGPT_*.txt`
- `test-gemini.js`
- `jjss-code-context*.zip`
- `index-D6j7ox8t.js`

## 14. 최종 테스트 피드백 반영 결과

- 직업평가 결과분석기 프롬프트를 실무 문서형으로 보강했다.
  - 포함 구조: 평가자료 개요, 주요 수행 특성, 강점, 어려움 또는 지원 필요 부분, 직무수행 가능성, 직업훈련 또는 고용지원 시 고려사항, 후속 지원계획.
  - 자료가 부족한 경우에도 가능한 범위에서 서술하되 확인이 필요한 부분은 `확인 필요`로 표시하도록 했다.
- 직업평가 결과와 종합소견서 textarea 높이를 키워 긴 문서를 읽고 수정하기 쉽게 했다.
- Navbar와 홈 카드의 긴 메뉴명 `고용지원/사례관리 및 매칭`을 `고용지원`으로 간소화했다. `/workmate` route와 5개 탭 구조는 유지했다.
- 자료수집 기능을 복구했다.
  - `src/pages/InfoMate.tsx`를 `/infomate` route로 연결했다.
  - Navbar와 홈 카드에는 `자료수집`으로 노출했다.
  - 저장은 기존 IndexedDB `resources` store를 사용하며, 새 store와 DB 버전 변경은 하지 않았다.
- 사례 이력/기존 작성 문서 보기 영역의 카드 최소 높이, 여백, 글자 크기, 본문 스크롤 영역을 개선했다.
- 업무지원도구 카드에 상시 표시되던 반복적인 `실패 시` 안내 문구를 제거했다.
  - 실제 실패 시 오류 안내와 입력 내용 보존 로직은 유지했다.
- 직업훈련 출석관리 버튼 클릭 이벤트를 보강했다.
  - 날짜와 훈련생 ID가 유효한 경우 즉시 `attendanceBook`에 반영되며 기존 `trainingState` 자동 저장 흐름을 유지한다.
- 직업훈련 탭 전환 후 빈 화면이 나오지 않도록 선택 훈련실/훈련생 방어 로직과 fallback UI를 추가했다.
- 예산관리의 사업별 예산 관리 기능을 복구했다.
  - 사업 등록 필드: id, 사업명, 총예산, 사업기간/연도, 비고, createdAt, updatedAt.
  - 지출 등록 시 사업 선택 가능.
  - 전체/사업 미지정/특정 사업별 지출 필터 가능.
  - 사업별 총예산, 사용액, 잔액 표시.
  - 기존 지출에 사업 정보가 없으면 `사업 미지정`으로 표시.
  - 사업 정보는 새 IndexedDB store 없이 `localStorage: jjss:budget-projects`에 저장하고, `exportAllData/importAllData`에서 `budgetProjects`로 포함한다.
- OCR 결과 적용 시 기존 선택 사업 정보는 덮어쓰지 않는다.
- 지출품의서 산출내역에는 선택 지출의 사업명이 함께 표시된다.
- `DB_VERSION`, IndexedDB store 목록, `caseDocuments`, `trainingState`, settings 저장 흐름은 변경하지 않았다.

## 15. 같은 이용자 최근 기록 참고자료 반영 결과

- 같은 이용자의 최근 직업훈련 및 고용지원 기록을 자동 병합하지 않고 선택형 참고자료로만 불러오는 기능을 추가했다.
- 직업평가는 이용자 기반 연결 안정성이 낮아 이번 버전의 최근 기록 참고 대상에서 제외했다.
- 공통 수집 서비스는 `src/services/clientContextService.ts`에 두었다.
  - `buildClientContextSummary`: 이용자 식별자를 기준으로 관련 기록을 수집하고 요약한다.
  - `withClientContextPrompt`: 사용자가 불러온 참고자료를 AI 프롬프트에만 붙인다.
- 저장된 원본 문서는 수정하지 않는다.
- 참고자료 요약은 자동 저장하지 않는다.
- 생성된 최종 문서만 사용자가 저장 버튼을 눌렀을 때 기존 저장 흐름으로 저장한다.
- 적용 화면:
  - 고용지원 사례관리 문서 연속작성: 사례회의록, 직업재활계획서, 상담일지, 정기평가.
  - 고용지원 면접일지/직무분석지 작성.
  - 직업훈련 계획 및 일지 작성 및 공유: 훈련계획서, 훈련 상담일지, 훈련 평가서, 공유용 요약.
- 직업평가 화면은 기존 결과분석/종합소견서 기능만 유지한다.
- 직업평가 localStorage 이력은 이용자와 억지로 매칭하지 않는다.
- 식별자 처리:
  - `id`, `seekerId`를 우선 사용한다.
  - 이름 단독 매칭은 식별자가 없고 이용자가 유일하게 식별될 때만 제한적으로 사용한다.
  - 동명이인 가능성이 있으면 정확한 식별자로 연결된 기록만 참고한다.
- `DB_VERSION`, IndexedDB store 목록, `caseDocuments`, `trainingState` 구조는 변경하지 않았다.

## 16. 업무지원도구 작동성 점검 반영 결과

- 업무지원도구의 4개 카테고리 구조는 유지했다.
  - 핵심 문서 작성
  - 문서 분석 및 보안
  - 홍보 및 시각화
  - 기획 및 위기대응
- 노출 도구:
  - 공문서 작성
  - 회의 녹취록 전문 분석
  - 문장 개선기
  - 쉬운 글 변환기
  - 보도자료 작성
  - 전문 블로그 작성
  - 홍보물 문구 작성
  - 창의적인 이름/제목 생성
  - 문서/이미지 OCR 변환
  - AI 문서 질의응답
  - 개인정보 비식별화
  - 만능 텍스트 유틸리티
  - AI 포스터/홍보물 생성
  - 나노바나나 디자인 스케줄러
  - 데이터 대시보드 자동 생성
  - 위기대응 시뮬레이터
- 보강 내용:
  - 일반 AI 텍스트 도구는 입력값이 없으면 실행하지 않고 안내를 표시한다.
  - AI 문서 질의응답은 문서 업로드와 질문 입력을 모두 확인한 뒤 실행한다.
  - 개인정보 비식별화는 Gemini 실패 시 로컬 규칙 기반 마스킹으로 대체한다.
  - 문서 OCR은 예산 OCR과 용도를 구분해 안내한다.
  - 데이터 대시보드는 CSV/JSON 파일을 읽어 실제 위젯 수치로 반영한다.
  - 이미지 생성 도구는 권한, quota, 모델 상태에 따른 실패 안내와 HTML/PDF 대체 안내를 유지한다.
  - 위기대응은 AI 실패 시 기본 템플릿을 표시한다.
- 숨긴 도구:
  - 새로 숨긴 도구는 없다.
  - 이전에 숨긴 상담스파링 등 미완성 카드는 계속 노출하지 않는다.
- 저장 구조:
  - 새 DB store를 만들지 않았다.
  - `DB_VERSION`, `caseDocuments`, `trainingState`, settings/API 키 저장 흐름을 변경하지 않았다.
- 남은 위험 요소:
  - Gemini/Vision 기반 기능은 API 키 권한, quota, 모델 상태, 네트워크에 따라 실패할 수 있다.
  - 이미지 안의 한국어 텍스트 품질은 모델 상태에 따라 깨질 수 있다.
  - 대시보드 파일 입력은 CSV/JSON 텍스트 데이터 중심으로 동작하며, XLSX 정밀 파싱은 후속 개발 대상이다.

## 17. 이용자 및 사업체/구인 수정 기능 반영 결과

- 이용자 및 사업체 관리 화면에 수정 버튼을 추가했다.
- 기존 `JobSeekerModal`을 신규 등록 모드와 수정 모드로 함께 사용한다.
  - 신규 이용자 등록
  - 이용자 정보 수정
  - 신규 구인공고/사업체 등록
  - 사업체/구인 정보 수정
- 수정 저장 방식:
  - `dataStore.updateSeeker`
  - `dataStore.updateJob`
  - 내부 저장은 기존 `localDB.updateDoc` 흐름을 사용한다.
- 식별자 유지:
  - 이용자 `id`는 수정 과정에서 변경하지 않는다.
  - 이용자 `seekerId`는 자동 재생성하지 않는다.
  - 사업체/구인 `id`도 변경하지 않는다.
  - 따라서 기존 사례문서, 매칭 의견, 훈련 데이터의 식별자 기반 연결을 깨뜨리지 않는다.
- 데이터 구조:
  - `DB_VERSION` 변경 없음.
  - 새 IndexedDB store 생성 없음.
  - 기존 `seekers`, `jobs` store 구조 유지.
  - `caseDocuments`, `trainingState`, `expenses`, settings/API 키 흐름 변경 없음.
- UI/UX:
  - 수정 모달 제목과 저장 버튼 문구를 수정 모드에 맞게 표시한다.
  - 수정 취소 버튼을 제공하며, 취소 시 원본 데이터는 저장되지 않는다.
  - 삭제 버튼과 수정 버튼을 분리해 배치했다.
- 테스트 항목:
  - 이용자 등록 후 수정
  - 이용자 수정 후 앱 재시작 유지
  - 이용자 수정 취소
  - 사업체/구인 등록 후 수정
  - 사업체/구인 수정 후 앱 재시작 유지
  - 사업체/구인 수정 취소
  - 수정 후 고용지원 매칭 화면에서 변경 정보 표시

## 18. 직업훈련·예산·업무도구 품질 개선 반영 결과

- 직업훈련 문서 작성 UI:
  - 훈련계획서, 훈련 상담일지, 정기평가서, 작업수행 체크리스트, 현장중심 직업훈련 기록, 보호자/유관기관 공유 요약에 `새 초안 생성`, `현재 내용 기반 보완`, `저장`, `복사`, `초기화` 흐름을 명확히 보강했다.
  - 현재 내용 기반 보완은 현재 textarea의 수정 내용을 우선 반영한다.
  - 기존 `trainingState` 저장 흐름을 유지하고 새 store를 만들지 않았다.
- 예산관리:
  - 사업 등록/수정의 총예산 입력란은 화면에서 1,000단위 콤마를 표시한다.
  - 내부 저장값은 기존 `BudgetProject.totalBudget: number` 구조를 유지한다.
  - 사업별 사용액과 잔액 계산은 숫자 값을 기준으로 유지한다.
- 개인정보/LLM 처리 점검:
  - `MaskingView`는 원문과 비식별화 결과를 분리해 표시한다.
  - `anonymizer`는 이름, 나이, 주소, 전화번호, 주민등록번호, 이메일 중심의 로컬 마스킹을 제공한다.
  - 일반 `generateText` 호출은 마스킹 모드가 아닌 경우 로컬 비식별화 후 LLM에 전달하고, 응답을 재식별화하는 흐름을 사용한다.
  - 사례관리 문서 저장 흐름은 비식별화 결과로 원문을 자동 덮어쓰지 않는다.
  - 다만 이용자 정보와 문서 생성 프롬프트가 LLM 처리 대상이므로, 기관 운영 정책상 더 강한 비식별화 옵션은 후속 개선으로 검토한다.
- 문장개선기:
  - 기존 문체, 의미, 어조를 유지하도록 프롬프트를 재정리했다.
  - 문법, 맞춤법, 띄어쓰기, 문장 구조, 과장 표현 제거, 대체 표현 제안을 포함한다.
  - 앱 기능과 무관한 모델 보안 지시문은 프롬프트에 포함하지 않았다.
- 전문 블로그 작성:
  - SEO 제목, 추천 부제, 본문, 핵심 요약, 추천 태그 구조로 출력한다.
  - 본문에는 문장개선기 기준처럼 문법/맞춤법/띄어쓰기와 문장 흐름 개선 기준을 반영했다.
  - 장애인복지/직업재활 주제에서는 존중 표현과 `지원` 중심 표현을 우선하도록 했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - IndexedDB store 목록
  - `caseDocuments`, `trainingState`, `expenses`, settings/API 키 저장 흐름
  - 기존 데이터 삭제/초기화

## 19. 직업평가 이력 수정/삭제 및 사진 기반 직무분석지 반영 결과

- 직업평가 저장 문서/이력:
  - 저장 위치는 기존 `localStorage`의 `jjss:vocational-evaluation-history`를 유지했다.
  - 저장 문서별로 보기/수정, 저장, 삭제, 복사, 불러오기를 제공한다.
  - 수정 시 기존 문서의 `id`는 유지하고 `content`, `updatedAt`만 갱신한다.
  - 삭제 시 확인창을 띄우며, 승인 시 해당 기록만 목록에서 제거한다.
  - 새 IndexedDB store를 만들지 않았다.
- 고용지원 직무분석지:
  - 입력 방식을 사업체/직무 기본정보, 사진 업로드, 간략 특성 입력, 사업주 면담 내용 입력 중심으로 정리했다.
  - 사진은 여러 장 업로드 가능하며 생성 요청에만 사용한다.
  - 사진 파일 자체는 DB에 저장하지 않는다.
  - 저장은 기존 `caseDocuments`의 `job_analysis` 타입을 유지한다.
  - 사진 분석 실패 시 텍스트 입력이 있으면 텍스트 기반 생성으로 재시도한다.
- 직무분석지 프롬프트 반영:
  - 한글, 음슴체, 개조식, 공공기관 문서체, 장애인 존중 표현, `지원` 중심 표현을 반영했다.
  - 출력 항목은 물품입출고, 외부인출입, 협력작업, 세부과제, 지식/기능, 제공가능한 지원수준, 사업주 면담을 포함한다.
  - 사진에서 작업환경, 동선, 도구, 사람의 움직임, 위험요소, 협력 필요성, 물품 이동 여부를 분석하도록 했다.
  - 체인 오브 사고, thinking 태그, 보안 지시사항, 내부 사고 과정 관련 지시는 포함하지 않았다.
- 코드/파일 점검:
  - 실제 삭제, 라우트 제거, import 제거는 하지 않았다.
  - `Community.tsx`, `WelfareLauncher.tsx`, `src/.DS_Store`, 오래된 복구 문서, 중복 파일 변환 helper 등은 후속 정리 후보로 보고한다.

## 20. 사업체/구인정보 상세 필드 및 사업체 기반 직무분석지 반영 결과

- 사업체/구인 등록 모달:
  - 단건 직접 입력과 수정 모드에 직무내용, 요구조건, 배려사항, 채용상태, 담당자, 연락처를 추가했다.
  - 신규 등록과 수정 모두 기존 `jobs` store를 사용한다.
  - 기존 job `id`는 유지하고, 입력 문자열은 저장 전 앞뒤 공백을 정리한다.
  - 기존 데이터에 새 필드가 없어도 기본값/빈값으로 안전하게 표시한다.
- 사업체/구인 목록:
  - 채용상태와 담당자 정보를 요약 행에서 확인할 수 있다.
  - 상세 펼침 영역에서 직무내용, 요구조건, 배려사항, 연락처를 확인할 수 있다.
- 직무분석지 작성:
  - 기준을 이용자 선택에서 사업체/구인정보 선택 중심으로 정리했다.
  - 선택한 사업체/구인정보의 회사명, 직무, 지역, 시간, 급여, 모집조건, 직무내용, 요구조건, 배려사항, 채용상태, 담당자/연락처를 프롬프트에 포함한다.
  - 사진은 여러 장 업로드 가능하며 생성 요청에만 사용한다.
  - 사진 파일 자체는 IndexedDB 또는 `caseDocuments`에 저장하지 않는다.
  - 저장은 기존 `caseDocuments`의 `job_analysis` 타입과 `jobId`, `companyName`, `jobRole`, `location`, `photoFileNames`, `photoCount` 메타데이터를 사용한다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - IndexedDB store 목록
  - 기존 `caseDocuments`, `trainingState`, `settings`, `expenses` 흐름
  - 기존 이용자 기반 사례관리/면접일지/매칭/작성내용점검 흐름

## 21. Gemini API 사용량 급증 방지 및 호출 안정화 반영 결과

- Gemini 호출 위치를 점검했다.
  - `src/services/gemini.ts`: `generateText`, `generateImage`, 직업평가 파일 분석/보고서 생성
  - `src/services/ocr.ts`: PDF OCR, Vision 실패 후 Gemini OCR fallback, 영수증 itemized parse
  - 업무 화면: `AITools`, `DocumentChatView`, `PromoDesignView`, `ScheduleDesignView`, `VocationalEvaluation`, `WorkMate`, `WorkTraining`
- 여러 Gemini 모델을 자동으로 순차 호출하는 구조는 확인되지 않았다.
  - 텍스트 생성은 사용자가 설정한 provider/model 1개만 호출한다.
  - 이미지 생성은 같은 모델에서 이미지 파트가 없을 때 IMAGE 전용 모드로 최대 1회만 retry한다.
  - OCR은 이미지의 경우 Vision API 우선, 실패 시 Gemini fallback 1회이고 PDF는 Gemini를 사용한다.
- 동일 요청 중복 방지:
  - 텍스트: provider/model/type/userInput/fileData 기준 5초 차단
  - 이미지: image model/style/prompt 기준 5초 차단
  - OCR: 파일명/크기/type/수정시각 기준 5초 차단
  - 영수증 AI 파싱: OCR 텍스트 기준 5초 차단
- 반복 오류 차단:
  - 같은 기능에서 Gemini/OCR 오류가 연속 3회 발생하면 30초 동안 해당 기능만 차단한다.
  - 성공 시 오류 카운트를 초기화한다.
  - 직업평가 오류가 고용지원 문서 작성 등 다른 기능 전체를 막지 않도록 feature key를 분리했다.
- 문서 질의응답:
  - 화면 대화 기록은 유지하고 API 전송 history만 최근 5턴 또는 10,000자 이내로 제한한다.
  - 큰 PDF/이미지 업로드 시 사용량 증가 가능성을 화면에 안내한다.
- 비용/권한 안내:
  - 설정 화면에 텍스트 문서, PDF/이미지 분석, 이미지 생성, Preview 모델, Gemini 3.1 Pro Preview 주의, Flash/Flash-Lite 권장 안내를 추가했다.
  - 이미지 생성 화면에는 텍스트보다 비용과 quota 소모가 클 수 있음을 표시했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - IndexedDB store 목록
  - 기존 데이터 삭제
  - 기존 문서 생성 기능
  - Gemini API 키 저장/복호화 흐름
  - OpenAI/Claude/provider 설정 구조

## 22. Gemini 3.1 Flash-Lite 정식 모델 전환 및 백업 안내 반영 결과

- 모델명 전환:
  - `gemini-3.1-flash-lite-preview`를 정식 모델명 `gemini-3.1-flash-lite`로 교체했다.
  - 신규 기본 Gemini 모델을 `gemini-3.1-flash-lite`로 변경했다.
  - 기존 저장 설정이 preview 모델명을 갖고 있으면 앱 로딩 시 정식 모델명으로 자동 보정한다.
  - 모델 선택 목록에는 `Gemini 3.1 Flash-Lite(기본)`으로 표시한다.
  - `gemini-3-flash-preview`, `gemini-3.1-pro-preview` 등 다른 preview 모델 정책은 이번 작업에서 변경하지 않았다.
- 설정 안내:
  - Gemini 3.1 Flash-Lite(기본)는 빠르고 비용 효율적인 문서 작성용 권장 모델로 안내했다.
  - Gemini 2.5 Flash는 안정성이 필요한 경우 선택 가능하다고 안내했다.
  - Gemini 3.1 Pro Preview는 고비용/프리뷰 모델로 주의가 필요하다고 안내했다.
  - 일반 문서 생성은 비용 부담이 낮고, 이미지 생성/PDF·이미지 분석/OCR 반복 실행은 더 많은 quota를 사용할 수 있음을 간단히 안내했다.
- 예산 지출 등록:
  - 사업 선택, 일자, 품명, 금액 누락 검증 메시지를 항목별로 분리했다.
  - 금액이 비어 있거나 0 이하인 경우 금액 관련 안내가 먼저 표시되도록 보정했다.
  - 기존 OCR 반영, 콤마 표시, 잔액 계산, 지출 저장 흐름은 유지했다.
- 데이터 저장 및 백업/복원:
  - JJSS 데이터가 현재 PC의 앱 저장소(IndexedDB/localStorage)에 저장된다는 안내를 추가했다.
  - 브라우저/개발 모드에서는 브라우저 IndexedDB/localStorage에 저장된다고 안내했다.
  - Windows와 macOS 각각 업데이트/삭제/재설치 전 백업 권장 문구를 추가했다.
  - 실제 Electron userData 경로 자동 표시는 기존 구조를 크게 바꾸지 않기 위해 후속 과제로 남겼다.
  - 데이터 내보내기는 이용자, 사업체/구인정보, 사례문서, 훈련 데이터, 예산/사업/지출 데이터를 포함하고 API 키는 제외하는 원칙을 유지한다.
  - 데이터 불러오기 시 기존 API 키가 백업 파일의 빈 값으로 덮어써지지 않게 했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - 새 IndexedDB store 생성
  - 기존 데이터 삭제/초기화
  - 기존 API 호출 wrapper 구조
  - OpenAI/Claude/provider 설정 구조

## 23. 예산관리 사용성 개선 반영 결과

- 사업 미지정 지출:
  - 사업 선택 없이도 지출을 저장할 수 있게 했다.
  - projectId가 없는 기존/신규 지출은 `사업 미지정`으로 표시한다.
  - 필터에는 기존 `전체`와 `사업 미지정`을 유지하며, 미지정 필터는 projectId가 없는 지출만 표시한다.
  - 사업 미지정 지출은 특정 사업 사용액, 잔액, 사용률 계산에서 제외하고 전체 지출 합계에는 포함한다.
  - OCR 반영은 기존처럼 사업 선택값을 덮어쓰지 않는다.
- 예산 초과 경고:
  - 특정 사업이 선택된 지출만 초과 여부를 계산한다.
  - 신규 등록 시 해당 사업의 현재 사용액과 입력 금액을 합산해 총예산 초과 여부를 확인한다.
  - 수정 시에는 기존 지출 id를 제외한 사용액에 수정 금액을 더해 계산한다.
  - 초과 시 `이 지출을 등록하면 해당 사업 예산을 ...원 초과합니다. 그래도 저장하시겠습니까?` 확인창을 표시한다.
  - 취소하면 저장하지 않고, 확인하면 기존 저장 흐름으로 진행한다.
- 사업별 사용률:
  - 사용률은 `사용금액 / 총예산 × 100`으로 계산한다.
  - 총예산이 0 이하이면 예산 미입력으로 안전하게 표시한다.
  - 상태 기준은 정상, 주의, 거의 소진, 초과로 구분한다.
  - 선택 사업 요약 영역과 사업 카드에 사용률 바와 상태 배지를 표시했다.
- CSV 내보내기:
  - 예산관리 화면에 `CSV 내보내기` 버튼을 추가했다.
  - 현재 필터링된 지출 목록 기준으로 내보낸다.
  - 컬럼은 사업명, 지출일자, 품명, 금액, 거래처, 결제수단 또는 결제정보, 비고, 등록일이다.
  - UTF-8 BOM을 포함해 Excel 한글 깨짐을 줄였다.
  - 파일명은 `jjss-budget-expenses-YYYY-MM-DD.csv` 형식이다.
  - CSV는 보고용 로컬 내보내기이며, 전체 앱 데이터 백업과 구분해 안내했다.
- 입력 검증:
  - 지출일자, 품명, 금액 누락 메시지를 항목별로 보정했다.
  - 사업 선택은 필수가 아니므로 저장 차단 메시지를 제거했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - 새 IndexedDB store 생성
  - 기존 `expenses`, `budgetProjects` 저장 구조
  - OCR, 지출품의서, 사업별 잔액 계산의 기본 흐름

## 24. 긴급 안정화 및 예산 세부 항목 반영 결과

- 예산관리 필터:
  - 상단 필터 순서를 검색, 사업 선택, 세부 예산 항목 선택 순서로 수정했다.
  - 특정 사업을 선택하면 해당 사업에 속한 세부 예산 항목만 표시한다.
  - 사업 미지정 선택 시 세부 항목 필터는 비활성화한다.
- 세부 예산 항목:
  - `BudgetProject`에 선택 필드 `budgetItems`를 추가했다.
  - 기존 사업 데이터에 `budgetItems`가 없어도 빈 배열로 처리해 호환되게 했다.
  - 사업 등록/수정 화면에서 세부 예산 항목 추가, 수정, 삭제를 지원한다.
  - 세부 항목 금액은 콤마 입력을 유지하고, 항목 합계가 총예산을 초과하거나 다르면 저장 전 확인한다.
- 지출 세부 항목:
  - `Expense`에 선택 필드 `budgetItemId`, `budgetItemName`을 추가했다.
  - 지출 등록 시 사업을 선택한 경우 세부 예산 항목을 선택할 수 있고, 선택하지 않으면 항목 미지정으로 집계한다.
  - 사업 삭제 시 연결 지출은 사업 미지정으로 전환하고 세부 항목 정보도 비운다.
- 항목별 잔액 관리:
  - 항목별 사용액은 같은 사업의 지출 중 `budgetItemId`가 일치하는 건만 합산한다.
  - 항목별 예산, 사용액, 잔액, 사용률을 사업 카드에 표시한다.
  - 항목 미지정 지출은 별도 사용액으로 표시한다.
- CSV 내보내기:
  - CSV에 `세부 예산 항목` 컬럼을 추가했다.
  - 기존 필터 기준과 UTF-8 BOM, 파일명 규칙은 유지했다.
- Gemini 모델 목록:
  - 설정 화면 Gemini 모델 목록을 `Gemini 3.1 Flash-Lite(기본)`, `Gemini 3 Flash Preview`, `Gemini 3.1 Pro Preview` 3개로 정리했다.
  - 기본 모델은 `gemini-3.1-flash-lite`로 유지한다.
  - 지원 목록에서 제외된 기존 저장 모델은 앱 로딩 시 기본 모델로 보정하고 안내한다.
- API guard 안정화:
  - 동일 요청 중복 차단 시간을 5초에서 2초로 완화했다.
  - 중복 요청 key는 기능 영역, 문서 유형, provider/model, 입력 hash 기준으로 좁혔다.
  - 오류 3회 반복 차단 key는 기능+문서유형+모델 기준으로 분리했다.
  - 고용지원, 직업훈련, 문서 질의응답, 직업평가 주요 Gemini 호출부에 feature/documentType 정보를 부여했다.
  - API 키, 모델명, quota/권한, 요청 형식, 네트워크 오류 안내를 구분했다.
- 직업평가 종합소견서:
  - PDF 없이도 직접 입력 내용, 최근 결과분석기 내용, 선택한 저장 분석 문서로 작성할 수 있게 했다.
  - “최근 결과분석 내용 불러오기” 버튼과 PDF 없이 작성 가능 안내를 추가했다.
  - 입력 내용과 기존 결과는 생성 실패 시 유지한다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - 새 IndexedDB store 생성
  - 기존 데이터 삭제/초기화
  - `expenses`, `budgetProjects`, `caseDocuments`, `trainingState`, settings 저장 흐름
  - Gemini API 키 저장/복호화 흐름

## 25. Gemini 3.1 Flash-Lite 503 모델 혼잡 안내 보강

- 기본 모델 유지:
  - 신규 사용자 기본 Gemini 모델은 계속 `gemini-3.1-flash-lite`로 유지한다.
  - 모델 선택 목록은 Gemini 3.1 Flash-Lite(기본), Gemini 3 Flash Preview, Gemini 3.1 Pro Preview 3개를 유지한다.
  - 2.5 계열 모델은 설정 화면 선택 목록에 다시 노출하지 않았다.
- 503 high demand 안내:
  - Gemini API가 503 UNAVAILABLE, high demand, Service Unavailable 계열 응답을 반환하면 일시적 모델 혼잡으로 안내한다.
  - 안내 문구는 잠시 후 재시도와 필요 시 Gemini 3 Flash Preview 대체 시도를 권고한다.
  - API 키 오류, quota 초과, 모델명 오류와 혼동되지 않도록 별도 분기했다.
- 반복 오류 차단:
  - 같은 기능+문서유형+모델에서 503 오류가 반복되어 30초 차단이 걸리면 모델 혼잡 전용 안내를 표시한다.
  - 다른 문서 유형이나 다른 기능까지 막지 않는 기존 guard 범위를 유지한다.
- 재시도 정책:
  - 일반 문서 생성에는 자동 재시도를 추가하지 않았다.
  - 버튼 1회 클릭당 일반 문서 생성 fetch 1회 원칙을 유지했다.
- 개발 로그:
  - 개발 모드에서만 503 발생 시 featureKey, documentType, model, status, durationMs, requestHash, reason을 `console.debug`로 남긴다.
  - prompt 원문, 상담 내용, 이용자명, API 키는 출력하지 않는다.
- 변경하지 않은 것:
  - 문서 작성 프롬프트와 작성 흐름
  - 현재 내용 기반 보완, 앞선 문서 참고, 최근 기록 참고 기능
  - `DB_VERSION`
  - IndexedDB store 목록

## 26. 예산 세부 항목 UI 의미 정리 및 PDF 분석 호출 점검

- 예산 세부 항목 UI:
  - 세부 예산 항목이 사업명이 아니라 사업 안의 예산 분류임을 명확히 안내했다.
  - 안내 문구를 인건비, 사업비, 회의비, 여비 예시 중심으로 수정했다.
  - 항목명 placeholder는 인건비, 사업비, 회의비, 여비, 물품비, 강사비 등으로 표시한다.
  - 금액 placeholder는 항목 예산금액으로 표시한다.
  - 세부 항목 없이도 사업 등록이 가능하며, 기존 데이터에 `budgetItems`가 없어도 빈 배열처럼 처리한다.
- 사업 카드:
  - 사업 총예산, 사용액, 잔액, 사용률을 우선 표시한다.
  - 세부 항목별 현황은 접기/펼치기 영역에서 확인한다.
  - 항목별 예산, 사용액, 잔액, 사용률을 표시하고 항목 미지정 사용액은 별도 표시한다.
- 지출 등록:
  - 사업을 먼저 선택한 뒤 해당 사업의 세부 예산 항목만 선택할 수 있게 유지했다.
  - 사업 미지정 지출은 사업 미지정으로 저장하고, 사업은 선택했지만 세부 항목을 선택하지 않으면 항목 미지정으로 처리한다.
- 직업평가 PDF 분석 점검:
  - PDF 분석 버튼 1회 클릭 시 `handleAnalyze` → `analyzeTestResults` → 파일별 upload 준비 → `generateDocumentText`의 `generateContent` 1회 흐름이다.
  - files upload는 PDF 분석에 필요한 정상 호출이므로 삭제하거나 우회하지 않았다.
  - preflight는 브라우저 CORS 사전 요청이므로 수정하지 않았다.
  - `isAnalyzing`으로 loading 중 버튼 재클릭이 막혀 있어 중복 generateContent 호출 방지 구조를 유지한다.
- Gemini 3.1 Flash-Lite 503:
  - 기본 모델은 Gemini 3.1 Flash-Lite로 유지한다.
  - 503 high demand는 일시적 모델 혼잡 안내로 처리한다.
  - 자동 무한 재시도는 추가하지 않았다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - 새 IndexedDB store 생성
  - 기존 `budgetProjects`, `expenses` 저장 흐름
  - 직업평가 결과분석/종합소견서 기능
  - Gemini API 키 저장/복호화 흐름

## 27. 작성내용 점검 수행방법 기반 보완 개선

- 목적 변경:
  - 작성내용 점검 기능을 직업재활계획서 수행방법 기반 상담일지 보완 방식으로 개선했다.
  - 상담일지뿐 아니라 현장지원일지, 이용자상담, 보호자상담, 기타 고용지원 사례기록까지 수행방법 반영 여부를 점검하도록 했다.
- 확인 순서:
  - 직업재활계획서에서 계획 수립일, 직업목표, 장기목표, 단기목표, 수행방법, 핵심 지원 방향을 먼저 확인한다.
  - 이후 상담일자, 상담장소, 상담내용, 향후 지원계획 및 수퍼비전, 담당자, 기존 문맥과 상담 흐름을 확인한다.
  - 상담일지를 계획 수립 전, 수립 직후, 수립 후, 변화 확인/유지지원 흐름으로 구분한다.
- 수정 원칙:
  - 기존 상담일자는 변경하지 않는다.
  - 기존 상담장소는 특별 요청이 없으면 변경하지 않는다.
  - 기존 사건, 사실관계, 상담 흐름을 삭제하거나 왜곡하지 않는다.
  - 계획 수립 전 상담일지에는 수행 완료처럼 표현하지 않는다.
  - 계획 수립 전 → 계획 동의 → 수행 노력 → 변화 확인 → 유지 지원 흐름이 시간순으로 자연스럽게 이어지도록 한다.
  - 근거가 약한 내용은 “함께 확인함”, “필요성을 논의함”, “실천해보기로 함”, “추가 확인이 필요함”처럼 기록 안정성이 높은 표현을 사용한다.
- 출력 품질:
  - 반영 기준 요약, 상담일지 점검 결과, 수정된 상담일지, 반영 내용 확인 구조로 출력 형식을 고정했다.
  - 상담일지가 여러 개인 경우 날짜별로 각각 수정 결과를 제시하도록 했다.
  - 각 상담일지별 기존 흐름 요약, 수행방법과의 연결 지점, 시간적 위치에 따른 보완 방향, 수정된 상담내용, 향후 지원계획 및 수퍼비전 보완 내용을 포함하도록 했다.
  - 충분한 입력이 있으면 상담일지별 5~10문장 이상으로 실무 기록 수준의 결과를 작성하도록 지시했다.
- UI 문구:
  - 기준 문서 입력 안내를 계획 수립일, 목표, 수행방법 중심으로 조정했다.
  - 점검 대상 안내에 상담일지, 현장지원일지, 이용자상담, 보호자상담 기록을 포함했다.
  - 버튼 문구를 수행방법 반영 점검으로 조정했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - 새 IndexedDB store 생성
  - 기존 `caseDocuments` 저장 흐름
  - 고용지원 문서 작성, 저장, 복사, 현재 내용 기반 보완 기능
  - API 과사용 방지 로직
  - 모델 설정 및 API 키 저장/복호화 흐름

## 28. 직업재활계획서 양식 미리보기 및 로컬 출력

- 양식 구조:
  - 첨부 DOCX의 26행 표 구조를 기준으로 제목, 팀장/부서장/국장 결재란, 이용자 기본정보, 8개 배경정보 항목, 당사자 및 보호자 의견, 사례회의, 강점, 고려사항, 결과 및 지원방향, 비고, 직업목표, 목표표, 작성정보를 HTML/CSS A4 양식으로 구성했다.
  - 화면 편집 UI와 실제 출력 문서 스타일을 분리했다.
- 데이터 매핑:
  - 별도 `RehabPlanFormData` 타입과 화면 state를 사용하며 새 IndexedDB store를 만들지 않았다.
  - 선택 이용자의 성명, 장애유형/중경증, 희망직종·지역·임금·근무시간을 우선 반영한다.
  - 이용자 메모와 직업재활계획서/사례회의록의 식별 가능한 제목을 기준으로 기본정보, 배경정보, 사례회의, 강점, 고려사항, 지원방향, 직업목표와 목표 행을 매핑한다.
  - 자동 매핑이 불완전해도 빈칸을 `추가 입력 필요`로 표시하고 사용자가 모든 값을 직접 수정할 수 있다.
  - 목표 행은 최소 1개를 유지하고 추가·삭제, 목표달성여부 예/아니오/미확인을 지원한다.
- PDF 출력:
  - 현재 미리보기 DOM을 인라인 스타일과 함께 격리된 로컬 인쇄 문서로 복제한다.
  - 브라우저/Electron 인쇄 창에서 `PDF로 저장`을 선택하는 방식이며 외부 출력 API를 호출하지 않는다.
- PNG 출력:
  - 현재 미리보기 전체를 SVG `foreignObject`와 Canvas로 렌더링해 한 장의 PNG로 저장한다.
  - 브라우저의 최대 캔버스 크기와 픽셀 수를 넘지 않도록 해상도를 제한하고, 한계를 넘는 문서는 오류로 안내한다.
- 개인정보 보호:
  - PDF/PNG 생성 과정은 로컬 브라우저/Electron 안에서만 수행한다.
  - 기본 파일명은 이용자명 없이 `직업재활계획서_YYYY-MM-DD` 형식을 사용한다.
  - 출력 전 개인정보와 민감 상담 내용 공유 주의 문구를 표시한다.
- 최소 오류 보정:
  - 정기평가 호출이 `PromptType`과 프롬프트 맵에서 누락된 오류를 보정했다.
  - 사례관리 단계 생성 타입, 기존 문서 저장 콜백, 비활성 단계 활성화, 직무분석 참고자료 props 연결을 보정했다.
  - 예산 OCR 결과의 수량/단가 타입과 IndexedDB 업데이트 제네릭 제약을 실제 사용 구조에 맞췄다.
- 변경하지 않은 것:
  - `DB_VERSION`과 IndexedDB store 목록
  - 기존 데이터 삭제/초기화
  - `caseDocuments`, `trainingState`, `expenses`, `budgetProjects`, settings 저장 흐름
  - Gemini API 키 저장/복호화와 API 과사용 방지 guard
  - 고용지원, 직업훈련, 직업평가, 예산관리, 업무지원도구 메뉴 및 라우트
- 의존성:
  - 새 런타임 dependency를 추가하지 않았다.

## 29. 2026-08-12 백업·Gemini·Electron 최소 안정화

- 백업/복원:
  - 복원 JSON의 루트, 스토어별 배열, 레코드 객체, ID와 중복 ID를 전체 검증한 뒤에만 데이터를 변경한다.
  - 대상 스토어를 메모리에 먼저 보관하고, 복원 도중 실패하면 각 스토어와 `budgetProjects`를 원상 복구한다.
  - 백업에 포함된 API 키·토큰·비밀번호·인증정보는 적용하지 않고 현재 기기의 설정을 유지한다.
- Gemini:
  - 지원 텍스트 모델을 Gemini 3.1 Flash-Lite, Gemini 3 Flash Preview, Gemini 3.1 Pro Preview로 정리했다.
  - 지원되는 Preview 선택값은 그대로 유지하고, 구형·지원 제외 모델만 Flash-Lite로 보정한다.
  - 503/high demand는 일시적 혼잡 메시지로 구분하며 자동 재시도와 자동 모델 변경은 하지 않는다.
- 문서/예산 연결:
  - 직업재활계획서 양식 미리보기는 기존 WorkMate 결과와 연결된 상태를 유지한다.
  - 이용자 객체의 생년월일·주소·연락처 선택 필드를 메모 라벨보다 우선 매핑한다.
  - 작성내용 점검은 기존 고용지원 탭과 수행방법 중심 점검 프롬프트를 유지한다.
  - 세부 예산 항목의 기존 `memo` 선택 필드를 입력 UI에 연결했다.
- Electron/개인정보:
  - 새 창 외부 URL은 HTTP/HTTPS만 기본 브라우저에 전달하고 위험 프로토콜은 차단한다.
  - Windows 제거 시 앱 데이터를 자동 삭제하지 않도록 설정했다.
  - 관련 Gemini/OCR 오류 로그에서 프롬프트·키·인증 URL이 남지 않도록 최소 메타데이터만 기록한다.
- 보존 범위:
  - 메뉴·라우트·화면 구조를 재설계하지 않았다.
  - `DB_VERSION`, IndexedDB store, 기존 데이터와 `caseDocuments`·`trainingState`·`budgetProjects` 저장 구조를 변경하지 않았다.
  - API 키 암호화/복호화와 API 과사용 방지 guard를 변경하지 않았다.
