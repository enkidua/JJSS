// 실제 Zustand store를 지연된 합성 DB 응답으로 실행. 네트워크/이용자 DB 접근 없음.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const urlFor = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const records = new Map(['seekers', 'jobs', 'caseDocuments', 'expenses'].map(name => [name, []]));
let read = async name => structuredClone(records.get(name) || []);
let query = async (name, filter) => (await read(name)).filter(filter);
let sequence = 0;
globalThis.__orderDB = {
    getAll: name => read(name), query: (name, filter) => query(name, filter),
    getById: async (name, id) => (records.get(name) || []).find(item => item.id === id),
    localTimestamp: () => ({ seconds: 1 }),
    addDoc: async (name, value) => {
        const saved = { ...value, id: value.id || `order-${++sequence}` };
        records.set(name, [...(records.get(name) || []).filter(item => item.id !== saved.id), saved]);
        return structuredClone(saved);
    },
    updateDoc: async (name, id, patch) => records.set(name, records.get(name).map(item => item.id === id ? { ...item, ...patch } : item)),
    deleteDoc: async (name, id) => records.set(name, records.get(name).filter(item => item.id !== id)),
};
const dbUrl = urlFor('export const { getAll, getById, query, localTimestamp, addDoc, updateDoc, deleteDoc } = globalThis.__orderDB;');
const trainingNamesSource = ts.transpileModule(await readFile(new URL('../src/services/trainingNamesCache.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const trainingNamesUrl = urlFor(trainingNamesSource);
let compiled = ts.transpileModule(await readFile(new URL('../src/store/dataStore.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
compiled = compiled
    .replace(/from ['"]zustand['"]/g, `from ${JSON.stringify(import.meta.resolve('zustand'))}`)
    .replace(/from ['"]\.\.\/config\/localDB['"]/g, `from ${JSON.stringify(dbUrl)}`)
    .replace(/from ['"]\.\.\/utils\/safeError['"]/g, `from ${JSON.stringify(urlFor('export const safeErrorMetadata = () => ({ code: "synthetic" });'))}`)
    .replace(/from ['"]\.\.\/services\/trainingNamesCache['"]/g, `from ${JSON.stringify(trainingNamesUrl)}`)
    .replace(/from ['"]\.\.\/config\/crypto['"]/g, `from ${JSON.stringify(urlFor('export const isSecureStorageUnavailableError = () => false;'))}`);
const { useDataStore: store } = await import(urlFor(compiled));
const byId = values => [...values].sort((a, b) => a.id.localeCompare(b.id));

function defer() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function delayRead(name) {
    const gate = defer();
    const started = defer();
    const snapshot = structuredClone(records.get(name));
    let first = true;
    read = async requested => {
        if (requested === name && first) {
            first = false;
            started.resolve();
            await gate.promise;
            return snapshot;
        }
        return structuredClone(records.get(requested) || []);
    };
    return { gate, started };
}

records.set('expenses', [{ id: 'old-expense', amount: 1 }]);
store.setState({ expenses: structuredClone(records.get('expenses')) });
for (const operation of ['add', 'update', 'delete']) {
    const { gate, started } = delayRead('expenses');
    const loading = store.getState().fetchExpenses();
    await started.promise;
    if (operation === 'add') await store.getState().addExpense({ amount: 2 });
    if (operation === 'update') await store.getState().updateExpense('old-expense', { amount: 3 });
    if (operation === 'delete') await store.getState().deleteExpense('old-expense');
    gate.resolve();
    const result = await loading;
    assert.deepEqual(byId(result), byId(records.get('expenses')));
    assert.deepEqual(byId(store.getState().expenses), byId(records.get('expenses')));
}
console.log('PASS delayed expense list preserves successful add/update/delete');

records.set('seekers', [{ id: 'old-seeker', name: '합성 기존 이용자' }]);
store.setState({ seekers: structuredClone(records.get('seekers')) });
const delayedDirectory = delayRead('seekers');
const directoryLoading = store.getState().fetchData(true);
await delayedDirectory.started.promise;
await store.getState().addSeeker({ name: '합성 새 이용자' });
delayedDirectory.gate.resolve();
await directoryLoading;
assert.deepEqual(store.getState().seekers, records.get('seekers'));
console.log('PASS directory refresh cannot remove a newly registered seeker');

records.set('caseDocuments', [{ id: 'existing-doc', seekerId: 'a', content: '합성 기존 기록' }]);
const delayedDocuments = delayRead('caseDocuments');
const documentsLoading = store.getState().fetchCaseDocuments('a');
await delayedDocuments.started.promise;
await store.getState().addCaseDocument({ seekerId: 'a', type: 'counseling', content: '합성 새 기록', tab: 'case' });
delayedDocuments.gate.resolve();
assert.deepEqual(byId(await documentsLoading), byId(records.get('caseDocuments')));
assert.deepEqual(byId(store.getState().caseDocuments), byId(records.get('caseDocuments')));
console.log('PASS delayed case document list preserves a newly saved record');

const firstQuery = defer();
let queryCount = 0;
query = async (_name, filter) => {
    queryCount += 1;
    if (queryCount === 1) return firstQuery.promise;
    return [{ id: 'doc-b', seekerId: 'b', content: '합성 B' }].filter(filter);
};
const firstLoading = store.getState().fetchCaseDocuments('a');
await store.getState().fetchCaseDocuments('b');
firstQuery.resolve([{ id: 'doc-a', seekerId: 'a', content: '합성 A' }]);
assert.equal((await firstLoading)[0].id, 'doc-a', 'each caller retains its own result');
assert.equal(store.getState().caseDocuments[0].id, 'doc-b', 'late old selection cannot replace the shared list');
console.log('PASS case document queries completing out of order retain the latest selection');

let unstableReads = 0;
read = async name => {
    if (name !== 'expenses') return [];
    unstableReads += 1;
    const snapshot = structuredClone(records.get(name));
    await store.getState().addExpense({ amount: 10 });
    return snapshot;
};
await assert.rejects(store.getState().fetchExpenses(), /지출 내역/);
assert.equal(unstableReads, 3, 're-reading must be bounded');
assert.deepEqual(byId(store.getState().expenses), byId(records.get('expenses')));
console.log('PASS continuously changing lists fail without overwriting current state or infinite retries');

// 사례문서 식별자 보강: 지운 이용자의 남은 문서를 나중에 등록한 동명이인에게 붙이지 않는다(남의 기록이 섞이지 않게).
{
    read = async name => structuredClone(records.get(name) || []);
    query = async (name, filter) => (await read(name)).filter(filter);
    const deletedId = 'a'.repeat(32);                 // 이 앱이 만든 id 모양(이용자는 "문서는 남기기"로 삭제됨)
    const newcomerId = 'b'.repeat(32);
    records.set('seekers', [
        { id: newcomerId, name: '김합성', seekerId: 'N-1' },
        { id: 'c'.repeat(32), name: '이합성', seekerId: 'OLD-7' },
        { id: 'd'.repeat(32), name: '박합성', seekerId: '' },
    ]);
    records.set('jobs', []);
    records.set('caseDocuments', [
        { id: 'doc-deleted', seekerId: deletedId, seekerName: '김합성', content: '지운 이용자의 상담일지' },
        { id: 'doc-legacy-key', seekerId: 'OLD-7', seekerName: '이합성', content: '예전 관리번호로 연결된 문서' },
        { id: 'doc-legacy-name', seekerId: 'legacy-2024-003', seekerName: '박합성', content: '예전 식별자 + 이름' },
        { id: 'doc-name-only', seekerName: '박합성', content: '식별자 없이 이름만' },
        { id: 'doc-unknown', seekerId: 'legacy-x', seekerName: '없는사람', content: '맞는 이용자 없음' },
    ]);
    await store.getState().fetchData(true);
    const docs = Object.fromEntries(records.get('caseDocuments').map(doc => [doc.id, doc]));
    assert.equal(docs['doc-deleted'].seekerId, deletedId, '지운 이용자의 문서를 동명이인(새 이용자)에게 붙이지 않는다');
    assert.equal(docs['doc-legacy-key'].seekerId, 'c'.repeat(32), '관리번호로 찾은 문서는 이용자 id로 보강');
    assert.equal(docs['doc-legacy-name'].seekerId, 'd'.repeat(32), '예전 식별자는 이름이 하나뿐일 때 이어 준다');
    assert.equal(docs['doc-name-only'].seekerId, 'd'.repeat(32), '식별자 없는 문서는 이름으로 이어 준다');
    assert.equal(docs['doc-unknown'].seekerId, 'legacy-x');
    // 2,000명 × 20,000건에서도 색인으로 한 번에 끝난다(전에는 문서마다 이용자 전체를 훑었다).
    records.set('seekers', Array.from({ length: 2000 }, (_, i) => ({ id: i.toString(16).padStart(32, '0'), name: `합성${i}`, seekerId: `K-${i}` })));
    records.set('caseDocuments', Array.from({ length: 20000 }, (_, i) => ({ id: `bulk-${i}`, seekerId: (i % 2000).toString(16).padStart(32, '0'), content: 'x' })));
    const started = Date.now();
    await store.getState().fetchData(true);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1500, `색인 기반 보강은 빨라야 한다(${elapsed}ms)`);
    console.log(`PASS deleted seeker's documents are not re-linked to a later namesake; legacy keys still heal (${elapsed}ms for 2,000 × 20,000)`);
}
delete globalThis.__orderDB;
