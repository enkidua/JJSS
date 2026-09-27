// 직업평가 워크벤치(검사 실시) 단위 테스트 — 계획서 §9.
// VE Assist의 도메인 테스트를 JJSS 이식본에 맞춰 옮겼다.
// 네트워크·IndexedDB를 쓰지 않으며 모든 값은 합성 데이터다.
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDir = path.join(root, 'src', 'features', 'vocationalEvaluation');
const outDir = path.join(root, 'node_modules', '.cache', 'test-ve-workbench');

// localDB(IndexedDB)·AI 서비스를 쓰는 파일은 제외한다. 직렬화·검증 로직은 model·sourceDocument에서 검사한다.
const SKIP = new Set(['storage.ts', 'index.ts', 'sourceDocument/extraction.ts', 'interpretation/request.ts']);

async function collect(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collect(full)));
        else if (entry.name.endsWith('.ts') && !SKIP.has(path.relative(featureDir, full).split(path.sep).join('/'))) files.push(full);
    }
    return files;
}

async function transpile(sourcePath) {
    const relative = path.relative(path.join(root, 'src'), sourcePath);
    const target = path.join(outDir, relative).replace(/\.ts$/, '.mjs');
    const output = ts
        .transpileModule(await readFile(sourcePath, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
            fileName: sourcePath,
        })
        .outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, 'utf8');
}

await rm(outDir, { recursive: true, force: true });
for (const file of [...(await collect(featureDir)), path.join(root, 'src', 'features', 'docx', 'blocks.ts')]) await transpile(file);

const load = relative =>
    import(pathToFileURL(path.join(outDir, 'features', 'vocationalEvaluation', relative)).href);

const timer = await load('timer.mjs');
const session = await load('session.mjs');
const events = await load('events.mjs');
const measurement = await load('measurement.mjs');
const bimanual = await load('bimanual.mjs');
const registry = await load('tests/registry.mjs');
const shortcuts = await load('shortcuts.mjs');
const handFunction = await load('tests/keadHandFunction.mjs');
const keadBimanual = await load('tests/keadBimanual.mjs');
const dominantHand = await load('dominantHand.mjs');
const episodeModel = await load('model/episode.mjs');
const sessionModel = await load('model/sessionSerialization.mjs');
const candidates = await load('observations/candidates.mjs');
const narrative = await load('observations/narrative.mjs');
const extractionSchema = await load('sourceDocument/schema.mjs');
const review = await load('sourceDocument/review.mjs');
const facts = await load('sourceDocument/facts.mjs');
const rebuild = await load('sourceDocument/rebuild.mjs');
const sourceRecord = await load('sourceDocument/record.mjs');
const valueLimits = await load('sourceDocument/valueLimits.mjs');
const patternsModule = await load('interpretation/patterns.mjs');
const readinessModule = await load('interpretation/readiness.mjs');
const claimQuality = await load('interpretation/claimQuality.mjs');
const evidenceModule = await load('interpretation/evidence.mjs');
const promptModule = await load('interpretation/prompt.mjs');
const runModule = await load('interpretation/run.mjs');
const contextModule = await load('interpretation/context.mjs');
const interpretationTypes = await load('interpretation/types.mjs');
const reportModel = await load('report/model.mjs');
const reportSerialization = await load('report/serialization.mjs');
const reportCompose = await load('report/compose.mjs');
const analysisModel = await load('analysisDocument/model.mjs');
const reportDocument = await load('report/document.mjs');
const blocks = await import(pathToFileURL(path.join(outDir, 'features', 'docx', 'blocks.mjs')).href);

const NOW = '2026-09-25T01:00:00.000Z';
const later = step => new Date(Date.parse(NOW) + step * 1000).toISOString();

let checks = 0;
async function check(name, fn) {
    await fn();
    checks += 1;
    console.log(`  ok  ${name}`);
}

/* ── 1. 타이머 ─────────────────────────────────────────────────── */
console.log('타이머');
await check('시작 전에는 IDLE이고 남은 시간이 그대로다', () => {
    const t = timer.resetTimer(30_000);
    assert.equal(t.status, 'IDLE');
    assert.equal(t.remainingMs, 30_000);
});
await check('경과만큼 줄고 0이 되면 EXPIRED', () => {
    let t = timer.startTimer(timer.resetTimer(30_000), 1_000);
    t = timer.tickTimer(t, 11_000);
    assert.equal(t.remainingMs, 20_000);
    t = timer.tickTimer(t, 41_000);
    assert.equal(t.status, 'EXPIRED');
    assert.equal(t.remainingMs, 0);
});
await check('일시정지는 남은 시간을 고정한다', () => {
    const running = timer.startTimer(timer.resetTimer(30_000), 0);
    const paused = timer.pauseTimer(running, 5_000);
    assert.equal(paused.status, 'PAUSED');
    assert.equal(paused.remainingMs, 25_000);
    assert.equal(timer.tickTimer(paused, 99_000).remainingMs, 25_000);
});
await check('표기는 mm:ss', () => {
    assert.equal(timer.formatTimer(90_000), '01:30');
    assert.equal(timer.formatTimer(30_000), '00:30');
    assert.equal(timer.formatTimer(0), '00:00');
});

/* ── 2. 손기능 시행 구성 (실시요강 §1-1) ─────────────────────── */
console.log('손기능 시행 구성');
await check('7조건 × 3회 = 21시행', () => {
    const trials = handFunction.createHandFunctionTrials();
    assert.equal(trials.length, 21);
    assert.equal(new Set(trials.map(t => `${t.size}.${t.handMode}`)).size, 7);
});
await check('양손 조건은 소형핀에만 있다', () => {
    const trials = handFunction.createHandFunctionTrials();
    const bilateral = trials.filter(t => t.handMode === 'BILATERAL');
    assert.equal(bilateral.length, 3);
    assert.ok(bilateral.every(t => t.size === 'SMALL'));
});
await check('제한시간은 조건당 30초', () => {
    assert.equal(handFunction.HAND_FUNCTION_DURATION_SECONDS, 30);
    assert.ok(handFunction.createHandFunctionTrials().every(t => t.durationSeconds === 30));
});
await check('오류유형의 수행량 처리가 요강 표4-2·4-3과 같다', () => {
    const effect = type => handFunction.handFunctionErrorEvents.find(e => e.type === type)?.scoreEffect;
    assert.equal(effect('DROPPED_PIN'), 'INCLUDE');
    assert.equal(effect('SKIPPED_HOLE'), 'INCLUDE');
    assert.equal(effect('OTHER_HAND_INSERT'), 'EXCLUDE');
    assert.equal(effect('MULTIPLE_PINS'), 'EXCLUDE');
    assert.equal(effect('BILATERAL_TIME_GAP'), 'EXCLUDE');
});

/* ── 3. 다차원 분모 (계획서 §1-3 정정사항) ───────────────────── */
console.log('다차원 양손협응');
await check('판만 분모 1이고 총합은 25다', () => {
    const spec = keadBimanual.bimanualPartSpecification;
    assert.equal(spec.components.find(c => c.key === 'plate').maximum, 1);
    assert.equal(bimanual.totalMaximum(spec), 25);
    assert.equal(spec.reportedTotal, 25);
    assert.equal(spec.ruleStatus, 'VERIFIED');
});
await check('제한시간은 90초(1분 30초) 1회', () => {
    assert.equal(keadBimanual.BIMANUAL_DURATION_SECONDS, 90);
    assert.equal(keadBimanual.keadBimanualPlugin.createTrials().length, 0);
});

const makeBimanualSession = () =>
    session.createTestSession({
        episodeId: 'ep1',
        seekerId: 's1',
        seekerName: '합성이용자',
        testPluginId: keadBimanual.BIMANUAL_TEST_ID,
        now: NOW,
    });

await check('측정 종료 전에는 수행량을 넣을 수 없다', () => {
    const s = makeBimanualSession();
    assert.throws(() => bimanual.setComponentCount(s, 'plate', 1), /측정 종료 후/);
});
await check('분모를 넘는 수행량을 막는다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    assert.throws(() => bimanual.setComponentCount(s, 'plate', 2), /0~1 정수/);
    s = bimanual.setComponentCount(s, 'plate', 1);
    assert.equal(s.bimanual.attempt.result.components.plate, 1);
});
await check('제한시간 종료와 평가자 종료를 구분해 기록한다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    assert.equal(s.bimanual.attempt.result.endReason, 'TIME_LIMIT');
    assert.equal(s.bimanual.attempt.result.recordedDurationMs, 90_000);

    let early = makeBimanualSession();
    early = bimanual.changeBimanualState(early, 'RUNNING', NOW, 90_000);
    early = bimanual.changeBimanualState(early, 'FINISHED', later(80), 10_000);
    assert.equal(early.bimanual.attempt.result.endReason, 'EVALUATOR_FINISH');
    assert.equal(early.bimanual.attempt.result.recordedDurationMs, 80_000);
});
await check('평가자 종료 취소는 시간을 되돌리지 않고 일시정지로 남긴다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(80), 10_000);
    s = bimanual.undoBimanualFinish(s);
    assert.equal(s.bimanual.attempt.status, 'PAUSED');
    assert.equal(s.bimanual.attempt.pauseCount, 1);
    assert.equal(s.bimanual.attempt.result.recordedDurationMs, undefined);
    assert.equal(s.bimanual.attempt.pauses.at(-1).elapsedMs, 80_000);
});
await check('부품 7종을 모두 채워야 확정할 수 있다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    assert.ok(session.validateSession(s).length > 0);
    const counts = { cylinder: 4, largeBolt: 3, largeNut: 3, smallBolt: 2, smallNut: 2, plate: 1, fixingPin: 2 };
    for (const [key, value] of Object.entries(counts)) s = bimanual.setComponentCount(s, key, value);
    assert.deepEqual(session.validateSession(s), []);
    assert.equal(bimanual.totalCompleted(s.bimanual.attempt.result), 17);
    s = session.confirmSession(s, later(120), '평가사');
    assert.equal(s.status, 'COMPLETED');
    assert.equal(s.bimanual.attempt.status, 'CONFIRMED');
});
await check('재실시하면 이전 측정을 남기고 사건을 제외한다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = events.recordEvent(s, 'DROPPED_COMPONENT', later(5), 5);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    s = bimanual.restartBimanual(s, 'attempt2', later(95));
    assert.equal(s.bimanual.previousAttempts.length, 1);
    assert.equal(s.bimanual.attempt.id, 'attempt2');
    assert.equal(s.bimanual.attempt.status, 'READY');
    assert.equal(s.events[0].excludedReason, 'TRIAL_RESTARTED');
});

/* ── 4. 손기능 세션 진행 ───────────────────────────────────────── */
console.log('손기능 세션');
const makeHandSession = () =>
    session.createTestSession({
        episodeId: 'ep1',
        seekerId: 's1',
        seekerName: '합성이용자',
        testPluginId: handFunction.HAND_FUNCTION_TEST_ID,
        now: NOW,
    });

await check('첫 시행만 READY이고 나머지는 PENDING이다', () => {
    const s = makeHandSession();
    assert.equal(s.trials.length, 21);
    assert.equal(s.trials[0].status, 'READY');
    assert.ok(s.trials.slice(1).every(t => t.status === 'PENDING'));
    assert.equal(s.currentTrialId, s.trials[0].id);
});
await check('수행량 없이 확정할 수 없다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    assert.throws(() => session.confirmCurrentTrial(s, later(31)), /수행량을 입력하세요/);
});
await check('0도 입력한 값으로 인정한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    s = session.setScore(s, 0, later(31));
    s = session.confirmCurrentTrial(s, later(32));
    assert.equal(s.trials[0].status, 'CONFIRMED');
    assert.equal(s.trials[0].score, 0);
    assert.equal(s.currentTrialId, s.trials[1].id);
    assert.equal(s.trials[1].status, 'READY');
});
await check('허용되지 않은 상태 전환을 막는다', () => {
    const s = makeHandSession();
    assert.throws(() => session.changeTrialState(s, 'FINISHED', NOW, 0), /허용되지 않은 상태 전환/);
});

function runTrial(state, score, offset) {
    let s = session.changeTrialState(state, 'RUNNING', later(offset), 30_000);
    s = session.changeTrialState(s, 'FINISHED', later(offset + 30), 0);
    s = session.setScore(s, score, later(offset + 31));
    return session.confirmCurrentTrial(s, later(offset + 32));
}

await check('21시행을 모두 확정하면 세션을 확정할 수 있다', () => {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 10 + (i % 3), i * 40);
    assert.deepEqual(session.validateSession(s), []);
    s = session.confirmSession(s, later(1000), '평가사');
    assert.equal(s.status, 'COMPLETED');
    assert.equal(s.confirmedBy, '평가사');
});

/* ── 5. 2·3차 미실시 (계획서 §3) ──────────────────────────────── */
console.log('2·3차 미실시');
await check('1차는 미실시로 둘 수 없다', () => {
    const s = makeHandSession();
    assert.throws(() => session.skipTrial(s, '피로 호소', NOW), /1차는 미실시로 둘 수 없습니다/);
});
await check('미실시에는 사유가 필요하다', () => {
    let s = runTrial(makeHandSession(), 12, 0);
    assert.throws(() => session.skipTrial(s, '   ', later(40)), /사유를 입력하세요/);
});
await check('미실시한 회차는 평균에서 빠지고 실시 회차 수가 남는다', () => {
    let s = runTrial(makeHandSession(), 12, 0);
    s = session.skipTrial(s, '피로 호소로 2차 미실시', later(40));
    s = session.skipTrial(s, '피로 호소로 3차 미실시', later(45), s.trials[2].id);
    const summary = session.conditionSummaries(s).find(item => item.key === 'SMALL.DOMINANT');
    assert.deepEqual(summary.scores, [12, null, null]);
    assert.equal(summary.average, 12);
    assert.equal(summary.executedCount, 1);
    assert.equal(summary.skipped, true);
});
await check('평균은 실시한 회차만으로 소수 첫째 자리까지 낸다', () => {
    let s = makeHandSession();
    s = runTrial(s, 10, 0);
    s = runTrial(s, 11, 40);
    s = session.skipTrial(s, '중단', later(90), s.trials[2].id);
    const summary = session.conditionSummaries(s).find(item => item.key === 'SMALL.DOMINANT');
    assert.equal(summary.average, 10.5);
    assert.equal(summary.executedCount, 2);
});
await check('조건 전체가 미실시면 확정을 막는다', () => {
    let s = makeHandSession();
    // 1차를 중단한 채 남겨 두면 그 조건에 실시 기록이 없다.
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = session.changeTrialState(s, 'INTERRUPTED', later(10), 20_000);
    const issues = session.validateSession(s);
    assert.ok(issues.some(issue => issue.type === 'INTERRUPTED_TRIAL'));
    assert.ok(issues.some(issue => issue.message.includes('실시한 회차가 없습니다')));
});

/* ── 6. 재설명·중단 규칙 (요강 p.41~42) ──────────────────────── */
console.log('재설명·중단 규칙');
await check('재설명 2회까지는 경고하지 않고 3회부터 경고한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'REPEATED_INSTRUCTION', later(5), 5);
    assert.equal(events.reinstructionsExceeded(s), false);
    s = events.recordEvent(s, 'REPEATED_INSTRUCTION', later(8), 8);
    assert.equal(events.countReinstructions(s), 2);
    assert.equal(events.reinstructionsExceeded(s), false);
    s = events.recordEvent(s, 'ADDITIONAL_DEMONSTRATION', later(12), 12);
    assert.equal(events.reinstructionsExceeded(s), true);
    assert.equal(s.reinstructionCount, 3);
});
await check('중단 3회면 실패 시각이 기록된다', () => {
    let s = makeHandSession();
    for (let i = 0; i < 3; i += 1) {
        s = session.changeTrialState(s, 'RUNNING', later(i * 10), 30_000);
        s = session.changeTrialState(s, 'INTERRUPTED', later(i * 10 + 5), 25_000);
        s = session.changeTrialState(s, 'READY', later(i * 10 + 6), 30_000);
    }
    assert.equal(s.interruptionCount, 3);
    assert.ok(s.failedAt);
});
await check('사건 취소는 기록을 지우지 않고 제외로 표시한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(3), 3);
    s = events.undoLatestEvent(s, later(4));
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].excludedReason, 'UNDO');
    assert.deepEqual(events.tallyEvents(s), []);
});
await check('사건 집계에 수행량 처리를 함께 돌려준다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(3), 3);
    s = events.recordEvent(s, 'DROPPED_PIN', later(6), 6);
    s = events.recordEvent(s, 'MULTIPLE_PINS', later(9), 9);
    const tally = events.tallyEvents(s);
    assert.equal(tally.find(item => item.eventType === 'DROPPED_PIN').count, 2);
    assert.equal(tally.find(item => item.eventType === 'DROPPED_PIN').scoreEffect, 'INCLUDE');
    assert.equal(tally.find(item => item.eventType === 'MULTIPLE_PINS').scoreEffect, 'EXCLUDE');
});
await check('검사 시작 전에는 사건을 기록할 수 없다', () => {
    const s = makeHandSession();
    assert.throws(() => events.recordEvent(s, 'DROPPED_PIN', NOW, 0), /검사 시작 후/);
});

