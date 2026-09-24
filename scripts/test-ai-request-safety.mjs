import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

async function compileTsModule(relativePath, replacements = []) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    let compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [pattern, replacement] of replacements) compiled = compiled.replace(pattern, replacement);
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const modelModuleUrl = await compileTsModule('../src/config/aiModels.ts');
const failoverModuleUrl = await compileTsModule('../src/config/aiFailover.ts', [
    [/from ['"]\.\/aiModels['"]/g, `from ${JSON.stringify(modelModuleUrl)}`],
]);
const safetyModuleUrl = await compileTsModule('../src/services/aiRequestSafety.ts');
const executorModuleUrl = await compileTsModule('../src/services/aiFailoverExecutor.ts', [
    [/from ['"]\.\.\/config\/aiFailover['"]/g, `from ${JSON.stringify(failoverModuleUrl)}`],
    [/from ['"]\.\/aiRequestSafety['"]/g, `from ${JSON.stringify(safetyModuleUrl)}`],
]);
const classificationModuleUrl = await compileTsModule('../src/services/aiErrorClassification.ts', [
    [/from ['"]\.\.\/config\/aiFailover['"]/g, `from ${JSON.stringify(failoverModuleUrl)}`],
]);
const capabilitiesModuleUrl = await compileTsModule('../src/services/aiProviderCapabilities.ts', [
    [/from ['"]\.\.\/config\/aiModels['"]/g, `from ${JSON.stringify(modelModuleUrl)}`],
    [/from ['"]\.\.\/config\/aiFailover['"]/g, `from ${JSON.stringify(failoverModuleUrl)}`],
]);

const {
    MAX_ATTEMPTS_PER_JOB,
    MAX_ATTEMPTS_PER_PROVIDER_PER_JOB,
    MAX_AUTOMATIC_RETRIES,
    AI_TEXT_TIMEOUT_MS,
    AI_FILE_TIMEOUT_MS,
    beginAIRequestJob,
    createAIRequestFingerprint,
    isAIRequestAbort,
    __resetAIRequestSafetyForTests,
} = await import(safetyModuleUrl);
const { executeAIRequestPlan } = await import(executorModuleUrl);
const { classifyAIFailoverReason, shouldCountTowardFailureBlock } = await import(classificationModuleUrl);
const { lockAttachmentRequestPlan } = await import(capabilitiesModuleUrl);

const candidates = [
    { provider: 'gemini', model: 'gemini-safe', tier: 'economy', automatic: false },
    { provider: 'openai', model: 'openai-safe', tier: 'economy', automatic: true },
    { provider: 'anthropic', model: 'claude-safe', tier: 'economy', automatic: true },
];
const failoverOn = {
    enabled: true,
    allowCrossProvider: true,
    crossProviderConsentConfirmed: true,
    switchOn: { serviceUnavailable: true },
};
let sequence = 0;
function job(feature, fingerprint = feature) {
    sequence += 1;
    return beginAIRequestJob({
        featureKey: `${feature}:${sequence}`,
        requestFingerprint: createAIRequestFingerprint(fingerprint),
    });
}
function executorOptions(overrides = {}) {
    return {
        candidates,
        job: job('default'),
        failover: failoverOn,
        classifyReason: () => 'serviceUnavailable',
        confirmPremium: async () => 'use',
        ...overrides,
    };
}

assert.equal(MAX_AUTOMATIC_RETRIES, 0);
assert.equal(MAX_ATTEMPTS_PER_JOB, 3);
assert.equal(MAX_ATTEMPTS_PER_PROVIDER_PER_JOB, 1);

// A — 빠른 두 번 실행: 첫 요청만 provider에 도달해야 함.
__resetAIRequestSafetyForTests();
let releaseFirst;
let doubleClickCalls = 0;
const sharedFeature = 'rehab-plan:double-click';
const sharedFingerprint = createAIRequestFingerprint('same masked request');
const firstJob = beginAIRequestJob({ featureKey: sharedFeature, requestFingerprint: sharedFingerprint });
const firstRun = executeAIRequestPlan(executorOptions({
    candidates: [candidates[0]],
    job: firstJob,
    failover: { enabled: false },
    call: async () => {
        doubleClickCalls += 1;
        return new Promise(resolve => { releaseFirst = resolve; });
    },
}));
await Promise.resolve();
assert.throws(
    () => beginAIRequestJob({ featureKey: sharedFeature, requestFingerprint: sharedFingerprint }),
    error => error?.code === 'AI_DUPLICATE_REQUEST',
);
releaseFirst('ok');
await firstRun;
assert.equal(doubleClickCalls, 1);
console.log('PASS double-click protection');

// B — Failover OFF: 503이어도 같은/다른 provider 자동 호출 없음.
let offCalls = 0;
const offJob = job('failover-off');
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: offJob,
    failover: { enabled: false },
    call: async () => {
        offCalls += 1;
        throw Object.assign(new Error('503'), { status: 503 });
    },
})));
assert.equal(offCalls, 1);
console.log('PASS no automatic retry');

// C — Failover ON: Gemini 1회 실패 후 OpenAI 1회 성공.
const failoverCalls = [];
const result = await executeAIRequestPlan(executorOptions({
    job: job('failover-on'),
    call: async candidate => {
        failoverCalls.push(candidate.provider);
        if (candidate.provider === 'gemini') throw Object.assign(new Error('503'), { status: 503 });
        return 'success';
    },
}));
assert.equal(result.value, 'success');
assert.deepEqual(failoverCalls, ['gemini', 'openai']);
console.log('PASS bounded failover');

// P1 — 일반 429는 quota 소진이 아니며 기본 설정에서 다른 provider를 호출하지 않음.
const rateLimitCalls = [];
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: job('generic-429'),
    classifyReason: classifyAIFailoverReason,
    call: async candidate => {
        rateLimitCalls.push(candidate.provider);
        throw Object.assign(new Error('Too many requests'), { status: 429, providerCode: 'RESOURCE_EXHAUSTED' });
    },
})));
assert.equal(classifyAIFailoverReason({ status: 429, providerCode: 'RESOURCE_EXHAUSTED' }), 'rateLimit');
assert.deepEqual(rateLimitCalls, ['gemini']);
console.log('PASS generic 429 classified as rateLimit without default failover');

// P1/P2 — 명시적 quota, 권한, 모델 부재의 분류와 전환 정책.
const quotaCalls = [];
const quotaResult = await executeAIRequestPlan(executorOptions({
    job: job('explicit-quota'),
    classifyReason: classifyAIFailoverReason,
    call: async candidate => {
        quotaCalls.push(candidate.provider);
        if (candidate.provider === 'gemini') throw Object.assign(new Error('Daily quota exceeded'), { status: 429, providerCode: 'QUOTA_EXCEEDED' });
        return 'quota-failover-success';
    },
}));
assert.equal(quotaResult.value, 'quota-failover-success');
assert.deepEqual(quotaCalls, ['gemini', 'openai']);

const permissionCalls = [];
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: job('permission-403'),
    classifyReason: classifyAIFailoverReason,
    call: async candidate => {
        permissionCalls.push(candidate.provider);
        throw Object.assign(new Error('Forbidden'), { status: 403, providerCode: 'PERMISSION_DENIED' });
    },
})));
assert.equal(classifyAIFailoverReason({ status: 403, providerCode: 'PERMISSION_DENIED' }), 'permissionError');
assert.deepEqual(permissionCalls, ['gemini']);

