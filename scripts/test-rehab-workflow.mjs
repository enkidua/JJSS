import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const transpile = (text) => ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const dateSource = await readFile(new URL('../src/utils/date.ts', import.meta.url), 'utf8');
const dateUrl = toDataUrl(transpile(dateSource));
const source = await readFile(new URL('../src/config/rehabWorkflow.ts', import.meta.url), 'utf8');
const compiled = transpile(source).replace(/from ['"]\.\.\/utils\/date['"]/g, `from ${JSON.stringify(dateUrl)}`);
const workflowUrl = toDataUrl(compiled);
const { EMPTY_REHAB_WORKFLOW, parseRehabWorkflow, getTaskTiming, localDateKey, timestampDateKey, caseDocumentDate } = await import(workflowUrl);
const overviewSource = await readFile(new URL('../src/config/rehabOverview.ts', import.meta.url), 'utf8');
const overviewCompiled = transpile(overviewSource).replace(/from ['"]\.\/rehabWorkflow['"]/g, `from ${JSON.stringify(workflowUrl)}`);
const {
    getTrainingOverview, getDueFollowUps, getDueBoardSummary, deriveStage, getEvaluationSummary, getEmploymentSummary,
    getNextActions, buildTimeline, extractLatestDateKey, buildSituationSummaryPrompt,
    readSupportedEmploymentMeta, supportedEmploymentLabel, formatSupportedEmploymentLine, countActiveSupportedEmployment,
} = await import(toDataUrl(overviewCompiled));

assert.deepEqual(parseRehabWorkflow(JSON.stringify(EMPTY_REHAB_WORKFLOW)), EMPTY_REHAB_WORKFLOW);
assert.equal(parseRehabWorkflow('{bad json'), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ version: 2, tasks: [], goals: [] })), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ version: 1, tasks: [{ id: 'x', title: '일정', dueDate: 'wrong', done: false }], goals: [] })), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ version: 1, tasks: [{ id: 'x', title: '일정', dueDate: '2026-02-30', done: false }], goals: [] })), null);

const sample = { version: 1, tasks: [{ id: 't1', title: '후속 상담', dueDate: '2026-09-23', done: false }], goals: [
    { id: 'g1', title: '출근 준비', baseline: '도움 필요', target: '독립 수행', checkIns: [{ id: 'c1', date: '2026-09-23', note: '한 단계 진행' }] },
] };
assert.deepEqual(parseRehabWorkflow(JSON.stringify(sample)), { ...sample,
    employmentChecks: [], jobComparisons: [], participantPlan: EMPTY_REHAB_WORKFLOW.participantPlan });
const extended = { ...EMPTY_REHAB_WORKFLOW,
    employmentChecks: [{ id: 'e1', date: '2026-09-23', retention: '근무 유지', commute: '', adaptation: '', satisfaction: '만족', employerOpinion: '', supportAction: '', outcome: '', nextDate: '2026-09-30' }],
    jobComparisons: [{ id: 'j1', date: '2026-09-23', jobId: 'job-1', jobLabel: '합성 사업체',
        jobSnapshot: { role: '포장', hours: '오전', commute: '서울', environment: '실내', preferences: '협의' },
        supportNeeds: { role: '', hours: '', commute: '이동 지원', environment: '', preferences: '' }, adjustment: '담당자 확인' }],
    participantPlan: { ...EMPTY_REHAB_WORKFLOW.participantPlan, plainSummary: '쉬운 말 계획', reviewStatus: 'agreed', reviewedAt: '2026-09-23', reviewMethod: '대면' },
};
assert.deepEqual(parseRehabWorkflow(JSON.stringify(extended)), extended);
assert.equal(parseRehabWorkflow(JSON.stringify({ ...extended, participantPlan: { ...extended.participantPlan, reviewStatus: 'invented' } })), null);
assert.equal(getTaskTiming('2026-09-22', '2026-09-23'), 'overdue');
assert.equal(getTaskTiming('2026-09-23', '2026-09-23'), 'today');
assert.equal(getTaskTiming('2026-09-30', '2026-09-23'), 'upcoming');
assert.equal(getTaskTiming('2026-10-01', '2026-09-23'), 'later');
assert.equal(localDateKey(new Date(2026, 8, 23, 23, 59)), '2026-09-23');
const localSeconds = Math.floor(new Date(2026, 8, 23, 0, 30).getTime() / 1000);
assert.equal(timestampDateKey({ seconds: localSeconds }), '2026-09-23', 'seconds are read as local date');
assert.equal(timestampDateKey(new Date(2026, 8, 23, 8, 0).toISOString()), '2026-09-23', 'ISO string before 9 AM KST is still the local date');
assert.equal(timestampDateKey(undefined), '');
assert.equal(timestampDateKey('not a date'), '');
const laterSeconds = Math.floor(new Date(2026, 8, 25, 12, 0).getTime() / 1000);
assert.equal(caseDocumentDate({ createdAt: { seconds: localSeconds }, updatedAt: { seconds: laterSeconds } }), '2026-09-25');
assert.equal(caseDocumentDate({ createdAt: { seconds: localSeconds }, updatedAt: { seconds: laterSeconds } }, 'created'), '2026-09-23');
assert.equal(caseDocumentDate({ createdAt: { seconds: localSeconds } }), '2026-09-23');
assert.equal(caseDocumentDate({}), '');
const seeker = { id: 's1', seekerId: 'S-1', name: '합성 이용자' };
const training = getTrainingOverview(seeker, { rooms: [{ name: '훈련실', trainees: [{ id: 't1', seekerId: 's1' }] }],
    trainingRecords: { t1: { counselingHistory: ['합성 기록'], evaluation: '완료' } },
    attendanceBook: { '2026-09-23': { t1: '출석' } } });
