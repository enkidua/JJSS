import type { AIProvider } from '../config/aiModels';

export const MAX_ATTEMPTS_PER_JOB = 3;
export const MAX_ATTEMPTS_PER_PROVIDER_PER_JOB = 1;
export const MAX_AUTOMATIC_RETRIES = 0;
export const AI_DUPLICATE_WINDOW_MS = 3_000;

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
    return candidate?.name === 'AbortError' || candidate?.code === 'AI_REQUEST_ABORTED';
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
    let finished = false;
    const id = createJobId(now);
    const kind = options.kind || 'generation';

    const job: AIRequestJob = {
        id,
        featureKey,
        requestFingerprint,
        startedAt: now,
        attempts,
        signal: abortController.signal,
        get cancelled() {
            return cancelled || abortController.signal.aborted;
        },
        canAttempt(provider, model) {
            if (finished || this.cancelled || attempts.length >= MAX_ATTEMPTS_PER_JOB) return false;
            if (attemptedProviders.has(provider)) return false;
            return !attemptedRequests.has(`${provider}:${model}:${requestFingerprint}`);
        },
        beginAttempt(provider, model) {
            this.assertActive();
            if (!this.canAttempt(provider, model)) {
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
            if (finished || this.cancelled) throw createAbortError();
        },
        cancel() {
            if (finished) return;
            cancelled = true;
            abortController.abort();
        },
        finish(status) {
            if (finished) return;
            finished = true;
            options.signal?.removeEventListener('abort', job.cancel);
            if (activeFeatureJobs.get(featureKey) === job) activeFeatureJobs.delete(featureKey);
            recentRequests.set(recentKey, Date.now());
            if (import.meta.env?.DEV) {
                console.info(`[AI JOB] ${status}`, { feature: featureKey, jobId: id, totalAttempts: attempts.length, durationMs: Date.now() - now });
            }
        },
    };

    if (options.signal?.aborted) job.cancel();
    else options.signal?.addEventListener('abort', job.cancel, { once: true });
    activeFeatureJobs.set(featureKey, job);
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
