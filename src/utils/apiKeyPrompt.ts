import type { AIProvider } from '../config/aiModels';

export const API_KEY_REQUIRED_EVENT = 'jjss:api-key-required';

export interface ApiKeyRequiredDetail {
    provider?: AIProvider;
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
};

export function apiKeyRequiredMessage(provider?: AIProvider): string {
    const providerName = provider ? PROVIDER_LABELS[provider] : 'AI 서비스';
    return `AI 기능을 사용하려면 ${providerName} API 키가 필요합니다.\n\n설정에서 사용할 서비스의 API 키를 입력해 주세요.`;
}

export function notifyApiKeyRequired(provider?: AIProvider): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<ApiKeyRequiredDetail>(API_KEY_REQUIRED_EVENT, {
        detail: { provider },
    }));
}
