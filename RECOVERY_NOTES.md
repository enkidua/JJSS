# JJSS 복구 및 안정화 메모

## 이번 복구의 기준
- 기존 이용자, 사업체, 지출, 훈련, 사례 문서 데이터를 삭제하지 않는다.
- 커뮤니티와 인트라넷은 다시 연결하지 않는다. 자료수집용 InfoMate는 테스트 피드백에 따라 `/infomate`로 복구한다.
- DB 버전 변경 없이 기존 IndexedDB store를 보존한다.
- AI 실패 시 작성 중인 textarea/form 내용은 유지한다.

## 핵심 복구 내용
- IndexedDB 저장 안정화와 API 키 암호화/복호화 호환 처리
- 직업훈련 `/training` 메뉴/라우트 복구
- 예산 지출 등록/목록/지출품의서 안정화
- 예산 OCR을 지출 등록 보조 기능으로 복구
- 직업평가 PDF/이미지/텍스트 분석 안정화
- 이미지 생성 오류 안내와 대체 안내 보강
- 현재 내용 기반 재생성 공통 서비스 추가
- 고용지원 매칭 의견을 `caseDocuments`에 `matching_opinion`으로 저장
- 위기대응 시뮬레이터를 업무 지원 도구 내부에 복구
- 고용지원 화면을 5개 탭으로 복구: 사례관리 문서 연속작성, AI 정밀 매칭, 면접일지 작성, 직무분석지 작성, 작성 내용 점검
- 면접일지와 직무분석지는 새 DB store 없이 `caseDocuments`에 각각 `interview_note`, `job_analysis` 타입으로 저장
- 작성 내용 점검은 원문을 자동 수정하지 않고 제안 결과를 복사해 반영하는 흐름으로 유지
- 업무지원도구를 4개 카테고리로 정리: 핵심 문서 작성, 문서 분석 및 보안, 홍보 및 시각화, 기획 및 위기대응
- 업무지원도구 카드에 필요한 API 키와 실패 시 대체 흐름을 표시
- 문서 OCR과 예산 OCR의 용도를 분리해 안내하고, 실제 작동하지 않는 상담스파링 카드는 숨김
- 홈 화면 주요 기능 카드를 현재 실제 연결된 기능 기준으로 정리
- 홈 카드 경로를 `/manage`, `/evaluation`, `/training`, `/workmate`, `/budget`, `/tools`, `/infomate`로 맞추고 인트라넷/커뮤니티 카드는 제외

## 최종 테스트 피드백 반영
- 직업평가 결과분석 프롬프트를 실무 문서형 구조로 보강했다. 결과에는 평가자료 개요, 주요 수행 특성, 강점, 지원 필요사항, 직무수행 가능성, 훈련/고용지원 고려사항, 후속 지원계획이 포함된다.
- 직업평가 결과/소견서 textarea 높이를 키워 긴 결과를 읽고 수정하기 쉽게 했다.
- Navbar와 홈 카드의 고용지원 명칭을 `고용지원`으로 간소화했다. route는 `/workmate`를 유지한다.
- 자료수집 기능을 `/infomate` 라우트와 Navbar/Home에 다시 연결했다. 저장은 기존 `resources` store를 사용한다.
- 사례 이력/기존 작성 문서 보기 카드의 높이, 여백, 글자 크기, 스크롤 영역을 보강했다.
- 업무지원도구 카드에 상시 노출되던 반복적인 실패 안내 문구를 제거했다. 실제 오류 안내와 입력 보존 로직은 유지한다.
- 직업훈련 출석관리 버튼에 안전한 클릭 처리와 상태 방어를 보강했다.
- 직업훈련 탭 전환 시 선택된 훈련실/훈련생 상태가 깨져 빈 화면이 나오지 않도록 방어 코드를 추가했다.
- 예산관리에는 사업 등록/관리, 사업별 지출 필터, 사업별 잔액 표시를 복구했다.
- 사업 예산 정보는 새 IndexedDB store 없이 `localStorage`의 `jjss:budget-projects`에 저장하고, 백업/복원 JSON에 `budgetProjects`로 포함한다.

## 같은 이용자 최근 기록 참고자료 기능
- 직업평가는 이용자 기반 연결 안정성이 낮아 이번 버전의 최근 기록 참고 대상에서 제외했다.
- 최근 기록 참고 기능은 직업훈련 및 고용지원 기록만 대상으로 한다.
- 같은 이용자의 직업훈련/고용지원 기록을 자동 병합하지 않고, 사용자가 `최근 기록 참고` 버튼을 눌렀을 때만 문서 생성 프롬프트 참고자료로 불러오도록 했다.
- 원본 문서는 자동 수정하지 않는다.
- 참고자료 요약 자체도 자동 저장하지 않는다.
- 생성된 최종 문서만 사용자가 저장 버튼을 눌렀을 때 기존 저장 흐름으로 저장한다.
- DB 구조와 저장소 구조는 변경하지 않았다. 새 IndexedDB store도 만들지 않았다.
- 고용지원은 기존 `caseDocuments`, 직업훈련은 기존 `trainingState`를 사용한다.
- 동명이인 혼합을 막기 위해 `id`/`seekerId`를 우선 사용하고, 이름 fallback은 식별자가 없고 이용자가 유일하게 식별되는 경우에만 제한적으로 사용한다.
- 후속 개선으로 참고자료 범위와 요약 품질을 개선할 수 있다. 직업평가 이력 연계는 안정적인 이용자 식별자 저장 구조가 마련된 뒤 별도 검토한다.

## 업무지원도구 전체 작동성 점검
- 업무지원도구 4개 카테고리 구조는 유지하고, 화면에 노출된 카드가 실제 도구 화면으로 이동하는지 점검했다.
- 공문서 작성, 문장 개선기, 쉬운 글 변환기, 보도자료, 블로그, 이름/제목 생성 등 텍스트 생성 도구는 입력값이 없으면 실행하지 않고 안내를 표시하도록 정리했다.
- AI 문서 질의응답은 문서 없이 일반 질문만 보내지 않도록 막고, 질문이 없을 때 안내를 표시하도록 보강했다.
- 개인정보 비식별화는 Gemini 호출이 실패해도 로컬 규칙 기반 마스킹 결과를 보여주도록 보강했다. 원문은 자동으로 덮어쓰지 않는다.
- 문서 OCR은 예산 OCR과 용도를 구분해 안내하고, 파일 미선택/키 없음/분석 실패 시 무한 로딩이 없도록 유지했다.
- 데이터 대시보드는 CSV/JSON 텍스트 데이터를 읽어 행 수, 숫자 합계, 평균 지표 위젯으로 반영하도록 보강했다. 미구현 저장 기능은 노출하지 않고 복사 중심 흐름으로 유지한다.
- 홍보물 이미지 생성과 나노바나나 일정표는 이미지 생성 권한, quota, 모델 상태에 따라 실패할 수 있으므로 대체 안내를 유지한다.
- 위기대응 시뮬레이터는 AI 실패 시 기본 대응 템플릿을 표시하는 흐름을 유지한다.
- 이번 점검에서도 `DB_VERSION`, IndexedDB store, `caseDocuments`, `trainingState`, settings/API 키 저장 흐름은 변경하지 않았다.

## 이용자 및 사업체/구인 정보 수정 기능
- 이용자 목록과 사업체/구인 목록에 수정 버튼을 추가했다.
- 수정 버튼을 누르면 기존 등록 모달을 수정 모드로 재사용하며, 기존 값이 입력칸에 채워진다.
- 수정 저장 시 기존 `id`를 유지하고 내용만 `updateDoc` 흐름으로 갱신한다.
- 이용자는 기존 `seekerId` 값을 새로 생성하지 않고 사용자가 입력한 값만 저장한다. 기존 사례문서/훈련/매칭 연결에 쓰이는 `id`는 바꾸지 않는다.
- 사업체/구인은 기존 job `id`를 유지한다. 매칭 의견이 `jobId`를 사용하는 경우 연결이 유지된다.
- 신규 등록 흐름(`addSeeker`, `addJob`)은 그대로 유지했다.
- `DB_VERSION`, IndexedDB store, `caseDocuments`, `trainingState`, settings/API 키 저장 흐름은 변경하지 않았다.

