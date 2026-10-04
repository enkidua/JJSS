// 저장 데이터 일괄 재암호화(at-rest migration) 회귀 테스트
// 실행: node scripts/test-at-rest-migration.mjs  (네트워크·실제 API 사용 없음, 합성 데이터와 가짜 IndexedDB·jjssSecure만 사용)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createFakeIndexedDB } from './fakeIndexedDB.mjs';

// ─── 브라우저 전역 흉내 ───
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
    value: {
        getItem: key => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => { storage.set(key, String(value)); },
        removeItem: key => { storage.delete(key); },
    },
    configurable: true,
    writable: true,
});
const INSTALLATION_ID = 'inst-at-rest-migration-test-0123456789-1700000000000';
localStorage.setItem('jjss-installation-id', INSTALLATION_ID);
let fakeDb = createFakeIndexedDB();
globalThis.indexedDB = fakeDb.indexedDB;
const DB_NAME = 'JJSS_LOCAL_DB';
const STORES = ['seekers', 'jobs', 'caseDocuments', 'expenses', 'resources', 'posts', 'comments', 'settings', 'trainingState'];
const MARKER_KEY = 'jjss:at-rest-migration';

let moduleInstance = 0;
async function compileTsModule(relativePath, replacements = []) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    let compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [pattern, replacement] of replacements) compiled = compiled.replace(pattern, replacement);
    moduleInstance += 1;
    compiled += `\n// instance ${moduleInstance}\n`;
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

/** 새 crypto·localDB 인스턴스(키 캐시·DB 연결 초기화 = 앱 재시작). window 설정 후 호출한다. */
async function loadModules() {
    const cryptoUrl = await compileTsModule('../src/config/crypto.ts');
    const localDbUrl = await compileTsModule('../src/config/localDB.ts', [
        [/from ['"]\.\/crypto['"]/g, `from ${JSON.stringify(cryptoUrl)}`],
    ]);
    return { crypto: await import(cryptoUrl), db: await import(localDbUrl) };
}

const events = [];
function setWindow(secure) {
    events.length = 0;
    if (secure === undefined) {
        delete globalThis.window;
        return;
    }
    globalThis.window = { jjssSecure: secure, dispatchEvent: event => { events.push(event.type); return true; } };
}

// ─── 합성 데이터·암호문 준비 ───
const b64 = bytes => Buffer.from(bytes).toString('base64');
const randomDataKey = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PII = [
    '홍가람', '010-1234-5678', '서울특별시 마포구 월드컵로 123', '월드컵로 123', '취업상담 합성 내용', '합성 개인정보 테스트',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', '김합성', '010-2222-3333', '박합성', '이합성', '구직중',
];

async function aesGcm(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
    return `${b64(iv)}.${b64(ct)}`;
}

/** 접두어 없는 이전 형식 암호문(APP_SEED + 설치 ID 파생 키) */
async function legacyCipher(plaintext) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(`JJSS-Desktop-Secure-2026::${INSTALLATION_ID}`), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: new TextEncoder().encode('JJSS-salt-v1'), iterations: 100_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    );
    return aesGcm(key, plaintext);
}

/** 이 PC의 키로는 풀 수 없는 암호문(다른 PC·다른 설치의 키) */
async function foreignCipher(prefix, plaintext) {
    const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt']);
    return `${prefix}${await aesGcm(key, plaintext)}`;
}

const rawDump = () => Object.fromEntries(STORES.map(name => [name, fakeDb.rawRecords(DB_NAME, name)]));
const rawText = () => JSON.stringify(rawDump());
const rawRecord = (storeName, id) => fakeDb.rawRecords(DB_NAME, storeName).find(item => item.id === id);
function assertNoPlaintext(label) {
    const text = rawText();
    for (const value of PII) assert.equal(text.includes(value), false, `${label}: raw IndexedDB에 평문 "${value.slice(0, 30)}"가 있으면 안 됨`);
}
const isV2 = value => typeof value === 'string' && value.startsWith('enc:v2:');
const isV1 = value => typeof value === 'string' && value.startsWith('enc:v1:');

// 이전 버전(개발 모드)이 남긴 enc:v1 값과 레코드
setWindow(undefined);
const dev = await loadModules();
const v1Name = await dev.crypto.encrypt('김합성');
assert.ok(isV1(v1Name));
await dev.db.addDoc('seekers', { id: 'seeker-v1', name: '박합성', age: 41, notes: '취업상담 합성 내용', organization: '기관', createdAt: { seconds: 1 } });
assert.ok(isV1(rawRecord('seekers', 'seeker-v1').age), '개발 모드 v1 레코드(숫자 필드는 JSON 암호화)');

