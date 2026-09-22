import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/config/rehabWorkflow.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { EMPTY_REHAB_WORKFLOW, parseRehabWorkflow, getTaskTiming, localDateKey } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

assert.deepEqual(parseRehabWorkflow(JSON.stringify(EMPTY_REHAB_WORKFLOW)), EMPTY_REHAB_WORKFLOW);
assert.equal(parseRehabWorkflow('{bad json'), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ version: 2, tasks: [], goals: [] })), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ version: 1, tasks: [{ id: 'x', title: '일정', dueDate: 'wrong', done: false }], goals: [] })), null);

const sample = { version: 1, tasks: [{ id: 't1', title: '후속 상담', dueDate: '2026-09-23', done: false }], goals: [
    { id: 'g1', title: '출근 준비', baseline: '도움 필요', target: '독립 수행', checkIns: [{ id: 'c1', date: '2026-09-23', note: '한 단계 진행' }] },
] };
assert.deepEqual(parseRehabWorkflow(JSON.stringify(sample)), sample);
assert.equal(getTaskTiming('2026-09-22', '2026-09-23'), 'overdue');
assert.equal(getTaskTiming('2026-09-23', '2026-09-23'), 'today');
assert.equal(getTaskTiming('2026-09-30', '2026-09-23'), 'upcoming');
assert.equal(getTaskTiming('2026-10-01', '2026-09-23'), 'later');
assert.equal(localDateKey(new Date(2026, 8, 23, 23, 59)), '2026-09-23');
console.log('PASS rehabilitation workflow parsing, history shape, and local due dates');
