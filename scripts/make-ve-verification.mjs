// 직업평가 워크벤치(평가 진행 탭)를 다른 AI가 검증할 수 있도록 자료를 만든다.
// 설명만 적지 않고 **실제 코드를 실행해 나온 산출물**을 넣는다.
// 모든 이름·연락처·생년월일은 합성 값이며 실존 인물이 아니다.
// 사용: node scripts/make-ve-verification.mjs  → release/ve-verification-<버전>/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const outRoot = path.join(root, 'release', `ve-verification-${pkg.version}`);
const featureDir = path.join(root, 'src', 'features', 'vocationalEvaluation');
const pageDir = path.join(root, 'src', 'pages', 'evaluation');
const cacheDir = path.join(root, 'node_modules', '.cache', 'make-ve-verification');

// localDB(IndexedDB)·AI 서비스를 쓰는 파일은 Node에서 실행할 수 없어 제외한다.
const SKIP = new Set(['storage.ts', 'index.ts', 'sourceDocument/extraction.ts', 'interpretation/request.ts']);

async function collect(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collect(full)));
        else if (entry.name.endsWith('.ts') && !SKIP.has(path.relative(featureDir, full).split(path.sep).join('/'))) {
            files.push(full);
        }
    }
    return files;
}

async function transpile(sourcePath) {
    const relative = path.relative(path.join(root, 'src'), sourcePath);
    const target = path.join(cacheDir, relative).replace(/\.ts$/, '.mjs');
    const output = ts
        .transpileModule(await readFile(sourcePath, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
            fileName: sourcePath,
        })
        .outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, 'utf8');
}

await rm(cacheDir, { recursive: true, force: true });
for (const file of [...(await collect(featureDir)), path.join(root, 'src', 'features', 'docx', 'blocks.ts')]) {
    await transpile(file);
}

const load = relative => import(pathToFileURL(path.join(cacheDir, 'features', 'vocationalEvaluation', relative)).href);
const session = await load('session.mjs');
const events = await load('events.mjs');
const bimanual = await load('bimanual.mjs');
const dominantHand = await load('dominantHand.mjs');
const episodeModel = await load('model/episode.mjs');
const handFunction = await load('tests/keadHandFunction.mjs');
const keadBimanual = await load('tests/keadBimanual.mjs');
const extractionSchema = await load('sourceDocument/schema.mjs');
const sourcePrompt = await load('sourceDocument/prompt.mjs');
const review = await load('sourceDocument/review.mjs');
const facts = await load('sourceDocument/facts.mjs');
const rebuild = await load('sourceDocument/rebuild.mjs');
const sourceRecord = await load('sourceDocument/record.mjs');
const contextModule = await load('interpretation/context.mjs');
const evidenceModule = await load('interpretation/evidence.mjs');
const interpretationPrompt = await load('interpretation/prompt.mjs');
const claimQuality = await load('interpretation/claimQuality.mjs');
const runModule = await load('interpretation/run.mjs');
const reportModel = await load('report/model.mjs');
const reportCompose = await load('report/compose.mjs');
const reportDocument = await load('report/document.mjs');
const blocks = await import(pathToFileURL(path.join(cacheDir, 'features', 'docx', 'blocks.mjs')).href);

/* ── 합성 자료 (모두 가상) ────────────────────────────────────── */

// 이 값들은 "AI로 나가면 안 되는 것"을 확인하는 표식이다.
const PERSONAL_TOKENS = {
    seekerName: '검증가상이름',
    evaluator: '검증가상평가사',
    organization: '검증가상복지관',
    contact: '010-0000-0000',
    birthDate: '1999-01-01',
    trialMemo: '검증메모_시행중특이사항',
    sessionMemo: '검증메모_검사환경',
    fileName: '검증가상이름_손기능결과지.pdf',
};

const NOW = '2026-09-25T01:00:00.000Z';
const later = step => new Date(Date.parse(NOW) + step * 1000).toISOString();

let episode = {
    ...episodeModel.createEpisode({
        seekerId: 'verify-seeker',
        seekerName: PERSONAL_TOKENS.seekerName,
        evaluationDate: '2026-09-25',
        evaluationOrganization: PERSONAL_TOKENS.organization,
    }),
    evaluator: PERSONAL_TOKENS.evaluator,
    purpose: '직업적 강점과 고려사항을 확인하기 위해 의뢰됨.',
    needs: { ...episodeModel.createEpisode({ seekerId: 'x', seekerName: 'x', evaluationDate: '' }).needs, aptitude: true, behavior: true },
    dominantHandAssessment: { questions: { writing: 'RIGHT', throwing: 'RIGHT', chopsticks: 'RIGHT' }, form: {}, note: '' },
};
episode = episodeModel.normalizeEpisode(episode);
assert.equal(episode.dominantHand, 'RIGHT', '질문 3문항이 모두 오른손이면 우세손은 오른손이어야 한다');

/* 손기능: 21시행 중 일부는 2·3차 미실시로 둔다. */
const HAND_SCORES = {
    'SMALL.DOMINANT': 12,
    'SMALL.NON_DOMINANT': 10,
    'SMALL.BILATERAL': 9,
    'MEDIUM.DOMINANT': 14,
    'MEDIUM.NON_DOMINANT': 13,
    'LARGE.DOMINANT': 16,
    'LARGE.NON_DOMINANT': 15,
};

let hand = session.createTestSession({
    episodeId: episode.id,
    seekerId: episode.seekerId,
    seekerName: episode.seekerName,
    testPluginId: handFunction.HAND_FUNCTION_TEST_ID,
    now: NOW,
});

let clock = 0;
for (const trial of hand.trials) {
    const base = HAND_SCORES[`${trial.size}.${trial.handMode}`];
    // 소형핀 양손 조건은 2·3차를 미실시로 남겨 "n회 실시 평균" 표기를 확인할 수 있게 한다.
    const skip = trial.size === 'SMALL' && trial.handMode === 'BILATERAL' && trial.trialNumber > 1;
    hand = session.goToTrial(hand, trial.id, later(clock));
    if (skip) {
        hand = session.skipTrial(hand, '피로 호소로 미실시', later(clock + 1), trial.id);
        clock += 5;
        continue;
    }
    hand = session.changeTrialState(hand, 'RUNNING', later(clock), 30_000);
    if (trial.sequence === 1) {
        hand = events.recordEvent(hand, 'DROPPED_PIN', later(clock + 5), 5);
        hand = events.recordEvent(hand, 'DROPPED_PIN', later(clock + 9), 9);
        hand = events.recordEvent(hand, 'REPEATED_INSTRUCTION', later(clock + 12), 12);
        hand = session.setTrialMemo(hand, PERSONAL_TOKENS.trialMemo, later(clock + 13), trial.id);
    }
    hand = session.changeTrialState(hand, 'FINISHED', later(clock + 30), 0);
    hand = session.setScore(hand, base + (trial.trialNumber - 2), later(clock + 31), trial.id);
    hand = session.confirmCurrentTrial(hand, later(clock + 32));
    clock += 40;
}