const legacyPhone = await legacyCipher('010-2222-3333');
const undecryptable = await foreignCipher('enc:v2:', '이합성');
const undecryptableV1 = await foreignCipher('enc:v1:', '이합성 추천기관');

// 이전 버전이 남긴 평문 레코드(수정하지 않아 그대로 남아 있던 데이터)
fakeDb.putRaw(DB_NAME, 'seekers', {
    id: 'seeker-plain', name: '홍가람', seekerId: '홍가람-0001', phone: '010-1234-5678', address: '서울특별시 마포구 월드컵로 123',
    age: 36, status: '구직중', notes: '취업상담 합성 내용', organization: '기관', createdAt: { seconds: 2 },
});
fakeDb.putRaw(DB_NAME, 'seekers', {
    id: 'seeker-mixed', name: v1Name, phone: legacyPhone, disabilityType: undecryptable, recommendingAgency: undecryptableV1, desiredJob1: '사무보조', organization: '기관',
});
fakeDb.putRaw(DB_NAME, 'trainingState', {
    id: 'work-training',
    rooms: [{ id: 'room-1', name: '합성 훈련실', trainees: [{ id: 'trainee-1', name: '홍가람', memo: '합성 개인정보 테스트', score: 3, photoDataUrl: PHOTO }] }],
    attendanceBook: { '2026-09-24': { 'trainee-1': '출석' } },
    progressYear: '2026',
    trainingRecords: { 'trainee-1': { counselingMemo: '취업상담 합성 내용' } },
    manager: '홍가람',
    updatedAt: { seconds: 3 },
});
fakeDb.putRaw(DB_NAME, 'jobs', { id: 'job-plain', companyName: '합성상사', jobRole: '사무보조', contactPerson: '홍가람', contactPhone: '010-1234-5678' });
fakeDb.putRaw(DB_NAME, 'caseDocuments', {
    id: 'doc-plain', type: 'counseling', tab: 'case', seekerId: 'seeker-plain', seekerName: '홍가람', title: '홍가람 상담일지',
    content: '취업상담 합성 내용', createdAt: { seconds: 4 },
});
fakeDb.putRaw(DB_NAME, 'expenses', { id: 'expense-plain', date: '2026-09-24', category: '교통비', description: '홍가람 교통비', vendor: '홍가람', amount: 1000 });
fakeDb.putRaw(DB_NAME, 'resources', { id: 'resource-1', title: '공개 자료', url: 'https://example.invalid/' });
const resourceBefore = JSON.stringify(rawRecord('resources', 'resource-1'));

// ─── 1. 배포용 앱 + 보안 저장소 사용 불가: 아무것도 쓰지 않음 ───
setWindow({ getDataKey: async () => null, getStatus: async () => ({ available: false, packaged: true, platform: 'win32' }) });
const blocked = await loadModules();
const beforeBlocked = rawText();
const writesBeforeBlocked = fakeDb.writeCount();
const blockedResult = await blocked.db.migrateAtRestEncryption();
assert.equal(blockedResult.status, 'skipped');
assert.equal(blockedResult.reason, 'secure-storage-unavailable');
assert.equal(fakeDb.writeCount(), writesBeforeBlocked, '키가 없으면 쓰기 없음');
assert.equal(rawText(), beforeBlocked, '키가 없으면 원본 변경 없음(평문·v1 신규 저장 없음)');
assert.equal(localStorage.getItem(MARKER_KEY), null, '완료 표지도 남기지 않음');
assert.deepEqual(events, [], '저장 차단 안내를 띄우지 않음(저장 시도 자체를 하지 않음)');
console.log('PASS 패키징 앱 + 보안 저장소 없음: migration 건너뜀, 쓰기 0건, 원본 그대로');

// ─── 2. 데이터 키 사용 가능: 전부 enc:v2로 재암호화 ───
const dataKey = randomDataKey();
const secureApi = { getDataKey: async () => dataKey, getStatus: async () => ({ available: true, packaged: true, platform: 'win32' }) };
setWindow(secureApi);
let keyed = await loadModules();
const firstResult = await keyed.db.migrateAtRestEncryption();
assert.equal(firstResult.status, 'completed');
assert.equal(firstResult.scheme, 'v2');
assert.equal(firstResult.unreadableFields, 1, '재암호화하려다 복호화하지 못한 enc:v1 값 1개(현재 형식 v2는 복호화하지 않고 건너뜀)');
assert.equal(firstResult.failedRecords, 0);
assert.equal(firstResult.updatedRecords, 7, '평문·v1·이전 형식이 있던 레코드 7건만 다시 씀');
assertNoPlaintext('migration 후');

