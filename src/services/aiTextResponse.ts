// Never turn an empty, refused, or token-truncated response into a saved document.
// These errors deliberately have no HTTP/network status: do not auto-retry them.
export function aiResponseError(code: 'AI_EMPTY_RESPONSE' | 'AI_TRUNCATED_RESPONSE' | 'AI_REFUSED_RESPONSE'): Error {
    const messages = {
        AI_EMPTY_RESPONSE: 'AI가 본문을 반환하지 않았습니다. 입력 내용을 확인한 뒤 직접 다시 요청해 주세요.',
        AI_TRUNCATED_RESPONSE: 'AI 응답이 출력 한도에 도달해 중단되었습니다. 입력 범위를 줄여 직접 다시 요청해 주세요.',
        AI_REFUSED_RESPONSE: 'AI 제공업체가 응답을 제한했습니다. 입력 내용을 확인해 주세요.',
    };
    return Object.assign(new Error(messages[code]), { code });
}

export function requireAIText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw aiResponseError('AI_EMPTY_RESPONSE');
    return value;
}

export function readOpenAIText(data: {
    choices?: Array<{ finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }>;
} | null): string {
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') throw aiResponseError('AI_TRUNCATED_RESPONSE');
    if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw aiResponseError('AI_REFUSED_RESPONSE');
    return requireAIText(choice?.message?.content);
}

export function readAnthropicText(data: {
    stop_reason?: string;
    content?: Array<{ type?: string; text?: unknown }>;
} | null): string {
    if (data?.stop_reason === 'max_tokens') throw aiResponseError('AI_TRUNCATED_RESPONSE');
    if (data?.stop_reason === 'refusal') throw aiResponseError('AI_REFUSED_RESPONSE');
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return requireAIText(blocks
        .filter(block => block?.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n'));
}

const GEMINI_BLOCKED_FINISH_REASONS = new Set([
    'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE',
]);

/**
 * Gemini 응답(SDK 응답 객체 또는 REST JSON)에서 본문을 읽는다.
 * 출력 한도(MAX_TOKENS)·안전 차단은 오류로 바꾸고, 첫 part만이 아니라 모든 텍스트 part를 이어 붙인다.
 * 사고 과정(thought) part는 제외한다.
 */
export function readGeminiText(response: {
    text?: unknown;
    promptFeedback?: { blockReason?: unknown } | null;
    candidates?: Array<{
        finishReason?: unknown;
        content?: { parts?: Array<{ text?: unknown; thought?: unknown }> | null } | null;
    }> | null;
} | null | undefined): string {
    if (response?.promptFeedback?.blockReason) throw aiResponseError('AI_REFUSED_RESPONSE');
    const candidate = Array.isArray(response?.candidates) ? response?.candidates[0] : undefined;
    const finishReason = String(candidate?.finishReason || '');
    if (finishReason === 'MAX_TOKENS') throw aiResponseError('AI_TRUNCATED_RESPONSE');
    if (GEMINI_BLOCKED_FINISH_REASONS.has(finishReason)) throw aiResponseError('AI_REFUSED_RESPONSE');
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const joined = parts
        .filter(part => typeof part?.text === 'string' && part.thought !== true)
        .map(part => part.text as string)
        .join('');
    return requireAIText(joined || (typeof response?.text === 'string' ? response.text : ''));
}
