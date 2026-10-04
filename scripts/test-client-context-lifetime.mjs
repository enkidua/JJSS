import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/hooks/useClientContext.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function createContextHook() {
    const slots = [], effects = [], requests = [], notices = [];
    let cursor = 0;
    const react = {
        useRef(value) { return slots[cursor++] ??= { current: value }; },
        useState(value) {
            const index = cursor++;
            slots[index] ??= { value };
            return [slots[index].value, next => { slots[index].value = next; }];
        },
        useCallback(fn, deps) {
            const index = cursor++, old = slots[index];
            if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return old.fn;
            slots[index] = { deps, fn }; return fn;
        },
        useEffect(fn, deps) {
            const index = cursor++, old = slots[index];
            if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return;
            effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
        },
    };
    const toast = (...args) => notices.push(args);
    const exports = {};
    vm.runInNewContext(code, { exports, require(name) {
        if (name === 'react') return react;
        if (name === '../components/Toast') return { useToast: () => ({ showToast: toast }) };
        if (name === '../utils/seeker') return { getSeekerKey: seeker => seeker?.id ?? '' };
        if (name === '../services/clientContextService') return {
            buildClientContextSummary: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
        };
        throw new Error(`Unexpected import ${name}`);
    } });
    return {
        requests, notices,
        render(id = 'A') {
            cursor = 0;
            const result = exports.useClientContext({ id }, []);
            for (const fn of effects.splice(0)) fn();
            return result;
        },
        unmount() { for (const slot of slots) slot?.cleanup?.(); },
    };
}
const result = { hasRecords: true, summary: 'synthetic context', recordCount: 1 };
for (const fails of [false, true]) {
    const hook = createContextHook();
    const loading = hook.render().load();
    hook.unmount();
    if (fails) hook.requests[0].reject(new Error('synthetic late failure'));
    else hook.requests[0].resolve(result);
    await loading;
    assert.equal(hook.notices.length, 0, 'an unmounted screen must not show late success/error notifications');
    assert.equal(hook.render().summary, '');
}
const switched = createContextHook();
const old = switched.render('A').load();
switched.render('B');
switched.requests[0].resolve(result);
await old;
assert.equal(switched.render('B').summary, '');
assert.equal(switched.notices.length, 0);
const fresh = switched.render('B').load();
switched.requests[1].resolve(result);
await fresh;
assert.equal(switched.render('B').summary, 'synthetic context');
assert.equal(switched.notices.length, 1);
switched.unmount();
console.log('PASS client context ignores late success/error after unmount or seeker switch; current request still succeeds');
