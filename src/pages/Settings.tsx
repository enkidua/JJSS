import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Settings as SettingsIcon, Key, Server, Check, Eye, EyeOff,
    Sparkles, AlertTriangle, Shield, ChevronDown, DownloadCloud, UploadCloud, Database, FolderOpen, FolderInput
} from 'lucide-react';
import { useSettingsStore, LLMProvider } from '../store/settingsStore';
import { exportAllData, importAllData } from '../config/localDB';
import {
    chooseLegacyImportFolder, getJjssPaths, importLegacyDocuments, openJjssFolder,
    saveJjssText, savedLocationMessage,
} from '../utils/jjssFileService';
import type { JjssFileCategory, JjssPaths, LegacyImportPreview } from '../types/jjssFiles';
import { AI_MODEL_LABELS, AI_MODEL_OPTIONS } from '../config/aiModels';
import {
    normalizeAIFailover,
    type AIFailoverSettings,
    type AIUsagePolicy,
} from '../config/aiFailover';
import { getTodayAIRequestUsage, MAX_ATTEMPTS_PER_JOB } from '../services/aiRequestSafety';
import { checkGeminiConnection } from '../services/gemini';

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

const providerInfo: Record<LLMProvider, { label: string; color: string; gradient: string; description: string }> = {
    gemini: {
        label: 'Google Gemini',
        color: 'text-blue-400',
        gradient: 'from-blue-500 to-cyan-600',
        description: 'Google AI Studio에서 최신 API 키를 발급해 입력하세요.',
    },
    openai: {
        label: 'OpenAI',
        color: 'text-emerald-400',
        gradient: 'from-emerald-500 to-teal-600',
        description: 'OpenAI Platform에서 API 키를 발급받으세요.',
    },
    anthropic: {
        label: 'Anthropic Claude',
        color: 'text-orange-400',
        gradient: 'from-orange-500 to-red-600',
        description: 'Anthropic Console에서 API 키를 발급받으세요.',
    },
};