hand = { ...hand, sessionNote: PERSONAL_TOKENS.sessionMemo };
hand = session.upsertObservation(
    hand,
    {
        id: 'obs-dropped',
        testSessionId: hand.id,
        definitionId: 'hand.dropped_pin',
        label: '핀 떨어뜨림',
        state: 'OBSERVED',
        detail: { frequency: 'TWO_TO_THREE', impact: 'SLOWER' },
        evidenceEventIds: hand.events.filter(e => e.eventType === 'DROPPED_PIN').map(e => e.id),
        candidateDecision: 'APPLIED',
        createdAt: NOW,
        updatedAt: NOW,
    },
    later(900),
);
hand = session.upsertObservation(
    hand,
    {
        id: 'obs-instruction',
        testSessionId: hand.id,
        definitionId: 'common.instruction',
        label: '지시 이해',
        state: 'OBSERVED',
        detail: { frequency: 'ONCE', assistance: 'VERBAL_PROMPT', recovery: 'AFTER_PROMPT' },
        createdAt: NOW,
        updatedAt: NOW,
    },
    later(901),
);
hand = session.upsertObservation(
    hand,
    { id: 'obs-attention', testSessionId: hand.id, definitionId: 'common.attention', label: '주의집중', state: 'NOT_ASSESSED', createdAt: NOW, updatedAt: NOW },
    later(902),
);
hand = session.upsertCondition(
    hand,
    {
        id: 'cond-instruction',
        testSessionId: hand.id,
        conditionType: 'ADDITIONAL_INSTRUCTION',
        label: '추가 설명',
        state: 'OBSERVED',
        createdAt: NOW,
        updatedAt: NOW,
    },
    later(903),
);
assert.deepEqual(session.validateSession(hand), [], '합성 손기능 세션은 확정 가능한 상태여야 한다');
hand = session.confirmSession(hand, later(1000), PERSONAL_TOKENS.evaluator);

const handSummaries = session.conditionSummaries(hand);
const bilateral = handSummaries.find(item => item.key === 'SMALL.BILATERAL');
assert.equal(bilateral.executedCount, 1, '양손 조건은 1회만 실시한 상태여야 한다');

/* 다차원: 1분 30초 1회, 부품 7종 */
let bi = session.createTestSession({
    episodeId: episode.id,
    seekerId: episode.seekerId,
    seekerName: episode.seekerName,
    testPluginId: keadBimanual.BIMANUAL_TEST_ID,
    now: NOW,
});
bi = bimanual.changeBimanualState(bi, 'RUNNING', NOW, 90_000);
bi = events.recordEvent(bi, 'ONE_HAND_DOMINANT', later(20), 20);
bi = bimanual.changeBimanualState(bi, 'FINISHED', later(90), 0);
for (const [key, value] of Object.entries({ cylinder: 4, largeBolt: 3, largeNut: 3, smallBolt: 2, smallNut: 2, plate: 1, fixingPin: 2 })) {
    bi = bimanual.setComponentCount(bi, key, value);
}
assert.equal(bimanual.totalCompleted(bi.bimanual.attempt.result), 17);
assert.equal(bimanual.totalMaximum(bi.bimanual.specification), 25, '실시요강 분모 합계는 25여야 한다');
bi = session.confirmSession(bi, later(1200), PERSONAL_TOKENS.evaluator);

/* ── 공식 결과지(합성): 한 값은 일부러 앱 기록과 다르게 둔다 ── */

const scalar = (value, rawText = null, label = null) => ({ value, rawText, pageNumber: 1, sourceLabel: label });
const conditionOf = (size, handMode, offset = 0) => {
    const base = HAND_SCORES[`${size}.${handMode}`];
    const values = [base - 1 + offset, base, base + 1];
    const executed = size === 'SMALL' && handMode === 'BILATERAL' ? [values[0]] : values;
    const average = Math.round((executed.reduce((a, b) => a + b, 0) / executed.length) * 10) / 10;
    return {
        trial1: scalar(values[0]),
        trial2: scalar(size === 'SMALL' && handMode === 'BILATERAL' ? null : values[1]),
        trial3: scalar(size === 'SMALL' && handMode === 'BILATERAL' ? null : values[2]),
        reportedAverage: scalar(average),
    };
};

const officialExtraction = extractionSchema.normalizeExtraction(
    {
        documentType: 'KEAD_HAND_FUNCTION',
        detectedTitle: '손기능 작업표본검사 개인프로파일',
        participant: { sex: '남', birthDate: PERSONAL_TOKENS.birthDate, disabilityType: '지적장애', dominantHand: 'RIGHT' },
        test: { testDate: '2026-09-25', evaluator: PERSONAL_TOKENS.evaluator },
        trials: {
            // 소형핀 우세손 1회만 앱 기록(11)과 다른 값(13)으로 두어 충돌 처리를 보여 준다.
            SMALL: { DOMINANT: { ...conditionOf('SMALL', 'DOMINANT'), trial1: scalar(13) }, NON_DOMINANT: conditionOf('SMALL', 'NON_DOMINANT'), BILATERAL: conditionOf('SMALL', 'BILATERAL') },
            MEDIUM: { DOMINANT: conditionOf('MEDIUM', 'DOMINANT'), NON_DOMINANT: conditionOf('MEDIUM', 'NON_DOMINANT') },
            LARGE: { DOMINANT: conditionOf('LARGE', 'DOMINANT'), NON_DOMINANT: conditionOf('LARGE', 'NON_DOMINANT') },
        },
        norms: [
            { path: 'nondisabled.total', sourceLabel: '비장애인 전체 대비', sourceValue: scalar(14.6) },
            { path: 'nondisabled.male', sourceLabel: '비장애인 남성 대비', sourceValue: scalar(15.1) },
            { path: 'disability.total', sourceLabel: '지적장애 전체 대비', sourceValue: scalar(62.4) },
        ],
        reportedSummary: '결과지에 인쇄된 종합 문장(합성).',
    },
    'gemini-verification',
);

