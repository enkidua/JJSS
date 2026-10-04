// 설정 저장소(src/store/settingsStore.ts)를 합성 DB로 실행한다. 네트워크·실제 API 키·사용자 DB 접근 없음.
//  1) 저장된 설정을 읽지 못한 상태에서 무엇을 저장해도 저장된 API 키가 지워지지 않는다(저장 거부).
//  2) 다시 불러오기에 성공하면 정상 저장이 된다.
//  3) 키 입력 직후 모델을 바꾸는 등 연달아 바꿔도 두 변경이 모두 남는다(같은 옛 설정에서 출발하지 않는다).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const urlFor = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const transpile = async relative => ts.transpileModule(await readFile(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 합성 DB: 설정 문서 하나. 읽기 실패를 주입할 수 있다. 쓰기는 일부러 늦게 끝내 동시 변경을 겹치게 한다.
let stored = null;
let failReads = 0;
let writes = 0;
globalThis.__settingsDB = {
    getById: async (name, id) => {
        assert.equal(name, 'settings');
        assert.equal(id, 'app-settings');
        if (failReads > 0) { failReads -= 1; throw new Error('synthetic settings read failure'); }
        return stored ? structuredClone(stored) : undefined;
    },
    addDoc: async (name, value) => {
        assert.equal(name, 'settings');
        await new Promise(resolve => setTimeout(resolve, 15));
        writes += 1;
        stored = structuredClone(value);
        return structuredClone(value);
    },
};
// 합성 암호화: "enc:" 접두어만 붙인다(구조 확인용, 보안 아님).
const cryptoUrl = urlFor(`
    export async function encrypt(value) { return value ? 'enc:' + value : ''; }
    export async function decryptWithStatus(value) {
        if (!value) return { ok: true, value: '', needsReEncrypt: false };
        if (!String(value).startsWith('enc:')) return { ok: false, dataKeyUnavailable: false };
        return { ok: true, value: String(value).slice(4), needsReEncrypt: false };
    }
    export const isSecureStorageUnavailableError = () => false;
`);
const dbUrl = urlFor('export const getById = (...a) => globalThis.__settingsDB.getById(...a); export const addDoc = (...a) => globalThis.__settingsDB.addDoc(...a);');
const safeErrorUrl = urlFor('export const safeErrorMetadata = () => ({ code: "synthetic" });');

