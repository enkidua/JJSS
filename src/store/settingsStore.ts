import { create } from 'zustand';
import * as localDB from '../config/localDB';
import { encrypt, decryptWithStatus } from '../config/crypto';
import { safeErrorMetadata } from '../utils/safeError';
import {
    AI_MODEL_OPTIONS,
    DEFAULT_AI_MODELS,
    normalizeAIModel,
    type AIProvider,
} from '../config/aiModels';
import {
    DEFAULT_AI_FAILOVER,
    normalizeAIFailover,
    type AIFailoverSettings,
} from '../config/aiFailover';
import { DEFAULT_AI_REASONING_LEVELS, normalizeAIReasoningLevel, type AIReasoningLevel } from '../config/aiReasoning';

/**
 * 멀티 LLM 설정 스토어
 * 사용자가 여러 LLM 제공사의 API 키를 입력하고,
 * 기본으로 사용할 모델을 선택할 수 있습니다.
 * 
 * 모든 API 키는 AES-GCM 256비트 암호화 후 IndexedDB에 저장됩니다.
 * 평소 실행 때는 읽기만 하며, 이전 형식 키 재암호화·모델명 보정이 필요할 때만 다시 저장합니다.
 */

export type LLMProvider = AIProvider;

export interface LLMConfig {
    provider: LLMProvider;
    label: string;
    apiKey: string;         // 메모리(런타임)에서는 평문, 저장 시 암호화
    apiKeyEncrypted: string; // 저장용 암호화된 키
    model: string;
    reasoningLevel?: AIReasoningLevel;
    availableModels: string[];
}

export interface AppSettings {
    id: string;
    selectedProvider: LLMProvider;
    llmConfigs: LLMConfig[];
    visionApiKey: string;           // Cloud Vision API 키 (런타임 평문)
    visionApiKeyEncrypted: string;  // Cloud Vision API 키 (저장용 암호화)
    aiFailover?: AIFailoverSettings;
}

const DEFAULT_CONFIGS: LLMConfig[] = [
    {
        provider: 'gemini',
        label: 'Google Gemini',
        apiKey: '',
        apiKeyEncrypted: '',
        model: DEFAULT_AI_MODELS.gemini,
        reasoningLevel: DEFAULT_AI_REASONING_LEVELS.gemini,
        availableModels: AI_MODEL_OPTIONS.gemini.map(option => option.id),
    },
    {
        provider: 'openai',
        label: 'OpenAI',
        apiKey: '',
        apiKeyEncrypted: '',
        model: DEFAULT_AI_MODELS.openai,
        reasoningLevel: DEFAULT_AI_REASONING_LEVELS.openai,
        availableModels: AI_MODEL_OPTIONS.openai.map(option => option.id),
    },
    {
        provider: 'anthropic',
        label: 'Anthropic Claude',
        apiKey: '',
        apiKeyEncrypted: '',
        model: DEFAULT_AI_MODELS.anthropic,
        reasoningLevel: DEFAULT_AI_REASONING_LEVELS.anthropic,
        availableModels: AI_MODEL_OPTIONS.anthropic.map(option => option.id),
    },
];

const DEFAULT_SETTINGS: AppSettings = {
    id: 'app-settings',
    selectedProvider: 'gemini',
    llmConfigs: DEFAULT_CONFIGS,
    visionApiKey: '',
    visionApiKeyEncrypted: '',
    aiFailover: DEFAULT_AI_FAILOVER,
};

interface SettingsState {
    settings: AppSettings;
    loaded: boolean;
    error: string | null;
    recoveryNotice: string | null;
    loadSettings: () => Promise<void>;
    saveSettings: (settings: AppSettings) => Promise<void>;
    updateApiKey: (provider: LLMProvider, apiKey: string) => Promise<void>;
    updateModel: (provider: LLMProvider, model: string) => Promise<void>;
    updateReasoningLevel: (provider: LLMProvider, level: AIReasoningLevel) => Promise<void>;
    setSelectedProvider: (provider: LLMProvider) => Promise<void>;
    updateVisionApiKey: (apiKey: string) => Promise<void>;
    updateAIFailover: (updates: Partial<AIFailoverSettings>) => Promise<void>;
    getActiveConfig: () => LLMConfig;
}

type KeySlot = LLMProvider | 'vision';

