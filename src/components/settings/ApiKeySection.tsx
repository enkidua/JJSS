import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Eye, EyeOff, Key, Server, Sparkles } from 'lucide-react';
import { useSettingsStore, type LLMProvider } from '../../store/settingsStore';
import { AI_MODEL_LABELS, AI_MODEL_OPTIONS } from '../../config/aiModels';
import { getAIReasoningLevels, type AIReasoningLevel } from '../../config/aiReasoning';
import { checkProviderConnection, type ConnectionCheckProvider } from '../../services/connectionCheck';
import { useAppToast } from '../Toast';
import { PROVIDER_INFO, errorText, type SettingsSectionProps } from './settingsShared';

type KeySlot = LLMProvider | 'vision';

interface CheckState {
    busy: boolean;
    message: string;
    error: boolean;
}

const SLOT_LABELS: Record<KeySlot, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    vision: 'Google Cloud Vision',
};

interface ApiKeyFieldProps {
    slot: KeySlot;
    inputId: string;
    label: string;
    placeholder: string;
    value: string;
    savedValue: string;
    saving: boolean;
    justSaved: boolean;
    onChange: (value: string) => void;
    onCommit: () => void;
}

/**
 * API 키 입력칸. 입력 중에는 화면 안에서만 바뀌고, 칸을 벗어나거나 "저장"을 누를 때 한 번 저장한다.
 * (한 글자마다 암호화·저장하면 글자 누락·저장 순서 뒤바뀜이 생길 수 있음)
 */
function ApiKeyField({ slot, inputId, label, placeholder, value, savedValue, saving, justSaved, onChange, onCommit }: ApiKeyFieldProps) {
    const [visible, setVisible] = useState(false);
    const dirty = value.trim() !== savedValue;
    const statusId = `${inputId}-status`;

    const handleGroupBlur = (event: FocusEvent<HTMLDivElement>) => {
        // 입력칸·보기 버튼·저장 버튼 묶음 밖으로 포커스가 나갈 때만 저장한다(저장 버튼은 클릭으로 저장).
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        onCommit();
    };

    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> {label}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row" onBlur={handleGroupBlur}>
                <div className="relative flex-1">
                    <input
                        id={inputId}
                        type={visible ? 'text' : 'password'}
                        placeholder={placeholder}
                        value={value}
                        autoComplete="off"
                        spellCheck={false}
                        aria-describedby={statusId}
                        onChange={event => onChange(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                onCommit();
                            }
                        }}
                        className="input-field !pr-12 font-mono text-sm"
                    />
                    <button
                        type="button"
                        aria-label={`${SLOT_LABELS[slot]} API 키 ${visible ? '숨기기' : '보기'}`}
                        onClick={() => setVisible(current => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                    >
                        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={onCommit}
                    className="btn-secondary !px-4 !py-2 text-sm shrink-0 disabled:opacity-40"
                >
                    {saving ? '저장 중…' : '저장'}
                </button>
            </div>
            <p id={statusId} role="status" aria-live="polite" className="mt-1.5 min-h-[1.25rem] text-xs">
                {saving ? (
                    <span className="text-white/50">저장하는 중입니다…</span>
                ) : dirty ? (
                    <span className="text-amber-300">아직 저장되지 않았습니다. 칸을 벗어나거나 "저장"을 누르면 저장됩니다.</span>
                ) : justSaved ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="h-3.5 w-3.5" /> 저장되었습니다.</span>
                ) : savedValue ? (
                    <span className="text-emerald-300/80">저장된 키가 있습니다.</span>
                ) : (
                    <span className="text-white/40">저장된 키가 없습니다.</span>
                )}
            </p>
        </div>
    );
}

interface ConnectionCheckRowProps {
    label: string;
    state?: CheckState;
    disabled: boolean;
    onCheck: () => void;
}

function ConnectionCheckRow({ label, state, disabled, onCheck }: ConnectionCheckRowProps) {
    return (
        <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={disabled || state?.busy} onClick={onCheck} className="btn-secondary !px-3 !py-2 text-xs disabled:opacity-50">
                {state?.busy ? '연결 확인 중…' : `${label} 연결 확인`}
            </button>
            {state?.message && (
                <span role={state.error ? 'alert' : 'status'} className={`text-xs ${state.error ? 'text-red-300' : 'text-emerald-300'}`}>
                    {state.message}
                </span>
            )}
        </div>
    );
}