const seekerPlain = rawRecord('seekers', 'seeker-plain');
for (const field of ['name', 'seekerId', 'phone', 'address', 'age', 'status', 'notes']) assert.ok(isV2(seekerPlain[field]), `이용자 ${field} → enc:v2`);
assert.equal(seekerPlain.organization, '기관', '최소 메타데이터는 평문 유지');
assert.deepEqual(seekerPlain.createdAt, { seconds: 2 });
const seekerMixed = rawRecord('seekers', 'seeker-mixed');
assert.ok(isV2(seekerMixed.name), 'enc:v1 → enc:v2');
assert.ok(isV2(seekerMixed.phone), '이전 형식 암호문 → enc:v2');
assert.ok(isV2(seekerMixed.desiredJob1));
assert.equal(seekerMixed.disabilityType, undecryptable, '복호화하지 못한 v2 암호문은 한 글자도 바꾸지 않음');
assert.equal(seekerMixed.recommendingAgency, undecryptableV1, '복호화하지 못한 v1 암호문도 원본 그대로 보존');
const seekerV1 = rawRecord('seekers', 'seeker-v1');
for (const field of ['name', 'age', 'notes']) assert.ok(isV2(seekerV1[field]), `v1 레코드 ${field} → enc:v2`);
const training = rawRecord('trainingState', 'work-training');
for (const field of ['rooms', 'attendanceBook', 'trainingRecords', 'manager']) assert.ok(isV2(training[field]), `훈련 ${field} → enc:v2`);
assert.equal(training.progressYear, '2026');
const job = rawRecord('jobs', 'job-plain');
assert.ok(isV2(job.contactPerson) && isV2(job.contactPhone));
assert.equal(job.companyName, '합성상사', '회사명은 평문 유지');
const doc = rawRecord('caseDocuments', 'doc-plain');
for (const field of ['seekerId', 'seekerName', 'title', 'content']) assert.ok(isV2(doc[field]), `사례문서 ${field} → enc:v2`);
assert.equal(doc.type, 'counseling');
const expense = rawRecord('expenses', 'expense-plain');
assert.ok(isV2(expense.description) && isV2(expense.vendor));
assert.equal(expense.amount, 1000, '금액은 평문 숫자 유지');
assert.equal(JSON.stringify(rawRecord('resources', 'resource-1')), resourceBefore, '암호화 대상이 아닌 store는 건드리지 않음');
for (const name of STORES) {
    for (const record of fakeDb.rawRecords(DB_NAME, name)) {
        for (const value of Object.values(record)) {
            if (value === undecryptableV1) continue;
            assert.equal(isV1(value), false, `${name}/${record.id}: enc:v1이 남으면 안 됨(복호화 못 한 값 제외)`);
        }
    }
}

const marker = JSON.parse(localStorage.getItem(MARKER_KEY));
assert.equal(marker.version, 1);
assert.equal(marker.scheme, 'v2');
assert.ok(!Number.isNaN(Date.parse(marker.completedAt)));
assert.deepEqual(Object.keys(marker).sort(), ['completedAt', 'scheme', 'version'], '완료 표지에는 비민감 메타데이터만');