assert.equal(training.room, '훈련실');
assert.equal(training.counselingCount, 1);
assert.equal(training.lastAttendanceStatus, '출석');
assert.equal(getTrainingOverview({ id: 's2', seekerId: 'S-2', name: seeker.name }, { rooms: [{ name: '훈련실', trainees: [{ id: 't1', seekerId: 's1' }] }] }), null, 'same name is not an identity match');
const docs = [{ type: 'workflow', seekerId: 's1', content: JSON.stringify({ ...extended, tasks: [
    { id: 'a', title: '후속 상담', dueDate: '2026-09-22', done: false, category: 'counseling' },
    { id: 'b', title: '완료', dueDate: '2026-09-23', done: true },
    { id: 'c', title: '나중', dueDate: '2026-10-23', done: false },
] }) }];
assert.deepEqual(getDueFollowUps(docs, [seeker], '2026-09-23').items.map(item => item.task.id), ['a']);
assert.equal(getDueFollowUps(docs, [seeker], '2026-09-23').unreadable, 0);
assert.deepEqual(getDueFollowUps(docs, [{ ...seeker, id: 'other', seekerId: 'other' }], '2026-09-23'), { items: [], unreadable: 0 });
const corruptDocs = [...docs, { type: 'workflow', seekerId: 's1', content: '{broken' }, { type: 'workflow', seekerId: 'deleted-seeker', content: '{broken' }];
const withCorrupt = getDueFollowUps(corruptDocs, [seeker], '2026-09-23');
assert.deepEqual(withCorrupt.items.map(item => item.task.id), ['a'], 'readable records are still listed');
assert.equal(withCorrupt.unreadable, 1, 'only unreadable records of registered seekers are counted');
console.log('PASS rehabilitation workflow legacy/extended parsing, dates, identity-safe training, due follow-ups and unreadable counts');

// ─── 현재 상황 정리 메모(situationNote): 없으면 기본값 없음, 있으면 그대로 유지, 형식이 틀리면 덮어쓰지 않도록 null ───
assert.equal(parseRehabWorkflow(JSON.stringify(EMPTY_REHAB_WORKFLOW)).situationNote, undefined, 'legacy record has no situation note');
assert.equal(EMPTY_REHAB_WORKFLOW.version, 1);
const withNote = { ...extended, situationNote: { text: '훈련 중이며 출석이 안정적입니다.', updatedAt: '2026-09-24T01:00:00.000Z' } };
assert.deepEqual(parseRehabWorkflow(JSON.stringify(withNote)), withNote);
assert.equal(parseRehabWorkflow(JSON.stringify({ ...extended, situationNote: { text: 3, updatedAt: '' } })), null);
assert.equal(parseRehabWorkflow(JSON.stringify({ ...extended, situationNote: null })), null);
console.log('PASS situation note is optional, preserved when present, and rejected when malformed');

