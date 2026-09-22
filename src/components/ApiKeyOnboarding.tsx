import { useEffect, useState } from 'react';
import { ExternalLink, Eye, EyeOff, Key, Sparkles } from 'lucide-react';
import {
    API_KEY_ONBOARDING_STORAGE_KEY,
    DEFAULT_AI_MODEL_LABELS,
    shouldShowApiKeyOnboarding,
    type AIProvider,
} from '../config/aiModels';
import { useSettingsStore } from '../store/settingsStore';

interface ProviderCard {
    provider: AIProvider;
    label: string;
    guidance: string;
    keyUrl: string;
    gradient: string;
}

const PROVIDER_CARDS: ProviderCard[] = [
    {
        provider: 'gemini',
        label: 'Google Gemini',
        guidance: 'Google AI Studio에서 새로 발급한 API 키 사용을 권장합니다.',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        gradient: 'from-blue-500 to-cyan-600',
    },
    {
        provider: 'openai',
        label: 'OpenAI',
        guidance: 'OpenAI Platform에서 API 키를 발급한 뒤 입력하세요.',
        keyUrl: 'https://platform.openai.com/api-keys',
        gradient: 'from-emerald-500 to-teal-600',
    },
    {
        provider: 'anthropic',
        label: 'Anthropic Claude',
        guidance: 'Anthropic Console에서 API 키를 발급한 뒤 입력하세요.',
        keyUrl: 'https://console.anthropic.com/settings/keys',
        gradient: 'from-orange-500 to-red-600',
    },
];

const EMPTY_KEYS: Record<AIProvider, string> = {
    gemini: '',
    openai: '',
    anthropic: '',
};

export default function ApiKeyOnboarding() {
    const { settings, loaded, error, saveSettings } = useSettingsStore();
    const [visible, setVisible] = useState(false);
    const [keys, setKeys] = useState<Record<AIProvider, string>>(EMPTY_KEYS);
    const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
        gemini: false,
        openai: false,
        anthropic: false,
    });
    const [validationMessage, setValidationMessage] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!loaded) return;
        let onboardingFlag: string | null = null;
        try {
            onboardingFlag = localStorage.getItem(API_KEY_ONBOARDING_STORAGE_KEY);
        } catch {
            // localStorage를 사용할 수 없는 환경에서는 현재 실행 중에만 안내 상태를 유지합니다.
        }
        setVisible(shouldShowApiKeyOnboarding(
            settings.llmConfigs.map(config => config.apiKey),
            onboardingFlag,
            Boolean(error),
        ));
    }, [error, loaded, settings.llmConfigs]);

    const rememberChoice = (choice: 'completed' | 'later') => {
        try {
            localStorage.setItem(API_KEY_ONBOARDING_STORAGE_KEY, choice);
        } catch {
            // 저장소 접근 실패가 앱의 비AI 기능 사용을 막지 않도록 합니다.
        }
    };

    const handleSave = async () => {
        const normalizedKeys = Object.fromEntries(
            Object.entries(keys).map(([provider, value]) => [provider, value.trim()]),
        ) as Record<AIProvider, string>;
        if (!Object.values(normalizedKeys).some(Boolean)) {
            setValidationMessage('사용할 AI 서비스의 API 키를 하나 이상 입력해 주세요.');
            return;
        }

        setSaving(true);
        setValidationMessage('');
        try {
            await saveSettings({
                ...settings,
                llmConfigs: settings.llmConfigs.map(config => ({
                    ...config,
                    apiKey: normalizedKeys[config.provider] || config.apiKey,
                })),
            });
            rememberChoice('completed');
            setKeys({ ...EMPTY_KEYS });
            setVisible(false);
        } catch {
            setValidationMessage('API 키를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setSaving(false);
        }
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="api-key-onboarding-title">
            <div className="mx-auto my-4 w-full max-w-5xl glass-card !p-6 sm:!p-8 shadow-2xl">
                <div className="mb-6 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-purple-600">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 id="api-key-onboarding-title" className="text-xl font-bold text-white">AI 기능 사용을 위한 API 키 설정</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/65">
                            JJSS의 AI 문서 작성·분석 기능을 사용하려면 Google Gemini, OpenAI 또는 Anthropic 중 하나 이상의 API 키가 필요합니다.
                            사용하고 싶은 AI 서비스의 API 키만 입력하면 되며, 이후 설정 화면에서 언제든 추가하거나 변경할 수 있습니다.
                        </p>
                        <p className="mt-2 text-xs text-amber-200/75">API 사용량에 따라 각 AI 서비스에서 비용이 발생할 수 있습니다.</p>
                        <p className="mt-2 text-xs leading-relaxed text-white/45">
                            AI 사용 방식은 설정에서 비용 절감 우선, 성능·비용 균형, 성능 우선·유료 사용 허용 중 선택할 수 있습니다. 초기값은 비용 절감 우선이며 자동 전환은 꺼져 있습니다.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {PROVIDER_CARDS.map(card => (
                        <section key={card.provider} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <div className="mb-4 flex items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient}`}>
                                    <Key className="h-4 w-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">{card.label}</h3>
                                    <p className="text-xs text-white/45">기본 추천 모델 · {DEFAULT_AI_MODEL_LABELS[card.provider]}</p>
                                </div>
                            </div>
                            <p className="mb-4 min-h-10 text-xs leading-relaxed text-white/55">{card.guidance}</p>
                            <div className="relative">
                                <input
                                    type={showKeys[card.provider] ? 'text' : 'password'}
                                    value={keys[card.provider]}
                                    onChange={event => setKeys(current => ({ ...current, [card.provider]: event.target.value }))}
                                    placeholder={`${card.label} API 키`}
                                    autoComplete="off"
                                    className="input-field !pr-11 font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    aria-label={`${card.label} API 키 ${showKeys[card.provider] ? '숨기기' : '표시하기'}`}
                                    onClick={() => setShowKeys(current => ({ ...current, [card.provider]: !current[card.provider] }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                                >
                                    {showKeys[card.provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <a
                                href={card.keyUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-300 transition-colors hover:text-blue-200"
                            >
                                API 키 발급 페이지 열기 <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </section>
                    ))}
                </div>

                {validationMessage && (
                    <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="alert">
                        {validationMessage}
                    </p>
                )}

                <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                    <button
                        type="button"
                        className="btn-ghost !px-5 !py-2.5"
                        disabled={saving}
                        onClick={() => {
                            rememberChoice('later');
                            setKeys({ ...EMPTY_KEYS });
                            setVisible(false);
                        }}
                    >
                        나중에 설정하기
                    </button>
                    <button type="button" className="btn-primary !px-5 !py-2.5 disabled:opacity-50" disabled={saving} onClick={() => void handleSave()}>
                        {saving ? '저장 중…' : '저장하고 시작하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
