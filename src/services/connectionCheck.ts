import type { AIProvider } from '../config/aiModels';
import { normalizeAIModel } from '../config/aiModels';
import { checkGeminiConnection } from './gemini';

export type ConnectionCheckProvider = AIProvider | 'vision';

export interface ConnectionCheckOptions {
    model?: string;
    signal?: AbortSignal;
}

export const CONNECTION_CHECK_TIMEOUT_MS = 20_000;

const PROVIDER_NAMES: Record<ConnectionCheckProvider, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    anthropic: 'Claude(Anthropic)',
    vision: 'Google Vision',
};

type FailureKind = 'invalid-key' | 'permission' | 'quota' | 'network' | 'timeout' | 'model' | 'service' | 'unknown';

function connectionError(provider: ConnectionCheckProvider, kind: FailureKind, detail = ''): Error {
    const name = PROVIDER_NAMES[provider];
    const messages: Record<FailureKind, string> = {
        'invalid-key': `${name} API 키가 올바르지 않습니다. 발급받은 키 전체를 다시 복사해 붙여 넣어 주세요. 앞뒤 공백이나 줄바꿈이 들어가지 않았는지도 확인해 주세요.`,
        permission: `${name} API 키는 확인되었지만 사용 권한이 없습니다. ${detail || '키의 사용 범위(권한·API 제한) 설정을 확인해 주세요.'}`,
        quota: `${name} API 사용 한도(할당량)에 도달했거나 결제 설정이 필요합니다. 제공업체 사이트에서 사용량과 결제 정보를 확인해 주세요.`,
        network: `${name}에 연결하지 못했습니다. 인터넷 연결 상태를 확인한 뒤 다시 시도해 주세요. 회사·기관 방화벽이 외부 AI 주소를 막고 있을 수도 있습니다.`,
        timeout: `${name} 연결 확인 응답이 ${CONNECTION_CHECK_TIMEOUT_MS / 1000}초 안에 오지 않았습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.`,
        model: `${name} API 키는 올바르지만 선택한 모델을 이 계정에서 사용할 수 없습니다. 설정에서 다른 모델을 선택해 주세요.`,
        service: `${name} 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.`,
        unknown: `${name} 연결을 확인하지 못했습니다. API 키와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.`,
    };
    return Object.assign(new Error(messages[kind]), { code: 'CONNECTION_CHECK_FAILED', reason: kind });
}

function createAbortError(): Error {
    return Object.assign(new Error('연결 확인을 취소했습니다.'), { name: 'AbortError', code: 'AI_REQUEST_ABORTED' });
}

/**
 * 20초 시간제한과 사용자 취소 신호를 합친 신호를 만든다.
 * AbortSignal.any/timeout이 있으면 사용하고, 없으면 직접 만든 타이머로 대신한다.
 */
function createTimedSignal(userSignal?: AbortSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, CONNECTION_CHECK_TIMEOUT_MS);
    (timer as { unref?: () => void }).unref?.();
    const anyFn = (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any;
    const signal = userSignal && typeof anyFn === 'function'
        ? anyFn.call(AbortSignal, [controller.signal, userSignal])
        : controller.signal;
    const onUserAbort = () => controller.abort();
    if (userSignal && signal === controller.signal) {
        if (userSignal.aborted) controller.abort();
        else userSignal.addEventListener('abort', onUserAbort, { once: true });
    }
    return {
        signal,
        isTimedOut: () => timedOut,
        cleanup: () => {
            clearTimeout(timer);
            userSignal?.removeEventListener('abort', onUserAbort);
        },
    };
}

async function readErrorPayload(response: Response): Promise<{ type: string; message: string; reason: string }> {
    const payload = await response.json().catch(() => ({})) as any;
    const error = payload?.error || {};
    const reason = Array.isArray(error?.details)
        ? String(error.details.map((detail: any) => detail?.reason).find((value: unknown) => typeof value === 'string') || '')
        : '';
    return {
        type: String(error?.type || error?.code || error?.status || '').toLowerCase(),
        message: String(error?.message || '').toLowerCase().slice(0, 300),
        reason: reason.toUpperCase(),
    };
}

async function fetchForCheck(provider: ConnectionCheckProvider, url: string, init: RequestInit, userSignal?: AbortSignal): Promise<Response> {
    const timed = createTimedSignal(userSignal);
    try {
        return await fetch(url, { ...init, signal: timed.signal });
    } catch (error: any) {
        if (timed.isTimedOut()) throw connectionError(provider, 'timeout');
        if (userSignal?.aborted || error?.name === 'AbortError') throw createAbortError();
        throw connectionError(provider, 'network');
    } finally {
        timed.cleanup();
    }
}