// ─── 단계 판정(deriveStage): 뒤 단계 근거를 우선 ───
const emptyWorkflow = { employmentChecks: [], jobComparisons: [] };
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: null }), '평가');
assert.equal(deriveStage({ documents: [{ type: 'evaluation' }, { type: 'plan' }], workflow: emptyWorkflow, training: null }), '평가');
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: { room: '훈련실' } }), '훈련');
assert.equal(deriveStage({ documents: [{ type: 'matching_opinion' }], workflow: emptyWorkflow, training: { room: '훈련실' } }), '지원고용');
assert.equal(deriveStage({ documents: [{ type: 'employment_interview_note' }], workflow: emptyWorkflow, training: null }), '지원고용');
assert.equal(deriveStage({ documents: [], workflow: { ...emptyWorkflow, jobComparisons: [{}] }, training: null }), '지원고용');
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: null, supportedEmploymentActive: true }), '지원고용');
assert.equal(deriveStage({ seekerStatus: '취업', documents: [{ type: 'matching_opinion' }], workflow: emptyWorkflow, training: null }), '취업');
assert.equal(deriveStage({ seekerStatus: '구직중(취업 희망)', documents: [], workflow: emptyWorkflow, training: null }), '평가', 'job-seeking status is not employment');
assert.equal(deriveStage({ seekerStatus: '구직중', documents: [], workflow: { ...emptyWorkflow, employmentChecks: [{}] }, training: null }), '적응지원');
console.log('PASS deriveStage picks the latest stage with evidence (evaluation → training → supported employment → employment → adaptation)');

// ─── 요약 계산 ───
const secondsOf = (y, m, d) => ({ seconds: Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000) });
const caseDocs = [
    { id: 'd1', type: 'evaluation', content: '첫째 줄 소견\n\n둘째 줄 소견\n셋째 줄', createdAt: secondsOf(2026, 9, 20) },
    { id: 'd2', type: 'vocational_evaluation', title: '종합소견서', content: '오래된 소견', createdAt: secondsOf(2026, 8, 1) },
    { id: 'd3', type: 'matching_opinion', content: '매칭 의견', createdAt: secondsOf(2026, 9, 21) },
    { id: 'd4', type: 'employment_matching', content: '매칭 의견 2', createdAt: secondsOf(2026, 9, 22) },
    { id: 'd5', type: 'interview_note', content: '면접 기록', createdAt: secondsOf(2026, 9, 23) },
    { id: 'd6', type: 'plan', content: '계획서 본문', createdAt: secondsOf(2026, 9, 10) },
];
assert.deepEqual(getEvaluationSummary(caseDocs), { lastDate: '2026-09-20', documentCount: 2, lastOpinion: ['첫째 줄 소견', '둘째 줄 소견'] });
assert.deepEqual(getEvaluationSummary([]), { lastDate: '', documentCount: 0, lastOpinion: [] });
assert.deepEqual(getEmploymentSummary(caseDocs, withNote), { supportedEmployment: null, matchingCount: 2, interviewCount: 1, comparisonCount: 1, lastCheckDate: '2026-09-23', checkCount: 1 });
assert.equal(extractLatestDateKey('상담 2026.9.3 후 2026년 9월 18일 재상담, 잘못된 2026-13-40'), '2026-09-18');
assert.equal(extractLatestDateKey('날짜 없음'), '');

const trainingFull = getTrainingOverview(seeker, {
    rooms: [{ name: '사무훈련실', program: '사무보조', trainees: [{ id: 't1', seekerId: 'S-1' }] }],
    trainingRecords: { t1: { plan: '1단계 문서 정리\n2단계 전화 응대\n3단계', counselingHistory: ['2026-09-10 상담', '2026년 9월 17일 상담'], trainingPeriod: ' 2026.09~2026.12 ' } },
    attendanceBook: { '2026-09-21': { t1: '출석' }, '2026-09-22': { t1: '지각' }, '2026-09-23': { t1: '결석' }, '2026-09-24': { t1: '출석' }, '2026-09-25': { other: '출석' } },
});
assert.equal(trainingFull.room, '사무훈련실', 'seekerId (not only id) links the trainee');
assert.equal(trainingFull.attendanceRate, 75, 'attendance counts only recorded days (3 of 4 present/late)');
assert.equal(trainingFull.attendanceDays, 4);
assert.equal(trainingFull.trainingPeriod, '2026.09~2026.12');
assert.equal(trainingFull.lastCounselingDate, '2026-09-17');
assert.deepEqual(trainingFull.planSummary, ['1단계 문서 정리', '2단계 전화 응대']);
const noAttendance = getTrainingOverview(seeker, { rooms: [{ name: '훈련실', trainees: [{ id: 't9', seekerId: 's1' }] }] });
assert.equal(noAttendance.attendanceRate, null, 'no attendance records means no rate, not 0%');

