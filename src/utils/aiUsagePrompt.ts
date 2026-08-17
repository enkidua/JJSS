import type { AIModelTier, AIProvider } from '../config/aiModels';

export type PremiumUseDecision = 'use' | 'skip' | 'cancel';

export interface PremiumUseConfirmDetail {
    provider: AIProvider;
    modelLabel: string;
    resolve: (decision: PremiumUseDecision) => void;
}

export interface AIUsageNoticeDetail {
    message: string;
    provider: AIProvider;
    tier: AIModelTier;
}

export const PREMIUM_USE_CONFIRM_EVENT = 'jjss:premium-use-confirm';
export const AI_USAGE_NOTICE_EVENT = 'jjss:ai-usage-notice';

export function requestPremiumUseConfirmation(
    provider: AIProvider,
    modelLabel: string,
): Promise<PremiumUseDecision> {
    if (typeof window === 'undefined') return Promise.resolve('skip');
    return new Promise(resolve => {
        window.dispatchEvent(new CustomEvent<PremiumUseConfirmDetail>(PREMIUM_USE_CONFIRM_EVENT, {
            detail: { provider, modelLabel, resolve },
        }));
    });
}

export function notifyAIUsage(detail: AIUsageNoticeDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<AIUsageNoticeDetail>(AI_USAGE_NOTICE_EVENT, { detail }));
}
