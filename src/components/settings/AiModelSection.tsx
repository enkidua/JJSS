import { motion } from 'framer-motion';
import { AlertTriangle, Check, Server } from 'lucide-react';
import { useSettingsStore, type LLMProvider } from '../../store/settingsStore';
import { useAppToast } from '../Toast';
import { PROVIDER_INFO, errorText, type SettingsSectionProps } from './settingsShared';

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
            <p className="text-white/50 text-sm mb-4">문서 생성 시 기본으로 사용할 AI 모델을 선택하세요.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {settings.llmConfigs.map((config) => {
                    const info = PROVIDER_INFO[config.provider];
                    const isActive = settings.selectedProvider === config.provider;
                    const hasKey = config.apiKey.length > 0;
                    return (
                        <button
                            type="button"
                            key={config.provider}
                            aria-pressed={isActive}
                            onClick={() => void handleProviderSelect(config.provider)}
                            className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                                isActive
                                    ? 'bg-white/10 border-white/30 shadow-lg'
                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>
                                    {info.label}
                                </span>
                                {isActive && (
                                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                {hasKey ? (
                                    <span className="text-xs text-emerald-400">키 등록됨</span>
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
        </motion.section>
    );
}