let record = sourceRecord.createSourceDocument({
    episodeId: episode.id,
    seekerId: episode.seekerId,
    seekerName: episode.seekerName,
    sessionId: hand.id,
    fileName: PERSONAL_TOKENS.fileName,
    fileSize: 182_311,
    sha256: 'synthetic-sha256-not-a-real-file',
    pageCount: 2,
});
const reviewFields = review.flattenExtraction(officialExtraction, hand);
const reviewIssues = review.validateExtraction(officialExtraction, {
    documentId: record.id,
    session: hand,
    dominantHand: episode.dominantHand,
});
let built = rebuild.rebuildFactsAndResolutions({
    fields: reviewFields,
    session: hand,
    documentId: record.id,
    now: NOW,
    previousFacts: [],
    previousResolutions: [],
});
record = {
    ...record,
    documentType: 'KEAD_HAND_FUNCTION',
    extractionStatus: 'SUCCEEDED',
    model: 'gemini-verification',
    extractedAt: NOW,
    detectedTitle: officialExtraction.detectedTitle,
    reportedSummary: officialExtraction.reportedSummary,
    extraction: officialExtraction,
    reviewFields,
    issues: reviewIssues,
    facts: built.facts,
    resolutions: built.resolutions,
};

const conflictsBefore = facts.conflictPaths(record.resolutions);
assert.ok(conflictsBefore.includes('trials.SMALL.DOMINANT.1'), '일부러 만든 값 차이는 충돌로 남아야 한다');
assert.equal(
    facts.resolveCanonicalFacts(record.facts, record.resolutions).some(item => item.path === 'trials.SMALL.DOMINANT.1'),
    false,
    '고르기 전에는 충돌 값이 확정값에 들어가면 안 된다',
);

// 평가사가 결과지 값을 선택한 상태
const conflict = record.resolutions.find(item => item.path === 'trials.SMALL.DOMINANT.1');
const pdfFactId = conflict.candidateFactIds.find(id => record.facts.find(fact => fact.id === id).origin === 'OFFICIAL_PDF');
record = {
    ...record,
    resolutions: record.resolutions.map(item =>
        item.path === conflict.path ? facts.resolveFactConflict(item, pdfFactId, PERSONAL_TOKENS.evaluator, later(1300)) : item,
    ),
    confirmedAt: later(1300),
    confirmedBy: PERSONAL_TOKENS.evaluator,
};
const canonical = facts.resolveCanonicalFacts(record.facts, record.resolutions);
const picked = canonical.find(item => item.path === 'trials.SMALL.DOMINANT.1');
assert.equal(picked.selectedFact.origin, 'OFFICIAL_PDF');
assert.equal(picked.selectedFact.value, 13);

/* ── AI로 나가는 본문 ────────────────────────────────────────── */

const context = contextModule.buildInterpretationContext({ session: hand, document: record, now: NOW });
const snapshot = await evidenceModule.buildEvidenceSnapshot({
    testPluginId: hand.testPluginId,
    canonicalFacts: context.canonicalFacts,
    conflictPaths: context.conflictPaths,
    session: hand,
    hasOfficialDocument: context.hasOfficialDocument,
});
const outboundInterpretation = interpretationPrompt.buildInterpretationPrompt(snapshot.package);
const outboundExtraction = sourcePrompt.SOURCE_DOCUMENT_PROMPT;

// 개인정보 표식이 본문에 없는지 확인한다. 하나라도 있으면 여기서 실패한다.
const privacyRows = [];
for (const [key, token] of Object.entries(PERSONAL_TOKENS)) {
    const inExtraction = outboundExtraction.includes(token);
    const inInterpretation = outboundInterpretation.includes(token);
    privacyRows.push({ key, token, inExtraction, inInterpretation });
    assert.equal(inExtraction, false, `결과지 읽기 본문에 ${key}가 들어갔다`);
    assert.equal(inInterpretation, false, `해석 요청 본문에 ${key}가 들어갔다`);
}
// 근거 ID는 사람을 가리키지 않는 값이어야 한다.
assert.ok(snapshot.package.verifiedFacts.every(fact => /^fact_\d+$/.test(fact.id)));

/* ── 품질 검사 케이스 ────────────────────────────────────────── */

const qualityCases = [
    { label: '근거에 없는 ID 인용', claimType: 'RESULT_DESCRIPTION', text: '수행량이 확인되었다.', evidenceIds: ['없는근거'], expect: 'INVALID' },
    { label: '취업 가능 단정', claimType: 'RESULT_DESCRIPTION', text: '이 대상자는 조립원 취업이 가능하다.', evidenceIds: ['fact_0'], expect: 'INVALID' },
    { label: '직무 적합 단정', claimType: 'VOCATIONAL_CONSIDERATION', text: '포장직에 적합하다.', evidenceIds: ['pattern:hand:SMALL'], expect: 'INVALID' },
    { label: '백분위 생성', claimType: 'RESULT_DESCRIPTION', text: '상위 26% 수준으로 해석된다.', evidenceIds: ['fact_0'], expect: 'INVALID' },
    { label: '근거에 없는 수치', claimType: 'RESULT_DESCRIPTION', text: '수행량은 999개로 나타났다.', evidenceIds: ['fact_0'], expect: 'INVALID' },
    { label: '관찰 근거 없는 행동 서술', claimType: 'RESULT_DESCRIPTION', text: '피로가 관찰되었다.', evidenceIds: ['fact_0'], expect: 'INVALID' },
    { label: '지원 필요 단정', claimType: 'SUPPORT_NEED', text: '지원이 필요하다.', evidenceIds: ['fact_0'], expect: 'INVALID' },
    { label: '검사조건으로 능력 추론', claimType: 'LIMITATION', text: '추가 설명이 필요했으므로 지시 이해 능력이 낮다.', evidenceIds: ['condition_0'], expect: 'INVALID' },
    { label: '미평가를 문제없음으로 확대', claimType: 'RESULT_DESCRIPTION', text: '주의집중에 문제가 없다.', evidenceIds: ['observation_2', 'fact_0'], expect: 'INVALID' },
    { label: '인과관계 표현', claimType: 'RESULT_DESCRIPTION', text: '핀 떨어뜨림 때문에 수행량이 줄었다.', evidenceIds: ['event_DROPPED_PIN', 'fact_0'], expect: 'REVIEW_REQUIRED' },
    { label: '측정값 그대로 서술', claimType: 'RESULT_DESCRIPTION', text: null, evidenceIds: null, expect: 'VALID' },
    { label: '비교 패턴 기반 추가 확인', claimType: 'SUPPORT_NEED', text: '수행 안정성을 추가 확인할 필요가 있다.', evidenceIds: null, expect: 'VALID' },
];

