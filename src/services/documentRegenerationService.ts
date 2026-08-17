import { generateText, PromptType } from './gemini';

export interface RegenerationPromptOptions {
  documentTitle: string;
  currentContent: string;
  userContext?: string;
  previousRecords?: string;
  contextSummary?: string;
  draftInstruction?: string;
  additionalInstruction?: string;
}

export function buildCurrentContentRegenerationPrompt({
  documentTitle,
  currentContent,
  userContext = '',
  previousRecords = '',
  contextSummary = '',
  draftInstruction = '',
  additionalInstruction = '',
}: RegenerationPromptOptions) {
  return `
다음은 담당자가 이미 작성하거나 수정한 [${documentTitle}]입니다.
완전히 새로 쓰지 말고, 현재 작성자의 수정 의도와 표현을 가장 중요한 기준으로 삼아 부족한 부분만 보완해 주세요.

[공통 작성 원칙]
- 현재 작성자가 고친 문장, 표현, 의도는 유지한다.
- 직업재활 실무 문서 형식에 맞게 정리한다.
- 이용자 정보, 이전 기록, 현재 작성 내용을 함께 참고한다.
- 과장된 표현을 피하고 관찰된 내용과 지원계획 중심으로 작성한다.
- 장애인을 존중하는 표현을 사용한다.
- '지도'나 '교육'보다 가능한 경우 '지원'이라는 표현을 우선 사용한다.
- 정보가 부족하면 임의로 단정하지 말고 '확인 필요'로 표시한다.

${userContext ? `[이용자/업무 맥락]\n${userContext}\n` : ''}
${previousRecords ? `[이전 기록]\n${previousRecords}\n` : ''}
${contextSummary ? `[같은 이용자 최근 직업훈련 및 고용지원 기록 참고자료]\n${contextSummary}\n\n주의: 위 참고자료는 원본 문서를 수정하거나 병합하기 위한 내용이 아니라, 현재 문서를 작성할 때 필요한 내용만 선별해 참고하기 위한 자료입니다. 현재 작성 중인 내용과 충돌하면 확인 필요로 표시해 주세요.\n` : ''}
${draftInstruction ? `[새 초안 작성 지시]\n${draftInstruction}\n` : ''}
${additionalInstruction ? `[추가 보완 지시]\n${additionalInstruction}\n` : ''}

[현재 작성칸 내용 - 반드시 우선 반영]
${currentContent || '(현재 작성된 내용 없음)'}

위 내용을 기준으로 [${documentTitle}]를 보완해 주세요.
`.trim();
}

export async function regenerateDocumentFromCurrent(
  type: PromptType,
  options: RegenerationPromptOptions,
) {
  const prompt = buildCurrentContentRegenerationPrompt(options);
  return generateText(type, prompt);
}
