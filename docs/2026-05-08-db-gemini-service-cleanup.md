# 2026-05-08 DB 안정화 보완 및 Gemini 서비스 정리 기록

## 작업 목표

DB/API 키 안정화 보완과 Gemini 서비스 구조 정리를 진행했습니다.

메뉴/라우트 구조는 변경하지 않았습니다.

다시 연결하지 않은 기능:

- 인포메이트
- 소통 공간/커뮤니티
- 인트라넷

## decryptWithStatus 보완

`src/config/crypto.ts`의 `decryptWithStatus`가 더 이상 `ciphertext.includes('.')`만으로 암호문 여부를 판단하지 않습니다.

변경 후 기준:

- `isEncrypted(value)`와 동일한 형식 검증을 먼저 수행
- 올바른 `base64.base64` 형식이 아니면 평문으로 간주
- 평문 API 키에 점(`.`)이 포함되어 있어도 복호화 실패로 빈 값 처리하지 않음
- 올바른 암호문 형식인 경우에만 현재 키 → 레거시 키 순서로 복호화 시도
- 둘 다 실패하면 빈 값과 실패 상태 반환

## 백업/복원 안내 문구

`src/pages/Settings.tsx`의 백업/복원 영역에 다음 안내를 사용자에게 보이도록 추가했습니다.

- 백업 파일에는 이용자명, 상담 내용, 사례 문서, 직업훈련 기록 등 개인정보가 포함될 수 있음
- API 키는 백업 파일에서 제외됨
- 백업 파일은 외부에 공유하지 말고 안전한 위치에 보관해야 함
- 데이터 복원은 기존 데이터를 덮어쓸 수 있으므로 실행 전 현재 데이터 백업을 권장함

복원 확인창도 더 명확하게 수정했습니다.

## export/import 구조

`src/config/localDB.ts`의 `STORES` 목록에 `trainingState`가 포함되어 있으므로 `exportAllData`와 `importAllData` 모두 직업훈련 데이터를 포함합니다.

보안상 export 시 API 키 관련 값은 제거됩니다.

- `apiKey`
- `apiKeyEncrypted`
- `visionApiKey`
- `visionApiKeyEncrypted`

`importAllData`는 사용자가 확인 후 실행하는 데이터 대체 기능입니다. 복원 데이터는 저장 전 민감 필드 암호화 처리를 거치도록 유지했습니다.

## Gemini 서비스 분리 구조

`src/services/gemini.ts`에 다음 역할별 helper를 추가하거나 정리했습니다.

- `getGeminiModelConfig`
  - 사용자가 선택한 텍스트 모델을 그대로 존중
  - 기본값이 필요할 때만 `gemini-2.5-flash` 사용

- `normalizeGeminiError`
  - Gemini 오류를 사용자 친화적 메시지로 변환
  - API 키 없음, 모델명 오류, quota 초과, 결제/권한 제한, 파일 실패, 응답 파싱 실패, 네트워크 실패를 구분

- `analyzeDocumentFile`
  - PDF 파일 분석 파트 구성
  - File API 업로드 실패 시 inlineData 방식으로 전환

- `analyzeImageFile`
  - 이미지 파일을 inlineData 파트로 구성

- `generateDocumentText`
  - 직업평가 결과분석/종합소견서처럼 파일 파트를 포함한 Gemini 문서 생성 호출 담당

- `generateImage`
  - 이미지 생성 전용 모델 후보만 사용
  - 실패 시 임의로 모델을 낮추지 않고 사용자에게 오류 메시지를 전달

## 이미지 생성 모델 후보

이미지 생성 모델은 다음 후보만 허용합니다.

- `gemini-2.5-flash-image`
- `gemini-3.1-flash-image-preview`
- `gemini-3-pro-image-preview`

불확실한 모델명인 `gemini-3.1-flash-image`는 사용하지 않도록 정리했습니다.

기존 UI 값 호환:

- `nanobanana1` → `gemini-2.5-flash-image`
- `nanobanana2` → `gemini-3.1-flash-image-preview`
- `pro-image` → `gemini-3-pro-image-preview`

## 모델 선택 원칙

사용자가 선택한 Gemini 3 또는 3.1 계열 텍스트 모델은 기본적으로 존중합니다.

특정 기능이 실패하더라도 조용히 낮은 모델로 자동 변경하지 않습니다. 실패 이유를 사용자에게 보여줄 수 있도록 오류 메시지 구조를 정리했습니다.

## 변경 파일

- `src/config/crypto.ts`
- `src/pages/Settings.tsx`
- `src/config/localDB.ts`
- `src/services/gemini.ts`

## 빌드 결과

`npm run build` 통과.

## 남은 위험 요소

- Gemini preview 모델은 Google 측 권한, 지역, quota, 부하 상태에 따라 실패할 수 있습니다.
- 이미지 생성 모델명은 공식 API 지원 상태가 바뀔 수 있어 추후 문서 기준으로 재확인이 필요합니다.
- PDF File API가 브라우저/Electron 환경에서 실패할 수 있어 inlineData 방식 fallback은 유지했습니다.
- API 키 복호화에 필요한 localStorage installation id가 삭제된 경우 기존 암호화 키는 복구할 수 없고 재입력이 필요합니다.