/**
 * 복호화하지 못한 API 키 암호문이 있는 제공업체.
 * 사용자가 새 키를 입력하거나 직접 지우기 전까지는 저장할 때 원래 암호문을 지우지 않는다
 * (보안 키가 나중에 돌아오면 다시 읽을 수 있도록).
 */
const unreadableKeySlots = new Set<KeySlot>();

/** 설정 저장 전 API 키들을 암호화 */
async function encryptSettings(settings: AppSettings): Promise<AppSettings> {
    const encryptedConfigs = await Promise.all(
        settings.llmConfigs.map(async (c) => ({
            ...c,
            apiKeyEncrypted: c.apiKey
                ? await encrypt(c.apiKey)
                : unreadableKeySlots.has(c.provider) ? c.apiKeyEncrypted || '' : '',
            apiKey: '', // 저장 시 평문은 제거
        }))
    );
    return {
        ...settings,
        llmConfigs: encryptedConfigs,
        visionApiKeyEncrypted: settings.visionApiKey
            ? await encrypt(settings.visionApiKey)
            : unreadableKeySlots.has('vision') ? settings.visionApiKeyEncrypted || '' : '',
        visionApiKey: '', // 저장 시 평문은 제거
    };
}

interface KeyDecryptOutcome {
    plain: string;
    /** 저장 위치의 원래 암호문 (복호화 실패 시 보존용) */
    storedCipher: string;
    failed: boolean;
    dataKeyUnavailable: boolean;
    needsReEncrypt: boolean;
}

/**
 * 저장된 키 하나를 복호화한다.
 * - encryptedValue: 정식 저장 위치(apiKeyEncrypted)
 * - legacyValue: 아주 오래된 형식에서 평문 또는 암호문이 들어 있던 apiKey 필드
 */
async function decryptStoredKey(encryptedValue: string | undefined, legacyValue: string | undefined): Promise<KeyDecryptOutcome> {
    const source = encryptedValue || legacyValue || '';
    if (!source) return { plain: '', storedCipher: '', failed: false, dataKeyUnavailable: false, needsReEncrypt: false };
    const result = await decryptWithStatus(source);
    const fromLegacyField = !encryptedValue;
    return {
        plain: result.value,
        storedCipher: result.encrypted ? source : '',
        failed: !result.ok,
        dataKeyUnavailable: result.dataKeyUnavailable,
        // 이전 키로 복호화했거나, 평문·옛 필드에 있던 키는 현재 형식으로 한 번 다시 저장한다.
        needsReEncrypt: result.ok && Boolean(result.value) && (result.needsReEncrypt || !result.encrypted || fromLegacyField),
    };
}

/** 설정 로드 후 API 키들을 복호화 */
async function decryptSettings(settings: AppSettings): Promise<{ decrypted: AppSettings; needsReEncrypt: boolean; keyRecoveryRequired: boolean; dataKeyUnavailable: boolean }> {
    let needsReEncrypt = false;
    let keyRecoveryRequired = false;
    let dataKeyUnavailable = false;
    unreadableKeySlots.clear();

    const noteOutcome = (slot: KeySlot, outcome: KeyDecryptOutcome) => {
        if (outcome.needsReEncrypt) needsReEncrypt = true;
        if (outcome.failed) {
            keyRecoveryRequired = true;
            unreadableKeySlots.add(slot);
            if (outcome.dataKeyUnavailable) dataKeyUnavailable = true;
        }
    };

    const decryptedConfigs = await Promise.all(
        settings.llmConfigs.map(async (c) => {
            const outcome = await decryptStoredKey(c.apiKeyEncrypted, c.apiKey);
            noteOutcome(c.provider, outcome);
            return {
                ...c,
                apiKey: outcome.plain,
                // 옛 형식(apiKey 필드)의 암호문을 읽지 못했으면 정식 위치로 옮겨 보존한다.
                apiKeyEncrypted: outcome.failed ? outcome.storedCipher : c.apiKeyEncrypted || '',
            };
        })
    );

    const visionOutcome = await decryptStoredKey(settings.visionApiKeyEncrypted, settings.visionApiKey);
    noteOutcome('vision', visionOutcome);

    return {
        decrypted: {
            ...settings,
            llmConfigs: decryptedConfigs,
            visionApiKey: visionOutcome.plain,
            visionApiKeyEncrypted: visionOutcome.failed ? visionOutcome.storedCipher : settings.visionApiKeyEncrypted || '',
        },
        needsReEncrypt,
        keyRecoveryRequired,
        dataKeyUnavailable,
    };
}

