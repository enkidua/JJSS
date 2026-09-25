// 배포용(packaged) 앱의 보안 저장소 fail-closed·키 복원 후 재암호화·개발 모드 v1 허용 회귀 테스트
// 실행: node scripts/test-secure-key.mjs  (네트워크·실제 API 사용 없음, 합성 데이터만 사용)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createFakeIndexedDB } from './fakeIndexedDB.mjs';

const require = createRequire(import.meta.url);

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
localStorage.setItem('jjss-installation-id', 'inst-secure-key-test-0123456789-1700000000000');
const fakeDb = createFakeIndexedDB();
globalThis.indexedDB = fakeDb.indexedDB;
const DB_NAME = 'JJSS_LOCAL_DB';

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

/** 새 crypto·localDB 인스턴스(키 캐시 초기화). window 설정 후 호출한다. */
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

const randomDataKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const SECURE_MESSAGE = '운영체제 보안 저장소를 사용할 수 없어 개인정보를 안전하게 저장할 수 없습니다. 앱을 재실행하거나 운영체제 보안 설정을 확인해 주세요.';
const DECRYPT_MESSAGE = '보안 키를 불러오지 못했습니다. 기존 데이터를 삭제하지 않았습니다.';
const PII = ['홍가람', '010-1234-5678', '서울특별시 마포구 월드컵로 123', '취업상담 합성 내용', '합성 개인정보 테스트'];
const rawJson = storeName => JSON.stringify(fakeDb.rawRecords(DB_NAME, storeName));
const assertNoPlaintext = (storeName, label) => {
    const raw = rawJson(storeName);
    for (const text of PII) assert.equal(raw.includes(text), false, `${label}: raw ${storeName}에 평문 "${text}"가 있으면 안 됨`);
};

// ─── 1. 브라우저 개발 모드(jjssSecure 없음): v1 허용 ───
setWindow(undefined);
const dev = await loadModules();
const v1Cipher = await dev.crypto.encrypt('홍가람');
assert.ok(v1Cipher.startsWith('enc:v1:'), '개발 모드는 enc:v1 허용');
assert.deepEqual(await dev.crypto.getEncryptionKeyInfo(), { kind: 'installation', platform: null });
// 이전 버전(개발 모드)에서 저장된 v1 이용자 레코드를 준비한다.
await dev.db.addDoc('seekers', { id: 'seeker-v1', name: '홍가람', phone: '010-1234-5678', address: '서울특별시 마포구 월드컵로 123', age: 36, notes: '취업상담 합성 내용', organization: '기관' });
const v1Record = fakeDb.rawRecords(DB_NAME, 'seekers').find(item => item.id === 'seeker-v1');
assert.ok(v1Record.name.startsWith('enc:v1:') && v1Record.age.startsWith('enc:v1:'), '개발 모드 저장값은 v1 암호문(숫자 필드 포함)');
assertNoPlaintext('seekers', '개발 모드');
console.log('PASS 브라우저 개발 모드: enc:v1 암호화 허용, 평문 저장 없음');

// ─── 2. 패키징된 앱 + 보안 저장소 사용 불가: fail-closed ───
setWindow({ getDataKey: async () => null, getStatus: async () => ({ available: false, packaged: true, platform: 'win32' }) });
const blocked = await loadModules();
await assert.rejects(() => blocked.crypto.encrypt('홍가람'), error => {
    assert.equal(blocked.crypto.isSecureStorageUnavailableError(error), true);
    assert.equal(error.message, SECURE_MESSAGE);
    return true;
});
assert.ok(events.includes('jjss:secure-storage-unavailable'), '저장 차단 안내 이벤트');
assert.equal(await blocked.crypto.encrypt(''), '', '빈 값은 암호화할 필요가 없으므로 그대로');
assert.deepEqual(await blocked.crypto.getEncryptionKeyInfo(), { kind: 'unavailable', platform: 'win32' });

