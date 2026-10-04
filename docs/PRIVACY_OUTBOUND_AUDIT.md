# 외부 AI 전송(Outbound) 개인정보 감사 — JJSS 3.1

작성일: 2026-09-24 · 범위: PC → 외부 AI(Google Gemini, OpenAI, Anthropic Claude, Google Cloud Vision)로 나가는 모든 요청
검사 방법: `fetch(`, `generateContent`, `files.upload`, `inlineData`, `vision.googleapis`, `api.openai.com`, `api.anthropic.com`, `new GoogleGenAI` 전수 검색 + 호출부 추적. 자동 검증: `npm run test:privacy-outbound`(가짜 제공업체로 실제 요청 본문을 가로채 검사, 네트워크 없음).

## 1. 외부 전송 지점(네트워크 코드는 아래 3개 파일에만 있음)

| 파일 | 함수 | 제공업체 | 전송 방식 |
|---|---|---|---|
| `src/services/gemini.ts` | `callGemini`, `generateDocumentText`, `generateImage` | Gemini | SDK `models.generateContent` (텍스트·inlineData·fileData) |
| 〃 | `callOpenAI` / `callAnthropic` | OpenAI / Anthropic | `fetch` (키는 헤더) |
| 〃 | `buildGeminiFileParts` | Gemini | inlineData 또는 Files API `files.upload`(14MB 초과, 끝나면 즉시 `files.delete`) |
| `src/services/ocr.ts` | `extractTextWithVision` / `extractTextWithGemini` / `smartParseItemizedReceiptWithAI` | Vision / Gemini | `fetch`(키는 `x-goog-api-key` 헤더) / SDK |
| `src/services/connectionCheck.ts` | `checkProviderConnection` | 4사 | 모델 조회·빈 요청만(업무 데이터 없음, 과금 생성 없음) |

그 밖의 `fetch`(`rehabPlanDocx.ts` 템플릿, `jjssFileService.ts` data URL)는 앱 내부 자원만 읽는다. 분석·원격 오류수집·추적 코드는 없다.

## 2. 기능별 흐름(수정 후)

| 기능(화면) | 호출 | 제공업체 | 보내는 내용 | 비식별화 | 첨부 원본 |
|---|---|---|---|---|---|
| 상담일지·사례회의·재활계획·정기평가(WorkMate) | `generateText`, `regenerateDocumentFromCurrent` | 선택 제공업체(설정 시 자동 전환) | 이용자 정보·담당자 입력·이전 기록 | 예(관문) | 없음 |
| 면접일지·직무분석지 | `generateText` (+현장 사진) | 글: 선택 제공업체 / 사진: Gemini만 | 입력 글, 사진 | 예 | 사진: 동의 C 후에만, 자동 전환 없음 |
| 지원고용 평가 소견 | `generateText` + knownNames(훈련생·직무지도원·담당자) | 선택 제공업체 | 훈련일지·점수 | 예 | 없음 |
| 직업훈련 계획·상담·평가·성과 | `generateText` + knownNames(현재 훈련생·담당자) | 선택 제공업체 | 훈련 기록 | 예 | 없음 |
| 상황 메모, AI 도구(공문·블로그 등), 위기대응 매뉴얼, AI 정밀매칭 의견 | `generateText` | 선택 제공업체 | 입력 글 | 예 | 없음 |
| 회의록 | `generateText` | 선택 제공업체 | 붙여넣기/텍스트 파일(PC에서 읽음) | 예 | 없음 |
| 문서 질의응답 | `generateText`(첨부+이전 대화) | Gemini | 질문, 이전 대화 10턴/1만 자 | 예(대화 전체 같은 매핑) | 텍스트 PDF: 글만 / 이미지·스캔본: 질문마다 동의 C |
| 문서 검토(계획서 점검) | `performOCR` → `generateText` | Vision/Gemini → 선택 제공업체 | OCR 글, 상담일지 | 예 | OCR과 동일 |
| 직업평가 결과분석·종합보고서 | `analyzeTestResults`, `generateReport` | Gemini | 검사 메모·참고 내용 | 예 | 텍스트 PDF: 글만 / 이미지·스캔본: 동의 C |
| 직업평가 공식 결과지 읽기(평가 진행 탭) | `readSourceDocument` → `generateText('utilities')` | Gemini(자동 전환 금지) | 결과지에서 뽑은 글(이름 칸은 스키마에 없음) | 예(관문) | 텍스트 PDF: 글만 / 스캔본: 동의 C |
| 직업평가 해석 제안(평가 진행 탭) | `requestInterpretation` → `generateText('utilities')` | 선택 제공업체 | 근거 패키지(수치·비교 패턴·관찰 라벨·의미 태그)만. 이름·메모·파일 이름 없음 | 예(관문) | 없음 |
| 문서 OCR, 이용자 등록 OCR, 영수증 OCR | `performOCR` | 이미지: Vision(키 있을 때) 또는 Gemini / 스캔 PDF: Gemini | 파일 | — | 텍스트 PDF: PC에서 읽고 전송 0건 / 그 외: 동의 C |
| 영수증 항목 정리 | `smartParseItemizedReceiptWithAI` | Gemini | OCR 글 | 예 | 없음 |
| 홍보물·일정표 이미지 | `generateImage` | Gemini 이미지 모델 | 프롬프트 | 예(토큰 대신 ○○○ 자리표시, 결과에 복원 안 함) | 없음 |
| 개인정보 비식별화 도구 | 로컬 `anonymizeText` → (선택) `generateText('masking')` | 선택 제공업체만(자동 전환 금지) | 1차로 가린 글 | 예 | 없음 |
| AI 매칭 점수 | `services/matching.ts` | 없음(PC 계산) | — | — | — |
| 외부 업무 도구 링크(AI 도구 화면) | 브라우저로 링크 열기 | 해당 사이트 | JJSS가 보내는 데이터 없음(사용자가 직접 입력하는 내용은 JJSS 통제 밖) | — | — |