// 실제 근거 패키지의 ID로 맞춘다(합성 패키지가 아니라 위에서 만든 진짜 산출물을 쓴다).
const firstFact =
    // 규준값이 아니라 실제 수행량 항목을 예시로 쓴다(설명에 경로가 들어간 것이 측정값이다).
    snapshot.package.verifiedFacts.find(item => typeof item.description === 'string' && item.description.startsWith('trials.')) ??
    snapshot.package.verifiedFacts[0];
const firstPattern = snapshot.package.derivedFacts.find(item => item.semanticType === 'TRIAL_VARIABILITY') ?? snapshot.package.derivedFacts[0];
const notAssessed = snapshot.package.observations.find(item => (item.semanticTags ?? []).includes('status:not_assessed'));
const droppedEvent = snapshot.package.events.find(item => item.eventType === 'DROPPED_PIN');
const conditionEvidence = snapshot.package.conditions[0];
const handComparison =
    snapshot.package.derivedFacts.find(item => item.semanticType === 'HAND_COMPARISON') ?? snapshot.package.derivedFacts[0];
const resolveIds = row => {
    if (row.label === '측정값 그대로 서술') return { text: `${firstFact.label}은(는) ${firstFact.value}개로 나타났다.`, evidenceIds: [firstFact.id] };
    if (row.label === '비교 패턴 기반 추가 확인') return { text: row.text, evidenceIds: [firstPattern.id] };
    if (row.label === '미평가를 문제없음으로 확대') return { text: row.text, evidenceIds: [notAssessed.id, firstFact.id] };
    if (row.label === '인과관계 표현') return { text: row.text, evidenceIds: [droppedEvent.id, firstFact.id] };
    if (row.label === '검사조건으로 능력 추론') return { text: row.text, evidenceIds: [conditionEvidence.id] };
    if (row.label === '직무 적합 단정') return { text: row.text, evidenceIds: [handComparison.id] };
    return { text: row.text, evidenceIds: row.evidenceIds };
};

const qualityResults = qualityCases.map(row => {
    const { text, evidenceIds } = resolveIds(row);
    const result = claimQuality.validateClaim({ claimType: row.claimType, text, evidenceIds }, snapshot.package);
    assert.equal(result.status, row.expect, `${row.label}: ${row.expect} 이어야 하는데 ${result.status}`);
    return { ...row, text, evidenceIds, actual: result.status, issues: result.issues };
});

/* ── 해석 기록(AI 제안 → 채택) ───────────────────────────────── */

const interpretationRun = runModule.createInterpretationRun({
    testPluginId: hand.testPluginId,
    sessionId: hand.id,
    sourceDocumentId: record.id,
    evidenceHash: snapshot.evidenceHash,
    readiness: snapshot.readiness,
    model: 'gemini-verification',
    pack: snapshot.package,
    now: later(1400),
    response: {
        overallSummary: {
            claimType: 'RESULT_DESCRIPTION',
            text: `${firstFact.label}은(는) ${firstFact.value}개로 나타났다.`,
            evidenceIds: [firstFact.id],
            confidence: 'HIGH',
        },
        claims: [
            { claimType: 'SUPPORT_NEED', text: '수행 안정성을 추가 확인할 필요가 있다.', evidenceIds: [firstPattern.id], confidence: 'MEDIUM' },
            // 일부러 막혀야 하는 제안을 섞어 둔다.
            { claimType: 'RESULT_DESCRIPTION', text: '상위 10% 수준이다.', evidenceIds: [firstFact.id], confidence: 'HIGH' },
        ],
        cautions: [],
    },
});
const blocked = interpretationRun.claims.find(claim => claim.quality.status === 'INVALID');
assert.ok(blocked, '금지 표현이 섞인 제안은 INVALID로 표시되어야 한다');
assert.throws(() => runModule.acceptClaim(blocked, PERSONAL_TOKENS.evaluator, NOW), /채택할 수 없습니다/);

const adopted = interpretationRun.claims
    .filter(claim => claim.quality.status !== 'INVALID')
    .map(claim => runModule.acceptClaim(claim, PERSONAL_TOKENS.evaluator, later(1500)));
const runWithDecisions = {
    ...interpretationRun,
    claims: interpretationRun.claims.map(claim => adopted.find(item => item.id === claim.id) ?? claim),
};
episode = { ...episode, interpretations: [runWithDecisions], sessionIds: [hand.id, bi.id], sourceDocumentIds: [record.id] };

/* ── 보고서 ──────────────────────────────────────────────────── */

const sessions = [hand, bi];
const documents = [record];
let report = reportModel.createReport({
    episodeId: episode.id,
    seekerId: episode.seekerId,
    seekerName: episode.seekerName,
    writtenOn: '2026-09-25',
    evaluator: episode.evaluator,
    header: {
        evaluationOrganization: episode.evaluationOrganization,
        referralOrganization: '검증가상의뢰기관',
        evaluationDate: episode.evaluationDate,
        venue: episode.venue,
        seekerName: episode.seekerName,
        birthDate: PERSONAL_TOKENS.birthDate,
        contact: PERSONAL_TOKENS.contact,
        address: '서울특별시 ○○구',
        disability: '지적장애 / 심한 장애',
        sex: '남',
        needs: episode.needs,
    },
    purpose: episode.purpose,
});
report = {
    ...report,
    tools: reportCompose.fillToolRows(report.tools, sessions),
    sections: reportCompose.composeSections({ episode, sessions, documents }, report.sections),
    resultTables: reportCompose.buildResultTables(sessions, documents),
    summary: {
        vocationalLevel: '(평가사 직접 작성 영역 — 검증용 예시)',
        goalSelf: '(평가사 직접 작성 영역)',
        goalGuardian: '(평가사 직접 작성 영역)',
        strengths: '(평가사 직접 작성 영역)',
        limitations: '(평가사 직접 작성 영역)',
        recommendation: '(평가사 직접 작성 영역)',
        recommendedPrograms: '(평가사 직접 작성 영역)',
    },
};
const confirmed = reportModel.confirmReport(report, episode.evaluator, later(1600));
assert.ok(confirmed.contentHash);