/** 키 순서와 무관하게 값이 같은지 비교 (저장 형식이 같으면 다시 저장하지 않기 위함) */
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value as Record<string, unknown>).sort()
            .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

function keyRecoveryMessage(dataKeyUnavailable: boolean): string {
    return dataKeyUnavailable
        ? '이 PC의 보안 키를 불러오지 못해 저장된 API 키를 읽을 수 없습니다. 다른 PC나 다른 Windows 사용자 계정으로 데이터를 옮긴 경우 생길 수 있습니다. 설정 화면에서 해당 API 키를 다시 입력해 주세요.'
        : '저장된 API 키 일부를 복호화하지 못했습니다. 앱은 계속 사용할 수 있지만, 설정 화면에서 해당 API 키를 다시 입력해 주세요.';
}

let loadInFlight: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    loaded: false,
    error: null,
    recoveryNotice: null,

    loadSettings: () => {
        // 여러 화면이 동시에 불러도 한 번만 읽는다.
        if (loadInFlight) return loadInFlight;
        const run = async () => {
            try {
                const saved = await localDB.getById<AppSettings>('settings', 'app-settings');
                if (saved) {
                    // 새로 추가된 provider가 있으면 병합
                    const merged: AppSettings = {
                        ...DEFAULT_SETTINGS,
                        ...saved,
                        aiFailover: normalizeAIFailover(saved.aiFailover),
                        llmConfigs: Array.isArray(saved.llmConfigs) ? [...saved.llmConfigs] : DEFAULT_CONFIGS.map(config => ({ ...config })),
                    };
                    const failoverMigrated = stableStringify(saved.aiFailover || {}) !== stableStringify(merged.aiFailover);
                    const existingProviders = new Set(merged.llmConfigs.map(c => c.provider));
                    for (const dc of DEFAULT_CONFIGS) {
                        if (!existingProviders.has(dc.provider)) {
                            merged.llmConfigs.push(dc);
                        }
                    }

                    let modelMigrated = false;

                    // availableModels를 항상 최신 기본값으로 갱신 (화면 표시용이며 다시 저장할 사유는 아님)
                    merged.llmConfigs = merged.llmConfigs.map(c => {
                        const defaultConfig = DEFAULT_CONFIGS.find(dc => dc.provider === c.provider);
                        if (defaultConfig) {
                            const migratedModel = normalizeAIModel(c.provider, c.model);
                            modelMigrated = modelMigrated || migratedModel !== c.model;
                            return {
                                ...c,
                                model: migratedModel,
                                // Missing in an older saved configuration means the
                                // provider's previous default behavior, not a new opt-in.
                                reasoningLevel: normalizeAIReasoningLevel(c.provider, migratedModel, c.reasoningLevel),
                                availableModels: defaultConfig.availableModels,
                            };
                        }
                        return c;
                    });

                    // 복호화
                    const { decrypted, needsReEncrypt, keyRecoveryRequired, dataKeyUnavailable } = await decryptSettings(merged);
                    const recoveryMessages = [
                        keyRecoveryRequired ? keyRecoveryMessage(dataKeyUnavailable) : '',
                        modelMigrated ? '이전에 저장한 AI 모델이 현재 지원하는 최신 모델로 안전하게 변경되었습니다. 저장된 API 키와 다른 설정은 유지됩니다.' : '',
                    ].filter(Boolean);
                    set({
                        settings: decrypted,
                        loaded: true,
                        error: null,
                        recoveryNotice: recoveryMessages.length ? recoveryMessages.join(' ') : null,
                    });

                    // 이전 키·형식으로 저장된 키가 있거나 모델명·자동 전환 설정 보정이 있을 때만 다시 저장한다.
                    // 평소 실행 때는 읽기만 한다. 복호화하지 못한 암호문은 지우지 않고 보존한다.
                    if (needsReEncrypt || modelMigrated || failoverMigrated) {
                        const encrypted = await encryptSettings(decrypted);
                        await localDB.addDoc<AppSettings>('settings', { ...encrypted, id: 'app-settings' });
                    }
                } else {
                    unreadableKeySlots.clear();
                    await localDB.addDoc<AppSettings>('settings', DEFAULT_SETTINGS);
                    set({ settings: DEFAULT_SETTINGS, loaded: true, error: null, recoveryNotice: null });
                }
            } catch (err: any) {
                console.error('Settings load error:', safeErrorMetadata(err, 'settings-load'));
                set({
                    settings: DEFAULT_SETTINGS,
                    loaded: true,
                    error: '설정을 불러오지 못했습니다. 기존 데이터는 삭제하지 않았습니다. 앱을 재실행하거나 설정 화면에서 API 키를 다시 확인해 주세요.',
                    recoveryNotice: null,
                });
            }
        };
        const pending = run().finally(() => {
            if (loadInFlight === pending) loadInFlight = null;
        });
        loadInFlight = pending;
        return pending;
    },

    saveSettings: async (settings) => {
        try {
            const normalizedSettings = {
                ...settings,
                aiFailover: normalizeAIFailover(settings.aiFailover),
            };
            // 암호화 후 저장
            const encrypted = await encryptSettings(normalizedSettings);
            await localDB.addDoc<AppSettings>('settings', { ...encrypted, id: 'app-settings' });
            // 메모리에는 평문 유지. 아직 읽지 못한 키가 남아 있으면 복구 안내를 유지한다.
            set(state => ({
                settings: normalizedSettings,
                error: null,
                recoveryNotice: unreadableKeySlots.size ? state.recoveryNotice : null,
            }));
        } catch (err: any) {
            console.error('Settings save error:', safeErrorMetadata(err, 'settings-save'));
            set({ error: '설정 저장에 실패했습니다. API 키가 저장되지 않았을 수 있습니다.' });
            throw err;
        }
    },

    updateApiKey: async (provider, apiKey) => {
        const { settings, saveSettings } = get();
        const normalizedKey = apiKey.trim();
        const updated = {
            ...settings,
            llmConfigs: settings.llmConfigs.map(c =>
                c.provider === provider ? { ...c, apiKey: normalizedKey } : c
            ),
        };
        // 사용자가 직접 새 키를 입력하거나 지웠으므로 읽지 못한 이전 암호문은 더 이상 보존하지 않는다.
        const hadUnreadable = unreadableKeySlots.delete(provider);
        try {
            await saveSettings(updated);
        } catch (error) {
            if (hadUnreadable) unreadableKeySlots.add(provider);
            throw error;
        }
    },

    updateModel: async (provider, model) => {
        const { settings, saveSettings } = get();
        const updated = {
            ...settings,
            llmConfigs: settings.llmConfigs.map(c =>
                c.provider === provider ? {
                    ...c,
                    model,
                    reasoningLevel: normalizeAIReasoningLevel(provider, model, c.reasoningLevel),
                } : c
            ),
        };
        await saveSettings(updated);
    },

    updateReasoningLevel: async (provider, level) => {
        const { settings, saveSettings } = get();
        const updated = {
            ...settings,
            llmConfigs: settings.llmConfigs.map(c =>
                c.provider === provider ? {
                    ...c,
                    reasoningLevel: normalizeAIReasoningLevel(provider, c.model, level),
                } : c
            ),
        };
        await saveSettings(updated);
    },

    setSelectedProvider: async (provider) => {
        const { settings, saveSettings } = get();
        await saveSettings({ ...settings, selectedProvider: provider });
    },

    updateVisionApiKey: async (apiKey: string) => {
        const { settings, saveSettings } = get();
        const hadUnreadable = unreadableKeySlots.delete('vision');
        try {
            await saveSettings({ ...settings, visionApiKey: apiKey.trim() });
        } catch (error) {
            if (hadUnreadable) unreadableKeySlots.add('vision');
            throw error;
        }
    },

    updateAIFailover: async (updates) => {
        const { settings, saveSettings } = get();
        await saveSettings({
            ...settings,
            aiFailover: normalizeAIFailover({
                ...settings.aiFailover,
                ...updates,
            }),
        });
    },

    getActiveConfig: () => {
        const { settings } = get();
        return settings.llmConfigs.find(c => c.provider === settings.selectedProvider) || settings.llmConfigs[0];
    },
}));

// (자동 로드 코드 제거됨 - Layout 컴포넌트에서 초기화 제어)
