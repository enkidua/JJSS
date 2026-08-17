type ErrorLike = Record<string, unknown>;

function asErrorLike(value: unknown): ErrorLike {
    return typeof value === 'object' && value !== null ? value as ErrorLike : {};
}

function safeScalar(value: unknown): string | undefined {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const text = String(value).trim();
    return text ? text.slice(0, 80) : undefined;
}

function safeCategory(value: unknown): string | undefined {
    const text = safeScalar(value);
    return text && /^[a-z0-9._-]+$/i.test(text) ? text : undefined;
}

/** 오류 원문·요청 URL·사용자 입력을 제외하고 진단에 필요한 분류값만 반환합니다. */
export function safeErrorMetadata(error: unknown, feature?: string) {
    const source = asErrorLike(error);
    const response = asErrorLike(source.response);
    return {
        ...(feature ? { feature } : {}),
        name: safeCategory(source.name) || (error instanceof Error ? safeCategory(error.name) : undefined) || 'Error',
        ...(safeCategory(source.code) ? { code: safeCategory(source.code) } : {}),
        ...(safeCategory(source.status) || safeCategory(response.status)
            ? { status: safeCategory(source.status) || safeCategory(response.status) }
            : {}),
        ...(safeCategory(source.reason) ? { reason: safeCategory(source.reason) } : {}),
    };
}