// 확정 후 원자료가 바뀌어도 확정본 출력이 변하지 않음을 실제로 보인다.
// 다차원은 공식 결과지를 연결하지 않아 앱 기록이 그대로 표에 들어가므로, 값을 바꾸면 새 표는 달라진다.
const confirmedTablesBefore = JSON.stringify(confirmed.resultTables);
let changedBimanual = session.reopenSession(bi, later(1700));
changedBimanual = bimanual.setComponentCount(changedBimanual, 'cylinder', 1);
const tablesAfterChange = reportCompose.buildResultTables([hand, changedBimanual], documents);
assert.notEqual(
    JSON.stringify(tablesAfterChange),
    confirmedTablesBefore,
    '원자료를 바꾸면 새로 만든 표는 달라져야 한다',
);
assert.equal(JSON.stringify(confirmed.resultTables), confirmedTablesBefore, '확정된 보고서의 표는 그대로여야 한다');
// 손기능 표는 공식 결과지에서 확정한 값을 쓰므로, 앱 기록을 바꿔도 표가 흔들리지 않는다.
const reopenedHand = session.setScore(session.reopenSession(hand, later(1710)), 99, later(1711), hand.trials[0].id);
const handTableAfterChange = reportCompose.buildHandFunctionTable(reopenedHand, record);
assert.equal(
    handTableAfterChange.rows[1][1],
    '13',
    '공식 결과지에서 고른 값이 있으면 앱 기록을 바꿔도 결과표는 결과지 값을 유지해야 한다',
);

const reportHtml = reportDocument.buildReportHtml(confirmed);
const reportDocxBlob = await blocks.packDocument(reportDocument.buildReportDocx(confirmed));
const reportDocxBuffer = Buffer.from(await reportDocxBlob.arrayBuffer());

/* ── 원자료 요약(공단 프로그램 입력용) ──────────────────────── */

const rawSummary = [
    '[손기능 작업표본검사]',
    ...handSummaries.map(summary => {
        const scores = summary.scores.map(score => (score === null ? '미실시' : String(score))).join(' / ');
        const note = summary.executedCount > 0 && summary.executedCount < 3 ? ` (${summary.executedCount}회 실시 평균)` : '';
        return `${summary.label}: ${scores} → 평균 ${summary.average}${note}`;
    }),
    '',
    '[다차원 양손협응 작업표본검사]',
    ...bi.bimanual.specification.components.map(
        component => `${component.label}: ${bi.bimanual.attempt.result.components[component.key]} / ${component.maximum}`,
    ),
    `총합: ${bimanual.totalCompleted(bi.bimanual.attempt.result)} / ${bimanual.totalMaximum(bi.bimanual.specification)}`,
    `기록시간: ${Math.round((bi.bimanual.attempt.result.recordedDurationMs ?? 0) / 1000)}초`,
].join('\n');

/* ── 파일 쓰기 ───────────────────────────────────────────────── */

await rm(outRoot, { recursive: true, force: true });
await mkdir(path.join(outRoot, '03_AI전송본문'), { recursive: true });
await mkdir(path.join(outRoot, '05_보고서샘플'), { recursive: true });
await mkdir(path.join(outRoot, 'source', 'features', 'vocationalEvaluation'), { recursive: true });
await mkdir(path.join(outRoot, 'source', 'pages', 'evaluation'), { recursive: true });
await mkdir(path.join(outRoot, 'source', 'features', 'docx'), { recursive: true });
await mkdir(path.join(outRoot, 'docs'), { recursive: true });
await mkdir(path.join(outRoot, 'tests'), { recursive: true });

await cp(featureDir, path.join(outRoot, 'source', 'features', 'vocationalEvaluation'), { recursive: true });
await cp(pageDir, path.join(outRoot, 'source', 'pages', 'evaluation'), { recursive: true });
await cp(path.join(root, 'src', 'features', 'docx', 'blocks.ts'), path.join(outRoot, 'source', 'features', 'docx', 'blocks.ts'));
await cp(path.join(root, 'src', 'pages', 'VocationalEvaluation.tsx'), path.join(outRoot, 'source', 'pages', 'VocationalEvaluation.tsx'));
await cp(path.join(root, 'docs', 'VOCATIONAL_EVALUATION.md'), path.join(outRoot, 'docs', 'VOCATIONAL_EVALUATION.md'));
await cp(
    path.join(root, 'docs', '2026-09-25-vocational-evaluation-workbench-plan.md'),
    path.join(outRoot, 'docs', '계획서.md'),
);
await cp(path.join(root, 'scripts', 'test-ve-workbench.mjs'), path.join(outRoot, 'tests', 'test-ve-workbench.mjs'));

let testOutput;
try {
    testOutput = execFileSync(process.execPath, [path.join(root, 'scripts', 'test-ve-workbench.mjs')], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
    });
} catch (error) {
    testOutput = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    throw new Error(`단위 테스트가 실패해 검증 자료를 만들지 않았습니다.\n${testOutput}`);
}
await writeFile(path.join(outRoot, 'tests', '테스트_실행결과.txt'), testOutput, 'utf8');

await writeFile(path.join(outRoot, '03_AI전송본문', '결과지읽기_요청본문.txt'), outboundExtraction, 'utf8');
await writeFile(path.join(outRoot, '03_AI전송본문', '해석요청_요청본문.txt'), outboundInterpretation, 'utf8');
await writeFile(
    path.join(outRoot, '03_AI전송본문', '근거패키지.json'),
    JSON.stringify(snapshot.package, null, 2),
    'utf8',
);
await writeFile(
    path.join(outRoot, '03_AI전송본문', '로컬전용_근거대조표.json'),
    JSON.stringify(snapshot.references, null, 2),
    'utf8',
);
await writeFile(path.join(outRoot, '05_보고서샘플', '직업평가보고서_샘플.html'), reportHtml, 'utf8');
await writeFile(path.join(outRoot, '05_보고서샘플', '직업평가보고서_샘플.docx'), reportDocxBuffer);
await writeFile(path.join(outRoot, '05_보고서샘플', '원자료_요약.txt'), rawSummary, 'utf8');
await writeFile(
    path.join(outRoot, '05_보고서샘플', '저장형식_보고서.json'),
    JSON.stringify(confirmed, null, 2),
    'utf8',
);
await writeFile(
    path.join(outRoot, '05_보고서샘플', '저장형식_결과지기록.json'),
    JSON.stringify(record, null, 2),
    'utf8',
);
await writeFile(
    path.join(outRoot, '05_보고서샘플', '저장형식_검사세션_손기능.json'),
    JSON.stringify(hand, null, 2),
    'utf8',
);