const modelCalls = [];
const modelResult = await executeAIRequestPlan(executorOptions({
    job: job('model-404'),
    classifyReason: classifyAIFailoverReason,
    call: async candidate => {
        modelCalls.push(candidate.provider);
        if (candidate.provider === 'gemini') throw Object.assign(new Error('Requested model not found'), { status: 404, providerCode: 'MODEL_NOT_FOUND' });
        return 'model-failover-success';
    },
}));
assert.equal(modelResult.value, 'model-failover-success');
assert.deepEqual(modelCalls, ['gemini', 'openai']);
assert.equal(classifyAIFailoverReason({ status: 404, providerCode: 'NOT_FOUND' }), undefined);
console.log('PASS quota/permission/model error classification');

// P1 — 첨부파일 요청은 선택한 Gemini 후보 한 개로 고정되어 prompt-only 전환이 없음.
const attachmentCalls = [];
const attachmentCandidates = lockAttachmentRequestPlan(candidates, 'gemini', true);
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: job('attachment-503'),
    candidates: attachmentCandidates,
    classifyReason: classifyAIFailoverReason,
    call: async candidate => {
        attachmentCalls.push(candidate.provider);
        throw Object.assign(new Error('Service unavailable'), { status: 503 });
    },
})));
assert.deepEqual(attachmentCalls, ['gemini']);
assert.deepEqual(lockAttachmentRequestPlan(candidates, 'openai', true), []);
assert.equal(lockAttachmentRequestPlan(candidates, 'gemini', false).length, candidates.length);
console.log('PASS attachment provider lock and text failover preservation');

