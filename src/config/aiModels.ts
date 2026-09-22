export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AIModelOption {
    id: string;
    label: string;
    description: string;
    tier: AIModelTier;
}

export type AIModelTier = 'economy' | 'balanced' | 'premium';

// Official provider catalogs checked 2026-09-23. Keep saved, supported choices
// available; a catalog refresh must not silently upgrade a paid selection.
export const AI_MODEL_CATALOG_UPDATED_AT = '2026-09-23';

export const AI_MODEL_OPTIONS: Record<AIProvider, readonly AIModelOption[]> = {
    gemini: [
        {
            id: 'gemini-3.5-flash-lite',
            label: 'Gemini 3.5 Flash-Lite(기본) — 저비용·빠른 처리',
            description: '공식 Flash-Lite 안정 모델. 보통 추론 수준으로 시작',
            tier: 'economy',
        },
        {
            id: 'gemini-3.8-flash',
            label: 'Gemini 3.8 Flash — 고성능·가성비',
            description: '최신 안정 Flash 모델. 문서 작성·분석과 일반 업무용',
            tier: 'balanced',
        },
        {
            id: 'gemini-3.6-flash',
            label: 'Gemini 3.6 Flash — 기존 선택 유지',
            description: '기존 작업의 호환성을 위해 유지하는 안정 Flash 모델',
            tier: 'balanced',
        },
    ],
    openai: [
        {
            id: 'gpt-5.6-luna',
            label: 'GPT-5.6 Luna(기본) — 저비용·빠른 처리',
            description: '간단한 문서 작업과 반복 업무에 적합한 저비용 모델',
            tier: 'economy',
        },
        {
            id: 'gpt-6-astra',
            label: 'GPT-6 Astra — 최고성능·고비용(직접 선택)',
            description: '최신 고난도 추론 모델. 자동 업그레이드 대상이 아니며 직접 선택 시 사용',
            tier: 'premium',
        },
        {
            id: 'gpt-6-sol',
            label: 'GPT-6 Sol — 성능·비용 균형',
            description: '문서 작성과 복잡한 분석을 위한 최신 균형형 모델',
            tier: 'balanced',
        },
        {
            id: 'gpt-6-luna',
            label: 'GPT-6 Luna — 저비용·대량 처리',
            description: '반복 업무와 간단한 문서 처리용 최신 저비용 모델',
            tier: 'economy',
        },
        {
            id: 'gpt-5.6',
            label: 'GPT-5.6 Sol — 고성능·기존 선택 유지',
            description: '복잡한 분석·추론·중요 문서 작업에 적합',
            tier: 'premium',
        },
        {
            id: 'gpt-5.6-terra',
            label: 'GPT-5.6 Terra — 기존 선택 유지',
            description: '일반 업무와 문서 작성에 권장하는 균형형 모델',
            tier: 'balanced',
        },
    ],
    anthropic: [
        {
            id: 'claude-fable-5-1',
            label: 'Claude Fable 5.1 — 최고성능·고비용(직접 선택)',
            description: '장시간 복잡한 추론용. 사고 토큰도 과금되며 직접 선택 시에만 사용',
            tier: 'premium',
        },
        {
            id: 'claude-opus-5',
            label: 'Claude Opus 5 — 최신 고성능(직접 선택)',
            description: '복잡한 분석과 전문 문서 작업용. 기존 모델을 자동 교체하지 않음',
            tier: 'premium',
        },
        {
            id: 'claude-opus-4-8',
            label: 'Claude Opus 4.8 — 고성능·기존 선택 유지',
            description: '복잡한 분석·추론·고난도 전문 업무용',
            tier: 'premium',
        },
        {
            id: 'claude-sonnet-5',
            label: 'Claude Sonnet 5(기본) — 고성능·가성비',
            description: '문서 작성·분석과 일반 업무에 권장하는 균형형 모델',
            tier: 'balanced',
        },
        {
            id: 'claude-haiku-4-5',
            label: 'Claude Haiku 4.5 — 빠른 처리·초가성비',
            description: '간단한 문서 처리와 빠른 응답이 필요한 작업에 적합',
            tier: 'economy',
        },
    ],
};

export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
    gemini: 'gemini-3.5-flash-lite',
    openai: 'gpt-5.6-luna',
    anthropic: 'claude-sonnet-5',
};

export const PROVIDER_MODEL_TIERS: Record<AIProvider, Partial<Record<AIModelTier, string>>> = {
    gemini: {
        economy: 'gemini-3.5-flash-lite',
        balanced: 'gemini-3.8-flash',
    },
    openai: {
        economy: 'gpt-5.6-luna',
        balanced: 'gpt-6-sol',
        // Do not silently switch previously consented premium fallback to Astra.
        premium: 'gpt-5.6',
    },
    anthropic: {
        economy: 'claude-haiku-4-5',
        balanced: 'claude-sonnet-5',
        premium: 'claude-opus-4-8',
    },
};

export function getAIModelTier(provider: AIProvider, model: string): AIModelTier | undefined {
    return AI_MODEL_OPTIONS[provider].find(option => option.id === model)?.tier;
}

export const AI_MODEL_LABELS: Record<string, string> = Object.fromEntries(
    Object.values(AI_MODEL_OPTIONS).flat().map(option => [option.id, option.label]),
);

export const DEFAULT_AI_MODEL_LABELS: Record<AIProvider, string> = {
    gemini: AI_MODEL_LABELS[DEFAULT_AI_MODELS.gemini],
    openai: AI_MODEL_LABELS[DEFAULT_AI_MODELS.openai],
    anthropic: AI_MODEL_LABELS[DEFAULT_AI_MODELS.anthropic],
};

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
        requestedModel.startsWith('claude-haiku-4-5')
        || requestedModel.startsWith('claude-3-5-haiku')
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
