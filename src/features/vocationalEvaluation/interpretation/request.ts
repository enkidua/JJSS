/**
 * 해석 제안 요청. 기존 AI 관문(`generateText`)만 쓴다 —
 * 비식별화·재시도 한도·제공업체 전환 규칙을 그대로 따르고 새 Provider를 만들지 않는다.
 */
import { generateText } from '../../../services/gemini';
import { buildInterpretationPrompt, parseInterpretationResponse } from './prompt';
import type { EvidencePackage, InterpretationResponse } from './types';

export interface InterpretationRequestOutcome {
    response: InterpretationResponse | null;
    model: string;
    failureReason?: string;
}

export async function requestInterpretation(
    pack: EvidencePackage,
    options?: { signal?: AbortSignal },
): Promise<InterpretationRequestOutcome> {
    try {
        const text = await generateText('utilities', buildInterpretationPrompt(pack), undefined, {
            signal: options?.signal,
            featureKey: 'vocational-evaluation',
            documentType: 've_interpretation',
            requestLabel: '직업평가 해석 제안',
        });
        const response = parseInterpretationResponse(text);
        return {
            response,
            model: 'gemini',
            failureReason: response ? undefined : 'AI 응답을 해석 제안 형식으로 읽지 못했습니다.',
        };
    } catch (error) {
        return {
            response: null,
            model: 'gemini',
            failureReason: error instanceof Error ? error.message : '해석 제안을 받지 못했습니다.',
        };
    }
}
