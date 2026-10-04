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
delete globalThis.__orderDB;
console.log('PASS continuously changing lists fail without overwriting current state or infinite retries');
