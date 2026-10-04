import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/pages/training/useTrainingState.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
// Hooks share one transpiled module, just as separate visits share the browser module.
function createModule(db) {
    let active;
    let nextTimer = 0;
    const timers = new Map();
    const react = {
        useState(initial) {
            const host = active, index = host.cursor++;
            host.slots[index] ??= { value: initial };
            return [host.slots[index].value, value => {
                const slot = host.slots[index];
                slot.value = typeof value === 'function' ? value(slot.value) : value;
            }];
        },
        useRef(initial) {
            const host = active, index = host.cursor++;
            return host.slots[index] ??= { current: initial };
        },
        useCallback(fn) { return fn; },
        useEffect(fn, deps) {
            const host = active, index = host.cursor++;
            const old = host.slots[index];
            if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return;
            host.effects.push(() => {
                old?.cleanup?.();
                host.slots[index] = { deps, cleanup: fn() };
            });
        },
    };
    // Callback identity must follow dependencies so the mount effect is not rerun on every render.
    react.useCallback = (fn, deps) => {
        const host = active, index = host.cursor++;
        const old = host.slots[index];
        if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return old.fn;
        host.slots[index] = { deps, fn };
        return fn;
    };
    let queue = Promise.resolve();
    const writeQueue = {
        enqueueTrainingWrite(run) {
            const next = queue.then(run, run);
            queue = next.catch(() => undefined);
            return next;
        },
        waitForTrainingWrites: () => queue,
    };
    const exports = {};
    vm.runInNewContext(code, {
        exports, Date, console: { error() {} },
        window: {
            setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
            clearTimeout(id) { timers.delete(id); },
            addEventListener() {}, removeEventListener() {},
        },
        require(name) {
            if (name === 'react') return react;
            if (name === '../../config/localDB') return db;
            if (name === '../../utils/safeError') return { safeErrorMetadata: () => ({ code: 'synthetic' }) };
            if (name === '../../services/trainingNamesCache') return { setTrainingNamesFromState() {} };
            // 실제 trainingWriteQueue.ts와 같은 직렬 큐. 모듈 인스턴스마다 하나(화면 방문끼리 공유).
            if (name === './trainingWriteQueue') return writeQueue;
            if (name === './trainingModel') return {
                initialRooms: [], sanitizeTrainingRooms: value => value, sanitizeTrainingRecords: value => value,
            };
            throw new Error(`Unexpected import ${name}`);
        },
    });
    return () => {
        const host = { slots: [], effects: [], cursor: 0 };
        return {
            render() {
                active = host;
                host.cursor = 0;
                const result = exports.useTrainingState({ showToast() {}, defaultYear: '2026' });
                const effects = host.effects.splice(0);
                for (const effect of effects) effect();
                return result;
            },
            unmount() { for (const slot of host.slots) slot?.cleanup?.(); },
        };
    };
}

let stored = { id: 'work-training', rooms: [], manager: 'original' };
let reads = 0;
const gate = deferred();
let writing = false;
const writes = [];
const createVisit = createModule({
    async getById() { reads++; return structuredClone(stored); },
    async addDoc(_store, value) {
        writing = true;
        await gate.promise;
        stored = structuredClone(value);
        writes.push(stored.manager);
    },
    localTimestamp: () => ({ seconds: 1 }),
});
const old = createVisit();
old.render();
await settle();
old.render().setManager('latest draft');
old.render();
assert.equal(old.render().saveStatus, 'pending');
old.unmount();
const next = createVisit();
next.render();
await settle();
assert.equal(writing, true);
assert.equal(reads, 1, 'reentry must not read the old persisted record before the previous flush finishes');
gate.resolve();
await settle();
assert.equal(next.render().manager, 'latest draft');
assert.equal(reads, 2);
assert.deepEqual(writes, ['latest draft']);
next.unmount();
console.log('PASS training reentry waits for the previous instance flush and retains the latest draft');

const failureGate = deferred();
let fail = true;
const recovered = [];
const createFailureVisit = createModule({
    async getById() { return { id: 'work-training', rooms: [], manager: '' }; },
    async addDoc(_store, value) {
        await failureGate.promise;
        if (fail) throw new Error('synthetic save failure');
        recovered.push(value.manager);
    },
    localTimestamp: () => ({ seconds: 1 }),
});
const failure = createFailureVisit();
failure.render();
await settle();
failure.render().setManager('preserved draft');
failure.render();
const saving = failure.render().saveNow();
failureGate.resolve();
assert.equal(await saving, false);
assert.equal(failure.render().saveStatus, 'error');
assert.equal(failure.render().manager, 'preserved draft');
fail = false;
assert.equal(await failure.render().saveNow(), true);
assert.deepEqual(recovered, ['preserved draft']);
assert.equal(failure.render().saveStatus, 'saved');
failure.unmount();
console.log('PASS training save failure preserves the draft and explicit retry recovers');
