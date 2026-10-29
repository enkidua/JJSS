// 공유 저장소 main 프로세스(electron/googleDrive.cjs) 단위 테스트.
// 구글 대신 가짜 fetch를 쓴다. 로그인 리디렉션만 이 PC의 127.0.0.1 루프백으로 실제 HTTP를 보낸다. 외부 네트워크 없음.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createDriveService, decodeJwtPayload, sanitizeProperties } = require('../electron/googleDrive.cjs');

const realFetch = globalThis.fetch;
const DOMAIN = 'example-org.org';
const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
const DRIVE_ID = '0ABCdefGHIjklUk9PVA';

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

function jwt(claims) {
    const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'RS256' })}.${part(claims)}.sig`;
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 가짜 구글: 받은 요청을 기록하고 정해 둔 응답을 돌려준다. */
function createFakeGoogle({ account = `kim@${DOMAIN}`, hd = DOMAIN } = {}) {
    const calls = [];
    const files = new Map([
        ['fileInDrive01', { id: 'fileInDrive01', name: 'seekers-s1.jjss', driveId: DRIVE_ID, appProperties: { jjssKind: 'record', rid: 'seekers:s1', version: '1' } }],
        ['fileOutside01', { id: 'fileOutside01', name: 'x.jjss', driveId: 'OTHERdrive0001', appProperties: { jjssKind: 'record', rid: 'seekers:s9', version: '1' } }],
    ]);
    const state = { failNext: [], permissionsStatus: 200, tokenCode: null, verifier: null, refreshCount: 0 };
    async function fetchFn(url, init = {}) {
        const target = new URL(url);
        const method = init.method || 'GET';
        calls.push({ url: target, method, init });
        if (state.failNext.length) {
            const status = state.failNext.shift();
            return jsonResponse(status, { error: { errors: [{ reason: status === 403 ? 'rateLimitExceeded' : 'backendError' }] } });
        }
        if (target.href.startsWith('https://oauth2.googleapis.com/token')) {
            const body = new URLSearchParams(init.body);
            if (body.get('grant_type') === 'authorization_code') {
                state.verifier = body.get('code_verifier');
                if (body.get('code') !== 'good-code') return jsonResponse(400, { error: 'invalid_grant' });
                return jsonResponse(200, { access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-secret-1', id_token: jwt({ email: account, email_verified: true, hd }) });
            }
            if (body.get('grant_type') === 'refresh_token') {
                state.refreshCount += 1;
                if (body.get('refresh_token') !== 'refresh-secret-1') return jsonResponse(400, { error: 'invalid_grant' });
                return jsonResponse(200, { access_token: `access-r${state.refreshCount}`, expires_in: 3600 });
            }
        }
        if (target.href.startsWith('https://oauth2.googleapis.com/revoke')) return jsonResponse(200, {});
        const auth = init.headers?.Authorization || '';
        if (target.hostname === 'www.googleapis.com' && !auth.startsWith('Bearer access-')) return jsonResponse(401, { error: { status: 'UNAUTHENTICATED' } });
        const p = target.pathname;
        if (p === '/drive/v3/drives') return jsonResponse(200, { drives: [{ id: DRIVE_ID, name: 'JJSS 사례관리' }] });
        if (p === `/drive/v3/drives/${DRIVE_ID}`) return jsonResponse(200, { id: DRIVE_ID, name: 'JJSS 사례관리', restrictions: { domainUsersOnly: true }, capabilities: { canAddChildren: true } });
        if (p === `/drive/v3/files/${DRIVE_ID}/permissions`) {
            if (state.permissionsStatus !== 200) return jsonResponse(state.permissionsStatus, { error: { errors: [{ reason: 'insufficientFilePermissions' }] } });
            return jsonResponse(200, { permissions: [{ type: 'group', emailAddress: `team@${DOMAIN}`, role: 'writer' }] });
        }
        if (p === '/drive/v3/files' && method === 'GET') {
            const q = target.searchParams.get('q') || '';
            if (q.includes("mimeType='application/vnd.google-apps.folder'")) return jsonResponse(200, { files: [] });
            return jsonResponse(200, { files: [...files.values()] });
        }
        if (p === '/drive/v3/files' && method === 'POST') return jsonResponse(200, { id: `folder${calls.length}xx` });
        if (p === '/drive/v3/changes/startPageToken') return jsonResponse(200, { startPageToken: '42' });
        if (p === '/drive/v3/changes') return jsonResponse(200, { changes: [{ fileId: 'fileOutside01', removed: false, file: files.get('fileOutside01') }, { fileId: 'fileInDrive01', removed: false, file: files.get('fileInDrive01') }], newStartPageToken: '43' });
        const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
        if (fileMatch && method === 'GET') {
            const file = files.get(fileMatch[1]);
            if (!file) return jsonResponse(404, { error: { status: 'NOT_FOUND' } });
            if (target.searchParams.get('alt') === 'media') {
                if (state.download === 'declared-big') return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Length': String(21 * 1024 * 1024) } });
                if (state.download === 'stream-big') {
                    const chunk = new Uint8Array(1024 * 1024);
                    let sent = 0;
                    const stream = new ReadableStream({ pull(controller) { if (sent >= 22) { controller.close(); return; } sent += 1; controller.enqueue(chunk); } });
                    return new Response(stream, { status: 200 });
                }
                return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
            }
            return jsonResponse(200, file);
        }
        if (fileMatch && method === 'PATCH') return jsonResponse(200, { id: fileMatch[1] });
        if (p.startsWith('/upload/drive/v3/files')) return jsonResponse(200, { id: 'uploaded0001', name: 'n', driveId: DRIVE_ID, appProperties: {} });
        return jsonResponse(404, { error: { status: 'NOT_FOUND' } });
    }
    return { fetchFn, calls, files, state };
}

function makeSafeStorage(available = true) {
    return {
        isEncryptionAvailable: () => available,
        encryptString: text => Buffer.from(`sealed:${Buffer.from(text).toString('hex')}`),
        decryptString: buffer => {
            const value = buffer.toString();
            if (!value.startsWith('sealed:')) throw new Error('bad');
            return Buffer.from(value.slice(7), 'hex').toString();
        },
    };
}

function makeService({ google = createFakeGoogle(), safeStorage = makeSafeStorage(), openExternal } = {}) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-drive-test-'));
    const handlers = new Map();
    const opened = [];
    const sleeps = [];
    const backups = [];
    const service = createDriveService({
        app: { getPath: () => userData },
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        shell: { openExternal: async url => { opened.push(url); if (openExternal) await openExternal(url); } },
        safeStorage, fs, path, http, crypto,
        fetchFn: google.fetchFn,
        validateSender: event => { if (event?.bad) throw new Error('허용되지 않은 요청 출처입니다.'); },
        expectedIndexPath: 'index.html',
        copyLocalData: async options => { backups.push(options); return 'copied'; },
        sleep: async ms => { sleeps.push(ms); },
    });
    service.register();
    const call = (channel, ...args) => handlers.get(channel)({}, ...args);
    const configText = () => { try { return fs.readFileSync(path.join(userData, 'shared-drive.json'), 'utf8'); } catch { return ''; } };
    return { service, handlers, call, google, opened, sleeps, backups, userData, configText };
}

/** 브라우저 흉내: 로그인 주소의 redirect_uri로 code·state를 돌려 보낸다. */
function browserReturning({ code = 'good-code', state } = {}) {
    return async url => {
        const auth = new URL(url);
        const redirect = new URL(auth.searchParams.get('redirect_uri'));
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', state ?? auth.searchParams.get('state'));
        setTimeout(() => realFetch(redirect).then(response => response.text()).catch(() => undefined), 10);
    };
}

async function signedInService(options = {}) {
    const ctx = makeService({ ...options, openExternal: browserReturning() });
    await ctx.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 'client-secret-xyz', domain: DOMAIN });
    const result = await ctx.call('jjss-drive:sign-in');
    assert.equal(result.ok, true, JSON.stringify(result));
    return ctx;
}

(async () => {
    await test('켜기 전: 등록·상태 확인만으로는 구글 요청 0건, 설정 파일도 만들지 않는다', async () => {
        const ctx = makeService();
        const status = await ctx.call('jjss-drive:get-status');
        assert.equal(status.ok, true);
        assert.deepEqual({ configured: status.value.configured, signedIn: status.value.signedIn, enabled: status.value.enabled }, { configured: false, signedIn: false, enabled: false });
        assert.equal(ctx.google.calls.length, 0);
        assert.equal(ctx.configText(), '');
        assert.ok(ctx.handlers.size >= 19);
        for (const channel of ctx.handlers.keys()) assert.match(channel, /^jjss-drive:/);
    });

    await test('관리자 설정: 형식 검사, 보안 저장소가 없으면 저장하지 않고, 저장된 비밀은 평문으로 남지 않는다', async () => {
        const ctx = makeService();
        const bad = await ctx.call('jjss-drive:configure', { clientId: 'nope', clientSecret: 'x', domain: DOMAIN });
        assert.equal(bad.ok, false);
        assert.equal(bad.error.code, 'DRIVE_BAD_CLIENT');
        assert.equal((await ctx.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 'x', domain: 'not a domain' })).error.code, 'DRIVE_BAD_DOMAIN');
        const noSecure = makeService({ safeStorage: makeSafeStorage(false) });
        const refused = await noSecure.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 'client-secret-xyz', domain: DOMAIN });
        assert.equal(refused.error.code, 'DRIVE_SECURE_STORE_UNAVAILABLE');
        assert.equal(noSecure.configText().includes('client-secret-xyz'), false);
        const ok = await ctx.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 'client-secret-xyz', domain: DOMAIN.toUpperCase() });
        assert.equal(ok.value.configured, true);
        assert.equal(ok.value.domain, DOMAIN);
        assert.equal(ctx.configText().includes('client-secret-xyz'), false, '클라이언트 보안 비밀은 암호화해 저장');
        assert.equal(JSON.stringify(ok.value).includes('client-secret-xyz'), false, '렌더러에 비밀을 돌려주지 않음');
        assert.equal(ctx.google.calls.length, 0);
    });

    await test('로그인: 시스템 브라우저 + 루프백 + PKCE(S256) + 기관 도메인(hd) 지정, 갱신 토큰은 암호화 저장', async () => {
        const ctx = await signedInService();
        const auth = new URL(ctx.opened[0]);
        assert.equal(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
        assert.equal(auth.searchParams.get('hd'), DOMAIN);
        assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
        assert.match(auth.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.equal(auth.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive');
        const expected = crypto.createHash('sha256').update(ctx.google.state.verifier).digest('base64url');
        assert.equal(auth.searchParams.get('code_challenge'), expected, '토큰 요청의 verifier와 맞는 challenge');
        const status = (await ctx.call('jjss-drive:get-status')).value;
        assert.equal(status.signedIn, true);
        assert.equal(status.accountEmail, `kim@${DOMAIN}`);
        assert.equal(ctx.configText().includes('refresh-secret-1'), false, '갱신 토큰 평문 없음');
        assert.equal(JSON.stringify(status).includes('refresh-secret-1') || JSON.stringify(status).includes('access-1'), false, '렌더러에 토큰 없음');
    });

    await test('로그인 거부: 기관 밖 계정(개인 gmail·다른 도메인), state 불일치', async () => {
        for (const [account, hd] of [['kim@gmail.com', undefined], [`kim@${DOMAIN}`, 'other.org'], ['kim@other.org', 'other.org']]) {
            const ctx = makeService({ google: createFakeGoogle({ account, hd }), openExternal: browserReturning() });
            await ctx.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 's', domain: DOMAIN });
            const result = await ctx.call('jjss-drive:sign-in');
            assert.equal(result.ok, false);
            assert.equal(result.error.code, 'DRIVE_WRONG_DOMAIN', account);
            assert.equal((await ctx.call('jjss-drive:get-status')).value.signedIn, false);
        }
        // state가 다른 요청(다른 프로그램이 루프백 주소를 건드림)은 로그인을 끝내지 않고 무시한다. 같은 응답을 두 번 받아도 토큰 교환은 한 번.
        const forgedStatuses = [];
        const forged = makeService({
            openExternal: async url => {
                const auth = new URL(url);
                const redirect = new URL(auth.searchParams.get('redirect_uri'));
                const send = async (state, code = 'good-code') => {
                    const target = new URL(redirect);
                    target.searchParams.set('code', code);
                    target.searchParams.set('state', state);
                    const response = await realFetch(target);
                    forgedStatuses.push(response.status);
                };
                setTimeout(async () => {
                    await send('forged-state');
                    assert.equal(forged.google.calls.length, 0, 'state가 다르면 토큰 교환도 하지 않음');
                    await Promise.all([send(auth.searchParams.get('state')), send(auth.searchParams.get('state'))]);
                }, 10);
            },
        });
        await forged.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 's', domain: DOMAIN });
        const result = await forged.call('jjss-drive:sign-in');
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(forgedStatuses[0], 404, '위조 state는 404');
        assert.equal(forged.google.calls.filter(item => item.url.href.startsWith('https://oauth2.googleapis.com/token')).length, 1, '같은 응답이 두 번 와도 토큰 교환은 한 번');
    });

    await test('드라이브 범위: 선택한 공유 드라이브 안만 목록·변경·다운로드, 밖의 파일은 거부', async () => {
        const ctx = await signedInService();
        const drives = await ctx.call('jjss-drive:list-shared-drives');
        assert.deepEqual(drives.value, [{ id: DRIVE_ID, name: 'JJSS 사례관리' }]);
        assert.equal((await ctx.call('jjss-drive:list-records')).error.code, 'DRIVE_NOT_SELECTED');
        assert.equal((await ctx.call('jjss-drive:select-drive', '../../etc')).error.code, 'DRIVE_BAD_ID');
        assert.equal((await ctx.call('jjss-drive:select-drive', DRIVE_ID)).ok, true);
        const listed = await ctx.call('jjss-drive:list-records');
        assert.deepEqual(listed.value.files.map(file => file.id), ['fileInDrive01'], '다른 드라이브 파일은 목록에서 뺀다');
        const listCall = ctx.google.calls.findLast(item => item.url.pathname === '/drive/v3/files');
        assert.equal(listCall.url.searchParams.get('corpora'), 'drive');
        assert.equal(listCall.url.searchParams.get('driveId'), DRIVE_ID);
        const changes = await ctx.call('jjss-drive:list-changes', '42');
        assert.deepEqual(changes.value.changes.map(change => change.fileId), ['fileInDrive01']);
        assert.equal(changes.value.newStartPageToken, '43');
        const outside = await ctx.call('jjss-drive:download', 'fileOutside01');
        assert.equal(outside.error.code, 'DRIVE_OUT_OF_SCOPE');
        const inside = await ctx.call('jjss-drive:download', 'fileInDrive01');
        assert.deepEqual([...inside.value], [1, 2, 3]);
        assert.equal((await ctx.call('jjss-drive:get-file', 'fileOutside01')).error.code, 'DRIVE_OUT_OF_SCOPE');
        assert.equal((await ctx.call('jjss-drive:list-changes', 'bad token\n')).error.code, 'DRIVE_BAD_TOKEN');
    });

    await test('올리기: 허용한 속성만, 파일 이름 검사, 공유 드라이브 안 폴더에 만들기', async () => {
        const ctx = await signedInService();
        await ctx.call('jjss-drive:select-drive', DRIVE_ID);
        const props = { jjssKind: 'record', store: 'seekers', rid: 'seekers:s1', version: '1', updatedAt: 'now', updatedBy: `kim@${DOMAIN}`, deleted: '0', keyId: 'abc', hash: 'h' };
        assert.equal((await ctx.call('jjss-drive:upload', { folder: 'seekers', name: 'seekers-s1.jjss', appProperties: { ...props, name: '가온해' }, content: new Uint8Array([1]) })).error.code, 'DRIVE_BAD_PROPERTY');
        assert.equal((await ctx.call('jjss-drive:upload', { folder: 'seekers', name: '../가온해.jjss', appProperties: props, content: new Uint8Array([1]) })).error.code, 'DRIVE_BAD_NAME');
        const created = await ctx.call('jjss-drive:upload', { folder: 'documents/2026', name: 'caseDocuments-d1.jjss', appProperties: props, content: new Uint8Array([9, 9]) });
        assert.equal(created.ok, true, JSON.stringify(created));
        const upload = ctx.google.calls.findLast(item => item.url.pathname.startsWith('/upload/'));
        assert.equal(upload.url.searchParams.get('supportsAllDrives'), 'true');
        const body = Buffer.from(upload.init.body).toString('latin1');
        assert.match(body, /"parents":\["folder\d+xx"\]/);
        const folderCreates = ctx.google.calls.filter(item => item.url.pathname === '/drive/v3/files' && item.method === 'POST').map(item => JSON.parse(item.init.body));
        assert.deepEqual(folderCreates.map(item => item.name), ['JJSS 사례관리', 'documents', '2026']);
        assert.equal(folderCreates[0].parents[0], DRIVE_ID, '맨 위 폴더는 공유 드라이브 안');
        assert.equal((await ctx.call('jjss-drive:upload', { folder: 'documents/x', name: 'a.jjss', appProperties: props, content: new Uint8Array([1]) })).error.code, 'DRIVE_BAD_FOLDER');
        assert.equal((await ctx.call('jjss-drive:set-properties', 'fileInDrive01', { version: '9' })).error.code, 'DRIVE_BAD_PROPERTY', '편집 표시 외 속성은 따로 바꾸지 못함');
        assert.equal((await ctx.call('jjss-drive:set-properties', 'fileInDrive01', { editingBy: `kim@${DOMAIN}`, editingSince: 'now' })).ok, true);
        assert.throws(() => sanitizeProperties({ hash: 'x'.repeat(130) }, new Set(['hash'])), /너무 깁니다/);
    });

    await test('요청 제한(429)·일시 오류는 잠시 기다렸다 다시, 만료된 토큰은 한 번 갱신', async () => {
        const ctx = await signedInService();
        await ctx.call('jjss-drive:select-drive', DRIVE_ID);
        ctx.google.state.failNext.push(429, 503);
        const listed = await ctx.call('jjss-drive:list-records');
        assert.equal(listed.ok, true);
        assert.deepEqual(ctx.sleeps, [1000, 2000]);
        ctx.google.state.failNext.push(429, 429, 429, 429);
        const busy = await ctx.call('jjss-drive:list-records');
        assert.equal(busy.ok, false);
        assert.equal(busy.error.status, 429);
        ctx.google.state.failNext.push(401);
        const refreshed = await ctx.call('jjss-drive:list-records');
        assert.equal(refreshed.ok, true);
        assert.equal(ctx.google.state.refreshCount, 1, '401이면 갱신 토큰으로 한 번 새 토큰');
    });

    await test('보안 점검 정보: 구성원 목록을 볼 수 없는 직원 계정이면 "확인 못 함"으로 표시', async () => {
        const ctx = await signedInService();
        await ctx.call('jjss-drive:select-drive', DRIVE_ID);
        const facts = await ctx.call('jjss-drive:security-facts');
        assert.equal(facts.value.permissionsVisible, true);
        assert.equal(facts.value.accountIsMember, true);
        assert.equal(facts.value.permissions.length, 1);
        ctx.google.state.permissionsStatus = 403;
        const limited = await ctx.call('jjss-drive:security-facts');
        assert.equal(limited.ok, true);
        assert.equal(limited.value.permissionsVisible, false);
    });

    await test('기관 키·켜기: 키는 암호화 저장, 준비가 끝나야 켜지고, 로그아웃하면 토큰 폐기·키·켜짐 모두 지운다', async () => {
        const ctx = await signedInService();
        assert.equal((await ctx.call('jjss-drive:set-enabled', true)).error.code, 'DRIVE_NOT_READY');
        await ctx.call('jjss-drive:select-drive', DRIVE_ID);
        assert.equal((await ctx.call('jjss-drive:set-org-key', Buffer.alloc(8).toString('base64'))).error.code, 'DRIVE_BAD_KEY');
        const key = crypto.randomBytes(16).toString('base64');
        await ctx.call('jjss-drive:set-org-key', key);
        assert.equal(ctx.configText().includes(key), false);
        assert.equal((await ctx.call('jjss-drive:get-org-key')).value, key);
        assert.equal((await ctx.call('jjss-drive:set-enabled', true)).value.enabled, true);
        const backup = await ctx.call('jjss-drive:backup-local-data');
        assert.equal(backup.value.copied, true);
        assert.equal(ctx.backups[0].folderName, 'shared-drive-backups');
        await ctx.call('jjss-drive:sign-out');
        assert.ok(ctx.google.calls.some(item => item.url.href.startsWith('https://oauth2.googleapis.com/revoke')), '갱신 토큰 폐기 요청');
        const after = (await ctx.call('jjss-drive:get-status')).value;
        assert.deepEqual({ signedIn: after.signedIn, enabled: after.enabled, hasOrgKey: after.hasOrgKey, driveId: after.driveId }, { signedIn: false, enabled: false, hasOrgKey: false, driveId: '' });
        assert.equal(after.configured, true, '관리자 설정은 남긴다');
    });

    await test('요청 출처 검사와 오류 문구: 앱 화면이 아닌 곳은 거부, 오류는 원문 없이 한국어 안내만', async () => {
        const ctx = makeService();
        await assert.rejects(ctx.handlers.get('jjss-drive:get-status')({ bad: true }), /허용되지 않은/);
        const failing = makeService({ google: { fetchFn: async () => { throw new Error('getaddrinfo ENOTFOUND www.googleapis.com C:\\Users\\secret'); }, calls: [], state: {} } });
        await failing.call('jjss-drive:configure', { clientId: CLIENT_ID, clientSecret: 's', domain: DOMAIN });
        const result = await failing.call('jjss-drive:list-shared-drives');
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'DRIVE_SIGN_IN_REQUIRED');
        assert.equal(decodeJwtPayload('a.b'), null);
    });

    await test('내려받기 상한: Content-Length가 크거나 실제 본문이 20MB를 넘으면 DRIVE_TOO_LARGE로 거부(메모리에 올리지 않음)', async () => {
        const ctx = await signedInService();
        const { google } = ctx;
        assert.equal((await ctx.call('jjss-drive:select-drive', DRIVE_ID)).ok, true);
        const download = id => ctx.call('jjss-drive:download', id);
        const small = await download('fileInDrive01');
        assert.equal(small.ok, true);
        google.state.download = 'declared-big';
        const declared = await download('fileInDrive01');
        assert.equal(declared.ok, false);
        assert.equal(declared.error.code, 'DRIVE_TOO_LARGE');
        google.state.download = 'stream-big';
        const streamed = await download('fileInDrive01');
        assert.equal(streamed.ok, false);
        assert.equal(streamed.error.code, 'DRIVE_TOO_LARGE');
        google.state.download = null;
        assert.equal((await download('fileInDrive01')).ok, true, '상한 거부 뒤에도 정상 파일은 받는다');
    });

    console.log(`google drive main tests passed (${passed}) — fake Google, loopback only, no real account.`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