## 3. 수정 전 발견 사항 → 조치

| 발견 | 조치 |
|---|---|
| 텍스트만 비식별화하고 PDF·이미지 원본은 inlineData/Files API로 그대로 전송(직업평가, 문서 질의응답, OCR, 직무분석 사진) | `aiPrivacyGateway.prepareAttachmentsForAI`: PDF는 PC 안에서 글자 추출 → 비식별화한 글만 전송. 추출 불가(스캔본·이미지)는 요청마다 원본 전송 확인(동의 C, 기본 취소). 확인을 거치지 않은 파일은 `assertAttachmentApproved`가 막음(우회 차단) |
| OCR 이미지: Vision 실패 시 Gemini로 원본 자동 재전송 | 자동 전환 제거. Gemini로 다시 보낼지 별도 확인 후 새 요청 1회 |
| 이미지 생성 프롬프트 원문 전송 | `prepareImagePrompt`로 비식별화, 결과에 실제 이름 복원 안 함 |
| 기능마다 `anonymizeText`를 따로 호출(정책 분산) | 모든 텍스트 요청을 `prepareAIOutboundText`(입력·이전 대화·추출 문서 같은 매핑) → `restoreAIResponse`로 통일. 매핑은 PC 메모리에만 존재 |
| 의료기관명·의사명·진단일 전송 | 비식별화 규칙 추가(⟦의료기관N⟧, ⟦진단일N⟧, 의사 이름=⟦이름N⟧). 진료과·기관 종류·장애유형·중증도는 유지 |
| 훈련생·직무지도원 이름이 사전에 없음 | 요청 관련 이름만 `knownNames` 옵션으로 추가(앱 전체 이름 목록은 넣지 않음) |
| **실제 공단 결과지로 확인(2026-09-25).** 결과지 표를 글로 옮기면 라벨에 쌍점이 없어(`이 름  홍길동`) 이름 규칙이 모두 빗나갔다. 이용자 이름·평가사 이름이 그대로 전송됨 | `anonymizer.NAME_FIELD_LABEL_PATTERN` 추가: 이름 칸임이 분명한 머리말(이름·성명·성함·○○명·평가사·평가자·검사자)에 한해 쌍점 없이 칸만 띄운 형태도 인식한다. 쌍점이 없으면 **성씨로 시작하는 값만** 이름으로 본다(한글 세 글자를 무조건 이름으로 보지 않는다). 한 번 찾은 이름은 본문 전체에서 함께 가려지므로 `( 홍길동 )님은` 같은 반복 등장도 막힌다 |
| 결과지 읽기 스키마에 `test.evaluator`(평가사 이름) 칸이 있어, 요청 문구의 "평가사명을 옮기지 마세요" 지시와 어긋났다 | 스키마·타입·요청 문구에서 평가사 이름 칸을 없앴다. 모델이 넣어 보내도 `parseExtractionJson`이 버린다 |