const tasks = [
    { id: 'n1', title: '지난 일정', dueDate: '2026-09-20', done: false },
    { id: 'n2', title: '오늘 일정', dueDate: '2026-09-24', done: false },
    { id: 'n3', title: '완료 일정', dueDate: '2026-09-24', done: true },
    { id: 'n4', title: '다음 주 일정', dueDate: '2026-10-01', done: false },
    { id: 'n5', title: '먼 일정', dueDate: '2026-10-02', done: false },
];
assert.deepEqual(getNextActions(tasks, '2026-09-24').map(item => [item.task.id, item.timing]), [['n1', 'overdue'], ['n2', 'today'], ['n4', 'upcoming']]);

const boardSeekers = [seeker, { id: 's2', seekerId: 'S-2', name: '합성 이용자 둘' }, { id: 's3', seekerId: 'S-3', name: '합성 이용자 셋' }];
const boardDocs = [{ type: 'workflow', seekerId: 's1', content: JSON.stringify({ ...EMPTY_REHAB_WORKFLOW, tasks }) },
    { type: 'workflow', seekerId: 's3', content: '{broken' }];
assert.deepEqual(getDueBoardSummary(boardSeekers, boardDocs, {
    rooms: [{ name: 'A', trainees: [{ id: 'x', seekerId: 'S-2' }, { id: 'y' }] }, { name: 'B', trainees: [{ id: 'z', seekerId: 's1' }, { id: 'w', seekerId: 'deleted' }] }],
}, '2026-09-24'), { registered: 3, inTraining: 2, supportedEmployment: 0, dueThisWeek: 2 });
assert.deepEqual(getDueBoardSummary([], [], undefined, '2026-09-24'), { registered: 0, inTraining: 0, supportedEmployment: 0, dueThisWeek: 0 });

const timeline = buildTimeline([...caseDocs, { id: 'wf', type: 'workflow', content: '{}' }], withNote, trainingFull, seeker);
assert.equal(timeline.some(entry => entry.id === 'wf'), false, 'workflow record itself is not a timeline entry');
assert.deepEqual(timeline.map(entry => entry.date), [...timeline.map(entry => entry.date)].sort().reverse(), 'newest first');
assert.equal(timeline[0].id, 'd5');
assert.equal(timeline.find(entry => entry.id === 'd2').target.path, '/evaluation');
assert.deepEqual(timeline.find(entry => entry.id === 'd6').target, { path: '/workmate', state: { seekerId: 's1', seekerName: seeker.name, documentId: 'd6', tab: 'pipeline', step: 'plan' } });
assert.equal(timeline.find(entry => entry.kind === 'training_counseling' && entry.date === '2026-09-17').target.path, '/training');
assert.equal(timeline.find(entry => entry.kind === 'employment_check').target.state.tab, 'adaptation');
assert.equal(timeline.find(entry => entry.kind === 'job_comparison').target.state.tab, 'matching');

const prompt = buildSituationSummaryPrompt({ stage: '훈련', disabilityType: '지적장애', evaluation: getEvaluationSummary(caseDocs),
    training: trainingFull, employment: getEmploymentSummary(caseDocs, withNote), nextActions: getNextActions(tasks, '2026-09-24'), goals: sample.goals });
assert.equal(prompt.includes(seeker.name), false, 'summary prompt never includes the seeker name');
assert.match(prompt, /\[현재 단계\] 훈련/);
assert.match(prompt, /출석률 75%/);
console.log('PASS overview summaries: evaluation/employment/training cards, next actions, due-board tiles, timeline order and targets, name-free AI prompt');