## 기존 작성 문서 카드 가독성 개선
- 사례 이력 모달과 고용지원 사후관리 타임라인의 기존 문서 카드 본문 영역을 더 크게 조정했다.
- 상담일지, 정기평가, 취업 후 적응지원처럼 긴 문서를 기본 8~12줄 이상 확인할 수 있도록 본문 높이, 글자 크기, 줄간격, 여백을 보강했다.
- 긴 문서는 카드 내부 스크롤로 읽을 수 있게 유지했다.
- 저장, 복사, 삭제 버튼은 유지하고 hover/focus 스타일만 보강했다.
- 이번 작업에서는 `DB_VERSION`, IndexedDB 데이터, `caseDocuments` 저장/조회 흐름, 암호화/복호화 로직을 변경하지 않았다.

## 직업훈련·예산·업무도구 문서 품질 개선
- 직업훈련 문서 작성 영역에 고용지원과 유사한 `현재 내용 기반 보완` UI를 보강했다.
- 적용 대상은 훈련계획서, 훈련 상담일지, 정기평가서, 작업수행 체크리스트, 현장중심 직업훈련 기록, 보호자/유관기관 공유 요약이다.
- 직업훈련 문서 보완은 기존 `buildCurrentContentRegenerationPrompt`와 각 문서 생성 함수를 재사용하며, 저장은 기존 `trainingState` 자동저장 흐름을 유지한다.
- 예산 사업 등록/수정 시 총예산 입력란에 1,000단위 콤마가 표시되도록 개선했다. 내부 저장값은 숫자 타입을 유지한다.
- 개인정보 비식별화/LLM 처리 흐름은 점검만 진행했다. 비식별화 도구는 원문과 결과를 분리해 표시하며, 일반 LLM 호출은 로컬 비식별화 후 응답을 복원하는 흐름을 사용한다.
- 문장개선기는 기존 문체 유지, 문법/맞춤법/띄어쓰기, 문장 흐름 개선, 과장 표현 제거 기준을 강화했다.
- 전문 블로그 작성은 SEO 제목, 추천 부제, 개선된 본문, 핵심 요약, 추천 태그 출력 구조로 보강했다.
- 이번 작업에서도 `DB_VERSION`, IndexedDB store, `caseDocuments`, `trainingState`, `expenses`, settings/API 키 저장 흐름은 변경하지 않았다.

## 직업평가 이력 수정/삭제 및 사진 기반 직무분석지 개선
- 직업평가 `저장 문서/이력`에서 저장된 결과분석/종합소견서를 선택해 직접 수정, 저장, 복사, 불러오기, 삭제할 수 있게 했다.
- 직업평가 이력은 기존 `localStorage` 키 `jjss:vocational-evaluation-history` 구조를 유지한다.
- 삭제 시 확인창을 띄우며, 확인한 해당 기록만 삭제한다.
- 고용지원 `직무분석지 작성` 탭을 사진 업로드와 간략 특성 입력 중심으로 개선했다.
- 사업체 사진은 여러 장 업로드해 생성 시 Gemini 이미지 입력으로만 사용하고, IndexedDB나 `caseDocuments`에는 저장하지 않는다.
- 직무분석지는 기존 `caseDocuments` 저장 흐름의 `job_analysis` 타입을 유지한다.
- 직무분석지 프롬프트에는 물품입출고, 외부인출입, 협력작업, 세부과제, 지식/기능, 제공가능한 지원수준, 사업주 면담 항목을 반영했다.
- 첨부 지침 중 체인 오브 사고, thinking 태그, 보안 지시사항, 내부 사고 과정 관련 내용은 프롬프트에 포함하지 않았다.
- 불필요하거나 정리 가능한 코드/파일은 실제 삭제하지 않고 점검 보고만 수행했다.

## 사업체/구인정보 상세 필드와 사업체 기반 직무분석지
- 사업체/구인 등록 및 수정 모달에 직무내용, 요구조건, 배려사항, 채용상태, 담당자, 연락처 필드를 추가했다.
- 기존 `jobs` store와 job `id`를 유지하고, 새 IndexedDB store나 DB 버전 변경 없이 선택 필드만 확장했다.
- 사업체/구인 목록 상세에서 추가 필드를 확인할 수 있게 했다.
- 고용지원의 직무분석지 작성 기준을 이용자 필수 선택에서 사업체/구인정보 선택 중심으로 변경했다.
- 직무분석지는 선택한 사업체 정보, 사진, 간략 특성, 사업주 면담 내용을 참고해 생성한다.
- 사진 파일 자체는 저장하지 않고, 저장 문서에는 사진 파일명/사진 수 정도만 남긴다.
- 직무분석지는 기존 `caseDocuments` 흐름의 `job_analysis` 타입으로 저장한다.

## 릴리즈 전 확인
- `npm run build` 통과
- `TEST_CHECKLIST.md`를 최신 복구 기능 기준으로 갱신
- 홈 카드 7개, 직업평가 3개 탭, 직업훈련 4개 탭, 고용지원 5개 탭, 업무지원도구 4개 카테고리, 자료수집 수동 확인 필요
- `release/`, `dist/`, `node_modules/`, `.env`, `.env.local`, 실제 API 키, 개인정보 DB 파일 제외 확인

## 이전 업데이트 기능 복구 1~6단계 요약
- 1단계: 스크린샷 1~13과 현재 코드에 남은 기능을 비교해 복구 매핑 문서를 작성했다.
- 2단계: 직업평가와 직업훈련 화면을 탭 구조로 정리하고, 실제 작동하는 버튼만 노출했다.
- 3단계: 고용지원/사례관리 화면을 5개 탭으로 복구하고, 면접일지와 직무분석지를 `caseDocuments` 저장 흐름에 연결했다.
- 4단계: 업무지원도구를 4개 카테고리로 정리하고, 문서 OCR/비식별화/이미지 생성/일정표/위기대응 접근 경로를 명확히 했다.
- 5단계: 홈 화면 기능 카드를 실제 라우트가 있는 6개 기능으로 정리했다.
- 6단계: 최종 테스트 체크리스트, 복구 메모, 복구 계획서를 최신 상태로 갱신했다. 이 단계에서는 코드 구조를 변경하지 않았다.

## 남은 기술 부채
- OCR/PDF/이미지 생성은 API 키 권한, quota, 모델 상태에 따라 실패할 수 있다.
- 실패하더라도 사용자 안내가 표시되고 작성 중인 내용이 유지되면 1차 통과로 본다.
- 번들 크기 경고는 현재 릴리즈 차단 요소는 아니며, 추후 lazy loading 개선 대상으로 관리한다.
- 직업평가 저장 문서/이력은 현재 localStorage 기반이므로, 장기적으로 `caseDocuments` 연계를 검토한다.
- 직업평가는 이용자 기반 연결 안정성이 낮아 최근 기록 참고 대상에서 제외한다.
- 최근 기록 참고 기능은 직업훈련·고용지원 기록만 대상으로 한다.
- 매칭 의견을 사례 이력 패널에서 바로 매칭 화면으로 이어서 여는 라우팅은 후속 개선 대상이다.

## 커밋 제외 대상
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