## 4. 동의 구분
- A. AI 텍스트 사용: 첫 설정·각 화면 안내("비식별화된 업무 내용이 선택한 AI 제공업체로 전송될 수 있습니다").
- B. 다른 제공업체 자동 전환: 설정의 별도 동의(`crossProviderConsentConfirmed`). 첨부가 있었던 요청은 설정과 관계없이 전환하지 않음.
- C. 원본 PDF·이미지 전송: 요청마다 확인창 "이 파일은 이미지/PDF 원본이 Google Gemini(또는 Google Cloud Vision)로 전송됩니다. …" [취소](기본) / [원본 파일 전송]. A·B를 허용해도 C는 자동 허용되지 않음. 확인창을 띄울 화면이 없으면 자동 거절.

## 5. 로컬 OCR을 넣지 않은 이유
Tesseract 등 로컬 OCR은 새 패키지·한국어 학습 데이터(수십 MB) 추가가 필요하고(이번 작업의 패키지 추가 금지 원칙), 한국어 서식 문서 인식률이 낮아 업무 결과를 망가뜨릴 수 있다. 따라서 스캔본·이미지 내용은 **사용자가 요청마다 확인한 경우에만** 원본으로 나가며, 원하지 않으면 취소하고 내용을 글로 입력하면 된다.

## 6. PDF 글자 추출(pdf.js)
`src/services/localPdfText.ts`는 `pdfjs-dist`가 설치되어 있을 때만(Vite `import.meta.glob`) 동작한다. **현재 설치됨(`pdfjs-dist` 5.7.x)이며 배포 번들에도 들어간다**(`dist/assets/pdf.min-*.js`, `pdf.worker.min-*.js`). 따라서 글자가 들어 있는 PDF는 원본을 보내지 않고 글만 보낸다. 실제 공단 결과지(2쪽, 1,037자)로 확인했다: `isMeaningfulPdfText` TRUE(읽을 수 있는 글자 85.7%, 깨진 글자 0%, 글자 있는 쪽 100%) → 첨부 없음. 스캔 쪽이 20% 넘거나 글자가 깨지면 텍스트 PDF로 보지 않는다.

## 7. 남은 위험(보호의 한계)
- 비식별화는 규칙 기반이다. 사전(이용자·사업체 담당자·요청 관련 이름)에 없고 "이름:", "○○○ 님/이용자" 같은 단서도 없는 제3자 이름, 번지 없는 주소, 기관·사업체 이름 속 개인 이름은 가려지지 않을 수 있다.
- 쌍점 없는 이름 칸은 **성씨 목록에 있는 성으로 시작하는 값만** 가린다. 드문 성이나 외국식 이름은 사전(`knownNames`)에 등록된 경우에만 가려진다.
- 기관·소속 칸(예: `소 속  장애인복지관`)은 가리지 않는다. 기관 종류는 업무에 필요하고, 기관 이름을 사람 이름처럼 다루면 오탐이 커지기 때문이다. 고유한 기관 이름이 적힌 문서를 보낼 때는 이 점을 감안해야 한다.
- 동의 C로 보낸 원본 파일 안의 개인정보는 가려지지 않는다(확인창에 명시).
- 문서 질의응답은 이전 대화를 10턴/1만 자로 자르므로, 잘려 나간 부분에만 있던 "이름:" 단서는 다음 질문에서 쓰이지 않는다(사전·호칭 규칙은 계속 적용).
- Files API 임시 파일 삭제가 실패하면 Google 서버에 최대 약 48시간 남을 수 있다(14MB 초과 원본, 동의 C 이후에만 발생).
- API 키는 각 제공업체 요청 헤더로 전송된다(필수).