// ─── 지원고용 회차(계획 D): 단계 판정·고용지원 카드·전체 요약·타임라인 ───
const activeOverview = { caseId: 'se1', round: 14, status: '진행중', fieldDoneDays: 12, fieldTotalDays: 15, plannedTotal: 1250100, completed: false, employed: false };
assert.equal(formatSupportedEmploymentLine(activeOverview), '지원고용 14차 · 진행중 · 현장 12/15일 · 예정 지급액 1,250,100원');
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: { room: '훈련실' }, supportedEmployment: activeOverview }), '지원고용', 'active case is the supported-employment stage');
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: null, supportedEmployment: { ...activeOverview, status: '취업', completed: true, employed: true } }), '취업', 'completed and employed case is the employment stage');
assert.equal(deriveStage({ documents: [], workflow: emptyWorkflow, training: { room: '훈련실' }, supportedEmployment: { ...activeOverview, status: '중단' } }), '훈련', 'stopped case does not count as active');
assert.equal(deriveStage({ documents: [], workflow: { ...emptyWorkflow, employmentChecks: [{}] }, training: null, supportedEmployment: { ...activeOverview, employed: true } }), '적응지원');
assert.equal(getEmploymentSummary([], EMPTY_REHAB_WORKFLOW, activeOverview).supportedEmployment, activeOverview);

const seContent = (round, status, extra = {}) => JSON.stringify({ version: 1, round, status, result: { completed: false, employed: false }, traineePayee: { account: '000-합성-계좌' }, ...extra });
assert.deepEqual(readSupportedEmploymentMeta(seContent(3, '진행중')), { round: 3, status: '진행중', completed: false, employed: false });
assert.deepEqual(readSupportedEmploymentMeta(seContent(4, '취업')), { round: 4, status: '취업', completed: true, employed: true });
assert.equal(readSupportedEmploymentMeta('{broken'), null);
assert.equal(readSupportedEmploymentMeta(JSON.stringify({ round: 1 })), null, 'version is required');
assert.equal(supportedEmploymentLabel({ content: seContent(3, '진행중') }), '지원고용 3차 결과보고');
assert.equal(supportedEmploymentLabel({ content: '{broken', title: '지원고용 7차' }), '지원고용 7차 결과보고');
const seDocs = [
    { id: 'se-a', type: 'supported_employment', seekerId: 's1', content: seContent(3, '진행중') },
    { id: 'se-b', type: 'supported_employment', seekerId: 's1', content: seContent(2, '진행중') },
    { id: 'se-c', type: 'supported_employment', seekerId: 's2', content: seContent(5, '수료') },
    { id: 'se-d', type: 'supported_employment', seekerId: 's3', content: seContent(6, '진행중') },
    { id: 'se-e', type: 'supported_employment', seekerId: 's3', content: '{broken' },
];
assert.equal(countActiveSupportedEmployment(seDocs), 2, 'active cases are counted per seeker');
assert.equal(getDueBoardSummary(boardSeekers, boardDocs, undefined, '2026-09-24', seDocs).supportedEmployment, 2);

const seTimeline = buildTimeline([{ ...seDocs[0], title: '지원고용 3차', createdAt: secondsOf(2026, 9, 24) }], EMPTY_REHAB_WORKFLOW, null, seeker);
assert.equal(seTimeline.length, 1);
assert.equal(seTimeline[0].kind, 'supported_employment');
assert.equal(seTimeline[0].label, '지원고용');
assert.equal(seTimeline[0].summary, '지원고용 3차 결과보고');
assert.equal(seTimeline[0].summary.includes('{'), false, 'raw JSON is never shown in the timeline');
assert.deepEqual(seTimeline[0].target, { path: '/workmate', state: { seekerId: 's1', seekerName: seeker.name, documentId: 'se-a', tab: 'supportedEmployment' } });
const sePrompt = buildSituationSummaryPrompt({ stage: '지원고용', evaluation: getEvaluationSummary([]), training: null,
    employment: getEmploymentSummary([], EMPTY_REHAB_WORKFLOW, activeOverview), nextActions: [], goals: [] });
assert.match(sePrompt, /\[지원고용\] 지원고용 14차 · 진행중/);
assert.equal(sePrompt.includes('합성-계좌'), false);
console.log('PASS supported employment: active/employed stage, card line, per-seeker active count, labelled timeline entry to the new tab');