## Gemini API 사용량 급증 방지 장치
- Google AI Studio 모니터링에서 GenerateContent 요청 급증과 오류율 상승이 확인될 수 있어 Gemini 호출 경로를 재점검했다.
- 주요 호출 위치는 `generateText` 텍스트/이미지 입력, `generateImage` 이미지 생성, `performOCR`의 Gemini fallback/PDF OCR, 영수증 itemized parse, 직업평가 파일 분석/종합보고서 생성, 문서 질의응답이다.
- 텍스트 생성은 선택된 provider/model 1개만 호출한다. 여러 Gemini 모델을 자동 순차 호출하는 구조는 추가하지 않았다.
- 동일 요청 중복 호출 방지:
  - `generateText`: provider/model/type/userInput/fileData 조합 기준 5초 차단
  - `generateImage`: model/style/prompt 기준 5초 차단
  - `performOCR`: 파일명/크기/type/수정시각 기준 5초 차단
  - 영수증 AI 파싱: OCR 텍스트 앞부분과 길이 기준 5초 차단
- 반복 오류 일시 차단:
  - 같은 기능에서 오류가 연속 3회 발생하면 30초 동안 해당 기능만 차단한다.
  - 정상 성공 시 해당 기능의 오류 횟수는 초기화한다.
  - 차단 메시지는 모델명, API 키, quota 확인을 안내한다.
- 이미지 생성 retry 제한:
  - TEXT+IMAGE 응답에 이미지가 없을 때 IMAGE 전용 모드로 최대 1회만 재시도한다.
  - retry 발생은 console.warn으로 확인 가능하다.
  - 홍보물/일정표 생성 버튼은 loading 중 재클릭되지 않는다.
- OCR fallback 안내:
  - 이미지 OCR은 Vision API를 먼저 시도하고 실패 시 Gemini fallback을 1회 시도한다.
  - PDF OCR은 Gemini API를 사용한다.
  - OCR 화면에 호출 순서와 fallback 안내를 표시했다.
  - OCR 실패 시 기존 파일 선택과 이전 결과는 유지한다.
- 문서 질의응답 history 제한:
  - 화면의 전체 대화는 유지한다.
  - API 전송 history만 최근 5턴 또는 10,000자 중 작은 범위로 제한한다.
  - 큰 PDF/이미지 파일은 파일 크기와 페이지 수에 따라 사용량이 늘 수 있음을 안내한다.
- 모델별 비용/권한 안내:
  - 설정 화면에 텍스트 생성, PDF/이미지 분석, 이미지 생성, Preview 모델, Gemini 3.1 Pro Preview 주의, Flash/Flash-Lite 권장 안내를 추가했다.
- 변경하지 않은 것:
  - `DB_VERSION`
  - IndexedDB store 목록
  - 기존 데이터
  - 기존 문서 생성 기능
  - Gemini API 키 저장/복호화 흐름
  - OpenAI/Claude/provider 설정 구조

## Gemini 3.1 Flash-Lite GA 모델명 및 백업 안내 보강
- Gemini 3.1 Flash-Lite Preview 모델명을 정식 모델명 `gemini-3.1-flash-lite`로 교체했다.
- 신규 기본 Gemini 모델을 `gemini-3.1-flash-lite`로 변경했다.
- 기존 저장값이 `gemini-3.1-flash-lite-preview`인 경우 앱 로딩 시 `gemini-3.1-flash-lite`로 자동 보정한다.
- 설정 화면과 문서 안내에는 `Gemini 3.1 Flash-Lite(기본)`으로 표시한다.
- 다른 preview 모델(`gemini-3-flash-preview`, `gemini-3.1-pro-preview`)과 OpenAI/Claude 설정 구조는 변경하지 않았다.
- 예산 지출 등록 입력 검증 메시지를 보정했다.
  - 사업 미선택: 사업 선택 안내
  - 일자 누락: 일자 입력 안내
  - 품명 누락: 품명 입력 안내
  - 금액 누락/0 이하: 금액 입력 또는 올바른 금액 입력 안내
- Windows와 macOS 데이터 저장 위치 및 업데이트 전 백업 안내를 설정 화면에 추가했다.
- 데이터 저장 방식은 기존 IndexedDB/localStorage/settings 기반을 유지한다.
- 백업/복원 기능을 점검하고 API 키 제외 원칙을 유지했다.
  - 내보내기 파일에서 `apiKey`, `apiKeyEncrypted`, `visionApiKey`, `visionApiKeyEncrypted`를 비운다.
  - 불러오기 시 settings의 API 키는 기존 현재 설정 값을 보존해 백업 파일의 빈 키가 덮어쓰지 않게 했다.
- `DB_VERSION`, IndexedDB store, 기존 데이터, 기존 API 호출 wrapper 구조는 변경하지 않았다.

## 예산관리 사용성 개선
- 사업 미지정 지출 저장을 허용했다.
  - 지출 등록 시 사업 선택은 필수가 아니다.
  - projectId가 없는 지출은 목록과 CSV에서 `사업 미지정`으로 표시한다.
  - 사업 미지정 지출은 특정 사업의 사용액/잔액/사용률 계산에는 포함하지 않고, 전체 지출 합계에는 포함한다.
- 예산 초과 경고를 추가했다.
  - 사업이 선택된 지출만 초과 여부를 계산한다.
  - 신규 등록은 현재 사업 사용액 + 입력 금액 기준으로 계산한다.
  - 수정은 기존 지출 id를 제외한 사업 사용액 + 수정 금액 기준으로 계산한다.
  - 초과 시 확인창을 표시하고, 사용자가 취소하면 저장하지 않는다.
- 사업별 예산 사용률과 상태 표시를 추가했다.
  - 사용률 = 사용금액 / 총예산 × 100
  - 70% 미만 정상, 70% 이상 90% 미만 주의, 90% 이상 100% 이하 거의 소진, 100% 초과 초과로 표시한다.
  - 선택 사업 요약과 사업 카드에 사용률/상태를 표시한다.
- 지출 목록 CSV 내보내기를 추가했다.
  - 현재 필터링된 지출 목록 기준으로 내보낸다.
  - 컬럼은 사업명, 지출일자, 품명, 금액, 거래처, 결제수단 또는 결제정보, 비고, 등록일이다.
  - Excel 한글 깨짐 방지를 위해 UTF-8 BOM을 포함한다.
  - 파일명은 `jjss-budget-expenses-YYYY-MM-DD.csv` 형식이다.
- 예산 지출 등록 입력 검증 메시지를 보정했다.
  - 지출일자 누락, 품명 누락, 금액 누락/0 이하를 각각 안내한다.
  - 사업 선택 필수 검증은 제거했다.
- 기존 OCR 반영, 지출품의서, 사업별 잔액 계산 흐름은 유지했다.
- `DB_VERSION`, 새 IndexedDB store, 기존 `expenses`/`budgetProjects` 저장 구조는 변경하지 않았다.

## 긴급 안정화 및 예산 세부 항목 관리
- 예산관리 필터 순서를 검색 → 사업 선택 → 세부 예산 항목 선택 순서로 정리했다.
  - 사업을 선택하면 해당 사업의 세부 예산 항목만 표시한다.
  - 사업 미지정 선택 시 세부 항목 필터는 비활성화한다.
- 사업별 세부 예산 항목 관리를 추가했다.
  - `BudgetProject.budgetItems`를 선택 필드로 확장했다.
  - 기존 사업에 `budgetItems`가 없어도 빈 배열처럼 처리한다.
  - 사업 등록/수정에서 세부 항목 추가, 수정, 삭제와 1,000단위 금액 입력을 지원한다.
  - 세부 항목 합계가 총예산을 초과하거나 다를 때 저장 전 확인창을 표시한다.
- 지출에 세부 예산 항목 선택 필드를 추가했다.
  - `Expense.budgetItemId`, `Expense.budgetItemName`을 선택 필드로 저장한다.
  - 세부 항목 미선택 지출은 항목 미지정으로 표시하고 별도 사용액으로 집계한다.
  - 사업 삭제 시 연결 지출은 기존 `updateExpense` 흐름으로 사업 미지정 전환하며 세부 항목 정보도 비운다.
