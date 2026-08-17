import { create } from 'zustand';
import * as localDB from '../config/localDB';
import { encrypt, decryptWithStatus, isEncrypted } from '../config/crypto';
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

/**
 * 멀티 LLM 설정 스토어
 * 사용자가 여러 LLM 제공사의 API 키를 입력하고,
 * 기본으로 사용할 모델을 선택할 수 있습니다.
 * 
 * ✅ 모든 API 키는 AES-GCM 256비트 암호화 후 IndexedDB에 저장됩니다.
 */

export type LLMProvider = AIProvider;

export interface LLMConfig {
    provider: LLMProvider;
    label: string;
    apiKey: string;         // 메모리(런타임)에서는 평문, 저장 시 암호화
    apiKeyEncrypted: string; // 저장용 암호화된 키
    model: string;
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
        availableModels: AI_MODEL_OPTIONS.gemini.map(option => option.id),
    },
    {
        provider: 'openai',
        label: 'OpenAI',
        apiKey: '',
        apiKeyEncrypted: '',
        model: DEFAULT_AI_MODELS.openai,
        availableModels: AI_MODEL_OPTIONS.openai.map(option => option.id),
    },
    {
        provider: 'anthropic',
        label: 'Anthropic Claude',
        apiKey: '',
        apiKeyEncrypted: '',
        model: DEFAULT_AI_MODELS.anthropic,
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
    setSelectedProvider: (provider: LLMProvider) => Promise<void>;
    updateVisionApiKey: (apiKey: string) => Promise<void>;
    updateAIFailover: (updates: Partial<AIFailoverSettings>) => Promise<void>;
    getActiveConfig: () => LLMConfig;
}

/** 설정 저장 전 API 키들을 암호화 */
async function encryptSettings(settings: AppSettings, preserveExistingEncrypted = false): Promise<AppSettings> {
    const encryptedConfigs = await Promise.all(
        settings.llmConfigs.map(async (c) => ({
            ...c,
            apiKeyEncrypted: c.apiKey
                ? await encrypt(c.apiKey)
                : preserveExistingEncrypted ? c.apiKeyEncrypted || '' : '',
            apiKey: '', // 저장 시 평문은 제거
        }))
    );
    return {
        ...settings,
        llmConfigs: encryptedConfigs,
        visionApiKeyEncrypted: settings.visionApiKey
            ? await encrypt(settings.visionApiKey)
            : preserveExistingEncrypted ? settings.visionApiKeyEncrypted || '' : '',
        visionApiKey: '', // 저장 시 평문은 제거
    };
}

