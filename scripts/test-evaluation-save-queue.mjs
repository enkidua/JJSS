import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/pages/evaluation/useSaveQueue.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function createQueue(persist, onError) {
    const slots = [];
    let cursor = 0;
    const react = {
        useRef: initial => slots[cursor++] ??= { current: initial },
        useState: initial => {
            const index = cursor++;
            slots[index] ??= { current: initial };
            return [slots[index].current, value => { slots[index].current = value; }];
        },
        useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {},
    };
    const exports = {};
    vm.runInNewContext(code, { exports, setTimeout, clearTimeout, Error, require: name => {
        if (name === './EvaluationSaveStatus') return { useEvaluationSaveTracker: () => {} };
        assert.equal(name, 'react'); return react;
    } });
    return () => { cursor = 0; return exports.useSaveQueue(persist, onError); };
}
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

let fail = true;
const saved = [];
const render = createQueue(async value => {
    if (fail) throw new Error('synthetic write failure');
    saved.push(value);
}, () => { throw new Error('synthetic notification failure'); });
render().saveDebounced('latest draft', 100000);
assert.equal(await render().flush(), false, 'failed write must not authorize leaving/confirming');
assert.equal(render().saveState, 'ERROR');
assert.match(render().saveError, /synthetic write failure/);
fail = false;
assert.equal(await render().flush(), true, 'explicit retry must recover the last failed draft');
assert.deepEqual(saved, ['latest draft']);
assert.equal(render().saveState, 'SAVED');
console.log('PASS failed evaluation save returns false; draft retry survives notification error');

const oldGate = deferred();
const ordered = [];
const renderOrder = createQueue(async value => {
    ordered.push(value);
    if (value === 'old') await oldGate.promise;
});
renderOrder().save('old');
await settle();
renderOrder().saveDebounced('new', 100000);
oldGate.resolve();
await settle();
assert.equal(renderOrder().saveState, 'SAVING', 'old completion cannot mark a newer pending draft saved');
assert.equal(await renderOrder().flush(), true);
assert.deepEqual(ordered, ['old', 'new']);
console.log('PASS queued evaluation completion cannot clear newer pending state');

const firstGate = deferred();
const secondGate = deferred();
const renderFlush = createQueue(value => value === 'first' ? firstGate.promise : secondGate.promise);
renderFlush().save('first');
let flushed = false;
const flushing = renderFlush().flush().then(value => { flushed = true; return value; });
renderFlush().save('second');
firstGate.resolve();
await settle();
assert.equal(flushed, false, 'flush must wait for saves added during the first write');
secondGate.resolve();
assert.equal(await flushing, true);
console.log('PASS evaluation flush drains the latest queued write');