// 앱 API로 읽으면 원래 값
const readPlain = await keyed.db.getById('seekers', 'seeker-plain');
assert.deepEqual(
    { name: readPlain.name, seekerId: readPlain.seekerId, phone: readPlain.phone, address: readPlain.address, age: readPlain.age, status: readPlain.status, notes: readPlain.notes },
    { name: '홍가람', seekerId: '홍가람-0001', phone: '010-1234-5678', address: '서울특별시 마포구 월드컵로 123', age: 36, status: '구직중', notes: '취업상담 합성 내용' },
);
const readV1 = await keyed.db.getById('seekers', 'seeker-v1');
assert.deepEqual({ name: readV1.name, age: readV1.age }, { name: '박합성', age: 41 });
const readTraining = await keyed.db.getById('trainingState', 'work-training');
const trainee = readTraining.rooms[0].trainees[0];
assert.deepEqual({ name: trainee.name, memo: trainee.memo, score: trainee.score, photo: trainee.photoDataUrl }, { name: '홍가람', memo: '합성 개인정보 테스트', score: 3, photo: PHOTO });
assert.equal(readTraining.attendanceBook['2026-09-24']['trainee-1'], '출석');
assert.equal(readTraining.trainingRecords['trainee-1'].counselingMemo, '취업상담 합성 내용');
assert.equal(readTraining.manager, '홍가람');
const readJob = await keyed.db.getById('jobs', 'job-plain');
assert.deepEqual({ person: readJob.contactPerson, phone: readJob.contactPhone }, { person: '홍가람', phone: '010-1234-5678' });
const readDoc = await keyed.db.getById('caseDocuments', 'doc-plain');
assert.deepEqual({ content: readDoc.content, seekerId: readDoc.seekerId, seekerName: readDoc.seekerName }, { content: '취업상담 합성 내용', seekerId: 'seeker-plain', seekerName: '홍가람' });
const readExpense = (await keyed.db.getAll('expenses'))[0];
assert.deepEqual({ vendor: readExpense.vendor, amount: readExpense.amount }, { vendor: '홍가람', amount: 1000 });
const readMixed = await keyed.db.getById('seekers', 'seeker-mixed');
assert.deepEqual({ name: readMixed.name, phone: readMixed.phone, job: readMixed.desiredJob1 }, { name: '김합성', phone: '010-2222-3333', job: '사무보조' });
assert.equal(readMixed.disabilityType, '', '읽지 못한 값은 빈 칸(암호문 표시 없음)');
assert.equal(readMixed.recommendingAgency, '');
console.log('PASS 키 사용 가능: 평문·enc:v1·이전 형식 → enc:v2, raw에 평문 없음, 읽지 못한 암호문 보존, API로 원문 복원');

// ─── 3. 다시 실행: 쓰기 없음 (같은 실행 + 재시작 모두) ───
const afterFirst = rawText();
const markerAfterFirst = localStorage.getItem(MARKER_KEY);
let writesBefore = fakeDb.writeCount();
const secondResult = await keyed.db.migrateAtRestEncryption();
assert.equal(secondResult.status, 'completed');
assert.equal(secondResult.updatedRecords, 0);
assert.equal(secondResult.convertedFields, 0);
assert.equal(fakeDb.writeCount(), writesBefore, '두 번째 실행은 쓰기 0건');
assert.equal(rawText(), afterFirst);
assert.equal(localStorage.getItem(MARKER_KEY), markerAfterFirst, '변경이 없으면 완료 표지도 그대로');
keyed = await loadModules(); // 앱 재시작
writesBefore = fakeDb.writeCount();
const restartResult = await keyed.db.migrateAtRestEncryption();
assert.equal(restartResult.updatedRecords, 0);
assert.equal(fakeDb.writeCount(), writesBefore, '재시작 후에도 쓰기 0건');
assert.equal(rawText(), afterFirst);
// 동시에 두 번 호출해도 한 번만 실행
const [c1, c2] = [keyed.db.migrateAtRestEncryption(), keyed.db.migrateAtRestEncryption()];
assert.equal(c1, c2, '같은 창에서 동시에 두 번 돌지 않음');
await c1;
console.log('PASS 두 번째 실행·재시작 후 실행: 쓰기 0건, 원본·완료 표지 그대로');

// ─── 4. 새 평문이 생기면 그 레코드만 다시 암호화 ───
fakeDb.putRaw(DB_NAME, 'jobs', { id: 'job-new-plain', companyName: '새상사', contactPerson: '홍가람', contactPhone: '010-1234-5678' });
writesBefore = fakeDb.writeCount();
const rerun = await keyed.db.migrateAtRestEncryption();
assert.equal(rerun.updatedRecords, 1);
assert.equal(rerun.convertedFields, 2);
assert.equal(fakeDb.writeCount(), writesBefore + 1, '새 평문 레코드 1건만 씀');
assertNoPlaintext('새 평문 재실행 후');
assert.equal(rawRecord('seekers', 'seeker-mixed').disabilityType, undecryptable);
assert.equal(rawRecord('seekers', 'seeker-mixed').recommendingAgency, undecryptableV1);
console.log('PASS 새 평문 발견 시 해당 레코드만 재암호화');

