// 직업훈련 화면의 순수 규칙 단위 테스트.
//  - 훈련생 사진 축소 규칙(src/pages/training/trainingPhoto.ts)
//  - 훈련생 이름 동기화·기준연도·정기평가 일시/장소(trainingModel.ts, trainingPrompts.ts)
// 모든 이름·사진은 합성 데이터이며 네트워크·저장소·실제 캔버스를 사용하지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function toModuleUrl(code) {
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

/** TS 파일을 트랜스파일해 data: URL 모듈로 불러온다. 상대 import는 `imports`로 넘긴 data: URL로 바꾼다. */
async function loadTs(relativePath, imports = {}) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    let compiled = ts.transpileModule(await readFile(sourceUrl, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [specifier, url] of Object.entries(imports)) {
        compiled = compiled.split(`'${specifier}'`).join(`'${url}'`).split(`"${specifier}"`).join(`"${url}"`);
    }
    const remaining = [...compiled.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(remaining, [], `${relativePath}: 치환되지 않은 상대 import ${remaining.join(', ')}`);
    const url = toModuleUrl(compiled);
    return { url, module: await import(url) };
}

const photo = await loadTs('../src/pages/training/trainingPhoto.ts');
const seekerUtil = await loadTs('../src/utils/seeker.ts');
const clipboard = await loadTs('../src/utils/clipboard.ts');
const model = await loadTs('../src/pages/training/trainingModel.ts', {
    '../../utils/seeker': seekerUtil.url,
    '../../utils/clipboard': clipboard.url,
});
// 프롬프트 조립만 확인하므로 참고자료·재작성 서비스는 통과시키는 대역으로 바꾼다.
const prompts = await loadTs('../src/pages/training/trainingPrompts.ts', {
    '../../services/documentRegenerationService': toModuleUrl('export const buildCurrentContentRegenerationPrompt = input => input.draftInstruction;'),
    '../../services/clientContextService': toModuleUrl('export const withClientContextPrompt = prompt => prompt;'),
    './trainingModel': model.url,
});

const {
    TRAINEE_PHOTO_MAX_EDGE, TRAINEE_PHOTO_JPEG_QUALITY, TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS,
    isImageDataUrl, needsPhotoShrink, computePhotoTargetSize, shouldReplaceStoredPhoto, shrinkPhotoDataUrl,
} = photo.module;
const { sanitizeTrainingRooms, getTrainingRecord, resolveProgressYear, buildTraineeMemo } = model.module;
const { buildEvaluationPrompt, buildCounselingPrompt } = prompts.module;

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const smallPhoto = `data:image/jpeg;base64,${'A'.repeat(20_000)}`;
const hugePhoto = `data:image/png;base64,${'A'.repeat(3_000_000)}`;

await test('사진 축소 기준: 긴 변 256px JPEG, 200KB를 넘는 저장 사진만 다시 줄인다', () => {
    assert.equal(TRAINEE_PHOTO_MAX_EDGE, 256);
    assert.ok(TRAINEE_PHOTO_JPEG_QUALITY > 0.7 && TRAINEE_PHOTO_JPEG_QUALITY <= 0.95);
    assert.equal(TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS, 200 * 1024);
    assert.equal(needsPhotoShrink(smallPhoto), false);
    assert.equal(needsPhotoShrink(hugePhoto), true);
    const prefix = 'data:image/jpeg;base64,';
    assert.equal(needsPhotoShrink(prefix + 'A'.repeat(TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS - prefix.length)), false, '기준 길이와 같으면 그대로');
    assert.equal(needsPhotoShrink(prefix + 'A'.repeat(TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS - prefix.length + 1)), true);
    // data URL이 아닌 값(주소·빈 값·잘못된 형식)은 건드리지 않는다
    assert.equal(needsPhotoShrink(`https://example.invalid/${'a'.repeat(300_000)}`), false);
    assert.equal(needsPhotoShrink(`data:text/plain;base64,${'A'.repeat(300_000)}`), false);
    assert.equal(needsPhotoShrink(''), false);
    assert.equal(needsPhotoShrink(undefined), false);
    assert.equal(needsPhotoShrink(null), false);
    assert.equal(needsPhotoShrink(12345), false);
    assert.equal(isImageDataUrl(smallPhoto), true);
    assert.equal(isImageDataUrl('data:application/pdf;base64,AAAA'), false);
});

await test('축소 크기 계산: 비율 유지, 작은 사진은 키우지 않음', () => {
    assert.deepEqual(computePhotoTargetSize(4000, 3000), { width: 256, height: 192 });
    assert.deepEqual(computePhotoTargetSize(3000, 4000), { width: 192, height: 256 });
    assert.deepEqual(computePhotoTargetSize(256, 256), { width: 256, height: 256 });
    assert.deepEqual(computePhotoTargetSize(120, 80), { width: 120, height: 80 });
    assert.deepEqual(computePhotoTargetSize(5000, 3), { width: 256, height: 1 }, '아주 길쭉해도 0px이 되지 않음');
    assert.deepEqual(computePhotoTargetSize(1000, 500, 100), { width: 100, height: 50 });
    for (const [width, height] of [[1, 1], [257, 255], [1920, 1080], [1080, 1920], [6000, 4000], [333, 777]]) {
        const size = computePhotoTargetSize(width, height);
        assert.ok(Math.max(size.width, size.height) <= 256, `${width}x${height}`);
        assert.ok(size.width >= 1 && size.height >= 1 && Number.isInteger(size.width) && Number.isInteger(size.height));
    }
    assert.equal(computePhotoTargetSize(0, 100), null);
    assert.equal(computePhotoTargetSize(100, -1), null);
    assert.equal(computePhotoTargetSize(Number.NaN, 100), null);
    assert.equal(computePhotoTargetSize(100, Infinity), null);
    assert.equal(computePhotoTargetSize(100, 100, 0), null);
});

await test('저장된 사진 교체 판단: 더 작은 JPEG일 때만 바꾸고, 아니면 원본 유지', () => {
    assert.equal(shouldReplaceStoredPhoto(hugePhoto, smallPhoto), true);
    assert.equal(shouldReplaceStoredPhoto(smallPhoto, hugePhoto.replace('image/png', 'image/jpeg')), false, '더 커지면 바꾸지 않음');
    assert.equal(shouldReplaceStoredPhoto(hugePhoto, 'data:image/png;base64,AAAA'), false, 'JPEG로 만들지 못한 결과');
    assert.equal(shouldReplaceStoredPhoto(hugePhoto, 'data:,'), false);
    assert.equal(shouldReplaceStoredPhoto(hugePhoto, ''), false);
    assert.equal(shouldReplaceStoredPhoto(hugePhoto, undefined), false);
});

/** 브라우저의 Image·canvas 대역. 실제 디코딩 없이 축소 흐름(크기·형식·실패 처리)만 확인한다. */
function installFakeDom({ width = 4000, height = 3000, decodeFails = false, noContext = false, output = 'data:image/jpeg;base64,SHRUNK' } = {}) {
    const calls = { canvases: [], draws: [], fills: [], encodes: [] };
    globalThis.Image = class {
        set src(value) {
            this.loadedFrom = value;
            queueMicrotask(() => {
                if (decodeFails) this.onerror?.(new Error('decode'));
                else {
                    this.naturalWidth = width;
                    this.naturalHeight = height;
                    this.onload?.();
                }
            });
        }
    };
    globalThis.document = {
        createElement(tag) {
            assert.equal(tag, 'canvas');
            const canvas = {
                width: 0,
                height: 0,
                getContext(kind) {
                    assert.equal(kind, '2d');
                    if (noContext) return null;
                    return {
                        fillStyle: '',
                        fillRect(...args) { calls.fills.push({ style: this.fillStyle, args }); },
                        drawImage(_image, ...args) { calls.draws.push(args); },
                    };
                },
                toDataURL(type, quality) {
                    calls.encodes.push({ type, quality, width: canvas.width, height: canvas.height });
                    return output;
                },
            };
            calls.canvases.push(canvas);
            return canvas;
        },
    };
    return calls;
}

await test('사진 줄이기: 256px JPEG로 다시 그리고, 투명 배경은 흰색으로 채운다', async () => {
    const calls = installFakeDom({ width: 4000, height: 3000 });
    const result = await shrinkPhotoDataUrl(hugePhoto);
    assert.equal(result, 'data:image/jpeg;base64,SHRUNK');
    assert.deepEqual(calls.encodes, [{ type: 'image/jpeg', quality: TRAINEE_PHOTO_JPEG_QUALITY, width: 256, height: 192 }]);
    assert.deepEqual(calls.draws, [[0, 0, 256, 192]]);
    assert.deepEqual(calls.fills, [{ style: '#ffffff', args: [0, 0, 256, 192] }]);
    assert.equal(needsPhotoShrink(result), false, '줄인 결과는 다시 줄일 대상이 아니다(반복 저장 방지)');
});

await test('사진 줄이기 실패: 원본을 돌려주지 않고 오류를 던진다(호출한 쪽이 등록을 거부하거나 기존 사진을 유지)', async () => {
    installFakeDom({ decodeFails: true });
    await assert.rejects(shrinkPhotoDataUrl(hugePhoto), /사진을 열지 못했습니다/);
    installFakeDom({ noContext: true });
    await assert.rejects(shrinkPhotoDataUrl(hugePhoto));
    installFakeDom({ output: 'data:image/png;base64,AAAA' });
    await assert.rejects(shrinkPhotoDataUrl(hugePhoto), 'JPEG로 인코딩하지 못한 결과는 쓰지 않는다');
    installFakeDom({ output: 'data:,' });
    await assert.rejects(shrinkPhotoDataUrl(hugePhoto));
    installFakeDom({ width: 0, height: 0 });
    await assert.rejects(shrinkPhotoDataUrl(hugePhoto), /사진 크기/);
    installFakeDom();
    await assert.rejects(shrinkPhotoDataUrl('https://example.invalid/photo.jpg'), /사진 파일이 아닙니다/);
    await assert.rejects(shrinkPhotoDataUrl('data:application/pdf;base64,AAAA'));
    // 파일 종류 없이 읽힌 사진(확장자만 있는 파일)은 디코딩을 시도한다
    assert.equal(await shrinkPhotoDataUrl('data:application/octet-stream;base64,AAAA'), 'data:image/jpeg;base64,SHRUNK');
});

function seeker(overrides = {}) {
    return { id: 'seeker-1', seekerId: 'S-001', name: '가상이용자', disabilityType: '지적장애', severity: '중증', desiredJob1: '사무보조', notes: '', ...overrides };
}
function trainee(overrides = {}) {
    return { id: 'trainee-seeker-1', seekerId: 'seeker-1', name: '가상이용자', gender: '등록정보', memo: '지적장애 / 중증 / 사무보조', score: 0, ...overrides };
}
function room(trainees, overrides = {}) {
    return { id: 'room-1', name: '합성 훈련실', teacher: '', program: '', year: '2026', trainees, ...overrides };
}

await test('훈련생 이름 동기화: 이용자 관리에서 고친 이름이 연결된 훈련생에게 반영된다', () => {
    const rooms = [room([trainee({ name: '가상이용쟈' }), trainee({ id: 'trainee-seeker-2', seekerId: 'S-002', name: '옛이름', memo: '옛 메모' })])];
    const seekers = [seeker(), seeker({ id: 'seeker-2', seekerId: 'S-002', name: '새이름', disabilityType: '자폐성장애', severity: '', desiredJob1: '', desiredJob2: '포장' })];
    const next = sanitizeTrainingRooms(rooms, seekers);
    assert.deepEqual(next[0].trainees.map(item => item.name), ['가상이용자', '새이름']);
    assert.equal(next[0].trainees[1].memo, buildTraineeMemo(seekers[1]));
    assert.equal(next[0].trainees[1].memo, '자폐성장애 / 포장');
    // 식별자·사진·점수 등 다른 값은 그대로
    assert.equal(next[0].trainees[0].id, 'trainee-seeker-1');
    assert.equal(next[0].trainees[1].seekerId, 'S-002');
    assert.notEqual(next[0], rooms[0], '바뀐 훈련실은 새 객체');
    assert.equal(rooms[0].trainees[0].name, '가상이용쟈', '원본 배열은 고치지 않는다');
});

await test('훈련생 이름 동기화: 바뀐 것이 없으면 같은 객체를 돌려주고(불필요한 저장 없음), 연결 없는 이름은 덮어쓰지 않는다', () => {
    const rooms = [room([trainee()]), room([], { id: 'room-2' })];
    const seekers = [seeker()];
    const same = sanitizeTrainingRooms(rooms, seekers);
    assert.equal(same[0], rooms[0]);
    assert.equal(same[1], rooms[1]);
    // 한 번 맞춘 뒤 다시 돌려도 더 바뀌지 않는다(저장 반복 방지)
    const renamed = sanitizeTrainingRooms([room([trainee({ name: '옛이름' })])], seekers);
    const again = sanitizeTrainingRooms(renamed, seekers);
    assert.equal(again[0], renamed[0]);
    // 이용자 목록을 아직 못 읽었으면(빈 목록) 이름을 건드리지 않고 명단도 지우지 않는다
    const untouched = sanitizeTrainingRooms([room([trainee({ name: '옛이름' })])], []);
    assert.equal(untouched[0].trainees[0].name, '옛이름');
    // 이용자 쪽 이름·정보가 비어 있으면 기존 값을 지우지 않는다
    const blank = sanitizeTrainingRooms([room([trainee({ name: '기존이름', memo: '기존 메모' })])], [seeker({ name: '  ', disabilityType: '', severity: '', desiredJob1: '' })]);
    assert.equal(blank[0].trainees[0].name, '기존이름');
    assert.equal(blank[0].trainees[0].memo, '기존 메모');
    // 동명이인: 식별자로만 맞춘다(이름이 같아도 다른 이용자의 정보로 바꾸지 않음)
    const others = sanitizeTrainingRooms([room([trainee({ name: '동명이인' })])], [seeker({ name: '고친이름' }), seeker({ id: 'seeker-9', seekerId: 'S-009', name: '동명이인' })]);
    assert.equal(others[0].trainees[0].name, '고친이름');
});

await test('훈련생 정리(기존 동작 유지): 삭제된 이용자·연결 없는 훈련생·예시 자료는 명단에서 빠진다', () => {
    const rooms = [room([
        trainee(),
        trainee({ id: 'trainee-gone', seekerId: 'gone', name: '삭제된이용자' }),
        trainee({ id: 'trainee-nolink', seekerId: undefined, name: '연결없음' }),
        trainee({ id: 'sample-1', name: '예시' }),
    ])];
    const next = sanitizeTrainingRooms(rooms, [seeker()]);
    assert.deepEqual(next[0].trainees.map(item => item.id), ['trainee-seeker-1']);
    assert.equal(sanitizeTrainingRooms([], [seeker()]).length, 1, '훈련실이 없으면 기본 훈련실 1개');
});

await test('정기평가 일시·장소: 상담 칸과 따로 보관하고, 예전 저장 자료는 빈 값으로 읽는다', () => {
    const legacy = { 'trainee-seeker-1': { plan: '계획', counselingDate: '2026년 4월 24일 14:00', counselingPlace: '상담실', counselingHistory: ['1회기'] } };
    const record = getTrainingRecord(legacy, 'trainee-seeker-1');
    assert.equal(record.evaluationDate, '');
    assert.equal(record.evaluationPlace, '');
    assert.equal(record.counselingDate, '2026년 4월 24일 14:00', '예전 상담일시는 그대로');
    assert.equal(record.plan, '계획');
    assert.deepEqual(record.counselingHistory, ['1회기']);
    const saved = getTrainingRecord({ t: { evaluationDate: '2026년 6월 30일', evaluationPlace: '훈련실', evaluationMemo: '메모' } }, 't');
    assert.equal(saved.evaluationDate, '2026년 6월 30일');
    assert.equal(saved.evaluationPlace, '훈련실');
    assert.equal(getTrainingRecord({ t: { evaluationDate: 20260630 } }, 't').evaluationDate, '', '문자열이 아닌 값은 빈 값');
});

await test('정기평가 프롬프트: 평가일시·평가장소를 넣고, 상담일시·상담장소와 섞지 않는다', () => {
    const base = getTrainingRecord({ t: {
        plan: '합성 계획', counselingDate: '상담날짜-표식', counselingPlace: '상담장소-표식',
        evaluationDate: '2026년 6월 30일 10:00', evaluationPlace: '합성 평가실', evaluationMemo: '합성 평가 메모',
    } }, 't');
    const prompt = buildEvaluationPrompt({ seekerContext: '[이용자]', record: base, manager: '', contextSummary: '' });
    assert.ok(prompt.includes('평가일시: 2026년 6월 30일 10:00'));
    assert.ok(prompt.includes('평가장소: 합성 평가실'));
    assert.ok(prompt.includes('합성 평가 메모'));
    assert.ok(!prompt.includes('상담날짜-표식') && !prompt.includes('상담장소-표식'));
    // 비어 있으면 줄 자체를 넣지 않는다(빈 항목으로 '확인 필요'를 유도하지 않음)
    const empty = buildEvaluationPrompt({ seekerContext: '[이용자]', record: { ...base, evaluationDate: '', evaluationPlace: '  ' }, manager: '', contextSummary: '' });
    assert.ok(!empty.includes('평가일시') && !empty.includes('평가장소') && !empty.includes('[평가 기본 정보]'));
    const onlyDate = buildEvaluationPrompt({ seekerContext: '[이용자]', record: { ...base, evaluationPlace: '' }, manager: '', contextSummary: '' });
    assert.ok(onlyDate.includes('평가일시: 2026년 6월 30일 10:00') && !onlyDate.includes('평가장소:'));
    // 수정본 보완(재작성) 경로에도 같은 정보가 들어간다
    const rewrite = buildEvaluationPrompt({ seekerContext: '[이용자]', record: { ...base, evaluation: '기존 평가서' }, manager: '', contextSummary: '' });
    assert.ok(rewrite.includes('평가장소: 합성 평가실'));
    // 상담일지 프롬프트는 상담 칸만 쓴다
    const counseling = buildCounselingPrompt({ seekerContext: '[이용자]', record: base, manager: '', contextSummary: '' });
    assert.ok(counseling.includes('상담일시: 상담날짜-표식') && !counseling.includes('합성 평가실'));
});

await test("기준연도: 비었거나 4자리가 아니면 올해를 쓰고, 빈 연도('')로 저장하지 않는다", () => {
    assert.equal(resolveProgressYear('2025', '2026'), '2025');
    assert.equal(resolveProgressYear(' 2025 ', '2026'), '2025');
    assert.equal(resolveProgressYear('', '2026'), '2026');
    assert.equal(resolveProgressYear('   ', '2026'), '2026');
    assert.equal(resolveProgressYear(undefined, '2026'), '2026');
    assert.equal(resolveProgressYear('202', '2026'), '2026', '입력 중인 값');
    assert.equal(resolveProgressYear('20266', '2026'), '2026');
    assert.equal(resolveProgressYear('이천이십육', '2026'), '2026');
    // 빈 연도 키가 이미 있어도 그 키로 계속 쓰지 않는다
    assert.equal(resolveProgressYear('', '2026', { '': { t: {} } }), '2026');
    // 예전에 다른 모양으로 저장해 둔 연도는 그대로 열 수 있다
    assert.equal(resolveProgressYear('2026년', '2026', { '2026년': { t: {} } }), '2026년');
    assert.equal(resolveProgressYear('2026년', '2026', { '2026년': {} }), '2026');
    assert.equal(resolveProgressYear('2026년', '2026', {}), '2026');
});

console.log(`\n${passed}개 테스트 통과`);