/** 설정 로드 후 API 키들을 복호화 */
async function decryptSettings(settings: AppSettings): Promise<{ decrypted: AppSettings; needsReEncrypt: boolean; keyRecoveryRequired: boolean }> {
    let needsReEncrypt = false;
    let failedKeyCount = 0;
    
    const decryptedConfigs = await Promise.all(
        settings.llmConfigs.map(async (c) => {
            let plainKey = c.apiKey || '';
            const hadEncryptedKey = !!(c.apiKeyEncrypted || (c.apiKey && isEncrypted(c.apiKey)));
            const hadPlaintextKey = !!(c.apiKey && !isEncrypted(c.apiKey));
            
            // 암호화된 키가 있으면 복호화
            if (c.apiKeyEncrypted) {
                const result = await decryptWithStatus(c.apiKeyEncrypted);
                plainKey = result.value;
                if (!result.ok) failedKeyCount += 1;
            } else if (c.apiKey && isEncrypted(c.apiKey)) {
                // 호환: 이전 형식에서 apiKey에 암호화된 값이 있을 수 있음
                const result = await decryptWithStatus(c.apiKey);
                plainKey = result.value;
                if (!result.ok) failedKeyCount += 1;
            }
            
            // 복호화 성공했으면 마이그레이션 플래그 설정 (새 키로 재암호화 필요)
            if (plainKey && hadEncryptedKey) {
                needsReEncrypt = true;
            }
            if (plainKey && hadPlaintextKey) {
                needsReEncrypt = true;
            }
            
            return { ...c, apiKey: plainKey };
        })
    );

    let visionKey = settings.visionApiKey || '';
    const hadEncryptedVisionKey = !!settings.visionApiKeyEncrypted;
    const hadPlaintextVisionKey = !!settings.visionApiKey;
    if (settings.visionApiKeyEncrypted) {
        const result = await decryptWithStatus(settings.visionApiKeyEncrypted);
        visionKey = result.value;
        if (!result.ok) failedKeyCount += 1;
        if (visionKey && hadEncryptedVisionKey) {
            needsReEncrypt = true;
        }
    }
    if (visionKey && hadPlaintextVisionKey) {
        needsReEncrypt = true;
    }

    return {
        decrypted: {
            ...settings,
            llmConfigs: decryptedConfigs,
            visionApiKey: visionKey,
        },
        needsReEncrypt,
        keyRecoveryRequired: failedKeyCount > 0,
    };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    loaded: false,
    error: null,
    recoveryNotice: null,

    loadSettings: async () => {
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
                const failoverMigrated = JSON.stringify(saved.aiFailover || {}) !== JSON.stringify(merged.aiFailover);
                const existingProviders = new Set(merged.llmConfigs.map(c => c.provider));
                for (const dc of DEFAULT_CONFIGS) {
                    if (!existingProviders.has(dc.provider)) {
                        merged.llmConfigs.push(dc);
                    }
                }

                let modelMigrated = false;

                // availableModels를 항상 최신 기본값으로 갱신
                merged.llmConfigs = merged.llmConfigs.map(c => {
                    const defaultConfig = DEFAULT_CONFIGS.find(dc => dc.provider === c.provider);
                    if (defaultConfig) {
                        const migratedModel = normalizeAIModel(c.provider, c.model);
                        modelMigrated = modelMigrated || migratedModel !== c.model;
                        return { ...c, model: migratedModel, availableModels: defaultConfig.availableModels };
                    }
                    return c;
                });

                // 복호화
                const { decrypted, needsReEncrypt, keyRecoveryRequired } = await decryptSettings(merged);
                const recoveryMessages = [
                    keyRecoveryRequired ? '저장된 API 키 일부를 복호화하지 못했습니다. 앱은 계속 사용할 수 있지만, 설정 화면에서 해당 API 키를 다시 입력해 주세요.' : '',
                    modelMigrated ? '이전에 저장한 AI 모델이 현재 지원하는 최신 모델로 안전하게 변경되었습니다. 저장된 API 키와 다른 설정은 유지됩니다.' : '',
                ].filter(Boolean);
                set({
                    settings: decrypted,
                    loaded: true,
                    error: null,
                    recoveryNotice: recoveryMessages.length ? recoveryMessages.join(' ') : null,
                });
                
                // 레거시 키 복호화 또는 모델명 보정이 있으면 암호화 상태로 다시 저장
                if (needsReEncrypt || modelMigrated || failoverMigrated) {
                    // 모델 보정만 필요한 경우 복호화하지 못한 기존 암호문을 지우지 않는다.
                    const encrypted = await encryptSettings(decrypted, true);
                    await localDB.addDoc<AppSettings>('settings', { ...encrypted, id: 'app-settings' });
                }
            } else {
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
            // 메모리에는 평문 유지
            set({ settings: normalizedSettings, error: null, recoveryNotice: null });
        } catch (err: any) {
            console.error('Settings save error:', safeErrorMetadata(err, 'settings-save'));
            set({ error: '설정 저장에 실패했습니다. API 키가 저장되지 않았을 수 있습니다.' });
            throw err;
        }
    },

    updateApiKey: async (provider, apiKey) => {
        const { settings, saveSettings } = get();
        const updated = {
            ...settings,
            llmConfigs: settings.llmConfigs.map(c =>
                c.provider === provider ? { ...c, apiKey } : c
            ),
        };
        await saveSettings(updated);
    },

    updateModel: async (provider, model) => {
        const { settings, saveSettings } = get();
        const updated = {
            ...settings,
            llmConfigs: settings.llmConfigs.map(c =>
                c.provider === provider ? { ...c, model } : c
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
        await saveSettings({ ...settings, visionApiKey: apiKey });
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