const resolveConfig = async name => urlFor(await transpile(`../src/config/${name}.ts`));
const aiModelsUrl = await resolveConfig('aiModels');
const aiReasoningSource = (await transpile('../src/config/aiReasoning.ts'))
    .replace(/from ['"]\.\/aiModels['"]/g, `from ${JSON.stringify(aiModelsUrl)}`);
const aiReasoningUrl = urlFor(aiReasoningSource);
const aiFailoverSource = (await transpile('../src/config/aiFailover.ts'))
    .replace(/from ['"]\.\/aiModels['"]/g, `from ${JSON.stringify(aiModelsUrl)}`)
    .replace(/from ['"]\.\/aiReasoning['"]/g, `from ${JSON.stringify(aiReasoningUrl)}`);
const aiFailoverUrl = urlFor(aiFailoverSource);

const compiled = (await transpile('../src/store/settingsStore.ts'))
    .replace(/from ['"]zustand['"]/g, `from ${JSON.stringify(import.meta.resolve('zustand'))}`)
    .replace(/from ['"]\.\.\/config\/localDB['"]/g, `from ${JSON.stringify(dbUrl)}`)
    .replace(/from ['"]\.\.\/config\/crypto['"]/g, `from ${JSON.stringify(cryptoUrl)}`)
    .replace(/from ['"]\.\.\/utils\/safeError['"]/g, `from ${JSON.stringify(safeErrorUrl)}`)
    .replace(/from ['"]\.\.\/config\/aiModels['"]/g, `from ${JSON.stringify(aiModelsUrl)}`)
    .replace(/from ['"]\.\.\/config\/aiFailover['"]/g, `from ${JSON.stringify(aiFailoverUrl)}`)
    .replace(/from ['"]\.\.\/config\/aiReasoning['"]/g, `from ${JSON.stringify(aiReasoningUrl)}`);
const remaining = [...compiled.matchAll(/from ['"](\.[^'"]+)['"]/g)].map(match => match[1]);
assert.deepEqual(remaining, [], `치환되지 않은 상대 import: ${remaining.join(', ')}`);
const { useSettingsStore: store, SETTINGS_LOAD_FAILED_SAVE_MESSAGE } = await import(urlFor(compiled));

// 저장된 설정(합성 키) 준비
const consoleError = console.error;
console.error = () => undefined;
try {
    const geminiConfig = { provider: 'gemini', label: 'Google Gemini', apiKey: '', apiKeyEncrypted: 'enc:AIza-synthetic-key', model: 'gemini-3-flash-preview' };
    stored = { id: 'app-settings', selectedProvider: 'gemini', llmConfigs: [geminiConfig], visionApiKey: '', visionApiKeyEncrypted: 'enc:vision-synthetic' };
    const original = structuredClone(stored);

    // 0) 읽기가 끝나기 전의 변경: 기본값 위에 저장하지 않고, 읽은 뒤의 설정 위에 반영한다.
    assert.equal(store.getState().loaded, false);
    await assert.rejects(store.getState().saveSettings(store.getState().settings), /불러오는 중/);
    assert.deepEqual(stored, original, '읽기 전 직접 저장은 거부되어 저장본이 그대로다');
    await store.getState().setSelectedProvider('gemini');
    assert.equal(stored.llmConfigs.find(c => c.provider === 'gemini').apiKeyEncrypted, 'enc:AIza-synthetic-key', '읽기 전 변경이 저장된 키를 지우지 않는다');
    assert.equal(stored.visionApiKeyEncrypted, 'enc:vision-synthetic');
    console.log('PASS 설정을 다 읽기 전의 변경은 읽은 뒤 반영되어 저장된 API 키가 지워지지 않는다');

    // 1) 읽기 실패 → 기본값으로 계속 쓰되 저장은 거부
    const beforeFailure = structuredClone(stored);
    failReads = 1;
    await store.getState().loadSettings();
    assert.equal(store.getState().loaded, true);
    assert.equal(store.getState().loadFailed, true, '읽기 실패를 표시한다');
    const writesBefore = writes;
    await assert.rejects(store.getState().setSelectedProvider('openai'), new RegExp(SETTINGS_LOAD_FAILED_SAVE_MESSAGE.slice(0, 20)));
    await assert.rejects(store.getState().updateModel('gemini', 'gemini-3-pro-preview'));
    await assert.rejects(store.getState().saveSettings(store.getState().settings));
    assert.equal(writes, writesBefore, '읽기 실패 상태에서는 설정 문서를 쓰지 않는다');
    assert.deepEqual(stored, beforeFailure, '저장된 API 키 암호문이 그대로 남는다');
    console.log('PASS 설정을 읽지 못한 상태에서는 어떤 변경도 저장하지 않아 저장된 API 키가 지워지지 않는다');

    // 2) 다시 불러오기에 성공하면 저장이 풀린다
    await store.getState().loadSettings();
    assert.equal(store.getState().loadFailed, false);
    assert.equal(store.getState().settings.llmConfigs.find(c => c.provider === 'gemini').apiKey, 'AIza-synthetic-key');
    console.log('PASS 다시 불러오면 읽기 실패 표시가 풀리고 저장된 키를 그대로 쓴다');

    // 3) 연달아 바꾸기: 키 입력 직후 모델 변경 — 둘 다 남아야 한다
    await Promise.all([
        store.getState().updateApiKey('gemini', 'AIza-new-synthetic-key'),
        store.getState().updateModel('gemini', 'gemini-3-pro-preview'),
        store.getState().setSelectedProvider('gemini'),
    ]);
    const gemini = store.getState().settings.llmConfigs.find(c => c.provider === 'gemini');
    assert.equal(gemini.apiKey, 'AIza-new-synthetic-key', '앞의 키 변경이 뒤의 모델 변경에 덮이지 않는다(메모리)');
    assert.equal(gemini.model, 'gemini-3-pro-preview');
    const storedGemini = stored.llmConfigs.find(c => c.provider === 'gemini');
    assert.equal(storedGemini.apiKeyEncrypted, 'enc:AIza-new-synthetic-key', '저장본에도 새 키가 남는다');
    assert.equal(storedGemini.model, 'gemini-3-pro-preview', '저장본에도 새 모델이 남는다');
    console.log('PASS 연달아 바꾼 설정(키·모델)이 서로를 덮지 않고 모두 저장된다');

    // 실패한 변경이 뒤의 변경을 막지 않는다
    const originalAdd = globalThis.__settingsDB.addDoc;
    globalThis.__settingsDB.addDoc = async () => { throw new Error('synthetic write failure'); };
    await assert.rejects(store.getState().updateModel('gemini', 'gemini-3-flash-preview'));
    globalThis.__settingsDB.addDoc = originalAdd;
    await store.getState().setSelectedProvider('gemini');
    assert.equal(stored.selectedProvider, 'gemini');
    console.log('PASS 실패한 설정 저장 뒤에도 다음 변경은 정상 저장된다');
} finally {
    console.error = consoleError;
}