- 세부 항목별 예산/사용액/잔액/사용률 표시를 추가했다.
  - 항목 사용액은 같은 사업의 `budgetItemId` 일치 지출만 합산한다.
  - 항목 미지정 지출은 사업 카드에서 별도 사용액으로 표시한다.
- CSV 내보내기에 `세부 예산 항목` 컬럼을 추가했다.
- Gemini 모델 선택 목록을 3개 중심으로 정리했다.
  - Gemini 3.1 Flash-Lite(기본): `gemini-3.1-flash-lite`
  - Gemini 3 Flash Preview: `gemini-3-flash-preview`
  - Gemini 3.1 Pro Preview: `gemini-3.1-pro-preview`
  - 지원 목록에서 제외된 기존 Gemini 저장 모델은 앱 로딩 시 기본 모델로 보정하고 안내한다.
- API 과사용 방지 guard를 정상 문서 생성을 과도하게 막지 않도록 완화했다.
  - 중복 차단 시간은 5초에서 2초로 조정했다.
  - 중복 key는 기능 영역, 문서 유형, provider/model, 입력 hash 기준으로 좁혔다.
  - 오류 3회 반복 차단 key도 기능+문서유형+모델 기준으로 분리했다.
  - 고용지원, 직업훈련, 문서 질의응답, 직업평가 주요 호출부에 feature/documentType 정보를 부여했다.
- Gemini 오류 안내를 조금 더 구분했다.
  - API 키, 모델명, quota/429, 권한/403, 요청 형식/400, 네트워크 오류를 분리해 안내한다.
- 직업평가 종합소견서를 PDF 없이도 작성할 수 있게 했다.
  - 직접 입력, 최근 결과분석기 내용, 선택한 저장 결과분석 문서, 업로드 파일 순서로 참고 내용을 구성한다.
  - “최근 결과분석 내용 불러오기” 버튼과 PDF 없이 작성 가능 안내를 추가했다.
- 기존 문서 작성 프롬프트 조합, 현재 내용 기반 보완, 앞선 문서 참고, caseDocuments/trainingState/localStorage 저장 흐름은 변경하지 않았다.
- 이번 작업에서도 `DB_VERSION`, IndexedDB store, 기존 데이터 삭제/초기화는 변경하지 않았다.

## Gemini 3.1 Flash-Lite 503 모델 혼잡 안내 보강
- Gemini 3.1 Flash-Lite는 기본 모델로 유지했다.
- Gemini 모델 선택 목록은 기존 3개 구성을 유지했다.
  - Gemini 3.1 Flash-Lite(기본)
  - Gemini 3 Flash Preview
  - Gemini 3.1 Pro Preview
- Gemini 3.1 Flash-Lite에서 503 high demand 또는 Service Unavailable 응답이 발생하면 일시적 모델 혼잡으로 안내한다.
- 계속 실패할 경우 설정에서 Gemini 3 Flash Preview로 변경해 다시 시도할 수 있다고 안내한다.
- 503 오류가 API 키 오류, quota 초과, 모델명 오류와 섞이지 않도록 별도 메시지로 분리했다.
- 같은 기능+문서유형+모델에서 503이 반복되어 30초 차단이 걸리면 모델 혼잡 전용 차단 안내를 표시한다.
- 자동 무한 재시도는 추가하지 않았다.
- 버튼 1회당 일반 문서 생성 요청 1회 원칙을 유지했다.
- 개발 모드에서만 503 발생 시 featureKey, documentType, model, status, durationMs, requestHash, reason만 `console.debug`로 남기고 원문 프롬프트, 이용자명, API 키는 출력하지 않는다.

## 예산 세부 항목 의미 정리 및 직업평가 PDF 호출 점검
- 세부 예산 항목을 사업명 하위의 예산 분류로 명확히 정리했다.
  - 안내 문구를 “사업 안에서 사용할 예산 항목을 나누어 등록합니다. 예: 인건비, 사업비, 회의비, 여비”로 변경했다.
  - 항목명 placeholder를 인건비, 사업비, 회의비, 여비, 물품비, 강사비 등으로 수정했다.
  - 금액 placeholder를 항목 예산금액으로 수정했다.
  - 사업명 입력값이 세부 항목명에 자동으로 들어가는 흐름은 추가하지 않았고, 세부 항목은 비워둔 상태로 직접 입력하게 유지했다.
- 사업별 세부 예산 항목별 잔액관리를 보강했다.
  - 사업 카드에는 총예산, 사용액, 잔액, 사용률을 먼저 표시한다.
  - 세부 항목별 현황은 접기/펼치기 영역에서 항목별 예산, 사용액, 잔액, 사용률로 확인한다.
  - 항목 미지정 지출은 해당 사업 안에서 항목 미지정 사용액으로 별도 표시한다.
- 직업평가 PDF 분석 호출 구조를 점검했다.
  - 분석 버튼 1회 클릭 시 `handleAnalyze`가 `analyzeTestResults`를 1회 호출한다.
  - PDF는 `buildFilePart`에서 파일 업로드 준비 호출이 발생하며, 이는 PDF 분석에 필요한 정상 흐름이다.
  - 실제 분석용 `generateContent`는 `generateDocumentText`에서 1회 호출된다.
  - preflight 요청은 브라우저 CORS 동작이므로 수정하지 않았다.
  - `isAnalyzing`으로 loading 중 버튼 재클릭이 막혀 있어 추가 수정하지 않았다.
- Gemini 3.1 Flash-Lite 503 high demand 안내는 기존 모델 혼잡 안내를 유지했다.
- 자동 재시도는 추가하지 않았고, PDF 분석 흐름과 직업평가 결과분석/종합소견서 기능은 삭제하거나 우회하지 않았다.

## 작성내용 점검 프롬프트 개선
- 작성내용 점검 기능을 직업재활계획서 수행방법 기반 상담일지 보완 방식으로 개선했다.
- 직업재활계획서에서 계획 수립일, 직업목표, 장기목표, 단기목표, 수행방법, 핵심 지원 방향을 먼저 확인하도록 프롬프트를 수정했다.
- 상담일지, 현장지원일지, 이용자상담, 보호자상담 기록을 계획 수립 전, 수립 직후, 수립 후, 변화 확인/유지지원 흐름으로 구분하도록 했다.
- 상담일자와 상담장소를 유지하고, 기존 사실관계와 상담 흐름을 왜곡하지 않도록 원칙을 강화했다.
- 계획 수립 전 기록에는 수행 완료처럼 쓰지 않고, 어려움 확인과 계획 수립 필요성 논의 중심으로 보완하도록 했다.
- 수행방법 반영이 필요한 경우에도 허위 달성 표현이나 과장된 성과 표현을 피하고, “함께 확인함”, “필요성을 논의함”, “추가 확인이 필요함” 등 기록 안정성이 높은 표현을 사용하도록 했다.
- 출력 형식을 반영 기준 요약, 상담일지 점검 결과, 수정된 상담일지, 반영 내용 확인 구조로 고정했다.
- 점검 결과와 수정 결과가 너무 짧아지지 않도록 상담일지별 5~10문장 수준의 실무 기록형 보완 지시를 추가했다.
- 기존 작성내용 점검 UI 구조, 복사 흐름, 고용지원 문서 저장 흐름, API guard, 모델 설정, API 키 저장/복호화 흐름은 변경하지 않았다.

## 업무지원도구 외부 링크 갱신
- 업무지원도구 이력서 작성 프로그램 외부 링크를 `https://service-459909947241.us-west1.run.app/`로 갱신했다.
- 버튼명, 설명, 아이콘, 카드 구조와 다른 외부 도구 링크는 변경하지 않았다.

