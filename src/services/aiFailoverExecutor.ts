import {
    isPremiumAutomaticCandidateAllowed,
    normalizeAIFailover,
    type AIFailoverReason,
    type AIFailoverSettings,
    type AIRequestCandidate,
} from '../config/aiFailover';
import type { AIProvider } from '../config/aiModels';
import type { PremiumUseDecision } from '../utils/aiUsagePrompt';
import {
    createAbortError,
    isAIRequestAbort,
    type AIRequestJob,
} from './aiRequestSafety';

export interface AIRequestExecutionResult<T> {
    value: T;
    candidate: AIRequestCandidate;
    attempts: number;
    jobId: string;
}

interface ExecuteAIRequestPlanOptions<T> {
    candidates: AIRequestCandidate[];
    job: AIRequestJob;
    failover?: Partial<AIFailoverSettings>;
    call: (candidate: AIRequestCandidate, context: { signal: AbortSignal; jobId: string; attempt: number }) => Promise<T>;
    classifyReason: (error: unknown) => AIFailoverReason | undefined;
    confirmPremium: (candidate: AIRequestCandidate) => Promise<PremiumUseDecision>;
    onAttemptError?: (candidate: AIRequestCandidate, error: unknown) => void;
}

export async function executeAIRequestPlan<T>(
    options: ExecuteAIRequestPlanOptions<T>,
): Promise<AIRequestExecutionResult<T>> {
    const failover = normalizeAIFailover(options.failover);
    const unavailableProviders = new Set<AIProvider>();
    let lastError: unknown = null;
    let lastProvider: AIProvider | undefined;
    let attempts = 0;

    try {
        for (const candidate of options.candidates) {
            options.job.assertActive();
            if (unavailableProviders.has(candidate.provider)) continue;
            if (!options.job.canAttempt(candidate.provider, candidate.model)) continue;
            if (!isPremiumAutomaticCandidateAllowed(candidate, failover)) continue;

            if (candidate.tier === 'premium' && candidate.automatic && failover.confirmBeforePremium) {
                const decision = await options.confirmPremium(candidate);
                options.job.assertActive();
                if (decision === 'cancel') {
                    options.job.cancel();
                    throw Object.assign(new Error('고성능 모델 사용을 취소했습니다.'), {
                        code: 'AI_PREMIUM_CANCELED',
                    });
                }
                if (decision === 'skip') continue;
            }

            attempts = options.job.beginAttempt(candidate.provider, candidate.model);
            try {
                const value = await options.call(candidate, {
                    signal: options.job.signal,
                    jobId: options.job.id,
                    attempt: attempts,
                });
                options.job.assertActive();
                options.job.finish('completed');
                return { value, candidate, attempts, jobId: options.job.id };
            } catch (error) {
                if (options.job.cancelled || isAIRequestAbort(error)) {
                    options.job.cancel();
                    throw createAbortError();
                }
                lastError = error;
                lastProvider = candidate.provider;
                options.onAttemptError?.(candidate, error);

                const reason = options.classifyReason(error);
                if (reason === 'creditUnavailable' || reason === 'quotaExceeded' || reason === 'authError' || reason === 'permissionError') {
                    unavailableProviders.add(candidate.provider);
                }
                if (!failover.enabled || !reason || !failover.switchOn[reason]) break;
            }
        }

        if (lastError) {
            const finalError = lastError instanceof Error ? lastError : new Error('AI 요청에 실패했습니다.');
            throw Object.assign(finalError, { finalProvider: lastProvider, jobId: options.job.id, attempts });
        }
        throw Object.assign(new Error('허용된 AI 모델에서 요청을 계속할 수 없습니다. 설정의 자동 전환 정책을 확인해 주세요.'), {
            jobId: options.job.id,
            attempts,
        });
    } catch (error) {
        options.job.finish(options.job.cancelled || isAIRequestAbort(error) ? 'cancelled' : 'failed');
        throw error;
    }
}