function classifyHttpFailure(provider: ConnectionCheckProvider, status: number, payload: { type: string; message: string; reason: string }): Error {
    const text = `${payload.type} ${payload.message}`;
    if (/insufficient_quota|exceeded your current quota|credit balance|billing/.test(text) || payload.reason === 'BILLING_DISABLED') {
        return connectionError(provider, 'quota');
    }
    if (status === 401 || /invalid_api_key|authentication_error|api key not valid|incorrect api key/.test(text) || payload.reason === 'API_KEY_INVALID') {
        return connectionError(provider, 'invalid-key');
    }
    if (status === 403 || /permission/.test(text)) {
        if (payload.reason === 'SERVICE_DISABLED') {
            return connectionError(provider, 'permission', 'Google Cloud 프로젝트에서 해당 API를 "사용 설정"해 주세요.');
        }
        if (/unsupported_country|region/.test(text)) {
            return connectionError(provider, 'permission', '현재 지역에서는 이 서비스를 사용할 수 없습니다.');
        }
        return connectionError(provider, 'permission');
    }
    if (status === 429) return connectionError(provider, 'quota');
    if (status === 404) return connectionError(provider, 'model');
    if (status >= 500) return connectionError(provider, 'service');
    return connectionError(provider, 'unknown');
}

async function checkOpenAI(apiKey: string, options: ConnectionCheckOptions): Promise<string> {
    // 모델 목록/정보 조회는 과금되지 않는다. 모델을 지정하면 그 모델에 접근 가능한지도 함께 확인한다.
    const model = options.model ? normalizeAIModel('openai', options.model) : '';
    const url = model
        ? `https://api.openai.com/v1/models/${encodeURIComponent(model)}`
        : 'https://api.openai.com/v1/models';
    const response = await fetchForCheck('openai', url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
    }, options.signal);
    if (!response.ok) throw classifyHttpFailure('openai', response.status, await readErrorPayload(response));
    return model
        ? `OpenAI API 키가 정상적으로 연결되었습니다. 선택한 모델(${model})을 사용할 수 있습니다.`
        : 'OpenAI API 키가 정상적으로 연결되었습니다.';
}

async function checkAnthropic(apiKey: string, options: ConnectionCheckOptions): Promise<string> {
    // Models API(GET /v1/models, /v1/models/{id})는 생성 요청이 아니므로 과금되지 않는다.
    const model = options.model ? normalizeAIModel('anthropic', options.model) : '';
    const url = model
        ? `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`
        : 'https://api.anthropic.com/v1/models';
    const response = await fetchForCheck('anthropic', url, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
    }, options.signal);
    if (!response.ok) throw classifyHttpFailure('anthropic', response.status, await readErrorPayload(response));
    const data = await response.json().catch(() => ({})) as { display_name?: unknown };
    const label = typeof data?.display_name === 'string' && data.display_name ? data.display_name : model;
    return label
        ? `Claude API 키가 정상적으로 연결되었습니다. ${label} 모델을 사용할 수 있습니다.`
        : 'Claude API 키가 정상적으로 연결되었습니다.';
}

/**
 * Vision API 키 확인: 이미지가 없는 빈 요청(`{"requests": []}`)을 images:annotate로 보낸다.
 * 분석할 이미지가 없으므로 과금 단위(이미지×기능)가 0이다.
 * - 200, 또는 400이지만 키 오류(API_KEY_INVALID)가 아닌 경우(요청 내용 검증 단계까지 통과) → 키 유효
 * - 400 + API_KEY_INVALID / 401 → 잘못된 키, 403 → 권한 없음(API 미사용 설정·결제 미연결·키 제한), 429 → 할당량
 */
async function checkVision(apiKey: string, options: ConnectionCheckOptions): Promise<string> {
    const response = await fetchForCheck('vision', 'https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ requests: [] }),
    }, options.signal);
    if (response.ok) return 'Google Vision API 키가 정상적으로 연결되었습니다.';
    const payload = await readErrorPayload(response);
    const invalidKey = payload.reason === 'API_KEY_INVALID' || /api key not valid|api_key_invalid/.test(payload.message);
    if (response.status === 400 && !invalidKey) return 'Google Vision API 키가 정상적으로 연결되었습니다.';
    throw classifyHttpFailure('vision', invalidKey ? 401 : response.status, payload);
}

/**
 * API 키 연결 확인(생성 요청 없이 비용이 들지 않는 방식).
 * 성공하면 사용자에게 보여 줄 한국어 메시지를 반환하고, 실패하면 한국어 메시지를 가진 Error를 던집니다.
 * 키는 URL이 아니라 요청 헤더로만 보내며, 20초 안에 응답이 없으면 시간 초과로 안내합니다.
 */
export async function checkProviderConnection(
    provider: ConnectionCheckProvider,
    apiKey: string,
    options: ConnectionCheckOptions = {},
): Promise<string> {
    const key = String(apiKey ?? '').trim();
    if (!key) throw new Error('API 키를 먼저 입력해 주세요.');
    switch (provider) {
        case 'gemini': {
            const timed = createTimedSignal(options.signal);
            try {
                return await checkGeminiConnection(key, options.model, timed.signal);
            } catch (error) {
                if (timed.isTimedOut()) throw connectionError('gemini', 'timeout');
                if (options.signal?.aborted) throw createAbortError();
                throw error;
            } finally {
                timed.cleanup();
            }
        }
        case 'openai':
            return checkOpenAI(key, options);
        case 'anthropic':
            return checkAnthropic(key, options);
        case 'vision':
            return checkVision(key, options);
        default:
            throw new Error('알 수 없는 AI 제공업체입니다.');
    }
}