/* ── 문서 ────────────────────────────────────────────────────── */

const sourceFiles = [...(await collect(featureDir))].map(file => path.relative(root, file).split(path.sep).join('/'));
const sourceLines = await Promise.all(
    sourceFiles.map(async file => (await readFile(path.join(root, file), 'utf8')).split('\n').length),
);

const brief = `# 직업평가 워크벤치 검증 요청 (JJSS ${pkg.version})

이 폴더는 **다른 AI가 코드와 산출물을 검증**할 수 있도록 만든 자료입니다.
설명만 적지 않고, \`source/\` 의 코드를 그대로 실행해 나온 결과를 함께 넣었습니다.

모든 이름·연락처·생년월일·기관명은 **합성 값**이며 실존 인물·기관이 아닙니다.

---

## 0. 무엇을 만든 기능인가

한국장애인고용공단(KEAD) 작업표본검사 2종(손기능, 다차원 양손협응)의 **실시 과정을 기록**하고,
공단 검사해석 프로그램이 만든 **공식 결과지를 읽어** 해석·보고서로 잇는 기능입니다.

**설계상 가장 중요한 제약:** 앱은 규준(백분위)을 **계산하지 않습니다.**
백분위는 공단 프로그램이 만든 결과지에 인쇄된 값을 **읽어서 그대로** 씁니다.

---

## 1. 검증해 주셨으면 하는 것 (우선순위 순)

### A. 개인정보가 외부 AI로 나가지 않는가 (가장 중요)
- \`03_AI전송본문/결과지읽기_요청본문.txt\`, \`해석요청_요청본문.txt\` 가 **실제로 전송되는 본문**입니다.
- 이 두 파일에 아래 합성 개인정보 표식이 **하나도 없어야** 합니다.
${Object.entries(PERSONAL_TOKENS)
    .map(([key, token]) => `  - \`${token}\` (${key})`)
    .join('\n')}
- \`근거패키지.json\` 은 전송되는 구조, \`로컬전용_근거대조표.json\` 은 **PC 안에만 남는** 대조표입니다. 둘을 비교해 주세요.
- 관련 코드: \`source/features/vocationalEvaluation/interpretation/evidence.ts\`, \`interpretation/prompt.ts\`, \`sourceDocument/prompt.ts\`

### B. KEAD 실시요강 규격이 코드에 맞게 들어갔는가
- \`02_KEAD_규격_주장.md\` 의 표에 있는 값이 코드와 맞는지 확인해 주세요.
- 특히 **다차원 양손협응의 분모**(판만 1, 나머지 4, 합계 25)와 **손기능 30초 × 7조건 × 3회**입니다.
- 관련 코드: \`source/features/vocationalEvaluation/tests/keadHandFunction.ts\`, \`tests/keadBimanual.ts\`

### C. AI가 넘지 말아야 할 선을 코드가 막는가
- \`04_품질검사_결과.md\` 는 실제 판정 결과입니다(스크립트가 기대값과 다르면 자료 생성이 실패합니다).
- 막아야 할 것: 취업 가능·직무 적합 단정, 진단, **백분위 생성**, 근거에 없는 수치, 검사조건만으로 능력 추론, 미평가를 문제없음으로 확대, 기록시간으로 전체 완료 추론.
- 관련 코드: \`source/features/vocationalEvaluation/interpretation/claimQuality.ts\`
- **우회 경로가 있는지** 찾아봐 주세요(정규식으로 막는 방식의 한계 포함).

### D. 상태 관리와 저장에 구멍이 있는가
- 검사 중 시간 계산, 중단·복구, 확정 후 불변성, 저장 형식 복원.
- 관련 코드: \`session.ts\`, \`measurement.ts\`, \`timer.ts\`, \`model/sessionSerialization.ts\`, \`report/model.ts\`, \`report/serialization.ts\`, \`pages/evaluation/useSessionRunner.ts\`
- \`05_보고서샘플/저장형식_*.json\` 이 실제 저장되는 형태입니다(앱에서는 이 JSON이 암호화되어 들어갑니다).

### E. 값의 출처가 섞이지 않는가
- 앱이 기록한 값(\`DIRECT_ENTRY\`)과 결과지에서 읽은 값(\`OFFICIAL_PDF\`)이 구분되는지,
  두 값이 다를 때 평가사가 고르기 전에는 해석에 들어가지 않는지.
- \`05_보고서샘플/저장형식_결과지기록.json\` 의 \`facts\` / \`resolutions\` 를 봐 주세요.
- 관련 코드: \`sourceDocument/facts.ts\`, \`sourceDocument/rebuild.ts\`, \`sourceDocument/review.ts\`

---

## 2. 이 자료를 만들 때 코드가 실제로 통과한 것

자료 생성 스크립트(\`make-ve-verification.mjs\`)는 아래를 **실행해서 확인**했고, 하나라도 어긋나면 자료를 만들지 않습니다.

- 질문 3문항이 모두 오른손 → 우세손 오른손 판정
- 합성 손기능 21시행(양손 조건은 2·3차 미실시) 확정 가능
- 다차원 부품 합계 17 / 분모 합계 25
- 결과지 값과 앱 기록이 다른 항목이 **충돌로 남고**, 고르기 전에는 확정값에서 빠짐
- 평가사가 결과지 값을 고른 뒤에야 확정값에 들어감
- AI 전송 본문 2종에 합성 개인정보 표식 ${Object.keys(PERSONAL_TOKENS).length}종이 **0건**
- 근거 ID가 모두 \`fact_숫자\` 형식(사람을 가리키지 않음)
- 품질 검사 ${qualityResults.length}건이 기대한 판정과 일치
- 금지 표현이 섞인 AI 제안은 INVALID로 표시되고 채택이 거부됨
- 확정된 보고서는 원자료를 바꿔도 출력이 그대로임
- 단위 테스트 전체 통과 (\`tests/테스트_실행결과.txt\`)

---

## 3. 폴더 구성

| 경로 | 내용 |
|---|---|
| \`00_검증요청.md\` | 이 문서 |
| \`01_소스_목록.md\` | 검증 대상 파일 목록과 SHA-256 |
| \`02_KEAD_규격_주장.md\` | 실시요강 기준 값과 코드 위치 |
| \`03_AI전송본문/\` | **실제 전송 본문**과 근거 패키지, 로컬 전용 대조표 |
| \`04_품질검사_결과.md\` | AI 제안 차단·허용 판정 결과 |
| \`05_보고서샘플/\` | 보고서 DOCX·HTML, 원자료 요약, 저장 형식 JSON |
| \`source/\` | 검증 대상 소스 전체 |
| \`docs/\` | 계획서, 실무자용 사용 안내 |
| \`tests/\` | 단위 테스트 코드와 실행 결과 |
| \`SHA256SUMS.txt\` | 이 폴더 모든 파일의 지문 |

---

## 4. 알려진 한계 (검증 시 참고)

- **실제 결과지 PDF로 추출을 돌려 보지 못했습니다.** API 키가 필요해 테스트에서 실제 호출을 하지 않았습니다.
  \`03_AI전송본문/결과지읽기_요청본문.txt\` 는 실제로 보낼 문구이고, 응답 파싱·검증은 합성 응답으로만 확인했습니다.
- 쉬운 설명(당사자용)과 현황판 연동은 아직 만들지 않았습니다.
- 품질 검사는 정규식 기반입니다. 우회 가능성 지적을 환영합니다.
- 보고서 \`contentHash\`는 실수로 덮어쓰는 것을 막는 확인값이며 암호학적 서명이 아닙니다.
`;

