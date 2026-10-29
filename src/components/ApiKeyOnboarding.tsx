import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CircleCheck, CircleX, ExternalLink, Eye, EyeOff, Key, Loader2, Sparkles } from 'lucide-react';
import { API_KEY_FORMAT_HINTS, API_KEY_SLOT_LABELS, checkKeyFormatForSlot, normalizeApiKeyInput } from '../config/apiKeyFormat';
import { checkProviderConnection } from '../services/connectionCheck';
import { recordApiKeyStatus } from '../services/apiKeyStatus';
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
    // 저장 직후 자동 연결 확인 결과. 하나라도 실패하면 창을 닫지 않고 결과를 보여 준다.
    const [checkResults, setCheckResults] = useState<Partial<Record<AIProvider, { ok: boolean; message: string } | 'checking'>>>({});
    const hasFailedCheck = Object.values(checkResults).some(result => result !== 'checking' && result && !result.ok);

    /** 다른 제공업체 형식의 키를 알맞은 카드로 옮긴다. */
    const moveKey = (from: AIProvider, to: AIProvider) => {
        if (keys[to].trim() && keys[to].trim() !== keys[from].trim() && !window.confirm('옮길 칸에 이미 입력한 키가 있습니다. 옮기는 키로 바꿀까요?')) return;
        setKeys(current => ({ ...current, [to]: current[from], [from]: '' }));
        setCheckResults(current => ({ ...current, [from]: undefined, [to]: undefined }));
    };

    useEffect(() => {
        if (!loaded) return;
        // 저장 직후 연결 확인 결과를 보여 주는 동안은 창을 닫지 않는다(키가 저장되면 "보여 줄 필요 없음"으로 판정되므로).
        if (saving || Object.keys(checkResults).length > 0) return;
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
    }, [error, loaded, settings.llmConfigs, saving, checkResults]);

    const rememberChoice = (choice: 'completed' | 'later') => {
        try {
            localStorage.setItem(API_KEY_ONBOARDING_STORAGE_KEY, choice);
        } catch {
            // 저장소 접근 실패가 앱의 비AI 기능 사용을 막지 않도록 합니다.
        }
    };

    const handleSave = async () => {
        const normalizedKeys = Object.fromEntries(
            Object.entries(keys).map(([provider, value]) => [provider, normalizeApiKeyInput(value).value]),
        ) as Record<AIProvider, string>;
        if (!Object.values(normalizedKeys).some(Boolean)) {
            setValidationMessage('사용할 AI 서비스의 API 키를 하나 이상 입력해 주세요.');
            return;
        }
        // 다른 제공업체 형식의 키가 들어간 칸이 있으면 저장 전에 고치게 한다(저장해도 동작하지 않는다).
        const mismatched = (Object.keys(normalizedKeys) as AIProvider[])
            .map(provider => ({ provider, verdict: checkKeyFormatForSlot(provider, normalizedKeys[provider]) }))
            .find(item => item.verdict.status === 'mismatch');
        if (mismatched && mismatched.verdict.status === 'mismatch') {
            setValidationMessage(`${API_KEY_SLOT_LABELS[mismatched.provider]} 칸: ${mismatched.verdict.message} 카드 아래의 "옮기기"를 눌러 주세요.`);
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
        } catch {
            setValidationMessage('API 키를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            setSaving(false);
            return;
        }
        // 입력한 키만 바로 연결 확인한다(생성 요청 없음 — 비용·업무 내용 전송 없음).
        const entered = (Object.keys(normalizedKeys) as AIProvider[]).filter(provider => normalizedKeys[provider]);
        setCheckResults(Object.fromEntries(entered.map(provider => [provider, 'checking'])));
        const results = await Promise.all(entered.map(async provider => {
            const key = normalizedKeys[provider];
            const model = settings.llmConfigs.find(config => config.provider === provider)?.model;
            try {
                const message = await checkProviderConnection(provider, key, { model });
                void recordApiKeyStatus(provider, key, 'ok', message, 'auto-check');
                return [provider, { ok: true, message }] as const;
            } catch (error) {
                const message = error instanceof Error && error.message ? error.message : '연결을 확인하지 못했습니다.';
                // 키 자체가 틀렸을 때만 "실패"로 남긴다(한도·권한·모델·서비스 오류는 키 문제가 아니다).
                if ((error as { reason?: string })?.reason === 'invalid-key') void recordApiKeyStatus(provider, key, 'failed', message, 'auto-check');
                return [provider, { ok: false, message }] as const;
            }
        }));
        setCheckResults(Object.fromEntries(results));
        setSaving(false);
        if (results.every(([, result]) => result.ok)) {
            rememberChoice('completed');
            setKeys({ ...EMPTY_KEYS });
            setCheckResults({});
            setVisible(false);
        } else {
            setValidationMessage('저장은 되었지만 연결 확인에 실패한 키가 있습니다. 아래 결과를 확인해 키를 고친 뒤 다시 저장하거나, 그대로 시작할 수 있습니다.');
        }
    };

    const finishAnyway = () => {
        rememberChoice('completed');
        setKeys({ ...EMPTY_KEYS });
        setCheckResults({});
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-110 overflow-y-auto bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="api-key-onboarding-title">
            <div className="mx-auto my-4 w-full max-w-5xl glass-card p-6! sm:p-8! shadow-2xl">
                <div className="mb-6 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-purple-600">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 id="api-key-onboarding-title" className="text-xl font-bold text-white">AI 기능 사용을 위한 API 키 설정</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/65">
                            JJSS의 AI 문서 작성·분석 기능을 사용하려면 Google Gemini, OpenAI 또는 Anthropic 중 하나 이상의 API 키가 필요합니다.
                            사용하고 싶은 AI 서비스의 API 키만 입력하면 되며, 이후 설정 화면에서 언제든 추가하거나 변경할 수 있습니다.
                        </p>
                        <p className="mt-2 text-xs text-amber-200/75">API 사용량에 따라 각 AI 서비스에서 비용이 발생할 수 있습니다.</p>
                        <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-xs leading-relaxed text-sky-50/85">
                            <p className="font-semibold text-sky-50">개인정보 전송 안내</p>
                            <p className="mt-1">AI 기능을 실행하면 비식별화된 업무 내용이 선택한 AI 제공업체로 전송될 수 있습니다. 텍스트에 포함된 주요 직접식별정보(이름·연락처·주민등록번호·이메일·생년월일 등)를 이 컴퓨터에서 먼저 가린 뒤 전송하며, 자동 규칙이 모든 개인정보를 찾아내지는 못하므로 꼭 필요한 내용만 입력해 주세요.</p>
                            <p className="mt-1">스캔한 PDF나 이미지처럼 원본 첨부파일을 그대로 보내야 하는 기능은 보내기 전에 별도로 확인을 받습니다.</p>
                            <p className="mt-1 text-sky-50/65">사용하는 외부 AI 제공업체: Google Gemini, OpenAI, Anthropic Claude, Google Cloud Vision(글자 인식). AI 기능 사용 전 소속 기관의 개인정보 처리방침, 생성형 AI 사용 지침, 정보보안 지침을 확인해 주세요.</p>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-white/45">
                            AI 사용 방식은 설정에서 비용 절감 우선, 성능·비용 균형, 성능 우선·유료 사용 허용 중 선택할 수 있습니다. 초기값은 비용 절감 우선이며 자동 전환은 꺼져 있습니다.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {PROVIDER_CARDS.map(card => (
                        <section key={card.provider} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <div className="mb-4 flex items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br ${card.gradient}`}>
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
                                    className="input-field pr-11! font-mono text-sm"
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
                            {(() => {
                                const verdict = checkKeyFormatForSlot(card.provider, normalizeApiKeyInput(keys[card.provider]).value);
                                if (verdict.status === 'mismatch') {
                                    const target = verdict.suggestedSlot as AIProvider;
                                    return (
                                        <div role="alert" data-testid={`onboarding-key-format-${card.provider}`} className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                                            <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{verdict.message}</p>
                                            {target !== card.provider && (
                                                <button type="button" onClick={() => moveKey(card.provider, target)} className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-amber-300/40 px-2 py-0.5 font-semibold hover:bg-amber-400/20">
                                                    <ArrowRightLeft className="h-3 w-3" /> {API_KEY_SLOT_LABELS[target]} 카드로 옮기기
                                                </button>
                                            )}
                                        </div>
                                    );
                                }
                                if (verdict.status === 'unknown') return <p className="mt-2 text-xs text-amber-200/80">{verdict.message}</p>;
                                return <p className="mt-2 text-[11px] text-white/35">{API_KEY_FORMAT_HINTS[card.provider]}</p>;
                            })()}
                            {checkResults[card.provider] && (
                                <p data-testid={`onboarding-key-check-${card.provider}`} role="status" className="mt-2 flex items-start gap-1.5 text-xs">
                                    {checkResults[card.provider] === 'checking' ? (
                                        <span className="inline-flex items-center gap-1.5 text-white/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 연결 확인 중…</span>
                                    ) : (checkResults[card.provider] as { ok: boolean }).ok ? (
                                        <span className="inline-flex items-start gap-1.5 text-emerald-300"><CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> 연결 정상</span>
                                    ) : (
                                        <span className="inline-flex items-start gap-1.5 text-red-300"><CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {(checkResults[card.provider] as { message: string }).message}</span>
                                    )}
                                </p>
                            )}
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
                        className="btn-ghost px-5! py-2.5!"
                        disabled={saving}
                        onClick={() => {
                            rememberChoice('later');
                            setKeys({ ...EMPTY_KEYS });
                            setVisible(false);
                        }}
                    >
                        나중에 설정하기
                    </button>
                    {hasFailedCheck && (
                        <button type="button" className="btn-secondary px-5! py-2.5!" disabled={saving} onClick={finishAnyway}>
                            확인 결과와 관계없이 시작
                        </button>
                    )}
                    <button type="button" className="btn-primary px-5! py-2.5! disabled:opacity-50" disabled={saving} onClick={() => void handleSave()}>
                        {saving ? '저장·연결 확인 중…' : hasFailedCheck ? '고친 키로 다시 저장' : '저장하고 시작하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
