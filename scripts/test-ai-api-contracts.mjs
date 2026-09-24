import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source) {
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const responseUrl = moduleUrl(await readFile(new URL('../src/services/aiTextResponse.ts', import.meta.url), 'utf8'));
const reasoningUrl = moduleUrl(await readFile(new URL('../src/config/aiReasoning.ts', import.meta.url), 'utf8'));
const { getAIReasoningLevels, normalizeAIReasoningLevel, geminiThinkingLevel, openAIReasoningEffort, claudeReasoningEffort } = await import(reasoningUrl);
assert.deepEqual(getAIReasoningLevels('gemini', 'gemini-3.5-flash-lite'), ['auto', 'low', 'medium', 'high']);
assert.deepEqual(getAIReasoningLevels('anthropic', 'claude-haiku-4-5'), ['auto']);
assert.equal(normalizeAIReasoningLevel('anthropic', 'claude-haiku-4-5', 'high'), 'auto');
assert.equal(geminiThinkingLevel('gemini-3.5-flash-lite', 'medium'), 'MEDIUM');
assert.equal(openAIReasoningEffort('gpt-5.6-luna', 'medium'), 'medium');
assert.equal(claudeReasoningEffort('claude-sonnet-5', 'low'), 'low');
assert.equal(claudeReasoningEffort('claude-haiku-4-5', 'high'), undefined);
const { readOpenAIText, readAnthropicText, readGeminiText, requireAIText } = await import(responseUrl);
const classificationUrl = moduleUrl(await readFile(new URL('../src/services/aiErrorClassification.ts', import.meta.url), 'utf8'));
const { classifyAIFailoverReason } = await import(classificationUrl);
assert.equal(readAnthropicText({ content: [
    { type: 'thinking', thinking: 'Do not expose reasoning', text: 'Not a text block' },
    { type: 'text', text: '첫 문단' },
    { type: 'tool_use', text: 'Not an answer' },
    { type: 'text', text: '둘째 문단' },
] }), '첫 문단\n둘째 문단');

// Gemini: 모든 텍스트 part를 이어 붙이고 사고(thought) part는 제외, 출력 한도·안전 차단은 오류.
assert.equal(readGeminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: '숨김 사고', thought: true },
    { text: '첫 부분, ' },
    { inlineData: { data: 'x' } },
    { text: '둘째 부분' },
] } }] }), '첫 부분, 둘째 부분');
assert.equal(readGeminiText({ text: 'SDK 본문', candidates: [{ finishReason: 'STOP' }] }), 'SDK 본문');

for (const [run, code] of [
    [() => readGeminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '잘린 본문' }] } }] }), 'AI_TRUNCATED_RESPONSE'],
    [() => readGeminiText({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }), 'AI_REFUSED_RESPONSE'],
    [() => readGeminiText({ promptFeedback: { blockReason: 'SAFETY' } }), 'AI_REFUSED_RESPONSE'],
    [() => readGeminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }] } }] }), 'AI_EMPTY_RESPONSE'],
    [() => requireAIText('  '), 'AI_EMPTY_RESPONSE'],
    [() => readOpenAIText(null), 'AI_EMPTY_RESPONSE'],
    [() => readOpenAIText({ choices: [{ message: { content: null } }] }), 'AI_EMPTY_RESPONSE'],
    [() => readOpenAIText({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }), 'AI_TRUNCATED_RESPONSE'],
    [() => readOpenAIText({ choices: [{ message: { refusal: 'blocked' } }] }), 'AI_REFUSED_RESPONSE'],
    [() => readAnthropicText({ content: [{ type: 'thinking' }] }), 'AI_EMPTY_RESPONSE'],
    [() => readAnthropicText({ content: {} }), 'AI_EMPTY_RESPONSE'],
    [() => readAnthropicText({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }), 'AI_TRUNCATED_RESPONSE'],
    [() => readAnthropicText({ stop_reason: 'refusal' }), 'AI_REFUSED_RESPONSE'],
]) {
    assert.throws(run, error => error.code === code && classifyAIFailoverReason(error) === undefined);
}

// Execute the actual adapter bodies with a mocked fetch. No real key, network,
// store, or renderer initialization is used by this isolated contract test.
const source = await readFile(new URL('../src/services/gemini.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('gemini.ts', source, ts.ScriptTarget.Latest, true);
const adapters = parsed.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['callGemini', 'callOpenAI', 'callAnthropic', 'generateDocumentText'].includes(node.name?.text));
assert.equal(adapters.length, 4);
// 출력 한도 상수와 자료 처리 지침은 실제 소스의 선언을 그대로 가져와 검증한다.
const sharedConstants = parsed.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => [
        'GEMINI_MAX_OUTPUT_TOKENS', 'OPENAI_MAX_OUTPUT_TOKENS', 'ANTHROPIC_MAX_OUTPUT_TOKENS', 'DATA_SAFETY_PROMPT',
    ].includes(declaration.name.getText(parsed))));
