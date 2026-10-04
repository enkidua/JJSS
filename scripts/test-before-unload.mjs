import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/useBeforeUnloadGuard.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const bypassSource = await readFile(new URL('../src/hooks/unloadBypass.ts', import.meta.url), 'utf8');
const bypassExports = {};
vm.runInNewContext(ts.transpileModule(bypassSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: bypassExports });
const listeners = new Set();
let cleanup;
let previous;
const exports = {};
vm.runInNewContext(code, {
    exports,
    require(name) {
        if (name === './unloadBypass') return bypassExports;
        assert.equal(name, 'react');
        return { useEffect(fn, deps) {
            if (previous === deps[0]) return;
            previous = deps[0];
            cleanup?.();
            cleanup = fn();
        } };
    },
    window: {
        addEventListener(name, fn) { assert.equal(name, 'beforeunload'); listeners.add(fn); },
        removeEventListener(name, fn) { assert.equal(name, 'beforeunload'); listeners.delete(fn); },
    },
});
const render = exports.useBeforeUnloadGuard;
render(false);
assert.equal(listeners.size, 0);
render(true);
render(true);
assert.equal(listeners.size, 1);
let prevented = 0;
const event = { returnValue: undefined, preventDefault() { prevented++; } };
for (const fn of listeners) fn(event);
assert.equal(prevented, 1);
assert.equal(event.returnValue, '');
render(false);
assert.equal(listeners.size, 0, 'successful save must remove the close/reload guard');
render(true);
cleanup();
assert.equal(listeners.size, 0, 'unmount must not leak a guard into another page');
// 백업 복원 직후 다시 불러오기: 미저장 확인을 건너뛴다(남은 입력은 복원 전 상태이고 저장소는 봉인됨).
render(false);
render(true);
bypassExports.allowUnloadWithoutPrompt();
const bypassEvent = { returnValue: undefined, preventDefault() { prevented++; } };
const before = prevented;
for (const fn of listeners) fn(bypassEvent);
assert.equal(prevented, before, 'after a restore the reload must not be blocked by a dirty-form prompt');
assert.equal(bypassEvent.returnValue, undefined);
console.log('PASS beforeunload protection is dirty-only, clears after save, cleans up on unmount, and yields to the post-restore reload');
