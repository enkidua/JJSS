import type { AIFailoverReason } from '../config/aiFailover';

/** 분류에만 쓰는 제공업체 원문 메시지 최대 길이. 화면·로그에는 절대 내보내지 않는다. */
export const PROVIDER_MESSAGE_MAX_LENGTH = 200;

/**
 * 제공업체 오류 응답의 원문 메시지를 분류 전용으로 오류 객체에 붙인다.
 * enumerable이 아니므로 JSON.stringify·객체 펼침·safeErrorMetadata 로그에 포함되지 않는다.
 */
export function attachProviderMessage<T extends object>(error: T, providerMessage: unknown): T {
    if (typeof providerMessage !== 'string' || !providerMessage.trim()) return error;
    Object.defineProperty(error, 'providerMessage', {
        value: providerMessage.trim().slice(0, PROVIDER_MESSAGE_MAX_LENGTH),
        enumerable: false,
        configurable: true,
        writable: false,
    });
    return error;
}

function normalizedErrorParts(error: any) {
    const status = Number(error?.status || error?.response?.status || 0);
    const structured = [
        error?.providerCode,
        error?.code,
        error?.reason,
        error?.response?.data?.error?.type,
        error?.response?.data?.error?.code,
        error?.response?.data?.error?.status,
        error?.response?.data?.error?.reason,
    ].filter(value => typeof value === 'string').join(' ').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    const providerMessage = typeof error?.providerMessage === 'string' ? error.providerMessage.toLowerCase() : '';
    return { status, structured, combined: `${structured} ${message} ${providerMessage}`.trim() };
}

export function classifyAIFailoverReason(error: unknown): AIFailoverReason | undefined {
    const { status, structured, combined } = normalizedErrorParts(error);

    // 일반 429와 RESOURCE_EXHAUSTED는 순간적인 요청 제한일 수 있으므로 quota 소진으로 단정하지 않는다.
    // 단, 제공업체가 "exceeded your current quota"(Gemini·OpenAI)라고 명시하면 할당량 소진이다.
    const explicitQuota = /\b(insufficient[_ -]?quota|quota[_ -]?(exceeded|exhausted|limit[_ -]?reached)|daily[_ -]?quota|monthly[_ -]?quota|billing[_ -]?quota[_ -]?(exceeded|exhausted))\b/.test(combined)
        || /exceeded (your|the) current quota/.test(combined);
    if (explicitQuota) return 'quotaExceeded';

    // Anthropic: "Your credit balance is too low to access the Anthropic API" (HTTP 400)
    if (
        status === 402
        || /\b(insufficient[_ -]?credits?|credit[_ -]?exhausted|credit[_ -]?balance|billing[_ -]?required|billing[_ -]?error|billing[_ -]?disabled|payment[_ -]?required)\b/.test(combined)
    ) return 'creditUnavailable';

    if (status === 429 || /\b(resource[_ -]?exhausted|rate[_ -]?limit(?:ed)?|too[_ -]?many[_ -]?requests)\b/.test(structured)) {
        return 'rateLimit';
    }

    if (status === 401 || /\b(unauthenticated|invalid[_ -]?api[_ -]?key|api[_ -]?key[_ -]?invalid|authentication[_ -]?error)\b/.test(combined)
        || /api key not valid/.test(combined)) return 'authError';
    if (status === 403 || /\b(permission[_ -]?denied|permission[_ -]?error|forbidden)\b/.test(structured)) return 'permissionError';

    const explicitModelFailure = /\b(model[_ -]?(not[_ -]?found|unavailable|does[_ -]?not[_ -]?exist)|unknown[_ -]?model)\b/.test(combined);
    if (explicitModelFailure && (status === 404 || structured.includes('model') || combined.includes('model'))) {
        return 'modelUnavailable';
    }

    if (status >= 500 || /\b(service[_ -]?unavailable|high[_ -]?demand|overloaded[_ -]?error)\b/.test(combined)) return 'serviceUnavailable';
    if (/failed to fetch|network|load failed/.test(combined)) return 'networkError';
    return undefined;
}

/**
 * "같은 기능에서 오류가 반복되어 30초 차단"에 포함할 오류인지 판단한다.
 * API 키·권한 오류는 사용자가 설정을 고친 뒤 바로 다시 시도할 수 있어야 하므로 제외하고,
 * 입력 검증 오류(빈 입력·파일 크기 등)도 제외한다.
 */
export function shouldCountTowardFailureBlock(error: unknown): boolean {
    const candidate = error as { code?: unknown; reason?: unknown } | null;
    if (candidate?.code === 'AI_INPUT_ERROR') return false;
    if (candidate?.reason === 'api-key' || candidate?.reason === 'permission') return false;
    const reason = classifyAIFailoverReason(error);
    return reason !== 'authError' && reason !== 'permissionError';
}
