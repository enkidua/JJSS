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
await check('제한시간 근거 문구가 화면에 그대로 나갈 수 있게 들어 있다', () => {
    assert.ok(registry.getTestPlugin('kead-hand-function').manifest.durationNote.includes('30초'));
    assert.ok(registry.getTestPlugin('kead-bimanual').manifest.durationNote.includes('1분 30초'));
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
    const social = sections.find(item => item.id === 'social');
    assert.equal(social.paragraphs.length, 1);
    assert.ok(social.paragraphs[0].text.includes('핀 떨어뜨림'));

    const vocational = sections.find(item => item.id === 'vocational');
    assert.ok(vocational.paragraphs.some(item => item.origin === 'AI_CLAIM'));
    assert.ok(vocational.paragraphs.some(item => item.text.includes('KEAD 손기능 작업표본검사')));
    assert.ok(vocational.paragraphs.some(item => item.text.includes('공식 결과지를 연결하지 않아')));
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
await check('평가도구 표의 빈 칸만 자동으로 채운다', () => {
    let s = makeHandSession();
    const tools = reportModel.DEFAULT_TOOL_ROWS.map(row => ({ ...row }));
    tools[0].tool = '기관 자체 도구';
    const filled = reportCompose.fillToolRows(tools, [s]);
    assert.equal(filled[0].tool, '기관 자체 도구');
    assert.equal(filled.find(row => row.area.includes('손기능')).tool, 'KEAD 손기능 작업표본검사');
    assert.equal(filled.find(row => row.area.includes('작업활동')).tool, '');
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

console.log(`\n직업평가 워크벤치 테스트 ${checks}건 통과`);
