// API 키 형식 판별·정리, 키 거부 안내문, 키 상태 기록(지문만 저장) 단위 테스트.
// 모든 키는 합성 값이며 네트워크를 쓰지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const urlFor = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const transpile = async relative => ts.transpileModule(await readFile(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 합성 localStorage(키 상태 저장 확인용)
const storage = new Map();
globalThis.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
};
const events = [];
globalThis.window = {
    dispatchEvent: event => { events.push(event); return true; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const formatUrl = urlFor(await transpile('../src/config/apiKeyFormat.ts'));
const format = await import(formatUrl);
const classificationUrl = urlFor(await transpile('../src/services/aiErrorClassification.ts'));
const statusUrl = urlFor((await transpile('../src/services/apiKeyStatus.ts'))
    .replace(/from ['"]zustand['"]/g, `from ${JSON.stringify(import.meta.resolve('zustand'))}`));
const status = await import(statusUrl);
const rejection = await import(urlFor((await transpile('../src/services/apiKeyRejection.ts'))
    .replace(/from ['"]\.\.\/config\/apiKeyFormat['"]/g, `from ${JSON.stringify(formatUrl)}`)
    .replace(/from ['"]\.\/aiErrorClassification['"]/g, `from ${JSON.stringify(classificationUrl)}`)
    .replace(/from ['"]\.\/apiKeyStatus['"]/g, `from ${JSON.stringify(statusUrl)}`)));

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const GOOGLE = `AIza${'Sy'}${'A'.repeat(33)}`; // 39자 합성 Google 키
const OPENAI = `sk-proj-${'b'.repeat(40)}`;
const OPENAI_LEGACY = `sk-${'c'.repeat(48)}`;
const ANTHROPIC = `sk-ant-api03-${'d'.repeat(40)}`;

await test('키 모양으로 제공업체를 알아본다(Claude 키를 OpenAI로 오인하지 않음)', () => {
    assert.equal(format.detectKeyFamily(GOOGLE), 'google');
    assert.equal(format.detectKeyFamily(OPENAI), 'openai');
    assert.equal(format.detectKeyFamily(OPENAI_LEGACY), 'openai');
    assert.equal(format.detectKeyFamily(ANTHROPIC), 'anthropic', 'sk-ant-는 OpenAI가 아니다');
    assert.equal(format.detectKeyFamily('abc'), null);
    assert.equal(format.detectKeyFamily(''), null);
    assert.equal(format.detectKeyFamily(GOOGLE.slice(0, 20)), null, '잘린 Google 키는 판별하지 않는다');
});

await test('칸과 다른 제공업체의 키를 넣으면 알맞은 칸을 알려 준다', () => {
    const geminiInOpenAI = format.checkKeyFormatForSlot('openai', GOOGLE);
    assert.equal(geminiInOpenAI.status, 'mismatch');
    assert.equal(geminiInOpenAI.suggestedSlot, 'gemini');
    assert.match(geminiInOpenAI.message, /Google\(Gemini·Vision\) 키 형식입니다\. OpenAI 칸에 넣으면 동작하지 않습니다/);
    assert.equal(format.checkKeyFormatForSlot('gemini', OPENAI).suggestedSlot, 'openai');
    assert.equal(format.checkKeyFormatForSlot('openai', ANTHROPIC).suggestedSlot, 'anthropic');
    assert.equal(format.checkKeyFormatForSlot('anthropic', OPENAI).suggestedSlot, 'openai');
    assert.equal(format.checkKeyFormatForSlot('vision', OPENAI).status, 'mismatch');
    // 맞는 칸
    assert.equal(format.checkKeyFormatForSlot('gemini', GOOGLE).status, 'ok');
    assert.equal(format.checkKeyFormatForSlot('vision', GOOGLE).status, 'ok', 'Vision도 Google 키');
    assert.equal(format.checkKeyFormatForSlot('openai', OPENAI).status, 'ok');
    assert.equal(format.checkKeyFormatForSlot('anthropic', ANTHROPIC).status, 'ok');
    // 형식을 알 수 없으면 막지 않고 안내만
    assert.equal(format.checkKeyFormatForSlot('openai', 'not-a-key').status, 'unknown');
    assert.equal(format.checkKeyFormatForSlot('openai', '   ').status, 'empty');
});

await test('붙여 넣을 때 딸려 온 공백·따옴표·접두어를 지우고 그 사실을 알린다', () => {
    assert.deepEqual(format.normalizeApiKeyInput(`  ${OPENAI}\n`), { value: OPENAI, notes: [] }, '앞뒤 공백은 조용히 지운다');
    const quoted = format.normalizeApiKeyInput(`"${OPENAI}",`);
    assert.equal(quoted.value, OPENAI);
    assert.match(quoted.notes.join(' '), /따옴표/);
    const bearer = format.normalizeApiKeyInput(`Authorization: Bearer ${OPENAI}`);
    assert.equal(bearer.value, OPENAI);
    assert.match(bearer.notes.join(' '), /Bearer/);
    const env = format.normalizeApiKeyInput(`OPENAI_API_KEY=${OPENAI}`);
    assert.equal(env.value, OPENAI);
    assert.match(env.notes.join(' '), /이름=값/);
    const header = format.normalizeApiKeyInput(`x-goog-api-key: ${GOOGLE}`);
    assert.equal(header.value, GOOGLE);
    const broken = format.normalizeApiKeyInput(`${GOOGLE.slice(0, 20)}\n${GOOGLE.slice(20)}`);
    assert.equal(broken.value, GOOGLE, '줄바꿈으로 갈라진 키를 이어 붙인다');
    assert.match(broken.notes.join(' '), /공백·줄바꿈/);
});

await test('실제 요청에서 키가 거부되면 칸·원인·다음 할 일을 알려 주고 상태를 "실패"로 남긴다(키 원문 저장 안 함)', async () => {
    const authError = Object.assign(new Error('Incorrect API key provided'), { status: 401 });
    const message = rejection.reportApiKeyRejection('openai', GOOGLE, authError);
    assert.match(message, /OpenAI 칸의 API 키가 거부되었습니다/);
    assert.match(message, /Google\(Gemini·Vision\) 키 형식/);
    assert.match(message, /Google Gemini 칸으로 옮기기/);
    assert.equal(events.length, 1, '안내창 이벤트');
    assert.equal(events[0].type, rejection.API_KEY_REJECTED_EVENT);
    assert.equal(events[0].detail.slot, 'openai');
    // 30초 안에 같은 칸이 또 실패하면 안내창은 한 번만
    rejection.reportApiKeyRejection('openai', GOOGLE, authError);
    assert.equal(events.length, 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    const record = status.useApiKeyStatusStore.getState().statuses.openai;
    assert.equal(record.state, 'failed');
    assert.equal(record.source, 'request');
    assert.equal(record.fingerprint, await status.fingerprintApiKey(GOOGLE));
    const stored = storage.get(status.API_KEY_STATUS_STORAGE_KEY);
    assert.ok(stored && !stored.includes(GOOGLE) && !stored.includes(GOOGLE.slice(4, 20)), '저장소에 키 원문이 없다');
    // 키가 바뀌면 그 기록은 더 이상 이 키의 상태가 아니다(미확인)
    assert.equal(status.statusForKey(status.useApiKeyStatusStore.getState().statuses, 'openai', await status.fingerprintApiKey(OPENAI)), null);
});

await test('키 거부가 아닌 오류(할당량·네트워크)는 키 실패로 기록하지 않는다', () => {
    const before = events.length;
    assert.equal(rejection.reportApiKeyRejection('anthropic', ANTHROPIC, Object.assign(new Error('rate'), { status: 429 })), null);
    assert.equal(rejection.reportApiKeyRejection('anthropic', ANTHROPIC, new Error('Failed to fetch')), null);
    assert.equal(events.length, before);
    assert.equal(status.useApiKeyStatusStore.getState().statuses.anthropic, undefined);
    // 올바른 형식의 키가 거부되면 만료·다른 계정 가능성을 안내한다
    const message = rejection.apiKeyRejectionMessage('anthropic', ANTHROPIC);
    assert.match(message, /만료·삭제되었거나 다른 계정의 키/);
});

await test('다른 제공업체 형식의 키는 그 칸에서 쓰지 않는다(전송 직전 차단, 전환 후보에서도 제외)', () => {
    assert.equal(format.isKeyUsableForSlot('openai', ANTHROPIC), false, 'OpenAI 칸의 Claude 키는 없는 것으로 본다');
    assert.equal(format.isKeyUsableForSlot('openai', OPENAI), true);
    assert.equal(format.isKeyUsableForSlot('gemini', OPENAI), false);
    assert.equal(format.isKeyUsableForSlot('vision', GOOGLE), true);
    assert.equal(format.isKeyUsableForSlot('anthropic', 'weird-key-shape-xyz'), true, '모르는 형식은 막지 않는다(저장·시도는 사용자 몫)');
    assert.equal(format.isKeyUsableForSlot('anthropic', ''), false);
    assert.throws(() => format.assertKeyUsableForSlot('openai', ANTHROPIC), error => error.code === 'API_KEY_SLOT_MISMATCH' && /Anthropic Claude 칸으로 옮겨/.test(error.message));
    assert.doesNotThrow(() => format.assertKeyUsableForSlot('anthropic', ANTHROPIC));
    assert.doesNotThrow(() => format.assertKeyUsableForSlot('gemini', 'weird-key-shape-xyz'));
});

console.log(`api key format tests passed (${passed}) — synthetic keys only, no network.`);
