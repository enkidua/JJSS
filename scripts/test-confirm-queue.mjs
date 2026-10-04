import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real provider with deferred state updates (React batching),
// including updater replay. No browser or actual user data is involved.
const slots = [];
const pending = [];
let cursor = 0;
const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useContext: () => null,
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => {
        const i = cursor++;
        slots[i] ??= initial;
        return [slots[i], update => pending.push(() => {
            const before = slots[i];
            update(before); // discarded replay, as permitted by React
            slots[i] = update(before);
        })];
    },
};
const jsx = (type, props, key) => ({ type, props, key });
const source = await readFile(new URL('../src/components/common/ConfirmProvider.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'lucide-react') return {};
    if (name.endsWith('useDialogFocus')) return {};
    throw new Error('Unexpected dependency: ' + name);
} });
const render = () => { cursor = 0; return exports.ConfirmProvider({ children: null }); };
const flush = () => { while (pending.length) pending.shift()(); };
const confirm = render().props.value;
let firstResult;
let secondResult;
const first = confirm('first').then(value => { firstResult = value; });
const second = confirm('second').then(value => { secondResult = value; });
flush();
assert.notEqual(slots[0][0].id, slots[0][1].id, 'Batched requests need distinct dialog IDs');
const firstDialog = render().props.children[1];
firstDialog.props.onSettle(true);
firstDialog.props.onSettle(false); // stale duplicate event
flush();
await first;
assert.equal(firstResult, true);
assert.equal(secondResult, undefined, 'Duplicate event must not settle the next request');
assert.equal(slots[0].length, 1);
render().props.children[1].props.onSettle(false);
flush();
await second;
assert.equal(secondResult, false);
assert.equal(slots[0].length, 0);
console.log('PASS confirmation queue batching, unique IDs, updater replay and duplicate events');
