import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { normalizeAIFailover, type AIFailoverSettings, type AIUsagePolicy } from '../../config/aiFailover';
import { getTodayAIRequestUsage, MAX_ATTEMPTS_PER_JOB } from '../../services/aiRequestSafety';
import { useConfirm } from '../common/ConfirmProvider';
import { useAppToast } from '../Toast';
import { errorText, type SettingsSectionProps } from './settingsShared';

const usagePolicyOptions: Array<{ value: AIUsagePolicy; label: string; description: string }> = [
    {
        value: 'economy',
        label: '비용 절감 우선',
        description: '저비용 모델을 우선 사용하고, 허용된 범위에서 다른 저비용 AI로 전환합니다.',
    },
    {
        value: 'balanced',
        label: '성능·비용 균형',
        description: '일반 업무에 적합한 균형형 모델과 다른 제공업체의 균형형 모델을 우선합니다.',
    },
    {
        value: 'premium',
        label: '성능 우선 · 유료 사용 허용',
        description: '중요 문서나 복잡한 분석에서 고성능 모델 사용을 허용합니다. API 비용이 발생할 수 있습니다.',
    },
];

/** AI 자동 전환·비용 정책 (설정 화면 "비용·자동 전환" 섹션) */
export default function FailoverSection({ onSaved }: SettingsSectionProps) {
    const settings = useSettingsStore(state => state.settings);
    const updateAIFailover = useSettingsStore(state => state.updateAIFailover);
    const confirm = useConfirm();
    const showToast = useAppToast();
    const aiFailover = normalizeAIFailover(settings.aiFailover);
    const todayAIUsage = getTodayAIRequestUsage();

    const handleFailoverUpdate = async (updates: Partial<AIFailoverSettings>) => {
        try {
            await updateAIFailover(updates);
            onSaved();
        } catch (error) {
            showToast(errorText(error, 'AI 자동 전환 설정 저장 중 오류가 발생했습니다.'), 'error');
        }
    };

    const handleUsagePolicyChange = async (usagePolicy: AIUsagePolicy) => {
        if (usagePolicy === 'premium' && !aiFailover.premiumConsentConfirmed) {
            const confirmed = await confirm({
                title: '유료 API 사용을 허용하시겠습니까?',
                message: '고성능 AI 모델은 제공업체의 요금 정책에 따라 API 비용이 발생할 수 있습니다.\n\n'
                    + 'JJSS는 실제 결제 금액이나 남은 크레딧을 정확하게 보장하거나 계산하지 않습니다.',
                confirmLabel: '유료 사용 허용',
                tone: 'danger',
            });
            if (!confirmed) return;
            await handleFailoverUpdate({ usagePolicy, premiumConsentConfirmed: true });
            return;
        }
        await handleFailoverUpdate({ usagePolicy });
    };

    const handleCrossProviderChange = async (allowCrossProvider: boolean) => {
        if (allowCrossProvider && !aiFailover.crossProviderConsentConfirmed) {
            const confirmed = await confirm({
                title: '다른 AI 제공업체 자동 전환을 허용하시겠습니까?',
                message: '전환이 발생하면 현재 작업에 입력한 내용이 선택된 다른 제공업체로 전송될 수 있습니다.\n'
                    + '유료 API 사용 허용과는 별개의 개인정보 전송 동의입니다.',
                confirmLabel: '전환 허용',
                tone: 'danger',
            });
            if (!confirmed) return;
            await handleFailoverUpdate({ allowCrossProvider: true, crossProviderConsentConfirmed: true });
            return;
        }
        await handleFailoverUpdate({ allowCrossProvider });
    };

    return (
        <motion.section
            id="ai-failover"
            tabIndex={-1}
            aria-labelledby="ai-failover-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="glass-card mb-6 scroll-mt-40"
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-emerald-400" />
                        <h2 id="ai-failover-title" className="text-lg font-bold text-white">AI 자동 전환</h2>
                    </div>
                    <p className="mt-2 text-sm text-white/50">오류가 발생했을 때 최대 3회 안에서 허용된 모델만 시도합니다.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-sm font-medium text-white/75">자동 전환</span>
                    <input
                        type="checkbox"
                        checked={aiFailover.enabled}
                        onChange={event => void handleFailoverUpdate({ enabled: event.target.checked })}
                        className="h-4 w-4 accent-emerald-500"
                    />
                    <span className={`text-xs font-bold ${aiFailover.enabled ? 'text-emerald-300' : 'text-white/35'}`}>
                        {aiFailover.enabled ? '켜짐' : '꺼짐'}
                    </span>
                </label>
            </div>

            <fieldset className="mt-5" disabled={!aiFailover.enabled}>
                <legend className="mb-3 text-sm font-bold text-white/75">사용 정책</legend>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {usagePolicyOptions.map(option => (
                        <label
                            key={option.value}
                            className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                                aiFailover.usagePolicy === option.value
                                    ? 'border-emerald-400/40 bg-emerald-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                            } ${!aiFailover.enabled ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                            <span className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="ai-usage-policy"
                                    value={option.value}
                                    checked={aiFailover.usagePolicy === option.value}
                                    onChange={() => void handleUsagePolicyChange(option.value)}
                                    className="h-4 w-4 accent-emerald-500"
                                />
                                <span className="text-sm font-bold text-white">{option.label}</span>
                            </span>
                            <span className="mt-2 block text-xs leading-relaxed text-white/50">{option.description}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className={`mt-4 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4 ${!aiFailover.enabled ? 'opacity-50' : ''}`}>
                <label className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        checked={aiFailover.allowCrossProvider}
                        disabled={!aiFailover.enabled}
                        onChange={event => void handleCrossProviderChange(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                    />
                    <span>
                        <span className="block text-sm font-medium text-white/75">다른 AI 제공업체 자동 전환 허용</span>
                        <span className="mt-1 block text-xs text-white/45">입력 내용이 다른 제공업체로 전송될 수 있으며, 유료 사용 허용과 별도로 동의합니다.</span>
                    </span>
                </label>

                <label className="flex items-start gap-3 border-t border-white/10 pt-3">
                    <input
                        type="checkbox"
                        checked={aiFailover.switchOn.rateLimit}
                        disabled={!aiFailover.enabled}
                        onChange={event => void handleFailoverUpdate({
                            switchOn: { ...aiFailover.switchOn, rateLimit: event.target.checked },
                        })}
                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                    />
                    <span>
                        <span className="block text-sm font-medium text-white/75">일반 요청 제한(429) 때 자동 전환</span>
                        <span className="mt-1 block text-xs text-white/45">기본값은 꺼짐입니다. 켜면 일시적인 요청 제한에도 허용된 다른 AI를 호출할 수 있습니다.</span>
                    </span>
                </label>

                {aiFailover.usagePolicy === 'premium' && aiFailover.enabled && (
                    <div className="space-y-3 border-t border-white/10 pt-3">
                        <label className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={aiFailover.confirmBeforePremium}
                                onChange={event => void handleFailoverUpdate({ confirmBeforePremium: event.target.checked })}
                                className="mt-0.5 h-4 w-4 accent-amber-500"
                            />
                            <span>
                                <span className="block text-sm font-medium text-white/75">고성능 모델 사용 전 확인</span>
                                <span className="mt-1 block text-xs text-white/45">자동 전환 중 고성능 모델을 호출하기 전에 사용 여부를 묻습니다.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={aiFailover.allowPremiumAutoUpgrade}
                                onChange={event => void handleFailoverUpdate({ allowPremiumAutoUpgrade: event.target.checked })}
                                className="mt-0.5 h-4 w-4 accent-amber-500"
                            />
                            <span>
                                <span className="block text-sm font-medium text-white/75">필요 시 고성능 모델로 자동 전환</span>
                                <span className="mt-1 block text-xs text-amber-100/60">선택한 모델을 사용할 수 없을 때 고성능 모델을 허용합니다. API 비용이 증가할 수 있습니다.</span>
                            </span>
                        </label>
                    </div>
                )}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-white/40">
                유료 사용 허용은 이미 사용자가 결제·크레딧을 설정한 API 계정의 모델 호출만 허용합니다. JJSS는 결제 수단 등록, 자동 충전, 구독 변경 또는 API 크레딧 구매를 수행하지 않습니다.
            </p>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked readOnly disabled aria-label="API 비용 보호 항상 켜짐" className="h-4 w-4 accent-emerald-500" />
                        <span className="text-sm font-bold text-emerald-200">API 비용 보호 켜짐</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                        중복 요청, 자동 재시도, 같은 제공업체 재호출을 차단하며 한 작업의 생성형 API 호출을 최대 {MAX_ATTEMPTS_PER_JOB}회로 제한합니다. 이 핵심 보호 기능은 해제할 수 없습니다.
                    </p>
                </div>
                <div className="shrink-0 rounded-lg bg-black/20 px-3 py-2 text-right">
                    <span className="block text-[11px] text-white/40">오늘 AI API 요청</span>
                    <span className="text-lg font-black text-emerald-300">{todayAIUsage.generationRequests}회</span>
                </div>
            </div>
        </motion.section>
    );
}
