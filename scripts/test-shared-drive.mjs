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
async function load(relative) {
    const file = path.resolve(root, 'src', relative);
    if (cache.has(file)) return cache.get(file);
    let code = ts.transpileModule(await readFile(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: file,
    }).outputText;
    for (const match of [...code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)]) {
        const target = path.relative(path.join(root, 'src'), path.resolve(path.dirname(file), match[1])).replace(/\\/g, '/') + '.ts';
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
    const stale = await B.engine.pull();
    assert.equal(stale.needsNewKey, true);
    await B.engine.adoptKey(await orgKey.deriveOrgKey(await orgKey.parseOrgKeyCode(await orgKey.formatOrgKeyCode(newSecret))));
    await assert.rejects(B.engine.adoptKey(await orgKey.deriveOrgKey(orgKey.generateOrgSecret())), /맞지 않습니다/);
    await B.engine.adoptKey(newKey);
    const resumed = await B.engine.pull();
    assert.equal(resumed.needsNewKey, false);
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

console.log(`shared drive tests passed (${passed}) — fake drive only, no network, synthetic data.`);
