// 로컬 암호화(enc:v2 / enc:v1 / 이전 형식)와 백업 비밀번호 암호화 회귀 테스트
// 실행: node scripts/test-crypto-backup.mjs  (Node 20+ WebCrypto 사용)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createFakeIndexedDB } from './fakeIndexedDB.mjs';

// ─── 브라우저 전역 흉내 (crypto.ts가 쓰는 localStorage / navigator / screen / window) ───
const storage = new Map();
const localStorageStub = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: key => { storage.delete(key); },
    clear: () => storage.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, configurable: true, writable: true });
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'JJSS-Test-Agent/1.0', language: 'ko-KR', hardwareConcurrency: 8 },
    configurable: true,
    writable: true,
});
Object.defineProperty(globalThis, 'screen', { value: { colorDepth: 24, width: 1920, height: 1080 }, configurable: true, writable: true });

let moduleInstance = 0;
async function compileTsModule(relativePath, replacements = []) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    let compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [pattern, replacement] of replacements) compiled = compiled.replace(pattern, replacement);
    // 모듈 범위 키 캐시를 시나리오마다 새로 만들기 위해 URL을 다르게 한다.
    moduleInstance += 1;
    compiled += `\n// instance ${moduleInstance}\n`;
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

/** 새 crypto 모듈 인스턴스를 불러온다. window 설정은 첫 호출 전에 끝나 있어야 한다. */
async function loadCryptoModule() {
    const url = await compileTsModule('../src/config/crypto.ts');
    return { url, mod: await import(url) };
}

/** provider가 없으면 브라우저 개발 모드. status는 Electron main이 알려 주는 상태(기본: 패키징하지 않은 개발 실행). */
function setDataKeyProvider(provider, status = { available: true, packaged: false, platform: 'win32' }) {
    if (provider === undefined) {
        delete globalThis.window;
        return;
    }
    globalThis.window = {
        jjssSecure: { getDataKey: provider, getStatus: async () => status },
        dispatchEvent: () => true,
    };
}

const APP_SEED = 'JJSS-Desktop-Secure-2026';
const BACKUP_ITERATIONS_EXPECTED = 310_000;
const INSTALLATION_ID = 'inst-test-0123456789abcdef-1700000000000';
localStorage.setItem('jjss-installation-id', INSTALLATION_ID);