assert.equal(sharedConstants.length, 4);
const adapterUrl = moduleUrl(`
    import { readOpenAIText, readAnthropicText, readGeminiText, requireAIText, aiResponseError } from ${JSON.stringify(responseUrl)};
    import { openAIReasoningEffort, claudeReasoningEffort, geminiThinkingLevel } from ${JSON.stringify(reasoningUrl)};
    import { attachProviderMessage } from ${JSON.stringify(classificationUrl)};
    const stripMarkdown = (text: string) => text;
    ${sharedConstants.map(node => node.getText(parsed).replace(/^export\s+/, '')).join('\n')}
    const ThinkingLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
    const getGeminiModelConfig = (model: string) => ({ textModel: model });
    const aiRequests: any[] = [];
    let nextGeminiResponse: any = null;
    const setNextGeminiResponse = (response: any) => { nextGeminiResponse = response; };
    const createGoogleAIClient = () => ({ models: { generateContent: async (request: any) => {
        aiRequests.push(request);
        const response = nextGeminiResponse || { text: 'Gemini 본문', candidates: [{ finishReason: 'STOP' }] };
        nextGeminiResponse = null;
        return response;
    } } });
    const safeApiErrorMetadata = () => ({});
    const normalizeGeminiError = (error: Error) => error;
    ${adapters.map(node => node.getText(parsed)).join('\n')}
    export { callGemini, callOpenAI, callAnthropic, generateDocumentText, createGoogleAIClient, aiRequests, setNextGeminiResponse, OPENAI_MAX_OUTPUT_TOKENS, ANTHROPIC_MAX_OUTPUT_TOKENS };
`);
const {
    callGemini, callOpenAI, callAnthropic, generateDocumentText, createGoogleAIClient, aiRequests, setNextGeminiResponse,
    OPENAI_MAX_OUTPUT_TOKENS, ANTHROPIC_MAX_OUTPUT_TOKENS,
} = await import(adapterUrl);
assert.ok(OPENAI_MAX_OUTPUT_TOKENS >= 16000, 'OpenAI 출력 한도는 16k 이상');
assert.ok(ANTHROPIC_MAX_OUTPUT_TOKENS >= 16000, 'Anthropic 출력 한도는 16k 이상');
const originalFetch = globalThis.fetch;
const calls = [];
let responseBody;
let status = 200;
globalThis.fetch = async (url, options) => {
    assert.ok(['https://api.openai.com/v1/chat/completions', 'https://api.anthropic.com/v1/messages'].includes(url));
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: status === 200, status, json: async () => responseBody };
};

