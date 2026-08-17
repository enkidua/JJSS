export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AIModelOption {
    id: string;
    label: string;
    description: string;
}

export type AIModelTier = 'economy' | 'balanced' | 'premium';

export const AI_MODEL_OPTIONS: Record<AIProvider, readonly AIModelOption[]> = {
    gemini: [
        {
            id: 'gemini-3.6-flash',
            label: 'Gemini 3.6 Flash(기본) — 고성능·가성비',
            description: '최신 안정 모델. 복잡한 문서 작성·분석과 일반 업무에 권장',
        },
        {
            id: 'gemini-3.5-flash-lite',
            label: 'Gemini 3.5 Flash-Lite — 초가성비·빠른 처리',
            description: '대량 문서 처리와 간단한 업무에 적합한 저비용 모델',
        },
    ],
    openai: [
        {
            id: 'gpt-5.6',
            label: 'GPT-5.6 Sol — 최고성능',
            description: '복잡한 분석·추론·중요 문서 작업에 적합',
        },
        {
            id: 'gpt-5.6-terra',
            label: 'GPT-5.6 Terra(기본) — 성능·비용 균형',
            description: '일반 업무와 문서 작성에 권장하는 균형형 모델',
        },
        {
            id: 'gpt-5.6-luna',
            label: 'GPT-5.6 Luna — 초가성비',
            description: '단순 작업과 대량 처리에 적합한 저비용 모델',
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-8',
            label: 'Claude Opus 4.8 — 최고성능',
            description: '복잡한 분석·추론·고난도 전문 업무용',
        },
        {
            id: 'claude-sonnet-5',
            label: 'Claude Sonnet 5(기본) — 고성능·가성비',
            description: '문서 작성·분석과 일반 업무에 권장하는 균형형 모델',
        },
        {
            id: 'claude-haiku-4-5',
            label: 'Claude Haiku 4.5 — 빠른 처리·초가성비',
            description: '간단한 문서 처리와 빠른 응답이 필요한 작업에 적합',
        },
    ],
};

export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
    gemini: 'gemini-3.6-flash',
    openai: 'gpt-5.6-terra',
    anthropic: 'claude-sonnet-5',
};

export const PROVIDER_MODEL_TIERS: Record<AIProvider, Partial<Record<AIModelTier, string>>> = {
    gemini: {
        economy: 'gemini-3.5-flash-lite',
        balanced: 'gemini-3.6-flash',
    },
    openai: {
        economy: 'gpt-5.6-luna',
        balanced: 'gpt-5.6-terra',
        premium: 'gpt-5.6',
    },
    anthropic: {
        economy: 'claude-haiku-4-5',
        balanced: 'claude-sonnet-5',
        premium: 'claude-opus-4-8',
    },
};

export function getAIModelTier(provider: AIProvider, model: string): AIModelTier | undefined {
    const tiers = PROVIDER_MODEL_TIERS[provider];
    return (Object.entries(tiers) as Array<[AIModelTier, string]>).find(([, id]) => id === model)?.[0];
}

export const AI_MODEL_LABELS: Record<string, string> = Object.fromEntries(
    Object.values(AI_MODEL_OPTIONS).flat().map(option => [option.id, option.label]),
);

const GEMINI_MODEL_MIGRATION: Record<string, string> = {
    'gemini-3.1-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite-preview': 'gemini-3.5-flash-lite',
    'gemini-3-flash-preview': 'gemini-3.6-flash',
    'gemini-3.5-flash': 'gemini-3.6-flash',
};

const OPENAI_MODEL_MIGRATION: Record<string, string> = {
    'gpt-4.1': 'gpt-5.6-terra',
    'gpt-4o': 'gpt-5.6-terra',
    o3: 'gpt-5.6-terra',
    'o4-mini': 'gpt-5.6-terra',
    'gpt-4.1-mini': 'gpt-5.6-luna',
    'gpt-4.1-nano': 'gpt-5.6-luna',
    'gpt-4o-mini': 'gpt-5.6-luna',
    'gpt-5.6-sol': 'gpt-5.6',
};

export function normalizeAIModel(provider: AIProvider, model?: string): string {
    const requestedModel = typeof model === 'string' ? model.trim() : '';
    const allowedModels = AI_MODEL_OPTIONS[provider].map(option => option.id);

    if (allowedModels.includes(requestedModel)) return requestedModel;

    if (provider === 'gemini') {
        return GEMINI_MODEL_MIGRATION[requestedModel] || DEFAULT_AI_MODELS.gemini;
    }

    if (provider === 'openai') {
        return OPENAI_MODEL_MIGRATION[requestedModel] || DEFAULT_AI_MODELS.openai;
    }

    if (requestedModel.startsWith('claude-opus-4')) return 'claude-opus-4-8';
    if (
        requestedModel.startsWith('claude-sonnet-4')
        || requestedModel.startsWith('claude-3-7-sonnet')
        || requestedModel.startsWith('claude-3-5-sonnet')
    ) return 'claude-sonnet-5';
    if (
        requestedModel.startsWith('claude-3-5-haiku')
        || requestedModel.startsWith('claude-3-haiku')
    ) return 'claude-haiku-4-5';

    return DEFAULT_AI_MODELS.anthropic;
}

export const API_KEY_ONBOARDING_STORAGE_KEY = 'jjss:api-key-onboarding-v1';

export function shouldShowApiKeyOnboarding(
    apiKeys: Array<string | null | undefined>,
    onboardingFlag: string | null,
    settingsLoadFailed = false,
): boolean {
    if (settingsLoadFailed) return false;
    if (apiKeys.some(key => typeof key === 'string' && key.trim().length > 0)) return false;
    return !onboardingFlag;
}