const seekersBefore = rawJson('seekers');
await assert.rejects(() => blocked.db.addDoc('seekers', { name: '김합성', phone: '010-9999-0000', organization: '기관' }), /운영체제 보안 저장소/);
await assert.rejects(() => blocked.db.updateDoc('seekers', 'seeker-v1', { notes: '새 상담 메모' }), /운영체제 보안 저장소/);
assert.equal(rawJson('seekers'), seekersBefore, '저장 실패 시 기존 레코드 변경 없음(v1·평문 신규 저장 없음)');
assert.equal(rawJson('seekers').includes('김합성'), false);
await assert.rejects(() => blocked.db.addDoc('trainingState', { id: 'work-training', rooms: [{ id: 'r1', trainees: [{ id: 't1', name: '홍가람', memo: '합성 개인정보 테스트' }] }] }), /운영체제 보안 저장소/);
assert.equal(fakeDb.rawRecords(DB_NAME, 'trainingState').length, 0, '훈련 기록도 평문·v1로 저장하지 않음');
await assert.rejects(() => blocked.db.addDoc('jobs', { id: 'job-1', companyName: '합성상사', contactPerson: '홍가람', contactPhone: '010-1234-5678' }), /운영체제 보안 저장소/);
assert.equal(fakeDb.rawRecords(DB_NAME, 'jobs').length, 0);
// 기존 v1 데이터는 계속 읽는다.
const readV1 = await blocked.db.getById('seekers', 'seeker-v1');
assert.deepEqual({ name: readV1.name, phone: readV1.phone, age: readV1.age }, { name: '홍가람', phone: '010-1234-5678', age: 36 });
assert.equal((await blocked.crypto.decryptWithStatus(v1Cipher)).value, '홍가람');
console.log('PASS 패키징 앱 + 보안 저장소 없음: 신규 민감정보 저장 차단(평문·enc:v1 신규 저장 없음), 기존 enc:v1 읽기 유지');

// getStatus를 확인하지 못하는 Electron 환경도 안전하게 막는다.
setWindow({ getDataKey: async () => null, getStatus: async () => { throw new Error('ipc'); } });
const unknownStatus = await loadModules();
await assert.rejects(() => unknownStatus.crypto.encrypt('홍가람'), /운영체제 보안 저장소/);
setWindow({ getDataKey: async () => null });
const noStatusApi = await loadModules();
await assert.rejects(() => noStatusApi.crypto.encrypt('홍가람'), /운영체제 보안 저장소/);
console.log('PASS Electron 상태 확인 실패·getStatus 없음 → fail-closed');

// ─── 3. 패키징하지 않은 Electron 개발 실행: v1 허용 ───
setWindow({ getDataKey: async () => null, getStatus: async () => ({ available: false, packaged: false, platform: 'darwin' }) });
const unpackaged = await loadModules();
assert.ok((await unpackaged.crypto.encrypt('홍가람')).startsWith('enc:v1:'));
assert.deepEqual(await unpackaged.crypto.getEncryptionKeyInfo(), { kind: 'installation', platform: 'darwin' });
console.log('PASS 패키징하지 않은 Electron 개발 실행: enc:v1 허용');

// ─── 4. 키 복원 후: 다음 저장에서 v2로 재암호화 ───
const dataKey = randomDataKey();
setWindow({ getDataKey: async () => dataKey, getStatus: async () => ({ available: true, packaged: true, platform: 'win32' }) });
const restored = await loadModules();
assert.deepEqual(await restored.crypto.getEncryptionKeyInfo(), { kind: 'data-key', platform: 'win32' });
const v1Status = await restored.crypto.decryptWithStatus(v1Cipher);
assert.equal(v1Status.needsReEncrypt, true, '키가 있으면 v1은 재암호화 대상');
await restored.db.updateDoc('seekers', 'seeker-v1', { notes: '취업상담 합성 내용 2차' });
const migratedRecord = fakeDb.rawRecords(DB_NAME, 'seekers').find(item => item.id === 'seeker-v1');
for (const field of ['name', 'phone', 'address', 'age', 'notes']) {
    assert.ok(String(migratedRecord[field]).startsWith('enc:v2:'), `${field}는 다음 저장에서 enc:v2로 재암호화`);
}
assert.equal(migratedRecord.organization, '기관', '최소 메타데이터는 평문 유지');
const afterMigration = await restored.db.getById('seekers', 'seeker-v1');
assert.deepEqual(
    { name: afterMigration.name, age: afterMigration.age, notes: afterMigration.notes },
    { name: '홍가람', age: 36, notes: '취업상담 합성 내용 2차' },
);
await restored.db.addDoc('trainingState', {
    id: 'work-training',
    rooms: [{ id: 'r1', name: '훈련실', trainees: [{ id: 't1', name: '홍가람', memo: '합성 개인정보 테스트', photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }] }],
    attendanceBook: { '2026-09-24': { t1: '출석' } },
    progressYear: '2026',
    progressBook: {},
    trainingRecords: { t1: { counselingMemo: '취업상담 합성 내용' } },
    manager: '홍가람',
    updatedAt: { seconds: 1 },
});
const rawTraining = fakeDb.rawRecords(DB_NAME, 'trainingState')[0];
assert.ok(rawTraining.rooms.startsWith('enc:v2:') && rawTraining.trainingRecords.startsWith('enc:v2:'));
assert.equal(rawJson('trainingState').includes('iVBORw0KGgo'), false, '사진 데이터도 암호화');
assertNoPlaintext('trainingState', '키 복원 후');
assertNoPlaintext('seekers', '키 복원 후');
console.log('PASS 키 복원 후 다음 저장에서 enc:v2로 재암호화, 훈련 기록·사진 전체 암호화');