// D/E — 모든 provider 실패, 총 3회 종료 및 provider 재방문 없음.
const allFailureCalls = [];
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: job('all-fail'),
    candidates: [candidates[0], candidates[1], candidates[0], candidates[2], candidates[1]],
    call: async candidate => {
        allFailureCalls.push(candidate.provider);
        throw Object.assign(new Error('503'), { status: 503 });
    },
})));
assert.deepEqual(allFailureCalls, ['gemini', 'openai', 'anthropic']);
console.log('PASS max attempts');
console.log('PASS no provider revisit');

// I — 취소는 오류 failover가 아니며 다음 provider를 호출하지 않음.
const abortController = new AbortController();
const abortCalls = [];
const abortedRun = executeAIRequestPlan(executorOptions({
    job: beginAIRequestJob({
        featureKey: `abort:${++sequence}`,
        requestFingerprint: createAIRequestFingerprint('abort'),
        signal: abortController.signal,
    }),
    call: async (candidate, context) => {
        abortCalls.push(candidate.provider);
        return new Promise((resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        });
    },
}));
await Promise.resolve();
abortController.abort();
await assert.rejects(abortedRun, error => error?.name === 'AbortError');
assert.deepEqual(abortCalls, ['gemini']);
console.log('PASS abort stops failover');

// J — premium/후보 수와 관계없이 hard cap 및 provider당 1회 유지.
const premiumCalls = [];
await assert.rejects(executeAIRequestPlan(executorOptions({
    job: job('premium-cap'),
    candidates: [
        { provider: 'gemini', model: 'g-premium', tier: 'premium', automatic: true },
        { provider: 'gemini', model: 'g-balanced', tier: 'balanced', automatic: true },
        { provider: 'openai', model: 'o-premium', tier: 'premium', automatic: true },
        { provider: 'anthropic', model: 'a-premium', tier: 'premium', automatic: true },
    ],
    failover: {
        ...failoverOn,
        usagePolicy: 'premium',
        premiumConsentConfirmed: true,
        allowPremiumAutoUpgrade: true,
        confirmBeforePremium: false,
    },
    call: async candidate => {
        premiumCalls.push(candidate.provider);
        throw Object.assign(new Error('503'), { status: 503 });
    },
})));
assert.ok(premiumCalls.length <= MAX_ATTEMPTS_PER_JOB);
assert.equal(new Set(premiumCalls).size, premiumCalls.length);
console.log('PASS paid mode safety cap');

// A-1 — 시간제한: 응답이 멈춰도 작업이 끝나고 기능 잠금이 풀리며, 전용 한국어 메시지로 끝난다.
assert.equal(AI_TEXT_TIMEOUT_MS, 180_000);
assert.equal(AI_FILE_TIMEOUT_MS, 300_000);
// 작업 시간제한 타이머는 unref되어 있으므로, 테스트가 기다리는 동안 프로세스가 끝나지 않게 붙잡아 둔다.
const keepAlive = setInterval(() => {}, 1000);
const timeoutFeature = `timeout:${++sequence}`;
const timeoutCalls = [];
const timeoutRun = executeAIRequestPlan(executorOptions({
    job: beginAIRequestJob({ featureKey: timeoutFeature, requestFingerprint: createAIRequestFingerprint('slow'), timeoutMs: 30 }),
    call: async (candidate, context) => {
        timeoutCalls.push(candidate.provider);
        return new Promise((resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason || new Error('aborted')), { once: true });
        });
    },
}));
await assert.rejects(timeoutRun, error => error?.code === 'AI_REQUEST_TIMEOUT'
    && /응답 시간이 초과/.test(error.message)
    && !isAIRequestAbort(error)
    && classifyAIFailoverReason(error) === undefined);