const sourceList = `# 검증 대상 소스 목록

기준: JJSS ${pkg.version}
도메인·로직: \`source/features/vocationalEvaluation/\` (${sourceFiles.length}개 파일, ${sourceLines.reduce((a, b) => a + b, 0).toLocaleString()}줄)
화면: \`source/pages/evaluation/\`
공용 문서 렌더러: \`source/features/docx/blocks.ts\` (지원고용 서류와 공유)
기존 화면 연결: \`source/pages/VocationalEvaluation.tsx\` (기존 3개 탭 유지, "평가 진행" 탭 추가)

| 파일 | 줄 |
|---|---|
${sourceFiles.map((file, index) => `| \`${file}\` | ${sourceLines[index]} |`).join('\n')}

## 읽는 순서 제안

1. \`model/types.ts\` — 자료 구조
2. \`tests/keadHandFunction.ts\`, \`tests/keadBimanual.ts\` — 검사 규격(실시요강)
3. \`session.ts\`, \`timer.ts\`, \`measurement.ts\` — 검사 실시 상태기계
4. \`sourceDocument/\` — 공식 결과지 읽기·대조·충돌 해결
5. \`interpretation/\` — 근거 패키지·패턴·품질 검사
6. \`report/\` — 보고서 조립·확정·출력
7. \`pages/evaluation/\` — 화면
`;

const specClaims = `# KEAD 실시요강 기준값과 코드 위치

출처: KEAD 작업표본검사 2종 실시요강(위탁연구 2008-06(2), 고려대 환경의학연구소).
아래 값이 요강과 다르면 **그 자체가 결함**입니다. 확인해 주세요.

## 손기능 작업표본검사

| 항목 | 코드의 값 | 코드 위치 |
|---|---|---|
| 조건 수 | 7조건 (소: 우세손·비우세손·양손 / 중·대: 우세손·비우세손) | \`tests/keadHandFunction.ts\` \`HAND_FUNCTION_CONDITIONS\` |
| 제한시간 | 조건당 30초 | \`HAND_FUNCTION_DURATION_SECONDS\` |
| 시행 횟수 | 조건당 3회(총 21시행) | \`HAND_FUNCTION_TRIALS_PER_CONDITION\` |
| 조건 점수 | 실시한 회차의 평균 | \`session.ts\` \`conditionSummaries\` |
| 채점 | 제한시간 내 꽂은 핀의 개수 | \`ScoreControl\` 안내 문구 |
| 우세손 판정 | 질문 3문항 → 불분명하면 평가용지 18문항, 8개 이상 같은 손 | \`dominantHand.ts\` |
| 양손잡이 | 채점에서 오른손을 우세손으로 간주 | \`dominantHand.ts\` \`scoringHand\` |
| 재설명 | 2회로 한정(초과 시 경고) | \`session.ts\` \`MAX_REINSTRUCTIONS\`, \`events.ts\` |
| 중단 | 3회 이상이면 실패로 안내 | \`session.ts\` \`MAX_INTERRUPTIONS\` |

### 오류유형과 수행량 처리 (요강 표4-2·4-3)

| 오류 | 수행량 | 코드 |
|---|---|---|
| 핀 떨어뜨림 | 포함 | \`handFunctionErrorEvents\` \`scoreEffect: 'INCLUDE'\` |
| 꽂기 생략(빈 구멍) | 포함 | 〃 |
| 다른 손으로 꽂음 | 제외 | \`scoreEffect: 'EXCLUDE'\` |
| 여러 핀 동시 집기 | 제외 + 중단·재설명 | 〃 + \`requiresReinstruction\` |
| 핀 방향 오류 | 중단·재설명 | \`requiresReinstruction\` |
| 양손 동시성 부족(1초 이상) | 제외 | \`scoreEffect: 'EXCLUDE'\` |

## 다차원 양손협응 작업표본검사

| 항목 | 코드의 값 | 코드 위치 |
|---|---|---|
| 제한시간 | 1분 30초(90초), 1회 실시 | \`tests/keadBimanual.ts\` \`BIMANUAL_DURATION_SECONDS\` |
| 채점 분모 | 원통결합 4 / 볼트(대) 4 / 너트(대) 4 / 볼트(소) 4 / 너트(소) 4 / **판 1** / 고정핀 4 | \`bimanualPartSpecification\` |
| 총합 | **25** | 〃 \`reportedTotal\`, \`bimanual.ts\` \`totalMaximum\` |

> **이 부분은 이식하면서 고쳤습니다.** 원본 프로그램(VE Assist)은 판의 분모를 4로 두어 합계가 28이 되었고,
> 표기 총 도구수 25와 충돌한다고 표시했습니다. 실시요강 부록2와 공단 프로그램 화면이 \`판 1/1\`, \`총합 /25\`로
> 일치해 **판만 1**로 바로잡았습니다. 이 판단이 맞는지 확인해 주시면 좋겠습니다.

## 규정에 없어서 앱이 임의로 정한 것

| 항목 | 요강 | 앱의 처리 |
|---|---|---|
| 2·3차 생략 | **규정 없음**(3회가 원칙) | "미실시"를 허용하되 **사유를 반드시 입력**하게 하고, 평균은 실시한 회차만으로 내며 "n회 실시 평균"으로 표기. 1차는 미실시 불가 |
| 연습 개수 | "필요에 따라 연습 기회를 줄 수 있음"(개수 없음) | 앱이 개수를 정하지 않음 |
| 등급(상·중·하) | 존재하지 않음 | 만들지 않음 |
| 직무별 적합 판정 | 요강이 "직무별 규준으로 쓰기에 무리"라고 경고 | 판정하지 않음 |
`;