/** 수정 전 crypto.ts의 encrypt()와 동일한 알고리즘(접두어 없는 이전 형식) */
async function legacyEncrypt(seed, plaintext) {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(seed), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode('JJSS-salt-v1'), iterations: 100_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)));
    return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...ct))}`;
}

function legacyFingerprint() {
    return [
        navigator.userAgent,
        navigator.language,
        String(navigator.hardwareConcurrency),
        String(screen.colorDepth),
        String(screen.width),
        String(screen.height),
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ].join('|');
}

function randomDataKey() {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
}

// ─── 1. 데이터 키 없음(브라우저 개발 모드): enc:v1 + 이전 형식 호환 ───
setDataKeyProvider(undefined);
const { url: cryptoUrlNoKey, mod: noKey } = await loadCryptoModule();

const legacyPlain = '홍길동 010-1234-5678';
const legacyCipher = await legacyEncrypt(`${APP_SEED}::${INSTALLATION_ID}`, legacyPlain);
assert.equal(noKey.isEncrypted(legacyCipher), true, '이전 형식 암호문 인식');
let result = await noKey.decryptWithStatus(legacyCipher);
assert.equal(result.ok, true);
assert.equal(result.value, legacyPlain, '이전 형식(설치 ID 키) 암호문이 그대로 복호화되어야 함');
assert.equal(result.scheme, 'legacy');
assert.equal(result.needsReEncrypt, true, '이전 형식은 다음 저장 때 재암호화 대상');
console.log('PASS 접두어 없는 이전 형식(설치 ID 키) 암호문 복호화');

const fingerprintCipher = await legacyEncrypt(`${APP_SEED}::${legacyFingerprint()}`, 'sk-legacy-fingerprint-key');
result = await noKey.decryptWithStatus(fingerprintCipher);
assert.equal(result.ok, true);
assert.equal(result.value, 'sk-legacy-fingerprint-key', '머신 지문 키 암호문도 복호화');
console.log('PASS 접두어 없는 이전 형식(머신 지문 키) 암호문 복호화');

const v1Cipher = await noKey.encrypt('서울특별시 마포구 테스트로 1');
assert.ok(v1Cipher.startsWith('enc:v1:'), `데이터 키가 없으면 enc:v1: 형식이어야 함: ${v1Cipher.slice(0, 12)}`);
result = await noKey.decryptWithStatus(v1Cipher);
assert.deepEqual(
    { ok: result.ok, value: result.value, scheme: result.scheme, needsReEncrypt: result.needsReEncrypt },
    { ok: true, value: '서울특별시 마포구 테스트로 1', scheme: 'v1', needsReEncrypt: false },
);
assert.equal(await noKey.encrypt(''), '');
console.log('PASS enc:v1 암호화·복호화 왕복 (데이터 키 없음 → 재암호화 불필요)');

// ─── 2. isEncrypted 오탐 방지 + 평문 통과 ───
for (const plain of ['2024.0001', 'Kim123', 'abc.def', 'AAAA.BBBB', '홍길동', 'sk-proj-abc.def_123', 'AIzaSyA-test_key-0123456789']) {
    assert.equal(noKey.isEncrypted(plain), false, `평문을 암호문으로 오인하면 안 됨: ${plain}`);
    const passthrough = await noKey.decryptWithStatus(plain);
    assert.deepEqual({ ok: passthrough.ok, value: passthrough.value, encrypted: passthrough.encrypted }, { ok: true, value: plain, encrypted: false });
}
assert.equal(noKey.isEncrypted(''), false);
assert.equal(noKey.isEncrypted(v1Cipher), true);
console.log('PASS isEncrypted 오탐 없음(2024.0001, Kim123 등) 및 평문 그대로 읽기');

const tampered = `${v1Cipher.slice(0, -4)}${v1Cipher.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
result = await noKey.decryptWithStatus(tampered);
assert.equal(result.ok, false, '변조된 암호문은 실패');
assert.equal(result.value, '', '실패 시 암호문 대신 빈 값');
console.log('PASS 복호화 실패 시 빈 값 + 실패 표시');

// ─── 3. DPAPI 데이터 키 있음: enc:v2, 이전 형식·v1 재암호화 표시 ───
const dataKey = randomDataKey();
setDataKeyProvider(async () => dataKey);
const { mod: withKey } = await loadCryptoModule();
assert.equal((await withKey.getEncryptionKeyInfo()).kind, 'data-key');
const v2Cipher = await withKey.encrypt('지적장애 · 중증');
assert.ok(v2Cipher.startsWith('enc:v2:'), 'DPAPI 키가 있으면 enc:v2: 형식');
result = await withKey.decryptWithStatus(v2Cipher);
assert.deepEqual(
    { ok: result.ok, value: result.value, scheme: result.scheme, needsReEncrypt: result.needsReEncrypt },
    { ok: true, value: '지적장애 · 중증', scheme: 'v2', needsReEncrypt: false },
);
result = await withKey.decryptWithStatus(v1Cipher);
assert.equal(result.ok, true);
assert.equal(result.needsReEncrypt, true, 'v1 값은 DPAPI 키가 있으면 다음 저장 때 v2로');
result = await withKey.decryptWithStatus(legacyCipher);
assert.equal(result.value, legacyPlain);
assert.equal(result.needsReEncrypt, true);
const longText = '상담 기록 '.repeat(40_000);
assert.equal(await withKey.decrypt(await withKey.encrypt(longText)), longText, '큰 문서도 암호화 왕복');
console.log('PASS enc:v2 왕복, v1·이전 형식 읽기 + 재암호화 표시, 큰 문서 처리');

// ─── 4. v2 데이터가 있는데 데이터 키를 못 불러옴 / 다른 키 ───
setDataKeyProvider(async () => null);
const { mod: keyMissing } = await loadCryptoModule();
result = await keyMissing.decryptWithStatus(v2Cipher);
assert.deepEqual({ ok: result.ok, value: result.value, dataKeyUnavailable: result.dataKeyUnavailable }, { ok: false, value: '', dataKeyUnavailable: true });
assert.ok((await keyMissing.encrypt('새 값')).startsWith('enc:v1:'), '개발 실행(패키징 안 됨)에서 데이터 키가 없으면 새 값은 v1으로 저장');
setDataKeyProvider(async () => null, { available: false, packaged: true, platform: 'win32' });
const { mod: packagedMissing } = await loadCryptoModule();
await assert.rejects(() => packagedMissing.encrypt('새 값'), /운영체제 보안 저장소를 사용할 수 없어/, '배포용 앱은 v1으로 저장하지 않음');
assert.equal((await packagedMissing.decryptWithStatus(v1Cipher)).value, '서울특별시 마포구 테스트로 1', '배포용 앱에서도 기존 v1은 읽힘');
assert.equal((await keyMissing.decryptWithStatus(legacyCipher)).value, legacyPlain, '데이터 키가 없어도 이전 형식은 읽힘');

setDataKeyProvider(async () => randomDataKey());
const { mod: otherKey } = await loadCryptoModule();
result = await otherKey.decryptWithStatus(v2Cipher);
assert.deepEqual({ ok: result.ok, value: result.value, dataKeyUnavailable: result.dataKeyUnavailable }, { ok: false, value: '', dataKeyUnavailable: false });
console.log('PASS 데이터 키 없음/불일치 시 빈 값 + 복구 필요 표시(원문 노출 없음)');

// ─── 5. 백업 비밀번호 암호화 봉투 ───
setDataKeyProvider(undefined);
const backupJson = JSON.stringify({ seekers: [{ id: 's1', name: '홍길동', phone: '010-0000-0000' }], budgetProjects: [] }, null, 2);
const envelopeText = await noKey.encryptBackupPayload(backupJson, '안전한비밀번호2026');
assert.equal(envelopeText.includes('홍길동'), false, '암호화 백업에 평문 개인정보가 없어야 함');
const envelope = noKey.parseEncryptedBackupEnvelope(envelopeText);
assert.ok(envelope, '암호화 봉투 인식');
assert.equal(envelope.format, 'jjss-backup-encrypted');
assert.equal(envelope.version, 1);
assert.equal(envelope.kdf, 'PBKDF2-SHA256');
assert.equal(envelope.iterations, 310000);
assert.deepEqual(Object.keys(JSON.parse(envelopeText)).sort(), ['ciphertext', 'format', 'iterations', 'iv', 'kdf', 'salt', 'version']);
assert.equal(await noKey.decryptBackupPayload(envelope, '안전한비밀번호2026'), backupJson, '올바른 비밀번호로 복원');
await assert.rejects(() => noKey.decryptBackupPayload(envelope, '틀린비밀번호2026'), /비밀번호가 맞지 않거나/);
await assert.rejects(() => noKey.encryptBackupPayload(backupJson, 'short'), /8자 이상/);
assert.throws(() => noKey.parseEncryptedBackupEnvelope(JSON.stringify({ ...JSON.parse(envelopeText), version: 2 })), /지원하지 않는/);
assert.throws(() => noKey.parseEncryptedBackupEnvelope(JSON.stringify({ ...JSON.parse(envelopeText), iv: 'bad' })), /형식이 올바르지 않습니다/);
assert.equal(noKey.parseEncryptedBackupEnvelope(backupJson), null, '평문 백업은 봉투가 아님');
console.log('PASS 암호화 백업 왕복, 틀린 비밀번호 실패, 봉투 형식 검증');

// ─── 6. 예전(평문) 백업 파싱 ───
const localDbUrl = await compileTsModule('../src/config/localDB.ts', [
    [/from ['"]\.\/crypto['"]/g, `from ${JSON.stringify(cryptoUrlNoKey)}`],
]);
const { parseBackupJson } = await import(localDbUrl);
const oldBackup = JSON.stringify({
    seekers: [{ id: 'seeker-1', name: '홍길동', seekerId: '2024.0001', phone: '010-1111-2222', disabilityType: '지적장애' }],
    jobs: [],
    caseDocuments: [{ id: 'doc-1', seekerId: 'seeker-1', seekerName: '홍길동', type: 'counseling', content: '상담 내용', tab: 'case' }],
    settings: [{ id: 'app-settings', selectedProvider: 'gemini', llmConfigs: [] }],
    budgetProjects: [{ id: 'p1', name: '사업' }],
    vocationalEvaluationHistory: [{ id: 'e1', type: 'report', title: '보고서', content: '내용', savedAt: '2026-01-01T00:00:00.000Z' }],
});
const parsed = parseBackupJson(oldBackup);
assert.equal(parsed.seekers[0].name, '홍길동');
assert.equal(parsed.seekers[0].seekerId, '2024.0001');
assert.equal(parsed.budgetProjects.length, 1, '예산 사업 복원 경로 유지');
assert.equal(parsed.vocationalEvaluationHistory.length, 1, '직업평가 이력 복원 경로 유지');
assert.throws(() => parseBackupJson('{not json'), /JSON 형식이 아닙니다/);
assert.throws(() => parseBackupJson('{}'), /복원할 수 있는 JJSS 데이터가 없습니다/);
assert.throws(() => parseBackupJson(JSON.stringify({ vocationalEvaluationHistory: [{ id: '', type: 'report' }] })), /vocationalEvaluationHistory/);
assert.throws(() => parseBackupJson(envelopeText), /복원할 수 있는 JJSS 데이터가 없습니다/, '봉투를 평문 백업으로 복원하지 않음');
console.log('PASS 예전 평문 백업 파싱과 엄격 검증');

// ─── 7. 백업 JSON: API 키(평문·암호문) 제외, 복원 시 현재 키 유지 ───
const fakeDb = createFakeIndexedDB();
globalThis.indexedDB = fakeDb.indexedDB;
const backupDb = await import(await compileTsModule('../src/config/localDB.ts', [
    [/from ['"]\.\/crypto['"]/g, `from ${JSON.stringify(cryptoUrlNoKey)}`],
]));
const apiKeyCipher = await noKey.encrypt('AIzaSy-synthetic-key-0000');
await backupDb.addDoc('settings', {
    id: 'app-settings',
    selectedProvider: 'gemini',
    llmConfigs: [{ provider: 'gemini', label: 'Google Gemini', apiKey: 'sk-plain-synthetic', apiKeyEncrypted: apiKeyCipher, model: 'm' }],
    visionApiKey: 'vision-plain-synthetic',
    visionApiKeyEncrypted: apiKeyCipher,
});
await backupDb.addDoc('seekers', { id: 'seeker-b', name: '홍가람', phone: '010-1234-5678', organization: '기관' });
const { json: backupText } = await backupDb.createBackupJson();
for (const secret of ['AIzaSy-synthetic', 'sk-plain-synthetic', 'vision-plain-synthetic', apiKeyCipher]) {
    assert.equal(backupText.includes(secret), false, `백업에 API 키(평문·암호문)가 없어야 함: ${secret.slice(0, 12)}`);
}
assert.equal(JSON.parse(backupText).seekers[0].name, '홍가람', '백업 JSON 안에서는 복호화된 값(파일 저장 시 비밀번호 암호화)');
const backupEnvelope = await noKey.encryptBackupPayload(backupText, '안전한비밀번호2026');
assert.equal(backupEnvelope.includes('홍가람'), false);
await backupDb.importAllData(backupText);
const settingsAfterRestore = fakeDb.rawRecords('JJSS_LOCAL_DB', 'settings')[0];
assert.equal(settingsAfterRestore.llmConfigs[0].apiKeyEncrypted, apiKeyCipher, '복원해도 현재 PC의 API 키는 유지');
assert.equal(settingsAfterRestore.visionApiKeyEncrypted, apiKeyCipher);
assert.equal(JSON.stringify(fakeDb.rawRecords('JJSS_LOCAL_DB', 'seekers')).includes('홍가람'), false, '복원한 이용자 정보는 다시 암호화되어 저장');
console.log('PASS 백업 JSON에서 API 키 제외, 복원 시 현재 키 유지, 복원 데이터 재암호화');

// ─── 8. 백업 화면: 암호화 백업이 기본, 평문은 고급 옵션 + 경고 + 확인 체크 ───
const dialogSource = await readFile(new URL('../src/components/BackupPasswordDialog.tsx', import.meta.url), 'utf8');
const backupHookSource = await readFile(new URL('../src/hooks/useBackupActions.ts', import.meta.url), 'utf8');
assert.match(dialogSource, /type="submit"[\s\S]*?'암호화하여 저장'/, '기본 동작(Enter·주 버튼)은 암호화 저장');
assert.match(dialogSource, /<details[\s\S]*?고급: 암호화 없이 저장/, '평문 저장은 고급 옵션 안에만');
assert.ok(dialogSource.includes('이 파일에는 개인정보가 평문으로 포함됩니다. 보안이 확보된 저장장소에서만 사용하세요.'));
assert.match(dialogSource, /disabled=\{!plaintextAcknowledged \|\| busy\}/, '경고 확인 체크 전에는 평문 저장 불가');
assert.ok(dialogSource.includes('잊으면 복구할 수 없'), '비밀번호 분실 시 복구 불가 안내');
assert.match(backupHookSource, /onSkipPassword: \(\) => void runExport\(null\)/);
assert.doesNotMatch(backupHookSource, /localStorage|setItem\(/, '백업 비밀번호를 저장하지 않음');
assert.equal(BACKUP_ITERATIONS_EXPECTED, noKey.BACKUP_PBKDF2_ITERATIONS, 'PBKDF2 반복 횟수 유지');
console.log('PASS 백업 기본값 암호화, 평문 백업은 고급 옵션·경고·확인 체크 필요, 비밀번호 비저장');


// ── 백업 파일 구조 방어 ────────────────────────────────────────────────
{
    const { MAX_BACKUP_BYTES, MAX_BACKUP_ITEMS_PER_STORE } = await import(localDbUrl);

    assert.throws(() => parseBackupJson(''), /비어 있습니다/);

    // 지나치게 큰 파일은 JSON.parse 전에 막는다(화면이 멈추는 것을 방지).
    const huge = 'x'.repeat(MAX_BACKUP_BYTES + 1);
    assert.throws(() => parseBackupJson(huge), /너무 큽니다/);

    // 프로토타입 오염에 쓰이는 키는 거부한다.
    assert.throws(
        () => parseBackupJson('{"seekers":[{"id":"a","__proto__":{"polluted":true}}]}'),
        /허용되지 않은 항목 이름/,
    );
    assert.equal(({}).polluted, undefined, '프로토타입이 오염되지 않음');

    // 너무 깊게 중첩된 구조도 막는다.
    let deep = '1';
    for (let index = 0; index < 60; index += 1) deep = `{"a":${deep}}`;
    assert.throws(() => parseBackupJson(`{"seekers":[${deep}]}`), /구조가 너무 깊습니다/);

    // 항목 수 한계는 정상 백업을 막지 않을 만큼 크다.
    assert.ok(MAX_BACKUP_ITEMS_PER_STORE >= 100000, '정상 백업을 막지 않는 한계값');
    console.log('PASS 백업 파일 크기·깊이·프로토타입 오염 방어');
}

// ── 복원 표지(journal) ────────────────────────────────────────────────
{
    const { readRestoreJournal, clearRestoreJournal, RESTORE_JOURNAL_KEY } = await import(localDbUrl);

    clearRestoreJournal();
    assert.equal(readRestoreJournal(), null, '표지가 없으면 null');

    localStorage.setItem(
        RESTORE_JOURNAL_KEY,
        JSON.stringify({ restoreId: 'r1', startedAt: '2026-09-25T00:00:00.000Z', stores: ['seekers'] }),
    );
    const journal = readRestoreJournal();
    assert.equal(journal.restoreId, 'r1');
    assert.deepEqual(journal.stores, ['seekers']);

    // 깨진 표지는 없는 것으로 본다(앱이 시작하지 못하면 안 된다).
    localStorage.setItem(RESTORE_JOURNAL_KEY, '{not json');
    assert.equal(readRestoreJournal(), null);

    clearRestoreJournal();
    assert.equal(localStorage.getItem(RESTORE_JOURNAL_KEY), null);
    console.log('PASS 복원 표지 기록·판독·정리');
}

console.log('PASS test-crypto-backup 전체');