## 직업재활계획서 양식 미리보기 및 로컬 출력
- 첨부된 직업재활계획서 양식의 제목, 결재란, 기본정보, 배경정보, 사례회의, 목표표, 작성정보 구조를 반영한 A4 미리보기를 추가했다.
- 기존 직업재활계획서 작성 결과와 선택 이용자 정보를 별도 `RehabPlanFormData`로 자동 매핑한다.
- 자동 매핑이 비어 있거나 정확하지 않은 항목은 편집 영역에서 직접 수정할 수 있고, 빈 출력 항목은 `추가 입력 필요`로 표시한다.
- 장기목표, 단기목표, 서비스 기간, 수행방법/담당자, 목표달성여부를 여러 행으로 추가·수정할 수 있다.
- PDF 출력은 현재 기기의 브라우저/Electron 인쇄 창을 사용하며 사용자가 `PDF로 저장`을 선택하는 로컬 방식이다.
- PNG 출력은 현재 A4 미리보기 전체를 한 장의 이미지로 로컬 생성하며, 문서나 개인정보를 외부 서버로 전송하지 않는다.
- 출력 기본 파일명은 `직업재활계획서_YYYY-MM-DD` 형식으로 이용자명을 포함하지 않는다.
- 출력 중 중복 클릭을 막고 실패 시 기존 작성 본문과 매핑 편집값을 유지한 채 오류를 표시한다.
- 출력 카드와 미리보기 도구막대에 개인정보 및 민감 상담 내용 공유 주의 문구를 표시한다.
- 기존 직업재활계획서 생성, 저장, 복사, 초기화, 현재 내용 기반 보완 textarea와 `caseDocuments` 흐름은 유지했다.
- 정기평가 프롬프트 타입 누락, 사례문서 저장 콜백 타입 불일치, 직무분석 참고자료 연결, OCR 수량/단가 타입 등 빌드에서 확인된 연결 오류만 최소 보정했다.
- `DB_VERSION`, IndexedDB store 목록, 기존 데이터, API 키 암호화/복호화, API 과사용 방지 guard는 변경하지 않았다.
- 새 런타임 dependency는 추가하지 않았다.

## 2026-08-12 안정화 추가 점검

- 백업 복원은 모든 대상 스토어의 형식과 ID를 먼저 검증한 뒤에만 변경을 시작하도록 보강했다.
- 복원 대상 스토어는 변경 전에 메모리 스냅샷을 만들고, 일부 반영 중 실패하면 영향받은 스토어와 `budgetProjects`를 복원 전 상태로 되돌리도록 했다. 되돌리기에 실패한 스토어가 있으면 오류에 목록을 포함한다.
- 백업 파일에 들어 있는 API 키·토큰·비밀번호·인증정보는 복원하지 않고 현재 기기의 값을 유지한다. 현재 값이 없으면 빈 값으로 유지한다.
- Gemini 텍스트 모델은 `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview` 세 종류로 고정하고, 사용자가 선택한 지원 Preview 모델은 재시작 후에도 유지한다.
- 503/high demand 응답은 API 키·쿼터·모델명 오류와 구분해 일시적 혼잡 및 Gemini 3 Flash Preview 대체 선택을 안내한다. 자동 재시도나 자동 모델 전환은 추가하지 않았다.
- 직업재활계획서 기본정보는 이용자 객체의 선택 필드(생년월일·주소·연락처)를 먼저 사용하고, 없을 때만 메모의 라벨 값을 보조적으로 사용한다.
- 예산 세부 항목에 기존 선택 필드인 메모를 직접 입력하는 칸을 연결했다. 예산 데이터 구조와 IndexedDB store는 변경하지 않았다.
- Electron 외부 링크는 HTTP/HTTPS만 기본 브라우저로 전달하고 `file:`, `javascript:`, `data:` 및 잘못된 URL은 차단한다.
- Windows NSIS 제거 설정은 사용자 앱 데이터를 자동 삭제하지 않도록 `deleteAppDataOnUninstall: false`로 맞췄다.
- Gemini와 OCR의 관련 오류 로그는 프롬프트, API 키, 키가 포함된 URL 대신 오류 이름·상태·코드만 남기도록 축소했다.
- 기존 이력서 작성 링크는 요청된 `https://service-459909947241.us-west1.run.app/`와 이미 일치해 변경하지 않았다.
- `DB_VERSION`, IndexedDB store 목록, `caseDocuments`, `trainingState`, `budgetProjects`, API 키 암호화/복호화 및 API 과사용 방지 guard는 변경하지 않았다.

### 2026-08-13 실행 검증

- 임시 프로덕션 빌드에서 홈, 설정, WorkMate 작성 내용 점검, 예산 세부 항목 메모, 업무지원도구 이력서 링크를 실제 브라우저 DOM으로 확인했다.
- 별도 origin의 격리 IndexedDB에서 잘못된 백업 사전 거부, 인증정보 제외/현재 값 보존, 지원 모델 선택 보존, quota 장애 주입 후 스냅샷 롤백을 확인했다.
- UI 검증용으로 만든 합성 이용자 `검증용이용자`/`TEST-001` 한 건은 검증 직후 해당 두 값이 모두 일치하는 경우에만 삭제했고, 홈 화면에서 등록 이용자 `0명`을 다시 확인했다.
- 실제 Gemini/Vision API 호출, PDF/PNG 저장, Windows 설치본 실행·제거는 사용자 환경에서 별도 수동 검증이 필요하다.

## 2026-08-13 최종 안정화 보완

- Gemini 오류에 사용자 안내 완료 표식과 안전한 `status`·`reason`을 유지해, 하위 호출에서 503 모델 혼잡으로 분류된 오류가 상위 PDF/파일 wrapper에서 손상 오류로 다시 바뀌지 않도록 했다. 400·403·404·429 의미, 모델 선택 정책, 요청 횟수, 자동 재시도 없음은 그대로 유지했다.
- 예산 세부 항목 삭제 시 연결 지출이 있으면 먼저 확인하고, 확인 후 사업 저장 시 해당 지출의 `budgetItemId`와 `budgetItemName`만 비운다. 지출 자체와 사업 연결·금액·날짜·품명·거래처 등은 보존하며 집계·필터·CSV에서는 `항목 미지정`으로 처리한다. 저장 실패 시 지출 연결 상태도 원래 값으로 되돌린다.
- 전체 백업에 optional `vocationalEvaluationHistory`를 추가했다. 이 필드가 있는 유효 백업만 직업평가 이력을 복원하고, 필드가 없는 구버전 백업은 현재 이력을 유지한다. 잘못된 배열/항목은 데이터 변경 전에 거부하며 복원 중 실패 시 직업평가 이력도 기존 값으로 롤백한다.
- 직업평가 이력 내보내기는 현재 이력 항목의 허용 필드만 새 객체로 구성한다. 기존 백업의 인증정보 제외와 현재 기기 API 키 보존 정책은 변경하지 않았다.
- 지출품의서의 빈 새 창 방식은 Electron의 HTTP/HTTPS 전용 새 창 허용 목록에 의해 차단될 수 있어, 동일한 문서 HTML을 숨김 로컬 iframe에 작성하고 `print()`하는 방식으로 바꿨다. 새 BrowserWindow, 외부 서버, 새 라이브러리, UI/문서 디자인 변경은 없다.
- 격리 브라우저 하네스에서 503 이중 정규화 방지, 상태별 오류 구분, 직업평가 이력 내보내기/복원, 구버전 이력 보존, 손상 백업 사전 거부, 인증정보 보존을 확인했다. 예산 삭제 확인창 발생은 실제 화면에서 확인했고, 지출 보존·항목 링크 해제·기타 필드 유지·CSV 표시는 순수 helper 테스트로 확인했다.
- 실제 Gemini 503 응답, 확인창 승인부터 저장 후 재진입까지의 전체 예산 UI 흐름, 패키징된 Windows Electron의 지출품의서 인쇄 대화상자는 사용자 환경에서 수동 검증이 필요하다.
- `DB_VERSION`은 3으로 유지했고 IndexedDB store 추가·이름 변경·데이터 초기화는 하지 않았다. 직업재활계획서, 작성내용 점검, `caseDocuments`, `trainingState`, Gemini 모델 정책과 API 과사용 방지 guard는 변경하지 않았다.

