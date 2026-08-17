# 2026-05-08 직업평가 분석, 이미지 생성, 출력 안정화 기록

## 작업 목표

직업평가 PDF/이미지/텍스트 분석, 이미지 생성, 문서 출력 흐름에서 무한 로딩과 데이터 손실 가능성을 줄였습니다.

이번 작업에서는 DB 구조와 메뉴/라우트 구조를 변경하지 않았습니다.

## 직업평가 PDF 분석 흐름

`analyzeTestResults(files, directInput)` 형태로 변경했습니다.

PDF 처리 순서:

1. 파일 크기와 빈 파일 여부 확인
2. PDF는 Gemini Files API 업로드 우선 시도
3. Files API 업로드 실패 시 `inlineData` 방식으로 fallback
4. Gemini 분석 호출
5. 성공 시 분석 결과 표시
6. 실패 시 사용자에게 오류 메시지 표시
7. `finally`에서 로딩 상태 해제

## 직업평가 이미지 분석 흐름

JPG, PNG, GIF, WEBP 등 이미지 파일은 `inlineData` 방식으로 Gemini에 전달합니다.

처리 순서:

1. 이미지 파일을 base64로 변환
2. mimeType과 함께 `inlineData` 구성
3. Gemini 분석 호출
4. 성공 시 분석 결과 표시
5. 실패 시 사용자 메시지 표시
6. `finally`에서 로딩 상태 해제

## 직업평가 텍스트 입력 분석 흐름

기존 문제:

- `VocationalEvaluation.tsx`에 `analyzerInput` 상태는 있었지만 `handleAnalyze`에서 `analyzeTestResults(selectedFiles)`만 호출하고 있어 텍스트가 분석에 반영되지 않았습니다.

수정 후:

- `handleAnalyze`가 `analyzeTestResults(selectedFiles, analyzerInput)`을 호출합니다.
- 파일이 없어도 텍스트가 있으면 분석합니다.
- 파일과 텍스트가 모두 있으면 둘을 함께 참고합니다.
- 파일도 텍스트도 없을 때만 “파일을 업로드하거나 분석할 내용을 입력해 주세요.”를 표시합니다.
- 분석 결과는 종합소견서 입력 칸이 비어 있을 경우 자동으로 이어집니다.

## 이미지 생성 성공/실패 흐름

적용 파일:

- `src/components/PromoDesignView.tsx`
- `src/components/ScheduleDesignView.tsx`
- `src/pages/AITools.tsx`
- `src/services/gemini.ts`

성공 시:

- base64 이미지가 화면 미리보기 영역에 표시됩니다.
- 다운로드 링크가 유지됩니다.

실패 시:

- 로딩 상태는 `finally`에서 해제됩니다.
- 오류 메시지가 화면에 남습니다.
- 모델명 오류, API 키 오류, 권한/결제 문제, quota 초과, 네트워크 문제는 `normalizeGeminiError`에서 사용자 친화 메시지로 변환됩니다.
- 이미지 생성 실패는 다른 텍스트 생성/PDF 분석 기능에 영향을 주지 않습니다.
- 이미지 안의 한국어 글자가 모델 상태에 따라 깨질 수 있다는 안내를 추가했습니다.
- 이미지 생성이 어려우면 HTML/인쇄용 문서 작성 후 PDF 저장 방식으로 대체 가능하다는 안내를 추가했습니다.

## 이미지 생성 모델 후보

`generateImage`는 허용된 이미지 모델만 사용합니다.

- `gemini-2.5-flash-image`
- `gemini-3.1-flash-image-preview`
- `gemini-3-pro-image-preview`

기존 UI 호환:

- `nanobanana1` → `gemini-2.5-flash-image`
- `nanobanana2` → `gemini-3.1-flash-image-preview`
- `pro-image` → `gemini-3-pro-image-preview`

## PDF/문서 출력 방식

현재 직업평가 종합소견서는 Word 문서(`.docx`)로 생성합니다.

- AI 보고서 생성과 Word 다운로드를 분리했습니다.
- Word 다운로드 실패 시 보고서 내용은 지우지 않습니다.
- 실패 메시지는 종합소견서 결과 영역에 표시합니다.
- 한글 폰트는 `Malgun Gothic` 기준으로 유지합니다.

예산 지출품의서는 HTML 인쇄 방식입니다.

- 선택한 지출 항목만 `ExpenseDocument`에 전달됩니다.
- 인쇄/PDF 저장은 브라우저 인쇄 창을 통해 수행합니다.
- 인쇄 창을 열지 못하거나 출력 실패 시 원본 지출 데이터는 유지됩니다.
- 문서 CSS의 잘못된 `items-center` 속성을 `align-items`로 수정했습니다.
- 한글 폰트는 `Noto Sans KR`, `Malgun Gothic` 순서로 유지합니다.

## 실패 시 원본 데이터 보존 방식

- 직업평가 분석 실패 시 기존 입력 파일, 텍스트, 기존 결과를 임의 삭제하지 않습니다.
- 종합소견서 다운로드 실패 시 `reportResult`를 유지합니다.
- 이미지 생성 실패 시 기존 생성 이미지가 새 요청 시작 시에는 초기화되지만, 다른 AI 기능이나 저장 데이터에는 영향을 주지 않습니다.
- 지출품의서 출력 실패 시 지출 데이터는 수정하거나 삭제하지 않습니다.
- 저장과 다운로드/출력은 서로 분리했습니다.

## 변경 파일

- `src/pages/VocationalEvaluation.tsx`
- `src/services/gemini.ts`
- `src/components/PromoDesignView.tsx`
- `src/components/ScheduleDesignView.tsx`
- `src/pages/AITools.tsx`
- `src/components/ExpenseDocument.tsx`

## 빌드 결과

`npm run build` 통과.

## 남은 위험 요소

- Gemini Files API는 Electron/browser 환경이나 Google API 상태에 따라 실패할 수 있으며, 이 경우 inlineData fallback을 사용합니다.
- 매우 큰 PDF나 스캔 품질이 낮은 PDF는 inlineData fallback에서도 실패할 수 있습니다.
- 이미지 생성 모델은 preview 모델 권한, quota, 결제 설정, Google 측 부하 상태에 영향을 받을 수 있습니다.
- 이미지 안의 한국어 텍스트는 모델 특성상 깨질 수 있어, 중요한 홍보물은 생성 후 사람이 검수해야 합니다.
- 예산 지출품의서 PDF 저장은 브라우저 인쇄 기능에 의존하므로 OS/브라우저 인쇄 설정의 영향을 받습니다.

