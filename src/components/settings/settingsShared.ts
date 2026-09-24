import type { LLMProvider } from '../../store/settingsStore';

export interface SettingsSectionProps {
    /** 설정이 저장되었을 때 화면 상단에 "저장됨"을 잠깐 표시한다. */
    onSaved: () => void;
}

export const PROVIDER_INFO: Record<LLMProvider, { label: string; gradient: string; description: string }> = {
    gemini: {
        label: 'Google Gemini',
        gradient: 'from-blue-500 to-cyan-600',
        description: 'Google AI Studio에서 최신 API 키를 발급해 입력하세요.',
    },
    openai: {
        label: 'OpenAI',
        gradient: 'from-emerald-500 to-teal-600',
        description: 'OpenAI Platform에서 API 키를 발급받으세요.',
    },
    anthropic: {
        label: 'Anthropic Claude',
        gradient: 'from-orange-500 to-red-600',
        description: 'Anthropic Console에서 API 키를 발급받으세요.',
    },
};

export function errorText(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
