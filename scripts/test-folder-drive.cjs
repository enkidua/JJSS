// 공유 저장소 "PC 폴더 방식"(electron/folderDrive.cjs + googleDrive.cjs의 방식 전환) 테스트.
// 실제 임시 폴더만 쓴다(구글 드라이브 데스크톱 흉내: <임시>/G/내 드라이브, <임시>/G/공유 드라이브/사례관리). 네트워크·구글 계정 없음.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createDriveService } = require('../electron/googleDrive.cjs');
const { inspectFolderPath, FOLDER_ROOT_NAME, MAGIC } = require('../electron/folderDrive.cjs');

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const DOMAIN = 'example-org.org';

function makeSafeStorage() {
    return {
        isEncryptionAvailable: () => true,
        encryptString: text => Buffer.from(`enc:${Buffer.from(text).toString('base64')}`),
        decryptString: buffer => Buffer.from(String(buffer).slice(4), 'base64').toString(),
    };
}

/** 구글 드라이브(데스크톱) 흉내 폴더 */
function makeGoogleDriveTree() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-folder-'));
    const g = path.join(base, 'G');
    fs.mkdirSync(path.join(g, '내 드라이브'), { recursive: true });
    const shared = path.join(g, '공유 드라이브', '사례관리');
    fs.mkdirSync(shared, { recursive: true });
    return { base, g, shared, myDrive: path.join(g, '내 드라이브') };
}

function makeService({ chosen } = {}) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-folder-user-'));
    const handlers = new Map();
    const dialogState = { next: chosen, calls: 0 };
    const service = createDriveService({
        app: { getPath: () => userData },
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        shell: { openExternal: async () => { throw new Error('폴더 방식은 브라우저를 열지 않는다'); } },
        safeStorage: makeSafeStorage(), fs, path, http, crypto,
        fetchFn: async () => { throw new Error('폴더 방식은 구글에 요청하지 않는다'); },
        dialog: { showOpenDialog: async () => { dialogState.calls += 1; return dialogState.next ? { canceled: false, filePaths: [dialogState.next] } : { canceled: true, filePaths: [] }; } },
        getWindow: () => null,
        validateSender: () => {},
        expectedIndexPath: 'index.html',
        copyLocalData: async () => 'copied',
    });
    service.register();
    const call = (channel, ...args) => handlers.get(channel)({}, ...args);
    const value = async (channel, ...args) => {
        const result = await call(channel, ...args);
        if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        return result.value;
    };
    return { service, call, value, dialogState, userData };
}

async function folderPc(tree, email = `kim@${DOMAIN}`) {
    const pc = makeService({ chosen: tree.shared });
    await pc.value('jjss-drive:configure-folder', { domain: DOMAIN, email });
    await pc.value('jjss-drive:choose-folder');
    return pc;
}

/** 다른 PC(구글 드라이브)가 같은 경로에 새 버전을 내려놓은 상황을 만든다. */
async function pcRaw(tree, target, properties, body) {
    const { MAGIC: magic } = require('../electron/folderDrive.cjs');
    const bytes = Buffer.concat([magic, Buffer.from(`${JSON.stringify(properties)}\n`, 'utf8'), body]);
    const temp = `${target}.other`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, target);
    return true;
}

const props = (rid, version, extra = {}) => ({ jjssKind: 'record', store: rid.split(':')[0], rid, version: String(version), updatedAt: new Date().toISOString(), updatedBy: `kim@${DOMAIN}`, deleted: '0', keyId: 'aaaaaaaaaaaaaaaa', hash: 'h'.repeat(32), ...extra });

