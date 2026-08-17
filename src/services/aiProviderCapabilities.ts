import type { AIProvider } from '../config/aiModels';
import type { AIRequestCandidate } from '../config/aiFailover';

export function supportsAttachments(provider: AIProvider): boolean {
    return provider === 'gemini';
}

export function lockAttachmentRequestPlan(
    candidates: AIRequestCandidate[],
    selectedProvider: AIProvider,
    hasAttachments: boolean,
): AIRequestCandidate[] {
    if (!hasAttachments) return candidates;
    if (!supportsAttachments(selectedProvider)) return [];
    return candidates.filter(candidate => candidate.provider === selectedProvider);
}
