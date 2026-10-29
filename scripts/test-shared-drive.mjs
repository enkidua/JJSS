// 공유 저장소 동기화(기관 공유 드라이브) 테스트: 기관 키, 보안 점검, 여러 PC 동기화, 충돌, 삭제, 키 교체, 편집 표시, 성능.
// 가짜 드라이브(scripts/fakeSharedDrive.mjs)만 쓴다. 네트워크·구글 계정·실제 데이터 없음. 이름은 합성 값.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createFakeLocal, createFakeSharedDrive } from './fakeSharedDrive.mjs';
import { createFakeIndexedDB } from './fakeIndexedDB.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// 컨트롤러 테스트용 대역: 렌더러 전용 모듈(zustand·localDB·데이터 키 암호화) 대신 globalThis의 값으로 바꾼다.
const STUBS = {
    'config/localDB.ts': moduleUrl(`export const SHARED_DRIVE_RESTORE_PAUSE_KEY = 'jjss:shared-drive-restore-pause';
export const onLocalMutation = (...args) => globalThis.__syncStubs.onLocalMutation(...args);
export const setSharedDriveActive = () => {};`),
    'features/sharedDrive/localAdapter.ts': moduleUrl(`export const localDbAdapter = {}; export const conflictCodec = {};`),
    zustand: moduleUrl(`export function create(init) {
    let state; const listeners = new Set();
    const setState = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; listeners.forEach(fn => fn(state)); };
    const getState = () => state;
    state = init(setState, getState);
    const hook = selector => (selector ? selector(state) : state);
    Object.assign(hook, { getState, setState, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } });
    return hook;
}`),
};
async function load(relative) {
    const file = path.resolve(root, 'src', relative);
    if (cache.has(file)) return cache.get(file);
    let code = ts.transpileModule(await readFile(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: file,
    }).outputText;
    code = code.replace(/from\s+['"]zustand['"]/g, `from ${JSON.stringify(STUBS.zustand)}`);
    for (const match of [...code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)]) {
        const target = path.relative(path.join(root, 'src'), path.resolve(path.dirname(file), match[1])).replace(/\\/g, '/') + '.ts';
        if (STUBS[target]) {
            code = code.replace(match[0], `from ${JSON.stringify(STUBS[target])}`);
            continue;
        }
        if (target.startsWith('config/')) {
            code = code.replace(match[0], `from 'data:text/javascript,export {}'`);
            continue;
        }
        code = code.replace(match[0], `from ${JSON.stringify(await load(target))}`);
    }
    const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    cache.set(file, url);
    return url;
}
const orgKey = await import(await load('features/sharedDrive/orgKey.ts'));
const security = await import(await load('features/sharedDrive/security.ts'));
const { SyncEngine, KEY_CHECK_META_NAME } = await import(await load('features/sharedDrive/engine.ts'));
const { MemorySyncState, IndexedDbSyncState } = await import(await load('features/sharedDrive/syncState.ts'));

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const DOMAIN = 'example-org.org';
const seeker = (id, name, seekerId = '') => ({ id, name, seekerId, phone: '010-0000-0000', organization: 'org', createdAt: { seconds: 1767225600 } });
const doc = (id, seekerId, content, year = 2026) => ({ id, seekerId, type: 'counseling', tab: 'case', content, createdAt: { seconds: Date.UTC(year, 2, 1) / 1000 } });

async function makePc(drive, secret, email) {
    const engineRef = { current: null };
    const local = createFakeLocal(engineRef);
    const state = new MemorySyncState();
    const key = await orgKey.deriveOrgKey(secret);
    const engine = new SyncEngine({ drive: drive.api, local, state, key, accountEmail: email });
    engineRef.current = engine;
    return { engine, local, state, key };
}

const secret = orgKey.generateOrgSecret();

await test('기관 키 코드: 왕복, 오타·헷갈리는 글자, 두 PC가 같은 키, 다른 키·바꿔치기는 복호화 실패', async () => {
    const code = await orgKey.formatOrgKeyCode(secret);
    assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.deepEqual(await orgKey.parseOrgKeyCode(code.toLowerCase().replace(/-/g, ' ')), secret);
    // 0 → O, 1 → l 로 잘못 읽어 입력해도 바로잡는다
    assert.deepEqual(await orgKey.parseOrgKeyCode(code.replace(/0/g, 'O').replace(/1/g, 'l')), secret);
    const typo = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
    await assert.rejects(orgKey.parseOrgKeyCode(typo), /오타/);
    await assert.rejects(orgKey.parseOrgKeyCode(code.slice(0, 20)), /28자/);
    const a = await orgKey.deriveOrgKey(secret);
    const b = await orgKey.deriveOrgKey(await orgKey.parseOrgKeyCode(code));
    assert.equal(a.keyId, b.keyId);
    const sealed = await orgKey.encryptRecord(a, 'seekers:s1', { id: 's1', name: '가온해' });
    assert.deepEqual(await orgKey.decryptRecord(b, 'seekers:s1', sealed), { id: 's1', name: '가온해' });
    assert.equal(Buffer.from(sealed).includes(Buffer.from('가온해')), false, '암호문에 평문 없음');
    const other = await orgKey.deriveOrgKey(orgKey.generateOrgSecret());
    await assert.rejects(orgKey.decryptRecord(other, 'seekers:s1', sealed), /이 기관 키로 열지 못했습니다/);
    await assert.rejects(orgKey.decryptRecord(a, 'seekers:s2', sealed), /이 기관 키로 열지 못했습니다/, '다른 레코드로 바꿔치기');
    assert.equal(await orgKey.contentHash(a, { b: 1, a: [1, { y: 2, x: 1 }] }), await orgKey.contentHash(b, { a: [1, { x: 1, y: 2 }], b: 1 }), '필드 순서와 무관');
    assert.notEqual(await orgKey.contentHash(a, { a: 1 }), await orgKey.contentHash(other, { a: 1 }), '키가 다르면 지문도 다름');
});

await test('보안 점검: 링크 공유·기관 밖 구성원·개인 드라이브·다른 도메인 계정은 차단, 권장 설정은 주의', () => {
    const good = {
        isSharedDrive: true, driveName: 'JJSS 사례관리', accountEmail: `kim@${DOMAIN}`, accountIsMember: true,
        restrictions: { domainUsersOnly: true, driveMembersOnly: true, copyRequiresWriterPermission: true },
        permissions: [{ type: 'group', emailAddress: `employment-team@${DOMAIN}`, role: 'writer' }],
    };
    const ok = security.evaluateDriveSecurity(good, DOMAIN);
    assert.equal(ok.blocked, false);
    assert.equal(ok.warnings, 0);
    const blocked = (patch, id) => {
        const report = security.evaluateDriveSecurity({ ...good, ...patch }, DOMAIN);
        assert.equal(report.blocked, true, id);
        assert.equal(report.checks.find(check => check.id === id).level, 'block', id);
    };
    blocked({ permissions: [...good.permissions, { type: 'anyone', role: 'reader' }] }, 'no-link-sharing');
    blocked({ permissions: [{ type: 'user', emailAddress: 'someone@gmail.com', role: 'reader' }] }, 'no-external-members');
    blocked({ isSharedDrive: false }, 'shared-drive');
    blocked({ accountEmail: 'kim@gmail.com' }, 'account-domain');
    blocked({ accountIsMember: false }, 'member');
    blocked({ permissions: [{ type: 'domain', domain: 'other.org', role: 'reader' }] }, 'no-domain-wide');
    const loose = security.evaluateDriveSecurity({ ...good, restrictions: {}, permissions: [{ type: 'domain', domain: DOMAIN }] }, DOMAIN);
    assert.equal(loose.blocked, false);
    assert.equal(loose.warnings, 4, '도메인 전체 공유·구성원 외 공유·외부 접근·복사 제한');
    const hidden = security.evaluateDriveSecurity({ ...good, permissions: [], permissionsVisible: false }, DOMAIN);
    assert.equal(hidden.blocked, false);
    assert.deepEqual(hidden.checks.filter(check => check.level === 'warn').map(check => check.id), ['no-link-sharing', 'no-external-members', 'no-domain-wide'], '구성원 목록을 못 보면 통과가 아니라 "확인 못 함"');
    assert.equal(security.securityCheckDue(undefined), true);
    assert.equal(security.securityCheckDue(new Date().toISOString()), false);
    assert.equal(security.securityCheckDue(new Date(Date.now() - 25 * 3600 * 1000).toISOString()), true);
});

const drive = createFakeSharedDrive();
const A = await makePc(drive, secret, `kim@${DOMAIN}`);
const B = await makePc(drive, secret, `lee@${DOMAIN}`);

await test('첫 PC: 기존 자료 요약 → 올리기 → 검증(읽지 못한 기록은 올리지 않음). 드라이브에는 암호문과 평문 속성만', async () => {
    for (const record of [seeker('s1', '가온해', 'K-001'), seeker('s2', '나래솔', 'K-002'), seeker('s3', '다온빛')]) A.local.stores.seekers.set(record.id, record);
    for (let i = 1; i <= 5; i += 1) A.local.stores.caseDocuments.set(`d${i}`, doc(`d${i}`, `s${(i % 3) + 1}`, `상담 기록 ${i} 가온해 연락처 010-1234-5678`, 2024 + (i % 3)));
    A.local.stores.caseDocuments.set('broken', doc('broken', 's1', ''));
    A.local.unreadable.caseDocuments.add('broken');
    const summary = await A.engine.summarizeLocal();
    assert.deepEqual(summary.counts, { seekers: 3, caseDocuments: 5 });
    assert.deepEqual(summary.documentTypes, { counseling: 5 });
    assert.deepEqual(summary.unreadable, ['caseDocuments:broken']);
    assert.equal(await A.engine.verifyOrgKey(), null, '처음에는 키 확인 표식이 없음');
    await A.engine.ensureKeyCheck();
    const result = await A.engine.initialSync();
    assert.equal(result.uploaded, 8);
    assert.deepEqual(result.skippedUnreadable, ['caseDocuments:broken']);
    const verify = await A.engine.verifyAgainstRemote();
    assert.equal(verify.ok, true, JSON.stringify(verify));
    assert.equal(verify.checked, 8);
    const records = drive.rawFiles().filter(file => file.appProperties.jjssKind === 'record');
    assert.equal(records.length, 8);
    for (const file of records) {
        const raw = Buffer.from(file.content);
        assert.equal(raw.includes(Buffer.from('가온해')) || raw.includes(Buffer.from('010-1234')), false, '파일 내용은 암호문');
        assert.equal(JSON.stringify(file.appProperties).includes('가온해'), false, '속성에 개인정보 없음');
        assert.equal(JSON.stringify(file.name).includes('가온해'), false, '파일 이름에 개인정보 없음');
        assert.deepEqual(Object.keys(file.appProperties).sort(), ['deleted', 'hash', 'jjssKind', 'keyId', 'rid', 'store', 'updatedAt', 'updatedBy', 'version']);
    }
    assert.deepEqual([...new Set(records.map(file => file.folder))].sort(), ['documents/2024', 'documents/2025', 'documents/2026', 'seekers'], '문서는 연도 폴더');
});

await test('둘째 PC: 기관 키 확인 → 받아오기 → 첫 PC와 같은 자료. 다른 키 코드는 거부', async () => {
    assert.equal(await B.engine.verifyOrgKey(), true);
    const wrong = await makePc(drive, orgKey.generateOrgSecret(), `x@${DOMAIN}`);
    assert.equal(await wrong.engine.verifyOrgKey(), false);
    const result = await B.engine.initialSync();
    assert.equal(result.downloaded, 8);
    assert.equal(result.uploaded, 0);
    for (const store of ['seekers', 'caseDocuments']) {
        for (const [id, record] of A.local.stores[store]) {
            if (id === 'broken') continue;
            assert.deepEqual(B.local.stores[store].get(id), record, `${store}:${id}`);
        }
    }
    assert.equal(B.local.stores.caseDocuments.has('broken'), false);
});

await test('평소 동기화: 한 PC의 수정이 다른 PC로 간다(바뀐 파일만 받음)', async () => {
    await A.local.appPut('caseDocuments', { ...A.local.stores.caseDocuments.get('d1'), content: '수정된 상담 기록' });
    const pushed = await A.engine.push();
    assert.equal(pushed.uploaded, 1);
    drive.resetCounters();
    const pulled = await B.engine.pull();
    assert.equal(pulled.applied, 1);
    assert.equal(drive.counters.list, 0, '평소에는 전체 목록을 다시 받지 않음');
    assert.equal(drive.counters.download, 1, '바뀐 파일 하나만 내려받음');
    assert.equal(B.local.stores.caseDocuments.get('d1').content, '수정된 상담 기록');
    // 자기 변경이 돌아와도(에코) 다시 적용·충돌하지 않는다
    const echo = await A.engine.pull();
    assert.equal(echo.applied, 0);
    assert.equal(echo.conflicts, 0);
});

await test('동시 수정: 나중에 올리려던 PC에 충돌로 남고, "이 PC 것으로" 고르면 덮어쓰고 상대 PC로 전파', async () => {
    await A.local.appPut('seekers', { ...A.local.stores.seekers.get('s2'), phone: '010-1111-1111' });
    await B.local.appPut('seekers', { ...B.local.stores.seekers.get('s2'), phone: '010-2222-2222' });
    await A.engine.push();
    const sync = await B.engine.syncOnce();
    assert.equal(sync.pull.conflicts, 1);
    const [conflict] = await B.engine.conflicts();
    assert.equal(conflict.rid, 'seekers:s2');
    assert.equal(conflict.local.phone, '010-2222-2222');
    assert.equal(conflict.remote.phone, '010-1111-1111');
    assert.equal(conflict.remoteUpdatedBy, `kim@${DOMAIN}`);
    assert.equal(B.local.stores.seekers.get('s2').phone, '010-2222-2222', '충돌 중에는 이 PC 자료를 그대로 둔다');
    await B.engine.resolveConflict('seekers:s2', 'keep-local');
    const after = await B.engine.push();
    assert.equal(after.uploaded, 1);
    assert.equal((await B.engine.conflicts()).length, 0);
    await A.engine.pull();
    assert.equal(A.local.stores.seekers.get('s2').phone, '010-2222-2222');
});

await test('충돌에서 "드라이브 것 받기"를 고르면 이 PC 자료가 드라이브 것으로 바뀐다', async () => {
    await A.local.appPut('caseDocuments', { ...A.local.stores.caseDocuments.get('d2'), content: 'A판' });
    await B.local.appPut('caseDocuments', { ...B.local.stores.caseDocuments.get('d2'), content: 'B판' });
    await A.engine.push();
    await B.engine.syncOnce();
    await B.engine.resolveConflict('caseDocuments:d2', 'take-remote');
    assert.equal(B.local.stores.caseDocuments.get('d2').content, 'A판');
    assert.equal((await B.state.outbox()).length, 0);
    assert.equal((await B.engine.push()).uploaded, 0);
});

await test('오프라인: 실패해도 올릴 목록에 남았다가 다시 연결되면 올라간다', async () => {
    await B.local.appPut('caseDocuments', { ...B.local.stores.caseDocuments.get('d3'), content: '오프라인 중 작성' });
    drive.failNext(1);
    await assert.rejects(B.engine.push());
    assert.equal((await B.state.outbox()).length, 1);
    assert.equal((await B.engine.push()).uploaded, 1);
    await A.engine.pull();
    assert.equal(A.local.stores.caseDocuments.get('d3').content, '오프라인 중 작성');
});

await test('올리는 사이에 같은 기록을 또 고치면 목록에 남아 다음에 다시 올라간다', async () => {
    const original = A.engine.drive.upload.bind(A.engine.drive);
    let edited = false;
    A.engine.drive.upload = async input => {
        const result = await original(input);
        if (!edited && input.name === 'caseDocuments-d4.jjss') {
            edited = true;
            await A.local.appPut('caseDocuments', { ...A.local.stores.caseDocuments.get('d4'), content: '두 번째 수정' });
        }
        return result;
    };
    await A.local.appPut('caseDocuments', { ...A.local.stores.caseDocuments.get('d4'), content: '첫 번째 수정' });
    await A.engine.push();
    A.engine.drive.upload = original;
    assert.equal((await A.state.outbox()).length, 1, '두 번째 수정이 남아 있어야 함');
    await A.engine.push();
    await B.engine.pull();
    assert.equal(B.local.stores.caseDocuments.get('d4').content, '두 번째 수정');
});

await test('삭제는 묘비로 전파되고, 드라이브에서 파일을 지우거나 휴지통으로 보내도 다른 PC 자료는 지우지 않는다', async () => {
    await A.local.appDelete('caseDocuments', 'd5');
    await A.engine.push();
    await B.engine.pull();
    assert.equal(B.local.stores.caseDocuments.has('d5'), false);
    const tomb = drive.rawFiles().find(file => file.appProperties.rid === 'caseDocuments:d5');
    assert.equal(tomb.appProperties.deleted, '1', '드라이브 파일은 남기고 묘비 표시');
    const s3 = drive.rawFiles().find(file => file.appProperties.rid === 'seekers:s3');
    drive.trash(s3.id);
    const pulled = await B.engine.pull();
    assert.equal(pulled.ignoredRemovals, 1);
    assert.ok(B.local.stores.seekers.has('s3'), '휴지통 이동으로 이 PC 자료를 지우지 않음');
});

await test('편집 중 표시: 다른 PC에 보이고, 30분이 지나면 무시한다', async () => {
    await A.engine.setEditing('caseDocuments', 'd1', true);
    await B.engine.pull();
    const info = B.engine.editingInfo('caseDocuments', 'd1');
    assert.equal(info.by, `kim@${DOMAIN}`);
    assert.equal(A.engine.editingInfo('caseDocuments', 'd1'), null, '자기 표시는 자기에게 보이지 않음');
    const later = new SyncEngine({ drive: drive.api, local: B.local, state: B.state, key: B.key, accountEmail: `lee@${DOMAIN}`, now: () => new Date(Date.now() + 31 * 60 * 1000) });
    await later.listAllRemote();
    assert.equal(later.editingInfo('caseDocuments', 'd1'), null);
    await A.engine.setEditing('caseDocuments', 'd1', false);
    await B.engine.pull();
    assert.equal(B.engine.editingInfo('caseDocuments', 'd1'), null);
});

await test('셋째 PC(이미 자료가 있음)가 합류: 같은 기록은 연결, 다른 내용은 충돌, 같은 사람으로 보이는 이용자는 따로 알림', async () => {
    const C = await makePc(drive, secret, `park@${DOMAIN}`);
    C.local.stores.seekers.set('s1', structuredClone(A.local.stores.seekers.get('s1')));
    C.local.stores.seekers.set('c-s9', seeker('c-s9', '나래 솔', 'k-002'));
    C.local.stores.caseDocuments.set('d1', { ...A.local.stores.caseDocuments.get('d1'), content: 'C판 다른 내용' });
    C.local.stores.caseDocuments.set('c-d1', doc('c-d1', 'c-s9', 'C에만 있는 기록'));
    const result = await C.engine.initialSync();
    assert.equal(result.linked, 1, 's1은 내용이 같아 연결');
    assert.equal(result.conflicts, 1, 'd1은 충돌');
    assert.equal(result.uploaded, 2, 'C에만 있는 이용자·기록');
    assert.ok(result.downloaded >= 4);
    assert.deepEqual(result.duplicates.map(group => group.seekerIds), [['c-s9', 's2']], '이름(공백 무시)+관리번호(대소문자 무시)가 같은 이용자');
    const verify = await C.engine.verifyAgainstRemote();
    assert.equal(verify.ok, true, '충돌 중인 기록은 검증에서 빼고 나머지는 모두 일치');
});

await test('기관 키 바꾸기: 전체 재암호화 → 다른 PC는 새 키가 필요하다고 알고, 새 키를 넣으면 이어서 동기화', async () => {
    const newSecret = orgKey.generateOrgSecret();
    const newKey = await orgKey.deriveOrgKey(newSecret);
    await A.engine.pull();
    const { rewritten } = await A.engine.rotateKey(newKey);
    const liveRecords = drive.rawFiles().filter(file => file.appProperties.jjssKind === 'record' && !file.trashed).length;
    assert.equal(rewritten, liveRecords, '휴지통에 있는 파일을 뺀 모든 레코드');
    assert.equal(A.engine.keyId, newKey.keyId);
    assert.equal(await A.engine.verifyOrgKey(), true);
    for (const file of drive.rawFiles().filter(item => item.appProperties.jjssKind === 'record' && !item.trashed)) {
        assert.equal(file.appProperties.keyId, newKey.keyId);
        if (file.appProperties.deleted !== '1') await assert.rejects(orgKey.decryptRecord(B.key, file.appProperties.rid, file.content), /열지 못했습니다/, '옛 키로는 열리지 않음');
    }
    // 키를 바꾼 직후 A가 고친 기록도 B가 새 키를 넣은 뒤 받아야 한다(토큰을 건너뛰지 않음).
    await A.local.appPut('seekers', { ...A.local.stores.seekers.get('s2'), phone: '010-2222-0000' });
    await A.engine.push();
    const stale = await B.engine.pull();
    assert.equal(stale.needsNewKey, true);
    assert.equal(await B.engine.keyStatus(), 'rotated', '옛 키로 봉인한 교체 증명이 있다');
    await B.engine.adoptKey(await orgKey.deriveOrgKey(await orgKey.parseOrgKeyCode(await orgKey.formatOrgKeyCode(newSecret))));
    await assert.rejects(B.engine.adoptKey(await orgKey.deriveOrgKey(orgKey.generateOrgSecret())), /맞지 않습니다/);
    await B.engine.adoptKey(newKey);
    const resumed = await B.engine.pull();
    assert.equal(resumed.needsNewKey, false);
    assert.equal(B.local.stores.seekers.get('s2').phone, '010-2222-0000', '키 교체 사이의 수정도 받음');
    await A.local.appPut('seekers', { ...A.local.stores.seekers.get('s1'), phone: '010-3333-3333' });
    await A.engine.push();
    await B.engine.pull();
    assert.equal(B.local.stores.seekers.get('s1').phone, '010-3333-3333');
});

await test('위조 방어: 기관 키 없이 파일 속성만 고친 삭제·버전·키 표시는 적용하지 않고 격리, 동기화는 멈추지 않음', async () => {
    const forged = createFakeSharedDrive();
    const X = await makePc(forged, secret, `kim@${DOMAIN}`);
    const Y = await makePc(forged, secret, `lee@${DOMAIN}`);
    for (const record of [seeker('s1', '가온해'), seeker('s2', '나래솔')]) X.local.stores.seekers.set(record.id, record);
    X.local.stores.caseDocuments.set('d1', doc('d1', 's1', '첫 기록'));
    await X.engine.ensureKeyCheck();
    await X.engine.initialSync();
    await Y.engine.initialSync();
    const fileOf = rid => forged.rawFiles().find(file => file.appProperties.rid === rid);

    // 1) 묘비 위조: 속성만 deleted=1, 버전을 높임 → Y의 자료는 그대로, 격리
    await forged.api.setProperties(fileOf('seekers:s1').id, { deleted: '1', version: '99', hash: '' });
    const first = await Y.engine.pull();
    assert.ok(Y.local.stores.seekers.has('s1'), '속성만 바꾼 삭제로 이 PC 자료를 지우지 않음');
    assert.equal(first.quarantined, 1);
    assert.equal(first.needsNewKey, false);
    assert.deepEqual(await Y.engine.quarantined(), ['seekers:s1']);

    // 2) 되돌리기(재생) 위조: 예전 암호문을 다시 넣고 버전 숫자만 올림 → 격리
    const oldContent = new Uint8Array(fileOf('caseDocuments:d1').content);
    await X.local.appPut('caseDocuments', { ...X.local.stores.caseDocuments.get('d1'), content: '고친 기록' });
    await X.engine.push();
    await Y.engine.pull();
    assert.equal(Y.local.stores.caseDocuments.get('d1').content, '고친 기록');
    fileOf('caseDocuments:d1').content = oldContent;
    await forged.api.setProperties(fileOf('caseDocuments:d1').id, { version: '7' });
    const replay = await Y.engine.pull();
    assert.equal(replay.quarantined, 1);
    assert.equal(Y.local.stores.caseDocuments.get('d1').content, '고친 기록', '예전 내용으로 되돌아가지 않음');

    // 3) 키 표시 위조: keyId만 바꿈 → 키 확인 표식은 이 키로 열리므로 "새 키 필요"로 멈추지 않고 격리, 토큰은 넘어감
    await forged.api.setProperties(fileOf('seekers:s2').id, { keyId: 'ffffffffffffffff', version: '50' });
    const fakeKey = await Y.engine.pull();
    assert.equal(fakeKey.needsNewKey, false, '속성만 바꾼 keyId로 동기화를 세우지 않음');
    assert.equal(fakeKey.quarantined, 1);
    await X.local.appPut('caseDocuments', doc('d2', 's2', '이후 기록'));
    await X.engine.push();
    const after = await Y.engine.pull();
    assert.equal(after.applied, 1, '위조 파일 뒤의 정상 변경은 계속 받는다');
    assert.ok(Y.local.stores.caseDocuments.has('d2'));

    // 4) 위조된 파일 위에는 덮어쓰지 않는다(올리기도 격리) → 관리자가 확인 후 이 PC 기록으로 복구
    await X.local.appPut('seekers', { ...X.local.stores.seekers.get('s1'), phone: '010-7777-7777' });
    const blocked = await X.engine.push();
    assert.equal(blocked.uploaded, 0);
    assert.ok((await X.engine.quarantined()).includes('seekers:s1'));
    assert.equal(await X.engine.restoreQuarantined('seekers:s1'), 'restored');
    assert.equal(await X.engine.restoreQuarantined('seekers:none'), 'dismissed');
    await Y.engine.pull();
    assert.equal(Y.local.stores.seekers.get('s1').phone, '010-7777-7777', '복구한 기록이 다른 PC로 전파');

    // 5) 진짜 삭제(기관 키로 봉인한 묘비)는 그대로 전파
    await X.local.appDelete('caseDocuments', 'd2');
    await X.engine.push();
    await Y.engine.pull();
    assert.equal(Y.local.stores.caseDocuments.has('d2'), false);

    // 6) 예전 암호문 + 예전 버전 그대로(되돌리기): 받는 PC는 이미 본 버전이라 무시, 올리는 PC는 덮지 않고 격리
    const s1File = fileOf('seekers:s1');
    const s1Version = s1File.appProperties.version;
    const s1Content = new Uint8Array(s1File.content);
    await X.local.appPut('seekers', { ...X.local.stores.seekers.get('s1'), phone: '010-8888-8888' });
    await X.engine.push();
    await Y.engine.pull();
    s1File.content = s1Content;
    await forged.api.setProperties(s1File.id, { version: s1Version });
    const rolledBack = await Y.engine.pull();
    assert.equal(rolledBack.applied, 0);
    assert.equal(Y.local.stores.seekers.get('s1').phone, '010-8888-8888', '예전 버전으로 되돌아가지 않음');
    await Y.local.appPut('seekers', { ...Y.local.stores.seekers.get('s1'), organization: 'org2' });
    const pushRollback = await Y.engine.push();
    assert.equal(pushRollback.uploaded, 0, '되돌린 파일 위에 덮지 않음');
    assert.ok((await Y.engine.quarantined()).includes('seekers:s1'));

    // 7) 비정상 버전(아주 큰 수·숫자 아님)은 격리
    await forged.api.setProperties(fileOf('caseDocuments:d1').id, { version: '99999999999' });
    assert.equal((await Y.engine.pull()).quarantined, 1);
    await forged.api.setProperties(fileOf('caseDocuments:d1').id, { version: '1e3' });
    assert.equal((await Y.engine.pull()).quarantined, 1);

    // 8) 키 확인 표식을 바꿔치기(교체 증명 없음): 동기화를 세우지 않고 격리, 관리자 확인 표시
    const marker = forged.rawFiles().find(file => file.folder === 'meta' && file.name === KEY_CHECK_META_NAME);
    marker.content = new Uint8Array([1, 2, 3]);
    await forged.api.setProperties(fileOf('seekers:s2').id, { keyId: 'eeeeeeeeeeeeeeee', version: '60' });
    const tampered = await Y.engine.pull();
    assert.equal(tampered.needsNewKey, false);
    assert.equal(tampered.keyCheckTampered, true);
    assert.equal(await Y.engine.keyStatus(), 'tampered');
    await X.local.appPut('caseDocuments', doc('d3', 's2', '표식 위조 뒤 기록'));
    await X.engine.push();
    await Y.engine.pull();
    assert.ok(Y.local.stores.caseDocuments.has('d3'), '표식이 위조돼도 정상 변경은 계속 받는다');

    // 9) 틀린 키 코드로 adoptKey를 시도해도 지금 키는 그대로
    const before = Y.engine.keyId;
    await assert.rejects(Y.engine.adoptKey(await orgKey.deriveOrgKey(orgKey.generateOrgSecret())), /맞지 않습니다/);
    assert.equal(Y.engine.keyId, before);
    // 10) 표식을 공격자 키로 바꿔치기(교체 증명 없음): 그 키 코드를 넣어도 받지 않는다(fail-closed)
    const forgedKey = await orgKey.deriveOrgKey(orgKey.generateOrgSecret());
    marker.content = await orgKey.createKeyCheck(forgedKey);
    await assert.rejects(Y.engine.adoptKey(forgedKey), /교체 증명이 없습니다/);
    assert.equal(Y.engine.keyId, before);
    assert.equal(await Y.engine.keyStatus(), 'tampered');
});

await test('덮어쓰기 방어: 열어 둔 기록·대기 표지 없는 수정·같은 버전 동시 올리기·상태 없는 기록은 충돌로 남기고, 드라이브에서 지운 파일은 새로 만든다', async () => {
    const d = createFakeSharedDrive();
    const P = await makePc(d, secret, `kim@${DOMAIN}`);
    const Q = await makePc(d, secret, `lee@${DOMAIN}`);
    P.local.stores.seekers.set('s1', seeker('s1', '가온해'));
    P.local.stores.seekers.set('s2', seeker('s2', '나래솔'));
    P.local.stores.caseDocuments.set('d1', doc('d1', 's1', '첫 기록'));
    await P.engine.ensureKeyCheck();
    await P.engine.initialSync();
    await Q.engine.initialSync();

    // 1) Q가 s1을 화면에 열어 둔 사이 P가 고침 → Q는 덮어쓰지 않고 충돌
    await Q.engine.setEditing('seekers', 's1', true);
    await P.local.appPut('seekers', { ...P.local.stores.seekers.get('s1'), phone: '010-1111-0000' });
    await P.engine.push();
    const whileEditing = await Q.engine.pull();
    assert.equal(whileEditing.conflicts, 1);
    assert.equal(Q.local.stores.seekers.get('s1').phone, '010-0000-0000', '열어 둔 기록은 그대로');
    assert.equal(Q.engine.isEditingLocally('seekers', 's1'), true);
    await Q.engine.resolveConflict('seekers:s1', 'take-remote');
    await Q.engine.setEditing('seekers', 's1', false);
    assert.equal(Q.local.stores.seekers.get('s1').phone, '010-1111-0000');

    // 2) 대기 표지 없이 고친 기록(동기화를 꺼 둔 사이): reconcileLocal이 올릴 목록에 넣고, 받기에서는 덮지 않는다
    Q.local.stores.seekers.set('s2', { ...Q.local.stores.seekers.get('s2'), phone: '010-2222-9999' }); // appPut이 아니라 직접 저장(표지 없음)
    assert.equal((await Q.engine.reconcileLocal()).queued, 1);
    await P.local.appPut('seekers', { ...P.local.stores.seekers.get('s2'), organization: 'org-P' });
    await P.engine.push();
    const unnoted = await Q.engine.pull();
    assert.equal(unnoted.conflicts, 1, '표지 없는 수정도 덮어쓰지 않고 충돌');
    await Q.engine.resolveConflict('seekers:s2', 'keep-local');
    await Q.engine.push();
    await P.engine.pull();
    assert.equal(P.local.stores.seekers.get('s2').phone, '010-2222-9999');

    // 3) 같은 버전 위에 두 PC가 동시에 올림(둘 다 올리기 성공) → 받는 쪽이 지문 차이를 보고 충돌
    await P.local.appPut('caseDocuments', { ...P.local.stores.caseDocuments.get('d1'), content: 'P가 고침' });
    await Q.local.appPut('caseDocuments', { ...Q.local.stores.caseDocuments.get('d1'), content: 'Q가 고침' });
    await P.engine.push();
    const fileD1 = d.rawFiles().find(file => file.appProperties.rid === 'caseDocuments:d1');
    // Q의 올리기가 P의 결과를 못 본 척(확인 응답이 늦은 경우): 같은 버전 번호로 덮어 씀
    const qVersion = fileD1.appProperties.version;
    const sealedQ = await orgKey.encryptRecord(Q.key, 'caseDocuments:d1', { format: 'jjss-record-v1', version: Number(qVersion), deleted: false, record: Q.local.stores.caseDocuments.get('d1') });
    await d.api.upload({ fileId: fileD1.id, folder: 'documents/2026', name: fileD1.name, appProperties: { version: qVersion, hash: await orgKey.contentHash(Q.key, Q.local.stores.caseDocuments.get('d1')), updatedBy: `lee@${DOMAIN}` }, content: sealedQ });
    const race = await P.engine.pull();
    assert.equal(race.conflicts, 1, '같은 버전인데 내용이 다르면 충돌');
    await P.engine.resolveConflict('caseDocuments:d1', 'keep-local');
    await P.engine.push();
    assert.equal(d.rawFiles().find(file => file.appProperties.rid === 'caseDocuments:d1').appProperties.version, String(Number(qVersion) + 1));

    // 4) 드라이브에서 파일을 완전히 지움 → 다음 올리기는 알던 버전 위로 새 파일을 만든다(휴지통·버전 1로 되돌리지 않음)
    const s1File = d.rawFiles().find(file => file.appProperties.rid === 'seekers:s1');
    const s1Version = Number(s1File.appProperties.version);
    d.files.delete(s1File.id);
    await P.local.appPut('seekers', { ...P.local.stores.seekers.get('s1'), phone: '010-1111-2222' });
    assert.equal((await P.engine.push()).uploaded, 1);
    const recreated = d.rawFiles().filter(file => file.appProperties.rid === 'seekers:s1');
    assert.equal(recreated.length, 1);
    assert.ok(recreated[0].id !== s1File.id);
    assert.equal(Number(recreated[0].appProperties.version), s1Version + 1, '알던 버전 다음 번호');

    // 5) 상태를 모르는 기록(새 PC에 같은 id가 이미 있음): 내용이 같으면 연결, 다르면 충돌(덮어쓰지 않음)
    const R = await makePc(d, secret, `park@${DOMAIN}`);
    R.local.stores.seekers.set('s2', { ...P.local.stores.seekers.get('s2') });
    R.local.stores.seekers.set('s1', seeker('s1', '가온해', 'R-LOCAL'));
    const joined = await R.engine.initialSync();
    assert.equal(joined.linked, 1);
    assert.equal(joined.conflicts, 1);
    assert.equal(R.local.stores.seekers.get('s1').seekerId, 'R-LOCAL');
});

await test('기관 키 바꾸기 중단: 다른 PC는 옛 키로 계속 쓰고, 같은 새 키로 이어서 바꾸면 끝까지 간다', async () => {
    const d = createFakeSharedDrive();
    const P = await makePc(d, secret, `kim@${DOMAIN}`);
    const Q = await makePc(d, secret, `lee@${DOMAIN}`);
    for (let i = 1; i <= 6; i += 1) P.local.stores.caseDocuments.set(`r${i}`, doc(`r${i}`, 's1', `기록 ${i}`));
    await P.engine.ensureKeyCheck();
    await P.engine.initialSync();
    await Q.engine.initialSync();
    const newSecret = orgKey.generateOrgSecret();
    const newKey = await orgKey.deriveOrgKey(newSecret);
    // 증명을 올리고 파일 몇 개를 다시 쓴 뒤 끊긴다(네 번째 올리기에서 실패)
    d.failNext(0);
    let uploads = 0;
    const originalUpload = d.api.upload;
    d.api.upload = async input => {
        uploads += 1;
        if (uploads === 4) throw Object.assign(new Error('synthetic network failure'), { code: 'ENETDOWN' });
        return originalUpload(input);
    };
    await assert.rejects(P.engine.rotateKey(newKey), /synthetic/);
    d.api.upload = originalUpload;
    const rewritten = d.rawFiles().filter(file => file.appProperties.jjssKind === 'record' && file.appProperties.keyId === newKey.keyId).length;
    assert.ok(rewritten >= 1 && rewritten < 6, `일부만 바뀜(${rewritten})`);
    // 다른 PC: 표식이 아직 옛 키로 열리므로 멈추지 않는다. 새 키 파일은 격리하고 나머지는 계속 받는다.
    assert.equal(await Q.engine.keyStatus(), 'current');
    const during = await Q.engine.pull();
    assert.equal(during.needsNewKey, false);
    assert.equal(during.quarantined, rewritten);
    // 같은 새 키로 이어서 바꾸면 이미 바뀐 파일은 건너뛰고 나머지를 바꾼다.
    const resumed = await P.engine.rotateKey(newKey);
    assert.equal(resumed.rewritten, 6);
    assert.equal(resumed.skipped.length, 0);
    assert.equal(await Q.engine.keyStatus(), 'rotated');
    await Q.engine.adoptKey(newKey);
    assert.equal((await Q.state.getMeta()).needsFullResync, true);
    assert.deepEqual((await Q.state.getMeta()).quarantined, [], '새 키를 넣으면 격리 목록을 비우고 전체를 다시 맞춘다');
    const full = await Q.engine.initialSync();
    assert.equal(full.conflicts, 0, '바뀌지 않은 기록은 충돌이 아니다');
    assert.equal(full.quarantined.length, 0);
    for (let i = 1; i <= 6; i += 1) assert.equal(Q.local.stores.caseDocuments.get(`r${i}`).content, `기록 ${i}`);
});

await test('상태 저장소(IndexedDB): 올리는 사이 새로 찍힌 대기 표지는 지우지 않고, 충돌 사본은 암호화해 둔다', async () => {
    globalThis.indexedDB = createFakeIndexedDB().indexedDB;
    const sealedValues = [];
    const codec = {
        encode: async value => { const text = `sealed:${Buffer.from(JSON.stringify(value)).toString('base64')}`; sealedValues.push(text); return text; },
        decode: async text => JSON.parse(Buffer.from(String(text).slice(7), 'base64').toString()),
    };
    const state = new IndexedDbSyncState(codec, globalThis.indexedDB);
    await state.enqueue('seekers:s1');
    const [first] = await state.outbox();
    await new Promise(resolve => setTimeout(resolve, 2));
    await state.enqueue('seekers:s1');
    await state.dequeue('seekers:s1', first.queuedAt);
    assert.equal((await state.outbox()).length, 1, '새 표지가 찍혔으면 남는다');
    const [second] = await state.outbox();
    await state.dequeue('seekers:s1', second.queuedAt);
    assert.equal((await state.outbox()).length, 0);
    await state.putConflict({ rid: 'seekers:s1', detectedAt: 'now', local: { name: '가온해' }, remote: null, remoteVersion: 2, remoteUpdatedBy: 'x', remoteUpdatedAt: 'y', fileId: 'f1' });
    assert.ok(sealedValues.length === 2 && !sealedValues.some(value => value.includes('가온해')));
    assert.deepEqual((await state.conflicts())[0].local, { name: '가온해' });
    await state.setMeta({ pageToken: '7' });
    await state.setMeta({ lastPullAt: 'later' });
    assert.deepEqual(await state.getMeta(), { pageToken: '7', lastPullAt: 'later' });
});

await test('성능: 1만 건(이용자 500·문서 9,500) 첫 올리기·첫 받기, 평소 동기화는 바뀐 3건만', async () => {
    const big = createFakeSharedDrive();
    const P = await makePc(big, secret, `kim@${DOMAIN}`);
    for (let i = 0; i < 500; i += 1) P.local.stores.seekers.set(`S${i}`, seeker(`S${i}`, `합성이용자${i}`, `K-${i}`));
    for (let i = 0; i < 9500; i += 1) P.local.stores.caseDocuments.set(`D${i}`, doc(`D${i}`, `S${i % 500}`, '가'.repeat(1500), 2020 + (i % 7)));
    let started = Date.now();
    const up = await P.engine.initialSync();
    const uploadMs = Date.now() - started;
    assert.equal(up.uploaded, 10000);
    const Q = await makePc(big, secret, `lee@${DOMAIN}`);
    big.resetCounters();
    const order = [];
    const originalPut = Q.local.putFromSync.bind(Q.local);
    Q.local.putFromSync = async (store, record) => { if (order.length < 600) order.push(store); return originalPut(store, record); };
    started = Date.now();
    const down = await Q.engine.initialSync();
    const downloadMs = Date.now() - started;
    assert.equal(down.downloaded, 10000);
    assert.equal(big.counters.list, 10, '목록은 1000개씩 10번');
    assert.equal(order.slice(0, 500).every(store => store === 'seekers'), true, '이용자를 먼저 받는다');
    for (let i = 0; i < 3; i += 1) await P.local.appPut('caseDocuments', { ...P.local.stores.caseDocuments.get(`D${i}`), content: `수정 ${i}` });
    await P.engine.push();
    big.resetCounters();
    started = Date.now();
    const inc = await Q.engine.pull();
    const incrementalMs = Date.now() - started;
    assert.equal(inc.applied, 3);
    assert.equal(big.counters.list, 0);
    assert.equal(big.counters.download, 3);
    assert.ok(incrementalMs < 3000, `증분 ${incrementalMs}ms`);
    console.log(`  (가짜 드라이브 기준: 첫 올리기 ${uploadMs}ms, 첫 받기 ${downloadMs}ms, 증분 ${incrementalMs}ms — 실제 네트워크 시간은 별도)`);
});

// ─── 동기화 제어(controller): 꺼짐 0건, 변경 구독·지연 올리기, 보안 차단, 복원 뒤 멈춤 ───

const { SharedDriveController, useSharedDriveStore } = await import(await load('features/sharedDrive/controller.ts'));

function makeBridge(fake, { enabled = true, orgKeyBase64, facts } = {}) {
    const calls = [];
    const ok = value => ({ ok: true, value });
    const status = { configured: true, domain: DOMAIN, clientIdHint: '', accountEmail: `kim@${DOMAIN}`, signedIn: true, driveId: 'drive1', driveName: '사례관리', enabled, hasOrgKey: Boolean(orgKeyBase64), secureStorage: true };
    const wrap = (name, fn) => async (...args) => {
        calls.push(name);
        try {
            return ok(await fn(...args));
        } catch (error) {
            return { ok: false, error: { message: error.message, code: error.code || 'X' } };
        }
    };
    const bridge = {
        getStatus: wrap('getStatus', async () => status),
        getOrgKey: wrap('getOrgKey', async () => orgKeyBase64 ?? null),
        securityFacts: wrap('securityFacts', async () => facts ?? {
            isSharedDrive: true, driveName: '사례관리', accountEmail: `kim@${DOMAIN}`, accountIsMember: true,
            restrictions: { domainUsersOnly: true, driveMembersOnly: true, copyRequiresWriterPermission: true },
            permissions: [{ type: 'group', emailAddress: `team@${DOMAIN}` }],
        }),
        backupLocalData: wrap('backupLocalData', async () => ({ copied: true })),
        listRecords: wrap('listRecords', token => fake.api.listRecords(token)),
        getStartPageToken: wrap('getStartPageToken', () => fake.api.getStartPageToken()),
        listChanges: wrap('listChanges', token => fake.api.listChanges(token)),
        getFile: wrap('getFile', id => fake.api.getFile(id)),
        download: wrap('download', id => fake.api.download(id)),
        upload: wrap('upload', input => fake.api.upload(input)),
        setProperties: wrap('setProperties', (id, props) => fake.api.setProperties(id, props)),
        findMeta: wrap('findMeta', name => fake.api.findMeta(name)),
    };
    return { bridge, calls, status };
}

function makeController(bridge, local, { storage = new Map() } = {}) {
    const listeners = new Set();
    globalThis.__syncStubs = { onLocalMutation: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    const timers = [];
    const applied = [];
    const controller = new SharedDriveController({
        bridge,
        local,
        createState: () => new MemorySyncState(),
        subscribe: listener => globalThis.__syncStubs.onLocalMutation(listener),
        storage: { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) },
        onApplied: count => applied.push(count),
        setTimer: (run, ms) => { const timer = { run, ms }; timers.push(timer); return timer; },
        clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
        setRepeat: () => 'repeat',
        clearRepeat: () => undefined,
        isVisible: () => true,
    });
    const emit = mutation => listeners.forEach(listener => listener(mutation));
    const flushTimers = async () => { while (timers.length) { const timer = timers.shift(); timer.run(); await new Promise(resolve => setTimeout(resolve, 20)); } };
    return { controller, emit, timers, flushTimers, applied, listeners, storage };
}

const keyBase64 = Buffer.from(secret).toString('base64');

await test('동기화 제어: 꺼져 있으면 상태 확인 1번 말고는 아무 요청·구독 없음', async () => {
    const fake = createFakeSharedDrive();
    const { bridge, calls } = makeBridge(fake, { enabled: false });
    const ctx = makeController(bridge, createFakeLocal({ current: null }));
    await ctx.controller.start();
    assert.equal(useSharedDriveStore.getState().phase, 'off');
    assert.deepEqual(calls, ['getStatus']);
    assert.equal(ctx.listeners.size, 0, '로컬 변경을 구독하지 않음');
    assert.equal(Object.values(fake.counters).reduce((a, b) => a + b, 0), 0);
});

await test('동기화 제어: 켜면 보안 점검 → 받기·올리기, 화면 저장은 몇 초 뒤 한 번에 올리고 받아 온 쓰기는 다시 올리지 않음', async () => {
    const fake = createFakeSharedDrive();
    const local = createFakeLocal({ current: null });
    const { bridge, calls } = makeBridge(fake, { orgKeyBase64: keyBase64 });
    const ctx = makeController(bridge, local);
    await ctx.controller.start();
    assert.equal(useSharedDriveStore.getState().phase, 'idle', useSharedDriveStore.getState().message);
    assert.ok(calls.indexOf('securityFacts') < calls.indexOf('listChanges'), '보안 점검이 먼저');
    local.stores.seekers.set('s1', seeker('s1', '가온해'));
    ctx.emit({ store: 'seekers', ids: ['s1'], kind: 'put', origin: 'app' });
    local.stores.seekers.set('s1', seeker('s1', '가온해', 'K-9'));
    ctx.emit({ store: 'seekers', ids: ['s1'], kind: 'put', origin: 'app' });
    ctx.emit({ store: 'seekers', ids: ['s2'], kind: 'put', origin: 'sync' });
    ctx.emit({ store: 'jobs', ids: ['j1'], kind: 'put', origin: 'app' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(ctx.timers.length, 1, '연달아 저장해도 올리기 예약은 하나');
    assert.equal(ctx.timers[0].ms, 3000);
    assert.equal(useSharedDriveStore.getState().pending, 1);
    await ctx.flushTimers();
    const uploaded = fake.rawFiles().filter(file => file.appProperties.jjssKind === 'record');
    assert.deepEqual(uploaded.map(file => file.appProperties.rid), ['seekers:s1'], 'sync로 받은 쓰기·동기화 대상이 아닌 저장소는 올리지 않음');
    assert.equal(useSharedDriveStore.getState().pending, 0);
    ctx.controller.stop();
    assert.equal(ctx.listeners.size, 0);
});

await test('동기화 제어: 보안 점검 차단이면 동기화하지 않고, 기관 키가 없으면 키 입력을 기다린다', async () => {
    const fake = createFakeSharedDrive();
    const blockedBridge = makeBridge(fake, { orgKeyBase64: keyBase64, facts: { isSharedDrive: true, driveName: 'x', accountEmail: `kim@${DOMAIN}`, accountIsMember: true, restrictions: {}, permissions: [{ type: 'anyone' }] } });
    const blocked = makeController(blockedBridge.bridge, createFakeLocal({ current: null }));
    await blocked.controller.start();
    assert.equal(useSharedDriveStore.getState().phase, 'blocked');
    assert.equal(useSharedDriveStore.getState().security.blocked, true);
    assert.equal(blockedBridge.calls.includes('listChanges') || blockedBridge.calls.includes('upload'), false);
    await blocked.controller.syncNow();
    assert.equal(blockedBridge.calls.includes('listChanges'), false, '차단 중에는 수동 동기화도 하지 않음');
    const noKey = makeController(makeBridge(fake, {}).bridge, createFakeLocal({ current: null }));
    await noKey.controller.start();
    assert.equal(useSharedDriveStore.getState().phase, 'needs-key');
});

await test('동기화 제어: 복원 뒤에는 멈추고, "드라이브 기준"을 고르면 드라이브 것으로 맞춘 뒤 다시 동기화', async () => {
    const fake = createFakeSharedDrive();
    const other = await makePc(fake, secret, `lee@${DOMAIN}`);
    other.local.stores.seekers.set('s1', seeker('s1', '가온해', 'DRIVE'));
    await other.engine.ensureKeyCheck();
    await other.engine.initialSync();
    const local = createFakeLocal({ current: null });
    local.stores.seekers.set('s1', seeker('s1', '가온해', 'RESTORED'));
    local.stores.seekers.set('s7', seeker('s7', '복원에만'));
    const { bridge, calls } = makeBridge(fake, { orgKeyBase64: keyBase64 });
    const storage = new Map([['jjss:shared-drive-restore-pause', 'now']]);
    const ctx = makeController(bridge, local, { storage });
    await ctx.controller.start();
    assert.equal(useSharedDriveStore.getState().phase, 'paused-restore');
    assert.equal(calls.includes('listChanges') || calls.includes('upload'), false, '고르기 전에는 주고받지 않음');
    await ctx.controller.resolveRestore('drive');
    assert.ok(calls.includes('backupLocalData'), '고르기 전에 이 PC 자료 사본');
    assert.equal(local.stores.seekers.get('s1').seekerId, 'DRIVE');
    assert.ok(fake.rawFiles().some(file => file.appProperties.rid === 'seekers:s7'), '드라이브에 없던 복원본 기록은 지우지 않고 올림');
    assert.equal(storage.has('jjss:shared-drive-restore-pause'), false);
    assert.equal(useSharedDriveStore.getState().phase, 'idle');
});

await test('내려받기 상한·올릴 수 없는 기록·삭제 반영 수: 큰 파일은 격리, 한 기록의 올리기 실패가 나머지를 막지 않음, 깨진 날짜는 올해 폴더', async () => {
    const fake = createFakeSharedDrive();
    const P = await makePc(fake, secret, `p@${DOMAIN}`);
    const Q = await makePc(fake, secret, `q@${DOMAIN}`);
    await P.local.appPut('seekers', seeker('s1', '가'));
    await P.local.appPut('seekers', seeker('s2', '나'));
    await P.local.appPut('caseDocuments', { ...doc('d1', 's1', '깨진 날짜'), createdAt: { seconds: 9e12 } });
    await P.engine.ensureKeyCheck();
    await P.engine.initialSync();
    assert.equal(fake.rawFiles().find(file => file.appProperties.rid === 'caseDocuments:d1').folder, `documents/${new Date().getUTCFullYear()}`, '네 자리 연도 폴더');
    await Q.engine.initialSync();
    // 1) 드라이브 구성원이 레코드 파일을 큰 파일로 바꿔치기: 내려받지 않고(main이 DRIVE_TOO_LARGE) 격리, 나머지는 받는다
    await P.local.appPut('seekers', { ...P.local.stores.seekers.get('s1'), phone: '010-1111-1111' });
    await P.local.appPut('seekers', { ...P.local.stores.seekers.get('s2'), phone: '010-2222-2222' });
    await P.engine.push();
    const s1File = fake.rawFiles().find(file => file.appProperties.rid === 'seekers:s1');
    const realDownload = fake.api.download;
    fake.api.download = async fileId => { if (fileId === s1File.id) throw Object.assign(new Error('too large'), { code: 'DRIVE_TOO_LARGE' }); return realDownload(fileId); };
    const big = await Q.engine.pull();
    assert.equal(big.quarantined, 1);
    assert.equal(big.applied, 1, '다른 변경은 계속 받는다');
    assert.equal(Q.local.stores.seekers.get('s2').phone, '010-2222-2222');
    assert.equal(Q.local.stores.seekers.get('s1').phone, '010-0000-0000', '큰 파일은 적용하지 않음');
    assert.ok((await Q.engine.quarantined()).includes('seekers:s1'));
    fake.api.download = realDownload;
    // 2) 한 기록만 올릴 수 없음(속성 형식): 나머지는 올라가고 그 기록은 격리 목록에, push는 실패로 끝나지 않는다
    await Q.local.appPut('caseDocuments', doc('d2', 's2', '정상 기록'));
    await Q.local.appPut('caseDocuments', doc('d-bad', 's2', '올릴 수 없는 기록'));
    const realUpload = fake.api.upload;
    fake.api.upload = async input => { if (input.name.includes('d-bad')) throw Object.assign(new Error('bad property'), { code: 'DRIVE_BAD_PROPERTY' }); return realUpload(input); };
    const partial = await Q.engine.push();
    assert.equal(partial.uploaded, 1);
    assert.equal(partial.remaining, 1, '올리지 못한 기록은 목록에 남는다');
    assert.ok((await Q.engine.quarantined()).includes('caseDocuments:d-bad'));
    fake.api.upload = realUpload;
    // 3) 다른 PC의 삭제를 받으면 deleted 수로 알 수 있다(화면 알림용)
    await P.engine.pull();
    await P.local.appDelete('caseDocuments', 'd2');
    await P.engine.push();
    const removed = await Q.engine.pull();
    assert.equal(removed.deleted, 1);
    assert.equal(Q.local.stores.caseDocuments.has('d2'), false);
});

await test('기관 키 바꾸기와 다른 PC의 수정: 교체 중 올리기는 격리되지 않고, 새 키를 넣으면 충돌 없이 이어서 올라간다. 증명과 다른 새 키는 거부', async () => {
    const fake = createFakeSharedDrive();
    const A2 = await makePc(fake, secret, `a2@${DOMAIN}`);
    const B2 = await makePc(fake, secret, `b2@${DOMAIN}`);
    await A2.local.appPut('seekers', seeker('s1', '가'));
    await A2.local.appPut('seekers', seeker('s2', '나'));
    await A2.engine.ensureKeyCheck();
    await A2.engine.initialSync();
    await B2.engine.initialSync();
    // B2가 s1을 고친 뒤(아직 안 올림) A2가 키를 바꾼다
    await B2.local.appPut('seekers', { ...B2.local.stores.seekers.get('s1'), phone: '010-5555-5555' });
    const newSecret = orgKey.generateOrgSecret();
    const newKey = await orgKey.deriveOrgKey(newSecret);
    await A2.engine.rotateKey(newKey);
    const during = await B2.engine.push();
    assert.equal(during.uploaded, 0);
    assert.equal(during.remaining, 1, '새 키로 봉인된 파일 위에는 올리지 않고 남겨 둔다');
    assert.deepEqual(await B2.engine.quarantined(), [], '교체 중에는 격리하지 않는다');
    assert.equal((await B2.engine.pull()).needsNewKey, true);
    // 증명이 가리키는 새 키가 아닌 키(구성원이 표식만 바꿔치기한 경우)는 받지 않는다
    const K3 = await orgKey.deriveOrgKey(orgKey.generateOrgSecret());
    const marker = fake.rawFiles().find(file => file.folder === 'meta' && file.name === KEY_CHECK_META_NAME);
    const realMarker = marker.content;
    marker.content = await orgKey.createKeyCheck(K3);
    await assert.rejects(B2.engine.adoptKey(K3), /교체의 새 키가 아닙니다/);
    assert.equal(B2.engine.keyId, B2.key.keyId, '거부되면 지금 키 그대로');
    marker.content = realMarker;
    // 진짜 새 키를 넣으면: 전체 다시 맞추기에서 B2의 수정은 충돌이 아니라 올릴 목록에 남고, 올리면 A2가 받는다
    await B2.engine.adoptKey(newKey);
    const resync = await B2.engine.initialSync();
    assert.equal(resync.conflicts, 0, '키 교체로 다시 봉인한 파일은 수정의 바탕으로 인정');
    const after = await B2.engine.push();
    assert.equal(after.uploaded, 1);
    await A2.engine.pull();
    assert.equal(A2.local.stores.seekers.get('s1').phone, '010-5555-5555');
    // 교체 뒤 평소 동기화도 정상
    await A2.local.appPut('seekers', { ...A2.local.stores.seekers.get('s2'), phone: '010-6666-6666' });
    await A2.engine.push();
    await B2.engine.pull();
    assert.equal(B2.local.stores.seekers.get('s2').phone, '010-6666-6666');
});

console.log(`shared drive tests passed (${passed}) — fake drive only, no network, synthetic data.`);
