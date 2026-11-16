import type { AIProvider } from '../config/aiModels';

export const API_KEY_REQUIRED_EVENT = 'jjss:api-key-required';

/**
 * 왜 키가 필요한지.
 * - gemini-only: 이미지 생성, 사진·스캔 문서 분석, 직업평가 결과 분석처럼 Google Gemini만 처리할 수 있는 기능
 * - ocr: 사진·스캔 문서 글자 읽기(Google Cloud Vision 또는 Gemini)
 */
export type ApiKeyRequiredPurpose = 'gemini-only' | 'ocr';

export interface ApiKeyRequiredDetail {
    provider?: AIProvider;
    purpose?: ApiKeyRequiredPurpose;
    /** 상황에 맞춘 안내문(예: 다른 서비스의 키가 든 칸). 있으면 이 글을 그대로 보여 준다. */
    message?: string;
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
};

export const GEMINI_ONLY_KEY_MESSAGE = '이 기능은 Google Gemini 전용입니다(이미지 생성, 사진·스캔 문서 분석, 직업평가 결과 분석).\n기본 AI로 다른 서비스를 쓰더라도 Google Gemini API 키를 따로 등록해야 합니다.\n\n설정 → API 키에서 Google Gemini 칸에 키를 입력해 주세요.';
export const OCR_KEY_MESSAGE = '사진·스캔 문서의 글자를 읽으려면 Google Cloud Vision API 키 또는 Google Gemini API 키가 필요합니다.\n(글자가 들어 있는 PDF는 키 없이 이 PC에서 바로 읽습니다.)\n\n설정 → API 키에서 둘 중 하나를 입력해 주세요.';

export function apiKeyRequiredMessage(provider?: AIProvider, purpose?: ApiKeyRequiredPurpose): string {
    if (purpose === 'gemini-only') return GEMINI_ONLY_KEY_MESSAGE;
    if (purpose === 'ocr') return OCR_KEY_MESSAGE;
    const providerName = provider ? PROVIDER_LABELS[provider] : 'AI 서비스';
    return `AI 기능을 사용하려면 ${providerName} API 키가 필요합니다.\n\n설정에서 사용할 서비스의 API 키를 입력해 주세요.`;
}

export function notifyApiKeyRequired(provider?: AIProvider, options: { purpose?: ApiKeyRequiredPurpose; message?: string } = {}): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<ApiKeyRequiredDetail>(API_KEY_REQUIRED_EVENT, {
        detail: { provider, purpose: options.purpose, message: options.message },
    }));
}
