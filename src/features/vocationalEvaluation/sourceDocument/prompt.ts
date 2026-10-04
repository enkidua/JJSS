/**
 * 결과지 읽기 요청 문구. 순수 문자열이라 테스트·검증 스크립트에서 그대로 꺼내 확인할 수 있다.
 * 이름 칸을 두지 않는 것과 "인쇄된 값만 옮긴다"는 지시가 이 파일의 핵심이다.
 */
export const HAND_FUNCTION_SHAPE = `{
  "documentType": "KEAD_HAND_FUNCTION",
  "detectedTitle": "문서에 적힌 검사 이름",
  "participant": { "sex": null, "disabilityType": null, "dominantHand": "RIGHT|LEFT|AMBIDEXTROUS|UNKNOWN|null" },
  "test": { "testDate": null },
  "trials": {
    "SMALL": { "DOMINANT": COND, "NON_DOMINANT": COND, "BILATERAL": COND },
    "MEDIUM": { "DOMINANT": COND, "NON_DOMINANT": COND },
    "LARGE": { "DOMINANT": COND, "NON_DOMINANT": COND }
  },
  "norms": [{ "path": "nondisabled.total", "sourceLabel": "결과지에 인쇄된 항목 이름", "sourceValue": SCALAR }],
  "reportedSummary": null,
  "evaluatorComment": null,
  "warnings": []
}
COND = { "trial1": SCALAR, "trial2": SCALAR, "trial3": SCALAR, "reportedAverage": SCALAR }`;

export const BIMANUAL_SHAPE = `{
  "documentType": "KEAD_BIMANUAL",
  "detectedTitle": "문서에 적힌 검사 이름",
  "participant": { "sex": null, "disabilityType": null, "dominantHand": null },
  "test": { "testDate": null },
  "performance": {
    "recordedDuration": SCALAR,
    "components": { "cylinder": SCALAR, "largeBolt": SCALAR, "largeNut": SCALAR, "smallBolt": SCALAR, "smallNut": SCALAR, "plate": SCALAR, "fixingPin": SCALAR },
    "componentDenominators": { "cylinder": SCALAR, "largeBolt": SCALAR, "largeNut": SCALAR, "smallBolt": SCALAR, "smallNut": SCALAR, "plate": SCALAR, "fixingPin": SCALAR },
    "reportedTotalCompleted": SCALAR,
    "reportedTotalTools": SCALAR
  },
  "norms": [{ "path": "nondisabled.total", "sourceLabel": "결과지에 인쇄된 항목 이름", "sourceValue": SCALAR }],
  "reportedSummary": null,
  "evaluatorComment": null,
  "warnings": []
}`;

export const SOURCE_DOCUMENT_PROMPT = `당신은 한국장애인고용공단(KEAD) 작업표본검사 결과지를 읽어 구조화하는 도구입니다.

규칙
1. 문서에 **실제로 인쇄된 값만** 옮깁니다. 값을 계산하거나 추정하지 마세요. 없으면 null입니다.
2. 이름·생년월일·연락처·기관명·평가사명은 옮기지 마세요. 스키마에 그 칸이 없습니다. 본인 확인은 앱이 PC 안에서 따로 합니다.
3. 백분위·평균 같은 규준 값은 계산하지 말고, 결과지에 인쇄된 대로 norms 배열에 넣으세요.
4. 각 값은 SCALAR 형식입니다: { "value": 숫자 또는 문자열 또는 null, "rawText": 문서 원문 그대로 또는 null, "pageNumber": 쪽 번호 또는 null, "sourceLabel": 그 값 옆의 항목 이름 또는 null }
5. 손기능 결과지이면 첫 번째 모양, 다차원 양손협응 결과지이면 두 번째 모양으로 답하세요. 둘 다 아니면 { "documentType": "UNSUPPORTED_OR_UNKNOWN", "detectedTitle": null, "warnings": ["사유"] } 로 답하세요.
6. 설명 없이 JSON 하나만 출력하세요.

[손기능 결과지 모양]
${HAND_FUNCTION_SHAPE}

[다차원 양손협응 결과지 모양]
${BIMANUAL_SHAPE}`;

