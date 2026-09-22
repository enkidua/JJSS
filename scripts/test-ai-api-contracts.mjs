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
const { readOpenAIText, readAnthropicText, requireAIText } = await import(responseUrl);
const classificationUrl = moduleUrl(await readFile(new URL('../src/services/aiErrorClassification.ts', import.meta.url), 'utf8'));
const { classifyAIFailoverReason } = await import(classificationUrl);
assert.equal(readAnthropicText({ content: [
    { type: 'thinking', thinking: 'Do not expose reasoning', text: 'Not a text block' },
    { type: 'text', text: '첫 문단' },
    { type: 'tool_use', text: 'Not an answer' },
    { type: 'text', text: '둘째 문단' },
] }), '첫 문단\n둘째 문단');

for (const [run, code] of [
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
const adapterUrl = moduleUrl(`
    import { readOpenAIText, readAnthropicText, requireAIText, aiResponseError } from ${JSON.stringify(responseUrl)};
    import { openAIReasoningEffort, claudeReasoningEffort, geminiThinkingLevel } from ${JSON.stringify(reasoningUrl)};
    const stripMarkdown = (text: string) => text;
    const GEMINI_MAX_OUTPUT_TOKENS = 65536;
    const ThinkingLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
    const getGeminiModelConfig = (model: string) => ({ textModel: model });
    const aiRequests: any[] = [];
    const createGoogleAIClient = () => ({ models: { generateContent: async (request: any) => {
        aiRequests.push(request);
        return { text: 'Gemini 본문', candidates: [{ finishReason: 'STOP' }] };
    } } });
    const safeApiErrorMetadata = () => ({});
    const normalizeGeminiError = (error: Error) => error;
    ${adapters.map(node => node.getText(parsed)).join('\n')}
    export { callGemini, callOpenAI, callAnthropic, generateDocumentText, createGoogleAIClient, aiRequests };
`);
const { callGemini, callOpenAI, callAnthropic, generateDocumentText, createGoogleAIClient, aiRequests } = await import(adapterUrl);
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
    const history = [{ role: 'user', content: '이전 질문' }, { role: 'model', content: '이전 답변' }];
    for (const model of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
        responseBody = { choices: [{ finish_reason: 'stop', message: { content: '완료' } }] };
        assert.equal(await callOpenAI('synthetic-not-a-key', model, '시스템', '현재 질문', history, controller.signal), '완료');
        const call = calls.at(-1);
        assert.equal(call.body.model, model);
        assert.equal(call.body.max_completion_tokens, 4096);
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
    assert.equal(calls.at(-1).body.max_tokens, 4096);
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
} finally {
    globalThis.fetch = originalFetch;
}
console.log('PASS API request contracts, thinking/text parsing, empty/truncated responses, no retry; no network used.');