assert.deepEqual(timeoutCalls, ['gemini'], 'timeout must not fail over to another provider');
assert.doesNotThrow(() => beginAIRequestJob({ featureKey: timeoutFeature, requestFingerprint: createAIRequestFingerprint('after-timeout') }).finish('completed'));

// 제공업체 호출이 신호를 무시하고 영원히 멈춰도 시간 초과 시점에 기능 잠금이 풀려야 한다.
const hangingFeature = `hanging:${++sequence}`;
const hangingJob = beginAIRequestJob({ featureKey: hangingFeature, requestFingerprint: createAIRequestFingerprint('hang'), timeoutMs: 20 });
void executeAIRequestPlan(executorOptions({ job: hangingJob, call: () => new Promise(() => {}) })).catch(() => {});
assert.throws(() => beginAIRequestJob({ featureKey: hangingFeature, requestFingerprint: createAIRequestFingerprint('hang-2') }), error => error?.code === 'AI_DUPLICATE_REQUEST');
await new Promise(resolve => setTimeout(resolve, 60));
assert.equal(hangingJob.timedOut, true);
assert.throws(() => hangingJob.assertActive(), error => error?.code === 'AI_REQUEST_TIMEOUT');
assert.doesNotThrow(() => beginAIRequestJob({ featureKey: hangingFeature, requestFingerprint: createAIRequestFingerprint('hang-3') }).finish('completed'));

// 사용자 취소도 응답을 기다리지 않고 바로 잠금을 푼다.
const cancelFeature = `cancel-release:${++sequence}`;
const cancelController = new AbortController();
beginAIRequestJob({ featureKey: cancelFeature, requestFingerprint: createAIRequestFingerprint('cancel'), signal: cancelController.signal });
cancelController.abort();
assert.doesNotThrow(() => beginAIRequestJob({ featureKey: cancelFeature, requestFingerprint: createAIRequestFingerprint('cancel-2') }).finish('completed'));
clearInterval(keepAlive);
console.log('PASS request timeout releases the feature lock with a dedicated message');

// A-5 — 제공업체 원문 메시지 기반 분류(할당량·크레딧), A-7 — 인증·권한·입력 오류는 반복 실패 차단에서 제외.
assert.equal(classifyAIFailoverReason({ status: 429, message: 'got status: 429. {"error":{"message":"You exceeded your current quota, please check your plan and billing details."}}' }), 'quotaExceeded');
assert.equal(classifyAIFailoverReason({ status: 429, providerMessage: 'You exceeded your current quota' }), 'quotaExceeded');
assert.equal(classifyAIFailoverReason({ status: 400, providerCode: 'invalid_request_error', providerMessage: 'Your credit balance is too low to access the Anthropic API.' }), 'creditUnavailable');
assert.equal(classifyAIFailoverReason({ status: 400, providerCode: 'INVALID_ARGUMENT', providerMessage: 'API key not valid. Please pass a valid API key.' }), 'authError');
assert.equal(classifyAIFailoverReason({ status: 400, providerCode: 'invalid_request_error', providerMessage: 'messages: field required' }), undefined);
assert.equal(shouldCountTowardFailureBlock({ status: 401 }), false);
assert.equal(shouldCountTowardFailureBlock({ status: 403, providerCode: 'PERMISSION_DENIED' }), false);
assert.equal(shouldCountTowardFailureBlock({ reason: 'api-key', status: 401 }), false);
assert.equal(shouldCountTowardFailureBlock({ code: 'AI_INPUT_ERROR' }), false);
assert.equal(shouldCountTowardFailureBlock({ status: 503 }), true);
assert.equal(shouldCountTowardFailureBlock({ code: 'AI_REQUEST_TIMEOUT' }), true);
console.log('PASS quota/credit classification from provider messages and failure-block exclusions');

async function listSourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await listSourceFiles(path));
        else if (['.ts', '.tsx'].includes(extname(entry.name))) files.push(path);
    }
    return files;
}

