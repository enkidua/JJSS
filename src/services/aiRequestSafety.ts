import type { AIProvider } from '../config/aiModels';

export const MAX_ATTEMPTS_PER_JOB = 3;
export const MAX_ATTEMPTS_PER_PROVIDER_PER_JOB = 1;
export const MAX_AUTOMATIC_RETRIES = 0;
export const AI_DUPLICATE_WINDOW_MS = 3_000;
/** 텍스트 생성 요청 시간제한(응답이 멈춰도 기능이 "처리 중"으로 잠기지 않게 함). */
export const AI_TEXT_TIMEOUT_MS = 180_000;
/** 파일·이미지 분석/생성 요청 시간제한. */
export const AI_FILE_TIMEOUT_MS = 300_000;
export const AI_TIMEOUT_MESSAGE = 'AI 응답 시간이 초과되었습니다. 인터넷 연결을 확인한 뒤 잠시 후 다시 시도해 주세요. 파일이 크거나 내용이 길면 나누어 요청해 주세요.';

export type AIRequestKind = 'generation' | 'test';
export type AIJobStatus = 'completed' | 'failed' | 'cancelled';

export interface AIAttempt {
    provider: AIProvider | 'vision';
    model: string;
    requestFingerprint: string;
    startedAt: number;
}

export interface AIRequestJob {
    readonly id: string;
    readonly featureKey: string;
    readonly requestFingerprint: string;
    readonly startedAt: number;
    readonly attempts: readonly AIAttempt[];
    readonly signal: AbortSignal;
    readonly cancelled: boolean;
    /** 시간제한에 걸려 중단된 경우 true. 이때 오류 메시지는 createTimeoutError()를 사용한다. */
    readonly timedOut: boolean;
    canAttempt(provider: AIProvider | 'vision', model: string): boolean;
    beginAttempt(provider: AIProvider | 'vision', model: string): number;
    assertActive(): void;
    cancel(): void;
    finish(status: AIJobStatus): void;
}

export interface DailyAIRequestUsage {
    date: string;
    generationRequests: number;
    testRequests: number;
    providers: Partial<Record<AIProvider | 'vision', number>>;
}

interface BeginAIRequestJobOptions {
    featureKey: string;
    requestFingerprint: string;
    kind?: AIRequestKind;
    signal?: AbortSignal;
    /** 작업 전체 시간제한(ms). 생략하면 텍스트 기준(AI_TEXT_TIMEOUT_MS). 0 이하이면 사용하지 않음. */
    timeoutMs?: number;
}

const USAGE_STORAGE_KEY = 'jjss:ai-request-count:v1';
const DUPLICATE_REQUEST_MESSAGE = '같은 요청이 이미 처리 중이거나 방금 실행되었습니다. 잠시 후 다시 시도해 주세요.';
const activeFeatureJobs = new Map<string, AIRequestJob>();
const recentRequests = new Map<string, number>();

function todayKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyUsage(): DailyAIRequestUsage {
    return { date: todayKey(), generationRequests: 0, testRequests: 0, providers: {} };
}

export function getTodayAIRequestUsage(): DailyAIRequestUsage {
    if (typeof localStorage === 'undefined') return emptyUsage();
    try {
        const parsed = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || 'null') as DailyAIRequestUsage | null;
        if (!parsed || parsed.date !== todayKey()) return emptyUsage();
        return {
            date: parsed.date,
            generationRequests: Number(parsed.generationRequests) || 0,
            testRequests: Number(parsed.testRequests) || 0,
            providers: parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {},
        };
    } catch {
        return emptyUsage();
    }
}

function recordDailyAttempt(provider: AIProvider | 'vision', kind: AIRequestKind) {
    if (typeof localStorage === 'undefined') return;
    try {
        const usage = getTodayAIRequestUsage();
        if (kind === 'test') usage.testRequests += 1;
        else usage.generationRequests += 1;
        usage.providers[provider] = (usage.providers[provider] || 0) + 1;
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
    } catch {
        // 사용량 계측 실패가 실제 AI 작업을 막아서는 안 됩니다.
    }
}