## 2026-08-13 Windows 서명·업그레이드·계획서 PNG 안정화

- 당시 릴리즈 문서에서 확인 가능한 최신 Windows 배포본은 `2.2`였고 2.3.0 구조 검증을 수행했다. 현재 package version은 `3.0.0`이며 과거 2.3.0 기록은 설치 이력 설명이다.
- `appId`는 `com.jjss.desktop`으로 유지했다. 현재 PC의 기존 per-machine `JJSS Pro 1.0.0` 제거 키 `763ac432-8ee1-5a44-b6ab-56ce675b7536`가 이 appId에서 electron-builder가 계산하는 GUID와 정확히 일치함을 확인했다.
- 기존 설치가 `C:\Program Files\JJSS-Pro`의 per-machine 설치임을 확인해 새 NSIS도 `perMachine: true`로 맞췄다. `oneClick: false`, 설치 경로 변경 허용, `deleteAppDataOnUninstall: false`는 유지하며 custom 강제 종료·사전 제거·데이터 삭제 코드는 추가하지 않았다.
- 기존 1.0 설치의 표시명은 `JJSS Pro`지만 현재 저장소와 확인된 2.2 배포 파일명 계열은 `JJSS`다. GUID가 동일해 업그레이드 감지는 가능하므로 productName을 과거 1.0 표시명으로 되돌리지 않았고, 새 설치 후 표시명/바로가기 교체는 수동 업그레이드에서 확인한다.
- 실제 기존 앱 위 설치는 보존 대상 데이터가 있는 시스템을 변경하므로 자동 실행하지 않았다. 설치 전 전체 백업 후 기존 설치 감지·업그레이드·데이터 유지 확인이 필요한 수동 검증 항목이다.
- `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` 존재와 로컬 PFX 경로만 확인하는 signed build 사전 검사를 추가했다. PFX와 비밀번호는 프로젝트·코드·로그·release에 저장하지 않는다.
- PFX는 저장소 밖의 사용자 지정 경로에 보관한다. 현재 셸에는 서명 환경변수가 없어 signed build 결과는 `N/A - signing credentials not configured in this shell`이다. 미서명 NSIS 구조 검증본 `JJSS Setup 2.3.0.exe`는 생성됐고 version 2.3.0, per-machine, Authenticode `NotSigned`를 확인했다.
- PNG 저장은 기존 SVG foreignObject 방식을 한 번 우선 시도하고 실패할 때만 동적 import한 `html2canvas`를 한 번 실행한다. 대상은 `.rehab-plan-document`로 제한하고 Blob URL은 클릭 후 1.5초 뒤 해제한다.
- Canvas 최대 변과 픽셀 수를 사전에 제한하고 문서가 지나치게 길어 읽을 수 없는 축척이 되면 PDF 이용을 안내한다. DEV 로그는 단계·치수·오류 종류만 기록하며 이용자/계획서 내용은 기록하지 않는다.
- 합성 데이터만 사용한 Chromium 다운로드에서 짧은 문서 1,588×2,246, 보통 문서 1,588×7,548, 긴 문서 988×16,383 및 강제 fallback 1,588×7,548 PNG의 서명·0 byte 아님·실제 decode를 확인했다. 검증 파일은 확인 후 삭제했다.
- PDF 출력 함수와 양식 UI/CSS는 변경하지 않았다. `DB_VERSION`, IndexedDB store, `caseDocuments`, `trainingState`, 예산 구조, userData 경로, API/Gemini 정책도 변경하지 않았다.

## 2026-08-14 전체 최종 검증·최소 안정화

- 전역 오류·ErrorBoundary·DB/화면/AI/OCR 로그에서 raw 오류 객체를 제거하고 영숫자 분류 메타데이터만 기록한다. 오류 메시지, API 응답 본문, URL, 프롬프트와 이용자 입력은 로그에 포함하지 않는다.
- 일괄등록은 모든 행의 열 수와 필수 회사명/이름을 저장 전에 검증한다. 형식 오류가 있으면 행 번호를 알리고 쓰기를 시작하지 않는다. IndexedDB 런타임 장애까지 하나의 대형 transaction으로 재설계하지는 않았다.
- OCR·직업평가·문서채팅·AI 도구의 이미지/PDF는 20MB, 텍스트 파일은 10MB, 저장되는 훈련/사업체 사진은 5MB로 제한한다. 빈 파일·지원하지 않는 형식·동일 파일 중복을 FileReader/Base64 전에 거절한다.
- 지출품의서 HTML template의 제목은 고정하고 사용자 지출 제목은 HTML 작성 후 `document.title` 속성으로 설정한다. React가 escape한 본문 DOM을 복사하는 기존 hidden iframe 출력 구조와 디자인은 유지한다.
- CSV·백업 JSON·텍스트 다운로드 Blob URL은 클릭 후 1.5초 뒤 해제한다. WorkMate 사진 미리보기, 매칭 지연 타이머와 Toast 타이머는 삭제 또는 언마운트 때 정리한다.
- InfoMate 사용자 링크는 저장과 렌더 모두 HTTP/HTTPS만 허용한다. 기존 저장값이 다른 프로토콜이면 링크로 표시하지 않는다.
- OpenAI Bearer 헤더의 후행 공백을 제거했다. OpenAI/Anthropic 오류 응답 원문은 사용자에게 전달하지 않고 HTTP 상태별 일반 안내만 사용한다. Gemini 모델 3종·기본값·요청 guard·재시도 정책은 변경하지 않았다.
- Electron 36.9.5 캐시 ZIP의 SHA-256을 패키지 체크섬과 대조한 뒤 누락된 `node_modules` 바이너리를 복원했다. JJSS 제목의 응답 가능한 Electron 창 생성을 확인했지만 메뉴 순회·인쇄·외부 링크 클릭은 수동 검증 대상으로 남겼다.
- 일반 Electron 패키징은 electron-builder의 `winCodeSign` 캐시에 macOS용 symlink를 만들 Windows 권한이 없어 실패했다. package 설정을 바꾸지 않고 `signAndEditExecutable=false`를 명령행에만 준 unsigned 구조 검증으로 2.3.0 NSIS를 생성했다. 이 결과는 앱 리소스 편집·코드서명을 생략한 검증본이며 배포용 signed 설치본이 아니다.
- 최종 구조 검증본은 150,182,704 bytes, SHA-256 `3E799B6BBAA1C91FA30686FA9CAE1A6A8E159E1A971927D6E2D3A4F9BEA8536D`, Authenticode `NotSigned`였다. builder는 Windows 전용 아이콘이 설정되지 않아 기본 Electron 아이콘을 사용한다고 경고했다. 아이콘 파일을 임의 생성하지 않고 후속 배포 자산 확인으로 남겼다.
- 설치된 `JJSS Pro 1.0.0`과 현재 3.0.0은 appId 파생 GUID와 per-machine 범위가 일치한다. 기존 설치 위 실제 업그레이드와 데이터 보존은 자동 실행하지 않았다.
- `DB_VERSION` 3, store 목록, 사용자 데이터, API 키 암호화/복호화, userData 경로, UI/색상/Navbar/라우트는 변경하지 않았다.

## 2026-08-14 실무 중심 출력·릴리즈 보강