/** 제공업체별 API 키·모델·추론 수준과 Vision API 키 (설정 화면 "API 키" 섹션) */
export default function ApiKeySection({ onSaved }: SettingsSectionProps) {
    const settings = useSettingsStore(state => state.settings);
    const updateApiKey = useSettingsStore(state => state.updateApiKey);
    const updateVisionApiKey = useSettingsStore(state => state.updateVisionApiKey);
    const updateModel = useSettingsStore(state => state.updateModel);
    const updateReasoningLevel = useSettingsStore(state => state.updateReasoningLevel);
    const showToast = useAppToast();

    // 입력 중인 값(없으면 저장된 값을 보여 줌)
    const [drafts, setDrafts] = useState<Partial<Record<KeySlot, string>>>({});
    const [savingSlots, setSavingSlots] = useState<Partial<Record<KeySlot, boolean>>>({});
    const [justSavedSlot, setJustSavedSlot] = useState<KeySlot | null>(null);
    const [checks, setChecks] = useState<Partial<Record<KeySlot, CheckState>>>({});
    const [modelSettingsBusy, setModelSettingsBusy] = useState(false);
    const savingRef = useRef(new Set<KeySlot>());
    const savedTimerRef = useRef<number | undefined>(undefined);
    const checkControllersRef = useRef(new Map<KeySlot, AbortController>());

    useEffect(() => () => {
        window.clearTimeout(savedTimerRef.current);
        checkControllersRef.current.forEach(controller => controller.abort());
    }, []);

    const savedKeyFor = (slot: KeySlot): string => {
        if (slot === 'vision') return settings.visionApiKey || '';
        return settings.llmConfigs.find(config => config.provider === slot)?.apiKey || '';
    };
    const draftFor = (slot: KeySlot): string => drafts[slot] ?? savedKeyFor(slot);

    const clearDraft = (slot: KeySlot) => {
        setDrafts(current => {
            const next = { ...current };
            delete next[slot];
            return next;
        });
    };

    const commitKey = async (slot: KeySlot) => {
        if (savingRef.current.has(slot)) return;
        const raw = drafts[slot];
        if (raw === undefined) return;
        const next = raw.trim();
        if (next === savedKeyFor(slot)) {
            clearDraft(slot);
            return;
        }
        savingRef.current.add(slot);
        setSavingSlots(current => ({ ...current, [slot]: true }));
        try {
            if (slot === 'vision') await updateVisionApiKey(next);
            else await updateApiKey(slot, next);
            // 저장하는 동안 더 입력했다면 그 입력은 남겨 둔다.
            setDrafts(current => {
                if (current[slot] !== raw) return current;
                const updated = { ...current };
                delete updated[slot];
                return updated;
            });
            setChecks(current => ({ ...current, [slot]: undefined }));
            setJustSavedSlot(slot);
            window.clearTimeout(savedTimerRef.current);
            savedTimerRef.current = window.setTimeout(() => setJustSavedSlot(null), 2500);
            onSaved();
        } catch (error) {
            showToast(errorText(error, `${SLOT_LABELS[slot]} API 키를 저장하지 못했습니다.`), 'error');
        } finally {
            savingRef.current.delete(slot);
            setSavingSlots(current => ({ ...current, [slot]: false }));
        }
    };

    const runConnectionCheck = async (slot: KeySlot, model?: string) => {
        const key = draftFor(slot).trim();
        if (!key) {
            setChecks(current => ({ ...current, [slot]: { busy: false, message: 'API 키를 먼저 입력해 주세요.', error: true } }));
            return;
        }
        checkControllersRef.current.get(slot)?.abort();
        const controller = new AbortController();
        checkControllersRef.current.set(slot, controller);
        setChecks(current => ({ ...current, [slot]: { busy: true, message: '', error: false } }));
        try {
            const message = await checkProviderConnection(slot as ConnectionCheckProvider, key, { model, signal: controller.signal });
            if (controller.signal.aborted) return;
            setChecks(current => ({ ...current, [slot]: { busy: false, message: `연결 정상 · ${message}`, error: false } }));
        } catch (error) {
            if (controller.signal.aborted) return;
            setChecks(current => ({ ...current, [slot]: { busy: false, message: errorText(error, `${SLOT_LABELS[slot]} 연결을 확인하지 못했습니다.`), error: true } }));
        } finally {
            if (checkControllersRef.current.get(slot) === controller) checkControllersRef.current.delete(slot);
        }
    };

    const handleModelChange = async (provider: LLMProvider, model: string) => {
        if (modelSettingsBusy) return;
        setModelSettingsBusy(true);
        try {
            await updateModel(provider, model);
            onSaved();
        } catch (error) {
            showToast(errorText(error, '모델 설정 저장 중 오류가 발생했습니다.'), 'error');
        } finally {
            setModelSettingsBusy(false);
        }
    };

    const handleReasoningChange = async (provider: LLMProvider, level: AIReasoningLevel) => {
        if (modelSettingsBusy) return;
        setModelSettingsBusy(true);
        try {
            await updateReasoningLevel(provider, level);
            onSaved();
        } catch (error) {
            showToast(errorText(error, '추론 수준 저장 중 오류가 발생했습니다.'), 'error');
        } finally {
            setModelSettingsBusy(false);
        }
    };

    const keyFieldProps = (slot: KeySlot) => ({
        slot,
        value: draftFor(slot),
        savedValue: savedKeyFor(slot),
        saving: Boolean(savingSlots[slot]),
        justSaved: justSavedSlot === slot,
        onChange: (value: string) => setDrafts(current => ({ ...current, [slot]: value })),
        onCommit: () => void commitKey(slot),
    });

    return (
        <>
            <section id="api-keys" tabIndex={-1} aria-label="API 키와 모델" className="space-y-4 scroll-mt-40">
                {settings.llmConfigs.map((config, idx) => {
                    const info = PROVIDER_INFO[config.provider];
                    const reasoningLevels = getAIReasoningLevels(config.provider, config.model);
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

                            <div className="mb-4">
                                <ApiKeyField
                                    {...keyFieldProps(config.provider)}
                                    inputId={`api-key-${config.provider}`}
                                    label="API 키"
                                    placeholder="API 키를 입력하세요"
                                />
                                <ConnectionCheckRow
                                    label={info.label}
                                    state={checks[config.provider]}
                                    disabled={!draftFor(config.provider).trim()}
                                    onCheck={() => void runConnectionCheck(config.provider, config.model)}
                                />
                            </div>

                            <div>
                                <label htmlFor={`model-${config.provider}`} className="block text-sm font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                                    <Server className="w-3.5 h-3.5" /> 모델
                                </label>
                                <div className="relative">
                                    <select
                                        id={`model-${config.provider}`}
                                        value={config.model}
                                        onChange={(e) => void handleModelChange(config.provider, e.target.value)}
                                        disabled={modelSettingsBusy}
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
                                <div className="mt-4">
                                    <label htmlFor={`reasoning-${config.provider}`} className="block text-sm font-medium text-white/70 mb-1.5">
                                        {config.label} 추론 수준
                                    </label>
                                    <select
                                        id={`reasoning-${config.provider}`}
                                        value={config.reasoningLevel || 'auto'}
                                        onChange={event => void handleReasoningChange(config.provider, event.target.value as AIReasoningLevel)}
                                        disabled={modelSettingsBusy || reasoningLevels.length === 1}
                                        className="input-field cursor-pointer text-sm disabled:opacity-60"
                                    >
                                        {reasoningLevels.map(level => (
                                            <option key={level} value={level}>
                                                {level === 'auto' ? '모델 기본값' : level === 'low' ? '낮음 · 빠른 응답' : level === 'medium' ? '보통 · 균형' : '높음 · 심층 분석'}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-2 text-xs text-white/45">
                                        {config.provider === 'anthropic' && config.model === 'claude-haiku-4-5'
                                            ? 'Haiku 4.5는 별도의 사고 토큰 예산 방식이므로 모델 기본값을 사용합니다.'
                                            : '모델을 바꾸면 지원하지 않는 추론 수준은 모델 기본값으로 돌아갑니다. 자동 전환 시에도 해당 제공업체의 수준을 사용합니다.'}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </section>

            {/* Vision API 키 설정 */}
            <motion.section
                aria-labelledby="vision-api-title"
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
                        <h3 id="vision-api-title" className="text-white font-bold">Google Cloud Vision API</h3>
                        <p className="text-white/40 text-xs">OCR(이미지 텍스트 인식)에 사용됩니다</p>
                    </div>
                </div>

                <div className="mb-4">
                    <ApiKeyField
                        {...keyFieldProps('vision')}
                        inputId="vision-api-key"
                        label="Vision API 키"
                        placeholder="Vision API 키를 입력하세요"
                    />
                    <ConnectionCheckRow
                        label="Vision API"
                        state={checks.vision}
                        disabled={!draftFor('vision').trim()}
                        onCheck={() => void runConnectionCheck('vision')}
                    />
                </div>

                <div className="bg-white/5 rounded-lg p-4 text-xs text-white/50 leading-relaxed">
                    <p className="font-medium text-white/70 mb-2">Vision API 키 발급 방법</p>
                    <ol className="space-y-1 list-decimal list-inside">
                        <li>Google Cloud Console (console.cloud.google.com) 접속</li>
                        <li>프로젝트 선택 또는 새 프로젝트 생성</li>
                        <li>"API 및 서비스" → "라이브러리"에서 "Cloud Vision API" 검색 후 사용 설정</li>
                        <li>"사용자 인증 정보" → "사용자 인증 정보 만들기" → "API 키"</li>
                        <li>생성된 API 키를 복사하여 위에 입력</li>
                    </ol>
                </div>
            </motion.section>
        </>
    );
}
