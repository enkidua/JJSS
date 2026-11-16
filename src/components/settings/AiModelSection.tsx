import { motion } from 'framer-motion';
import { AlertTriangle, Check, Info, Server } from 'lucide-react';
import { useSettingsStore, type LLMProvider } from '../../store/settingsStore';
import { normalizeAIFailover } from '../../config/aiFailover';
import { checkKeyFormatForSlot } from '../../config/apiKeyFormat';
import { resolveAIProviderRoute } from '../../config/aiProviderRoute';
import { useAppToast } from '../Toast';
import { PROVIDER_INFO, errorText, type SettingsSectionProps } from './settingsShared';

/** 사용자가 부르는 이름(카드 아래 작은 글씨) */
const PROVIDER_ALIAS: Record<LLMProvider, string> = {
    gemini: 'Gemini',
    openai: 'ChatGPT',
    anthropic: 'Claude',
};

type KeyState = 'usable' | 'mismatch' | 'missing';

function keyStateOf(provider: LLMProvider, apiKey: string): KeyState {
    const verdict = checkKeyFormatForSlot(provider, apiKey);
    if (verdict.status === 'empty') return 'missing';
    return verdict.status === 'mismatch' ? 'mismatch' : 'usable';
}

function focusKeyField(provider: LLMProvider) {
    const field = document.getElementById(`api-key-${provider}`);
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field?.focus({ preventScroll: true });
}

/** 기본 AI 제공업체 선택 (설정 화면 "AI 모델" 섹션) */
export default function AiModelSection({ onSaved }: SettingsSectionProps) {
    const settings = useSettingsStore(state => state.settings);
    const setSelectedProvider = useSettingsStore(state => state.setSelectedProvider);
    const showToast = useAppToast();

    const handleProviderSelect = async (provider: LLMProvider) => {
        if (provider === settings.selectedProvider) return;
        try {
            await setSelectedProvider(provider);
            onSaved();
        } catch (error) {
            showToast(errorText(error, '기본 모델 저장 중 오류가 발생했습니다.'), 'error');
        }
    };

    const keyStates = Object.fromEntries(settings.llmConfigs.map(config => [config.provider, keyStateOf(config.provider, config.apiKey)])) as Record<LLMProvider, KeyState>;
    const usableProviders = settings.llmConfigs.filter(config => keyStates[config.provider] === 'usable').map(config => config.provider);
    const selected = settings.selectedProvider;
    // 실제로 글 요청을 처리할 곳(기본 AI에 쓸 수 있는 키가 없으면 키가 등록된 다른 곳으로 보낸다).
    const route = resolveAIProviderRoute({
        selectedProvider: selected,
        usableProviders,
        providerOrder: normalizeAIFailover(settings.aiFailover).providerOrder,
    });
    const geminiUsable = usableProviders.includes('gemini');

    return (
        <motion.section
            id="ai-model"
            tabIndex={-1}
            aria-labelledby="ai-model-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card mb-6 scroll-mt-40"
        >
            <div className="flex items-center gap-2 mb-4">
                <Server className="w-5 h-5 text-primary-400" />
                <h2 id="ai-model-title" className="text-lg font-bold text-white">기본 AI 모델</h2>
            </div>
            <p className="text-white/50 text-sm mb-4">문서 생성 시 기본으로 사용할 AI를 선택하세요. API 키를 등록한 서비스를 고르면 됩니다.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {settings.llmConfigs.map((config) => {
                    const info = PROVIDER_INFO[config.provider];
                    const isActive = selected === config.provider;
                    const keyState = keyStates[config.provider];
                    return (
                        <button
                            type="button"
                            key={config.provider}
                            data-testid={`ai-provider-${config.provider}`}
                            data-key-state={keyState}
                            aria-pressed={isActive}
                            onClick={() => void handleProviderSelect(config.provider)}
                            className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                                isActive
                                    ? 'bg-white/10 border-white/30 shadow-lg'
                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>
                                    {info.label}
                                </span>
                                {isActive && (
                                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                            </div>
                            <p className="mb-2 text-xs text-white/40">{PROVIDER_ALIAS[config.provider]}</p>
                            <div className="flex items-center gap-1">
                                {keyState === 'usable' ? (
                                    <span className="text-xs text-emerald-400">키 등록됨</span>
                                ) : keyState === 'mismatch' ? (
                                    <span className="text-xs text-rose-300 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> 다른 서비스의 키가 들어 있음
                                    </span>
                                ) : (
                                    <span className="text-xs text-amber-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> 키 미등록
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {!route && (
                <div role="alert" data-testid="ai-route-notice" data-route="none" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">등록된 API 키가 없어 AI 기능을 쓸 수 없습니다. 쓰는 서비스 한 곳의 키만 넣으면 됩니다.</span>
                    <button type="button" onClick={() => focusKeyField(selected)} className="rounded-lg border border-red-300/40 px-3 py-1 text-xs font-semibold hover:bg-red-400/20">
                        {PROVIDER_INFO[selected].label} 키 입력하기
                    </button>
                </div>
            )}
            {route && route.reason === 'no-key' && (
                <div role="status" data-testid="ai-route-notice" data-route={route.provider} className="mt-4 space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                    <p className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            기본 AI로 고른 <b>{PROVIDER_INFO[selected].label}</b>({PROVIDER_ALIAS[selected]})에 {keyStates[selected] === 'mismatch' ? '맞는' : '등록된'} API 키가 없습니다.
                            지금은 키가 등록된 <b>{PROVIDER_INFO[route.provider].label}</b>로 처리합니다.
                        </span>
                    </p>
                    <div className="flex flex-wrap gap-2 pl-6">
                        <button type="button" data-testid="ai-route-use-fallback" onClick={() => void handleProviderSelect(route.provider)} className="rounded-lg border border-amber-200/40 px-3 py-1 text-xs font-semibold hover:bg-amber-300/20">
                            {PROVIDER_INFO[route.provider].label}를 기본 AI로 바꾸기
                        </button>
                        <button type="button" onClick={() => focusKeyField(selected)} className="rounded-lg border border-amber-200/40 px-3 py-1 text-xs font-semibold hover:bg-amber-300/20">
                            {PROVIDER_INFO[selected].label} 키 입력하기
                        </button>
                    </div>
                </div>
            )}
            {route && !geminiUsable && (
                <p data-testid="ai-gemini-only-note" className="mt-3 flex items-start gap-2 text-xs text-white/50">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        글 작성·요약과 글자가 들어 있는 PDF 분석은 지금 등록한 AI로 됩니다. 이미지 생성, 사진·스캔 문서 분석, 직업평가 결과지 사진 읽기는 Google Gemini 키가 있어야 합니다.
                    </span>
                </p>
            )}
        </motion.section>
    );
}
