import {
    getAIModelTier,
    normalizeAIModel,
    PROVIDER_MODEL_TIERS,
    type AIModelTier,
    type AIProvider,
} from './aiModels';

export type AIUsagePolicy = 'economy' | 'balanced' | 'premium';
export type AIFailoverReason =
    | 'serviceUnavailable'
    | 'quotaExceeded'
    | 'rateLimit'
    | 'creditUnavailable'
    | 'modelUnavailable'
    | 'networkError'
    | 'authError'
    | 'permissionError';

export interface AIFailoverSettings {
    enabled: boolean;
    providerOrder: AIProvider[];
    allowCrossProvider: boolean;
    usagePolicy: AIUsagePolicy;
    allowPremiumAutoUpgrade: boolean;
    confirmBeforePremium: boolean;
    premiumConsentConfirmed: boolean;
    crossProviderConsentConfirmed: boolean;
    switchOn: Record<AIFailoverReason, boolean>;
}

export const DEFAULT_AI_FAILOVER: AIFailoverSettings = {
    enabled: false,
    providerOrder: ['gemini', 'openai', 'anthropic'],
    allowCrossProvider: false,
    usagePolicy: 'economy',
    allowPremiumAutoUpgrade: false,
    confirmBeforePremium: true,
    premiumConsentConfirmed: false,
    crossProviderConsentConfirmed: false,
    switchOn: {
        serviceUnavailable: true,
        quotaExceeded: true,
        rateLimit: false,
        creditUnavailable: true,
        modelUnavailable: true,
        networkError: false,
        authError: false,
        permissionError: false,
    },
};

const AI_PROVIDERS: AIProvider[] = ['gemini', 'openai', 'anthropic'];
const USAGE_POLICIES: AIUsagePolicy[] = ['economy', 'balanced', 'premium'];

export function normalizeAIFailover(value?: Partial<AIFailoverSettings>): AIFailoverSettings {
    const savedOrder = Array.isArray(value?.providerOrder)
        ? value.providerOrder.filter((provider): provider is AIProvider => AI_PROVIDERS.includes(provider as AIProvider))
        : [];
    const providerOrder = [...new Set([...savedOrder, ...AI_PROVIDERS])];
    const requestedUsagePolicy = USAGE_POLICIES.includes(value?.usagePolicy as AIUsagePolicy)
        ? value?.usagePolicy as AIUsagePolicy
        : DEFAULT_AI_FAILOVER.usagePolicy;
    const premiumConsentConfirmed = value?.premiumConsentConfirmed === true;
    const crossProviderConsentConfirmed = value?.crossProviderConsentConfirmed === true;
    const usagePolicy = requestedUsagePolicy === 'premium' && !premiumConsentConfirmed
        ? DEFAULT_AI_FAILOVER.usagePolicy
        : requestedUsagePolicy;

    return {
        ...DEFAULT_AI_FAILOVER,
        ...value,
        enabled: value?.enabled === true,
        providerOrder,
        allowCrossProvider: value?.allowCrossProvider === true && crossProviderConsentConfirmed,
        usagePolicy,
        allowPremiumAutoUpgrade: value?.allowPremiumAutoUpgrade === true,
        confirmBeforePremium: value?.confirmBeforePremium !== false,
        premiumConsentConfirmed,
        crossProviderConsentConfirmed,
        switchOn: {
            ...DEFAULT_AI_FAILOVER.switchOn,
            ...(value?.switchOn || {}),
        },
    };
}

export interface AIRequestCandidate {
    provider: AIProvider;
    model: string;
    tier: AIModelTier;
    automatic: boolean;
}

interface BuildAIRequestPlanInput {
    selectedProvider: AIProvider;
    selectedModels: Partial<Record<AIProvider, string>>;
    providersWithKeys: AIProvider[];
    failover?: Partial<AIFailoverSettings>;
}

export const MAX_AI_REQUEST_ATTEMPTS = 3;

export function buildAIRequestPlan(input: BuildAIRequestPlanInput): AIRequestCandidate[] {
    const policy = normalizeAIFailover(input.failover);
    const selectedModel = normalizeAIModel(input.selectedProvider, input.selectedModels[input.selectedProvider]);
    const hasKey = (provider: AIProvider) => input.providersWithKeys.includes(provider);
    const candidates: AIRequestCandidate[] = [];

    const addCandidate = (provider: AIProvider, model: string | undefined, automatic: boolean) => {
        if (!model || !hasKey(provider) || candidates.length >= MAX_AI_REQUEST_ATTEMPTS) return;
        const normalizedModel = normalizeAIModel(provider, model);
        const tier = getAIModelTier(provider, normalizedModel);
        if (!tier || candidates.some(candidate => candidate.provider === provider)) return;
        candidates.push({ provider, model: normalizedModel, tier, automatic });
    };

    if (!policy.enabled) {
        addCandidate(input.selectedProvider, selectedModel, false);
        return candidates;
    }

    const providerOrder = [
        input.selectedProvider,
        ...policy.providerOrder.filter(provider => provider !== input.selectedProvider),
    ];
    const allowedProviders = policy.allowCrossProvider ? providerOrder : [input.selectedProvider];

    if (policy.usagePolicy === 'economy') {
        for (const provider of allowedProviders) addCandidate(provider, PROVIDER_MODEL_TIERS[provider].economy, true);
        return candidates;
    }

    if (policy.usagePolicy === 'balanced') {
        for (const provider of allowedProviders) addCandidate(provider, PROVIDER_MODEL_TIERS[provider].balanced, true);
        return candidates;
    }

    for (const provider of allowedProviders) {
        const configuredModel = provider === input.selectedProvider
            ? selectedModel
            : normalizeAIModel(provider, input.selectedModels[provider]);
        const premiumModel = PROVIDER_MODEL_TIERS[provider].premium;
        const model = policy.allowPremiumAutoUpgrade && premiumModel && getAIModelTier(provider, configuredModel) !== 'premium'
            ? premiumModel
            : configuredModel;
        addCandidate(provider, model || PROVIDER_MODEL_TIERS[provider].balanced, model !== configuredModel);
    }
    return candidates;
}

export function isPremiumAutomaticCandidateAllowed(
    candidate: AIRequestCandidate,
    failover?: Partial<AIFailoverSettings>,
): boolean {
    if (candidate.tier !== 'premium' || !candidate.automatic) return true;
    const policy = normalizeAIFailover(failover);
    return policy.usagePolicy === 'premium'
        && policy.premiumConsentConfirmed
        && policy.allowPremiumAutoUpgrade;
}
