# 2026-05-08 예산 OCR 복구 및 안정화

## 작업 범위
- 예산 화면은 지출 등록, 지출 목록, 지출품의서 생성 중심 구조를 유지했다.
- 영수증 OCR은 지출 등록/수정 모달 안의 보조 입력 기능으로 복구했다.
- DB 버전, 메뉴/라우트, Gemini 모델 정책은 변경하지 않았다.
- 기존 지출 데이터, 훈련 데이터, 이용자 데이터는 삭제하지 않았다.

## OCR 복구 방식
- `src/services/ocr.ts`의 기존 기능을 재사용했다.
  - `performOCR(file)`
  - `parseReceiptFromOCR(text)`
  - `smartParseItemizedReceiptWithAI(ocrText)`
- 사용자는 JPG, PNG, PDF 파일을 선택하고 `OCR 실행` 버튼을 누른다.
- OCR 결과는 자동 저장하지 않고 현재 지출 등록 form에만 반영한다.
- 사용자는 내용을 확인/수정한 뒤 기존 `지출 등록` 또는 `수정 완료` 버튼으로 저장한다.

## OCR 성공 흐름
1. 파일 선택
2. `performOCR(file)`로 텍스트 추출
3. Gemini API 키가 있으면 `smartParseItemizedReceiptWithAI` 우선 사용
4. 실패하거나 결과가 부족하면 `parseReceiptFromOCR` fallback
5. form에 값이 있는 필드만 반영
6. “OCR 결과를 입력칸에 반영했습니다. 저장 전 내용을 확인해 주세요.” 안내 표시

## OCR 실패 흐름
- loading은 `finally`에서 해제된다.
- 기존 작성 중인 form 내용은 유지된다.
- API 키가 없거나 OCR 실패 시 사용자에게 오류를 안내한다.
- API 키 부족 안내:
  - “OCR 기능을 사용하려면 설정에서 Vision API 키 또는 Gemini API 키를 입력해 주세요.”

## form 반영 필드
- `date`
- `vendor`
- `vendorBizNo`
- `description`
- `quantity`
- `unitPrice`
- `supplyAmount`
- `vat`
- `amount`
- `paymentMethod`
- `cardType`
- `cardLastFour`
- `approvalNo`
- `notes`

## 보호 규칙
- 값이 없는 OCR 필드는 기존 입력값을 덮어쓰지 않는다.
- 카드번호 전체는 저장하지 않고 끝 4자리만 저장한다.
- 영수증 이미지/PDF 파일 자체는 DB에 저장하지 않는다.
- 파일명과 OCR 원문 일부, 품목 요약만 `notes`에 남긴다.
- 공급가액/부가세는 영수증에 명시된 값만 사용한다.
- `quantity`와 `unitPrice`가 있고 `amount`가 없을 때만 `quantity * unitPrice`를 보조 계산한다.

## 품목 items 처리
- 품목이 있으면 기본적으로 전체 품목 합계 기준으로 form을 채운다.
- 사용자가 원하면 “첫 번째 품목으로 채우기” 또는 “전체 품목 합계로 채우기”를 다시 선택할 수 있다.
- 품목 요약은 화면과 notes에 남긴다.

## 예산 기능 유지
- 지출 등록/수정/삭제
- 저장 후 목록 즉시 반영
- 앱 재시작 후 지출 목록 유지
- 선택 지출 항목 기반 지출품의서 생성
- PDF/인쇄 실패 시 원본 지출 데이터 유지

## 직업훈련/위기대응 점검
- 직업훈련은 기존 `trainingState` 저장 구조를 유지했다.
- `exportAllData/importAllData`는 `STORES` 전체를 순회하므로 `trainingState`를 포함한다.
- 위기대응 시뮬레이터는 업무 지원 도구 내부 접근 경로를 유지한다.
- AI 실패 시 기본 위기대응 템플릿 fallback을 유지한다.

## 검증
- `npm run build` 통과
- 남은 경고: Vite 번들 청크 크기 경고가 유지된다.

## 남은 위험 요소
- OCR 정확도는 영수증 품질과 API 응답 품질에 영향을 받는다.
- PDF OCR은 Gemini API 키가 필요하다.
- Vision API와 Gemini API가 모두 없으면 OCR은 동작하지 않는다.

