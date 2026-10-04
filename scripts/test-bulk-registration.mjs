import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/utils/bulkRegistration.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { splitBulkRegistrationRows } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const rowA = ['', '', '합성 일괄 A', '', '', '', '', '', '', '', '', '', ''].join('\t');
const rowB = ['구직중', 'SYNTHETIC-B', '합성 일괄 B', '', '', '', '', '', '', '', '', '', ''].join('\t');
assert.equal(rowA.split('\t').length, 13);
assert.equal(rowA.trim().split('\t').length, 1, 'regression fixture reproduces lost leading/trailing columns with trim');
for (const eol of ['\n', '\r\n', '\r']) {
    const rows = splitBulkRegistrationRows(`${eol}${rowA}${eol}  ${eol}${rowB}${eol}`);
    assert.deepEqual(rows, [rowA, rowB]);
    assert.equal(rows[0].split('\t').length, 13);
    assert.equal(rows[1].split('\t').length, 13);
    const retryText = rows.slice(1).join('\n');
    assert.deepEqual(splitBulkRegistrationRows(retryText), [rowB]);
    assert.equal(splitBulkRegistrationRows(retryText)[0].split('\t').length, 13);
}
const jobRow = ['합성 사업체', '', '', '', '', '', '', '', ''].join('\t');
assert.equal(splitBulkRegistrationRows(jobRow)[0].split('\t').length, 9);
assert.deepEqual(splitBulkRegistrationRows(' \r\n\t\n'), []);
console.log('PASS bulk TSV retains leading/trailing empty columns, blank-row skipping, Windows line endings and retry rows');

// 원래 줄 번호·중복 건너뛰기(이미 등록된 항목, 붙여넣은 내용 안의 겹침)
{
    const { splitBulkRegistrationLines, bulkRegistrationKey, planBulkRegistration, formatLineList } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const lines = splitBulkRegistrationLines(`\n${rowA}\n\n${rowB}\n${rowB}`);
    assert.deepEqual(lines.map(row => row.line), [2, 4, 5], '빈 줄을 건너뛰어도 원래 줄 번호를 남긴다');
    const key = (name, seekerId) => bulkRegistrationKey('seeker', { name, seekerId });
    assert.equal(key(' 합성  일괄 B ', 'SYNTHETIC-B'), key('합성 일괄 B', 'synthetic-b'), '공백·대소문자 차이는 같은 사람');
    assert.notEqual(key('합성 일괄 B', 'SYNTHETIC-B'), key('합성 일괄 B', 'SYNTHETIC-C'), '관리번호가 다르면 다른 사람');
    assert.notEqual(bulkRegistrationKey('job', { companyName: '합성', jobRole: '포장' }), bulkRegistrationKey('job', { companyName: '합성', jobRole: '조립' }));
    const rows = [
        { line: 2, key: key('합성 일괄 A', '') },
        { line: 4, key: key('합성 일괄 B', 'SYNTHETIC-B') },
        { line: 5, key: key('합성 일괄 B', 'SYNTHETIC-B') },
        { line: 7, key: key('합성 일괄 C', '') },
    ];
    const plan = planBulkRegistration(rows, [key('합성 일괄 A', '')]);
    assert.deepEqual(plan.toSave.map(row => row.line), [4, 7]);
    assert.deepEqual(plan.existingLines, [2]);
    assert.deepEqual(plan.repeatedLines, [5]);
    assert.equal(formatLineList([3, 7]), '3, 7번째 줄');
    assert.equal(formatLineList([1, 2, 3, 4], 2), '1, 2번째 줄 외 2개');
    console.log('PASS bulk registration keeps original line numbers and skips existing/repeated rows');
}
