import type { AIProvider } from './aiModels';

export type AIReasoningLevel = 'auto' | 'low' | 'medium' | 'high';

export const DEFAULT_AI_REASONING_LEVELS: Record<AIProvider, AIReasoningLevel> = {
    gemini: 'medium',
    openai: 'medium',
    anthropic: 'auto',
};

const STANDARD_LEVELS: readonly AIReasoningLevel[] = ['auto', 'low', 'medium', 'high'];
const DEFAULT_ONLY: readonly AIReasoningLevel[] = ['auto'];

export function getAIReasoningLevels(provider: AIProvider, model: string): readonly AIReasoningLevel[] {
    // Haiku 4.5 uses a thinking token budget, not output_config.effort.
    if (provider === 'anthropic' && model === 'claude-haiku-4-5') return DEFAULT_ONLY;
    return STANDARD_LEVELS;
}

export function normalizeAIReasoningLevel(provider: AIProvider, model: string, value: unknown): AIReasoningLevel {
    return getAIReasoningLevels(provider, model).includes(value as AIReasoningLevel)
        ? value as AIReasoningLevel
        : 'auto';
}

export function geminiThinkingLevel(model: string, value: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
    const level = normalizeAIReasoningLevel('gemini', model, value);
    if (level === 'auto') return undefined;
    return level.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
}

export function openAIReasoningEffort(model: string, value: unknown): 'low' | 'medium' | 'high' | undefined {
    const level = normalizeAIReasoningLevel('openai', model, value);
    // Preserve the existing explicit GPT-6 medium setting for saved settings
    // that predate the reasoning selector.
    if (level === 'auto') return model.startsWith('gpt-6-') ? 'medium' : undefined;
    return level;
}

export function claudeReasoningEffort(model: string, value: unknown): 'low' | 'medium' | 'high' | undefined {
    const level = normalizeAIReasoningLevel('anthropic', model, value);
    return level === 'auto' ? undefined : level;
}