// ─── 5. 브라우저 개발 모드(jjssSecure 없음): v1로 암호화, 평문 쓰기 없음, v2를 낮추지 않음 ───
fakeDb = createFakeIndexedDB();
globalThis.indexedDB = fakeDb.indexedDB;
storage.delete(MARKER_KEY);
const keptV2 = await foreignCipher('enc:v2:', '이합성');
fakeDb.putRaw(DB_NAME, 'seekers', { id: 'dev-plain', name: '홍가람', phone: legacyPhone, notes: keptV2, organization: '기관' });
fakeDb.putRaw(DB_NAME, 'caseDocuments', { id: 'dev-doc', type: 'counseling', content: '취업상담 합성 내용' });
setWindow(undefined);
const browserDev = await loadModules();
const devResult = await browserDev.db.migrateAtRestEncryption();
assert.equal(devResult.status, 'completed');
assert.equal(devResult.scheme, 'v1');
assertNoPlaintext('개발 모드 migration 후');
const devSeeker = rawRecord('seekers', 'dev-plain');
assert.ok(isV1(devSeeker.name), '개발 모드 평문 → enc:v1');
assert.ok(isV1(devSeeker.phone), '이전 형식 → enc:v1');
assert.equal(devSeeker.notes, keptV2, 'enc:v2는 v1으로 낮추지 않음');
assert.ok(isV1(rawRecord('caseDocuments', 'dev-doc').content));
assert.equal(JSON.parse(localStorage.getItem(MARKER_KEY)).scheme, 'v1');
const devRead = await browserDev.db.getById('seekers', 'dev-plain');
assert.deepEqual({ name: devRead.name, phone: devRead.phone }, { name: '홍가람', phone: '010-2222-3333' });

// 이후 키가 생기면 v1 → v2
setWindow(secureApi);
const upgraded = await loadModules();
const upgradeResult = await upgraded.db.migrateAtRestEncryption();
assert.equal(upgradeResult.scheme, 'v2');
const upgradedSeeker = rawRecord('seekers', 'dev-plain');
assert.ok(isV2(upgradedSeeker.name) && isV2(upgradedSeeker.phone), '키가 생기면 v1 → v2');
assert.equal(upgradedSeeker.notes, keptV2, '읽지 못한 v2는 그대로');
assert.equal(JSON.parse(localStorage.getItem(MARKER_KEY)).scheme, 'v2', '목표 형식이 바뀌면 완료 표지 갱신');
console.log('PASS 브라우저 개발 모드: 평문·이전 형식 → enc:v1(평문 쓰기 없음, v2 유지), 키가 생기면 v2로 승격');


// ── 이용자+사례문서 원자적 삭제 ─────────────────────────────────────────
{
    const db = keyed.db;
    await db.addDoc('seekers', { id: 'del-seeker', name: '합성삭제', age: 30, organization: '기관' });
    await db.addDoc('caseDocuments', {
        id: 'del-doc-1',
        seekerId: 'del-seeker',
        seekerName: '합성삭제',
        type: 'counseling',
        content: '합성 상담 내용',
        tab: 'case',
        organization: '기관',
    });
    await db.addDoc('caseDocuments', {
        id: 'keep-doc',
        seekerId: 'other-seeker',
        seekerName: '다른이용자',
        type: 'counseling',
        content: '남아야 하는 내용',
        tab: 'case',
        organization: '기관',
    });

    await db.deleteSeekerWithDocuments('del-seeker', ['del-doc-1']);

    assert.equal((await db.getAll('seekers')).some(item => item.id === 'del-seeker'), false, '이용자 삭제됨');
    assert.equal((await db.getAll('caseDocuments')).some(item => item.id === 'del-doc-1'), false, '연결 문서 삭제됨');
    assert.equal((await db.getAll('caseDocuments')).some(item => item.id === 'keep-doc'), true, '다른 이용자 문서는 유지');

    // 없는 ID로 불러도 예외 없이 끝나고 다른 자료를 건드리지 않는다.
    await db.deleteSeekerWithDocuments('nonexistent', ['nonexistent-doc']);
    assert.equal((await db.getAll('caseDocuments')).some(item => item.id === 'keep-doc'), true, '없는 ID 삭제가 다른 자료에 영향 없음');

    await assert.rejects(() => db.deleteSeekerWithDocuments('', []), /이용자 ID가 없습니다/);
    console.log('PASS 이용자와 연결 문서를 한 트랜잭션에서 삭제(부분 삭제 없음)');
}

console.log('PASS test-at-rest-migration 전체');
