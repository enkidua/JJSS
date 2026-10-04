import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/connectionCheck.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText
    .replace(/import \{ normalizeAIModel \} from ['"]\.\.\/config\/aiModels['"];?/, 'const normalizeAIModel = (_provider, model) => model;')
    .replace(/import \{ checkGeminiConnection \} from ['"]\.\/gemini['"];?/, 'const checkGeminiConnection = () => Promise.resolve("synthetic success");');
const { checkProviderConnection, CONNECTION_CHECK_TIMEOUT_MS } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const original = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const timers = new Map();
try {
    globalThis.setTimeout = (callback, delay) => {
        const token = { unref() {} };
        timers.set(token, { callback, delay });
        return token;
    };
    globalThis.clearTimeout = token => timers.delete(token);
    for (const provider of ['openai', 'anthropic', 'vision']) {
        for (const mode of ['timeout', 'cancel']) {
            const controller = new AbortController();
            let bodyStarted;
            const reading = new Promise(resolve => { bodyStarted = resolve; });
            let requestSignal;
            globalThis.fetch = async (_url, options) => {
                requestSignal = options.signal;
                return {
                    ok: provider === 'anthropic', status: provider === 'vision' ? 400 : 401,
                    json: () => new Promise((_resolve, reject) => {
                        requestSignal.addEventListener('abort', () => reject(Object.assign(new Error('synthetic abort'), { name: 'AbortError' })), { once: true });
                        bodyStarted();
                    }),
                };
            };
            const operation = checkProviderConnection(provider, 'synthetic-key', { signal: controller.signal });
            const rejected = assert.rejects(operation, error => mode === 'timeout'
                ? error.reason === 'timeout' : error.name === 'AbortError');
            await reading;
            assert.ok([...timers.values()].some(timer => timer.delay === CONNECTION_CHECK_TIMEOUT_MS), 'Timeout must remain active during body reading');
            if (mode === 'cancel') controller.abort();
            else for (const timer of [...timers.values()]) timer.callback();
            await rejected;
            assert.equal(requestSignal.aborted, true);
            assert.equal(timers.size, 0, 'Completed check cleans its timer');
            console.log(`PASS ${provider} body ${mode}`);
        }
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ display_name: 'synthetic' }) }; };
    for (const provider of ['openai', 'anthropic', 'vision', 'gemini']) {
        assert.match(await checkProviderConnection(provider, 'synthetic-key'), /연결|synthetic/);
        assert.equal(timers.size, 0);
    }
    const controller = new AbortController();
    controller.abort();
    const previousCalls = calls;
    await assert.rejects(checkProviderConnection('openai', 'synthetic-key', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, previousCalls, 'Already cancelled check sends no request');
    console.log('PASS connection success, timer cleanup and pre-cancelled request');
} finally {
    Object.assign(globalThis, original);
}