try {
    const controller = new AbortController();
    assert.equal(await callGemini('synthetic-not-a-key', 'gemini-3.5-flash-lite', '시스템', '질문', [], [], controller.signal, 'medium'), 'Gemini 본문');
    assert.deepEqual(aiRequests.at(-1).config.thinkingConfig, { thinkingLevel: 'MEDIUM' });
    assert.equal(aiRequests.at(-1).config.abortSignal, controller.signal);
    assert.equal(aiRequests.at(-1).config.maxOutputTokens, 65536);
    assert.equal(aiRequests.at(-1).config.httpOptions.retryOptions.attempts, 1);
    assert.equal(await generateDocumentText(createGoogleAIClient(), 'gemini-3.5-flash-lite', '질문', [], controller.signal, 'low'), 'Gemini 본문');
    assert.deepEqual(aiRequests.at(-1).config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.match(aiRequests.at(-1).config.systemInstruction, /<자료>/);
    // 파일 분석 경로도 출력 한도 도달·안전 차단을 확인하고 모든 part를 이어 붙인다.
    setNextGeminiResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '보고서 ' }, { text: '전체' }] } }] });
    assert.equal(await generateDocumentText(createGoogleAIClient(), 'gemini-3.5-flash-lite', '질문', [], controller.signal), '보고서 전체');
    setNextGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '잘린 보고서' }] } }] });
    await assert.rejects(generateDocumentText(createGoogleAIClient(), 'gemini-3.5-flash-lite', '질문', [], controller.signal), error => error.code === 'AI_TRUNCATED_RESPONSE');
    setNextGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] });
    await assert.rejects(generateDocumentText(createGoogleAIClient(), 'gemini-3.5-flash-lite', '질문', [], controller.signal), error => error.code === 'AI_REFUSED_RESPONSE');
    const history = [{ role: 'user', content: '이전 질문' }, { role: 'model', content: '이전 답변' }];
    for (const model of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        responseBody = { choices: [{ finish_reason: 'stop', message: { content: '완료' } }] };
        assert.equal(await callOpenAI('synthetic-not-a-key', model, '시스템', '현재 질문', history, controller.signal), '완료');
        const call = calls.at(-1);
        assert.equal(call.body.model, model);
        assert.equal(call.body.max_completion_tokens, OPENAI_MAX_OUTPUT_TOKENS);
        assert.equal(call.options.signal, controller.signal);
        assert.equal(call.body.reasoning_effort, model.startsWith('gpt-6-') ? 'medium' : undefined);
        assert.equal(call.body.temperature, undefined);
        assert.equal(call.body.tools, undefined);
        assert.deepEqual(call.body.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
    }
    responseBody = { choices: [{ finish_reason: 'stop', message: { content: '보통 응답' } }] };
    await callOpenAI('synthetic-not-a-key', 'gpt-5.6-luna', '시스템', '질문', [], controller.signal, 'medium');
    assert.equal(calls.at(-1).body.reasoning_effort, 'medium');
    await callOpenAI('synthetic-not-a-key', 'gpt-5.6-luna', '시스템', '질문', [], controller.signal, 'high');
    assert.equal(calls.at(-1).body.reasoning_effort, 'high');
    responseBody = { stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: '본문' }] };
    assert.equal(await callAnthropic('synthetic-not-a-key', 'claude-opus-5', '시스템', '현재 질문', history, controller.signal), '본문');
    assert.equal(calls.at(-1).body.max_tokens, ANTHROPIC_MAX_OUTPUT_TOKENS);
    assert.equal(calls.at(-1).options.signal, controller.signal);
    assert.equal(calls.at(-1).options.headers['anthropic-version'], '2023-06-01');
    await callAnthropic('synthetic-not-a-key', 'claude-sonnet-5', '시스템', '질문', [], controller.signal, 'low');
    assert.deepEqual(calls.at(-1).body.output_config, { effort: 'low' });
    await callAnthropic('synthetic-not-a-key', 'claude-haiku-4-5', '시스템', '질문', [], controller.signal, 'high');
    assert.equal(calls.at(-1).body.output_config, undefined);

    status = 429;
    responseBody = { error: { code: 'insufficient_quota', message: 'never surface raw provider content' } };
    const before = calls.length;
    await assert.rejects(callOpenAI('synthetic-not-a-key', 'gpt-6-sol', '시스템', '질문'), error =>
        error.status === 429 && error.providerCode === 'insufficient_quota'
        && !error.message.includes('never surface'));
    assert.equal(calls.length - before, 1, 'adapter must not retry');

    // 제공업체 원문 메시지는 분류 전용(열거 불가·200자 제한)으로만 보관되고 메시지·직렬화에는 나오지 않는다.
    responseBody = { error: { code: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details. ' + 'x'.repeat(400) } };
    await assert.rejects(callOpenAI('synthetic-not-a-key', 'gpt-6-sol', '시스템', '질문'), error => {
        assert.equal(classifyAIFailoverReason(error), 'quotaExceeded');
        assert.equal(Object.keys(error).includes('providerMessage'), false);
        assert.equal(JSON.stringify(error).includes('exceeded'), false);
        assert.equal(error.message.includes('exceeded'), false);
        assert.ok(error.providerMessage.length <= 200);
        return true;
    });
    status = 400;
    responseBody = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } };
    await assert.rejects(callAnthropic('synthetic-not-a-key', 'claude-sonnet-5', '시스템', '질문'), error => {
        assert.equal(error.status, 400);
        assert.equal(classifyAIFailoverReason(error), 'creditUnavailable');
        assert.equal(error.message.includes('credit'), false);
        return true;
    });
} finally {
    globalThis.fetch = originalFetch;
}
console.log('PASS API request contracts, thinking/text parsing, empty/truncated responses, no retry; no network used.');

