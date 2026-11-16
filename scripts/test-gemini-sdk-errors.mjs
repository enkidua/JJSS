// 실제 @google/genai(앱이 묶는 web 빌드)로, 구글이 실패 응답을 줄 때 오류의 상태·메시지가 앱까지 전달되는지 확인한다.
// 배경: SDK에 httpOptions.retryOptions를 주면 실패 응답이 "Non-retryable exception … sending request" 같은 글로만
// 바뀌어 상태·메시지가 사라진다. 그러면 잘못된 키·할당량 초과·모델 없음이 모두 "잠시 후 다시 시도"로만 보이고
// 오류 분류(자동 전환·키 상태 기록)가 동작하지 않는다. 다른 테스트는 가짜 SDK를 쓰므로 이 문제를 잡지 못했다.
// 네트워크 없음(fetch를 가짜로 바꿈). 키는 합성 값.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { GoogleGenAI } = await import(pathToFileURL(path.join(root, 'node_modules/@google/genai/dist/web/index.mjs')).href);

async function loadTs(relative) {
    const code = ts.transpileModule(await readFile(path.join(root, 'src', relative), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { classifyAIFailoverReason } = await loadTs('services/aiErrorClassification.ts');

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const SYNTHETIC_KEY = 'AIzaSy-synthetic-test-key-000000000000000';
const googleError = (code, status, message, reason) => JSON.stringify({
    error: { code, message, status, details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }] : [] },
});

const originalFetch = globalThis.fetch;
let calls = [];
function respondWith(status, body) {
    calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
        // HTTP/2에서는 statusText가 비어 있다(구글 API도 그렇다). 메시지를 statusText에 기대면 안 된다.
        return new Response(body, { status, statusText: '', headers: { 'content-type': 'application/json' } });
    };
}

/** 앱의 createGoogleAIClient가 SDK에 넘기는 옵션을 소스에서 그대로 읽어 같은 모양으로 만든다. */
const geminiSource = await readFile(path.join(root, 'src/services/gemini.ts'), 'utf8');
const ocrSource = await readFile(path.join(root, 'src/services/ocr.ts'), 'utf8');
const clientMatch = geminiSource.match(/export function createGoogleAIClient\(apiKey: string\): GoogleGenAI \{[\s\S]*?return new GoogleGenAI\((\{[\s\S]*?\})\);\s*\}/);
assert.ok(clientMatch, 'createGoogleAIClient를 소스에서 찾지 못했습니다.');
const appClientOptions = apiKey => Function('apiKey', `return (${clientMatch[1]});`)(apiKey);

try {
    await test('앱은 Gemini SDK에 retryOptions를 넘기지 않는다(클라이언트·요청 어느 쪽에도)', async () => {
        assert.deepEqual(Object.keys(appClientOptions(SYNTHETIC_KEY)), ['apiKey']);
        for (const [name, source] of [['gemini.ts', geminiSource], ['ocr.ts', ocrSource]]) {
            const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
            assert.equal(/retryOptions/.test(code), false, `${name}: retryOptions를 쓰면 실패 응답의 상태·메시지가 사라집니다.`);
        }
        assert.equal((geminiSource.match(/new GoogleGenAI\(/g) || []).length, 1, 'SDK 클라이언트는 createGoogleAIClient 한 곳에서만 만든다');
        assert.equal(/new GoogleGenAI\(/.test(ocrSource), false);
    });

    await test('잘못된 키(400 API_KEY_INVALID): 상태와 구글 메시지가 남고, 요청은 한 번만 간다 → 인증 오류로 분류', async () => {
        respondWith(400, googleError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'));
        const ai = new GoogleGenAI(appClientOptions(SYNTHETIC_KEY));
        const error = await ai.models.get({ model: 'gemini-3.5-flash-lite' }).then(() => null, e => e);
        assert.ok(error, '실패 응답은 오류로 던져져야 한다');
        assert.equal(calls.length, 1, '자동 재시도 없음');
        assert.equal(calls[0].headers['x-goog-api-key'], SYNTHETIC_KEY, '키는 헤더로만');
        assert.equal(calls[0].url.includes(SYNTHETIC_KEY), false, '키가 주소에 들어가지 않는다');
        assert.equal(Number(error.status), 400);
        assert.match(String(error.message), /API key not valid/);
        assert.equal(classifyAIFailoverReason(error), 'authError');
    });

    await test('생성 요청의 실패도 같다: 429 할당량·429 요청 제한·503 혼잡·404 모델 없음·403 권한', async () => {
        const cases = [
            [429, googleError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota, please check your plan and billing details.'), 'quotaExceeded'],
            [429, googleError(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).'), 'rateLimit'],
            [503, googleError(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.'), 'serviceUnavailable'],
            [404, googleError(404, 'NOT_FOUND', 'models/synthetic-model is not found for API version v1beta, or is not supported for generateContent.'), undefined],
            [403, googleError(403, 'PERMISSION_DENIED', 'Permission denied.'), 'permissionError'],
        ];
        for (const [status, body, expected] of cases) {
            respondWith(status, body);
            const ai = new GoogleGenAI(appClientOptions(SYNTHETIC_KEY));
            const error = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: '합성 입력' }).then(() => null, e => e);
            assert.ok(error, `${status}: 오류로 던져져야 한다`);
            assert.equal(calls.length, 1, `${status}: 자동 재시도 없음(비용 보호)`);
            assert.equal(Number(error.status), status, `${status}: 상태가 남아야 한다`);
            assert.equal(/Non-retryable exception|Retryable HTTP Error/.test(String(error.message)), false, `${status}: 재시도 래퍼의 빈 메시지가 아니어야 한다`);
            if (expected) assert.equal(classifyAIFailoverReason(error), expected, `${status}: 분류`);
        }
    });

    await test('성공 응답은 그대로 읽힌다(요청 1번)', async () => {
        respondWith(200, JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '합성 응답' }] }, finishReason: 'STOP' }] }));
        const ai = new GoogleGenAI(appClientOptions(SYNTHETIC_KEY));
        const result = await ai.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: '합성 입력' });
        assert.equal(result.text, '합성 응답');
        assert.equal(calls.length, 1);
    });
} finally {
    globalThis.fetch = originalFetch;
}

console.log(`gemini sdk error tests passed (${passed}) — real SDK, mocked fetch, synthetic key, no network.`);