// ─── 5. 복호화 실패: 원문·암호문 노출 없음, 빈 값으로 덮어쓰지 않음 ───
setWindow({ getDataKey: async () => randomDataKey(), getStatus: async () => ({ available: true, packaged: true, platform: 'win32' }) });
const wrongKey = await loadModules();
const trainingBefore = rawJson('trainingState');
await assert.rejects(() => wrongKey.db.getById('trainingState', 'work-training'), error => {
    assert.equal(error.message, DECRYPT_MESSAGE);
    return true;
});
assert.equal(rawJson('trainingState'), trainingBefore, '훈련 기록 원본 보존');
const unreadableSeeker = await wrongKey.db.getById('seekers', 'seeker-v1');
assert.equal(unreadableSeeker.name, '', '읽지 못한 값은 빈 칸(암호문 표시 금지)');
assert.equal(String(unreadableSeeker.phone).startsWith('enc:'), false);
const seekerCipherBefore = fakeDb.rawRecords(DB_NAME, 'seekers').find(item => item.id === 'seeker-v1');
await wrongKey.db.updateDoc('seekers', 'seeker-v1', { name: '', phone: '' , status: '구직중' });
const seekerCipherAfter = fakeDb.rawRecords(DB_NAME, 'seekers').find(item => item.id === 'seeker-v1');
assert.equal(seekerCipherAfter.name, seekerCipherBefore.name, '읽지 못한 이름을 빈 값으로 덮어쓰지 않음');
assert.equal(seekerCipherAfter.phone, seekerCipherBefore.phone);
assert.equal(wrongKey.db.getDataRecoveryStatus().unreadableCount > 0, true);
console.log('PASS 복호화 실패 시 안내 문구, 암호문 비노출, 원본 보존');

// ─── 6. main 프로세스 상태 IPC (경로·키 값 없이 최소 정보만) ───
const { getSecureStatus } = require('../electron/dataKey.cjs');
assert.deepEqual(
    getSecureStatus({ app: { isPackaged: true }, safeStorage: { isEncryptionAvailable: () => false }, platform: 'win32' }),
    { available: false, packaged: true, platform: 'win32' },
);
assert.deepEqual(
    getSecureStatus({ app: { isPackaged: false }, safeStorage: { isEncryptionAvailable: () => true }, platform: 'darwin' }),
    { available: true, packaged: false, platform: 'darwin' },
);
assert.equal(
    getSecureStatus({ app: { isPackaged: true }, safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' }, platform: 'linux' }).available,
    false,
    'Linux basic_text는 보안 저장소로 보지 않음',
);
const preloadSource = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
assert.match(preloadSource, /getStatus: \(\) => ipcRenderer\.invoke\('jjss-secure:get-status'\)/);
assert.doesNotMatch(preloadSource, /safeStorage|require\(['"](?:fs|path|child_process)['"]\)|shell\./, 'preload는 제한된 IPC만 노출');
const mainSource = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
for (const setting of ['nodeIntegration: false', 'contextIsolation: true', 'sandbox: true', 'webviewTag: false']) {
    assert.ok(mainSource.includes(setting), `Electron 보안 설정 유지: ${setting}`);
}
console.log('PASS main 보안 저장소 상태 IPC와 Electron 보안 설정');

console.log('PASS test-secure-key 전체');