export default function Settings() {
    const { settings, loadSettings, updateApiKey, updateModel, setSelectedProvider, updateVisionApiKey, updateAIFailover, loaded, error, recoveryNotice } = useSettingsStore();
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [showVisionKey, setShowVisionKey] = useState(false);
    const [saved, setSaved] = useState(false);
    const [jjssPaths, setJjssPaths] = useState<JjssPaths | null>(null);
    const [legacyPreview, setLegacyPreview] = useState<LegacyImportPreview | null>(null);
    const [includeLegacySubfolders, setIncludeLegacySubfolders] = useState(true);
    const [fileOperationMessage, setFileOperationMessage] = useState('');
    const [fileOperationBusy, setFileOperationBusy] = useState(false);
    const [geminiCheck, setGeminiCheck] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: '', error: false });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const aiFailover = normalizeAIFailover(settings.aiFailover);
    const todayAIUsage = getTodayAIRequestUsage();

    useEffect(() => {
        if (!loaded) loadSettings();
    }, [loaded, loadSettings]);

    useEffect(() => {
        void getJjssPaths().then(setJjssPaths).catch(() => setFileOperationMessage('JJSS 문서 폴더를 준비하지 못했습니다.'));
    }, []);

    const toggleShowKey = (provider: string) => {
        setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
    };

    const handleApiKeyChange = async (provider: LLMProvider, value: string) => {
        try {
            await updateApiKey(provider, value);
            flashSaved();
        } catch (err: any) {
            alert(err?.message || 'API 키 저장 중 오류가 발생했습니다.');
        }
    };

    const handleModelChange = async (provider: LLMProvider, model: string) => {
        try {
            await updateModel(provider, model);
            flashSaved();
        } catch (err: any) {
            alert(err?.message || '모델 설정 저장 중 오류가 발생했습니다.');
        }
    };

    const handleGeminiCheck = async (apiKey: string, model: string) => {
        if (geminiCheck.busy) return;
        setGeminiCheck({ busy: true, message: '', error: false });
        try {
            const message = await checkGeminiConnection(apiKey, model);
            setGeminiCheck({ busy: false, message: `연결 정상 · ${message}`, error: false });
        } catch (error: any) {
            setGeminiCheck({ busy: false, message: error?.message || 'Gemini 연결을 확인하지 못했습니다.', error: true });
        }
    };

    const handleProviderSelect = async (provider: LLMProvider) => {
        try {
            await setSelectedProvider(provider);
            flashSaved();
        } catch (err: any) {
            alert(err?.message || '기본 모델 저장 중 오류가 발생했습니다.');
        }
    };

    const handleVisionKeyChange = async (value: string) => {
        try {
            await updateVisionApiKey(value);
            flashSaved();
        } catch (err: any) {
            alert(err?.message || 'Vision API 키 저장 중 오류가 발생했습니다.');
        }
    };

    const handleFailoverUpdate = async (updates: Partial<AIFailoverSettings>) => {
        try {
            await updateAIFailover(updates);
            flashSaved();
        } catch (err: any) {
            alert(err?.message || 'AI 자동 전환 설정 저장 중 오류가 발생했습니다.');
        }
    };

    const handleUsagePolicyChange = async (usagePolicy: AIUsagePolicy) => {
        if (usagePolicy === 'premium' && !aiFailover.premiumConsentConfirmed) {
            const confirmed = window.confirm(
                '유료 API 사용을 허용하시겠습니까?\n\n' +
                '고성능 AI 모델은 제공업체의 요금 정책에 따라 API 비용이 발생할 수 있습니다.\n\n' +
                'JJSS는 실제 결제 금액이나 남은 크레딧을 정확하게 보장하거나 계산하지 않습니다.',
            );
            if (!confirmed) return;
            await handleFailoverUpdate({ usagePolicy, premiumConsentConfirmed: true });
            return;
        }
        await handleFailoverUpdate({ usagePolicy });
    };

    const handleCrossProviderChange = async (allowCrossProvider: boolean) => {
        if (allowCrossProvider && !aiFailover.crossProviderConsentConfirmed) {
            const confirmed = window.confirm(
                '다른 AI 제공업체 자동 전환을 허용하시겠습니까?\n\n' +
                '전환이 발생하면 현재 작업에 입력한 내용이 선택된 다른 제공업체로 전송될 수 있습니다.\n' +
                '유료 API 사용 허용과는 별개의 개인정보 전송 동의입니다.',
            );
            if (!confirmed) return;
            await handleFailoverUpdate({ allowCrossProvider: true, crossProviderConsentConfirmed: true });
            return;
        }
        await handleFailoverUpdate({ allowCrossProvider });
    };

    const handleExportData = async () => {
        try {
            const jsonString = await exportAllData();
            const result = await saveJjssText('backup', `jjss_backup_${new Date().toISOString().slice(0, 10)}.json`, jsonString, 'application/json');
            setFileOperationMessage(savedLocationMessage(result));
        } catch (e: any) {
            alert('데이터 내보내기 실패: ' + e.message);
        }
    };

    const handleChooseLegacyFolder = async () => {
        setFileOperationBusy(true);
        setFileOperationMessage('');
        try {
            const preview = await chooseLegacyImportFolder(includeLegacySubfolders);
            if (preview.canceled) return;
            if (preview.error === 'source-inside-jjss-root') {
                setFileOperationMessage('이미 JJSS 문서 폴더 안에 있는 위치는 가져오기 대상으로 선택할 수 없습니다.');
                return;
            }
            setLegacyPreview(preview);
            setFileOperationMessage(preview.total ? `JJSS 생성파일 ${preview.total}개를 찾았습니다.` : '선택한 폴더에서 가져올 JJSS 생성파일을 찾지 못했습니다.');
        } catch (err: any) {
            setFileOperationMessage(err?.message || '기존 JJSS 문서 폴더를 확인하지 못했습니다.');
        } finally {
            setFileOperationBusy(false);
        }
    };

    const handleOpenFolder = async (folderKey: 'documents' | 'backup') => {
        setFileOperationMessage('');
        try {
            await openJjssFolder(folderKey);
        } catch {
            setFileOperationMessage('JJSS 폴더를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    };

    const handleLegacyImport = async (mode: 'copy' | 'move') => {
        if (!legacyPreview?.token || !legacyPreview.total) return;
        if (mode === 'move' && !window.confirm('복사 및 검증이 완료된 파일만 원본 폴더에서 삭제됩니다. 새 JJSS 문서 폴더로 이동하시겠습니까?')) return;
        setFileOperationBusy(true);
        try {
            const result = await importLegacyDocuments(legacyPreview.token, mode);
            setFileOperationMessage(`${result.imported}개 파일을 ${mode === 'copy' ? '복사' : '이동'}했습니다.${mode === 'copy' ? ' 원본 파일은 유지됩니다.' : ''}`);
            setLegacyPreview(null);
        } catch (err: any) {
            setFileOperationMessage(err?.message || '기존 JJSS 문서를 가져오지 못했습니다. 원본 파일은 유지됩니다.');
        } finally {
            setFileOperationBusy(false);
        }
    };

    const importCategoryLabels: Record<JjssFileCategory, string> = {
        backup: '백업', 'rehab-plan': '직업재활계획서', 'vocational-evaluation': '직업평가',
        'case-management': '상담·사례관리', budget: '예산', minutes: '회의록', utility: '업무지원', image: '이미지', other: '기타 JJSS 파일',
    };

    const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (!window.confirm('경고: 데이터 복원은 현재 저장된 이용자, 사업체, 사례 문서, 직업훈련 기록 등을 백업 파일 내용으로 덮어쓸 수 있습니다.\n\n복원 전에 현재 데이터 백업을 먼저 만들어 두는 것을 권장합니다.\n\n계속 진행하시겠습니까?')) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        try {
            const text = await file.text();
            await importAllData(text);
            alert('데이터 복원이 완료되었습니다. 프로그램이 재시작됩니다.');
            window.location.reload();
        } catch (err: any) {
            alert('데이터 불러오기 실패: 올바른 백업 파일인지 확인해주세요. (' + err.message + ')');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const flashSaved = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                        <SettingsIcon className="w-4 h-4 text-primary-400" />
                        <span className="text-sm text-primary-300 font-medium">시스템 설정</span>
                    </div>
                    <h1 className="section-title mb-3">API 설정</h1>
                    <p className="text-white/50 text-lg">AI 모델 API 키를 설정하고 기본 모델을 선택하세요</p>
                </motion.div>

                {/* 보안 안내 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card !p-5 mb-8 flex items-start gap-3"
                >
                    <Shield className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-white/80 text-sm font-medium mb-1">로컬 전용 보안</p>
                        <p className="text-white/50 text-xs leading-relaxed">
                            모든 API 키는 AES-GCM 256비트 암호화 후 사용자의 컴퓨터(IndexedDB)에만 저장되며,
                            외부 서버로 전송되지 않습니다. 머신 고유 식별자를 기반으로 암호화되어 안전하게 보관됩니다.
                        </p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="glass-card !p-5 mb-8 flex items-start gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
                    <div className="text-xs leading-relaxed text-white/55">
                        <p className="text-white/80 text-sm font-medium mb-2">비용·quota 안내</p>
                        <p>일반 문서 생성은 비용 부담이 낮은 편입니다. 이미지 생성, PDF/이미지 분석, OCR 반복 실행은 더 많은 quota를 사용할 수 있습니다.</p>
                        <p className="mt-1">기본 모델은 Gemini 3.6 Flash, GPT-5.6 Terra, Claude Sonnet 5입니다. 자동 전환은 기본적으로 꺼져 있으며, 사용자가 허용한 비용 정책과 제공업체 범위 안에서만 최대 3회 시도합니다.</p>
                    </div>
                </motion.div>

                {/* 저장 완료 알림 */}
                {(error || recoveryNotice) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error || recoveryNotice}</span>
                    </motion.div>
                )}

                {/* 저장 완료 알림 */}
                {saved && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        설정이 저장되었습니다.
                    </motion.div>
                )}

                {/* 기본 모델 선택 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="glass-card mb-6"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Server className="w-5 h-5 text-primary-400" />
                        <h2 className="text-lg font-bold text-white">기본 AI 모델</h2>
                    </div>
                    <p className="text-white/50 text-sm mb-4">문서 생성 시 기본으로 사용할 AI 모델을 선택하세요.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {settings.llmConfigs.map((config) => {
                            const info = providerInfo[config.provider];
                            const isActive = settings.selectedProvider === config.provider;
                            const hasKey = config.apiKey.length > 0;
                            return (
                                <button
                                    key={config.provider}
                                    onClick={() => handleProviderSelect(config.provider)}
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
                </motion.div>

                {/* AI 자동 전환 및 비용 정책 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="glass-card mb-6"
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-emerald-400" />
                                <h2 className="text-lg font-bold text-white">AI 자동 전환</h2>
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
                                {aiFailover.enabled ? 'ON' : 'OFF'}
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
                                        <span className="mt-1 block text-xs text-white/45">자동 전환 중 premium 모델을 호출하기 전에 사용 여부를 묻습니다.</span>
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
                                        <span className="mt-1 block text-xs text-amber-100/60">선택한 모델을 사용할 수 없을 때 premium 모델을 허용합니다. API 비용이 증가할 수 있습니다.</span>
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
                                <input type="checkbox" checked readOnly disabled className="h-4 w-4 accent-emerald-500" />
                                <span className="text-sm font-bold text-emerald-200">API 비용 보호 ON</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-white/45">
                                중복 요청, 자동 재시도, Provider 재방문을 차단하며 한 작업의 생성형 API 호출을 최대 {MAX_ATTEMPTS_PER_JOB}회로 제한합니다. 이 핵심 보호 기능은 해제할 수 없습니다.
                            </p>
                        </div>
                        <div className="shrink-0 rounded-lg bg-black/20 px-3 py-2 text-right">
                            <span className="block text-[11px] text-white/40">오늘 AI API 요청</span>
                            <span className="text-lg font-black text-emerald-300">{todayAIUsage.generationRequests}회</span>
                        </div>
                    </div>
                </motion.div>

                {/* 각 모델별 설정 */}
                <div className="space-y-4">
                    {settings.llmConfigs.map((config, idx) => {
                        const info = providerInfo[config.provider];
                        const isShowing = showKeys[config.provider];
                        return (
                            <motion.div
                                key={config.provider}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + idx * 0.05 }}
                                className="glass-card"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center`}>
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold">{info.label}</h3>
                                        <p className="text-white/40 text-xs">{info.description}</p>
                                    </div>
                                </div>

                                {/* API Key */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                                        <Key className="w-3.5 h-3.5" /> API 키
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={isShowing ? 'text' : 'password'}
                                            placeholder="API 키를 입력하세요"
                                            value={config.apiKey}
                                            onChange={(e) => handleApiKeyChange(config.provider, e.target.value)}
                                            className="input-field !pr-12 font-mono text-sm"
                                        />
                                        <button
                                            onClick={() => toggleShowKey(config.provider)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                                        >
                                            {isShowing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Model Select */}
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                                        <Server className="w-3.5 h-3.5" /> 모델
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={config.model}
                                            onChange={(e) => handleModelChange(config.provider, e.target.value)}
                                            className="input-field appearance-none cursor-pointer text-sm"
                                        >
                                            {config.availableModels.map((m) => (
                                                <option key={m} value={m} className="bg-slate-800 text-white">
                                                    {AI_MODEL_LABELS[m] || m}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                                    </div>
                                    <p className="mt-2 text-xs text-white/40">
                                        {AI_MODEL_OPTIONS[config.provider].find(option => option.id === config.model)?.description}
                                    </p>
                                    {config.provider === 'gemini' && (
                                        <div className="mt-3 flex flex-wrap items-center gap-3">
                                            <button type="button" disabled={geminiCheck.busy} onClick={() => void handleGeminiCheck(config.apiKey, config.model)} className="btn-secondary !px-3 !py-2 text-xs disabled:opacity-50">
                                                {geminiCheck.busy ? '연결 확인 중…' : 'Gemini 연결 확인'}
                                            </button>
                                            {geminiCheck.message && <span className={`text-xs ${geminiCheck.error ? 'text-red-300' : 'text-emerald-300'}`}>{geminiCheck.message}</span>}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Vision API 키 설정 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass-card !p-6 mt-8"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold">Google Cloud Vision API</h3>
                            <p className="text-white/40 text-xs">OCR(이미지 텍스트 인식)에 사용됩니다</p>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5" /> Vision API 키
                        </label>
                        <div className="relative">
                            <input
                                type={showVisionKey ? 'text' : 'password'}
                                placeholder="Vision API 키를 입력하세요"
                                value={settings.visionApiKey}
                                onChange={(e) => handleVisionKeyChange(e.target.value)}
                                className="input-field !pr-12 font-mono text-sm"
                            />
                            <button
                                onClick={() => setShowVisionKey(!showVisionKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                            >
                                {showVisionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 text-xs text-white/50 leading-relaxed">
                        <p className="font-medium text-white/70 mb-2">📋 Vision API 키 발급 방법</p>
                        <ol className="space-y-1 list-decimal list-inside">
                            <li>Google Cloud Console (console.cloud.google.com) 접속</li>
                            <li>프로젝트 선택 또는 새 프로젝트 생성</li>
                            <li>"API 및 서비스" → "라이브러리"에서 "Cloud Vision API" 검색 후 사용 설정</li>
                            <li>"사용자 인증 정보" → "사용자 인증 정보 만들기" → "API 키"</li>
                            <li>생성된 API 키를 복사하여 위에 입력</li>
                        </ol>
                    </div>
                </motion.div>

                {/* 데이터 백업 및 복원 (마이그레이션) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass-card !p-6 mt-8 mb-20"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                            <Database className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold">데이터 백업 및 마이그레이션</h3>
                            <p className="text-white/40 text-xs">컴퓨터에 저장된 모든 데이터를 파일로 저장하거나 불러옵니다.</p>
                        </div>
                    </div>

                    <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100/80">
                        <p className="font-bold text-amber-100 mb-2">백업 파일 보안 안내</p>
                        <p>백업 파일에는 이용자명, 상담 내용, 사례 문서, 직업훈련 기록 등 개인정보가 포함될 수 있습니다.</p>
                        <p>API 키는 백업 파일에서 제외되며, 복원 후 필요한 API 키는 설정 화면에서 다시 확인해 주세요.</p>
                        <p>백업 파일은 외부에 공유하지 말고 안전한 위치에 보관해 주세요.</p>
                        <p>데이터 복원은 기존 데이터를 덮어쓸 수 있으므로 실행 전 현재 데이터 백업을 먼저 만들어 두는 것을 권장합니다.</p>
                    </div>

                    <div className="mb-4 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 text-xs leading-relaxed text-blue-100/80">
                        <p className="font-bold text-blue-100 mb-2">데이터 저장 위치 및 업데이트 전 백업 안내</p>
                        <p>JJSS 데이터는 기본적으로 현재 PC의 앱 저장소(IndexedDB/localStorage)에 저장됩니다. 개발/브라우저 모드에서는 브라우저 IndexedDB/localStorage에 저장됩니다.</p>
                        <p className="mt-2">Windows: 기존 버전을 삭제하거나 새 버전으로 교체하기 전에는 반드시 데이터 백업을 먼저 실행해 주세요. 현재 Windows 설치 파일의 언인스톨 동작이 환경에 따라 완전하지 않을 수 있으므로, 백업 파일을 별도 폴더에 보관해 주세요.</p>
                        <p className="mt-2">macOS: 앱 파일을 삭제하거나 새 dmg로 교체하기 전에도 데이터 백업을 권장합니다. 로컬 저장소가 유지될 수 있으나 사용 환경에 따라 데이터가 사라질 수 있으므로, Apple Silicon용 dmg 설치 전 데이터 내보내기를 실행해 주세요.</p>
                        <p className="mt-2">설치 파일 또는 dmg를 다시 실행해도 업데이트 전 백업을 권장합니다. Windows 설치형 JJSS에서 생성한 백업과 문서는 아래 표시된 사용자 Documents의 JJSS 폴더를 기본 위치로 사용합니다.</p>
                    </div>

                    <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-xs leading-relaxed text-emerald-100/80">
                        <p className="font-bold text-emerald-100 mb-2">JJSS 파일 저장 위치</p>
                        {jjssPaths ? (
                            <div className="space-y-1 break-all">
                                <p><span className="text-white/45">기본 폴더:</span> {jjssPaths.root}</p>
                                <p><span className="text-white/45">백업:</span> {jjssPaths.backup}</p>
                                <p><span className="text-white/45">문서:</span> {jjssPaths.documents}</p>
                            </div>
                        ) : (
                            <p>브라우저 개발 모드에서는 기존 브라우저 다운로드 위치를 사용합니다.</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" disabled={!jjssPaths} onClick={() => void handleOpenFolder('documents')} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                                <FolderOpen className="w-4 h-4" /> 문서 폴더 열기
                            </button>
                            <button type="button" disabled={!jjssPaths} onClick={() => void handleOpenFolder('backup')} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                                <FolderOpen className="w-4 h-4" /> 백업 폴더 열기
                            </button>
                            <button type="button" disabled={!jjssPaths || fileOperationBusy} onClick={() => void handleChooseLegacyFolder()} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                                <FolderInput className="w-4 h-4" /> 기존 JJSS 문서 가져오기
                            </button>
                        </div>
                        <label className="mt-3 flex items-start gap-2 text-xs text-white/65">
                            <input
                                type="checkbox"
                                checked={includeLegacySubfolders}
                                disabled={!jjssPaths || fileOperationBusy}
                                onChange={event => setIncludeLegacySubfolders(event.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-emerald-500"
                            />
                            <span>선택한 폴더의 하위 폴더도 확인 (기본 켜짐, 최대 5단계·5,000개)</span>
                        </label>
                        {fileOperationMessage && <p className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-white/75 whitespace-pre-wrap">{fileOperationMessage}</p>}
                        {legacyPreview && !legacyPreview.canceled && (
                            <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4">
                                <p className="font-bold text-white">발견한 JJSS 파일: {legacyPreview.total || 0}개</p>
                                <p className="mt-1 break-all text-white/45">선택 폴더: {legacyPreview.sourceFolder}</p>
                                <p className="mt-1 text-white/45">하위 폴더 확인: {legacyPreview.includeSubfolders ? '포함' : '선택 폴더만'}</p>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                                    {Object.entries(legacyPreview.summary || {}).map(([category, count]) => (
                                        <span key={category}>{importCategoryLabels[category as JjssFileCategory]} {count}</span>
                                    ))}
                                </div>
                                <p className="mt-3 text-white/45">일반 사진·개인 문서 등 JJSS 파일명 규칙과 맞지 않는 파일은 건드리지 않습니다.</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" disabled={!legacyPreview.total || fileOperationBusy} onClick={() => void handleLegacyImport('copy')} className="btn-primary !px-3 !py-2 disabled:opacity-40">복사 후 원본 유지 (권장)</button>
                                    <button type="button" disabled={!legacyPreview.total || fileOperationBusy} onClick={() => void handleLegacyImport('move')} className="btn-secondary !px-3 !py-2 disabled:opacity-40">새 폴더로 이동</button>
                                    <button type="button" onClick={() => setLegacyPreview(null)} className="btn-ghost !px-3 !py-2">취소</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                            onClick={handleExportData}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-5 text-left transition-all group flex flex-col justify-between"
                        >
                            <div className="mb-4">
                                <DownloadCloud className="w-6 h-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                                <h4 className="text-white font-medium mb-1">모든 데이터 내보내기</h4>
                                <p className="text-white/40 text-xs leading-relaxed">
                                    이용자, 사업체, 사례 문서, 지출, 직업훈련 기록을 백업합니다. API 키는 제외됩니다. (.json 형식)
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-xl p-5 text-left transition-all group flex flex-col justify-between relative overflow-hidden"
                        >
                            <input
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                onChange={handleImportData}
                                className="hidden"
                            />
                            <div className="mb-4">
                                <UploadCloud className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                                <h4 className="text-white font-medium mb-1">데이터 불러오기</h4>
                                <p className="text-white/40 text-xs leading-relaxed">
                                    백업 파일 내용으로 현재 데이터를 복원합니다. 기존 데이터가 대체될 수 있으니 주의해 주세요.
                                </p>
                            </div>
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