- `scripts/check-release-readiness.cjs`를 추가해 package/lock 버전, `appId=com.jjss.desktop`, `productName=JJSS`, `deleteAppDataOnUninstall=false`, signed build 사전검사, 프로젝트 내부 개인 인증서, Git 추적 민감파일, `release/dist/node_modules` 변경을 빌드 전에 확인한다.
- 실제 설치 버전은 스크립트가 추측하지 않는다. `docs/WINDOWS_RELEASE_CHECKLIST.md`에서 레지스트리 확인, 합성 데이터 준비, 기존 설치 제거 없는 업그레이드, 데이터/API 설정 유지, Authenticode 확인 절차를 제공한다.
- 현재 작업 트리에는 이전 패키징 과정의 `release/` 추적 변경이 남아 있어 readiness는 해당 5건을 정확히 감지하고 실패했다. 배포 전 생성물 변경을 커밋 범위에서 제외한 뒤 다시 PASS를 확인해야 한다.
- 직업재활계획서 PDF/PNG/DOCX 버튼을 누를 때 성명·장애유형·생년월일·주소·연락처, 목표·서비스 기간·수행방법, 사례회의, 강점·고려사항·지원방향, 담당자·작성일자, 목표달성 미확인을 점검한다.
- 누락 항목은 `출력 전 확인`에 경고만 표시하며 데이터를 자동 생성·수정하지 않는다. 사용자는 `계속 출력` 또는 `돌아가서 수정`을 선택할 수 있다.
- `scripts/test-rehab-plan-mapper.mjs`는 실제 개인정보가 없는 명확한 제목형·개조식·긴 문장형 fixture 3종으로 핵심 매핑을 검증하며 `PASS 3/3`을 확인했다.
- Markdown 제목 기호(`#`, `**`)를 무시하는 최소 정규화만 추가했다. Gemini 프롬프트와 기존 일반 텍스트 매핑 규칙은 변경하지 않았다.
- PDF 인쇄 CSS는 결재란·짧은 기본정보·머리글은 가능한 한 한 페이지에 유지하고, 긴 사례회의 내용·강점·고려사항·지원방향·목표 수행방법 행에는 전역 `break-inside: avoid`를 강제하지 않도록 구분했다.
- DOCX는 제공 원본의 1개 표, 26행×26열, 병합 셀, 제목·결재란·항목 위치를 유지한 안전한 템플릿을 사용한다. 원본 이용자 데이터 셀은 36개 placeholder로 교체했고 원본 대비 `word/document.xml`만 변경되도록 OOXML을 직접 패치했다.
- 프로젝트 템플릿에서 원본 이름·전화번호·주민번호 패턴을 검사해 0건임을 확인했다. PFX·API 키·실제 개인정보는 포함하지 않았다.
- DOCX는 `RehabPlanFormData`를 그대로 사용하며 JSZip으로 로컬 치환한다. `jszip@3.10.1`은 기존 `docx` 의존성에 이미 설치된 버전을 직접 의존성으로 명시했으며 외부 변환 서버나 Gemini를 호출하지 않는다.
- 합성 데이터 생성본은 1개 섹션, 1개 표, 26행×26열을 유지하고 모든 placeholder 치환, 한글, 여러 줄, 원본 개인정보 미포함을 통과했다. Electron `file://`에서 번들 템플릿을 fetch와 XHR 모두 읽는 것도 확인했다.
- 표준 DOCX 렌더러는 LibreOffice 미설치로 실행할 수 없었고 Microsoft Word COM 보조 렌더도 시간 초과되어 중단했다. 따라서 Word 페이지 레이아웃의 최종 시각 검사는 배포 전 수동 항목으로 남긴다.
- DOCX 실패 시 현재 입력과 미리보기는 유지하며 PDF·PNG 기능을 계속 사용할 수 있다는 일반 안내만 표시한다. 오류 원문이나 문서 내용은 로그에 출력하지 않는다.
- `DB_VERSION`, IndexedDB store, migration, 기존 데이터, API 키 암호화, UI 색상, Navbar, 메뉴, 라우트, 기존 textarea, PDF/PNG 생성 방식은 유지했다.

## 2026-08-17 Windows 업그레이드 및 JJSS 문서 저장체계

- 설치된 `JJSS Pro 1.0.0`은 HKLM 제거 키, `C:\Program Files\JJSS-Pro`, `/allusers`를 사용하는 per-machine 설치로 실측했다. 신규 NSIS도 기존 범위와 같은 `perMachine: true`를 유지한다.
- 기존 appId 파생 GUID `763ac432-8ee1-5a44-b6ab-56ce675b7536`와 신규 `com.jjss.desktop` 파생 GUID가 일치한다. appId, productName, userData 경로는 변경하지 않았다.
- JJSS가 실행되지 않은 상태에서 프로세스·서비스·Run/Startup 항목이 없음을 확인했다. false positive 재현 시 앱 lifecycle이 아니라 설치/제거 호환 문제로 분류한다.
- 신규 Windows 실행파일명은 기존 설치와 동일한 `JJSS-Pro.exe`로 맞췄다. NSIS는 빌더가 확정한 `${APP_EXECUTABLE_FILENAME}`만 exact-name으로 확인하며, 과거 후보 `JJSS.exe`는 더 이상 검사하지 않는다. 실행 중일 때도 `taskkill` 또는 `taskkill /F`를 호출하지 않는다.
- 사용자 정의 `customCheckAppRunning`은 electron-builder 25.1.8의 `installSection.nsh` → `CHECK_APP_RUNNING` 경로에서 실제 호출됨을 확인했다. 영문 `appCannotBeClosed` 오류는 이 매크로가 아니라 `extractAppPackage.nsh`의 설치 파일 복사 실패 경로에서 표시된다. 실제 업그레이드 성공 전에는 해결 완료로 판정하지 않는다.
- 실제 기존 1.0.0 위 업그레이드 설치는 사용자 확인 전에는 실행하지 않았다. 따라서 `cannot be closed` 문제가 완전히 해결됐다고 판정하지 않으며, 설치 전 백업 후 실제 설치 결과를 기록해야 한다.
- Electron 파일 저장의 기본 루트는 Windows에서 쓰기 가능한 `D:\JJSS`를 우선 사용하고, 사용할 수 없으면 `app.getPath('documents')\JJSS`를 사용한다. 제한된 preload/IPC만 사용하며 renderer에는 raw `ipcRenderer`, `fs`, `path`, 임의 시스템 경로가 노출되지 않는다.
- 백업은 `JJSS Pro\백업`, 문서는 직업재활계획서·직업평가·상담·사례관리·예산·회의록·업무지원·이미지·기타 하위 폴더에 저장한다. 저장 전 native save dialog와 저장 후 실제 경로 알림을 제공한다.
- 기존 문서 가져오기는 사용자가 선택한 한 폴더만 기준으로 하며 하위 폴더 포함은 기본 ON이다. 최대 깊이 5·최대 5,000개로 제한하고 symlink/junction은 따라가지 않는다. 기본값은 복사이며, 이동은 크기와 SHA-256 검증 뒤에만 원본을 삭제한다. 충돌은 `(1)` 이름으로 보존한다.
- 합성 트리에서 최상위 7개와 하위 폴더 2개를 분류하고, 6단계 파일·junction 대상·일반 파일 2개 제외, 충돌 이름, copy-verify-delete, 경로·확장자 검증이 모두 통과했다.
- Documents fallback은 런타임 `app.getPath('documents')` 결과를 그대로 사용하므로 Windows 계정명이나 OneDrive 경로를 하드코딩하지 않는다.
- win-unpacked `JJSS-Pro.exe`를 직접 실행해 응답 가능한 패키지 프로세스와 위 경로의 12개 표준 디렉터리를 확인한 뒤 검증 프로세스를 종료했다. 설치 레지스트리와 기존 1.0.0 설치본은 변경하지 않았다.
- 미서명 구조 검증본 `release\JJSS Setup 2.3.0.exe`를 생성했다. 표준 빌드는 Windows 심볼릭 링크 권한 부족으로 winCodeSign 캐시 압축 해제에 실패했고, 현재 셸에는 `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`가 없어 서명 빌드는 실행하지 않았다.
- 프로젝트 내 Windows 아이콘 파일이 없어 검증본은 기본 Electron 아이콘이다. 전용 `.ico` 자산이 복구되기 전에는 아이콘 적용 완료로 판정하지 않는다.
- `DB_VERSION`은 3으로 유지했고 IndexedDB store, localStorage, `caseDocuments`, `trainingState`, 예산 구조, API 키 저장·암호화, userData 경로를 변경하지 않았다. Documents의 JJSS 폴더는 installer/uninstaller가 관리하거나 삭제하지 않는다.