const qualityDoc = `# AI 제안 품질 검사 결과

\`interpretation/claimQuality.ts\` 에 실제 근거 패키지를 넣고 돌린 결과입니다.
기대값과 다르면 이 자료 자체가 만들어지지 않습니다.

- \`INVALID\` = 채택 불가(버튼이 잠김)
- \`REVIEW_REQUIRED\` = 채택은 가능하지만 확인 문구가 함께 표시됨
- \`VALID\` = 문제 없음

| # | 경우 | 문장 | 인용 근거 | 기대 | 실제 | 사유 |
|---|---|---|---|---|---|---|
${qualityResults
    .map(
        (row, index) =>
            `| ${index + 1} | ${row.label} | ${row.text.replace(/\|/g, '\\|')} | ${row.evidenceIds.join(', ')} | ${row.expect} | **${row.actual}** | ${row.issues.join(' / ') || '—'} |`,
    )
    .join('\n')}

## 함께 봐 주셨으면 하는 것

- 위 규칙을 **우회하는 문장**을 만들 수 있는지 (예: 숫자를 한글로 쓰기, 완곡한 표현으로 적합 판정 하기)
- 반대로 **정상적인 서술을 과하게 막는지** (거짓 양성)
- 근거 ID를 꾸며내는 응답이 걸러지는지 (\`prompt.ts\` \`parseInterpretationResponse\` + \`claimQuality\`)
`;

const privacyDoc = `# 개인정보 전송 점검 결과

합성 개인정보 표식을 심은 자료로 **실제 전송 본문**을 만든 뒤, 그 표식이 본문에 남아 있는지 검사했습니다.

| 항목 | 심어 둔 값 | 결과지 읽기 본문 | 해석 요청 본문 |
|---|---|---|---|
${privacyRows
    .map(row => `| ${row.key} | \`${row.token}\` | ${row.inExtraction ? '**발견됨(결함)**' : '없음'} | ${row.inInterpretation ? '**발견됨(결함)**' : '없음'} |`)
    .join('\n')}

## 구조

- 나가는 것: 수치, 비교 패턴 문구, 관찰 항목 **이름과 상태**, 검사조건 이름, 의미 태그
- 나가지 않는 것: 이용자 이름, 연락처, 생년월일, 기관명, 평가사 이름, 시행 메모, 검사 메모, 파일 이름, 원본 PDF
- 근거 ID: \`fact_0\`, \`observation_1\`, \`pattern:hand:SMALL\` 처럼 사람을 가리키지 않는 값만 사용
- 실제 기록 ID와 결과지 원문 라벨은 \`로컬전용_근거대조표.json\` 에만 있고 전송하지 않음

## 확인 부탁드리는 지점

1. \`근거패키지.json\` 에 사람을 특정할 수 있는 정보가 남아 있지 않은지
   (예: 특이한 수치 조합, 자유 문구, 기관 고유 표현)
2. \`evidence.ts\` 의 \`safeSourceLabel\` 이 결과지 원문 라벨을 충분히 정리하는지
3. 앱 전체 경로에서 이 두 곳 외에 직업평가 자료가 외부로 나갈 수 있는 길이 있는지
   (\`clientContextService\` 에서 \`ve_*\` 문서를 제외하고 있습니다 — 확인해 주세요)
`;

await writeFile(path.join(outRoot, '00_검증요청.md'), brief, 'utf8');
await writeFile(path.join(outRoot, '01_소스_목록.md'), sourceList, 'utf8');
await writeFile(path.join(outRoot, '02_KEAD_규격_주장.md'), specClaims, 'utf8');
await writeFile(path.join(outRoot, '03_AI전송본문', '개인정보_점검결과.md'), privacyDoc, 'utf8');
await writeFile(path.join(outRoot, '04_품질검사_결과.md'), qualityDoc, 'utf8');

/* ── SHA-256 ─────────────────────────────────────────────────── */

async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else out.push(full);
    }
    return out;
}

const produced = (await walk(outRoot)).sort();
const sums = await Promise.all(
    produced.map(async file => {
        const hash = createHash('sha256').update(await readFile(file)).digest('hex');
        return `${hash}  ${path.relative(outRoot, file).split(path.sep).join('/')}`;
    }),
);
await writeFile(path.join(outRoot, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');

// 다른 AI에 통째로 올릴 수 있게 ZIP 하나로도 묶는다.
const zip = new JSZip();
for (const file of produced) {
    zip.file(path.relative(outRoot, file).split(path.sep).join('/'), await readFile(file));
}
zip.file('SHA256SUMS.txt', `${sums.join('\n')}\n`);
const zipPath = path.join(root, 'release', `ve-verification-${pkg.version}.zip`);
await writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

await rm(cacheDir, { recursive: true, force: true });

console.log(`검증용 자료를 만들었습니다: ${path.relative(root, outRoot)}`);
console.log(`- 묶음 파일: ${path.relative(root, zipPath)}`);
console.log(`- 소스 ${sourceFiles.length}개 파일 복사, 문서 5종, 저장형식 JSON 3종`);
console.log(`- AI 전송 본문 2종: 개인정보 표식 ${Object.keys(PERSONAL_TOKENS).length}종 모두 0건`);
console.log(`- 품질 검사 ${qualityResults.length}건 기대값 일치, 단위 테스트 통과`);
console.log(`- 파일 ${produced.length + 1}개, SHA256SUMS.txt 포함`);
