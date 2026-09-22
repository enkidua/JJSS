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