## 2026-08-17 AI 모델 최신화 및 최초 API 키 안내

- Gemini 텍스트 모델은 `gemini-3.6-flash`(기본)와 `gemini-3.5-flash-lite`만 신규 선택 목록에 표시한다. OCR은 별도 하드코딩 없이 사용자가 선택한 Gemini 텍스트 모델을 정규화해 계속 사용한다.
- OpenAI 모델은 `gpt-5.6`, `gpt-5.6-terra`(기본), `gpt-5.6-luna`만 표시한다. 기존 `/v1/chat/completions`와 응답 파싱은 유지하고 최신 모델용 출력 제한 필드만 `max_completion_tokens`로 맞췄다.
- Claude 모델은 `claude-opus-4-8`, `claude-sonnet-5`(기본), `claude-haiku-4-5`만 표시한다. 기존 `/v1/messages` 호출 구조는 유지한다.
- 이전 Gemini/OpenAI/Claude 모델 문자열은 제공사별 규칙으로 최신 모델에 보정한다. 지원하지 않는 값은 각 제공사의 신규 기본값으로 보정하며 저장된 API 키와 Vision 키, 이용자·문서·훈련·예산·평가 데이터는 변경하지 않는다.
- 세 제공사 API 키가 모두 비어 있고 `jjss:api-key-onboarding-v1` 값이 없을 때만 최초 안내를 표시한다. 키가 하나라도 있거나 사용자가 `나중에 설정하기`를 선택하면 반복 표시하지 않는다.
- onboarding의 저장은 기존 settingsStore AES-GCM 암호화 저장을 사용하며 저장만으로 API 생성 요청을 실행하지 않는다. 키가 없는 AI 기능은 제공사를 몰래 바꾸지 않고 설정 이동 안내를 표시한다.
- API 키 발급 링크는 기존 Electron의 HTTP/HTTPS 전용 외부 URL 정책을 거쳐 기본 브라우저에서 연다. 키는 콘솔·URL·백업 JSON에 추가하지 않는다.
- `DB_VERSION`, IndexedDB store, 라우트, Navbar, API 키 암호화/복호화 방식은 변경하지 않았다.
- 빈 저장소 로컬 브라우저에서 최초 안내 노출, `나중에 설정하기` 후 새로고침 미재표시, 최신 모델 2/3/3개 목록, 키 없이 공문서 AI 실행 시 Gemini 키 안내와 설정 이동을 확인했으며 브라우저 오류 로그는 없었다.

## 2026-08-17 AI 자동전환 비용 정책

- 기존 코드에는 실제 Provider failover 설정·실행 경로가 없어, 자동전환 기본 OFF와 최대 3회 상한을 가진 명시적 실행 계획을 추가했다. 활성화하지 않으면 기존 선택 Provider/모델 한 번만 호출한다.
- 비용 정책 기본값은 `economy`, premium 자동승급은 OFF, premium 사용 전 확인은 ON이다. 구버전 `aiFailover`에 신규 필드가 없어도 이 안전값으로 보정하며 기존 API 키와 선택 모델은 유지한다.
- 모델 등급은 현재 등록된 모델 ID만 사용한다. Gemini는 Flash-Lite/Flash를 economy/balanced로만 구분하고 존재하지 않는 premium 모델은 만들지 않는다. OpenAI는 Luna/Terra/Sol, Claude는 Haiku/Sonnet/Opus로 구분한다.
- economy와 balanced 정책에서는 자동 premium 후보를 생성하지 않는다. 사용자가 Settings에서 직접 premium 모델을 선택한 수동 호출은 유지하되, failover가 premium으로 승급하려면 premium 정책 동의와 자동승급 ON이 모두 필요하다.
- premium 정책 최초 선택은 비용 발생 가능성·JJSS의 금액/크레딧 비보장 내용을 확인한 뒤에만 저장한다. 자동 premium 전 확인이 ON이면 `사용`, `저비용 모델 유지`, `취소`를 제공하며 취소 시 premium 요청을 보내지 않는다.
- 다른 Provider 자동전환은 별도의 개인정보 전송 확인과 `allowCrossProvider`가 필요하다. premium 동의만으로 Gemini/OpenAI/Anthropic 사이에 입력을 전송하지 않는다.
- quota, credit, 인증 오류가 난 Provider는 같은 작업에서 다시 호출하지 않는다. credit 부족은 잔액을 우회하거나 강제 사용하지 않고, 동의된 다음 Provider 후보가 있을 때만 전환한다.
- 실제 모델 전환 또는 premium 사용 성공 시 작은 안내만 표시하며 임의 금액·남은 무료량·일일 비용은 계산하거나 표시하지 않는다. token usage metadata와 비용 대시보드는 이번 범위에서 추가하지 않았다.
- 결제 수단 등록, 자동 충전, Billing 활성화, 구독 변경, 크레딧 구매, Key Rotation 기능은 추가하지 않았다.
- `DB_VERSION`, IndexedDB store, API 키 암호화/복호화, 라우트, Navbar는 변경하지 않았다.
- 로컬 설정 화면에서 자동전환 OFF/economy 기본값, 유료 동의 취소 시 미저장, 승인 후 확인 ON·자동승급 OFF, 타사 전송 별도 동의 취소 시 OFF 유지, premium 자동승급 수동 ON을 확인했다. 검증 후 자동전환 OFF/economy/cross-provider OFF로 복원했고 화면 오류 로그는 없었다.
## 2026-08-17 AI API 비용 안전장치

- 사용자 실행 1회를 식별하는 개인정보 없는 AI Job ID와 request fingerprint를 도입했습니다.
- 동일 기능의 in-flight 실행과 완료 후 3초 이내 동일 요청을 차단합니다.
- 자동 retry는 0회, Provider당 최대 1회, Job당 최대 3회로 중앙 제한합니다.
- Google GenAI SDK 요청은 `retryOptions.attempts = 1`로 설정해 SDK 내부 재시도를 비활성화했습니다.
- 이미지 응답 누락 시 수행하던 동일 Provider 자동 재호출과 직무분석 실패 후 컴포넌트 재호출을 제거했습니다.
- 화면 이동 시 활성 AI Job을 취소하고 취소 오류는 failover 대상에서 제외합니다.
- 설정 화면에 해제할 수 없는 API 비용 보호 상태와 개인정보 없는 당일 생성 요청 횟수를 표시합니다.
- DB_VERSION과 IndexedDB store는 변경하지 않았습니다.

## 2026-08-17 최종 배포 전 소규모 정리

- Gemini 사용자 오류의 메시지와 failover 분류는 그대로 유지하면서 내부 normalized metadata만 정리했다. 일반 429는 `reason: rate-limit`, credit 부족은 `reason: credit`으로 기록한다.
- API 안전상한은 자동 retry 0회, Provider당 1회, Job당 3회이며 Provider 재방문·첨부파일 cross-provider 전환은 계속 차단된다.
- `package.json`이 참조하는 `scripts/` 파일 6개를 모두 Git source commit 대상으로 포함했다. 테스트 회피를 위한 script 삭제나 package script 변경은 하지 않았다.
- `.gitignore`의 `release/`, `dist/`, `node_modules/`, `.env*`, 개인 인증서 확장자, `.temp_app_extract/` 제외 규칙을 재확인했다. 프로젝트에 PFX를 복사하지 않았다.
- 현재 셸에 `WIN_CSC_LINK`와 `WIN_CSC_KEY_PASSWORD`가 없어 signed build와 Authenticode 검증은 `N/A`다. 실제 기존 설치 위 upgrade와 `cannot be closed` 검증은 `PASS-WARN`으로 유지한다.