// F — effect 내부 생성형 API 호출이 없어야 StrictMode rerender가 호출을 만들지 않음.
const sourceFiles = await listSourceFiles(fileURLToPath(new URL('../src', import.meta.url)));
const forbiddenCalls = /\b(generateText|generateImage|generateDocumentText|analyzeTestResults|generateReport|performOCR|smartParseItemizedReceiptWithAI)\s*\(/;
for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'useEffect') {
            assert.equal(forbiddenCalls.test(node.getText(sourceFile)), false, `AI call found in useEffect: ${file}`);
        }
        if (ts.isCatchClause(node)) {
            assert.equal(forbiddenCalls.test(node.block.getText(sourceFile)), false, `Nested retry/failover found in catch: ${file}`);
        }
        if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'onChange' && node.initializer) {
            assert.equal(forbiddenCalls.test(node.initializer.getText(sourceFile)), false, `AI call found in file/input change handler: ${file}`);
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
}
console.log('PASS rerender does not call AI');
console.log('PASS no nested retry or file-select auto call');

// G/H — 로컬 저장·출력 구현은 AI service를 호출하지 않음.
const localOnlyFiles = [
    '../src/utils/localDocumentExport.ts',
    '../src/utils/rehabPlanDocx.ts',
    '../src/utils/jjssFileService.ts',
    '../src/config/localDB.ts',
];
for (const relativePath of localOnlyFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.equal(forbiddenCalls.test(source), false, `AI call found in local save/output module: ${relativePath}`);
}
console.log('PASS save/output does not call AI');

// normalized 사용자 오류 metadata는 failover category의 의미와 일치해야 한다.
const geminiSource = await readFile(new URL('../src/services/gemini.ts', import.meta.url), 'utf8');
assert.match(geminiSource, /failoverReason === 'rateLimit'[\s\S]*?'rate-limit', 429/);
assert.match(geminiSource, /failoverReason === 'creditUnavailable'[\s\S]*?'credit', 402/);
console.log('PASS normalized error metadata consistency');

assert.match(geminiSource, /'gemini-3\.1-flash-image'/);
assert.match(geminiSource, /'gemini-3-pro-image'/);
const allowedImageModelsBlock = geminiSource.match(/const ALLOWED_IMAGE_MODELS[\s\S]*?\];/)?.[0] || '';
assert.doesNotMatch(allowedImageModelsBlock, /image-preview|gemini-2\.5-flash-image/);
assert.match(geminiSource, /checkGeminiConnection[\s\S]*?models\.get/);
assert.doesNotMatch(geminiSource.match(/export async function checkGeminiConnection[\s\S]*?\n}\n/)?.[0] || '', /generateContent/);
console.log('PASS image/text model separation and generation-free connection check');

// P0-1 — 비식별화 도구: 원문 우회 경로가 없고, 개인정보 점검 요청은 다른 제공업체로 전환하지 않는다.
assert.doesNotMatch(geminiSource, /isMaskingMode/);
assert.match(geminiSource, /type === 'masking' \|\| options\?\.disableCrossProviderFailover === true/);
assert.match(geminiSource, /allowCrossProvider: false/);
const maskingViewSource = await readFile(new URL('../src/components/MaskingView.tsx', import.meta.url), 'utf8');
assert.match(maskingViewSource, /anonymizeText\(input/);
assert.match(maskingViewSource, /wrapAsData\(maskedText\)/);
assert.doesNotMatch(maskingViewSource, /generateText\([^)]*\binput\b/);
assert.match(maskingViewSource, /disableCrossProviderFailover: true/);
assert.match(maskingViewSource, /!aiConsent/);
console.log('PASS masking tool sends only locally masked text after consent, without cross-provider failover');

// P0-8 — OCR은 API 키를 URL 쿼리에 넣지 않는다.
const ocrSource = await readFile(new URL('../src/services/ocr.ts', import.meta.url), 'utf8');
assert.doesNotMatch(ocrSource, /[?&]key=/);
assert.match(ocrSource, /'x-goog-api-key': visionApiKey/);
console.log('PASS OCR API keys are sent in headers only');

console.log('AI request safety tests passed without using any real API key or network request.');