export function createAIRequestFingerprint(value: unknown): string {
    let raw: string;
    try {
        raw = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
        raw = String(value);
    }
    let hash = 0x811c9dc5;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${(hash >>> 0).toString(36)}:${raw.length}`;
}

export function createAbortError(message = 'AI 요청이 취소되었습니다.'): Error {
    return Object.assign(new Error(message), { name: 'AbortError', code: 'AI_REQUEST_ABORTED' });
}

export function isAIRequestAbort(error: unknown): boolean {
    const candidate = error as { name?: string; code?: string } | null;
    if (isAIRequestTimeout(error)) return false;
    return candidate?.name === 'AbortError' || candidate?.code === 'AI_REQUEST_ABORTED';
}

export function createTimeoutError(message = AI_TIMEOUT_MESSAGE): Error {
    return Object.assign(new Error(message), { name: 'TimeoutError', code: 'AI_REQUEST_TIMEOUT' });
}

export function isAIRequestTimeout(error: unknown): boolean {
    const candidate = error as { name?: string; code?: string } | null;
    return candidate?.code === 'AI_REQUEST_TIMEOUT' || candidate?.name === 'TimeoutError';
}

type AbortSignalWithAny = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };

/** 사용자 취소 신호와 작업 내부 신호를 하나로 합친다(AbortSignal.any가 없으면 내부 신호만 사용하고 이벤트로 연결). */
function combineSignals(internal: AbortSignal, external?: AbortSignal): AbortSignal {
    const anyFn = (AbortSignal as AbortSignalWithAny).any;
    if (external && typeof anyFn === 'function') return anyFn.call(AbortSignal, [internal, external]);
    return internal;
}

function createJobId(now: number): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `job_${new Date(now).toISOString().replace(/\D/g, '').slice(0, 14)}_${random}`;
}

function pruneRecentRequests(now: number) {
    for (const [key, finishedAt] of recentRequests) {
        if (now - finishedAt >= AI_DUPLICATE_WINDOW_MS) recentRequests.delete(key);
    }
}

export function beginAIRequestJob(options: BeginAIRequestJobOptions): AIRequestJob {
    const featureKey = options.featureKey.trim() || 'ai:unknown';
    const requestFingerprint = options.requestFingerprint.trim();
    const recentKey = `${featureKey}::${requestFingerprint}`;
    const now = Date.now();
    pruneRecentRequests(now);

    if (activeFeatureJobs.has(featureKey) || recentRequests.has(recentKey)) {
        throw Object.assign(new Error(DUPLICATE_REQUEST_MESSAGE), { code: 'AI_DUPLICATE_REQUEST' });
    }

    const abortController = new AbortController();
    const attempts: AIAttempt[] = [];
    const attemptedProviders = new Set<AIProvider | 'vision'>();
    const attemptedRequests = new Set<string>();
    let cancelled = false;
    let timedOut = false;
    let finished = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const id = createJobId(now);
    const kind = options.kind || 'generation';
    const timeoutMs = options.timeoutMs ?? AI_TEXT_TIMEOUT_MS;
    const signal = combineSignals(abortController.signal, options.signal);

    // 취소·시간 초과·완료 중 어느 경우든 기능 잠금을 즉시 풀어, 응답이 오지 않아도 다시 사용할 수 있게 한다.
    const release = () => {
        if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
        options.signal?.removeEventListener('abort', onUserAbort);
        if (activeFeatureJobs.get(featureKey) === job) activeFeatureJobs.delete(featureKey);
    };
    const isStopped = () => finished || cancelled || timedOut || signal.aborted;
    const onUserAbort = () => job.cancel();

    const job: AIRequestJob = {
        id,
        featureKey,
        requestFingerprint,
        startedAt: now,
        attempts,
        signal,
        get cancelled() {
            return cancelled || timedOut || signal.aborted;
        },
        get timedOut() {
            return timedOut;
        },
        canAttempt(provider, model) {
            if (isStopped() || attempts.length >= MAX_ATTEMPTS_PER_JOB) return false;
            if (attemptedProviders.has(provider)) return false;
            return !attemptedRequests.has(`${provider}:${model}:${requestFingerprint}`);
        },
        beginAttempt(provider, model) {
            job.assertActive();
            if (!job.canAttempt(provider, model)) {
                throw Object.assign(new Error('이 AI 작업에서 허용된 API 호출 횟수를 모두 사용했습니다.'), {
                    code: 'AI_ATTEMPT_LIMIT',
                });
            }
            const attempt: AIAttempt = { provider, model, requestFingerprint, startedAt: Date.now() };
            attempts.push(attempt);
            attemptedProviders.add(provider);
            attemptedRequests.add(`${provider}:${model}:${requestFingerprint}`);
            recordDailyAttempt(provider, kind);
            if (import.meta.env?.DEV) {
                console.info('[AI JOB]', { feature: featureKey, jobId: id, attempt: `${attempts.length}/${MAX_ATTEMPTS_PER_JOB}`, provider, model });
            }
            return attempts.length;
        },
        assertActive() {
            if (timedOut) throw createTimeoutError();
            if (isStopped()) throw createAbortError();
        },
        cancel() {
            if (finished || cancelled || timedOut) return;
            cancelled = true;
            abortController.abort(createAbortError());
            release();
        },
        finish(status) {
            if (finished) return;
            finished = true;
            release();
            recentRequests.set(recentKey, Date.now());
            if (import.meta.env?.DEV) {
                console.info(`[AI JOB] ${status}`, { feature: featureKey, jobId: id, totalAttempts: attempts.length, durationMs: Date.now() - now, timedOut });
            }
        },
    };

    activeFeatureJobs.set(featureKey, job);
    if (options.signal?.aborted) job.cancel();
    else options.signal?.addEventListener('abort', onUserAbort, { once: true });
    if (!job.cancelled && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
            if (finished || cancelled || timedOut) return;
            timedOut = true;
            abortController.abort(createTimeoutError());
            release();
        }, timeoutMs);
        // Node(테스트)에서 타이머가 프로세스 종료를 막지 않도록 한다. 브라우저에서는 무시된다.
        (timeoutTimer as { unref?: () => void }).unref?.();
    }
    return job;
}

export function cancelActiveAIRequestJobs(featurePrefix?: string) {
    for (const [featureKey, job] of activeFeatureJobs) {
        if (!featurePrefix || featureKey.startsWith(featurePrefix)) job.cancel();
    }
}

export function __resetAIRequestSafetyForTests() {
    activeFeatureJobs.clear();
    recentRequests.clear();
}
