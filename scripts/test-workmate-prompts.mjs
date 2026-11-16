// 고용지원(WorkMate) 사례관리 프롬프트: "최근 사후관리 기록"이 실제로 가장 최근 기록인지 확인한다.
// 저장소 조회 결과는 최신순으로 오므로, 순서를 가정하고 끝에서 N건을 자르면 가장 오래된 기록이 "최근"으로 전달된다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const transpile = (text) => ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

// 이용자 맥락 붙이기는 이 시험의 대상이 아니므로 받은 프롬프트를 그대로 돌려주는 대역을 쓴다.
const contextStubUrl = toDataUrl('export const withClientContextPrompt = (prompt) => prompt;');
const orderUrl = toDataUrl(transpile(await readFile(new URL('../src/pages/workmate/documentOrder.ts', import.meta.url), 'utf8')));
const { sortFollowUpsOldestFirst, pickRecentFollowUps, selectJobAnalysisDocs, jobAnalysisDocLabel } = await import(orderUrl);
const source = await readFile(new URL('../src/pages/workmate/workmatePrompts.ts', import.meta.url), 'utf8');
const compiled = transpile(source)
    .replace(/from ['"]\.\.\/\.\.\/services\/clientContextService['"]/g, `from ${JSON.stringify(contextStubUrl)}`)
    .replace(/from ['"]\.\/documentOrder['"]/g, `from ${JSON.stringify(orderUrl)}`);
const { buildCounselingPrompt, buildEvaluationPrompt, buildCasePreviousRecords } = await import(toDataUrl(compiled));

const seeker = { id: 's1', name: '합성 이용자', age: 30, disabilityType: '지적', severity: '중증', desiredJob1: '포장', desiredJob2: '', desiredLocation: '서울', desiredSalary: '협의', notes: '' };
// 1회차가 가장 오래되고 12회차가 가장 최근이다. 한 자리 회차가 두 자리 회차 문자열에 걸리지 않도록 "#01#" 꼴로 적는다.
const tag = (n) => `#${String(n).padStart(2, '0')}#`;
const makeDocs = (count) => Array.from({ length: count }, (_, index) => ({
    id: `d${index + 1}`, seekerId: 's1', seekerName: seeker.name, tab: 'case', organization: '검증용',
    type: (index + 1) % 4 === 0 ? 'evaluation' : 'counseling',
    content: `사후관리 ${tag(index + 1)}`,
    createdAt: { seconds: 1_700_000_000 + index * 86_400 },
}));
const included = (prompt, count) => Array.from({ length: count }, (_, index) => index + 1).filter(n => prompt.includes(tag(n)));

const ascending = makeDocs(12);
const newestFirst = [...ascending].reverse();   // 저장소(fetchCaseDocuments)가 돌려주는 순서
const shuffled = [ascending[5], ascending[11], ascending[0], ascending[8], ascending[2], ascending[10], ascending[3], ascending[9], ascending[1], ascending[7], ascending[4], ascending[6]];

// ─── 정렬 도우미 ───
assert.deepEqual(sortFollowUpsOldestFirst(newestFirst).map(d => d.id), ascending.map(d => d.id));
assert.deepEqual(sortFollowUpsOldestFirst(shuffled).map(d => d.id), ascending.map(d => d.id));
assert.deepEqual(newestFirst.map(d => d.id)[0], 'd12', 'sorting must not change the array it was given');
assert.deepEqual(pickRecentFollowUps(newestFirst, 3).map(d => d.id), ['d10', 'd11', 'd12']);
assert.deepEqual(pickRecentFollowUps(newestFirst, 0), []);
assert.deepEqual(pickRecentFollowUps([], 3), []);
// 작성일 형식이 섞여 있어도(초 단위 객체·ISO 문자열·숫자) 같은 기준으로 비교한다.
const mixed = [
    { id: 'iso', createdAt: new Date(1_700_000_200 * 1000).toISOString() },
    { id: 'seconds', createdAt: { seconds: 1_700_000_100 } },
    { id: 'number', createdAt: 1_700_000_300 },
    { id: 'none' },
];
assert.deepEqual(sortFollowUpsOldestFirst(mixed).map(d => d.id), ['none', 'seconds', 'iso', 'number']);
// 작성일이 같으면 받은 순서를 유지한다.
const sameTime = [{ id: 'a', createdAt: { seconds: 5 } }, { id: 'b', createdAt: { seconds: 5 } }, { id: 'c', createdAt: { seconds: 1 } }];
assert.deepEqual(sortFollowUpsOldestFirst(sameTime).map(d => d.id), ['c', 'a', 'b']);
console.log('PASS follow-up history is sorted oldest → newest regardless of the order or timestamp format it arrives in');

// ─── 상담일지 프롬프트: 10건을 넘으면 최근 3건만 ───
for (const [label, history] of [['newest-first', newestFirst], ['ascending', ascending], ['shuffled', shuffled]]) {
    const prompt = buildCounselingPrompt({ seeker, planText: '계획', meetingText: '회의', history, counselInput: '오늘 상담', contextSummary: '' });
    assert.deepEqual(included(prompt, 12), [10, 11, 12], `counseling prompt (${label}) must carry the three most recent records`);
    assert.ok(prompt.includes('총 12건 중 최근 3건'));
    assert.ok(prompt.indexOf(tag(10)) < prompt.indexOf(tag(11)) && prompt.indexOf(tag(11)) < prompt.indexOf(tag(12)), 'records are listed oldest → newest');
    assert.ok(prompt.includes('이전 9건의 상담 기록이 더 있습니다'));
}
// 10건 이하면 전부 보낸다.
const five = makeDocs(5);
const fivePrompt = buildCounselingPrompt({ seeker, planText: '', meetingText: '', history: [...five].reverse(), counselInput: '', contextSummary: '' });
assert.deepEqual(included(fivePrompt, 5), [1, 2, 3, 4, 5]);
assert.ok(fivePrompt.indexOf(tag(1)) < fivePrompt.indexOf(tag(5)));
assert.ok(fivePrompt.includes('총 5건 중 최근 5건'));
const emptyPrompt = buildCounselingPrompt({ seeker, planText: '', meetingText: '', history: [], counselInput: '', contextSummary: '' });
assert.ok(!emptyPrompt.includes('이전 사후관리 기록'));
console.log('PASS counseling prompt sends the most recent follow-up records, not the oldest ones');

// ─── 정기평가 프롬프트: 최근 5건 ───
for (const [label, history] of [['newest-first', newestFirst], ['ascending', ascending], ['shuffled', shuffled]]) {
    const prompt = buildEvaluationPrompt({ seeker, planText: '계획', history, evalInput: '평가 메모', contextSummary: '' });
    assert.deepEqual(included(prompt, 12), [8, 9, 10, 11, 12], `evaluation prompt (${label}) must carry the five most recent records`);
    assert.ok(prompt.includes('최근 5건'));
    assert.ok(prompt.includes(`[정기평가 기록]\n사후관리 ${tag(12)}`), 'record type label follows the record');
}
const threePrompt = buildEvaluationPrompt({ seeker, planText: '', history: makeDocs(3).reverse(), evalInput: '', contextSummary: '' });
assert.deepEqual(included(threePrompt, 3), [1, 2, 3]);
assert.ok(threePrompt.includes('최근 3건'));
console.log('PASS evaluation prompt sends the five most recent follow-up records');

// ─── "현재 내용 기반 보완"에 함께 보내는 이전 기록 ───
for (const history of [newestFirst, ascending, shuffled]) {
    const records = buildCasePreviousRecords('counseling', '회의록 본문', '계획서 본문', history);
    assert.deepEqual(included(records, 12), [8, 9, 10, 11, 12]);
    assert.ok(records.includes('[사례회의록]\n회의록 본문') && records.includes('[직업재활계획서]\n계획서 본문'));
}
assert.ok(!buildCasePreviousRecords('meeting', '회의록 본문', '', []).includes('회의록 본문'), 'the document being refined is not sent as its own previous record');
console.log('PASS refine context sends the five most recent follow-up records');

// ─── 같은 화면에서 방금 저장한 기록을 끝에 붙여도 순서가 맞는다 ───
const loaded = sortFollowUpsOldestFirst(newestFirst);
const justSaved = { id: 'd13', type: 'counseling', content: `사후관리 ${tag(13)}`, createdAt: { seconds: 1_700_000_000 + 12 * 86_400 } };
const afterSave = [...loaded, justSaved];
assert.deepEqual(afterSave.map(d => d.id), sortFollowUpsOldestFirst([justSaved, ...newestFirst]).map(d => d.id), 'appending a new record gives the same order as reopening the seeker');
assert.deepEqual(included(buildCounselingPrompt({ seeker, planText: '', meetingText: '', history: afterSave, counselInput: '', contextSummary: '' }), 13), [11, 12, 13]);
console.log('PASS a record saved in the same session keeps the same order as after reopening');

// ─── 직무분석지 다시 열기: 고른 사업체의 저장 문서만, 최근에 저장한 것부터 ───
const at = (day) => ({ seconds: Math.floor(new Date(2026, 8, day, 12).getTime() / 1000) });
const analysisDocs = [
    { id: 'a1', type: 'job_analysis', jobId: 'job-a', companyName: '합성 사업체 A', jobRole: '포장', createdAt: at(1) },
    { id: 'a2', type: 'job_analysis', jobId: 'job-a', companyName: '합성 사업체 A', jobRole: '포장', createdAt: at(5) },
    { id: 'a3', type: 'job_analysis', jobId: 'job-a', companyName: '합성 사업체 A', jobRole: '포장', createdAt: at(2), updatedAt: at(9) },
    { id: 'b1', type: 'job_analysis', jobId: 'job-b', companyName: '합성 사업체 B', jobRole: '진열', createdAt: at(7) },
    { id: 'm1', type: 'job_analysis', jobId: '', companyName: '직접 입력 사업체', jobRole: '세척', createdAt: at(3) },
    { id: 'm2', type: 'job_analysis', companyName: '', jobRole: '', createdAt: at(8) },
    { id: 'x1', type: 'matching_opinion', jobId: 'job-a', companyName: '합성 사업체 A', jobRole: '포장', createdAt: at(10) },
    { type: 'job_analysis', jobId: 'job-a', companyName: '저장 전 문서', jobRole: '포장', createdAt: at(11) },
];
assert.deepEqual(selectJobAnalysisDocs(analysisDocs, 'job-a').map(d => d.id), ['a3', 'a2', 'a1'], 'latest saved (edited) document of the selected job comes first');
assert.deepEqual(selectJobAnalysisDocs(analysisDocs, 'job-b').map(d => d.id), ['b1']);
assert.deepEqual(selectJobAnalysisDocs(analysisDocs, 'job-none'), []);
assert.deepEqual(selectJobAnalysisDocs(analysisDocs, '').map(d => d.id), ['m2', 'm1'], 'documents saved without a registered job are reachable when no job is selected');
assert.deepEqual(analysisDocs.map(d => d.id)[0], 'a1', 'selection must not reorder the list it was given');
assert.equal(jobAnalysisDocLabel(analysisDocs[2]), '합성 사업체 A / 포장 · 2026-09-09 저장');
assert.equal(jobAnalysisDocLabel(analysisDocs[5]), '사업체 미지정 / 직무 미지정 · 2026-09-08 저장');
assert.equal(jobAnalysisDocLabel({ id: 'n', type: 'job_analysis', companyName: '합성', jobRole: '포장' }), '합성 / 포장');
console.log('PASS saved job analyses are picked per job (or per manual entry), newest first');
