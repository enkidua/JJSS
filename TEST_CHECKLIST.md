# JJSS 최종 수동 테스트 체크리스트

> 기존 IndexedDB 데이터는 삭제하지 않는다. 실제 개인정보/API 키가 포함된 백업 파일과 화면 캡처는 외부 공유하지 않는다.

| # | 테스트 항목 | 실행 방법 | 정상 결과 | 실패 시 확인할 파일/함수 |
|---|---|---|---|---|
| 1 | 앱 실행 | `npm run dev` 실행 후 브라우저에서 로컬 주소 접속 | 메인 화면과 Navbar가 정상 표시된다. | `src/App.tsx`, `src/components/Navbar.tsx` |
| 1-1 | 홈 카드 클릭 | 홈 화면 주요 기능 카드 7개를 각각 클릭 | `/manage`, `/evaluation`, `/training`, `/workmate`, `/budget`, `/tools`, `/infomate` 실제 화면으로 이동한다. | `src/pages/Home.tsx`, `src/App.tsx` |
| 2 | API 키 저장 | 설정 화면에서 Gemini 또는 Vision API 키 입력 후 저장 | 저장 완료 안내가 표시된다. | `src/pages/Settings.tsx`, `src/store/settingsStore.ts` |
| 3 | 앱 재시작 후 API 키 유지 확인 | 앱 종료 후 다시 실행하고 설정 화면 확인 | API 키가 복호화되어 사용 가능한 상태다. | `src/store/settingsStore.ts`, `src/config/crypto.ts` |
| 4 | 이용자 등록 | 이용자 및 사업체 관리에서 이용자 추가 | 저장 후 목록에 즉시 보인다. | `src/pages/UserManagement.tsx`, `addSeeker` |
| 4-1 | 이용자 등록 후 수정 | 이용자 목록의 수정 버튼 클릭 → 기존 정보가 채워진 수정 모달에서 내용 변경 → 변경사항 저장 | 같은 이용자 `id/seekerId`가 유지된 채 목록에 수정 내용이 즉시 반영된다. | `src/pages/UserManagement.tsx`, `JobSeekerModal`, `updateSeeker` |
| 4-2 | 이용자 수정 후 앱 재시작 유지 | 이용자 수정 후 앱 재시작 | 수정한 이름, 장애유형, 희망직무, 비고 등이 유지된다. | `src/store/dataStore.ts`, `localDB.updateDoc('seekers')` |
| 4-3 | 이용자 수정 취소 | 이용자 수정 모달에서 값을 바꾼 뒤 수정 취소 | 기존 이용자 정보가 변경되지 않는다. | `src/components/JobSeekerModal.tsx` |
| 5 | 사업체 등록 | 이용자 및 사업체 관리에서 사업체/구인 정보 추가 | 저장 후 목록에 즉시 보인다. | `src/pages/UserManagement.tsx`, `addJob` |
| 5-1 | 사업체/구인 등록 후 수정 | 사업체 목록의 수정 버튼 클릭 → 기존 정보가 채워진 수정 모달에서 내용 변경 → 변경사항 저장 | 같은 job `id`가 유지된 채 회사명, 직무, 근무지, 급여 등이 즉시 반영된다. | `src/pages/UserManagement.tsx`, `JobSeekerModal`, `updateJob` |
| 5-2 | 사업체/구인 수정 후 앱 재시작 유지 | 사업체/구인 수정 후 앱 재시작 | 수정한 사업체/구인 정보가 유지된다. | `src/store/dataStore.ts`, `localDB.updateDoc('jobs')` |
| 5-3 | 사업체/구인 수정 취소 | 사업체 수정 모달에서 값을 바꾼 뒤 수정 취소 | 기존 사업체/구인 정보가 변경되지 않는다. | `src/components/JobSeekerModal.tsx` |
| 6 | 앱 재시작 후 이용자/사업체 유지 확인 | 앱 재시작 후 관리 화면 재확인 | 등록한 이용자/사업체가 유지된다. | `src/config/localDB.ts`, `fetchData` |
| 6-1 | 수정 후 고용지원 매칭 표시 | 사업체/구인 또는 이용자 수정 후 고용지원 → AI 정밀 매칭 확인 | 수정된 이름/회사명/직무/근무지가 매칭 화면에 표시된다. 기존 `id` 기반 연결은 유지된다. | `src/components/MatchingView.tsx`, `src/store/dataStore.ts` |
| 7 | 직업평가 탭 전환 | 직업평가에서 `결과분석기`, `종합 소견서`, `저장 문서/이력` 탭을 차례로 클릭 | 각 탭이 열리고 작성 중인 결과가 불필요하게 사라지지 않는다. | `src/pages/VocationalEvaluation.tsx` |
| 8 | 직업평가 PDF 업로드 분석 | 직업평가 → 결과분석기 → `PDF/이미지 업로드` 영역에서 PDF 업로드 후 분석 실행 | 분석 결과가 표시되고 무한 로딩이 없다. 실패해도 기존 결과는 보존된다. | `src/pages/VocationalEvaluation.tsx`, `analyzeTestResults` |
| 8-1 | 직업평가 결과 분량 확인 | PDF/이미지/텍스트 중 하나로 결과분석 실행 후 결과 본문 확인 | 평가자료 개요, 주요 수행 특성, 강점, 어려움, 직무수행 가능성, 고려사항, 후속 지원계획이 충분한 분량으로 작성된다. | `src/services/gemini.ts`, `analyzeTestResults` |
| 9 | 직업평가 이미지 업로드 분석 | 직업평가 → 결과분석기에서 JPG/PNG 업로드 후 분석 실행 | 이미지 기반 분석 결과가 표시된다. | `src/pages/VocationalEvaluation.tsx`, `analyzeImageFile` |
| 10 | 직업평가 텍스트 입력 분석 | 파일 없이 `검사 결과 또는 관찰 메모 직접 입력`에 텍스트 입력 후 분석 실행 | 텍스트만으로 분석된다. | `src/pages/VocationalEvaluation.tsx`, `analyzeTestResults` |
| 11 | 직업평가 종합소견서 생성 | 직업평가 → 종합소견서 탭에서 참고 내용 입력 후 소견서 생성 | 종합소견서 결과가 표시되고 복사/다운로드/저장/초기화 버튼이 실제 동작한다. | `src/pages/VocationalEvaluation.tsx`, `generateReport` |
| 12 | 직업평가 저장 문서/이력 | 직업평가 결과 또는 종합소견서를 저장한 뒤 `저장 문서/이력` 탭에서 다시 열기 | 저장한 문서가 목록에 보이고, 선택하면 편집 영역으로 불러와진다. | `src/pages/VocationalEvaluation.tsx`, `jjss:vocational-evaluation-history` |
| 13 | 생성된 문서 수정 및 이력 저장 | 직업평가 결과 textarea 내용을 직접 수정한 뒤 저장 → 저장 문서/이력 탭 확인 | 수정 내용이 유지되고 저장 문서/이력에서 다시 불러올 수 있다. | `src/pages/VocationalEvaluation.tsx` |
| 14 | 현재 내용 기반 재생성 | 생성 결과를 수정한 뒤 현재 내용 기반 보완 실행 | 수정 의도를 반영한 보완본이 생성된다. | `src/services/documentRegenerationService.ts` |
| 15 | 재생성 실패 시 기존 내용 보존 확인 | API 키를 비우거나 네트워크 실패 상황에서 보완 실행 | 오류 안내가 뜨고 기존 내용은 사라지지 않는다. | `src/pages/WorkMate.tsx`, `src/pages/WorkTraining.tsx`, `src/pages/VocationalEvaluation.tsx` |
| 16 | 고용지원 5개 탭 접근 | 고용지원 화면에서 `사례관리 문서 연속작성`, `AI 정밀 매칭`, `면접일지 작성`, `직무분석지 작성`, `작성 내용 점검` 탭을 차례로 클릭 | 각 탭이 열리고 인포메이트/인트라넷/커뮤니티 메뉴는 보이지 않는다. | `src/pages/WorkMate.tsx` |
| 16-1 | 메뉴명 확인 | Navbar와 홈 카드에서 고용지원 메뉴 확인 | 메뉴명과 홈 카드 제목이 `고용지원`으로 간단히 표시되고 route는 `/workmate`를 유지한다. | `src/components/Navbar.tsx`, `src/pages/Home.tsx` |
| 17 | 사례관리 문서 연속작성 | 고용지원 → 사례관리 문서 연속작성에서 문서 종류를 바꿔 새 초안/보완/저장 실행 | 사례회의록, 직업재활계획서, 상담일지, 정기평가가 기존 `caseDocuments` 흐름으로 저장된다. | `src/pages/WorkMate.tsx`, `addCaseDocument` |
| 18 | 고용지원 AI 매칭 | 고용지원 → AI 정밀 매칭에서 구인처 선택 | 후보자 매칭 결과가 표시된다. | `src/components/MatchingView.tsx`, `src/services/matching.ts` |
| 19 | AI Recommendation & Profile 표시 확인 | 매칭 결과 카드를 펼침 | 추천 요약, 사유, 강점, 우려, 지원계획, 등급이 보인다. | `src/components/MatchingView.tsx` |
| 20 | 매칭 의견 저장 후 다시 열기 | 매칭 의견 수정 → 저장 → 다른 화면 이동 후 다시 같은 공고 열기 | DB 저장본이 다시 표시된다. | `saveMatchingOpinion`, `fetchCaseDocuments` |
| 21 | 면접일지 저장 | 고용지원 → 면접일지 작성 → 이용자 선택 → 면접 정보 입력 → 새 초안 생성 → 저장 | `caseDocuments`에 면접일지가 저장되고 다시 같은 이용자를 선택하면 불러온다. | `src/pages/WorkMate.tsx`, `addCaseDocument`, `updateCaseDocument` |
| 22 | 직무분석지 저장 | 고용지원 → 직무분석지 작성 → 이용자 선택 → 직무 정보 입력 → 새 초안 생성 → 저장 | `caseDocuments`에 직무분석지가 저장되고 다시 같은 이용자를 선택하면 불러온다. | `src/pages/WorkMate.tsx`, `addCaseDocument`, `updateCaseDocument` |
| 23 | 작성 내용 점검 | 고용지원 → 작성 내용 점검에서 기준 문서와 상담일지 입력 후 점검 실행 | 원문을 자동 덮어쓰지 않고 점검/수정 제안이 표시된다. | `src/components/DocumentReviewTab.tsx` |
| 23-1 | 기존 문서 보기 카드 가독성 | 고용지원 → 사례관리 문서 연속작성 또는 이용자 사례 이력에서 상담일지/정기평가/취업 후 적응지원 문서 카드를 펼침 | 문서 본문 영역이 충분히 크게 보이고, 최소 8~12줄 이상을 한 번에 확인할 수 있다. | `src/components/CaseHistoryPanel.tsx`, `src/pages/WorkMate.tsx` |
| 23-2 | 긴 문서 내부 스크롤 | 긴 상담일지/정기평가 카드의 본문을 스크롤 | 카드 전체가 과도하게 깨지지 않고 본문 영역 내부 스크롤로 긴 내용을 읽을 수 있다. | `src/components/CaseHistoryPanel.tsx`, `FollowUpStage` |
| 23-3 | 기존 문서 저장/복사/삭제 유지 | 기존 문서 카드에서 저장, 복사, 삭제 버튼을 각각 실행 | 저장/복사/삭제 기능이 기존처럼 동작하고 문서 내용 표시 개선 때문에 기능이 깨지지 않는다. | `src/components/CaseHistoryPanel.tsx`, `src/pages/WorkMate.tsx` |
| 24 | 미구현 버튼 노출 확인 | 매칭 결과와 고용지원 화면 전체 확인 | `이력서 보기`, `파일 생성` 같은 죽은 버튼이 없다. | `src/components/MatchingView.tsx`, `src/pages/WorkMate.tsx` |
| 25 | 직업훈련 메뉴 접근 | Navbar에서 직업훈련 클릭 | 직업훈련 화면이 열리고 탭이 `훈련실관리`, `출석관리`, `훈련상황/진도`, `계획 및 일지 작성 및 공유` 순서로 보인다. | `src/App.tsx`, `src/components/Navbar.tsx`, `src/pages/WorkTraining.tsx` |
| 26 | 직업훈련 탭 전환 | 직업훈련의 4개 탭을 차례로 클릭 | 각 탭이 정상 표시되고 선택한 훈련생/훈련실 상태가 불필요하게 초기화되지 않는다. | `src/pages/WorkTraining.tsx` |
| 27 | 훈련실 생성 | 직업훈련 → 훈련실관리에서 훈련실 생성 | 새 훈련실이 목록과 선택값에 반영된다. | `src/pages/WorkTraining.tsx` |
| 28 | 훈련생 배정 | 등록 이용자 검색 후 훈련실 명단에 추가 | 이용자가 훈련실 명단에 표시되고 사진/생년월일/약력 표시 영역이 보인다. | `src/pages/WorkTraining.tsx` |
| 29 | 출석 기록 | 직업훈련 → 출석관리에서 날짜별 출석 상태 선택 | 출석/지각/조퇴/결석 상태가 색상과 라벨로 명확히 표시되고 유지된다. | `src/pages/WorkTraining.tsx`, `trainingState` |
| 29-1 | 출석 버튼 클릭 동작 | 출석관리에서 같은 훈련생의 출석/지각/조퇴/결석 버튼을 차례로 클릭 | 클릭 즉시 선택 상태와 상단 집계가 바뀌고 앱 재시작 후에도 유지된다. | `src/pages/WorkTraining.tsx`, `setAttendanceBook` |
| 30 | 훈련상황/진도 확인 | 직업훈련 → 훈련상황/진도에서 선택 훈련생의 진행 정보 확인 | 출석률, 상담 건수, 진도 정보가 선택 훈련생 기준으로 표시된다. | `src/pages/WorkTraining.tsx`, `trainingState` |
| 30-1 | 훈련 탭 전환 후 화면 출력 | `계획 및 일지 작성 및 공유` 탭을 열었다가 훈련실관리/출석관리/진도 탭으로 돌아가기 | 빈 화면이 나오지 않고 각 탭의 기본 화면 또는 안내 UI가 표시된다. | `src/pages/WorkTraining.tsx` |
| 31 | 훈련계획/상담일지/평가서/공유요약 생성 | 계획 및 일지 작성 및 공유에서 새 초안 생성, 현재 내용 기반 보완, 저장, 복사, 초기화 실행 | 문서가 생성되고 수정/보완 가능하며 실패 시 기존 내용이 유지된다. | `src/pages/WorkTraining.tsx`, `generateText` |
| 32 | 업무지원도구 4개 카테고리 접근 | 업무 지원 도구에서 `핵심 문서 작성`, `문서 분석 및 보안`, `홍보 및 시각화`, `기획 및 위기대응` 섹션 확인 | 실제 작동하는 도구 카드만 카테고리별로 표시된다. | `src/pages/AITools.tsx` |
| 32-1 | 불필요한 실패 안내 문구 제거 | 업무지원도구 카드와 주요 AI 작성 화면 확인 | 상시 노출되는 `실패 시: 실패해도 입력 내용은 유지됩니다`류 문구가 보이지 않는다. 실제 실패 시에만 오류 안내가 표시된다. | `src/pages/AITools.tsx` |
| 32-2 | 각 카테고리 카드 클릭 | 업무지원도구 내부 카드 전체를 하나씩 클릭 후 도구 목록으로 돌아가기 | 모든 노출 카드가 실제 도구 화면 또는 실행 폼으로 이동하고 빈 화면이 나오지 않는다. | `src/pages/AITools.tsx` |
| 32-3 | 공문서 작성 | 공문서 작성 카드 → 목적/주요 내용 입력 → AI 실행 | 공문서 형식의 결과가 표시되고 입력값은 유지된다. API 키가 없으면 설정 안내가 표시된다. | `runTool`, `generateText('official_doc')` |
| 32-4 | 회의록 작성 | 회의 녹취록 전문 분석 → 녹취록 입력 → AI 회의록 생성 | 회의 개요, 주요 논의, 결정사항, 후속조치가 포함된 결과가 표시된다. | `src/components/MinutesView.tsx`, `generateText('minutes')` |
| 32-5 | 문장 개선기 | 문장 개선기 → 문장 입력 → AI 실행 | 원문의 의미를 유지한 개선 결과와 변경 요약이 표시된다. | `generateText('style_refiner')` |
| 32-6 | 쉬운 글 변환기 | 쉬운 글 변환기 → 안내문 입력 → AI 실행 | 쉬운 단어와 짧은 문장 중심의 변환 결과가 표시된다. | `generateText('easy_read')` |
| 32-7 | 보도자료/블로그/이름 생성 | 각 카드에서 필수 내용을 입력하고 AI 실행 | 결과가 화면에 표시되고 복사 버튼이 동작한다. | `generateText('press_release')`, `generateText('blog')`, `generateText('namer')` |
| 33 | 문서 OCR | 업무 지원 도구 → 문서 분석 및 보안 → 문서/이미지 OCR 변환 실행 | 텍스트 추출 결과가 표시되고 예산 지출로 자동 저장되지 않는다. | `src/components/OCRView.tsx`, `performOCR` |
| 33-1 | 문서 OCR API 키 없음 안내 | Vision/Gemini 키가 없는 상태에서 OCR 실행 | 설정에서 Vision API 키 또는 Gemini API 키를 입력하라는 안내가 표시되고 무한 로딩이 없다. | `performOCR`, `src/components/OCRView.tsx` |
| 33-2 | AI 문서 질의응답 | 문서 업로드 후 질문 입력 → 전송 | 문서 근거가 포함된 답변이 표시된다. 질문 또는 문서가 없으면 안내가 표시된다. | `src/components/DocumentChatView.tsx`, `generateText('summary')` |
| 34 | 개인정보 비식별화 | 업무 지원 도구 → 문서 분석 및 보안 → 개인정보 비식별화 실행 | 원문은 유지되고 비식별화 결과가 별도로 표시된다. | `src/components/MaskingView.tsx` |
| 34-1 | 개인정보 비식별화 fallback | Gemini 오류 또는 키 문제 상황에서 비식별화 실행 | 로컬 규칙 기반 마스킹 결과가 표시되고 원문은 덮어쓰지 않는다. | `src/components/MaskingView.tsx`, `anonymizeText` |
| 34-2 | 만능 텍스트 유틸리티 | 글자수 세기, JSON 포맷터, 개인정보 마스킹 등 주요 유틸 실행 | API 키 없이 결과가 표시되고 원문은 자동 덮어쓰기 되지 않는다. | `src/components/UtilitiesView.tsx` |
| 35 | 홍보물 이미지 생성 | 업무 지원 도구 → 홍보 및 시각화 → AI 포스터/홍보물 생성 실행 | 성공 시 이미지 표시, 실패 시 권한/quota/대체 안내 표시 | `src/components/PromoDesignView.tsx`, `generateImage` |
| 36 | 나노바나나 일정표 생성 | 업무 지원 도구 → 홍보 및 시각화 → 나노바나나 디자인 스케줄러 실행 | 성공 시 일정표 이미지가 표시되거나 권한 오류가 안내된다. | `src/components/ScheduleDesignView.tsx`, `generateImage` |
| 36-1 | 데이터 대시보드 자동 생성 | 업무지원도구 → 데이터 대시보드 자동 생성 → CSV/JSON 파일 불러오기 또는 위젯 수정 | 파일의 행 수/숫자 합계/평균 지표가 위젯에 반영되고 리포트 복사가 동작한다. | `src/components/DashboardView.tsx` |
| 37 | 위기대응 시뮬레이터 접근 | 업무 지원 도구 → 위기대응 시뮬레이터 클릭 | 시뮬레이터 화면이 열린다. | `src/pages/AITools.tsx`, `src/pages/CrisisManual.tsx` |
| 38 | 위기상황 직접 입력 후 안내 생성 | 직접 입력 영역에 상황 입력 후 대응 흐름 생성 | 6개 항목의 대응 안내가 표시된다. | `src/pages/CrisisManual.tsx`, `generateText` |
| 39 | 위기대응 AI 실패 시 기본 템플릿 표시 | API 실패 조건에서 대응 흐름 생성 | 기본 대응 템플릿이 표시된다. | `src/pages/CrisisManual.tsx` |
| 39-1 | 업무도구 실패 시 입력 내용 보존 | API 키 없음/권한 오류 조건에서 각 AI 도구 실행 | 오류 안내가 표시되고 입력 중인 문서/메모/프롬프트는 유지된다. | `src/pages/AITools.tsx`, 각 도구 컴포넌트 |
| 40 | 예산 지출 등록 | 예산 관리 → 지출 등록에서 필수값 입력 후 저장 | 지출 목록에 즉시 추가된다. | `src/pages/BudgetManagement.tsx`, `addExpense` |
| 40-1 | 사업별 예산 등록/잔액 확인 | 예산 관리에서 사업명, 총예산, 기간을 입력해 사업 등록 | 사업 카드가 생성되고 연결 지출 합계와 현재 잔액이 표시된다. | `src/pages/BudgetManagement.tsx`, `jjss:budget-projects` |
| 40-2 | 사업별 지출 필터 | 사업 필터에서 특정 사업 또는 사업 미지정을 선택 | 해당 사업에 연결된 지출만 보이고 기존 사업 없는 지출은 사업 미지정으로 표시된다. | `src/pages/BudgetManagement.tsx` |
| 41 | 영수증 OCR 실행 | 지출 등록 모달에서 JPG/PNG/PDF 선택 후 OCR 실행 | OCR 결과가 입력칸에 반영되고 저장은 되지 않는다. | `handleRunOCR`, `performOCR` |
| 41-1 | OCR 후 사업 선택값 유지 | 지출 등록 모달에서 사업을 선택한 뒤 OCR 실행 | OCR 결과가 다른 입력칸에 반영되어도 선택한 사업은 유지된다. | `applyOCRToForm`, `form.projectId` |
| 42 | OCR 결과가 입력칸에만 반영되는지 확인 | OCR 실행 후 모달을 닫거나 저장 전 목록 확인 | 목록에 자동 추가되지 않는다. | `applyOCRToForm`, `handleSubmit` |
| 43 | OCR 결과 수정 후 지출 저장 | OCR 반영값을 수정한 뒤 지출 등록 클릭 | 수정된 값으로 지출이 저장된다. | `src/pages/BudgetManagement.tsx`, `addExpense` |
| 44 | 지출 목록 유지 확인 | 앱 재시작 후 예산 관리 화면 확인 | 지출 목록이 유지된다. | `src/config/localDB.ts`, `fetchExpenses` |
| 45 | 지출품의서 인쇄/PDF 저장 | 지출 항목 선택 → 지출품의서 → 미리보기 → 인쇄/저장 | 인쇄/PDF 저장 창이 준비된다. | `src/components/ExpenseDocument.tsx` |
| 46 | 앱 재시작 후 주요 데이터 유지 확인 | 앱 재시작 후 이용자, 사업체, 지출, 훈련, 문서 확인 | 주요 데이터가 유지된다. | `src/config/localDB.ts`, `src/store/dataStore.ts` |
| 47 | 데이터 백업 파일 생성 | 설정 → 데이터 백업 실행 | JSON 백업 파일이 생성되고 `trainingState`가 포함된다. | `src/config/localDB.ts`, `exportAllData` |
| 48 | 백업 파일에 API 키 제외 확인 | 백업 JSON을 텍스트로 열어 API 키 필드 확인 | `apiKey`, `apiKeyEncrypted`, `visionApiKey` 값이 비어 있다. | `src/config/localDB.ts`, `exportAllData` |
| 49 | 정보수집 메뉴 접근 및 저장 | Navbar 또는 홈 카드에서 자료수집 이동 → 새 리소스 추가 후 검색 | 자료가 `resources`에 저장되고 카테고리/검색에서 다시 확인된다. | `src/pages/InfoMate.tsx`, `src/config/localDB.ts` |
| 50 | 같은 이용자의 최근 직업훈련·고용지원 기록 참고자료 불러오기 | 고용지원 또는 직업훈련 화면에서 이용자를 선택하고 `최근 기록 참고` 클릭 | 같은 이용자의 최근 직업훈련·고용지원 기록 요약이 화면에 표시되고 원본 문서는 수정되지 않는다. 직업평가 이력은 포함되지 않는다. | `src/services/clientContextService.ts` |
| 51 | 참고자료가 없는 이용자 안내 | 기록이 없는 이용자를 선택하고 `최근 기록 참고` 클릭 | `불러올 최근 직업훈련·고용지원 기록이 없습니다` 안내가 표시되고 작성 중인 내용은 유지된다. | `buildClientContextSummary` |
| 52 | 참고자료 포함 문서 생성 | 참고자료가 표시된 상태에서 문서 생성 또는 현재 내용 기반 보완 실행 | AI 프롬프트에 참고자료가 포함되어 결과가 생성되며 최종 저장은 사용자가 저장 버튼을 눌렀을 때만 된다. | `withClientContextPrompt`, `documentRegenerationService.ts` |
| 53 | 참고자료 제외 후 문서 생성 | 참고자료 표시 후 `참고자료 제외` 클릭 → 문서 생성 | 참고자료 없이 기존 입력/현재 내용 기준으로 생성된다. | `src/pages/WorkMate.tsx`, `src/pages/WorkTraining.tsx`, `src/pages/VocationalEvaluation.tsx` |
| 54 | 참고자료 생성 실패 시 현재 내용 보존 | DB 접근 실패나 브라우저 저장소 오류 상황에서 참고자료 불러오기 시도 | 오류 안내가 표시되고 현재 textarea/form 내용은 사라지지 않는다. | `src/services/clientContextService.ts` |
| 55 | 동명이인/식별자 불명확 기록 혼합 방지 | 이름이 같은 이용자를 등록한 뒤 각 이용자에서 최근 기록 참고 실행 | id/seekerId로 연결된 기록만 표시되고 이름만 같은 다른 이용자 기록은 섞이지 않는다. | `sameSeeker`, `buildClientContextSummary` |
| 56 | 원본 문서 자동 수정 금지 | 참고자료 포함 생성 후 기존 caseDocuments/trainingState/localStorage 원본을 다시 확인 | 원본 문서는 자동 수정되지 않고, 생성된 최종 문서만 사용자가 저장할 때 기존 저장 흐름에 저장된다. 직업평가 localStorage 이력은 참고자료 매칭 대상이 아니다. | `src/services/clientContextService.ts`, `src/store/dataStore.ts` |
| 57 | 직업훈련 훈련계획 현재 내용 기반 보완 | 직업훈련 → 계획 및 일지 작성 및 공유 → 훈련계획 생성 후 내용을 수정하고 `현재 내용 기반 보완` 실행 | 수정한 표현과 의도를 유지한 보완본이 표시되고 기존 trainingState 흐름으로 유지된다. | `src/pages/WorkTraining.tsx`, `buildCurrentContentRegenerationPrompt` |
| 58 | 직업훈련 상담일지 현재 내용 기반 보완 | 훈련 상담일지 생성 결과를 수정한 뒤 `현재 내용 기반 보완` 실행 | 현재 작성칸 내용이 우선 반영되고 실패해도 기존 상담일지는 유지된다. | `TrainingTimelineStage`, `generateCounseling` |
| 59 | 직업훈련 정기평가 현재 내용 기반 보완 | 정기평가 작성 탭에서 평가서를 생성/수정한 뒤 `현재 내용 기반 보완` 실행 | 누적 상담/훈련계획과 현재 평가서 수정 내용을 함께 반영한다. | `TrainingTimelineStage`, `generateEvaluation` |
| 60 | 직업훈련 성과 공유관리 현재 내용 기반 보완 | 성과·공유관리의 체크리스트, 현장훈련 기록, 공유용 요약 각각에서 작성 후 보완 실행 | 각 문서 내용이 서로 덮어쓰이지 않고 해당 카드만 보완된다. | `InsightResult`, `generateInsight` |
| 61 | 새 체크리스트 초안 생성 및 보완 | 체크리스트 카드가 비어 있을 때 새 초안 생성 → 내용 수정 → 현재 내용 기반 보완 | 새 초안과 보완 버튼이 명확히 보이고 작성 내용은 보존된다. | `src/pages/WorkTraining.tsx` |
| 62 | 예산 신규 사업 총예산 콤마 표시 | 예산 관리 → 사업 등록/관리에서 총예산에 `1000000` 입력 | 입력칸에는 `1,000,000`처럼 표시되고 저장 후 잔액 계산이 정확하다. | `src/pages/BudgetManagement.tsx`, `parseCurrencyInput` |
| 63 | 개인정보 비식별화 기능 점검 | 업무지원도구 → 개인정보 비식별화에 이름, 전화번호, 주민번호, 주소, 이메일이 포함된 텍스트 입력 | 원문은 유지되고 결과 영역에 마스킹 결과가 별도로 표시된다. AI 실패 시 로컬 마스킹이 적용된다. | `src/components/MaskingView.tsx`, `src/utils/anonymizer.ts` |
| 64 | 문장개선기 기존 문체 유지 | 공공기관 문서체/구어체/음슴체 예문을 각각 문장개선기에 입력 | 의미와 어조를 유지하고 입력 문체에 맞는 개선문, 주요 수정 사항, 대체 표현이 표시된다. | `src/services/gemini.ts`, `STYLE_REFINER_PROMPT` |
| 65 | 문장개선기 문법/맞춤법/띄어쓰기 개선 | 맞춤법과 띄어쓰기 오류가 있는 문단을 입력 | 문법, 맞춤법, 띄어쓰기, 문장 흐름 개선 결과가 표시되고 원문에는 없는 사실을 추가하지 않는다. | `src/pages/AITools.tsx`, `generateText('style_refiner')` |
| 66 | 전문 블로그 SEO 제목 생성 | 전문 블로그 작성에서 주제/키워드/메시지를 입력하고 실행 | `SEO 제목`과 `추천 부제`가 검색성과 신뢰감을 고려해 생성된다. | `src/services/gemini.ts`, `buildBlogPrompt` |
| 67 | 전문 블로그 본문 문장개선 적용 확인 | 전문 블로그 결과 본문 확인 | 문법, 맞춤법, 띄어쓰기, 문장 흐름이 자연스럽고 독자가 이해하기 쉬운 구조로 작성된다. | `buildBlogPrompt` |
| 68 | 전문 블로그 태그 생성 | 전문 블로그 결과 하단 확인 | 검색 가능성을 고려한 추천 태그 5~10개가 표시된다. | `buildBlogPrompt` |
| 69 | 직업평가 저장 문서 수정 | 직업평가 → 저장 문서/이력 → 문서 선택 → 본문 수정 → 저장 | 같은 이력 `id`의 내용이 수정되고 목록/상세 내용에 즉시 반영된다. 앱 재시작 후에도 수정 내용이 유지된다. | `src/pages/VocationalEvaluation.tsx`, `jjss:vocational-evaluation-history` |
| 70 | 직업평가 저장 문서 삭제 | 저장 문서/이력에서 삭제 클릭 → 확인창 승인 | 해당 직업평가 기록만 삭제되고 목록에서 즉시 사라진다. | `src/pages/VocationalEvaluation.tsx` |
| 71 | 직업평가 저장 문서 삭제 취소 | 저장 문서/이력에서 삭제 클릭 → 확인창 취소 | 문서가 삭제되지 않고 기존 내용이 유지된다. | `deleteHistoryDoc` |
| 72 | 직무분석지 사진 여러 장 업로드 | 고용지원 → 직무분석지 작성 → 사업체 사진 여러 장 업로드 | 사진 미리보기와 파일명이 표시되고 개별 제거가 가능하다. 사진 파일 자체는 DB에 저장하지 않는다. | `src/pages/WorkMate.tsx`, `jobAnalysisPhotos` |
| 73 | 직무분석지 텍스트만 입력 후 생성 | 사진 없이 사업체명, 직무명, 간략 특성, 사업주 면담 내용 입력 → 새 초안 생성 | 텍스트 입력만으로 직무분석지가 생성된다. | `buildJobAnalysisPrompt`, `generateEmploymentDoc('jobAnalysis')` |
| 74 | 직무분석지 사진+특성 입력 후 생성 | 사진 업로드와 간략 특성 입력 후 새 초안 생성 | 사진의 작업환경/동선/도구/위험요소와 입력 내용을 함께 참고한 직무분석지가 생성된다. | `fileToBase64`, `generateText('counseling', ..., imageData)` |
| 75 | 직무분석지 저장 | 생성된 직무분석지를 수정 후 저장 | 기존 `caseDocuments` 흐름의 `job_analysis` 타입으로 저장된다. 사진 파일은 저장되지 않는다. | `saveEmploymentDoc('jobAnalysis')`, `addCaseDocument` |
| 76 | 직무분석지 현재 내용 기반 보완 | 생성 결과를 직접 수정한 뒤 현재 내용 기반 보완 실행 | 현재 작성 내용이 우선 반영된 보완본이 생성된다. | `refineEmploymentDoc('jobAnalysis')`, `documentRegenerationService.ts` |
| 77 | 직무분석지 생성 실패 시 입력 내용 유지 | API 오류 또는 이미지 분석 실패 상황에서 생성 실행 | 오류 안내가 표시되고 업로드 사진/입력 텍스트/현재 문서 내용은 유지된다. 텍스트가 있으면 사진 실패 후 텍스트 기반 생성으로 재시도된다. | `generateEmploymentDoc('jobAnalysis')` |
| 78 | 사업체/구인정보 추가 필드 등록 | 이용자 및 사업체 관리 → 사업체 등록 → 단건 직접 입력에서 직무내용, 요구조건, 배려사항, 채용상태, 담당자, 연락처 입력 후 저장 | 신규 사업체/구인정보에 추가 필드가 저장되고 목록 상세에서 확인된다. | `src/components/JobSeekerModal.tsx`, `addJob` |
| 79 | 사업체/구인정보 추가 필드 수정 | 기존 사업체/구인정보의 수정 버튼 클릭 → 추가 필드 수정 후 저장 | 기존 job `id`는 유지되고 추가 필드 값만 갱신된다. | `src/components/JobSeekerModal.tsx`, `updateJob` |
| 80 | 사업체/구인정보 목록 추가 필드 확인 | 사업체 목록에서 항목을 펼침 | 직무내용, 요구조건, 배려사항, 채용상태, 담당자, 연락처가 표시된다. 기존 데이터에 값이 없으면 `-` 또는 확인 필요로 표시된다. | `src/pages/UserManagement.tsx` |
| 81 | 직무분석지 사업체 선택 자동 입력 | 고용지원 → 직무분석지 작성 → 사업체/구인정보 선택 | 회사명, 직무, 근무지역, 근무시간, 급여, 모집조건, 상세 직무정보가 요약 표시되고 생성 프롬프트에 포함된다. | `src/pages/WorkMate.tsx`, `buildSelectedJobContext` |
| 82 | 직무분석지 사진 없이 사업체 정보만 생성 | 사업체/구인정보만 선택하고 직무분석지 생성 클릭 | 선택한 사업체/구인정보만으로 직무분석지 초안이 생성된다. | `generateEmploymentDoc('jobAnalysis')` |
| 83 | 직무분석지 사진+사업체 정보+간략 특성 생성 | 사업체 선택, 사진 여러 장 업로드, 간략 특성 입력 후 생성 | 사업체 정보와 사진 분석, 입력 메모를 함께 반영한 직무분석지가 생성된다. | `buildJobAnalysisPrompt`, `generateText` |
| 84 | 직무분석지 저장 시 사진 파일 미저장 | 사진을 업로드해 직무분석지를 생성 후 저장하고 백업/저장 데이터 확인 | `photoFileNames` 또는 `photoCount` 정도만 저장되고 이미지 파일 자체는 저장되지 않는다. | `saveEmploymentDoc('jobAnalysis')`, `CaseDocument.photoFileNames` |
| 85 | 동일 버튼 연속 클릭 시 중복 API 호출 방지 확인 | AI 문서 생성, 이미지 생성, OCR 실행 버튼을 빠르게 연속 클릭 | 같은 요청은 5초 안에 새 API 호출로 이어지지 않고 안내가 표시된다. | `src/services/gemini.ts`, `src/services/ocr.ts` |
| 86 | 같은 요청 5초 내 반복 안내 표시 | 같은 provider/model/type/입력/파일 조합으로 바로 재실행 | `같은 요청이 이미 처리 중입니다. 잠시 후 다시 시도해 주세요.` 안내가 표시된다. | `beginGuardedRequest`, `beginOcrGuard` |
| 87 | Gemini 오류 3회 반복 시 일시 차단 안내 확인 | 같은 기능에서 Gemini 오류를 3회 연속 유발 | 30초 동안 해당 기능만 차단되고 모델명, API 키, quota 확인 안내가 표시된다. | `recordFeatureFailure`, `recordOcrFailure` |
| 88 | 30초 후 다시 시도 가능 확인 | 반복 오류 차단 후 30초 이상 대기하고 같은 기능 재실행 | 요청이 다시 시도된다. 다른 기능은 차단 중에도 실행 가능하다. | `FAILURE_BLOCK_MS`, `OCR_FAILURE_BLOCK_MS` |
| 89 | 이미지 생성 retry 무한 반복 방지 | 이미지 생성 응답에서 이미지 파트가 없거나 실패하는 상황 확인 | TEXT+IMAGE 실패 후 IMAGE 전용 재시도는 최대 1회만 수행되고 무한 반복되지 않는다. | `generateImage` |
| 90 | 이미지 생성 loading 중 재클릭 방지 | 홍보물/일정표 이미지 생성 중 버튼 재클릭 | 버튼이 비활성화되고 핸들러가 즉시 반환한다. | `PromoDesignView`, `ScheduleDesignView`, `AITools` |
| 91 | OCR 동일 파일 연속 실행 방지 | 같은 파일을 선택한 상태에서 OCR을 빠르게 연속 실행 | 같은 파일명/크기/type/수정시각 조합은 5초 안에 중복 실행되지 않는다. | `performOCR` |
| 92 | Vision 실패 후 Gemini fallback 안내 확인 | Vision API 실패 또는 Vision 키 없음 + Gemini 키 있음 상태에서 이미지 OCR 실행 | 이미지 OCR은 Vision API 먼저, 실패 시 Gemini fallback 1회 구조가 안내되고 실패해도 기존 결과가 유지된다. | `OCRView`, `performOCR` |
| 93 | 문서 질의응답 history 제한 확인 | 문서 채팅에서 5턴 이상 또는 10,000자 이상 대화 후 질문 | 화면 대화는 유지되고 API 전송 history만 최근 5턴/10,000자 이내로 제한된다. | `DocumentChatView` |
| 94 | 설정 화면 비용/쿼터 안내 확인 | 설정 화면 진입 | 텍스트, PDF/이미지 분석, 이미지 생성, Preview 모델, 권장 Gemini 모델 안내가 표시된다. | `src/pages/Settings.tsx` |
| 95 | Gemini 3.1 Flash-Lite Preview 저장값 자동 보정 | 기존 설정 JSON 또는 IndexedDB에 `gemini-3.1-flash-lite-preview`가 저장된 상태로 앱 로딩 | 저장값이 `gemini-3.1-flash-lite`로 보정되고 모델 목록에는 preview 값이 노출되지 않는다. | `src/store/settingsStore.ts` |
| 96 | 신규 설정 기본 Gemini 모델 확인 | 설정 데이터가 없는 신규 환경에서 앱 실행 | Gemini 기본 모델이 `gemini-3.1-flash-lite`로 설정된다. | `DEFAULT_CONFIGS` |
| 97 | 설정 화면 기본 모델 안내 확인 | 설정 화면의 Gemini 모델 선택 목록 확인 | `Gemini 3.1 Flash-Lite(기본)` 안내가 표시된다. | `MODEL_LABELS` |
| 98 | 예산 지출 금액 누락 안내 확인 | 예산 지출 등록에서 품명은 입력하고 금액을 비운 뒤 저장 | 금액 입력 또는 올바른 금액 입력 안내가 표시된다. | `BudgetManagement.handleSubmit` |
| 99 | 예산 지출 품명 누락 안내 확인 | 예산 지출 등록에서 금액은 입력하고 품명을 비운 뒤 저장 | `품명을 입력해 주세요.` 안내가 표시된다. | `BudgetManagement.handleSubmit` |
| 100 | 백업 파일 API 키 제외 유지 확인 | 설정 → 데이터 내보내기 후 JSON 내용 확인 | `apiKey`, `apiKeyEncrypted`, `visionApiKey`, `visionApiKeyEncrypted` 값이 비어 있다. | `exportAllData` |
| 101 | 데이터 불러오기 후 주요 데이터 유지 확인 | 백업 파일 불러오기 후 이용자, 사업체/구인정보, 사례문서, 훈련, 예산 데이터 확인 | 주요 데이터가 복원되고 기존 API 키는 백업 파일의 빈 값으로 덮어써지지 않는다. | `importAllData` |
| 102 | Windows 업데이트 전 백업 안내 확인 | 설정 → 데이터 백업 및 마이그레이션 영역 확인 | Windows 삭제/재설치/업데이트 전 백업 안내가 표시된다. | `src/pages/Settings.tsx` |
| 103 | macOS 업데이트 전 백업 안내 확인 | 설정 → 데이터 백업 및 마이그레이션 영역 확인 | macOS 앱 삭제/dmg 교체 전 백업 안내가 표시된다. | `src/pages/Settings.tsx` |
| 104 | 데이터 저장 위치 안내 확인 | 설정 → 데이터 백업 및 마이그레이션 영역 확인 | PC 앱 저장소 및 브라우저 IndexedDB/localStorage 저장 안내가 표시된다. | `src/pages/Settings.tsx` |
| 105 | 사업 선택 없이 지출 저장 | 예산관리 → 지출 등록에서 사업 미지정 상태로 필수값 입력 후 저장 | 지출이 저장되고 목록의 사업 칸에 `사업 미지정`으로 표시된다. | `src/pages/BudgetManagement.tsx` |
| 106 | 사업 미지정 필터 | 예산관리 → 사업 필터에서 `사업 미지정` 선택 | projectId가 없는 지출만 표시된다. | `selectedProjectId === 'unassigned'` |
| 107 | 사업 미지정 지출 잔액 계산 제외 | 사업 미지정 지출과 특정 사업 지출을 각각 등록 후 사업 카드 확인 | 미지정 지출은 특정 사업 사용액/잔액/사용률에 포함되지 않고 전체 합계에는 포함된다. | `getProjectSpent` |
| 108 | 예산 초과 지출 등록 경고 | 잔액보다 큰 금액으로 특정 사업 지출 등록 | 초과 금액이 포함된 확인창이 표시된다. | `handleSubmit` |
| 109 | 예산 초과 경고 취소 | 초과 경고 확인창에서 취소 클릭 | 지출이 저장되지 않는다. | `window.confirm` |
| 110 | 예산 초과 경고 확인 | 초과 경고 확인창에서 확인 클릭 | 지출이 저장되고 해당 사업 상태가 초과로 표시된다. | `getBudgetStatus` |
| 111 | 사업별 사용률/상태 표시 | 사업 등록 후 지출을 단계별로 추가 | 70% 미만 정상, 70~89% 주의, 90~100% 거의 소진, 100% 초과 초과 상태가 표시된다. | `getBudgetStatus` |
| 112 | 지출 목록 CSV 내보내기 | 필터를 적용한 상태에서 CSV 내보내기 클릭 | 현재 필터링된 지출 목록만 `jjss-budget-expenses-YYYY-MM-DD.csv`로 저장된다. | `handleExportCsv` |
| 113 | CSV 한글 깨짐 방지 | 내보낸 CSV를 Excel에서 열기 | BOM이 포함되어 한글 컬럼/내용이 깨지지 않는다. | `\\uFEFF` |
| 114 | 지출 등록 입력 검증 메시지 | 지출일자, 품명, 금액을 각각 비운 상태로 저장 시도 | 항목별로 `지출일자를 입력해 주세요.`, `품명을 입력해 주세요.`, `올바른 금액을 입력해 주세요.`가 표시된다. 사업 선택은 필수가 아니다. | `handleSubmit` |
| 115 | 예산 필터 순서 확인 | 예산관리 상단 필터 확인 | 검색 → 사업 선택 → 세부 예산 항목 선택 순서로 표시된다. | `src/pages/BudgetManagement.tsx` |
| 116 | 사업 선택 후 세부 항목 필터 | 특정 사업 선택 후 세부 예산 항목 필터 열기 | 해당 사업에 등록된 세부 예산 항목과 항목 미지정만 표시된다. 사업 미지정 선택 시 비활성화된다. | `selectedProjectItems` |
| 117 | 사업 등록 세부 예산 항목 추가/수정/삭제 | 사업 등록/수정 모달에서 세부 예산 항목을 추가, 이름/금액 수정, 삭제 | `budgetItems` 배열로 저장되고 기존 사업 데이터에 항목이 없어도 정상 표시된다. | `BudgetProject.budgetItems` |
| 118 | 세부 항목 합계 경고 | 세부 항목 합계가 총예산을 초과하거나 다르게 입력 후 저장 | 확인창이 표시되고 취소 시 저장되지 않으며 확인 시 저장된다. | `handleSaveProject` |
| 119 | 지출 등록 세부 예산 항목 선택 | 지출 등록에서 사업 선택 후 세부 예산 항목 선택 | 지출에 `budgetItemId`, `budgetItemName`이 선택 필드로 저장된다. 선택하지 않으면 항목 미지정으로 표시된다. | `Expense.budgetItemId` |
| 120 | 항목별 예산/사용액/잔액 표시 | 세부 항목이 있는 사업에 항목별 지출 등록 | 사업 카드에 항목별 예산, 사용액, 잔액, 사용률이 표시된다. | `normalizeBudgetItems`, `getBudgetStatus` |
| 121 | 사업 삭제 시 연결 지출 정리 | 세부 항목 지출이 연결된 사업 삭제 | 연결 지출의 `projectId`, `budgetItemId`, `budgetItemName`이 비워지고 사업 미지정으로 전환된다. | `handleDeleteProject`, `updateExpense` |
| 122 | CSV 세부 예산 항목 포함 | 세부 항목 지출이 있는 상태에서 CSV 내보내기 | CSV에 `세부 예산 항목` 컬럼이 포함된다. | `handleExportCsv` |
| 123 | Gemini 모델 3개 표시 | 설정 화면 Gemini 모델 선택 목록 확인 | Gemini 3.1 Flash-Lite(기본), Gemini 3 Flash Preview, Gemini 3.1 Pro Preview 3개만 표시된다. | `DEFAULT_CONFIGS.availableModels` |
| 124 | 제외 모델 저장값 자동 보정 | 기존 저장 모델이 현재 Gemini 지원 목록 밖인 상태로 앱 로딩 | `gemini-3.1-flash-lite`로 보정되고 제외 모델 변경 안내가 표시된다. | `loadSettings` |
| 125 | 고용지원 문서 생성 guard 분리 | 상담일지 실패 직후 직업재활계획서 생성 시도 | 같은 입력의 빠른 재클릭만 막고 다른 문서 유형 생성은 막지 않는다. | `generateText` options |
| 126 | 직업훈련 문서 생성 guard 분리 | 훈련계획, 상담일지, 정기평가 버튼을 각각 실행 | 기능+문서유형+모델+입력 hash 기준으로 분리되어 서로 과도하게 차단하지 않는다. | `WorkTraining.tsx` |
| 127 | 직업평가 종합소견서 PDF 없이 생성 | 결과분석기 내용을 생성하거나 직접 입력 후 PDF 없이 보고서 작성 | PDF 없이도 종합소견서가 생성되고 기존 입력/결과는 실패 시 유지된다. | `VocationalEvaluation.tsx` |
| 128 | 결과분석기 내용 불러오기 | 종합소견서 탭에서 최근 결과분석 내용 불러오기 클릭 | 최근 결과분석 또는 저장된 분석 문서가 입력칸에 반영된다. | `loadLatestAnalysisToReport` |
| 129 | 중복 차단 시간 완화 | 같은 문서 생성 버튼을 빠르게 두 번 클릭 후 2초 이상 지나 재시도 | 2초 이내 동일 요청만 차단되고 이후 정상 재시도 가능하다. | `DUPLICATE_WINDOW_MS` |
| 130 | 오류 3회 차단 범위 확인 | 같은 문서유형에서만 오류를 3회 발생 | 30초 차단은 해당 기능+문서유형+모델에만 적용된다. | `featureKey` |
| 131 | 기본 Gemini 모델 유지 | 신규 설정 또는 설정 초기화 상태 확인 | 기본 모델이 계속 `gemini-3.1-flash-lite`로 유지된다. | `DEFAULT_CONFIGS` |
| 132 | 503 high demand 안내 | Gemini 3.1 Flash-Lite에서 503/high demand 응답 유발 | 일시적 모델 혼잡 안내와 Gemini 3 Flash Preview 대체 시도 안내가 표시된다. | `normalizeGeminiError` |
| 133 | 503 후 작성 내용 유지 | 문서 생성 중 503 오류 발생 | 작성 중인 textarea 내용과 기존 생성 결과가 사라지지 않는다. | 각 문서 생성 화면 catch/finally |
| 134 | 503 후 loading 해제 | 문서 생성 중 503 오류 발생 후 버튼 상태 확인 | loading 상태가 풀리고 다시 시도할 수 있다. | 각 문서 생성 화면 finally |
| 135 | 503 반복 차단 안내 | 같은 기능+문서유형+모델에서 503 오류 3회 반복 | 30초 후 재시도 또는 Gemini 3 Flash Preview 변경 안내가 표시되고 다른 기능은 막지 않는다. | `HIGH_DEMAND_BLOCK_MESSAGE` |
| 136 | 일반 문서 생성 fetch 1회 원칙 | 문서 생성 버튼 1회 클릭 후 네트워크 호출 확인 | 자동 재시도 없이 일반 문서 생성 요청이 1회만 발생한다. | `generateText`, `callGemini` |
| 137 | 세부 예산 항목 의미 확인 | 사업 등록/수정 영역의 세부 예산 항목 안내와 placeholder 확인 | 항목명 예시가 인건비, 사업비, 회의비, 여비 등 사업 하위 예산 분류로 표시된다. 사업명이 자동 입력되지 않는다. | `BudgetManagement` |
| 138 | 세부 항목 없이 사업 등록 | 사업명, 총예산만 입력하고 세부 항목 없이 저장 | 사업이 저장되고 세부 항목은 빈 배열처럼 처리된다. | `normalizeBudgetItems` |
| 139 | 세부 항목별 잔액 펼침 | 사업 카드에서 세부 항목별 현황 펼치기 클릭 | 항목별 예산, 사용액, 잔액, 사용률이 접기/펼치기로 표시된다. | `expandedProjectIds` |
| 140 | 지출 등록 세부 항목 목록 제한 | 지출 등록에서 특정 사업 선택 후 세부 예산 항목 드롭다운 확인 | 선택한 사업에 등록된 세부 예산 항목만 표시된다. | `form.projectId` |
| 141 | 항목 미지정 사용액 표시 | 사업은 선택하고 세부 항목 없이 지출 저장 | 사업 카드 펼침 영역에 항목 미지정 사용액이 별도로 표시된다. | `!expense.budgetItemId` |
| 142 | PDF 분석 generateContent 1회 확인 | 직업평가 결과분석에서 PDF 1개 업로드 후 분석 버튼 1회 클릭 | files upload는 정상 파일 준비 호출로 발생하고, 분석용 generateContent fetch는 1회만 발생한다. | `analyzeTestResults`, `generateDocumentText` |
| 143 | PDF 분석 중 재클릭 방지 | 직업평가 결과분석 loading 중 분석 버튼 확인 | 버튼이 비활성화되어 같은 분석을 재클릭할 수 없다. | `isAnalyzing` |
| 144 | 작성내용 점검 수행방법 추출 | 직업재활계획서와 상담일지를 입력하고 수행방법 반영 점검 실행 | 계획 수립일, 목표, 수행방법, 핵심 지원 방향을 기준으로 반영 기준 요약이 작성된다. | `DocumentReviewTab` |
| 145 | 상담일지 시간적 위치 구분 | 계획 수립 전/직후/후 상담일지를 함께 입력 | 상담일지를 계획 수립 전, 수립 직후, 수립 후, 유지지원 흐름으로 구분해 점검한다. | `DocumentReviewTab` |
| 146 | 계획 수립 전 표현 안정성 | 계획 수립 전 상담일지 입력 후 결과 확인 | 계획 수립 전 기록에 수행 완료처럼 표현하지 않고 필요성 논의, 어려움 확인 중심으로 보완한다. | `DocumentReviewTab` |
| 147 | 상담일자/장소 유지 | 원문 상담일자와 상담장소가 있는 상담일지 입력 | 수정된 상담일지에서 기존 상담일자와 상담장소가 유지된다. | `DocumentReviewTab` |
| 148 | 작성내용 점검 결과 분량 | 여러 건의 상담일지를 입력하고 점검 실행 | 각 상담일지별 기존 흐름, 수행방법 연결 지점, 보완 방향, 수정된 상담내용, 향후 지원계획이 충분히 자세히 출력된다. | `DocumentReviewTab` |
| 149 | 허위 달성·과장 표현 방지 | 근거가 부족한 상담일지를 입력 | 확인되지 않은 성과를 단정하지 않고 함께 확인함, 논의함, 추가 확인 필요 등 안정적인 표현으로 보완한다. | `DocumentReviewTab` |
| 150 | 추가 확인 필요 구분 | 내용이 부족한 상담일지를 입력 | 추가 확인이 필요한 내용이 별도로 표시된다. | `DocumentReviewTab` |
| 151 | 업무지원도구 이력서 작성 프로그램 링크 접속 | 업무지원도구(외부링크) → 이력서 작성 프로그램 클릭 | 새 창 또는 기존 외부 링크 방식으로 `https://service-459909947241.us-west1.run.app/`가 열린다. | `src/pages/AITools.tsx` |
| 152 | 직업재활계획서 양식 미리보기 열기 | 직업재활계획서 작성 후 양식 미리보기 클릭 | 기존 작성 결과 textarea는 유지되고 별도 모달에 A4 양식 미리보기가 열린다. | `RehabPlanTemplatePreview` |
| 153 | 이용자 정보 자동 반영 | 이용자를 선택하고 양식 미리보기 열기 | 성명, 장애유형/중경증과 이용자 객체의 생년월일·주소·연락처가 우선 반영되고, 값이 없을 때만 이용자 메모의 식별 가능한 라벨 값을 사용한다. | `mapRehabPlanFormData` |
| 154 | 계획 목표 자동 매핑 | 직업목표, 장기목표, 단기목표, 수행방법이 있는 계획서로 미리보기 열기 | 각 목표와 수행방법이 목표 행에 반영되고 최소 1개 목표 행이 유지된다. | `buildGoals` |
| 155 | 자동 매핑값 직접 수정 | 미리보기 왼쪽 편집 영역에서 기본정보, 사례회의, 목표 값을 수정 | 수정값이 오른쪽 출력 양식에 즉시 반영된다. | `RehabPlanTemplatePreview` state |
| 156 | 직업재활계획서 PDF 다운로드 | 미리보기에서 PDF 다운로드 클릭 | 로컬 인쇄 창이 열리고 PDF로 저장할 수 있으며 편집 UI와 안내문은 출력 문서에 포함되지 않는다. | `printElementAsPdf` |
| 157 | 직업재활계획서 PNG 다운로드 | 미리보기에서 이미지 다운로드 클릭 | 현재 미리보기 전체가 `직업재활계획서_YYYY-MM-DD.png`로 로컬 저장된다. | `downloadElementAsPng` |
| 158 | PDF/PNG/DOCX 중복 클릭 방지 | PDF, PNG 또는 DOCX 생성 중 다른 출력 버튼 연속 클릭 | 출력 중 버튼이 비활성화되고 완료 또는 실패 후 다시 활성화된다. | `exporting` state |
| 159 | 출력 파일명 개인정보 최소화 | PDF/PNG/DOCX 출력 기본 파일명 확인 | 기본 파일명에는 이용자명이 포함되지 않고 문서명과 날짜만 사용된다. | `localDateForFileName` |
| 160 | 출력 실패 시 작성 내용 유지 | 브라우저 인쇄 또는 PNG 렌더링 실패 유발 | 오류 안내가 표시되고 직업재활계획서 본문과 편집 중인 매핑값이 유지된다. | `handlePdf`, `handlePng` |
| 161 | 출력 전 개인정보 안내 | 양식 출력 카드와 미리보기 도구막대 확인 | 외부 공유 전 개인정보와 민감 상담 내용을 확인하라는 안내가 표시된다. | `ShieldAlert` 안내문 |
| 162 | 기존 계획서 기능 보존 | 계획서 생성, 저장, 복사, 초기화, 현재 내용 기반 보완 순서로 실행 | 기존 `caseDocuments` 저장 흐름과 작성 결과 textarea가 유지되고 각 기능이 정상 동작한다. | `WorkMate.tsx` |
| 163 | 잘못된 백업 형식 사전 차단 | 배열이 아닌 스토어 값 또는 중복 ID가 있는 JSON을 복원 | 현재 DB를 지우기 전에 형식 오류를 안내하고 기존 데이터가 유지된다. | `validateBackupData`, `importAllData` |
| 164 | 복원 중 실패 시 원본 복구 | 별도 테스트 DB에서 일부 스토어 반영 중 오류를 발생시킨다. | 복원 전 메모리 스냅샷으로 영향받은 스토어를 되돌리고, 일부 복구 실패 시 해당 스토어를 오류에 명시한다. | `replaceStoreContents`, `importAllData` |
| 165 | 백업 복원 시 인증정보 보존 | 현재 API 키를 설정한 뒤 키가 비어 있거나 다른 값인 백업을 복원 | 백업의 API 키·토큰·비밀번호·인증정보를 적용하지 않고 현재 기기의 설정값을 유지한다. | `mergeSettingsWithCurrentCredentials` |
| 166 | 세부 예산 항목 메모 유지 | 사업의 세부 예산 항목에 메모를 입력해 저장 후 다시 연다. | 항목명·예산금액과 함께 선택 입력한 메모가 유지된다. | `BudgetManagement`, `BudgetItem.memo` |
| 167 | Electron 외부 URL 허용 목록 | HTTPS와 HTTP 링크를 각각 새 창으로 연다. | 기본 브라우저로만 열리고 새 Electron 창은 생성되지 않는다. | `getAllowedExternalUrl`, `setWindowOpenHandler` |
| 168 | Electron 위험 프로토콜 차단 | `file:`, `javascript:`, `data:` 및 잘못된 URL을 새 창으로 연다. | 외부 실행이 거부되고 새 Electron 창도 생성되지 않는다. | `getAllowedExternalUrl` |
| 169 | Windows 제거 시 앱 데이터 보존 설정 | Electron builder 설정을 확인하고 테스트 설치본을 제거한다. | `deleteAppDataOnUninstall`이 `false`이며 제거 후 사용자 데이터가 자동 삭제되지 않는다. | `package.json` |
| 170 | Gemini 지원 모델 3종 유지 | 설정 저장 후 재시작하고 각 지원 모델을 선택한다. | 정확히 Flash-Lite, Flash Preview, Pro Preview 세 모델만 유지되고 선택한 Preview 모델이 임의 변경되지 않는다. | `settingsStore`, `Settings`, `gemini` |
| 171 | 오류 로그 민감정보 제외 | 잘못된 Gemini/Vision 키로 요청을 실패시킨 뒤 콘솔을 확인한다. | 프롬프트·API 키·키가 포함된 URL 없이 오류 이름·상태·코드 등 최소 정보만 남는다. | `gemini.ts`, `ocr.ts` |
| 172 | 직업평가 PDF 503 오류 보존 | PDF 분석 중 Gemini 503/high demand 오류를 발생시킨다. | 모델 혼잡 안내가 PDF 손상·API 키·quota 오류로 다시 바뀌지 않고 정확한 안내 문구와 `status: 503`, `reason: model-high-demand`가 유지된다. | `normalizeGeminiError`, `analyzeTestResults`, `generateReport` |
| 173 | 직업평가 503 후 화면 상태 보존 | 기존 입력과 결과가 있는 상태에서 PDF 분석 503을 발생시킨다. | 입력 내용과 기존 결과가 유지되고 loading이 해제되어 다시 시도할 수 있다. | 실제 Gemini 장애 또는 안전한 장애 주입 수동 검증 |
| 174 | 연결 지출이 있는 세부 예산 항목 삭제 취소 | 지출이 연결된 항목의 삭제 버튼을 누른 뒤 확인창에서 취소한다. | 세부 항목과 연결 지출 모두 변경되지 않는다. | `BudgetManagement` 삭제 확인 흐름 |
| 175 | 연결 지출이 있는 세부 예산 항목 삭제 확인 | 지출이 연결된 항목 삭제를 확인하고 사업을 저장한다. | 항목만 삭제되고 지출은 유지되며 `budgetItemId`·`budgetItemName`만 비워진다. 사업·금액·날짜·품명·거래처 등은 유지된다. | `handleRemoveBudgetItem`, `handleSaveProject` |
| 176 | 항목 미지정 집계·필터·CSV | 연결 지출의 항목이 해제된 뒤 사업 현황과 CSV를 확인한다. | 사업 전체 사용액에 계속 포함되고 항목 미지정 사용액으로 집계되며 삭제된 ID가 필터에 남지 않고 CSV에는 `항목 미지정`으로 표시된다. | `budgetItemLinks`, `BudgetManagement` |
| 177 | 직업평가 저장 이력 전체 백업 | 직업평가 결과분석/종합소견서 이력을 저장한 뒤 전체 백업을 내보낸다. | `vocationalEvaluationHistory` 배열이 포함되고 API 키·토큰·비밀번호 계열 필드는 포함되지 않는다. | `exportAllData` |
| 178 | 직업평가 저장 이력 복원 | 직업평가 이력이 포함된 유효 백업을 복원한다. | 이력이 예상 구조로 복원되고 현재 기기의 API 키는 유지된다. | `importAllData` |
| 179 | 구버전 백업 호환 | `vocationalEvaluationHistory`가 없는 구버전 백업을 복원한다. | 복원은 가능하고 현재 직업평가 이력과 API 키를 불필요하게 삭제하지 않는다. | optional backup field |
| 180 | 손상된 직업평가 이력 사전 거부 | `vocationalEvaluationHistory`가 배열이 아니거나 잘못된 항목을 포함한 백업을 복원한다. | 데이터 변경 전에 복원이 거부되고 기존 IndexedDB·예산·직업평가 이력이 보호된다. | `validateBackupData`, `importAllData` |
| 181 | 지출품의서 Electron 인쇄 | 패키징된 Electron에서 지출품의서를 열고 인쇄 버튼을 누른다. | 새 창 허용 목록에 막히지 않고 로컬 hidden iframe에서 인쇄 대화상자가 열리며 문서 내용과 디자인이 유지된다. | `ExpenseDocument`; 패키징 환경 수동 검증 필요 |
| 182 | 서명 환경변수 누락 사전 차단 | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`를 비운 뒤 `npm run electron:build:win:signed` 실행 | Vite/패키징 시작 전에 지정된 한국어 안내와 함께 실패한다. 비밀번호나 인증서 내용은 출력하지 않는다. | `scripts/check-win-signing.cjs` |
| 183 | 로컬 PFX 경로 사전 확인 | 존재하지 않는 로컬 경로를 `WIN_CSC_LINK`에 넣고 signed build 실행 | 패키징 전에 PFX 파일 없음으로 중단하며 비밀번호는 출력하지 않는다. | `scripts/check-win-signing.cjs` |
| 184 | 내부 서명 설치본 검증 | 유효한 내부 PFX 환경변수 설정 후 signed build 실행 | `Get-AuthenticodeSignature`가 `Valid`이고 서명자 인증서가 의도한 내부 인증서다. | 인증서가 없는 개발 환경은 `N/A`로 기록 |
| 185 | 배포 버전과 파일명 확인 | Windows 설치본 생성 후 파일 속성과 파일명을 확인 | 현재 버전은 `3.0.0`, 파일명은 `JJSS Setup 3.0.0.exe`다. | `package.json`, Electron builder |
| 186 | 기존 설치 GUID 호환 | 기존 설치 제거 레지스트리 키와 현재 `appId` 파생 GUID 비교 | 둘 다 `763ac432-8ee1-5a44-b6ab-56ce675b7536`이며 `appId`는 `com.jjss.desktop`으로 유지된다. | 기존 설치 PC 레지스트리·electron-builder UUID v5 계산 |
| 187 | Windows 설치 범위 호환 | 기존 설치와 새 NSIS 빌드의 범위 확인 | 둘 다 per-machine이며 새 빌드 로그에 `perMachine=true`가 표시된다. | `package.json` `nsis.perMachine` |
| 188 | 정상 업그레이드 데이터 보존 | 기존 설치와 검증용 데이터가 있는 PC에서 3.0.0 설치본 실행 | 기존 설치 감지 후 정상 업그레이드되고 AppData/IndexedDB/localStorage가 유지된다. | 실제 기존 데이터 보호를 위해 사용자 수동 검증 필요 |
| 189 | 짧은 계획서 PNG | 합성 데이터로 짧은 계획서를 이미지 저장 | PNG가 존재하고 0 byte가 아니며 PNG 서명·이미지 decode를 통과한다. | Chromium 실제 다운로드 검증 완료 |
| 190 | 보통 길이 계획서 PNG | 합성 데이터로 보통 길이 계획서를 이미지 저장 | PNG가 존재하고 0 byte가 아니며 PNG 서명·이미지 decode를 통과한다. | Chromium 실제 다운로드 검증 완료 |
| 191 | 긴 계획서 PNG | 합성 데이터로 긴 계획서를 이미지 저장 | Canvas 한계 안에서 축소되어 PNG 서명·이미지 decode를 통과하거나, 한계 초과 시 PDF 이용 안내로 사전 중단한다. | Chromium에서 높이 16,383 px PNG decode 완료 |
| 192 | SVG 실패 후 fallback 1회 | 검증 하네스에서 첫 XML 직렬화를 의도적으로 실패시킨 뒤 이미지 저장 | `html2canvas` fallback이 한 번 실행되고 유효한 PNG가 내려받아진다. 무한 재시도는 없다. | Chromium 실제 다운로드 검증 완료 |
| 193 | PNG 대상 영역 제한 | 이미지 저장 결과 가장자리를 확인 | `.rehab-plan-document` A4 문서만 포함되고 편집 UI·버튼·경고 카드가 캡처되지 않는다. | `downloadElementAsPng` 대상 검사 |
| 194 | PNG Blob URL 지연 해제 | 다운로드 처리 코드를 점검하고 실제 다운로드 실행 | 클릭 직후 URL을 해제하지 않고 지연 해제하며 다운로드 파일이 손상되지 않는다. | 1,500ms 지연, 실제 decode 완료 |
| 195 | PDF 출력 회귀 방지 | 기존 PDF 버튼 실행 | 기존 iframe 인쇄 방식과 문서 디자인이 유지된다. | PDF 함수 미변경, 패키징 Electron 인쇄창은 수동 검증 필요 |
| 196 | 일괄등록 사전 검증 | 정상 행 뒤에 열 부족/이름 누락 행을 포함해 등록 | 오류 행 번호를 안내하고 첫 행도 저장하지 않은 상태에서 중단한다. | 형식 오류 사전 검증 정적 확인, 실제 IndexedDB UI 검증 필요 |
| 197 | AI/PDF 파일 크기 경계 | 0 byte, 20MB 초과, 지원하지 않는 형식과 정상 이미지/PDF 선택 | 비정상 파일은 Base64 변환 전에 안내하고 정상 파일만 유지한다. | 실제 경계 파일 UI 검증 필요 |
| 198 | 저장 사진 크기 경계 | 훈련 사진·사업체 사진에 0 byte/5MB 초과/비이미지 선택 | 저장/미리보기 전에 차단하며 기존 사진과 작성 내용은 유지한다. | 실제 경계 파일 UI 검증 필요 |
| 199 | 텍스트 파일 크기 경계 | 회의록·대시보드·유틸에서 0 byte/10MB 초과/비텍스트 선택 | FileReader 전에 차단하고 버튼이 다시 활성화된다. | 실제 경계 파일 UI 검증 필요 |
| 200 | InfoMate 외부 URL | http/https와 javascript/file/data URL을 각각 저장 | http/https만 저장·링크 표시되고 나머지는 안내 후 입력 유지한다. | 정적 파서 확인, UI 수동 검증 필요 |
| 201 | 오류 로그 개인정보 | 합성 이용자 입력 상태에서 저장/API 오류 유발 | 콘솔에는 feature/name/code/status/reason 분류값만 있고 입력·URL·응답 본문이 없다. | 실제 오류 주입 수동 검증 필요 |
| 202 | OpenAI 인증 헤더 | 검증용 키로 한 번 요청 | Bearer 값 뒤 불필요한 공백이 없고 오류 응답 원문이 화면에 노출되지 않는다. | 실제 외부 API 호출은 미실행 |
| 203 | Electron 개발 실행 | `electron .` 실행 후 창과 프로세스 확인 | JJSS 제목의 응답 가능한 창이 생성되고 종료 시 검증 프로세스가 남지 않는다. | Electron 36.9.5 창/응답 확인 완료, 내부 메뉴 수동 검증 필요 |
| 204 | 릴리즈 readiness 버전 검사 | `npm run check:release` 실행 | package/lock 버전, appId, productName, 데이터 보존 설정을 검사하고 불일치 시 실패한다. | `scripts/check-release-readiness.cjs` |
| 205 | 릴리즈 민감파일 검사 | `.env`, PFX, 개인키를 Git 추적 대상으로 만든 뒤 readiness 실행 | 파일 내용이나 비밀번호를 출력하지 않고 민감 파일 추적을 차단한다. | 실제 비밀값 없이 합성 파일명으로만 수동 검증 |
| 206 | 릴리즈 생성물 변경 검사 | `release/`, `dist/`, `node_modules/`에 Git 변경이 있는 상태에서 readiness 실행 | 해당 변경 수를 안내하고 릴리즈 준비 검증을 실패 처리한다. | 현재 기존 `release/` 변경 5건을 감지해 의도대로 FAIL |
| 207 | 기존 설치 업그레이드 체크리스트 | `docs/WINDOWS_RELEASE_CHECKLIST.md` 순서대로 합성 데이터를 준비하고 신규 설치본 실행 | 기존 설치 제거 없이 이용자·상담·계획서·훈련·평가·예산·API 설정이 유지된다. | 실제 설치 PC 수동 검증 필요 |
| 208 | 출력 전 누락 경고 | 계획서 필수 항목 일부를 비운 뒤 PDF/PNG/DOCX 버튼 클릭 | 누락 항목과 목표달성 미확인을 목록으로 표시하고 자동 수정하지 않는다. | `getRehabPlanExportWarnings` |
| 209 | 누락 경고 후 수정 복귀 | 출력 전 확인에서 `돌아가서 수정` 클릭 | 출력하지 않고 현재 미리보기와 편집값을 그대로 유지한다. | `pendingExport` state |
| 210 | 누락 경고 후 계속 출력 | 출력 전 확인에서 `계속 출력` 클릭 | 누락값을 생성하거나 저장하지 않고 사용자가 선택한 형식만 출력한다. | 강제 차단 아님 |
| 211 | 자동 매핑 회귀 3종 | `npm run test:rehab-plan-mapper` 실행 | 명확한 제목·개조식·긴 문장 fixture가 모두 통과하고 `PASS 3/3`을 출력한다. | 합성 개인정보만 사용, 실행 PASS |
| 212 | DOCX 템플릿 개인정보 제거 | 프로젝트 템플릿의 OOXML 텍스트와 메타데이터 검사 | 원본 문서의 이름·전화번호가 없고 36개 placeholder만 데이터 셀에 존재한다. | 1표 26행×26열, 원본 대비 `word/document.xml`만 변경 |
| 213 | DOCX 직접 출력 | 합성 계획서로 Word 저장 실행 | `직업재활계획서_YYYY-MM-DD.docx`가 생성되고 표·병합 셀·한글·여러 줄이 유지된다. | 구조 생성 PASS, Microsoft Word/LibreOffice 시각 QA는 환경 제한 |
| 214 | Electron DOCX 템플릿 로드 | 빌드된 `file://` 앱에서 템플릿을 fetch/XHR로 읽는다. | 0 byte가 아닌 번들 템플릿을 읽는다. | fetch/XHR 모두 11,757 bytes 확인 |
| 215 | PDF 페이지 나눔 | 긴 사례회의 내용·강점·고려사항·지원방향·수행방법을 인쇄 | 짧은 행은 한 페이지에 유지하고 긴 행은 강제 `avoid` 없이 자연스럽게 분할된다. | CSS/iframe 규칙 정적 확인, 실제 인쇄 수동 검증 필요 |
| 216 | 설치 범위 실측 | JJSS 제거 레지스트리의 hive, 설치 위치, uninstall 인자를 확인 | 기존 1.0.0은 HKLM, `C:\Program Files\JJSS-Pro`, `/allusers`인 per-machine 설치다. | 실측 완료; 신규도 `perMachine: true` 유지 |
| 217 | JJSS 미실행 프로세스 검사 | 앱과 설치 프로그램을 닫고 프로세스·서비스·Run/Startup을 조회 | JJSS 관련 프로세스·서비스·자동 시작 항목이 없다. | 실측 완료; tray/background/autostart 추가 없음 |
| 218 | 설치 중 실행파일 오탐 방지 | JJSS가 종료된 상태에서 신규 installer 실행 | 실제 패키지 실행파일 `JJSS-Pro.exe`가 없으면 실행 중 안내가 나오지 않는다. | `${APP_EXECUTABLE_FILENAME}` exact-name 검사 적용; 실제 업그레이드 설치 승인 대기 |
| 219 | 실제 실행 중 설치 안내 | `JJSS-Pro.exe`를 실제 실행하고 installer 실행 | 강제 종료하지 않고 정상 종료 후 다시 시도하도록 안내한다. | `taskkill /F` 없는 custom NSIS macro; 수동 확인 필요 |
| 220 | Windows 실행파일명 호환 | 패키지의 실행파일명을 확인 | 기존 설치와 동일한 `JJSS-Pro.exe`가 생성된다. | `release/win-unpacked/JJSS-Pro.exe` 확인 |
| 221 | JJSS 표준 폴더 구조 | 설치형 앱 최초 실행 또는 저장 실행 | 쓰기 가능한 `D:\`가 있으면 `D:\JJSS`, 아니면 `app.getPath('documents')\JJSS` 아래 백업·문서 카테고리 폴더가 재귀 생성된다. | 자동 경로 정책 및 하위 폴더 생성 테스트 PASS; 설치형 UI 수동 확인 필요 |
| 222 | native 저장 대화상자 | 백업/PNG/PDF/DOCX/CSV/TXT 저장 버튼 실행 | 선택한 카테고리 폴더가 기본 경로이고 취소 시 파일이 생성되지 않는다. | IPC·renderer 연결 정적 확인; 설치형 UI 수동 확인 필요 |
| 223 | 사용자 지정 경로 저장 | native 저장 대화상자에서 OneDrive·바탕화면 등 JJSS 루트 밖 경로 선택 | 선택한 경로에 그대로 저장되고 다음 저장 시 최근 폴더가 제안된다. | 정규화·기록 검증 구현; 설치형 UI 수동 확인 필요 |
| 224 | 저장 완료 경로 표시 | Electron에서 파일 저장 성공 | 실제 전체 경로와 `폴더 열기` 버튼이 표시된다. | 전역 최소 알림 연결; 설치형 UI 수동 확인 필요 |
| 225 | Browser 저장 fallback | `npm run dev` 브라우저에서 동일 저장 버튼 실행 | 기존 브라우저 다운로드가 시작되고 Object URL은 지연 해제된다. | 중앙 fallback 정적/빌드 확인 |
| 226 | 기존 문서 후보 미리보기 | 합성 `JJSS-old-test` 폴더를 하위 폴더 제외로 선택 | 최상위 JJSS 패턴 7개만 후보로 표시된다. | `npm run test:file-service` root-only PASS |
| 227 | 비-JJSS 문서 보호 | `일반사진.jpg`, `개인문서.docx`를 후보 폴더에 둔다. | 미리보기·복사·이동 대상에 포함되지 않는다. | 합성 테스트 PASS 2/2 |
| 228 | 문서 충돌 처리 | 같은 파일을 두 번 가져온다. | 기존 파일을 덮어쓰지 않고 `(1)` 이름으로 저장한다. | 합성 테스트 PASS |
| 229 | 안전한 문서 이동 | 이동 모드로 합성 회의록을 가져온다. | 복사 후 크기·SHA-256 검증에 성공한 경우에만 원본을 삭제한다. | 합성 테스트 PASS |
| 230 | 파일 저장 IPC 보안 | preload 및 main handler를 검토 | raw ipc/fs/path를 노출하지 않고 category·basename·확장자·크기·sender를 검증한다. | 정적 검토 및 단위 테스트 PASS |
| 231 | Windows 설치파일 구조 빌드 | `signAndEditExecutable=false` 검증 빌드 실행 | NSIS 2.3.0, x64, per-machine 설치파일과 `JJSS-Pro.exe`가 생성된다. | PASS, installer는 `NotSigned` |
| 232 | 기존 1.0.0 위 실제 설치 | 설치 직전 사용자 확인 후 미서명 검증본 실행 | cannot-be-closed 오탐 없이 업그레이드되고 기존 데이터가 유지된다. | 아직 실행하지 않음; PASS로 판정 금지 |
| 233 | 최신 AI 모델 목록 | 설정 화면의 세 제공사 드롭다운 확인 | Gemini 2개, OpenAI GPT-5.6 3개, Claude 3개만 지정된 표시명으로 노출된다. | `src/config/aiModels.ts`, 타입검사 필요 |
| 234 | 구 모델 마이그레이션 | 구 Gemini/OpenAI/Claude 모델값으로 `npm run test:ai-settings` 실행 | 지정된 최신 모델로 변환되고 알 수 없는 값은 제공사 기본 모델로 보정된다. | 합성 문자열만 사용, 자동 테스트 PASS |
| 235 | 기존 API 키 보존 | 암호화된 API 키가 있는 기존 설정을 로드 | 모델 문자열만 보정되고 기존 API 키·Vision 키·기타 설정은 유지되며 onboarding이 표시되지 않는다. | 저장소/복호화 경로 정적 확인, 실제 기존 설치 수동 확인 필요 |
| 236 | API 키 0개 최초 실행 | onboarding localStorage flag가 없는 상태로 앱 실행 | API 키 안내가 한 번 표시되고 비AI 기능을 차단하지 않는다. | 조건 단위 테스트 및 빈 저장소 로컬 브라우저 렌더링 PASS |
| 237 | API 키 onboarding 저장 | 제공사 키 하나만 입력하고 `저장하고 시작하기` 클릭 | 기존 AES-GCM settings 저장 경로로 저장되고 안내가 닫히며 유료 API 요청은 발생하지 않는다. | 코드 경로 정적 확인, 실제 키 입력 수동 확인 필요 |
| 238 | onboarding 나중에 설정 | 키 없이 `나중에 설정하기` 클릭 후 앱 재실행 | localStorage flag로 반복 표시되지 않고 비AI 기능은 계속 사용 가능하다. | 조건 단위 테스트와 클릭 후 새로고침 로컬 브라우저 검증 PASS |
| 239 | 키 없이 AI 기능 실행 | onboarding을 건너뛴 뒤 AI 기능 실행 | 필요한 제공사를 안내하고 `설정으로 이동`/`취소`를 제공하며 자동 provider fallback은 없다. | 공문서 AI 실행 후 Gemini 안내·설정 이동 실제 브라우저 검증 PASS |
| 240 | 최신 모델 API 오류 안내 | 403/404/429/503 응답을 각각 유발 | 모델 접근 불가, 사용량 한도, Gemini 혼잡을 구분하고 다른 유료 모델로 자동 변경하지 않는다. | 상태 분기 정적 확인, 실제 외부 API 미호출 |
| 241 | 기존 사용자 비용 정책 migration | `aiFailover` 또는 신규 필드가 없는 설정 로드 | 자동 전환 OFF, economy, premium 자동승급 OFF, premium 확인 ON으로 보정되고 기존 키·모델은 유지된다. | `normalizeAIFailover`, 합성 테스트 PASS |
| 242 | 유료 사용 기본 OFF | 신규 설정과 구버전 설정 확인 | premium 정책과 자동승급이 사용자 동의 없이 활성화되지 않는다. | 합성 테스트 및 로컬 설정 화면 PASS |
| 243 | economy premium 차단 | economy + 자동전환 ON 상태에서 모든 허용 요청을 실패시킨다. | 최대 3회까지만 호출하고 모든 후보가 economy/balanced이며 premium 호출·확인 요청이 없다. | executor 합성 테스트 PASS |
| 244 | balanced premium 차단 | balanced + 자동전환 ON 상태에서 Provider별 요청 실패 | 다른 Provider balanced를 시도할 수 있지만 premium은 자동 호출하지 않는다. | plan 합성 테스트 PASS |
| 245 | premium 자동승급 OFF | premium 동의 후 자동승급 OFF에서 balanced 실패 | 다른 balanced 후보만 사용하고 자동 premium 후보는 만들지 않는다. | plan 합성 테스트 PASS |
| 246 | premium 자동승급 ON | premium 동의·자동승급 ON에서 balanced 실패 | 최대 3회 범위에서 premium 후보를 사용할 수 있다. | executor 합성 테스트 PASS |
| 247 | premium 사용 전 확인 | `confirmBeforePremium` ON에서 balanced 실패 | premium API 호출 직전에 사용/저비용 유지/취소 선택 dialog가 표시된다. | executor 확인 callback 및 전역 dialog 연결 PASS, 실제 유료 API 미호출 |
| 248 | premium 취소 시 요청 없음 | premium 확인 dialog에서 취소 | premium 후보 호출 전에 작업을 중단하며 premium API 요청은 전송되지 않는다. | executor 합성 테스트 PASS |
| 249 | credit 부족 Provider 재호출 금지 | 한 Provider가 creditUnavailable을 반환 | 같은 요청에서 해당 Provider의 다른 모델을 호출하지 않고, 별도 동의된 다른 Provider 후보만 검토한다. | executor 합성 테스트 PASS |
| 250 | 유료·타사 전송 동의 독립 | premium 동의만 하고 cross-provider 동의는 하지 않는다. | 다른 회사 API 후보가 생성되지 않는다. 별도 cross-provider 동의가 있어야만 전환된다. | 합성 테스트 및 유료 승인 후 타사 동의 취소 UI PASS |
| 251 | 임의 가격 표시 금지 | Settings·결과 안내·코드 전체 검색 | 실제 금액·잔여 크레딧을 계산하지 않고 비용 발생 가능성만 안내한다. | 정적 검색 필요, usage metadata 미수집 |
| 252 | 일반 429 비용 보호 | `RESOURCE_EXHAUSTED` 또는 일반 429를 합성 주입 | `rateLimit`으로 분류하고 기본 설정에서는 Gemini 1회 뒤 중단한다. | `npm run test:ai-safety` PASS |
| 253 | 명시적 quota 전환 | `QUOTA_EXCEEDED`/`Daily quota exceeded`를 합성 주입 | `quotaExceeded`로 분류하고 자동전환·타사 동의가 있을 때만 다음 Provider를 호출한다. | `npm run test:ai-safety` PASS |
| 254 | 권한·모델 오류 분리 | 403 permission과 404 `MODEL_NOT_FOUND`를 각각 합성 주입 | 403은 `permissionError`로 기본 중단하고 실제 모델 부재 404만 `modelUnavailable` 전환 대상이다. | `npm run test:ai-safety` PASS |
| 255 | 첨부파일 Provider lock | PDF 첨부 Gemini 요청에 503을 합성 주입 | Gemini 1회만 호출하고 OpenAI/Claude에 첨부 없는 prompt-only 요청을 보내지 않는다. | `npm run test:ai-safety` PASS |
| 256 | 하위 폴더 기존 문서 가져오기 | 2단계 문서, 6단계 문서, junction을 포함한 합성 트리 선택 | 5단계 이내 JJSS 9개만 발견하고 6단계·junction·일반 파일은 제외한다. | `npm run test:file-service` PASS 9/9 |
| 257 | cannot-be-closed 실제 위치 | 설치 앱 미실행 상태에서 기존 설치 위 installer 실행 | 사용자 매크로가 아닌 파일 교체 단계까지 진행하고 영문 오류 없이 업그레이드된다. | builder template 정적 확인 완료; 실제 설치는 PASS-WARN |
| 258 | normalized 오류 metadata | 일반 429와 credit 부족 오류를 정규화 | 사용자 메시지와 failover 판정은 유지하면서 reason이 각각 `rate-limit`, `credit`이다. | `npm run test:ai-safety` 정적 assertion PASS |
| 259 | package script Git 포함 | package.json 참조 script와 `git ls-files scripts` 비교 | 참조 파일 6개가 모두 Git source commit 대상이고 누락이 없다. | 6개 staged/tracked, 누락 0 |
| 260 | 최종 signed build 상태 | 현재 Windows shell의 서명 환경변수 확인 | 환경변수가 없으면 비밀값을 출력하지 않고 signed build를 실행하지 않으며 N/A로 기록한다. | `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` 없음, N/A |

## 실제 테스트 실행 명령어

```bash
npm run dev
```

## 빌드 검증 명령어

```bash
npm run build
npm run check:release
npm run test:rehab-plan-mapper
npm run test:ai-settings
npm run electron:build:win:signed
Get-AuthenticodeSignature ".\release\JJSS Setup 3.0.0.exe"
```

## 커밋 제외 대상

- `release/`
- `dist/`
- `node_modules/`
- `.env`
- `.env.local`
- `.env.*`
- 코드서명 인증서(`*.pfx`, `*.p12`, `*.pem`, `*.key`, `certs/`)
- 실제 API 키가 들어간 파일
- 개인정보가 들어간 DB/백업 파일
- `.temp_app_extract/`
- 설치 파일(`*.exe`, `*.app`, `*.zip`, `*.blockmap`)
- `CHATGPT_*`
- `test-gemini.js`
- `jjss-code-context*.zip`
- `index-D6j7ox8t.js`

## 남은 위험 요소

- OCR/PDF/이미지 생성은 API 키 권한, quota, 모델 상태에 따라 실패할 수 있다.
- 실패하더라도 사용자 안내가 표시되고 작성 중인 내용이 유지되면 1차 통과로 본다.
- 번들 크기 경고는 현재 릴리즈 차단 요소는 아니며, 추후 lazy loading 개선 대상으로 관리한다.
- 직업평가 저장 문서/이력은 현재 localStorage 기반이므로, 장기적으로 `caseDocuments` 연계를 검토한다.
- 직업평가 이력은 이용자 기반 연결 안정성이 낮아 이번 버전의 최근 기록 참고 대상에서 제외한다.
- 최근 기록 참고 기능은 직업훈련·고용지원 기록만 대상으로 한다.
## AI API 반복 호출 방지 (2026-08-17)

- [ ] 같은 생성 버튼을 빠르게 두 번 눌러도 실제 Provider 호출은 1회인지 확인
- [ ] Failover OFF에서 503 오류가 발생해도 다른 Provider를 호출하지 않는지 확인
- [ ] Failover ON에서 각 Provider를 최대 1회, 전체 최대 3회만 호출하는지 확인
- [ ] AI 실행 중 다른 화면으로 이동하면 다음 Provider failover가 시작되지 않는지 확인
- [ ] 파일 선택만으로 OCR이 시작되지 않고 별도 분석 버튼을 눌러야 하는지 확인
- [ ] 이미지 생성 응답에 이미지가 없어도 자동 재생성이 발생하지 않는지 확인
- [ ] 저장·복사·PDF·PNG·DOCX·백업 동작이 AI API를 호출하지 않는지 확인
- [ ] `npm run test:ai-safety`가 실제 API 키와 네트워크 없이 통과하는지 확인
# 2026-08-17 런타임 입력·문서 저장 수동검증

- [ ] Windows Electron 예산관리에서 `사업비 입력 테스트입니다.`를 30초 이상 입력·수정: 조합 깨짐, 누락, focus 이탈, form reset 없음
- [ ] Windows Electron 업무지원도구에서 `장애인 직업재활 상담일지 작성 테스트입니다.`를 30초 이상 입력·수정: 조합 중 Enter 오동작과 form reset 없음
- [ ] 직업재활계획서 PDF 저장 기본 위치가 `Documents\\JJSS\\문서\\직업재활계획서`인지 확인
- [ ] PDF를 OneDrive·바탕화면·다운로드 등 원하는 위치에 저장하고 다음 저장 시 최근 폴더가 제안되는지 확인
- [ ] 짧은·일반·긴 합성 계획서의 PNG 저장과 파일 열기 확인
- [ ] PDF·PNG·DOCX 저장 대화상자 취소 시 빨간 오류가 표시되지 않는지 확인