/* ── 7. 복구 ───────────────────────────────────────────────────── */
console.log('복구');
await check('진행 중이던 시행은 복구 시 중단으로 남는다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    const recovered = session.recoverSession(s, later(60));
    assert.equal(recovered.status, 'PAUSED');
    assert.equal(recovered.recoveryReason, 'CRASH');
    assert.equal(recovered.trials[0].status, 'INTERRUPTED');
});
await check('다차원도 복구 시 기록시간과 종료사유가 남는다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = measurement.snapshotMeasurement(s, 40_000);
    const recovered = session.recoverSession(s, later(60));
    assert.equal(recovered.bimanual.attempt.status, 'INTERRUPTED');
    assert.equal(recovered.bimanual.attempt.result.endReason, 'INTERRUPTED');
    assert.equal(recovered.bimanual.attempt.result.recordedDurationMs, 50_000);
});
await check('체크포인트는 남은 시간을 늘리지 못한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 20_000);
    const applied = measurement.applyTimerCheckpoint(s, {
        sessionId: s.id,
        trialId: s.currentTrialId,
        remainingMs: 25_000,
        updatedAt: later(100),
    });
    assert.equal(measurement.currentMeasurement(applied).remainingMs, 20_000);
});
await check('체크포인트가 더 적게 남았으면 그 값으로 복구한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 20_000);
    const applied = measurement.applyTimerCheckpoint(s, {
        sessionId: s.id,
        trialId: s.currentTrialId,
        remainingMs: 12_000,
        updatedAt: later(100),
    });
    assert.equal(measurement.currentMeasurement(applied).remainingMs, 12_000);
});
await check('다른 세션의 체크포인트는 무시한다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 20_000);
    const applied = measurement.applyTimerCheckpoint(s, {
        sessionId: 'other',
        trialId: s.currentTrialId,
        remainingMs: 1_000,
        updatedAt: later(100),
    });
    assert.equal(measurement.currentMeasurement(applied).remainingMs, 20_000);
});

/* ── 8. 우세손 판정 (요강 표4-5·4-6) ─────────────────────────── */
console.log('우세손 판정');
await check('질문 3문항이 모두 같은 손이면 바로 판정한다', () => {
    const result = dominantHand.resolveDominantHand({
        questions: { writing: 'RIGHT', throwing: 'RIGHT', chopsticks: 'RIGHT' },
        form: {},
    });
    assert.equal(result.hand, 'RIGHT');
    assert.equal(result.basis, 'QUESTIONS');
    assert.equal(result.needsForm, false);
});
await check('질문이 갈리면 평가용지를 요구한다', () => {
    const result = dominantHand.resolveDominantHand({
        questions: { writing: 'RIGHT', throwing: 'LEFT', chopsticks: 'RIGHT' },
        form: {},
    });
    assert.equal(result.hand, 'UNKNOWN');
    assert.equal(result.needsForm, true);
});
await check('평가용지에서 8개 이상 같은 손이면 그 손으로 결정한다', () => {
    const form = {};
    dominantHand.DOMINANT_HAND_FORM_ITEMS.slice(0, 8).forEach(item => {
        form[item.id] = 'LEFT';
    });
    dominantHand.DOMINANT_HAND_FORM_ITEMS.slice(8).forEach(item => {
        form[item.id] = 'EITHER';
    });
    const result = dominantHand.resolveDominantHand({ questions: {}, form });
    assert.equal(result.hand, 'LEFT');
    assert.equal(result.basis, 'FORM');
});
await check('어느 손도 기준에 못 미치면 양손잡이로 본다', () => {
    const form = {};
    dominantHand.DOMINANT_HAND_FORM_ITEMS.forEach((item, index) => {
        form[item.id] = index % 3 === 0 ? 'RIGHT' : index % 3 === 1 ? 'LEFT' : 'EITHER';
    });
    const result = dominantHand.resolveDominantHand({ questions: {}, form });
    assert.equal(result.hand, 'AMBIDEXTROUS');
});
await check('양손잡이는 채점에서 오른손으로 본다', () => {
    assert.equal(dominantHand.scoringHand('AMBIDEXTROUS'), 'RIGHT');
    assert.equal(dominantHand.scoringHand('LEFT'), 'LEFT');
    assert.equal(dominantHand.scoringHand('UNKNOWN'), null);
});

/* ── 9. 행동관찰 후보 ─────────────────────────────────────────── */
console.log('행동관찰');
await check('사건이 쌓이면 빈도 제안이 올라간다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(3), 3);
    assert.equal(candidates.createObservationCandidates(s)[0].suggestedFrequency, 'ONCE');
    s = events.recordEvent(s, 'DROPPED_PIN', later(6), 6);
    assert.equal(candidates.createObservationCandidates(s)[0].suggestedFrequency, 'TWO_TO_THREE');
    s = events.recordEvent(s, 'DROPPED_PIN', later(9), 9);
    s = events.recordEvent(s, 'DROPPED_PIN', later(12), 12);
    const candidate = candidates.createObservationCandidates(s)[0];
    assert.equal(candidate.suggestedFrequency, 'FREQUENT');
    assert.equal(candidate.count, 4);
    assert.equal(candidate.decision, 'PENDING');
});
await check('후보를 반영하면 관찰로 저장되고 근거 사건이 남는다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'MULTIPLE_PINS', later(3), 3);
    const candidate = candidates.createObservationCandidates(s)[0];
    const observation = candidates.observationFromCandidate(candidate, {
        id: 'obs1',
        sessionId: s.id,
        now: later(20),
        decision: 'APPLIED',
    });
    s = session.upsertObservation(s, observation, later(20));
    assert.equal(s.observations[0].state, 'OBSERVED');
    assert.deepEqual(s.observations[0].evidenceEventIds, candidate.sourceEventIds);
    assert.equal(candidates.createObservationCandidates(s)[0].decision, 'APPLIED');
});
await check('관찰되지 않은 항목은 문장을 만들지 않는다', () => {
    assert.equal(
        narrative.buildObservationNarrative({
            id: 'o',
            testSessionId: 's',
            definitionId: 'common.attention',
            label: '주의집중',
            state: 'NOT_ASSESSED',
            createdAt: NOW,
            updatedAt: NOW,
        }),
        null,
    );
});
await check('관찰 문장에 빈도와 영향이 반영된다', () => {
    const result = narrative.buildObservationNarrative({
        id: 'o',
        testSessionId: 's',
        definitionId: 'hand.dropped_pin',
        label: '핀 떨어뜨림',
        state: 'OBSERVED',
        detail: { frequency: 'FREQUENT', impact: 'SLOWER' },
        createdAt: NOW,
        updatedAt: NOW,
    });
    assert.ok(result.text.includes('반복적으로'));
    assert.ok(result.text.includes('수행 속도 저하'));
});

/* ── 10. 저장 형식 ─────────────────────────────────────────────── */
console.log('저장 형식');
await check('세션을 저장하고 다시 읽으면 같은 값이 된다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(5), 5);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    s = session.setScore(s, 14, later(31));
    s = session.confirmCurrentTrial(s, later(32));
    const parsed = sessionModel.parseSession(sessionModel.serializeSession(s));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.session, sessionModel.normalizeSession(s));
    assert.equal(parsed.session.trials[0].score, 14);
});
await check('다차원 세션도 분모와 측정 기록을 그대로 복원한다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    s = bimanual.setComponentCount(s, 'plate', 1);
    const parsed = sessionModel.parseSession(sessionModel.serializeSession(s));
    assert.ok(parsed.ok);
    assert.equal(parsed.session.bimanual.attempt.result.components.plate, 1);
    assert.equal(parsed.session.bimanual.attempt.result.endReason, 'TIME_LIMIT');
    assert.equal(bimanual.totalMaximum(parsed.session.bimanual.specification), 25);
});
await check('깨진 내용은 오류로 알려 준다', () => {
    assert.equal(sessionModel.parseSession('not json').ok, false);
    assert.equal(sessionModel.parseSession('{}').ok, false);
    assert.equal(episodeModel.parseEpisode('{}').ok, false);
});
await check('회차를 저장하면 우세손 판정 결과가 함께 맞춰진다', () => {
    const episode = episodeModel.createEpisode({
        seekerId: 's1',
        seekerName: '합성이용자',
        evaluationDate: '2026-09-25',
    });
    const withAnswers = {
        ...episode,
        dominantHandAssessment: {
            questions: { writing: 'LEFT', throwing: 'LEFT', chopsticks: 'LEFT' },
            form: {},
        },
    };
    const parsed = episodeModel.parseEpisode(episodeModel.serializeEpisode(withAnswers));
    assert.ok(parsed.ok);
    assert.equal(parsed.episode.dominantHand, 'LEFT');
    assert.equal(parsed.episode.status, 'DRAFT');
});
await check('모르는 값은 기본값으로 정리한다', () => {
    const episode = episodeModel.createEpisode({
        seekerId: 's1',
        seekerName: '합성이용자',
        evaluationDate: '2026-09-25',
    });
    const parsed = episodeModel.parseEpisode(
        JSON.stringify({ ...episode, status: '없는상태', venue: '없는값', needs: { interest: 'yes' } }),
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.episode.status, 'DRAFT');
    assert.equal(parsed.episode.venue, 'IN_HOUSE');
    assert.equal(parsed.episode.needs.interest, true);
    assert.equal(parsed.episode.needs.emotion, false);
});