// C1 — 연결 확인: 생성(과금) 요청 없이 키를 헤더로만 보내고, 실패 원인을 한국어로 구분한다.
const modelsUrl = moduleUrl(await readFile(new URL('../src/config/aiModels.ts', import.meta.url), 'utf8'));
const geminiStubUrl = moduleUrl(`
    export const geminiCalls: any[] = [];
    export async function checkGeminiConnection(apiKey: string, model?: string, signal?: AbortSignal) {
        geminiCalls.push({ apiKey, model, hasSignal: !!signal });
        return 'Gemini 사용 가능';
    }
`);
const connectionSource = (await readFile(new URL('../src/services/connectionCheck.ts', import.meta.url), 'utf8'))
    .replace(/from ['"]\.\.\/config\/aiModels['"]/g, `from ${JSON.stringify(modelsUrl)}`)
    .replace(/from ['"]\.\/gemini['"]/g, `from ${JSON.stringify(geminiStubUrl)}`);
const { checkProviderConnection } = await import(moduleUrl(connectionSource));
const { geminiCalls } = await import(geminiStubUrl);
const connectionKey = 'synthetic-connection-key';
const connectionCalls = [];
let connectionResponder = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, options = {}) => {
    connectionCalls.push({ url: String(url), options });
    const reply = connectionResponder(String(url), options);
    if (reply instanceof Error) throw reply;
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
};
try {
    await assert.rejects(checkProviderConnection('openai', '   '), error => /API 키를 먼저 입력/.test(error.message));
    assert.equal(await checkProviderConnection('gemini', ` ${connectionKey} `, { model: 'gemini-3.5-flash-lite' }), 'Gemini 사용 가능');
    assert.deepEqual(geminiCalls.at(-1), { apiKey: connectionKey, model: 'gemini-3.5-flash-lite', hasSignal: true });

    connectionResponder = () => ({ status: 200, body: { id: 'gpt-6-sol' } });
    assert.match(await checkProviderConnection('openai', connectionKey, { model: 'gpt-6-sol' }), /정상적으로 연결/);
    let call = connectionCalls.at(-1);
    assert.equal(call.url, 'https://api.openai.com/v1/models/gpt-6-sol');
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.headers.Authorization, `Bearer ${connectionKey}`);

    connectionResponder = () => ({ status: 200, body: { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' } });
    assert.match(await checkProviderConnection('anthropic', connectionKey, { model: 'claude-sonnet-5' }), /Claude Sonnet 5/);
    call = connectionCalls.at(-1);
    assert.equal(call.url, 'https://api.anthropic.com/v1/models/claude-sonnet-5');
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.headers['x-api-key'], connectionKey);
    assert.equal(call.options.headers['anthropic-version'], '2023-06-01');
    assert.equal(call.options.headers['anthropic-dangerous-direct-browser-access'], 'true');

    // Vision: 이미지가 없는 빈 요청 — 400(요청 내용 오류)은 키가 유효하다는 뜻, API_KEY_INVALID는 잘못된 키.
    connectionResponder = () => ({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'At least one request is required.' } } });
    assert.match(await checkProviderConnection('vision', connectionKey), /정상적으로 연결/);
    call = connectionCalls.at(-1);
    assert.equal(call.url, 'https://vision.googleapis.com/v1/images:annotate');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['x-goog-api-key'], connectionKey);
    assert.deepEqual(JSON.parse(call.options.body), { requests: [] });
    connectionResponder = () => ({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } });
    await assert.rejects(checkProviderConnection('vision', connectionKey), error => /올바르지 않습니다/.test(error.message));
    connectionResponder = () => ({ status: 403, body: { error: { status: 'PERMISSION_DENIED', message: 'Cloud Vision API has not been used', details: [{ reason: 'SERVICE_DISABLED' }] } } });
    await assert.rejects(checkProviderConnection('vision', connectionKey), error => /권한|사용 설정/.test(error.message));

    for (const [reply, pattern] of [
        [{ status: 401, body: { error: { type: 'invalid_request_error', code: 'invalid_api_key' } } }, /올바르지 않습니다/],
        [{ status: 403, body: { error: { type: 'permission_error' } } }, /권한/],
        [{ status: 429, body: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } } }, /한도|할당량/],
        [{ status: 404, body: { error: { type: 'not_found_error' } } }, /모델/],
        [new TypeError('Failed to fetch'), /인터넷 연결/],
    ]) {
        connectionResponder = () => reply;
        for (const provider of ['openai', 'anthropic']) {
            await assert.rejects(checkProviderConnection(provider, connectionKey, { model: provider === 'openai' ? 'gpt-6-sol' : 'claude-sonnet-5' }), error => pattern.test(error.message), `${provider} ${pattern}`);
        }
    }
    for (const entry of connectionCalls) {
        assert.equal(entry.url.includes(connectionKey), false, 'API 키가 URL에 들어가면 안 됨');
        assert.ok(!/chat\/completions|\/v1\/messages|generateContent/.test(entry.url), '연결 확인은 생성 요청을 보내지 않음');
        assert.ok(entry.options.signal, '연결 확인에는 시간제한 신호가 있어야 함');
    }
} finally {
    globalThis.fetch = originalFetch;
}
console.log('PASS provider connection checks use header keys, no billable generation, Korean failure causes; no network used.');