(async () => {
    await test('경로 판별: 구글 드라이브 공유 드라이브 폴더만 "공유 드라이브", 내 드라이브·일반 폴더는 아님, macOS 경로에서 계정 읽기', async () => {
        const tree = makeGoogleDriveTree();
        const shared = await inspectFolderPath({ fs, path }, tree.shared);
        assert.equal(shared.isGoogleDrive, true, '같은 뿌리에 "내 드라이브"가 있음');
        assert.equal(shared.isSharedDrive, true);
        assert.equal(shared.driveName, '사례관리');
        const mine = await inspectFolderPath({ fs, path }, tree.myDrive);
        assert.equal(mine.isMyDrive, true);
        assert.equal(mine.isSharedDrive, false);
        const plain = await inspectFolderPath({ fs, path }, os.tmpdir());
        assert.equal(plain.isGoogleDrive, false);
        assert.equal(plain.isSharedDrive, false);
        // "공유 드라이브" 이름만 흉내 낸 일반 폴더(옆에 내 드라이브 없음)는 구글 드라이브가 아니다.
        const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-fake-'));
        fs.mkdirSync(path.join(fakeBase, '공유 드라이브', 'x'), { recursive: true });
        assert.equal((await inspectFolderPath({ fs, path }, path.join(fakeBase, '공유 드라이브', 'x'))).isGoogleDrive, false);
        const mac = await inspectFolderPath({ fs, path: path.posix }, `/Users/a/Library/CloudStorage/GoogleDrive-Kim@${DOMAIN}/Shared drives/Case/sub`);
        assert.equal(mac.isGoogleDrive, true);
        assert.equal(mac.isSharedDrive, true);
        assert.equal(mac.driveName, 'Case');
        assert.equal(mac.accountEmail, `kim@${DOMAIN}`);
    });

    await test('방식 전환: 기본은 구글 로그인 방식, 폴더 방식 설정(도메인·기관 메일 검사) → 폴더 고르기, 로그인 기능은 막힘, 구글 요청 0건', async () => {
        const tree = makeGoogleDriveTree();
        const pc = makeService({ chosen: tree.shared });
        assert.equal((await pc.value('jjss-drive:get-status')).mode, 'api');
        assert.equal((await pc.call('jjss-drive:choose-folder')).error.code, 'DRIVE_BAD_MODE', '폴더 방식을 고르기 전에는 폴더 선택 불가');
        assert.equal((await pc.call('jjss-drive:configure-folder', { domain: 'bad', email: `kim@${DOMAIN}` })).error.code, 'DRIVE_BAD_DOMAIN');
        assert.equal((await pc.call('jjss-drive:configure-folder', { domain: DOMAIN, email: 'kim@gmail.com' })).error.code, 'DRIVE_WRONG_DOMAIN');
        assert.equal((await pc.call('jjss-drive:configure-folder', { domain: DOMAIN, email: 'not-an-email' })).error.code, 'DRIVE_BAD_EMAIL');
        let status = await pc.value('jjss-drive:configure-folder', { domain: DOMAIN, email: ` Kim@${DOMAIN.toUpperCase()} ` });
        assert.equal(status.mode, 'folder');
        assert.equal(status.configured, true);
        assert.equal(status.accountEmail, `kim@${DOMAIN}`);
        assert.equal(status.folderPath, '');
        assert.equal(status.driveId, '');
        status = await pc.value('jjss-drive:choose-folder');
        assert.equal(pc.dialogState.calls, 1);
        assert.equal(fs.realpathSync(status.folderPath), fs.realpathSync(tree.shared));
        assert.match(status.driveId, /^folder-[0-9a-f]{20}$/);
        assert.equal(status.driveName, '사례관리');
        // 취소하면 그대로
        pc.dialogState.next = null;
        assert.equal((await pc.value('jjss-drive:choose-folder')).folderPath, status.folderPath);
        for (const channel of ['jjss-drive:sign-in', 'jjss-drive:list-shared-drives', 'jjss-drive:select-drive']) {
            assert.equal((await pc.call(channel, 'x')).error.code, 'DRIVE_BAD_MODE', `${channel}는 폴더 방식에서 쓰지 않음`);
        }
        // 켜기는 기관 키까지 있어야 한다
        assert.equal((await pc.call('jjss-drive:set-enabled', true)).error.code, 'DRIVE_NOT_READY');
        await pc.value('jjss-drive:set-org-key', crypto.randomBytes(16).toString('base64'));
        assert.equal((await pc.value('jjss-drive:set-enabled', true)).enabled, true);
        // 방식을 바꾸면 꺼진다
        status = await pc.value('jjss-drive:set-mode', 'api');
        assert.equal(status.mode, 'api');
        assert.equal(status.enabled, false);
        status = await pc.value('jjss-drive:set-mode', 'folder');
        assert.equal(status.folderPath !== '', true, '다른 방식으로 갔다 와도 폴더 설정은 남는다');
        // 연결 해제: 폴더·메일·키를 지운다(드라이브 폴더의 파일은 그대로)
        status = await pc.value('jjss-drive:sign-out');
        assert.equal(status.mode, 'folder');
        assert.equal(status.folderPath, '');
        assert.equal(status.accountEmail, '');
        assert.equal(status.hasOrgKey, false);
        assert.equal(status.enabled, false);
    });

    await test('파일 읽기·쓰기: 속성과 암호문을 한 파일에, 원자적 교체, 같은 이름은 덮지 않고 새로 만듦, 편집 표시만 바꾸기', async () => {
        const tree = makeGoogleDriveTree();
        const pc = await folderPc(tree);
        const content = crypto.randomBytes(300);
        const created = await pc.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 1), content });
        assert.equal(created.id, 'seekers/seekers-s1.jjss');
        assert.equal(created.appProperties.version, '1');
        const onDisk = fs.readFileSync(path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers', 'seekers-s1.jjss'));
        assert.ok(onDisk.subarray(0, MAGIC.length).equals(MAGIC), '파일 머리 표식');
        assert.ok(Buffer.compare(onDisk.subarray(onDisk.length - content.length), content) === 0, '본문은 받은 암호문 그대로');
        assert.deepEqual(Buffer.from(await pc.value('jjss-drive:download', created.id)), content);
        // 같은 이름으로 새로 만들기 → 덮지 않고 다른 이름
        const twin = await pc.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 1), content: Buffer.from('other') });
        assert.notEqual(twin.id, created.id);
        assert.deepEqual(Buffer.from(await pc.value('jjss-drive:download', created.id)), content, '원래 파일은 그대로');
        // 바꾸기(fileId) → 버전 2, 편집 중 표시는 이어 둠
        await pc.value('jjss-drive:set-properties', created.id, { editingBy: `lee@${DOMAIN}`, editingSince: new Date().toISOString() });
        const updated = await pc.value('jjss-drive:upload', { fileId: created.id, folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 2), content: Buffer.from('v2') });
        assert.equal(updated.appProperties.version, '2');
        assert.equal(updated.appProperties.editingBy, `lee@${DOMAIN}`);
        await pc.value('jjss-drive:set-properties', created.id, { editingBy: null, editingSince: null });
        const cleared = await pc.value('jjss-drive:get-file', created.id);
        assert.equal(cleared.appProperties.editingBy, undefined);
        assert.deepEqual(Buffer.from(await pc.value('jjss-drive:download', created.id)), Buffer.from('v2'), '속성만 바꿔도 본문은 그대로');
        // 편집 표시 외의 속성은 setProperties로 바꿀 수 없다
        assert.equal((await pc.call('jjss-drive:set-properties', created.id, { version: '99' })).error.code, 'DRIVE_BAD_PROPERTY');
        // 문서는 연도 폴더에, _meta는 findMeta로
        await pc.value('jjss-drive:upload', { folder: 'documents/2026', name: 'caseDocuments-d1.jjss', appProperties: props('caseDocuments:d1', 1), content: Buffer.from('d') });
        await pc.value('jjss-drive:upload', { folder: 'meta', name: 'key-check.jjss', appProperties: { jjssKind: 'meta', keyId: 'aaaaaaaaaaaaaaaa' }, content: Buffer.from('k') });
        assert.equal((await pc.value('jjss-drive:find-meta', 'key-check.jjss')).id, '_meta/key-check.jjss');
        assert.equal(await pc.value('jjss-drive:find-meta', 'missing.jjss'), null);
        const listed = await pc.value('jjss-drive:list-records');
        assert.deepEqual(listed.files.map(file => file.id).sort(), ['documents/2026/caseDocuments-d1.jjss', 'seekers/seekers-s1.jjss', twin.id].sort(), '_meta는 기록 목록에 없음');
        // 임시 파일이 남지 않는다
        const leftovers = fs.readdirSync(path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers')).filter(name => name.startsWith('.'));
        assert.deepEqual(leftovers, []);
    });

    await test('저장소 밖 접근 거부: 상위 폴더·절대 경로·다른 최상위 폴더·숨김 파일 id, 잘못된 이름·폴더', async () => {
        const tree = makeGoogleDriveTree();
        const pc = await folderPc(tree);
        fs.writeFileSync(path.join(tree.shared, 'outside.txt'), 'secret');
        const bad = ['../outside.txt', 'seekers/../../outside.txt', 'seekers/..', `${tree.shared}/outside.txt`, 'C:\\Windows\\x', 'other/x.jjss', 'seekers', 'seekers/.jjss-tmp-1', 'seekers/a\u0000b', 'documents/2026/../../../outside.txt', ''];
        for (const id of bad) {
            for (const channel of ['jjss-drive:get-file', 'jjss-drive:download']) {
                const result = await pc.call(channel, id);
                assert.equal(result.ok, false, `${channel} ${JSON.stringify(id)}`);
                assert.match(result.error.code, /DRIVE_BAD_ID|DRIVE_OUT_OF_SCOPE/);
            }
            if (!id) continue; // 빈 fileId는 "새로 만들기"(드라이브 API 방식과 같음)
            const upload = await pc.call('jjss-drive:upload', { fileId: id, folder: 'seekers', name: 'x.jjss', appProperties: props('seekers:x', 1), content: Buffer.from('x') });
            assert.equal(upload.ok, false, `upload ${JSON.stringify(id)}`);
        }
        assert.equal((await pc.call('jjss-drive:upload', { folder: '../x', name: 'x.jjss', appProperties: props('seekers:x', 1), content: Buffer.from('x') })).error.code, 'DRIVE_BAD_FOLDER');
        assert.equal((await pc.call('jjss-drive:upload', { folder: 'seekers', name: '../x.jjss', appProperties: props('seekers:x', 1), content: Buffer.from('x') })).error.code, 'DRIVE_BAD_NAME');
        assert.equal((await pc.call('jjss-drive:upload', { folder: 'seekers', name: 'x.jjss', appProperties: { ...props('seekers:x', 1), evil: '1' }, content: Buffer.from('x') })).error.code, 'DRIVE_BAD_PROPERTY');
        assert.equal((await pc.call('jjss-drive:find-meta', '../x')).error.code, 'DRIVE_BAD_NAME');
        assert.equal(fs.readFileSync(path.join(tree.shared, 'outside.txt'), 'utf8'), 'secret');
    });

    await test('변경 감지: 다른 PC가 쓴 파일·지운 파일을 찾고, 모르는 토큰이면 전부 변경으로, JJSS 형식이 아닌 파일은 건너뜀', async () => {
        const tree = makeGoogleDriveTree();
        const A = await folderPc(tree, `kim@${DOMAIN}`);
        const B = await folderPc(tree, `lee@${DOMAIN}`);
        await A.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 1), content: Buffer.from('a') });
        const token = await B.value('jjss-drive:get-start-token');
        let changes = await B.value('jjss-drive:list-changes', token);
        assert.deepEqual(changes.changes, [], '바뀐 것 없음');
        // A가 새 기록을 쓰고 기존 기록을 바꿈
        await new Promise(resolve => setTimeout(resolve, 20));
        await A.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s2.jjss', appProperties: props('seekers:s2', 1), content: Buffer.from('b') });
        await A.value('jjss-drive:upload', { fileId: 'seekers/seekers-s1.jjss', folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 2), content: Buffer.from('a2') });
        // 사람이 넣은 다른 파일(형식 아님)
        fs.writeFileSync(path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers', '메모.txt'), 'hello');
        changes = await B.value('jjss-drive:list-changes', changes.newStartPageToken);
        assert.deepEqual(changes.changes.map(change => change.file.appProperties.rid).sort(), ['seekers:s1', 'seekers:s2']);
        assert.equal(changes.changes.find(change => change.fileId === 'seekers/seekers-s1.jjss').file.appProperties.version, '2');
        // 지움
        fs.unlinkSync(path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers', 'seekers-s2.jjss'));
        const removed = await B.value('jjss-drive:list-changes', changes.newStartPageToken);
        assert.deepEqual(removed.changes, [{ fileId: 'seekers/seekers-s2.jjss', removed: true }]);
        // 모르는 토큰(상태를 비운 PC) → 지금 있는 기록 전부
        const all = await B.value('jjss-drive:list-changes', 'unknowntoken1');
        assert.deepEqual(all.changes.map(change => change.fileId), ['seekers/seekers-s1.jjss']);
        assert.equal((await B.call('jjss-drive:list-changes', '../x')).error.code, 'DRIVE_BAD_TOKEN');
        assert.equal((await B.value('jjss-drive:list-records')).files.length, 1, '형식이 아닌 파일은 목록에 없음');
        const foreign = await B.value('jjss-drive:get-file', 'seekers/메모.txt');
        assert.deepEqual(foreign.appProperties, {}, '형식이 아닌 파일은 속성 없음(엔진이 격리)');
        assert.equal((await B.value('jjss-drive:download', 'seekers/메모.txt')).length, 0);
    });

    await test('크기 상한·폴더를 못 쓸 때: 20MB 넘는 파일은 읽지 않고, 구글 드라이브가 꺼져 폴더가 없으면 "연결 없음" 오류', async () => {
        const tree = makeGoogleDriveTree();
        const pc = await folderPc(tree);
        await pc.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-big.jjss', appProperties: props('seekers:big', 1), content: Buffer.from('x') });
        const target = path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers', 'seekers-big.jjss');
        const header = fs.readFileSync(target).subarray(0, 200);
        const headerEnd = header.indexOf(0x0a, MAGIC.length) + 1;
        fs.writeFileSync(target, Buffer.concat([header.subarray(0, headerEnd), Buffer.alloc(21 * 1024 * 1024)]));
        assert.equal((await pc.call('jjss-drive:download', 'seekers/seekers-big.jjss')).error.code, 'DRIVE_TOO_LARGE');
        assert.equal((await pc.call('jjss-drive:set-properties', 'seekers/seekers-big.jjss', { editingBy: `kim@${DOMAIN}` })).error.code, 'DRIVE_TOO_LARGE', '편집 표시를 바꿀 때도 큰 파일은 읽지 않음');
        assert.equal((await pc.call('jjss-drive:upload', { folder: 'seekers', name: 'seekers-huge.jjss', appProperties: props('seekers:huge', 1), content: Buffer.alloc(21 * 1024 * 1024) })).error.code, 'DRIVE_TOO_LARGE');
        // 구글 드라이브(데스크톱)를 끄면 G:\ 아래가 사라진다
        fs.rmSync(tree.g, { recursive: true, force: true });
        for (const channel of ['jjss-drive:list-records', 'jjss-drive:get-start-token', 'jjss-drive:security-facts']) {
            const result = await pc.call(channel);
            assert.equal(result.error.code, 'DRIVE_FOLDER_UNAVAILABLE', channel);
            assert.match(result.error.message, /구글 드라이브\(데스크톱\)가 실행 중/);
        }
    });

    await test('편집 표시: 읽고 쓰는 사이 구글 드라이브가 새 버전을 내려놓으면 되돌리지 않고, 관리자 확인은 폴더마다 기록된다', async () => {
        const tree = makeGoogleDriveTree();
        const pc = await folderPc(tree);
        const created = await pc.value('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s1.jjss', appProperties: props('seekers:s1', 1), content: Buffer.from('v1') });
        const target = path.join(tree.shared, FOLDER_ROOT_NAME, 'seekers', 'seekers-s1.jjss');
        // 다른 PC의 v2가 내려온 상황을 흉내 낸다: setProperties가 읽은 직후 파일을 바꿔 둔다.
        const realReadFile = fs.promises.readFile;
        let swapped = false;
        fs.promises.readFile = async (...args) => {
            const bytes = await realReadFile(...args);
            if (!swapped && String(args[0]) === target) {
                swapped = true;
                const v2 = await pcRaw(tree, target, props('seekers:s1', 2), Buffer.from('v2'));
                assert.ok(v2);
            }
            return bytes;
        };
        let failed = null;
        try {
            await pc.value('jjss-drive:set-properties', created.id, { editingBy: `lee@${DOMAIN}` });
        } catch (error) {
            failed = error;
        } finally {
            fs.promises.readFile = realReadFile;
        }
        const after = await pc.value('jjss-drive:get-file', created.id);
        assert.equal(after.appProperties.version, '2', '다른 PC의 새 버전을 옛 버전으로 되돌리지 않는다');
        assert.equal(Buffer.from(await pc.value('jjss-drive:download', created.id)).toString(), 'v2');
        if (failed) assert.equal(failed.code, 'DRIVE_BUSY', '계속 바뀌면 다음 주기에 다시 하도록 알린다');
        else assert.equal(after.appProperties.editingBy, `lee@${DOMAIN}`, '다시 읽어 새 버전 위에 편집 표시를 남긴다');
        // 관리자 확인 기록
        let status = await pc.value('jjss-drive:ack-folder-security', true);
        assert.match(status.folderSecurityAckAt, /^\d{4}-/);
        status = await pc.value('jjss-drive:choose-folder');
        assert.notEqual(status.folderSecurityAckAt, '', '같은 폴더를 다시 고르면 확인 기록은 그대로');
        pc.dialogState.next = path.join(tree.g, '공유 드라이브', '다른 드라이브');
        fs.mkdirSync(pc.dialogState.next, { recursive: true });
        status = await pc.value('jjss-drive:choose-folder');
        assert.equal(status.folderSecurityAckAt, '', '다른 폴더를 고르면 확인 기록을 지운다');
    });

    await test('보안 정보: 폴더 방식 표시, 구글 드라이브 공유 드라이브·쓰기 가능 여부, 구성원 목록은 볼 수 없음', async () => {
        const tree = makeGoogleDriveTree();
        const pc = await folderPc(tree);
        const facts = await pc.value('jjss-drive:security-facts');
        assert.equal(facts.mode, 'folder');
        assert.equal(facts.isSharedDrive, true);
        assert.equal(facts.permissionsVisible, false);
        assert.equal(facts.folder.isGoogleDrive, true);
        assert.equal(facts.folder.writable, true);
        assert.equal(facts.accountEmail, `kim@${DOMAIN}`);
        assert.deepEqual(fs.readdirSync(path.join(tree.shared, FOLDER_ROOT_NAME)).filter(name => name.startsWith('.')), [], '쓰기 확인 파일은 지운다');
        // 일반 폴더를 고르면 구글 드라이브가 아님
        const plain = makeService({ chosen: fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-plain-')) });
        await plain.value('jjss-drive:configure-folder', { domain: DOMAIN, email: `kim@${DOMAIN}` });
        await plain.value('jjss-drive:choose-folder');
        const plainFacts = await plain.value('jjss-drive:security-facts');
        assert.equal(plainFacts.isSharedDrive, false);
        assert.equal(plainFacts.folder.isGoogleDrive, false);
    });

    console.log(`folder drive tests passed (${passed}) — temp folders only, no network, no Google account.`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