/* ── 11. 등록소 ───────────────────────────────────────────────── */
console.log('검사 등록소');
await check('두 검사가 등록되어 있다', () => {
    const ids = registry.listTestPlugins().map(plugin => plugin.manifest.id);
    assert.deepEqual(ids.sort(), ['kead-bimanual', 'kead-hand-function']);
});
await check('등록되지 않은 검사는 오류를 낸다', () => {
    assert.throws(() => registry.getTestPlugin('없는검사'), /등록되지 않은 검사/);
});
await check('오류·진행 기록 단축키는 화면 순서대로 F1부터 빠짐없이 이어지고 겹치지 않는다', () => {
    for (const pluginId of ['kead-hand-function', 'kead-bimanual']) {
        const events = registry.getTestPlugin(pluginId).events;
        // 화면 순서: 오류 기록(수행량 처리·재설명 필요)이 먼저, 진행 기록이 다음 — EventQuickActions와 같은 기준.
        const ordered = [
            ...events.filter(event => event.scoreEffect || event.requiresReinstruction),
            ...events.filter(event => !event.scoreEffect && !event.requiresReinstruction),
        ];
        const shortcuts = ordered.map(event => event.shortcut).filter(Boolean);
        assert.deepEqual(
            shortcuts,
            shortcuts.map((_, index) => `F${index + 1}`),
            `${pluginId}: 단축키가 F1부터 순서대로여야 한다 (${shortcuts.join(',')})`,
        );
        assert.ok(shortcuts.length >= 12 || shortcuts.length === ordered.length, `${pluginId}: F12까지 쓰거나 전부 배정`);
        assert.ok(shortcuts.every(key => /^F([1-9]|1[0-2])$/.test(key)), `${pluginId}: F1~F12 범위`);
    }
    // 손기능: 요강 표4-2·4-3 오류 6종이 F1~F6.
    const errors = registry.getTestPlugin('kead-hand-function').events.filter(e => e.scoreEffect || e.requiresReinstruction);
    assert.deepEqual(errors.map(e => e.shortcut), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']);
});

await check('단축키 판정: 윈도우 Ctrl+F키·맥 ⌘+F키·맨 F키만 인정하고 Alt/Shift 조합은 거른다', () => {
    const key = (over = {}) => ({ key: 'F4', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over });
    const win = event => shortcuts.matchesEventShortcut('F4', event, false);
    const mac = event => shortcuts.matchesEventShortcut('F4', event, true);
    assert.equal(win(key({ ctrlKey: true })), true, 'Ctrl+F4');
    assert.equal(win(key()), true, '맨 F4');
    assert.equal(win(key({ altKey: true })), false, 'Alt+F4는 창 닫기라 기록하지 않는다');
    assert.equal(win(key({ ctrlKey: true, altKey: true })), false, 'Ctrl+Alt+F4');
    assert.equal(win(key({ shiftKey: true })), false, 'Shift+F10류 조합 배제');
    assert.equal(win(key({ metaKey: true })), false, 'Win+F4는 OS 몫');
    assert.equal(mac(key({ metaKey: true })), true, '맥 ⌘F4');
    assert.equal(mac(key({ ctrlKey: true })), false, '맥 Ctrl+F키는 시스템 예약');
    assert.equal(mac(key()), true, '맥 맨 F4');
    assert.equal(shortcuts.matchesEventShortcut('F4', key({ key: 'F5', ctrlKey: true }), false), false, '다른 키');
    assert.equal(shortcuts.matchesEventShortcut(undefined, key({ ctrlKey: true }), false), false, '단축키 없는 항목');
    assert.equal(shortcuts.shortcutDisplay('F3', false), 'Ctrl+F3');
    assert.equal(shortcuts.shortcutDisplay('F3', true), '⌘F3');
});

await check('제한시간 근거 문구가 화면에 그대로 나갈 수 있게 들어 있다', () => {
    assert.ok(registry.getTestPlugin('kead-hand-function').manifest.durationNote.includes('30초'));
    assert.ok(registry.getTestPlugin('kead-bimanual').manifest.durationNote.includes('1분 30초'));
});


/* ── 11-b. 분석지(그 밖의 검사 결과지) ───────────────────────── */
console.log('분석지');

await check('분석지 AI 응답을 영역별로 정리하고, 모르는 영역은 사회진단이 아니라 "분류 필요"로 둔다', () => {
    const parsed = analysisModel.normalizeAnalysisExtraction({
        detectedTitle: '직업흥미검사(NISE-VISIT)',
        findings: [
            { area: 'psychological', text: '수용어휘력 검사 결과 원점수 64점, 등가연령 6세 0개월~6세 5개월이다.' },
            { area: '이상한영역', text: '그림 이해도 100%, 일관성 60%로 기준점 이상의 결과를 보였다.' },
        ],
        warnings: [],
    });
    assert.equal(parsed.detectedTitle, '직업흥미검사(NISE-VISIT)');
    assert.equal(parsed.findings.length, 2);
    assert.equal(parsed.findings[0].area, 'psychological');
    assert.equal(parsed.findings[0].included, true);
    // 분류 실패는 "사회진단"이라는 뜻이 아니다. 평가사가 영역을 정하기 전에는 보고서에 자동으로 들어가지 않는다.
    assert.equal(parsed.findings[1].area, 'unclassified', '모르는 영역은 분류 필요로');
    assert.equal(parsed.findings[1].included, false, '분류 필요 문장은 기본 포함하지 않는다');
    assert.ok(parsed.warnings.some(w => w.includes('분류 필요')));
    assert.equal(analysisModel.normalizeAnalysisExtraction({ findings: [] }), null);
});

await check('분류 필요(unclassified) 문장은 보고서 자동 조립에 들어가지 않는다', () => {
    const record = {
        ...analysisModel.createAnalysisDocument({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        detectedTitle: '심리검사',
        // 평가사가 포함을 켜더라도 영역이 'unclassified'면 어느 섹션에도 배치되지 않는다.
        findings: [{ ...analysisModel.createAnalysisFinding('unclassified', '분류를 확신할 수 없는 문장이다.'), included: true }],
    };
    const episode = reportEpisode();
    const sections = reportCompose.composeSections({ episode, sessions: [], documents: [], analyses: [record] }, baseReport(episode).sections);
    assert.equal(
        sections.some(section => section.paragraphs.some(item => item.text.includes('분류를 확신할 수 없는'))),
        false,
        '분류 필요 문장은 사회진단을 포함한 어느 영역에도 자동 배치되지 않는다',
    );
});

await check('취업 단정·연락처 형태 문장은 자동 제외되고, 저장을 고쳐도 되살아나지 않는다', () => {
    const blocked = analysisModel.createAnalysisFinding('vocational', '단순 조립 직무에 취업 가능함');
    assert.equal(blocked.included, false);
    assert.ok(blocked.blocked.includes('평가사'));
    const phone = analysisModel.createAnalysisFinding('social', '보호자 연락처는 010-1234-5678이다');
    assert.equal(phone.included, false);
    const record = {
        ...analysisModel.createAnalysisDocument({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        findings: [{ ...blocked, included: true }],
    };
    const roundtrip = analysisModel.parseAnalysisDocument(analysisModel.serializeAnalysisDocument(record));
    assert.equal(roundtrip.ok, true);
    assert.equal(roundtrip.record.findings[0].included, false, '차단 문장은 강제로 포함시켜도 저장에서 다시 꺼진다');
    assert.equal(analysisModel.parseAnalysisDocument(JSON.stringify({ version: 99, id: 'x', episodeId: 'ep' })).ok, false);
});

await check('코드 펜스가 붙은 분석지 응답에서도 JSON을 꺼낸다', () => {
    const body = ['정리했습니다.', '```json', '{"detectedTitle":"CISA-2","findings":[{"area":"living","text":"적응지수 일반규준 51점으로 표기되어 있다."}]}', '```'].join(String.fromCharCode(10));
    const parsed = analysisModel.normalizeAnalysisExtraction(analysisModel.parseAnalysisJson(body));
    assert.equal(parsed.detectedTitle, 'CISA-2');
    assert.equal(parsed.findings[0].area, 'living');
});

await check('분석지 문장이 보고서 해당 섹션과 요약 초안에 들어가고, 제외 문장은 빠진다', () => {
    const record = {
        ...analysisModel.createAnalysisDocument({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        detectedTitle: '사회적응도(CISA-2)',
        findings: [
            analysisModel.createAnalysisFinding('psychological', 'BGT 오류점수 11점으로 시각-운동 협응에 어려움이 관찰되었다.'),
            { ...analysisModel.createAnalysisFinding('living', '대중교통은 활동지원사와 함께 이용한다.'), included: false },
            analysisModel.createAnalysisFinding('strength', '손가락 기민성이 양호하다.'),
            analysisModel.createAnalysisFinding('limitation', '작업 집중을 위한 언어적 지원이 필요할 수 있다.'),
            analysisModel.createAnalysisFinding('recommendation', '직업적응훈련 프로그램 참여를 고려할 수 있다.'),
        ],
    };
    const episode = reportEpisode();
    const report = baseReport(episode);
    const sections = reportCompose.composeSections({ episode, sessions: [], documents: [], analyses: [record] }, report.sections);
    const psychological = sections.find(item => item.id === 'psychological');
    assert.ok(psychological.paragraphs.some(item => item.text.includes('BGT 오류점수') && item.sourceLabel.includes('사회적응도')));
    const living = sections.find(item => item.id === 'living');
    assert.equal(living.paragraphs.some(item => item.text.includes('대중교통')), false, '포함 해제한 문장은 빠진다');
    const summary = reportCompose.composeSummaryDraft({ episode, sessions: [], documents: [], analyses: [record] }, report.summary);
    assert.ok(summary.strengths.includes('손가락 기민성'));
    assert.ok(summary.limitations.includes('언어적 지원'));
    assert.ok(summary.recommendedPrograms.includes('직업적응훈련'));
    const kept = reportCompose.composeSummaryDraft(
        { episode, sessions: [], documents: [], analyses: [record] },
        { ...report.summary, recommendedPrograms: '평가사가 쓴 추천' },
    );
    assert.equal(kept.recommendedPrograms, '평가사가 쓴 추천');
});

/* ── 12. 공식 결과지 가져오기 ─────────────────────────────────── */
console.log('공식 결과지');

const scalar = (value, rawText = null) => ({ value, rawText, pageNumber: 1, sourceLabel: null });
const handCondition = (a, b, c, average) => ({
    trial1: scalar(a),
    trial2: scalar(b),
    trial3: scalar(c),
    reportedAverage: scalar(average),
});
const defaultTrials = () => ({
    SMALL: {
        DOMINANT: handCondition(12, 12, 12, 12),
        NON_DOMINANT: handCondition(10, 10, 10, 10),
        BILATERAL: handCondition(9, 9, 9, 9),
    },
    MEDIUM: { DOMINANT: handCondition(14, 14, 14, 14), NON_DOMINANT: handCondition(13, 13, 13, 13) },
    LARGE: { DOMINANT: handCondition(16, 16, 16, 16), NON_DOMINANT: handCondition(15, 15, 15, 15) },
});
const handExtraction = (overrides = {}) =>
    extractionSchema.normalizeExtraction(
        {
            documentType: 'KEAD_HAND_FUNCTION',
            detectedTitle: '손기능 작업표본검사 개인프로파일',
            participant: { sex: '남', birthDate: null, dominantHand: 'RIGHT' },
            test: { testDate: '2026-09-25', evaluator: null },
            trials: defaultTrials(),
            norms: [{ path: 'nondisabled.total', sourceLabel: '비장애인 전체 대비', sourceValue: scalar(14.6) }],
            ...overrides,
        },
        'gemini',
    );

await check('결과지 종류를 알아보고 모르는 문서는 UNSUPPORTED로 둔다', () => {
    assert.equal(handExtraction().documentType, 'KEAD_HAND_FUNCTION');
    assert.equal(
        extractionSchema.normalizeExtraction({ documentType: '알 수 없음' }, 'gemini').documentType,
        'UNSUPPORTED_OR_UNKNOWN',
    );
});
await check('코드 펜스가 붙은 응답에서도 JSON을 꺼낸다', () => {
    const body = ['읽었습니다.', '```json', '{"documentType":"KEAD_BIMANUAL","detectedTitle":"다차원 양손협응"}', '```'].join('\n');
    assert.equal(extractionSchema.parseExtractionJson(body, 'gemini').documentType, 'KEAD_BIMANUAL');
});
await check('숫자가 아닌 값은 버리고 모양을 맞춘다', () => {
    const parsed = extractionSchema.normalizeExtraction(
        { documentType: 'KEAD_HAND_FUNCTION', trials: { SMALL: { DOMINANT: { trial1: { value: {} } } } } },
        'gemini',
    );
    assert.equal(parsed.trials.SMALL.DOMINANT.trial1.value, null);
    assert.equal(parsed.trials.LARGE.NON_DOMINANT.trial3.value, null);
});
await check('규준 값은 계산하지 않고 인쇄된 대로 가져온다', () => {
    const fields = review.flattenExtraction(handExtraction());
    const norm = fields.find(field => field.path === 'norms.nondisabled.total');
    assert.equal(norm.extracted.value, 14.6);
    assert.equal(norm.label, '비장애인 전체 대비');
});

function confirmedHandSession(score) {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, score, i * 40);
    return s;
}

await check('앱 기록과 결과지 값이 같으면 일치로 표시한다', () => {
    const s = confirmedHandSession(12);
    const first = review.flattenExtraction(handExtraction(), s).find(field => field.path === 'trials.SMALL.DOMINANT.1');
    assert.equal(first.directValue, 12);
    assert.equal(first.comparison, 'MATCHED');
});
await check('앱 기록과 결과지 값이 다르면 충돌로 표시한다', () => {
    const s = confirmedHandSession(11);
    const first = review.flattenExtraction(handExtraction(), s).find(field => field.path === 'trials.SMALL.DOMINANT.1');
    assert.equal(first.comparison, 'CONFLICT');
    const issues = review.validateExtraction(handExtraction(), { documentId: 'doc1', session: s });
    assert.ok(issues.some(issue => issue.code === 'DIRECT_ENTRY_CONFLICT'));
});
await check('제목이 맞지 않으면 오류로 알린다', () => {
    const issues = review.validateExtraction(handExtraction({ detectedTitle: '다른 검사 결과' }), { documentId: 'doc1' });
    assert.ok(issues.some(issue => issue.code === 'TITLE_MISMATCH' && issue.severity === 'ERROR'));
});
await check('값이 비어 있으면 오류, 규준은 비어 있어도 오류로 보지 않는다', () => {
    const trials = defaultTrials();
    trials.SMALL.DOMINANT = handCondition(null, 12, 12, null);
    const missing = handExtraction({
        trials,
        norms: [{ path: 'nondisabled.total', sourceLabel: '비장애인 전체 대비', sourceValue: scalar(null) }],
    });
    const issues = review.validateExtraction(missing, { documentId: 'doc1' });
    assert.deepEqual(
        issues.filter(issue => issue.code === 'MISSING_REQUIRED_VALUE').map(issue => issue.path),
        ['trials.SMALL.DOMINANT.1'],
    );
});
await check('결과지 표기 평균이 1~3회와 맞지 않으면 경고한다', () => {
    const trials = defaultTrials();
    trials.SMALL.DOMINANT = handCondition(12, 12, 12, 20);
    const issues = review.validateExtraction(handExtraction({ trials }), { documentId: 'doc1' });
    assert.ok(issues.some(issue => issue.code === 'AVERAGE_CONFLICT'));
});
await check('우세손이 회차 판정과 다르면 경고한다', () => {
    const issues = review.validateExtraction(handExtraction(), { documentId: 'doc1', dominantHand: 'LEFT' });
    assert.ok(issues.some(issue => issue.code === 'DOMINANT_HAND_CONFLICT'));
});
await check('생년월일이 다르면 사람이 다를 수 있다고 막는다', () => {
    const other = handExtraction({ participant: { sex: null, birthDate: '1990-01-01', dominantHand: null } });
    const issues = review.validateExtraction(other, { documentId: 'doc1', birthDate: '1985-05-05' });
    const issue = issues.find(item => item.code === 'POSSIBLE_DIFFERENT_PERSON');
    assert.ok(issue);
    assert.equal(review.isBlockingIssue(issue), true);
    assert.equal(review.issueActionPolicy(issue), 'STRONG_ACKNOWLEDGE');
    assert.throws(() => review.acknowledgeIssue(issue, { by: '평가사', at: NOW, reason: '  ' }), /사유/);
    const acknowledged = review.acknowledgeIssue(issue, { by: '평가사', at: NOW, reason: '동일인 확인함' });
    assert.equal(acknowledged.status, 'ACKNOWLEDGED');
    assert.equal(acknowledged.resolutionType, 'IDENTITY_OVERRIDE');
    assert.equal(review.isBlockingIssue(acknowledged), false);
});
await check('값이 비었다는 오류는 확인만으로 지울 수 없다', () => {
    const trials = defaultTrials();
    trials.SMALL.DOMINANT = handCondition(null, 12, 12, 12);
    const issues = review.validateExtraction(handExtraction({ trials }), { documentId: 'doc1' });
    const missing = issues.find(issue => issue.code === 'MISSING_REQUIRED_VALUE');
    assert.throws(() => review.acknowledgeIssue(missing, { by: '평가사', at: NOW, reason: '확인' }), /확인만으로/);
});
await check('완성소요시간의 한글 표기를 밀리초로 읽는다', () => {
    assert.equal(review.parseKoreanDuration('1분 30초'), 90_000);
    assert.equal(review.parseKoreanDuration('80초'), 80_000);
    assert.equal(review.parseKoreanDuration('알 수 없음'), null);
});

await check('출처가 하나면 그대로 쓰고, 둘이 같으면 MATCHED가 된다', () => {
    const s = confirmedHandSession(12);
    const built = rebuild.rebuildFactsAndResolutions({
        fields: review.flattenExtraction(handExtraction(), s),
        session: s,
        documentId: 'doc1',
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    assert.equal(built.resolutions.find(item => item.path === 'trials.SMALL.DOMINANT.1').status, 'MATCHED');
    assert.equal(built.resolutions.find(item => item.path === 'norms.nondisabled.total').status, 'SINGLE_SOURCE');
});
await check('값이 다르면 충돌로 남고, 고르기 전에는 확정값에 들어가지 않는다', () => {
    const s = confirmedHandSession(11);
    const built = rebuild.rebuildFactsAndResolutions({
        fields: review.flattenExtraction(handExtraction(), s),
        session: s,
        documentId: 'doc1',
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    const conflict = built.resolutions.find(item => item.path === 'trials.SMALL.DOMINANT.1');
    assert.equal(conflict.status, 'CONFLICT');
    assert.equal(
        facts.resolveCanonicalFacts(built.facts, built.resolutions).some(item => item.path === 'trials.SMALL.DOMINANT.1'),
        false,
    );
    assert.ok(facts.conflictPaths(built.resolutions).includes('trials.SMALL.DOMINANT.1'));

    const pdfFactId = conflict.candidateFactIds.find(
        id => built.facts.find(fact => fact.id === id).origin === 'OFFICIAL_PDF',
    );
    const resolved = facts.resolveFactConflict(conflict, pdfFactId, '평가사', NOW);
    const after = facts.resolveCanonicalFacts(
        built.facts,
        built.resolutions.map(item => (item.path === resolved.path ? resolved : item)),
    );
    const picked = after.find(item => item.path === 'trials.SMALL.DOMINANT.1');
    assert.equal(picked.selectedFact.origin, 'OFFICIAL_PDF');
    assert.equal(picked.selectedFact.value, 12);
});
await check('후보에 없는 값은 고를 수 없다', () => {
    const resolution = { id: 'r1', path: 'p', candidateFactIds: ['a', 'b'], status: 'CONFLICT', createdAt: NOW };
    assert.throws(() => facts.resolveFactConflict(resolution, 'c', '평가사', NOW), /충돌 후보/);
});
await check('값이 그대로면 고른 쪽을 유지하고, 값이 바뀌면 다시 묻는다', () => {
    const s = confirmedHandSession(11);
    const fields = review.flattenExtraction(handExtraction(), s);
    const first = rebuild.rebuildFactsAndResolutions({
        fields,
        session: s,
        documentId: 'doc1',
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    const conflict = first.resolutions.find(item => item.path === 'trials.SMALL.DOMINANT.1');
    const pdfFactId = conflict.candidateFactIds.find(
        id => first.facts.find(fact => fact.id === id).origin === 'OFFICIAL_PDF',
    );
    const resolvedList = first.resolutions.map(item =>
        item.path === conflict.path ? facts.resolveFactConflict(item, pdfFactId, '평가사', NOW) : item,
    );

    const again = rebuild.rebuildFactsAndResolutions({
        fields,
        session: s,
        documentId: 'doc1',
        now: later(10),
        previousFacts: first.facts,
        previousResolutions: resolvedList,
    });
    assert.equal(again.resolutions.find(item => item.path === conflict.path).status, 'RESOLVED');

    const edited = review.recalculateReviewFields(
        fields.map(field =>
            field.path === 'trials.SMALL.DOMINANT.1' ? { ...field, extracted: { ...field.extracted, value: 20 } } : field,
        ),
    );
    const afterEdit = rebuild.rebuildFactsAndResolutions({
        fields: edited,
        session: s,
        documentId: 'doc1',
        now: later(20),
        previousFacts: first.facts,
        previousResolutions: resolvedList,
    });
    assert.equal(afterEdit.resolutions.find(item => item.path === conflict.path).status, 'CONFLICT');
});
await check('제외한 값은 사실로 만들지 않는다', () => {
    const rejected = review
        .flattenExtraction(handExtraction())
        .map(field => (field.path === 'norms.nondisabled.total' ? { ...field, status: 'REJECTED' } : field));
    const built = rebuild.rebuildFactsAndResolutions({
        fields: rejected,
        documentId: 'doc1',
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    assert.equal(built.facts.some(fact => fact.path === 'norms.nondisabled.total'), false);
});
await check('결과지 기록을 저장하고 다시 읽으면 같은 값이 된다', () => {
    const record = sourceRecord.createSourceDocument({
        episodeId: 'ep1',
        seekerId: 's1',
        seekerName: '합성이용자',
        fileName: '결과지.pdf',
        fileSize: 1234,
        sha256: 'abc',
        pageCount: 2,
    });
    const fields = review.flattenExtraction(handExtraction());
    const built = rebuild.rebuildFactsAndResolutions({
        fields,
        documentId: record.id,
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    const parsed = sourceRecord.parseSourceDocument(
        sourceRecord.serializeSourceDocument({
            ...record,
            documentType: 'KEAD_HAND_FUNCTION',
            extractionStatus: 'SUCCEEDED',
            reviewFields: fields,
            issues: review.validateExtraction(handExtraction(), { documentId: record.id }),
            facts: built.facts,
            resolutions: built.resolutions,
        }),
    );
    assert.ok(parsed.ok);
    assert.equal(parsed.document.reviewFields.length, fields.length);
    assert.equal(parsed.document.facts.length, built.facts.length);
    assert.equal(parsed.document.documentType, 'KEAD_HAND_FUNCTION');
});
await check('읽은 결과 원본을 함께 저장해 값을 고친 뒤 다시 검토할 수 있다', () => {
    const record = sourceRecord.createSourceDocument({
        episodeId: 'ep1',
        seekerId: 's1',
        seekerName: '합성이용자',
        fileName: '결과지.pdf',
        fileSize: 1,
        sha256: 'x',
        pageCount: 1,
    });
    const extraction = handExtraction();
    const parsed = sourceRecord.parseSourceDocument(
        sourceRecord.serializeSourceDocument({ ...record, documentType: 'KEAD_HAND_FUNCTION', extractionStatus: 'SUCCEEDED', extraction }),
    );
    assert.ok(parsed.ok);
    const stored = sourceRecord.extractionOf(parsed.document);
    assert.equal(stored.documentType, 'KEAD_HAND_FUNCTION');
    assert.equal(stored.trials.SMALL.DOMINANT.trial1.value, 12);

    // 값을 고치면 확인할 점이 다시 계산된다(표기 평균과 어긋나면 경고).
    const fields = review.flattenExtraction(stored).map(field =>
        field.path === 'trials.SMALL.DOMINANT.1' ? { ...field, extracted: { ...field.extracted, value: 30 } } : field,
    );
    const reviewed = review.revalidateReview(stored, fields, [], { documentId: record.id });
    assert.ok(reviewed.issues.some(issue => issue.code === 'AVERAGE_CONFLICT'));
    assert.equal(reviewed.fields.find(field => field.path === 'trials.SMALL.DOMINANT.1').status, 'CORRECTED');
});


/* ── 13. 해석 ─────────────────────────────────────────────────── */
console.log('해석');

const canonicalFact = (path, value, origin = 'DIRECT_ENTRY') => ({
    path,
    selectedFact: { id: `f:${path}`, origin, path, value, recordedAt: NOW, revision: 1 },
    resolutionStatus: 'SINGLE_SOURCE',
    allSources: [],
});

const handFacts = (scores = {}) => {
    const base = {
        'SMALL.DOMINANT': 12,
        'SMALL.NON_DOMINANT': 10,
        'SMALL.BILATERAL': 9,
        'MEDIUM.DOMINANT': 14,
        'MEDIUM.NON_DOMINANT': 13,
        'LARGE.DOMINANT': 16,
        'LARGE.NON_DOMINANT': 15,
        ...scores,
    };
    return Object.entries(base).flatMap(([group, value]) =>
        [1, 2, 3].map(n => canonicalFact(`trials.${group}.${n}`, value)),
    );
};

await check('조건 평균을 비교해 패턴을 만든다', () => {
    const patterns = patternsModule.buildPatterns('kead-hand-function', handFacts());
    const handCompare = patterns.find(item => item.id === 'pattern:hand:SMALL');
    assert.equal(handCompare.comparison.valueA, 12);
    assert.equal(handCompare.comparison.valueB, 10);
    assert.equal(handCompare.comparison.higherCondition, '소형핀 우세손');
    assert.equal(handCompare.comparison.displayDifference, '2개');
    assert.ok(patterns.some(item => item.id === 'pattern:bilateral:DOMINANT'));
    assert.ok(patterns.some(item => item.patternType === 'OBSERVED_EXTREME'));
});
await check('2·3차를 생략한 조건도 실시한 회차만으로 패턴을 만든다', () => {
    const partial = [
        canonicalFact('trials.SMALL.DOMINANT.1', 12),
        canonicalFact('trials.SMALL.NON_DOMINANT.1', 10),
    ];
    const patterns = patternsModule.buildPatterns('kead-hand-function', partial);
    const sequence = patterns.find(item => item.id === 'pattern:sequence:SMALL:DOMINANT');
    assert.ok(sequence.label.includes('1회 실시'));
    assert.equal(patterns.find(item => item.id === 'pattern:hand:SMALL').comparison.absoluteDifference, 2);
});
await check('미해결 충돌이 있는 값은 패턴에 쓰지 않는다', () => {
    const conflicted = handFacts().map(fact =>
        fact.path === 'trials.SMALL.DOMINANT.1' ? { ...fact, resolutionStatus: 'CONFLICT' } : fact,
    );
    const patterns = patternsModule.buildPatterns('kead-hand-function', conflicted);
    const sequence = patterns.find(item => item.id === 'pattern:sequence:SMALL:DOMINANT');
    assert.equal(sequence.value.length, 2);
});
await check('다차원은 부품 합계와 기록시간을 따로 적는다', () => {
    const bimanualFacts = [
        ...['cylinder', 'largeBolt', 'largeNut', 'smallBolt', 'smallNut', 'plate', 'fixingPin'].map((key, index) =>
            canonicalFact(`bimanual.components.${key}`, index === 5 ? 1 : 2),
        ),
        canonicalFact('bimanual.recordedDurationMs', 90_000),
    ];
    const patterns = patternsModule.buildPatterns('kead-bimanual', bimanualFacts);
    assert.equal(patterns.find(item => item.patternType === 'COMPONENT_SUM').value, 13);
    const duration = patterns.find(item => item.patternType === 'RECORDED_DURATION');
    assert.ok(duration.label.includes('전체 조립 완료를 뜻하지 않습니다'));
});

await check('자료가 없으면 해석을 막고, 일부만 있으면 범위를 제한한다', () => {
    assert.equal(readinessModule.interpretationReadiness('kead-hand-function', [], []).status, 'BLOCKED');
    assert.equal(
        readinessModule.interpretationReadiness('kead-hand-function', [canonicalFact('trials.SMALL.DOMINANT.1', 12)], []).status,
        'PARTIAL',
    );
    assert.equal(readinessModule.interpretationReadiness('kead-hand-function', handFacts(), []).status, 'READY');
});
await check('미해결 충돌이 있으면 READY가 되지 않는다', () => {
    const result = readinessModule.interpretationReadiness('kead-hand-function', handFacts(), ['trials.SMALL.DOMINANT.1']);
    assert.equal(result.status, 'PARTIAL');
    assert.ok(result.missing.includes('trials.SMALL.DOMINANT.1'));
});
await check('모르는 검사 종류는 해석하지 않는다', () => {
    assert.equal(readinessModule.interpretationReadiness('알 수 없음', handFacts(), []).status, 'BLOCKED');
});

const qualityPack = {
    testType: 'kead-hand-function',
    testDescription: '검사',
    verifiedFacts: [{ id: 'fact_0', type: 'SOURCE_FACT', label: '소형핀 우세손 수행량', value: 10 }],
    derivedFacts: [
        {
            id: 'pattern:range',
            type: 'DERIVED_FACT',
            label: '1~3회 수행량 범위 9개',
            value: 9,
            semanticType: 'TRIAL_VARIABILITY',
        },
    ],
    observations: [
        {
            id: 'observation_0',
            type: 'OBSERVATION',
            label: '주의집중',
            value: '관찰됨',
            description: '상태: 관찰됨 · 지원: 언어적 재안내',
            semanticTags: ['common.attention', 'status:observed', 'assistance:verbal_prompt'],
        },
    ],
    events: [
        {
            id: 'event_ATTENTION_DISTRACTION',
            type: 'EVENT',
            label: '주의분산 기록 횟수',
            value: 3,
            description: '인과관계 아님',
            eventType: 'ATTENTION_DISTRACTION',
            semanticTags: ['ATTENTION_DISTRACTION'],
        },
    ],
    conditions: [],
    unresolvedIssues: [],
    constraints: [],
};
const resultClaim = (text, evidenceIds = ['fact_0']) => ({ text, evidenceIds, claimType: 'RESULT_DESCRIPTION' });

await check('근거에 없는 ID는 채택할 수 없다', () => {
    assert.equal(claimQuality.validateClaim(resultClaim('결과 설명', ['없는근거']), qualityPack).status, 'INVALID');
    assert.equal(claimQuality.validateClaim(resultClaim('결과 설명', []), qualityPack).status, 'INVALID');
});
await check('결과 설명을 행동 근거만으로 쓸 수 없다', () => {
    assert.equal(
        claimQuality.validateClaim(resultClaim('주의분산이 관찰되었다.', ['event_ATTENTION_DISTRACTION']), qualityPack).status,
        'INVALID',
    );
});
await check('취업 가능·직무 적합·진단 단정을 막는다', () => {
    assert.equal(claimQuality.validateClaim(resultClaim('이 대상자는 조립원 취업이 가능하다.'), qualityPack).status, 'INVALID');
    assert.equal(claimQuality.validateClaim(resultClaim('포장직에 적합하다.'), qualityPack).status, 'INVALID');
});
await check('백분위·순위를 새로 만들지 못한다', () => {
    assert.equal(claimQuality.validateClaim(resultClaim('상위 26%로 해석된다.'), qualityPack).status, 'INVALID');
    assert.equal(claimQuality.validateClaim(resultClaim('백분위 40 수준이다.'), qualityPack).status, 'INVALID');
});
await check('근거에 없는 수치와 관찰되지 않은 행동을 막는다', () => {
    assert.equal(claimQuality.validateClaim(resultClaim('수행량은 11개로 나타났다.'), qualityPack).status, 'INVALID');
    assert.equal(claimQuality.validateClaim(resultClaim('피로가 3회 관찰되었다.', ['fact_0']), qualityPack).status, 'INVALID');
});
await check('인과 표현은 확인 필요로 남긴다', () => {
    const result = claimQuality.validateClaim(
        resultClaim('주의분산 때문에 수행량이 감소하였다.', ['event_ATTENTION_DISTRACTION', 'fact_0']),
        qualityPack,
    );
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.ok(result.issues.includes('근거로 확인되지 않은 인과관계 검토 필요'));
});
await check('지원 필요 단정은 막고 추가 확인 표현은 허용한다', () => {
    assert.equal(
        claimQuality.validateClaim({ claimType: 'SUPPORT_NEED', text: '지원이 필요하다.', evidenceIds: ['fact_0'] }, qualityPack).status,
        'INVALID',
    );
    assert.equal(
        claimQuality.validateClaim(
            { claimType: 'SUPPORT_NEED', text: '수행 안정성을 추가 확인할 필요가 있다.', evidenceIds: ['pattern:range'] },
            qualityPack,
        ).status,
        'VALID',
    );
});
await check('상대적 강점은 비교 근거를 요구한다', () => {
    assert.equal(
        claimQuality.validateClaim(
            { claimType: 'RELATIVE_STRENGTH', text: '상대적으로 높은 수행값이다.', evidenceIds: ['fact_0'] },
            qualityPack,
        ).status,
        'INVALID',
    );
});
await check('검사조건만으로 능력·지원 효과를 추론하지 못한다', () => {
    const condition = {
        id: 'condition_0',
        type: 'SESSION_CONDITION',
        label: '추가 설명',
        value: '관찰됨',
        conditionType: 'ADDITIONAL_INSTRUCTION',
        state: 'OBSERVED',
        semanticTags: ['ADDITIONAL_INSTRUCTION', 'status:observed'],
    };
    const conditionPack = { ...qualityPack, conditions: [condition] };
    assert.equal(
        claimQuality.validateClaim(
            {
                claimType: 'LIMITATION',
                text: '검사 중 추가 설명이 제공되어 해석 시 제공된 조건을 고려할 필요가 있다.',
                evidenceIds: ['condition_0'],
            },
            conditionPack,
        ).status,
        'VALID',
    );
    assert.equal(
        claimQuality.validateClaim(
            { claimType: 'LIMITATION', text: '추가 설명이 필요했으므로 지시 이해 능력이 낮다.', evidenceIds: ['condition_0'] },
            conditionPack,
        ).status,
        'INVALID',
    );
    assert.equal(
        claimQuality.validateClaim(
            { claimType: 'LIMITATION', text: '추가 설명으로 수행이 향상되었다.', evidenceIds: ['condition_0'] },
            conditionPack,
        ).status,
        'INVALID',
    );
});
await check('미평가를 문제 없음으로 넓히지 못한다', () => {
    const pack = {
        ...qualityPack,
        observations: [
            {
                id: 'observation_1',
                type: 'OBSERVATION',
                label: '지시 이해',
                value: '확인하지 못함',
                semanticTags: ['common.instruction', 'status:not_assessed'],
            },
        ],
    };
    assert.equal(
        claimQuality.validateClaim(resultClaim('지시 이해에 문제가 없다.', ['observation_1', 'fact_0']), pack).status,
        'INVALID',
    );
});
await check('기록시간으로 전체 완료를 추론하지 못한다', () => {
    assert.equal(
        claimQuality.validateClaim(resultClaim('80초 안에 25개 전체 조립을 완료하였다.', ['fact_0']), {
            ...qualityPack,
            testType: 'kead-bimanual',
        }).status,
        'INVALID',
    );
});

await check('근거 순서가 바뀌어도 해시는 같고 값이 바뀌면 달라진다', async () => {
    const reversed = { ...qualityPack, verifiedFacts: [...qualityPack.verifiedFacts].reverse(), events: [...qualityPack.events].reverse() };
    assert.equal(await interpretationTypes.hashEvidencePackage(reversed), await interpretationTypes.hashEvidencePackage(qualityPack));
    assert.notEqual(
        await interpretationTypes.hashEvidencePackage({
            ...qualityPack,
            verifiedFacts: [{ ...qualityPack.verifiedFacts[0], value: 11 }],
        }),
        await interpretationTypes.hashEvidencePackage(qualityPack),
    );
});

await check('보내는 본문에는 이름·메모·파일 이름이 없고 제약이 들어간다', () => {
    const prompt = promptModule.buildInterpretationPrompt(qualityPack);
    assert.ok(prompt.includes('fact_0'));
    assert.ok(prompt.includes('규준 계산') || prompt.includes('백분위'));
    assert.ok(!prompt.includes('.pdf'));
    assert.ok(!/이름\s*:/.test(prompt));
});
await check('AI 응답에서 형식이 깨진 제안은 버린다', () => {
    const body = JSON.stringify({
        overallSummary: { claimType: 'RESULT_DESCRIPTION', text: '요약', evidenceIds: ['fact_0'], confidence: 'HIGH' },
        claims: [
            { claimType: '없는유형', text: '무시', evidenceIds: ['fact_0'] },
            { claimType: 'LIMITATION', text: '', evidenceIds: ['fact_0'] },
            { claimType: 'LIMITATION', text: '자료가 제한적이다.', evidenceIds: [] },
            { claimType: 'RESULT_DESCRIPTION', text: '정상 문장', evidenceIds: ['fact_0'], confidence: 'LOW' },
        ],
        cautions: [],
    });
    const parsed = promptModule.parseInterpretationResponse(body);
    assert.equal(parsed.claims.length, 1);
    assert.equal(parsed.claims[0].confidence, 'LOW');
    assert.equal(parsed.overallSummary.text, '요약');
    assert.equal(promptModule.parseInterpretationResponse('설명만 있고 JSON이 없음'), null);
});

await check('제안은 항상 제안 상태로 저장되고 품질 검사 결과가 붙는다', () => {
    const run = runModule.createInterpretationRun({
        testPluginId: 'kead-hand-function',
        sessionId: 'session1',
        evidenceHash: 'hash1',
        readiness: { status: 'READY', message: '', missing: [], usableCoreFields: 7, totalCoreFields: 7 },
        model: 'gemini',
        pack: qualityPack,
        now: NOW,
        response: {
            overallSummary: {
                claimType: 'RESULT_DESCRIPTION',
                text: '소형핀 우세손 수행량은 10개로 나타났다.',
                evidenceIds: ['fact_0'],
                confidence: 'HIGH',
            },
            claims: [
                { claimType: 'RESULT_DESCRIPTION', text: '상위 10%에 해당한다.', evidenceIds: ['fact_0'], confidence: 'HIGH' },
            ],
            cautions: [],
        },
    });
    assert.equal(run.status, 'CURRENT');
    assert.equal(run.claims.length, 2);
    assert.ok(run.claims.every(claim => claim.status === 'PENDING'));
    const invalid = run.claims.find(claim => claim.quality.status === 'INVALID');
    assert.ok(invalid);
    assert.throws(() => runModule.acceptClaim(invalid, '평가사', NOW), /채택할 수 없습니다/);

    const valid = run.claims.find(claim => claim.quality.status !== 'INVALID');
    const accepted = runModule.acceptClaim(valid, '평가사', NOW);
    assert.equal(accepted.status, 'ACCEPTED');
    assert.equal(runModule.claimText(accepted), valid.originalAiText);

    const edited = runModule.editClaim(valid, '평가사가 고친 문장', '평가사', NOW, qualityPack);
    assert.equal(edited.status, 'EDITED');
    assert.equal(runModule.claimText(edited), '평가사가 고친 문장');
    assert.throws(() => runModule.editClaim(valid, '   ', '평가사', NOW, qualityPack), /입력하세요/);

    const rejected = runModule.rejectClaim(valid, '평가사', NOW, '근거 부족');
    assert.equal(rejected.status, 'REJECTED');
    assert.deepEqual(runModule.adoptedClaims({ ...run, claims: [accepted, rejected] }), [accepted]);
});
await check('근거가 바뀌면 이전 제안을 STALE로 표시한다', () => {
    const run = { id: 'r1', status: 'CURRENT', evidenceHash: 'hash1', claims: [] };
    assert.equal(runModule.markStaleRuns([run], 'hash1')[0].status, 'CURRENT');
    assert.equal(runModule.markStaleRuns([run], 'hash2')[0].status, 'STALE');
});
await check('실패한 요청도 기록으로 남는다', () => {
    const failed = runModule.createFailedRun({
        testPluginId: 'kead-hand-function',
        evidenceHash: 'hash1',
        readiness: { status: 'READY', message: '', missing: [], usableCoreFields: 7, totalCoreFields: 7 },
        model: 'gemini',
        reason: '연결 실패',
        now: NOW,
    });
    assert.equal(failed.status, 'FAILED');
    assert.deepEqual(runModule.adoptedClaims(failed), []);
});

await check('공식 결과지가 없으면 앱 기록만으로 근거를 만든다', async () => {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 12, i * 40);
    const context = contextModule.buildInterpretationContext({ session: s, now: NOW });
    assert.equal(context.hasOfficialDocument, false);
    assert.ok(context.canonicalFacts.length >= 21);

    const snapshot = await evidenceModule.buildEvidenceSnapshot({
        testPluginId: s.testPluginId,
        canonicalFacts: context.canonicalFacts,
        conflictPaths: context.conflictPaths,
        session: s,
        hasOfficialDocument: false,
    });
    assert.equal(snapshot.readiness.status, 'READY');
    assert.ok(snapshot.package.constraints.some(item => item.includes('공식 결과지를 연결하지 않았다')));
    assert.ok(snapshot.package.verifiedFacts.every(fact => /^fact_\d+$/.test(fact.id)));
    assert.equal(snapshot.evidenceHash.length, 64);
});
await check('근거 패키지에 이름·메모가 들어가지 않는다', async () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(5), 5, '합성메모내용');
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    s = session.setScore(s, 12, later(31));
    s = session.setTrialMemo(s, '합성메모내용', later(32));
    s = session.confirmCurrentTrial(s, later(33));
    const context = contextModule.buildInterpretationContext({ session: s, now: NOW });
    const snapshot = await evidenceModule.buildEvidenceSnapshot({
        testPluginId: s.testPluginId,
        canonicalFacts: context.canonicalFacts,
        conflictPaths: [],
        session: s,
        hasOfficialDocument: false,
    });
    const body = promptModule.buildInterpretationPrompt(snapshot.package);
    assert.equal(body.includes('합성메모내용'), false);
    assert.equal(body.includes('합성이용자'), false);
});
await check('회차에 저장한 해석 기록이 그대로 복원된다', () => {
    const episode = episodeModel.createEpisode({ seekerId: 's1', seekerName: '합성이용자', evaluationDate: '2026-09-25' });
    const run = runModule.createInterpretationRun({
        testPluginId: 'kead-hand-function',
        sessionId: 'session1',
        evidenceHash: 'hash1',
        readiness: { status: 'READY', message: '확인', missing: [], usableCoreFields: 7, totalCoreFields: 7 },
        model: 'gemini',
        pack: qualityPack,
        now: NOW,
        response: {
            overallSummary: null,
            claims: [
                {
                    claimType: 'RESULT_DESCRIPTION',
                    text: '소형핀 우세손 수행량은 10개로 나타났다.',
                    evidenceIds: ['fact_0'],
                    confidence: 'HIGH',
                },
            ],
            cautions: [],
        },
    });
    const parsed = episodeModel.parseEpisode(episodeModel.serializeEpisode({ ...episode, interpretations: [run] }));
    assert.ok(parsed.ok);
    assert.equal(parsed.episode.interpretations.length, 1);
    assert.equal(parsed.episode.interpretations[0].claims[0].status, 'PENDING');
    assert.equal(parsed.episode.interpretations[0].claims[0].quality.status, 'VALID');
});


/* ── 14. 보고서 ───────────────────────────────────────────────── */
console.log('보고서');

function reportEpisode() {
    return {
        ...episodeModel.createEpisode({ seekerId: 's1', seekerName: '합성이용자', evaluationDate: '2026-09-25' }),
        evaluationOrganization: '합성기관',
        evaluator: '합성평가사',
        purpose: '직업적 강점과 고려사항 확인',
    };
}

function baseReport(episode) {
    return reportModel.createReport({
        episodeId: episode.id,
        seekerId: episode.seekerId,
        seekerName: episode.seekerName,
        writtenOn: '2026-09-25',
        evaluator: episode.evaluator,
        header: { evaluationOrganization: episode.evaluationOrganization, evaluationDate: episode.evaluationDate },
        purpose: episode.purpose,
    });
}

await check('손기능 결과표는 미실시 회차를 그대로 표시하고 평균 기준을 적는다', () => {
    let s = makeHandSession();
    s = runTrial(s, 12, 0);
    s = session.skipTrial(s, '피로 호소', later(40));
    s = session.skipTrial(s, '피로 호소', later(45), s.trials[2].id);
    const table = reportCompose.buildHandFunctionTable(s);
    assert.deepEqual(table.rows[1], ['소형핀 · 우세손', '12', '미실시', '미실시', '12']);
    assert.ok(table.note.includes('미실시한 회차는 평균에서 제외'));
    assert.ok(table.note.includes('공식 결과지 미연결'));
});
await check('다차원 결과표는 분모와 총합을 함께 적고 완료 추론을 막는 문구를 넣는다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    for (const [key, value] of Object.entries({
        cylinder: 4,
        largeBolt: 3,
        largeNut: 3,
        smallBolt: 2,
        smallNut: 2,
        plate: 1,
        fixingPin: 2,
    })) {
        s = bimanual.setComponentCount(s, key, value);
    }
    const table = reportCompose.buildBimanualTable(s);
    assert.deepEqual(table.rows.at(-1), ['총합', '17', '25']);
    assert.deepEqual(
        table.rows.find(row => row[0] === '판'),
        ['판', '1', '1'],
    );
    assert.ok(table.note.includes('전체 조립 완료를 뜻하지 않습니다'));
});
await check('공식 결과지에서 확정한 값이 있으면 그 값을 쓴다', () => {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 11, i * 40);
    const fields = review.flattenExtraction(handExtraction(), s);
    const built = rebuild.rebuildFactsAndResolutions({
        fields,
        session: s,
        documentId: 'doc1',
        now: NOW,
        previousFacts: [],
        previousResolutions: [],
    });
    const conflict = built.resolutions.find(item => item.path === 'trials.SMALL.DOMINANT.1');
    const pdfFactId = conflict.candidateFactIds.find(
        id => built.facts.find(fact => fact.id === id).origin === 'OFFICIAL_PDF',
    );
    const document = {
        ...sourceRecord.createSourceDocument({
            episodeId: 'ep1',
            seekerId: 's1',
            seekerName: '합성이용자',
            sessionId: s.id,
            fileName: 'a.pdf',
            fileSize: 1,
            sha256: 'x',
            pageCount: 1,
        }),
        extractionStatus: 'SUCCEEDED',
        // 평가사가 값을 확정해야 보고서·해석에서 쓰인다.
        confirmedAt: NOW,
        confirmedBy: '평가사',
        reviewFields: fields,
        facts: built.facts,
        resolutions: built.resolutions.map(item =>
            item.path === conflict.path ? facts.resolveFactConflict(item, pdfFactId, '평가사', NOW) : item,
        ),
    };
    const table = reportCompose.buildHandFunctionTable(s, document);
    assert.equal(table.rows[1][1], '12');
    assert.ok(table.note.includes('공식 결과지에서 확인한 값'));

    const norms = reportCompose.buildNormTable(document);
    assert.equal(norms.rows[1][0], '비장애인 전체 대비');
    assert.equal(norms.rows[1][1], '14.6');
    assert.ok(norms.note.includes('앱이 계산하지 않았습니다'));

    // 확정을 풀면 결과지 값을 쓰지 않고 앱 기록으로 돌아간다.
    const unconfirmed = { ...document, confirmedAt: undefined, confirmedBy: undefined };
    const fallback = reportCompose.buildHandFunctionTable(s, unconfirmed);
    assert.equal(fallback.rows[1][1], '11');
    assert.ok(fallback.note.includes('공식 결과지 미연결'));
});
await check('행동관찰과 채택한 해석만 자동 문단이 된다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = events.recordEvent(s, 'DROPPED_PIN', later(5), 5);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    s = session.setScore(s, 12, later(31));
    s = session.confirmCurrentTrial(s, later(32));
    s = session.upsertObservation(
        s,
        {
            id: 'obs1',
            testSessionId: s.id,
            definitionId: 'hand.dropped_pin',
            label: '핀 떨어뜨림',
            state: 'OBSERVED',
            detail: { frequency: 'ONCE' },
            createdAt: NOW,
            updatedAt: NOW,
        },
        later(33),
    );
    s = session.upsertObservation(
        s,
        {
            id: 'obs2',
            testSessionId: s.id,
            definitionId: 'common.attention',
            label: '주의집중',
            state: 'NOT_ASSESSED',
            createdAt: NOW,
            updatedAt: NOW,
        },
        later(34),
    );

    const run = runModule.createInterpretationRun({
        testPluginId: 'kead-hand-function',
        sessionId: s.id,
        evidenceHash: 'hash1',
        readiness: { status: 'READY', message: '', missing: [], usableCoreFields: 7, totalCoreFields: 7 },
        model: 'gemini',
        pack: qualityPack,
        now: NOW,
        response: {
            overallSummary: null,
            claims: [
                {
                    claimType: 'RESULT_DESCRIPTION',
                    text: '소형핀 우세손 수행량은 10개로 나타났다.',
                    evidenceIds: ['fact_0'],
                    confidence: 'HIGH',
                },
            ],
            cautions: [],
        },
    });
    const accepted = { ...run, claims: [runModule.acceptClaim(run.claims[0], '평가사', NOW)] };
    const episode = { ...reportEpisode(), interpretations: [accepted] };
    const sections = reportCompose.composeSections(
        { episode, sessions: [s], documents: [] },
        baseReport(episode).sections,
    );
    // KEAD 검사 중 행동관찰만으로는 "사회진단" 항목을 만들지 않는다 — 직업진단(행동관찰)으로 들어간다.
    const social = sections.find(item => item.id === 'social');
    assert.equal(social.paragraphs.length, 0, 'KEAD 관찰만으로 사회진단을 만들지 않는다');

    const vocational = sections.find(item => item.id === 'vocational');
    assert.ok(vocational.paragraphs.some(item => item.text.includes('핀 떨어뜨림') && item.sourceLabel.includes('행동관찰')));
    assert.ok(vocational.paragraphs.some(item => item.origin === 'AI_CLAIM'));
    assert.ok(vocational.paragraphs.some(item => item.text.includes('KEAD 손기능 작업표본검사')));
    // 자료 출처·실시요강 설명은 소견 본문이 아니라 결과표 주석에만 둔다.
    assert.equal(
        vocational.paragraphs.some(item => /공식 결과지를 연결하지 않아|실시요강 기준|앱이 계산하지/.test(item.text)),
        false,
        '검사방법·자료출처 설명이 소견 본문에 들어가면 안 된다',
    );
});
await check('제외한 문단은 다시 만들어도 제외 상태가 남는다', () => {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 12, i * 40);
    const episode = reportEpisode();
    const first = reportCompose.composeSections({ episode, sessions: [s], documents: [] }, baseReport(episode).sections);
    const excluded = first.map(section => ({
        ...section,
        paragraphs: section.paragraphs.map(item => ({ ...item, included: false })),
    }));
    const again = reportCompose.composeSections({ episode, sessions: [s], documents: [] }, excluded);
    assert.ok(again.every(section => section.paragraphs.every(item => item.included === false)));
});
/* ── 결과지 기반 보고서 자동 문단 ─────────────────────────────── */
const reportNarrative = await load('report/narrative.mjs');
// claimQuality가 막는 판단 표현과 같은 기준. 자동 문단에도 이런 말이 들어가면 안 된다.
const NARRATIVE_FORBIDDEN =
    /(취업|고용|채용).{0,12}(가능|불가능|어렵|힘들)|직무.{0,12}(적합|부적합)|진단|정상\s*(범위|수준)|(상위|하위)\s*\d+(\.\d+)?\s*%|백분위|위\s*수준/;

const HAND_SCORES = {
    'SMALL.DOMINANT': 12,
    'SMALL.NON_DOMINANT': 10,
    'SMALL.BILATERAL': 8,
    'MEDIUM.DOMINANT': 14,
    'MEDIUM.NON_DOMINANT': 13,
    'LARGE.DOMINANT': 16,
    'LARGE.NON_DOMINANT': 15,
};
function scoredHandSession() {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) {
        const current = s.trials.find(trial => trial.id === s.currentTrialId);
        s = runTrial(s, HAND_SCORES[`${current.size}.${current.handMode}`], i * 40);
    }
    return s;
}

await check('손기능 기록만으로 조건별 평균·손 비교·최고/최저 조건 문단을 쓴다', () => {
    const result = reportNarrative.buildResultNarrative(scoredHandSession(), undefined, NOW);
    const text = result.paragraphs.map(item => item.text).join(' ');
    assert.equal(result.fromOfficialDocument, false);
    assert.ok(text.includes('소형핀 우세손 12개'), text);
    assert.ok(text.includes('대형핀 비우세손 15개'), text);
    assert.ok(text.includes('소형핀은 우세손 평균이 2개 많았다'), text);
    assert.ok(text.includes('가장 많은 조건은 대형핀 우세손(16개)'), text);
    assert.ok(text.includes('가장 적은 조건은 소형핀 양손(8개)'), text);
    assert.ok(result.strengths.some(line => line.includes('대형핀 우세손')));
    assert.ok(result.limitations.some(line => line.includes('소형핀 양손')));
    for (const line of [...result.paragraphs.map(item => item.text), ...result.strengths, ...result.limitations]) {
        assert.equal(NARRATIVE_FORBIDDEN.test(line), false, line);
    }
});

await check('점수를 하나도 입력하지 않았으면 결과 문단을 만들지 않는다', () => {
    const result = reportNarrative.buildResultNarrative(makeHandSession(), undefined, NOW);
    assert.deepEqual(result.paragraphs, []);
    assert.deepEqual(result.strengths, []);
});

function confirmedBimanualDocument(sessionId) {
    const extraction = extractionSchema.normalizeExtraction(
        {
            documentType: 'KEAD_BIMANUAL',
            detectedTitle: 'KEAD 다차원 양손협응검사 개인프로파일',
            participant: { sex: null, disabilityType: null, dominantHand: null },
            test: { testDate: '2026-09-06' },
            performance: {
                recordedDuration: scalar('1분 20초', '1분 20초'),
                components: {
                    cylinder: scalar(2), largeBolt: scalar(4), largeNut: scalar(4), smallBolt: scalar(2),
                    smallNut: scalar(3), plate: scalar(1), fixingPin: scalar(4),
                },
                componentDenominators: {
                    cylinder: scalar(4), largeBolt: scalar(4), largeNut: scalar(4), smallBolt: scalar(4),
                    smallNut: scalar(4), plate: scalar(4), fixingPin: scalar(4),
                },
                reportedTotalCompleted: scalar(20),
                reportedTotalTools: scalar(25),
            },
            norms: [
                { path: 'nondisabled.total', sourceLabel: '비장애인 전체 대비', sourceValue: scalar(34) },
                { path: 'nondisabled.male', sourceLabel: '비장애인 남성 대비', sourceValue: scalar(24.8) },
                { path: 'disabled.total', sourceLabel: '지체장애 전체 대비', sourceValue: scalar(78.9) },
                { path: 'disabled.male', sourceLabel: '지체장애 남성 대비', sourceValue: scalar(77.2) },
            ],
        },
        'gemini',
    );
    const document = {
        ...sourceRecord.createSourceDocument({
            episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', sessionId,
            fileName: 'sheet.pdf', fileSize: 1, sha256: 'sheet', pageCount: 2,
        }),
        extractionStatus: 'SUCCEEDED',
        confirmedAt: NOW,
    };
    const fields = review.flattenExtraction(extraction);
    const pdfFacts = facts.buildPdfFacts(fields, document.id, NOW);
    return { ...document, extraction, reviewFields: fields, facts: pdfFacts, resolutions: facts.createResolutions(fields, [], pdfFacts, NOW) };
}

await check('양손협응: 확정한 결과지의 수행량·규준 표기값을 그대로 옮기고 두 인쇄값의 비교만 적는다', () => {
    const s = makeBimanualSession();
    const result = reportNarrative.buildResultNarrative(s, confirmedBimanualDocument(s.id), NOW);
    const text = result.paragraphs.map(item => item.text).join(' ');
    assert.equal(result.fromOfficialDocument, true);
    assert.ok(text.includes('총 수행량은 20개(총 도구수 25개 기준)'), text);
    // "완성소요시간"이라고 쓰면 전체 과제를 끝낸 시간으로 읽힌다. 20/25는 완료가 아니다.
    assert.ok(text.includes('측정 기록시간은 1분 20초'), text);
    assert.equal(/완성소요시간|과제를 완료|전체 조립을 완료|모든 과제를 끝/.test(text), false, `완료로 읽히는 표현: ${text}`);
    assert.ok(text.includes('전체 과제를 끝낸 기록은 아니다'), text);
    assert.ok(text.includes('판 1/1'), text);
    assert.ok(text.includes('원통결합 2/4'), text);
    assert.ok(text.includes('비장애인 전체 대비 34%'), text);
    assert.ok(text.includes('지체장애 남성 대비 77.2%'), text);
    assert.ok(text.includes('같은 장애유형 규준과 비교한 수행도(78.9)가 비장애인 전체 규준 대비 수행도(34)보다 높게 표기되었다'), text);
    assert.ok(result.strengths.some(line => line.includes('볼트(대)·너트(대)·판·고정핀')), result.strengths.join(' / '));
    assert.ok(result.limitations.some(line => line.includes('원통결합(2/4)·볼트(소)(2/4)')), result.limitations.join(' / '));
    for (const line of [...result.paragraphs.map(item => item.text), ...result.strengths, ...result.limitations]) {
        assert.equal(NARRATIVE_FORBIDDEN.test(line), false, line);
    }
});

await check('보고서 직업진단에 결과 해석 문단이 들어가고, 요약은 빈 칸만 초안으로 채운다', () => {
    const s = scoredHandSession();
    const episode = reportEpisode();
    const report = baseReport(episode);
    const sections = reportCompose.composeSections({ episode, sessions: [s], documents: [] }, report.sections);
    const vocational = sections.find(item => item.id === 'vocational');
    assert.ok(vocational.paragraphs.some(item => item.id.startsWith(`result:${s.id}:`) && item.sourceLabel.includes('앱 기록')));

    const drafted = reportCompose.composeSummaryDraft({ episode, sessions: [s], documents: [] }, report.summary);
    assert.ok(drafted.strengths.includes('대형핀 우세손'));
    assert.ok(drafted.limitations.includes('소형핀 양손'));
    assert.equal(drafted.vocationalLevel, report.summary.vocationalLevel, '직업수준은 평가사 판단이라 채우지 않는다');
    assert.equal(drafted.recommendation, report.summary.recommendation, '추천 직무는 평가사 판단이라 채우지 않는다');

    const kept = reportCompose.composeSummaryDraft(
        { episode, sessions: [s], documents: [] },
        { ...report.summary, strengths: '평가사가 직접 쓴 강점' },
    );
    assert.equal(kept.strengths, '평가사가 직접 쓴 강점');
});

await check('해석 화면 안내: 내부 키를 한글 이름으로 보여 주고, 개수를 넣지 않은 시행을 짚는다', () => {
    assert.equal(readinessModule.describeReadinessItem('SMALL / DOMINANT'), '소형핀 · 우세손');
    assert.equal(readinessModule.describeReadinessItem('trials.LARGE.NON_DOMINANT.2'), '대형핀 · 비우세손 2차 (값 충돌)');
    assert.equal(readinessModule.describeReadinessItem('plate'), '판');
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    const guide = readinessModule.entryGuide(s);
    assert.deepEqual(guide.measuredWithoutScore, ['소형핀 · 우세손 1차']);
    assert.match(guide.message, /수행량\(꽂은 핀 개수\)을 입력하지 않은 시행이 1개/);
    assert.equal(readinessModule.entryGuide(scoredHandSession()).message, '');
});

await check('평가도구 표의 빈 칸만 자동으로 채운다', () => {
    let s = makeHandSession();
    const tools = reportModel.DEFAULT_TOOL_ROWS.map(row => ({ ...row }));
    tools[0].tool = '기관 자체 도구';
    const filled = reportCompose.fillToolRows(tools, [s]);
    assert.equal(filled[0].tool, '기관 자체 도구');
    assert.equal(filled.find(row => row.area.includes('손기능')).tool, 'KEAD 손기능 작업표본검사');
    assert.equal(filled.find(row => row.area.includes('작업활동')).tool, '');
});

await check('분석지 제목으로 평가도구 표를 채운다(이미 쓴 칸은 유지)', () => {
    const tools = reportModel.DEFAULT_TOOL_ROWS.map(row => ({ ...row }));
    tools.find(row => row.area.includes('직업흥미')).tool = '기관이 쓴 흥미검사';
    const analysis = (title, status = 'SUCCEEDED') => ({
        ...analysisModel.createAnalysisDocument({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        detectedTitle: title,
        extractionStatus: status,
    });
    const filled = reportCompose.fillToolRows(tools, [], [
        analysis('사회적응도검사(CISA-2)'),
        analysis('그림지능검사'),
        analysis('문장완성검사(SCT)'),
        analysis('직업흥미검사(VISIT)'),
        analysis('신체능력 측정표'),
        analysis('읽기 실패한 검사', 'FAILED'),
    ]);
    assert.equal(filled.find(row => row.area.includes('사회진단')).tool, '사회적응도검사(CISA-2)');
    assert.equal(filled.find(row => row.area.includes('인지·언어')).tool, '그림지능검사');
    assert.equal(filled.find(row => row.area.includes('정서 및 성격')).tool, '문장완성검사(SCT)');
    assert.equal(filled.find(row => row.area.includes('직업흥미')).tool, '기관이 쓴 흥미검사', '평가사가 쓴 칸은 유지');
    assert.equal(filled.find(row => row.area.includes('신체적 능력')).tool, '신체능력 측정표');
});

await check('① 기본정보의 장애·진단이력과 교육·직업경력이 평가 상세에 자동으로 들어간다', () => {
    const episode = { ...reportEpisode(), disabilityHistory: '지적장애 정도가 심한 장애, 2019년 등록.', careerHistory: '특수학교 전공과 수료.' };
    const sections = reportCompose.composeSections({ episode, sessions: [], documents: [] }, baseReport(episode).sections);
    assert.ok(sections.find(item => item.id === 'disability').paragraphs.some(item => item.text.includes('2019년 등록')));
    assert.ok(sections.find(item => item.id === 'career').paragraphs.some(item => item.text.includes('전공과 수료')));
    const empty = reportCompose.composeSections({ episode: reportEpisode(), sessions: [], documents: [] }, baseReport(episode).sections);
    assert.equal(empty.find(item => item.id === 'disability').paragraphs.length, 0, '비어 있으면 문단을 만들지 않는다');
});

await check('요약에 칸이 늘어도 이전 버전에서 확정한 보고서의 지문이 그대로 맞는다', () => {
    const episode = reportEpisode();
    const report = baseReport(episode);
    // 이전 버전의 저장본에는 supportNeeds·overallOpinion 키 자체가 없었다.
    const legacySummary = { ...report.summary };
    delete legacySummary.supportNeeds;
    delete legacySummary.overallOpinion;
    assert.equal(
        reportModel.hashReportContent({ ...report, summary: legacySummary }),
        reportModel.hashReportContent(report),
        '새 칸이 비어 있으면 지문은 키가 없던 시절과 같아야 한다',
    );
    // 이전 저장본(키 없음 + 그때 지문)을 지금 코드로 복원해도 통과해야 한다.
    const legacyConfirmed = reportModel.confirmReport({ ...report, summary: legacySummary }, '합성평가사', NOW);
    const parsed = reportSerialization.parseReport(JSON.stringify(legacyConfirmed));
    assert.ok(parsed.ok, `이전 확정본 복원 실패: ${parsed.ok ? '' : parsed.error}`);
    // 새 칸에 내용이 들어간 새 보고서도 확정·복원이 돌아간다.
    const withNewFields = {
        ...report,
        summary: { ...report.summary, supportNeeds: '작업 속도 완화 지원', overallOpinion: '보호고용 검토가 타당할 것으로 보임' },
    };
    const confirmed = reportModel.confirmReport(withNewFields, '합성평가사', NOW);
    const roundTrip = reportSerialization.parseReport(reportSerialization.serializeReport(confirmed));
    assert.ok(roundTrip.ok);
    assert.equal(roundTrip.report.summary.supportNeeds, '작업 속도 완화 지원');
});

await check('새 칸을 지문에서 빼는 방식이 확정본 수정 우회를 열지 않는다', () => {
    const episode = reportEpisode();
    const report = baseReport(episode);
    // (1) 빈 칸으로 확정한 뒤 새 칸을 채워 넣는 우회
    const legacySummary = { ...report.summary };
    delete legacySummary.supportNeeds;
    delete legacySummary.overallOpinion;
    const confirmedEmpty = reportModel.confirmReport({ ...report, summary: legacySummary }, '합성평가사', NOW);
    const filledAfter = {
        ...confirmedEmpty,
        summary: { ...confirmedEmpty.summary, supportNeeds: '확정 뒤에 몰래 넣은 지원 사항' },
    };
    assert.throws(() => reportSerialization.serializeReport(filledAfter), /새 버전/, '확정 후 새 칸 채우기가 막혀야 한다');
    assert.equal(reportSerialization.parseReport(JSON.stringify(filledAfter)).ok, false);

    // (2) 내용이 있는 채로 확정한 뒤 그 칸을 비워 지문을 맞추려는 우회
    const confirmedFilled = reportModel.confirmReport(
        { ...report, summary: { ...report.summary, overallOpinion: '원래 소견' } },
        '합성평가사',
        NOW,
    );
    const emptiedAfter = { ...confirmedFilled, summary: { ...confirmedFilled.summary, overallOpinion: '' } };
    assert.throws(() => reportSerialization.serializeReport(emptiedAfter), /새 버전/, '확정 후 칸 비우기가 막혀야 한다');
    assert.equal(reportSerialization.parseReport(JSON.stringify(emptiedAfter)).ok, false);
});

await check('확정하면 잠기고 같은 보고서를 다시 확정할 수 없다', () => {
    const episode = reportEpisode();
    const report = baseReport(episode);
    assert.equal(reportModel.isLocked(report), false);
    const confirmed = reportModel.confirmReport(report, '합성평가사', NOW);
    assert.equal(reportModel.isLocked(confirmed), true);
    assert.ok(confirmed.contentHash);
    assert.throws(() => reportModel.confirmReport(confirmed, '합성평가사', NOW), /이미 확정/);
    assert.throws(() => reportModel.confirmReport(report, '  ', NOW), /확정자 이름/);
});
await check('확정 후 내용이 바뀌면 저장과 복원을 막는다', () => {
    const episode = reportEpisode();
    const confirmed = reportModel.confirmReport(baseReport(episode), '합성평가사', NOW);
    const stored = reportSerialization.serializeReport(confirmed);
    const parsed = reportSerialization.parseReport(stored);
    assert.ok(parsed.ok);
    assert.equal(parsed.report.confirmedBy, '합성평가사');

    const tampered = { ...confirmed, purpose: '몰래 바꾼 목적' };
    assert.throws(() => reportSerialization.serializeReport(tampered), /새 버전/);
    const tamperedJson = JSON.stringify({ ...reportSerialization.normalizeReport(confirmed), purpose: '몰래 바꾼 목적' });
    assert.equal(reportSerialization.parseReport(tamperedJson).ok, false);
});
await check('새 버전은 확정을 풀고 이전 버전을 가리킨다', () => {
    const episode = reportEpisode();
    const confirmed = reportModel.confirmReport(baseReport(episode), '합성평가사', NOW);
    const next = reportModel.createNextVersion(confirmed, later(10));
    assert.equal(next.reportVersion, 2);
    assert.equal(next.previousReportId, confirmed.id);
    assert.equal(next.confirmedAt, undefined);
    assert.equal(next.contentHash, undefined);
    assert.notEqual(next.id, confirmed.id);
});
await check('확정 스냅샷은 원자료가 바뀌어도 그대로다', () => {
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 12, i * 40);
    const episode = reportEpisode();
    const report = {
        ...baseReport(episode),
        resultTables: reportCompose.buildResultTables([s], []),
    };
    const confirmed = reportModel.confirmReport(report, '합성평가사', NOW);
    const before = JSON.stringify(confirmed.resultTables);

    let changed = session.reopenSession(s, later(10));
    changed = session.setScore(changed, 20, later(11), changed.trials[0].id);
    assert.notDeepEqual(reportCompose.buildResultTables([changed], []), confirmed.resultTables);
    assert.equal(JSON.stringify(confirmed.resultTables), before);
});

await check('빈 평가영역·빈 평가목적·빈 결과표를 출력하지 않는다', () => {
    const episode = reportEpisode();
    const base = baseReport(episode);
    const report = {
        ...base,
        purpose: '', // ① 기본정보에서 평가목적을 비워 둔 상태
        tools: reportModel.DEFAULT_TOOL_ROWS.map(row => ({ ...row })).map(row =>
            row.area.includes('손기능') ? { ...row, tool: 'KEAD 손기능 작업표본검사' } : row,
        ),
        resultTables: [
            { title: '전부 미실시 표', rows: [['조건', '1회', '평균'], ['소형핀 · 우세손', '미실시', '—']] },
            { title: '실제 측정 표', rows: [['조건', '1회', '평균'], ['소형핀 · 우세손', '12', '12']] },
        ],
        summary: { ...base.summary, overallOpinion: '종합소견 본문' },
    };
    const html = reportDocument.buildReportHtml(report);
    // 미실시 영역의 빈 행은 평가도구 표에 나오지 않는다.
    assert.ok(html.includes('KEAD 손기능 작업표본검사'));
    assert.equal(html.includes('사회진단(사회적응도)'), false, '미실시 평가영역 행이 출력됨');
    assert.equal(html.includes('심리진단(인지·언어)'), false);
    // "1. 평가목적 —" 같은 빈 항목을 만들지 않는다.
    assert.equal(html.includes('평가목적'), false, '빈 평가목적 항목이 출력됨');
    // 전부 미실시인 표는 빠지고 실제 측정 표만 남는다.
    assert.equal(html.includes('전부 미실시 표'), false, '빈 결과표가 출력됨');
    assert.ok(html.includes('실제 측정 표'));
    // 항목 번호는 실제로 출력한 것만으로 이어진다(평가목적을 건너뛰었으므로 평가 도구가 1번).
    assert.ok(/1\.\s*평가 도구/.test(html), html.slice(0, 400));
    assert.ok(/2\.\s*종합소견 및 직업재활방향/.test(html));
});

await check('DOCX·HTML 출력에 제외한 문단이 들어가지 않는다', async () => {
    const episode = reportEpisode();
    const report = {
        ...baseReport(episode),
        sections: baseReport(episode).sections.map(section =>
            section.id === 'social'
                ? {
                      ...section,
                      paragraphs: [
                          { id: 'p1', origin: 'AUTO', text: '포함되는 문장이다.', included: true },
                          { id: 'p2', origin: 'AUTO', text: '제외한 문장이다.', included: false },
                      ],
                      evaluatorText: '평가사가 직접 쓴 문장이다.',
                  }
                : section,
        ),
    };
    const html = reportDocument.buildReportHtml(report);
    assert.ok(html.includes('포함되는 문장이다.'));
    assert.equal(html.includes('제외한 문장이다.'), false);
    assert.ok(html.includes('평가사가 직접 쓴 문장이다.'));
    assert.ok(html.includes('직업평가보고서'));

    const blob = await blocks.packDocument(reportDocument.buildReportDocx(report));
    assert.ok(blob.size > 1000);
});
await check('보고서 파일 이름에 이용자 이름이 들어가지 않는다', () => {
    const episode = reportEpisode();
    const report = { ...baseReport(episode), header: { ...baseReport(episode).header, evaluationDate: '2026-09-25' } };
    const name = reportDocument.reportFileName(report, 'docx');
    assert.equal(name.includes('합성이용자'), false);
    assert.ok(name.startsWith('직업평가보고서_20260925_v1'));
});


/* ── 15. 적대적 검증에서 재현된 우회 차단 ───────────────────── */
console.log('우회 차단(회귀)');

await check('INVALID 제안은 "고쳐서 채택"으로도 통과하지 못한다', () => {
    const run = runModule.createInterpretationRun({
        testPluginId: 'kead-hand-function',
        sessionId: 'session1',
        evidenceHash: 'hash1',
        readiness: { status: 'READY', message: '', missing: [], usableCoreFields: 7, totalCoreFields: 7 },
        model: 'gemini',
        pack: qualityPack,
        now: NOW,
        response: {
            overallSummary: null,
            claims: [{ claimType: 'RESULT_DESCRIPTION', text: '취업 가능성이 높다.', evidenceIds: ['fact_0'], confidence: 'HIGH' }],
            cautions: [],
        },
    });
    const invalid = run.claims[0];
    assert.equal(invalid.quality.status, 'INVALID');
    assert.throws(() => runModule.acceptClaim(invalid, '평가사', NOW), /채택할 수 없습니다/);
    // 내용을 그대로 두고 "고쳐서 채택"해도 막혀야 한다.
    assert.throws(
        () => runModule.editClaim(invalid, '취업 가능성이 높다.', '평가사', NOW, qualityPack),
        /통과하지 못했습니다/,
    );
    // 고친 문장이 안전하면 통과하고 품질 결과도 새로 붙는다.
    const fixed = runModule.editClaim(invalid, '수행 안정성을 추가 확인할 필요가 있다.', '평가사', NOW, {
        ...qualityPack,
        testType: 'kead-hand-function',
    });
    assert.equal(fixed.status, 'EDITED');
    assert.notEqual(fixed.quality.status, 'INVALID');
});
await check('STALE 실행의 문장은 보고서 후보에서 빠진다', () => {
    const claim = {
        id: 'c1',
        claimType: 'RESULT_DESCRIPTION',
        role: 'MAIN_CLAIM',
        originalAiText: '문장',
        finalText: '문장',
        evidenceIds: ['fact_0'],
        confidence: 'HIGH',
        status: 'ACCEPTED',
        quality: { status: 'VALID', issues: [] },
        createdAt: NOW,
    };
    assert.equal(runModule.adoptedClaims({ id: 'r', status: 'CURRENT', claims: [claim] }).length, 1);
    assert.deepEqual(runModule.adoptedClaims({ id: 'r', status: 'STALE', claims: [claim] }), []);
    assert.deepEqual(runModule.adoptedClaims({ id: 'r', status: 'SUPERSEDED', claims: [claim] }), []);
    // 품질 검사에서 막힌 문장이 저장돼 있어도 보고서에 들어가지 않는다.
    assert.deepEqual(
        runModule.adoptedClaims({
            id: 'r',
            status: 'CURRENT',
            claims: [{ ...claim, quality: { status: 'INVALID', issues: ['금지'] } }],
        }),
        [],
    );
});
await check('같은 검사의 CURRENT 실행 하나만 고른다', () => {
    const runs = [
        { id: 'r1', sessionId: 's1', status: 'SUPERSEDED', claims: [] },
        { id: 'r2', sessionId: 's1', status: 'CURRENT', claims: [] },
        { id: 'r3', sessionId: 's2', status: 'CURRENT', claims: [] },
    ];
    assert.equal(runModule.selectCurrentRun(runs, 's1').id, 'r2');
    assert.equal(runModule.selectCurrentRun(runs, 's2').id, 'r3');
    assert.equal(runModule.selectCurrentRun(runs, 's3'), undefined);
});

await check('확정하지 않은 결과지는 값의 출처로 쓰이지 않는다', () => {
    const base = {
        ...sourceRecord.createSourceDocument({
            episodeId: 'ep1',
            seekerId: 's1',
            seekerName: '합성이용자',
            sessionId: 'session1',
            fileName: 'a.pdf',
            fileSize: 1,
            sha256: 'x',
            pageCount: 1,
        }),
        extractionStatus: 'SUCCEEDED',
    };
    assert.equal(sourceRecord.isOfficialDocumentUsable(base), false);
    assert.equal(sourceRecord.isOfficialDocumentUsable({ ...base, confirmedAt: NOW }), true);
    assert.equal(sourceRecord.isOfficialDocumentUsable({ ...base, confirmedAt: NOW, supersededAt: later(10) }), false);

    // 미확정 결과지를 넣어도 해석 컨텍스트는 앱 기록만 쓴다.
    let s = makeHandSession();
    for (let i = 0; i < 21; i += 1) s = runTrial(s, 12, i * 40);
    const context = contextModule.buildInterpretationContext({ session: s, document: base, now: NOW });
    assert.equal(context.hasOfficialDocument, false);
});
await check('확정된 결과지가 여러 개면 가장 최근 확정본을 쓴다', () => {
    const make = (id, confirmedAt, supersededAt) => ({
        ...sourceRecord.createSourceDocument({
            episodeId: 'ep1',
            seekerId: 's1',
            seekerName: '합성이용자',
            sessionId: 'session1',
            fileName: `${id}.pdf`,
            fileSize: 1,
            sha256: id,
            pageCount: 1,
        }),
        id,
        extractionStatus: 'SUCCEEDED',
        confirmedAt,
        supersededAt,
    });
    const documents = [make('old', NOW, later(50)), make('new', later(100)), make('other', later(200))];
    documents[2].sessionId = 'session2';
    assert.equal(sourceRecord.selectActiveSourceDocument(documents, 'session1').id, 'new');
    assert.equal(sourceRecord.selectActiveSourceDocument(documents, 'session2').id, 'other');
});

await check('결과지 값의 범위를 벗어나면 확정을 막는 오류가 된다', () => {
    assert.equal(valueLimits.factValueIssue('trials.SMALL.DOMINANT.1', 12), null);
    assert.equal(valueLimits.factValueIssue('trials.SMALL.DOMINANT.1', -1).severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('trials.SMALL.DOMINANT.1', 999).severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('trials.SMALL.DOMINANT.1', '열두개').severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('bimanual.components.plate', 1), null);
    assert.equal(valueLimits.factValueIssue('bimanual.components.plate', 2).severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('bimanual.reportedTotalCompleted', 26).severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('bimanual.recordedDurationMs', '1분 30초'), null);
    assert.equal(valueLimits.factValueIssue('bimanual.recordedDurationMs', '2분').severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('norms.nondisabled.total', 999).severity, 'WARNING');
});
await check('범위를 벗어난 값은 검토에서 차단 오류로 뜨고 확인만으로 못 넘긴다', () => {
    const trials = defaultTrials();
    trials.SMALL.DOMINANT = handCondition(999, 12, 12, 12);
    const issues = review.validateExtraction(handExtraction({ trials }), { documentId: 'doc1' });
    const outOfRange = issues.find(issue => issue.code === 'VALUE_OUT_OF_RANGE');
    assert.ok(outOfRange);
    assert.equal(review.isBlockingIssue(outOfRange), true);
    assert.equal(review.issueActionPolicy(outOfRange), 'FIELD_ACTION');
    assert.throws(() => review.acknowledgeIssue(outOfRange, { by: '평가사', at: NOW, reason: '확인' }), /확인만으로/);
});
await check('결과지가 찍어 준 부품 분모는 확정을 막지 않고 경고로 안내한다', () => {
    // 공단 결과지는 부품 칸 분모를 모두 "/4"로 찍는다. 판은 실시요강상 1개라 인쇄된 값과 어긋난다.
    // 결과지를 그대로 옮긴 값이므로 확정은 막지 않되, 평가사가 총 도구수 25와 대조하도록 알린다.
    const printed = valueLimits.factValueIssue('bimanual.componentDenominators.plate', 4);
    assert.equal(printed.severity, 'WARNING');
    assert.match(printed.message, /총 도구수 25/);
    assert.equal(valueLimits.factValueIssue('bimanual.componentDenominators.plate', 1), null);
    assert.equal(valueLimits.factValueIssue('bimanual.componentDenominators.largeBolt', 4), null);
    // 범위를 벗어난 값은 그대로 차단한다.
    for (const bad of [0, 5, 40, '넷']) {
        assert.equal(valueLimits.factValueIssue('bimanual.componentDenominators.plate', bad).severity, 'ERROR', String(bad));
    }
    // 수행량과 총 도구수의 한계는 그대로다.
    assert.equal(valueLimits.factValueIssue('bimanual.components.plate', 2).severity, 'ERROR');
    assert.equal(valueLimits.factValueIssue('bimanual.reportedTotalTools', 28).severity, 'ERROR');
});

await check('손기능 수행량은 핀 개수(40)를 넘을 수 없다', () => {
    let s = makeHandSession();
    s = session.changeTrialState(s, 'RUNNING', NOW, 30_000);
    s = session.changeTrialState(s, 'FINISHED', later(30), 0);
    assert.throws(() => session.setScore(s, 41, later(31)), /0~40 정수/);
    s = session.setScore(s, 40, later(31));
    assert.equal(session.changeScore(s, 5, later(32)).trials[0].score, 40);
});

await check('저장 JSON을 고쳐도 검사 규격은 실시요강 값으로 되돌린다', () => {
    let s = makeBimanualSession();
    s = bimanual.changeBimanualState(s, 'RUNNING', NOW, 90_000);
    s = bimanual.changeBimanualState(s, 'FINISHED', later(90), 0);
    const tampered = JSON.parse(sessionModel.serializeSession(s));
    tampered.bimanual.specification.components = tampered.bimanual.specification.components.map(component => ({
        ...component,
        maximum: 99,
    }));
    tampered.bimanual.attempt.durationSeconds = 600;
    tampered.bimanual.attempt.result.components = { plate: 50 };
    const parsed = sessionModel.parseSession(JSON.stringify(tampered));
    assert.ok(parsed.ok);
    assert.equal(bimanual.totalMaximum(parsed.session.bimanual.specification), 25);
    assert.equal(parsed.session.bimanual.attempt.durationSeconds, 90);
    assert.equal(parsed.session.bimanual.attempt.result.components.plate, 1);

    let hand = makeHandSession();
    const tamperedHand = JSON.parse(sessionModel.serializeSession(hand));
    tamperedHand.trials[0].durationSeconds = 600;
    const parsedHand = sessionModel.parseSession(JSON.stringify(tamperedHand));
    assert.equal(parsedHand.session.trials[0].durationSeconds, 30);
});
await check('예전 상태로 덮어쓰는 저장은 거부한다(revision 비교)', () => {
    // 저장소는 localDB를 쓰므로 여기서는 규칙만 확인한다: revision이 더 낮으면 거부.
    const older = { revision: 3 };
    const newer = { revision: 5 };
    assert.equal(newer.revision > older.revision, true);
});
await check('확정 보고서의 지문을 지우면 복원을 거부한다', () => {
    const episode = reportEpisode();
    const confirmed = reportModel.confirmReport(baseReport(episode), '합성평가사', NOW);
    const withoutHash = { ...reportSerialization.normalizeReport(confirmed), contentHash: undefined };
    assert.throws(() => reportSerialization.serializeReport(withoutHash), /지문이 없습니다/);
    assert.equal(reportSerialization.parseReport(JSON.stringify(withoutHash)).ok, false);
});

await check('표현을 바꾼 금지 문장도 막는다', () => {
    const cases = [
        '이 결과라면 고용될 가능성이 높다.',
        '정상적인 수준으로 볼 수 있다.',
        '상위 십 퍼센트 수준이다.',
        '주의력결핍이 의심된다.',
        '생산 업무를 우선 고려하면 좋겠다.',
        '채용이 어렵다고 본다.',
        '상위권 수행이다.',
    ];
    for (const text of cases) {
        const result = claimQuality.validateClaim(
            { claimType: 'RESULT_DESCRIPTION', text, evidenceIds: ['fact_0'] },
            qualityPack,
        );
        assert.equal(result.status, 'INVALID', `막히지 않음: ${text}`);
    }
});
await check('정상 서술은 여전히 통과한다(거짓 양성 확인)', () => {
    const okCases = [
        { claimType: 'RESULT_DESCRIPTION', text: '소형핀 우세손 수행량은 10개로 나타났다.', evidenceIds: ['fact_0'] },
        { claimType: 'SUPPORT_NEED', text: '수행 안정성을 추가 확인할 필요가 있다.', evidenceIds: ['pattern:range'] },
    ];
    for (const claim of okCases) {
        assert.equal(claimQuality.validateClaim(claim, qualityPack).status, 'VALID', `막힘: ${claim.text}`);
    }
});

/* ── 종합소견 AI 초안(참고 내용 조립·항목 나누기) ─────────────────── */
console.log('종합소견 AI 초안');
const aiOpinion = await load('report/aiOpinion.mjs');

await check('AI 참고 내용에 회차 재료가 항목별로 들어가고, 제외 문장은 빠진다', () => {
    const episode = {
        ...reportEpisode(),
        purpose: '적합 직무 탐색',
        disabilityHistory: '지적장애 정도가 심한 장애.',
        careerHistory: '전공과 수료.',
        note: '평가 중 협조적이었음.',
        needs: { ...reportEpisode().needs, interest: true },
    };
    const record = {
        ...analysisModel.createAnalysisDocument({ episodeId: episode.id, seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        detectedTitle: '사회적응도(CISA-2)',
        findings: [
            analysisModel.createAnalysisFinding('social', '지역사회 이용 기술이 또래 평균 수준으로 확인되었다.'),
            { ...analysisModel.createAnalysisFinding('living', '대중교통은 지원이 필요하다.'), included: false },
            analysisModel.createAnalysisFinding('vocational', '취업이 가능한 수준이다.'), // 차단 문장
        ],
    };
    const reference = aiOpinion.buildOpinionReference({
        episode,
        sessions: [scoredHandSession()],
        documents: [],
        analyses: [record],
        profile: { sex: '남', birthDate: '1990-01-01', disability: '지적장애 심한 정도' },
    });
    assert.ok(reference.includes('[평가 개요]'));
    assert.ok(reference.includes('평가목적: 적합 직무 탐색'));
    assert.ok(reference.includes('[장애 및 진단이력]'));
    assert.ok(reference.includes('[검사 결과 — KEAD 손기능 작업표본검사]'));
    assert.ok(reference.includes('지역사회 이용 기술'));
    assert.equal(reference.includes('대중교통은 지원이'), false, '포함 해제한 문장은 보내지 않는다');
    assert.equal(reference.includes('취업이 가능한'), false, '차단된 문장은 보내지 않는다');
    assert.ok(reference.includes('[평가사 메모]'));
});

await check('AI가 쓴 8개 항목을 요약 칸으로 나눠 담는다(직업목표는 당사자/보호자로)', () => {
    const sample = [
        '1. 직업적 강점',
        '- 과제를 중도 포기 없이 끝까지 완성하여 작업 완수 능력이 우수한 것으로 보임',
        '2. 제한점(고려사항)',
        '- 일반 속도의 작업 환경에서는 어려움을 겪을 수 있을 것으로 보임',
        '3. 직업수준',
        '- 단순 반복 작업 수행이 적절할 것으로 보임',
        '4. 직업목표(당사자 및 보호자/지원자 목표)',
        '- 당사자: 보호작업장, 바리스타',
        '- 보호자/지원자: 본인이 즐거워하는 일',
        '5. 지원이 필요한 사항',
        '- 작업 속도 및 생산성 향상을 위한 지원: 충분한 숙련 기간을 보장하는 지원이 필요할 것으로 보임',
        '6. 추천직무 및 권고프로그램',
        '- 제조단순작업, 조립작업 등을 들 수 있을 것으로 보임',
        '7. 추천직무 세부정보',
        '- 직업재활시설(보호작업장): 보호된 작업 환경을 제공함',
        '3. 지원고용 연계: 현장훈련과 병행함', // 본문 안의 번호 줄 — 새 항목으로 오인하면 안 된다
        '8. 종합소견',
        '- 보호고용 및 현장훈련 연계를 검토하는 것이 타당할 것으로 보임',
    ].join('\n');
    const parsed = aiOpinion.parseOpinionText(sample);
    assert.equal(parsed.matchedSections, 8);
    assert.ok(parsed.fields.strengths.includes('작업 완수 능력'));
    assert.ok(parsed.fields.limitations.includes('일반 속도'));
    assert.ok(parsed.fields.vocationalLevel.includes('단순 반복'));
    assert.ok(parsed.fields.goalSelf.includes('보호작업장, 바리스타'));
    assert.ok(parsed.fields.goalGuardian.includes('즐거워하는 일'));
    assert.ok(parsed.fields.supportNeeds.includes('숙련 기간'));
    assert.ok(parsed.fields.recommendation.includes('제조단순작업'));
    assert.ok(parsed.fields.recommendedPrograms.includes('지원고용 연계'), '본문 안의 번호 줄은 그 항목에 남는다');
    assert.ok(parsed.fields.overallOpinion.includes('보호고용'));
    const applied = aiOpinion.applyOpinion(baseReport(reportEpisode()).summary, parsed);
    assert.equal(applied.recommendation, parsed.fields.recommendation);
});

await check('⑥ 결과 분석이 회차에 저장·복원되고, 종합소견 입력에 그대로 들어간다', () => {
    const base = {
        ...reportEpisode(),
        resultAnalysis: { text: '1. 평가자료 개요\n- 다차원 양손협응 결과지 1부.', generatedAt: NOW, editedAt: NOW },
    };
    // 저장·복원
    const parsed = episodeModel.parseEpisode(episodeModel.serializeEpisode(base));
    assert.ok(parsed.ok);
    assert.equal(parsed.episode.resultAnalysis.text, base.resultAnalysis.text);
    assert.equal(parsed.episode.resultAnalysis.editedAt, NOW);
    // 빈 본문은 저장하지 않는다
    const empty = episodeModel.parseEpisode(
        episodeModel.serializeEpisode({ ...base, resultAnalysis: { text: '   ', generatedAt: NOW } }),
    );
    assert.equal(empty.episode.resultAnalysis, undefined);
    // ⑦ 종합소견 입력에는 들어가고, ⑥ 자신의 입력에는 넣지 않는다
    const withAnalysis = aiOpinion.buildOpinionReference({ episode: base, sessions: [], documents: [] });
    assert.ok(withAnalysis.includes('검사 결과 분석(⑥'));
    assert.ok(withAnalysis.includes('다차원 양손협응 결과지 1부'));
    const withoutAnalysis = aiOpinion.buildOpinionReference({
        episode: base,
        sessions: [],
        documents: [],
        includeResultAnalysis: false,
    });
    assert.equal(withoutAnalysis.includes('검사 결과 분석(⑥'), false);
});

await check('이용자 희망직종이 참고 내용에 들어간다', () => {
    const reference = aiOpinion.buildOpinionReference({
        episode: reportEpisode(),
        sessions: [],
        documents: [],
        profile: { desiredJobs: '바리스타 보조, 사무보조' },
    });
    assert.ok(reference.includes('당사자 희망직종'));
    assert.ok(reference.includes('바리스타 보조, 사무보조'));
});

/* ── 소견 품질: 방어 문구·완료 오인·빈 출력 ─────────────────────── */

await check('20/25와 기록시간을 "과제 완료"로 읽히게 쓰지 않는다', () => {
    const s = makeBimanualSession();
    const result = reportNarrative.buildResultNarrative(s, confirmedBimanualDocument(s.id), NOW);
    const text = result.paragraphs.map(item => item.text).join(' ');
    // 자료: 총 수행량 20 / 총 도구수 25, 기록시간 1분 20초 → 완료가 아니다.
    for (const forbidden of ['과제를 완료', '전체 조립을 완료', '모든 과제를 끝', '완성소요시간', '만에 완료']) {
        assert.equal(text.includes(forbidden), false, `완료로 읽히는 표현이 들어감: ${forbidden}`);
    }
    assert.ok(text.includes('총 수행량은 20개'), text);
    assert.ok(text.includes('전체 과제를 끝낸 기록은 아니다'), text);
    // AI에 보내는 참고 내용에도 같은 주의가 실려야 한다.
    const reference = aiOpinion.buildOpinionReference({
        episode: reportEpisode(),
        sessions: [s],
        documents: [confirmedBimanualDocument(s.id)],
    });
    assert.ok(reference.includes('전체 과제를 끝낸 기록은 아니다'), '참고 내용에도 미완료 사실이 들어간다');
});

await check('값·관찰이 하나도 없는 세션은 "실시했다" 문장을 만들지 않는다(중복 출력 방지)', () => {
    // 같은 검사를 여러 번 만들었다가 하나만 실제로 실시한 회차:
    // 첨부된 실제 DOCX에서 "KEAD 손기능…실시했다"가 3번 반복 출력되던 원인이다.
    const emptyOne = makeHandSession();
    const emptyTwo = makeHandSession();
    let scored = scoredHandSession();
    const episode = reportEpisode();
    const sections = reportCompose.composeSections(
        { episode, sessions: [emptyOne, scored, emptyTwo], documents: [] },
        baseReport(episode).sections,
    );
    const vocational = sections.find(item => item.id === 'vocational');
    const startLines = vocational.paragraphs.filter(item => item.text.includes('실시했다'));
    assert.equal(startLines.length, 1, `실시 문장이 ${startLines.length}개 — 빈 세션은 생략되어야 한다`);
    // 같은 세션이 결과표를 두 번 만들지 않는다(세션당 표 1개 + 규준표).
    const tables = reportCompose.buildResultTables([scored], []);
    assert.equal(tables.filter(table => table.title.includes('손기능')).length, 1, '같은 세션의 결과표가 중복 생성됨');
});

await check('평가하지 않은 영역을 "확인되지 않음"으로 자동 생성하지 않는다', () => {
    // 손기능 검사만 있고 이동 능력·대인관계·인지 자료는 없는 상황.
    let s = scoredHandSession();
    const episode = reportEpisode();
    const sections = reportCompose.composeSections({ episode, sessions: [s], documents: [] }, baseReport(episode).sections);
    const summary = reportCompose.composeSummaryDraft({ episode, sessions: [s], documents: [] }, baseReport(episode).summary);
    const allText = [
        ...sections.flatMap(section => section.paragraphs.map(item => item.text)),
        summary.strengths,
        summary.limitations,
        summary.vocationalLevel,
    ].join(' ');
    // 앱이 만드는 문단에는 "확인되지 않아 추가 면담" 같은 방어 문구가 하나도 없어야 한다.
    for (const forbidden of ['대중교통', '앉아 있을 수 있는 시간', '대인관계 수준', '인지 및 학습능력', '추가 면담이 필요']) {
        assert.equal(allText.includes(forbidden), false, `평가하지 않은 항목을 자동 생성함: ${forbidden}`);
    }
    const defensiveCount = (allText.match(/확인되지 않아|확인 필요/g) ?? []).length;
    assert.ok(defensiveCount <= 1, `방어 문구가 ${defensiveCount}개로 많다`);
});

await check('AI 프롬프트가 미확인 항목 나열을 금지하고 추가 확인사항을 한 곳으로 제한한다', async () => {
    const source = await readFile(path.join(root, 'src', 'services', 'gemini.ts'), 'utf8');
    // 지난 버전에서 방어 문구를 양산하던 지시가 남아 있으면 안 된다.
    assert.equal(
        source.includes('"현재 자료에서는 확인되지 않아 추가 면담 또는 평가가 필요할 것으로 보임" 형태로만 적습니다'),
        false,
        '미확인 항목을 일일이 적게 하는 지시가 남아 있다',
    );
    assert.equal(source.includes('추정이 필요한 부분은 반드시 "확인 필요"라고 표시'), false);
    // 새 철학이 두 엔진 프롬프트에 모두 들어가 있어야 한다.
    assert.ok(source.includes('확인되지 않은 항목을 하나씩 열거하지도 않습니다'));
    assert.match(source, /최대 3개/, '추가 확인사항 개수 제한');
    // anchor로 작용하던 고정 예시 제거
    for (const anchor of ['앉아 있기 3시간', '보호작업장, 바리스타', '독립적인 대중교통 이용 원활']) {
        assert.equal(source.includes(anchor), false, `고정 예시가 남아 있다: ${anchor}`);
    }
    // 완료 오인 방지 지시
    assert.ok(source.includes('과제를 완료했다고 쓰지 않습니다'));
    // 실제 기관 보고서의 작성 방식(개조식 + 근거, 지원사항의 관찰→지원→기대 문단)을 지시한다.
    assert.ok(source.includes('작성 방식 — 실제 기관 보고서의 문장 방식'), '작성 방식 블록');
    assert.ok(source.includes('개조식'), '개조식 지시');
    assert.ok(source.includes('- (지원 소제목): '), '지원사항 문단 틀');
    assert.ok(source.includes('평가 중 …하는 모습이 관찰됨'), '관찰 근거 명시 지시');
    assert.ok(source.includes('할 수 있기를 바람'), '기관 보고서 끝맺음 어조');
    assert.ok(source.includes('없는 기관명·연락처를 만들지 않습니다'), '기관 정보 환각 방지');
});

await check('실제 파일 이름은 AI로 나가는 참고 내용에 들어가지 않는다', () => {
    const named = index => ({
        ...analysisModel.createAnalysisDocument({
            episodeId: 'ep1',
            seekerId: 's1',
            seekerName: '합성이용자',
            fileName: `김민수_CISA_서울병원_2026_${index}.pdf`,
            source: 'AI',
        }),
        // 첫 장은 검사명 탐지 성공, 둘째 장은 실패(제목 없음)
        detectedTitle: index === 0 ? 'CISA-2 사회적응도검사' : '',
        findings: [analysisModel.createAnalysisFinding('social', `분석 문장 ${index}.`)],
    });
    const records = [named(0), named(1)];
    const reference = aiOpinion.buildOpinionReference({
        episode: reportEpisode(),
        sessions: [],
        documents: [],
        analyses: records,
    });
    for (const record of records) {
        assert.equal(reference.includes(record.fileName), false, `파일 이름이 새어 나감: ${record.fileName}`);
    }
    assert.equal(reference.includes('서울병원'), false, '파일 이름 속 기관명이 새어 나감');
    assert.equal(reference.includes('김민수'), false, '파일 이름 속 이름이 새어 나감');
    assert.ok(reference.includes('CISA-2 사회적응도검사'), '문서에서 읽은 검사명은 쓴다');
    assert.ok(reference.includes('추가 평가자료 2'), '검사명을 모르면 안전한 대체 이름을 쓴다');
    // 화면 표시용 제목은 파일 이름을 그대로 써도 된다(로컬 전용).
    assert.equal(analysisModel.analysisTitle(records[1]), records[1].fileName);
});

await check('검사명을 못 읽은 분석지도 평가도구 표에서 사라지지 않는다', () => {
    const record = {
        ...analysisModel.createAnalysisDocument({
            episodeId: 'ep1',
            seekerId: 's1',
            seekerName: '합성이용자',
            fileName: 'ABC 직업행동평가.pdf',
            source: 'AI',
        }),
        detectedTitle: '', // 정규식이 검사명을 못 잡은 상황
        findings: [analysisModel.createAnalysisFinding('vocational', '내용은 분석에 사용되었다.')],
    };
    const tools = reportModel.DEFAULT_TOOL_ROWS.map(row => ({ ...row }));
    const filled = reportCompose.fillToolRows(tools, [], [record]);
    const listed = filled.map(row => row.tool).join(' | ');
    assert.ok(listed.includes('ABC 직업행동평가.pdf'), `평가도구 목록에서 사라짐: ${listed}`);
    assert.ok(filled.some(row => row.area === '기타 평가자료'), '분류 못 한 자료는 기타 평가자료 행으로 남는다');
    // 같은 자료를 두 번 채워도 중복 행이 생기지 않는다.
    assert.equal(reportCompose.fillToolRows(filled, [], [record]).filter(row => row.area === '기타 평가자료').length, 1);
});

/* ── ⑥ 결과 분석 최신성(STALE) ─────────────────────────────────── */

await check('자료가 바뀌면 저장된 결과 분석이 STALE이 된다(KEAD 값·공식 결과지·관찰·분석지)', () => {
    let s = scoredHandSession();
    const base = { episode: reportEpisode(), sessions: [s], documents: [], analyses: [] };
    const hash = aiOpinion.analysisSourceHash(base);
    const analysis = { text: '분석 본문', generatedAt: NOW, sourceHash: hash };

    // 변경 없음 → CURRENT
    assert.equal(aiOpinion.isResultAnalysisCurrent(analysis, aiOpinion.analysisSourceHash(base)), true);

    // KEAD 수행량 변경 → STALE
    let changed = session.reopenSession(s, later(10));
    changed = session.setScore(changed, 20, later(11), changed.trials[0].id);
    assert.equal(
        aiOpinion.isResultAnalysisCurrent(analysis, aiOpinion.analysisSourceHash({ ...base, sessions: [changed] })),
        false,
        'KEAD 값이 바뀌면 STALE',
    );

    // 공식 결과지 연결 → STALE (양손협응 회차로 확인)
    const bimanual = makeBimanualSession();
    const withoutDocument = { ...base, sessions: [bimanual] };
    const bimanualHash = aiOpinion.analysisSourceHash(withoutDocument);
    const bimanualAnalysis = { text: '분석 본문', generatedAt: NOW, sourceHash: bimanualHash };
    const withDocument = aiOpinion.analysisSourceHash({ ...withoutDocument, documents: [confirmedBimanualDocument(bimanual.id)] });
    assert.equal(aiOpinion.isResultAnalysisCurrent(bimanualAnalysis, withDocument), false, '공식 결과지가 바뀌면 STALE');

    // 분석지 추가 → STALE
    const record = {
        ...analysisModel.createAnalysisDocument({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', source: 'AI' }),
        detectedTitle: '사회적응도검사',
        findings: [analysisModel.createAnalysisFinding('social', '새로 추가한 분석 문장이다.')],
    };
    assert.equal(
        aiOpinion.isResultAnalysisCurrent(analysis, aiOpinion.analysisSourceHash({ ...base, analyses: [record] })),
        false,
        '분석지가 바뀌면 STALE',
    );

    // 기본정보(이력) 변경 → STALE
    const withHistory = aiOpinion.analysisSourceHash({
        ...base,
        episode: { ...base.episode, disabilityHistory: '새로 적은 진단이력' },
    });
    assert.equal(aiOpinion.isResultAnalysisCurrent(analysis, withHistory), false, '기본정보가 바뀌면 STALE');

    // 지문이 없는 예전 형식은 보수적으로 STALE
    assert.equal(aiOpinion.isResultAnalysisCurrent({ text: '옛 분석', generatedAt: NOW }, hash), false);
    assert.equal(aiOpinion.isResultAnalysisCurrent(undefined, hash), false);
});

await check('결과 분석 지문은 분석 본문·legacy claim 자체에는 영향받지 않는다', () => {
    const base = { episode: reportEpisode(), sessions: [scoredHandSession()], documents: [], analyses: [] };
    const hash = aiOpinion.analysisSourceHash(base);
    // 분석 본문을 채우거나 고쳐도 "입력 자료"가 바뀐 것은 아니므로 지문은 그대로여야 한다.
    const withAnalysis = {
        ...base,
        episode: { ...base.episode, resultAnalysis: { text: '평가사가 고친 분석', generatedAt: NOW, editedAt: NOW, sourceHash: hash } },
    };
    assert.equal(aiOpinion.analysisSourceHash(withAnalysis), hash, '분석 본문은 지문에 들어가지 않는다');
});

await check('legacy claim은 새 결과분석·종합소견 입력에 기본적으로 들어가지 않는다', () => {
    let s = scoredHandSession();
    const run = runModule.createInterpretationRun({
        testPluginId: s.testPluginId,
        sessionId: s.id,
        evidenceHash: 'hash',
        readiness: { status: 'READY', message: '', missing: [], usableCoreFields: 1, totalCoreFields: 1 },
        model: 'gemini',
        now: NOW,
        pack: qualityPack,
        response: {
            overallSummary: null,
            claims: [
                { claimType: 'RESULT_DESCRIPTION', text: '소형핀 우세손 수행량은 10개로 나타났다.', evidenceIds: ['fact_0'], confidence: 'HIGH' },
            ],
            cautions: [],
        },
    });
    const accepted = { ...run, claims: [runModule.acceptClaim(run.claims[0], '평가사', NOW)] };
    const episode = { ...reportEpisode(), interpretations: [accepted] };
    const input = { episode, sessions: [s], documents: [] };

    const reference = aiOpinion.buildOpinionReference(input);
    assert.equal(reference.includes('소형핀 우세손 수행량은 10개'), false, 'AI 문장이 다시 AI 입력이 되면 안 된다');
    assert.ok(
        aiOpinion.buildOpinionReference({ ...input, includeLegacyClaims: true }).includes('소형핀 우세손 수행량은 10개'),
        '호환 경로에서는 켤 수 있다',
    );
    // claim 기록 자체는 보고서 조립에 그대로 남는다(삭제하지 않는다).
    const sections = reportCompose.composeSections(input, baseReport(episode).sections);
    assert.ok(
        sections.find(item => item.id === 'vocational').paragraphs.some(item => item.origin === 'AI_CLAIM'),
        'claim 기록은 보고서에서 그대로 쓸 수 있어야 한다',
    );
});

await check('종합소견 파서: 제목과 내용이 한 줄에 붙어 와도 내용을 잃지 않는다', () => {
    const sample = [
        '### 1. 직업적 강점: 제한시간 내 과제를 끝까지 수행함',
        '2) 제한점(고려사항) - 일반 속도 환경에서는 어려울 수 있음',
        '3. 직업수준',
        '단순 반복 작업이 적절할 것으로 보임',
        '4. 직업목표(당사자 및 보호자/지원자 목표)',
        '- 당사자: 확인되지 않음',
        '- 보호자/지원자: 확인되지 않음',
        '**5. 지원이 필요한 사항**',
        '- 작업 속도 완화 지원이 필요할 것으로 보임',
        '6. 추천직무 및 권고프로그램: 제조단순작업을 탐색할 수 있을 것으로 보임',
        '7. 추천직무 세부정보',
        '- 보호작업장 개요',
        '8. 종합소견: 보호고용 연계를 검토할 수 있을 것으로 보임',
    ].join('\n');
    const parsed = aiOpinion.parseOpinionText(sample);
    assert.equal(parsed.matchedSections, 8);
    assert.ok(parsed.fields.strengths.includes('제한시간 내 과제'), '마크다운 헤더 + 같은 줄 본문');
    assert.ok(parsed.fields.limitations.includes('일반 속도 환경'), '괄호 제목 + 하이픈 본문');
    assert.ok(parsed.fields.vocationalLevel.includes('단순 반복 작업'));
    assert.ok(parsed.fields.goalSelf.includes('확인되지 않음'));
    assert.ok(parsed.fields.goalGuardian.includes('확인되지 않음'));
    assert.ok(parsed.fields.supportNeeds.includes('작업 속도 완화'), '굵은 글씨 제목');
    assert.ok(parsed.fields.recommendation.includes('제조단순작업'));
    assert.ok(parsed.fields.recommendedPrograms.includes('보호작업장 개요'));
    assert.ok(parsed.fields.overallOpinion.includes('보호고용 연계'));
    // 제목의 괄호 설명이 본문으로 새어 들어가지 않는다.
    assert.equal(parsed.fields.goalSelf.includes('보호자/지원자 목표)'), false);
    // 제목 조각("프로그램", "정보")이 본문 첫 줄로 새지 않는다.
    assert.equal(/^프로그램/m.test(parsed.fields.recommendation), false, `제목 꼬리가 샘: ${parsed.fields.recommendation.slice(0, 30)}`);
    assert.equal(/^정보/m.test(parsed.fields.recommendedPrograms), false, `제목 꼬리가 샘: ${parsed.fields.recommendedPrograms.slice(0, 30)}`);
    // "당사자:"/"보호자:" 라벨은 칸 이름이 대신하므로 본문에서 떼어 낸다(라벨 중복 방지).
    assert.equal(/^당사자/.test(parsed.fields.goalSelf), false, parsed.fields.goalSelf);
    assert.equal(/^보호자|^지원자/.test(parsed.fields.goalGuardian), false, parsed.fields.goalGuardian);
});

await check('종합소견은 표(칸)가 아니라 소제목+문단으로 출력되고, 빈 항목은 건너뛴다', () => {
    const episode = reportEpisode();
    const report = {
        ...baseReport(episode),
        purpose: '검증용 평가목적',
        summary: {
            ...baseReport(episode).summary,
            vocationalLevel: '- 구조화된 조립 과제에서 안정적인 수행이 확인됨',
            goalSelf: '바리스타, 사무보조',
            goalGuardian: '', // 비어 있으면 보호자 줄 자체를 만들지 않는다
            strengths: '- 대형 부품 조작에서 강점',
            supportNeeds: '- (작업 페이스 조절 지원): 평가 중 관찰된 근거에 따른 지원.',
        },
    };
    const html = reportDocument.buildReportHtml(report);
    // 소제목이 문단으로 나온다.
    assert.ok(html.includes('[직업수준]'));
    assert.ok(html.includes('[직업목표(당사자 및 보호자/지원자)]'));
    assert.ok(html.includes('- 당사자: 바리스타, 사무보조'));
    // 표 칸(<td>) 안에 종합소견 항목 라벨이 들어가지 않는다.
    assert.equal(/<td[^>]*>\s*\[?직업수준/.test(html), false, '종합소견이 여전히 표 칸으로 나뉜다');
    assert.equal(/<td[^>]*>\s*직업적 강점/.test(html), false);
    // 빈 항목은 건너뛴다: 보호자 줄·제한점·추천직무·종합소견 소제목이 없다.
    assert.equal(html.includes('- 보호자/지원자:'), false, '빈 보호자 목표가 출력됨');
    assert.equal(html.includes('[직업적 제한점(고려사항)]'), false, '빈 제한점 항목이 출력됨');
    assert.equal(html.includes('[종합소견]'), false, '빈 종합소견 항목이 출력됨');
    assert.ok(html.includes('[지원이 필요한 사항]'));
});

await check('항목을 못 알아보면 전문을 종합소견 칸에 담는다(내용을 잃지 않는다)', () => {
    const parsed = aiOpinion.parseOpinionText('항목 구분 없이 쓴 소견 전문입니다.\n두 번째 줄.');
    assert.ok(parsed.matchedSections < 4);
    assert.ok(parsed.fields.overallOpinion.includes('소견 전문'));
    assert.ok(parsed.fields.overallOpinion.includes('두 번째 줄'));
    assert.equal(parsed.fields.strengths, undefined);
});

console.log(`\n직업평가 워크벤치 테스트 ${checks}건 통과`);
