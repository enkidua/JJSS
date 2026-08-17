import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function compileTsModule(relativePath, replacements = []) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    let compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [pattern, replacement] of replacements) compiled = compiled.replace(pattern, replacement);
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const modelModuleUrl = await compileTsModule('../src/config/aiModels.ts');
const {
    AI_MODEL_OPTIONS,
    DEFAULT_AI_MODELS,
    getAIModelTier,
    normalizeAIModel,
    shouldShowApiKeyOnboarding,
} = await import(modelModuleUrl);

const failoverModuleUrl = await compileTsModule('../src/config/aiFailover.ts', [
    [/from ['"]\.\/aiModels['"]/g, `from ${JSON.stringify(modelModuleUrl)}`],
]);
const {
    buildAIRequestPlan,
    DEFAULT_AI_FAILOVER,
    normalizeAIFailover,
} = await import(failoverModuleUrl);

const safetyModuleUrl = await compileTsModule('../src/services/aiRequestSafety.ts');
const { beginAIRequestJob, createAIRequestFingerprint, __resetAIRequestSafetyForTests } = await import(safetyModuleUrl);

const executorModuleUrl = await compileTsModule('../src/services/aiFailoverExecutor.ts', [
    [/from ['"]\.\.\/config\/aiFailover['"]/g, `from ${JSON.stringify(failoverModuleUrl)}`],
    [/from ['"]\.\/aiRequestSafety['"]/g, `from ${JSON.stringify(safetyModuleUrl)}`],
]);
const { executeAIRequestPlan } = await import(executorModuleUrl);

let testJobSequence = 0;
function createTestJob(feature = 'settings') {
    testJobSequence += 1;
    return beginAIRequestJob({
        featureKey: `${feature}:${testJobSequence}`,
        requestFingerprint: createAIRequestFingerprint(testJobSequence),
    });
}

assert.deepEqual(AI_MODEL_OPTIONS.gemini.map(model => model.id), [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
]);
assert.deepEqual(AI_MODEL_OPTIONS.openai.map(model => model.id), [
    'gpt-5.6',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
]);
assert.deepEqual(AI_MODEL_OPTIONS.anthropic.map(model => model.id), [
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-haiku-4-5',
]);

assert.equal(DEFAULT_AI_MODELS.gemini, 'gemini-3.6-flash');
assert.equal(DEFAULT_AI_MODELS.openai, 'gpt-5.6-terra');
assert.equal(DEFAULT_AI_MODELS.anthropic, 'claude-sonnet-5');
assert.equal(getAIModelTier('gemini', 'gemini-3.5-flash-lite'), 'economy');
assert.equal(getAIModelTier('gemini', 'gemini-3.6-flash'), 'balanced');
assert.equal(getAIModelTier('gemini', 'gpt-5.6'), undefined);
assert.equal(getAIModelTier('openai', 'gpt-5.6'), 'premium');
assert.equal(getAIModelTier('anthropic', 'claude-opus-4-8'), 'premium');

const migrations = [
    ['gemini', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'],
    ['gemini', 'gemini-3.1-flash-lite-preview', 'gemini-3.5-flash-lite'],
    ['gemini', 'gemini-3-flash-preview', 'gemini-3.6-flash'],
    ['gemini', 'gemini-3.5-flash', 'gemini-3.6-flash'],
    ['gemini', 'gemini-3.1-pro-preview', 'gemini-3.6-flash'],
    ['gemini', 'gemini-2.5-pro', 'gemini-3.6-flash'],
    ['openai', 'gpt-4.1', 'gpt-5.6-terra'],
    ['openai', 'gpt-4o', 'gpt-5.6-terra'],
    ['openai', 'o3', 'gpt-5.6-terra'],
    ['openai', 'o4-mini', 'gpt-5.6-terra'],
    ['openai', 'gpt-4.1-mini', 'gpt-5.6-luna'],
    ['openai', 'gpt-4.1-nano', 'gpt-5.6-luna'],
    ['openai', 'gpt-4o-mini', 'gpt-5.6-luna'],
    ['openai', 'gpt-5.6-sol', 'gpt-5.6'],
    ['anthropic', 'claude-opus-4-20250514', 'claude-opus-4-8'],
    ['anthropic', 'claude-sonnet-4-20250514', 'claude-sonnet-5'],
    ['anthropic', 'claude-3-7-sonnet-20250219', 'claude-sonnet-5'],
    ['anthropic', 'claude-3-5-sonnet-20241022', 'claude-sonnet-5'],
    ['anthropic', 'claude-3-5-haiku-20241022', 'claude-haiku-4-5'],
    ['anthropic', 'claude-3-haiku-20240307', 'claude-haiku-4-5'],
];

for (const [provider, oldModel, expected] of migrations) {
    assert.equal(normalizeAIModel(provider, oldModel), expected, `${provider}: ${oldModel}`);
}

assert.equal(normalizeAIModel('gemini', 'unknown-model'), 'gemini-3.6-flash');
assert.equal(normalizeAIModel('openai', 'unknown-model'), 'gpt-5.6-terra');
assert.equal(normalizeAIModel('anthropic', 'unknown-model'), 'claude-sonnet-5');

assert.equal(shouldShowApiKeyOnboarding(['', '', ''], null), true);
assert.equal(shouldShowApiKeyOnboarding(['saved-key', '', ''], null), false);
assert.equal(shouldShowApiKeyOnboarding(['', '', ''], 'later'), false);
assert.equal(shouldShowApiKeyOnboarding(['', '', ''], null, true), false);

assert.equal(DEFAULT_AI_FAILOVER.enabled, false);
assert.equal(DEFAULT_AI_FAILOVER.usagePolicy, 'economy');
assert.equal(DEFAULT_AI_FAILOVER.allowPremiumAutoUpgrade, false);
assert.equal(DEFAULT_AI_FAILOVER.confirmBeforePremium, true);
assert.equal(DEFAULT_AI_FAILOVER.switchOn.rateLimit, false);
assert.equal(DEFAULT_AI_FAILOVER.switchOn.permissionError, false);
assert.equal(normalizeAIFailover({ usagePolicy: 'premium' }).usagePolicy, 'economy');
assert.equal(normalizeAIFailover({ allowCrossProvider: true }).allowCrossProvider, false);

const selectedModels = {
    gemini: 'gemini-3.6-flash',
    openai: 'gpt-5.6-terra',
    anthropic: 'claude-sonnet-5',
};
const allProviders = ['gemini', 'openai', 'anthropic'];
const consentedCrossProvider = {
    enabled: true,
    allowCrossProvider: true,
    crossProviderConsentConfirmed: true,
};

const economyPlan = buildAIRequestPlan({
    selectedProvider: 'gemini',
    selectedModels,
    providersWithKeys: allProviders,
    failover: { ...consentedCrossProvider, usagePolicy: 'economy' },
});
assert.equal(economyPlan.length, 3);
assert.equal(economyPlan.every(candidate => candidate.tier !== 'premium'), true);
assert.deepEqual(economyPlan.map(candidate => candidate.model), [
    'gemini-3.5-flash-lite',
    'gpt-5.6-luna',
    'claude-haiku-4-5',
]);

const balancedPlan = buildAIRequestPlan({
    selectedProvider: 'gemini',
    selectedModels,
    providersWithKeys: allProviders,
    failover: { ...consentedCrossProvider, usagePolicy: 'balanced' },
});
assert.equal(balancedPlan.every(candidate => candidate.tier !== 'premium'), true);
assert.deepEqual(balancedPlan.map(candidate => candidate.model), [
    'gemini-3.6-flash',
    'gpt-5.6-terra',
    'claude-sonnet-5',
]);

const premiumBase = {
    ...consentedCrossProvider,
    usagePolicy: 'premium',
    premiumConsentConfirmed: true,
    providerOrder: ['openai', 'anthropic', 'gemini'],
};
const premiumAutoOffPlan = buildAIRequestPlan({
    selectedProvider: 'openai',
    selectedModels,
    providersWithKeys: allProviders,
    failover: { ...premiumBase, allowPremiumAutoUpgrade: false },
});
assert.equal(premiumAutoOffPlan.some(candidate => candidate.automatic && candidate.tier === 'premium'), false);

const premiumAutoOnPlan = buildAIRequestPlan({
    selectedProvider: 'openai',
    selectedModels,
    providersWithKeys: allProviders,
    failover: { ...premiumBase, allowPremiumAutoUpgrade: true, confirmBeforePremium: true },
});
assert.equal(premiumAutoOnPlan.some(candidate => candidate.automatic && candidate.tier === 'premium'), true);
assert.ok(premiumAutoOnPlan.length <= 3);

const premiumCalls = [];
let premiumConfirmations = 0;
const premiumResult = await executeAIRequestPlan({
    job: createTestJob('premium-success'),
    candidates: premiumAutoOnPlan,
    failover: { ...premiumBase, allowPremiumAutoUpgrade: true, confirmBeforePremium: true },
    classifyReason: () => 'modelUnavailable',
    confirmPremium: async () => {
        premiumConfirmations += 1;
        return 'use';
    },
    call: async candidate => {
        premiumCalls.push(candidate.model);
        if (candidate.tier !== 'premium') throw Object.assign(new Error('model unavailable'), { status: 404 });
        return 'premium success';
    },
});
assert.equal(premiumResult.value, 'premium success');
assert.equal(premiumResult.candidate.tier, 'premium');
assert.equal(premiumConfirmations, 1);

const canceledCalls = [];
await assert.rejects(
    executeAIRequestPlan({
        job: createTestJob('premium-cancel'),
        candidates: premiumAutoOnPlan,
        failover: { ...premiumBase, allowPremiumAutoUpgrade: true, confirmBeforePremium: true },
        classifyReason: () => 'modelUnavailable',
        confirmPremium: async () => 'cancel',
        call: async candidate => {
            canceledCalls.push(candidate.model);
            throw Object.assign(new Error('model unavailable'), { status: 404 });
        },
    }),
    error => error?.code === 'AI_PREMIUM_CANCELED',
);
assert.deepEqual(canceledCalls, []);

const creditCalls = [];
await executeAIRequestPlan({
    job: createTestJob('credit-failover'),
    candidates: premiumAutoOnPlan,
    failover: { ...premiumBase, allowPremiumAutoUpgrade: true, confirmBeforePremium: false },
    classifyReason: error => error?.reason,
    confirmPremium: async () => 'use',
    call: async candidate => {
        creditCalls.push(`${candidate.provider}:${candidate.model}`);
        if (candidate.provider === 'openai') throw Object.assign(new Error('credit exhausted'), { reason: 'creditUnavailable' });
        return 'cross-provider success';
    },
});
assert.equal(creditCalls.filter(call => call.startsWith('openai:')).length, 1);
assert.equal(creditCalls.some(call => call.startsWith('anthropic:')), true);

const economyCalls = [];
await assert.rejects(executeAIRequestPlan({
    job: createTestJob('economy-failure'),
    candidates: economyPlan,
    failover: { ...consentedCrossProvider, usagePolicy: 'economy' },
    classifyReason: () => 'modelUnavailable',
    confirmPremium: async () => {
        throw new Error('economy mode must never request premium confirmation');
    },
    call: async candidate => {
        economyCalls.push(candidate);
        throw Object.assign(new Error('model unavailable'), { status: 404 });
    },
}));
assert.equal(economyCalls.every(candidate => candidate.tier !== 'premium'), true);
assert.ok(economyCalls.length <= 3);

__resetAIRequestSafetyForTests();

console.log('AI model, migration, onboarding, failover, premium-consent, and cost-policy tests passed.');
