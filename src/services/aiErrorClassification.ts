import type { AIFailoverReason } from '../config/aiFailover';

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
    return { status, structured, combined: `${structured} ${message}`.trim() };
}

export function classifyAIFailoverReason(error: unknown): AIFailoverReason | undefined {
    const { status, structured, combined } = normalizedErrorParts(error);

    // 일반 429와 RESOURCE_EXHAUSTED는 순간적인 요청 제한일 수 있으므로 quota 소진으로 단정하지 않는다.
    const explicitQuota = /\b(insufficient[_ -]?quota|quota[_ -]?(exceeded|exhausted|limit[_ -]?reached)|daily[_ -]?quota|monthly[_ -]?quota|billing[_ -]?quota[_ -]?(exceeded|exhausted))\b/.test(combined);
    if (explicitQuota) return 'quotaExceeded';

    if (
        status === 402
        || /\b(insufficient[_ -]?credits?|credit[_ -]?exhausted|billing[_ -]?required|billing[_ -]?error|payment[_ -]?required)\b/.test(combined)
    ) return 'creditUnavailable';

    if (status === 429 || /\b(resource[_ -]?exhausted|rate[_ -]?limit(?:ed)?|too[_ -]?many[_ -]?requests)\b/.test(structured)) {
        return 'rateLimit';
    }

    if (status === 401 || /\b(unauthenticated|invalid[_ -]?api[_ -]?key)\b/.test(combined)) return 'authError';
    if (status === 403 || /\b(permission[_ -]?denied|forbidden)\b/.test(structured)) return 'permissionError';

    const explicitModelFailure = /\b(model[_ -]?(not[_ -]?found|unavailable|does[_ -]?not[_ -]?exist)|unknown[_ -]?model)\b/.test(combined);
    if (explicitModelFailure && (status === 404 || structured.includes('model') || combined.includes('model'))) {
        return 'modelUnavailable';
    }

    if (status >= 500 || /\b(service[_ -]?unavailable|high[_ -]?demand)\b/.test(combined)) return 'serviceUnavailable';
    if (/failed to fetch|network|load failed/.test(combined)) return 'networkError';
    return undefined;
}
