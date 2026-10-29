// 자동 업데이트 서비스(electron/updater.cjs) 단위 테스트. 가짜 autoUpdater·ipcMain으로 정책을 확인한다.
// 네트워크·실제 설치를 하지 않는다. 저장소 사본은 임시 폴더의 합성 파일로만 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createUpdateService, copyLocalDataForUpdate, hasPinnedPublisher, RELEASES_PAGE_URL, FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS } = require('../electron/updater.cjs');

const SIGNED_UPDATE_YML = ['owner: enkidua', 'repo: JJSS', 'provider: github', 'publisherName:', '  - JJSS', 'updaterCacheDirName: jjss-updater', ''].join('\n');

function makeHarness({ packaged = true, platform = 'win32', env = {}, userData, updateYml = SIGNED_UPDATE_YML } = {}) {
    const handlers = new Map();
    const sent = [];
    const timers = [];
    const opened = [];
    const logs = [];
    let loads = 0;
    const updater = Object.assign(new EventEmitter(), {
        checkCalls: 0, downloadCalls: 0, installCalls: [],
        nextCheck: null,
        async checkForUpdates() {
            this.checkCalls += 1;
            if (this.nextCheck) return this.nextCheck(this);
            return null;
        },
        async downloadUpdate() {
            this.downloadCalls += 1;
            this.emit('download-progress', { percent: 42.4 });
            this.emit('update-downloaded', { version: '3.2.0' });
        },
        quitAndInstall(...args) { this.installCalls.push(args); },
    });
    // 창 닫기 흉내: closeBehavior가 'cancel'이면(저장하지 않은 내용 확인창에서 취소) 창이 살아남는다.
    const window = {
        destroyed: false,
        closeBehavior: 'close',
        closeCalls: 0,
        listeners: new Map(),
        isDestroyed() { return this.destroyed; },
        once(event, fn) { this.listeners.set(event, fn); },
        close() {
            this.closeCalls += 1;
            if (this.closeBehavior === 'cancel') return;
            this.destroyed = true;
            this.listeners.get('closed')?.();
        },
        webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
    };
    const appEvents = new Map();
    const quits = [];
    const service = createUpdateService({
        app: {
            isPackaged: packaged,
            on: (event, fn) => appEvents.set(event, fn),
            quit: () => quits.push(Date.now()),
            getVersion: () => '3.1.0',
            getPath: name => { assert.equal(name, 'userData'); return userData || os.tmpdir(); },
        },
        ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
        shell: { openExternal: async url => { opened.push(url); } },
        getWindow: () => window,
        validateSender: event => { if (!event?.trusted) throw new Error('untrusted sender'); },
        expectedIndexPath: '/app/dist/index.html',
        loadAutoUpdater: () => { loads += 1; return updater; },
        platform,
        env,
        fs,
        path,
        logMainEvent: (...args) => logs.push(['event', ...args]),
        logMainError: (...args) => logs.push(['error', ...args]),
        readUpdateConfig: () => { if (updateYml === null) throw new Error('ENOENT'); return updateYml; },
        // 긴 예약(첫 확인 10초)은 기록만 하고, 짧은 예약(창 닫기 확인 유예)은 실제로 돌린다.
        setTimeoutFn: (fn, ms) => { timers.push({ fn, ms, kind: 'timeout' }); if (ms < 5000) setTimeout(fn, ms); },
        setIntervalFn: (fn, ms) => timers.push({ fn, ms, kind: 'interval' }),
    });
    const invoke = (channel, trusted = true) => handlers.get(channel)({ trusted });
    return { service, handlers, sent, timers, opened, logs, updater, invoke, loads: () => loads, window, appEvents, quits };
}

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const ALLOWED_STATUS_KEYS = ['availableVersion', 'currentVersion', 'lastCheckedAt', 'manualOnly', 'message', 'percent', 'phase'];

(async () => {
    await test('개발 실행·끔 설정에서는 업데이트를 확인하지 않는다(autoUpdater를 불러오지도 않음)', async () => {
        for (const options of [{ packaged: false }, { env: { JJSS_DISABLE_UPDATES: '1' } }]) {
            const h = makeHarness(options);
            h.service.register();
            assert.equal(h.timers.length, 0, '자동 확인 타이머 없음');
            const status = await h.invoke('jjss-update:check');
            assert.equal(status.phase, 'disabled');
            assert.equal(h.loads(), 0);
            assert.ok(h.handlers.has('jjss-update:get-status'), '상태 조회는 항상 응답');
        }
    });

    await test('서명자가 고정되지 않은 Windows 설치본(서명 없이 만든 빌드)은 업데이트를 끈다', async () => {
        assert.equal(hasPinnedPublisher(SIGNED_UPDATE_YML), true);
        assert.equal(hasPinnedPublisher('publisherName: JJSS\n'), true, '한 줄 형식');
        assert.equal(hasPinnedPublisher('publisherName:\n  - "Someone Else"\n'), false, '다른 서명자');
        for (const updateYml of ['owner: enkidua\nrepo: JJSS\nprovider: github\n', null]) {
            const h = makeHarness({ updateYml });
            h.service.register();
            assert.equal(h.timers.length, 0, '확인하지 않음');
            const status = await h.invoke('jjss-update:check');
            assert.equal(status.phase, 'disabled');
            assert.match(status.message, /서명 정보가 없는 설치본/);
            assert.equal(h.loads(), 0);
        }
        // macOS는 자동 설치를 하지 않으므로(알림만) 이 조건과 무관하다.
        const mac = makeHarness({ platform: 'darwin', updateYml: null });
        mac.service.register();
        assert.equal(mac.timers.length, 2);
    });

    await test('배포본은 10초 뒤와 6시간마다 확인하고, 내려받기는 저절로 하지 않는다', async () => {
        const h = makeHarness();
        h.service.register();
        assert.deepEqual(h.timers.map(t => [t.kind, t.ms]), [['timeout', FIRST_CHECK_DELAY_MS], ['interval', CHECK_INTERVAL_MS]]);
        assert.equal(FIRST_CHECK_DELAY_MS, 10_000);
        assert.equal(CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000);
        h.updater.nextCheck = updater => { updater.emit('update-available', { version: '3.2.0' }); return {}; };
        h.timers[0].fn();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(h.updater.autoDownload, false, '알림이 먼저, 내려받기는 사용자가 누를 때');
        assert.equal(h.updater.allowDowngrade, false);
        assert.equal(h.updater.allowPrerelease, false);
        assert.equal(h.updater.autoInstallOnAppQuit, true);
        assert.equal(h.updater.downloadCalls, 0);
        const last = h.sent.at(-1);
        assert.equal(last.channel, 'jjss-update:status');
        assert.equal(last.payload.phase, 'available');
        assert.equal(last.payload.availableVersion, '3.2.0');
        assert.deepEqual(Object.keys(last.payload).sort(), ALLOWED_STATUS_KEYS, '상태에는 버전·진행률·안내문만');
    });

    await test('내려받기는 새 버전이 있을 때만, 설치는 다 받은 뒤에만 하고 설치 직전에 저장소 사본을 만든다', async () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-updater-'));
        try {
            const idb = path.join(userData, 'IndexedDB', 'file__0.indexeddb.leveldb');
            fs.mkdirSync(idb, { recursive: true });
            fs.writeFileSync(path.join(idb, '000003.log'), 'synthetic-encrypted-record');
            fs.writeFileSync(path.join(idb, 'LOCK'), '');
            const h = makeHarness({ userData });
            h.service.register();
            assert.equal((await h.invoke('jjss-update:install')).phase, 'idle', '받기 전 설치 요청은 무시');
            assert.equal((await h.invoke('jjss-update:download')).phase, 'idle', '새 버전이 없으면 받지 않음');
            assert.equal(h.updater.downloadCalls, 0);
            h.updater.nextCheck = updater => { updater.emit('update-available', { version: '3.2.0' }); return {}; };
            await h.invoke('jjss-update:check');
            const downloaded = await h.invoke('jjss-update:download');
            assert.equal(downloaded.phase, 'downloaded');
            assert.ok(h.sent.some(entry => entry.payload.phase === 'downloading' && entry.payload.percent === 42), '진행률 정수로');
            assert.equal(h.updater.installCalls.length, 0, '받기만 하고 설치는 하지 않음');
            // 저장하지 않은 내용이 있어 창 닫기를 취소하면 설치파일을 실행하지 않고 "받아 둠"으로 되돌린다.
            h.window.closeBehavior = 'cancel';
            const deferred = await h.invoke('jjss-update:install');
            await new Promise(resolve => setTimeout(resolve, 2200));
            assert.equal(h.updater.installCalls.length, 0, '창이 닫히기 전에는 설치파일을 실행하지 않음');
            const latest = h.sent.at(-1).payload;
            assert.equal(latest.phase, 'downloaded');
            assert.match(latest.message, /설치를 미뤘습니다/);
            assert.equal(deferred.phase === 'installing', false);
            h.window.closeBehavior = 'close';
            await h.invoke('jjss-update:install');
            assert.deepEqual(h.updater.installCalls, [[false, true]]);
            assert.equal(h.window.closeCalls, 2);
            const copies = fs.readdirSync(path.join(userData, 'update-backups'));
            assert.equal(copies.length, 1, '사본은 한 번만(취소했던 시도와 합쳐서)');
            const copied = path.join(userData, 'update-backups', copies[0], 'IndexedDB', 'file__0.indexeddb.leveldb');
            assert.equal(fs.readFileSync(path.join(copied, '000003.log'), 'utf8'), 'synthetic-encrypted-record');
            assert.equal(fs.existsSync(path.join(copied, 'LOCK')), false, '잠긴 LOCK 파일은 복사하지 않음');
            assert.match(copies[0], /^3\.1\.0-/, '사본 이름에 설치 전 버전');
        } finally {
            fs.rmSync(userData, { recursive: true, force: true });
        }
    });

    await test('저장소 사본은 만든 시각 기준으로 최근 2개만 남기고(이름 정렬 아님), 반쯤 복사된 사본은 지운다', async () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-updater-keep-'));
        try {
            fs.mkdirSync(path.join(userData, 'IndexedDB'), { recursive: true });
            fs.writeFileSync(path.join(userData, 'IndexedDB', 'x.log'), 'x');
            // 3.2.0 → 3.9.0 → 3.10.0 순서로 만든다. 이름으로 정렬하면 "3.10.0"이 맨 앞이라 방금 만든 사본이 지워진다.
            for (const [version, day] of [['3.2.0', 1], ['3.9.0', 2], ['3.10.0', 3]]) {
                await copyLocalDataForUpdate({ fs, path, userDataPath: userData, version, now: new Date(Date.UTC(2026, 9, day)) });
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            const copies = fs.readdirSync(path.join(userData, 'update-backups')).sort();
            assert.equal(copies.length, 2);
            assert.ok(copies.some(name => name.startsWith('3.10.0-')), '가장 최근 사본(3.10.0)이 남는다');
            assert.ok(copies.some(name => name.startsWith('3.9.0-')));
            assert.equal(await copyLocalDataForUpdate({ fs, path, userDataPath: path.join(userData, 'none'), version: '3.1.0' }), null, '저장소가 없으면 건너뜀');
            // 복사 중 실패하면 반쯤 된 폴더를 남기지 않는다.
            const failingFs = { ...fs, promises: { ...fs.promises, cp: async () => { throw new Error('synthetic ENOENT'); } } };
            await assert.rejects(copyLocalDataForUpdate({ fs: failingFs, path, userDataPath: userData, version: '3.11.0', now: new Date(Date.UTC(2026, 9, 4)) }), /synthetic/);
            assert.equal(fs.readdirSync(path.join(userData, 'update-backups')).some(name => name.startsWith('3.11.0-')), false);
        } finally {
            fs.rmSync(userData, { recursive: true, force: true });
        }
    });

    await test('앱을 끌 때 설치되는 경로에서도 설치 직전 사본을 만든다(종료를 잠깐 멈췄다 이어감)', async () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-updater-quit-'));
        try {
            fs.mkdirSync(path.join(userData, 'IndexedDB'), { recursive: true });
            fs.writeFileSync(path.join(userData, 'IndexedDB', 'x.log'), 'x');
            const h = makeHarness({ userData });
            h.service.register();
            const beforeQuit = h.appEvents.get('before-quit');
            assert.equal(typeof beforeQuit, 'function');
            let prevented = 0;
            beforeQuit({ preventDefault: () => { prevented += 1; } });
            assert.equal(prevented, 0, '받아 둔 업데이트가 없으면 종료를 막지 않음');
            h.updater.nextCheck = updater => { updater.emit('update-available', { version: '3.2.0' }); return {}; };
            await h.invoke('jjss-update:check');
            await h.invoke('jjss-update:download');
            beforeQuit({ preventDefault: () => { prevented += 1; } });
            assert.equal(prevented, 1, '사본을 만드는 동안 종료를 멈춤');
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal(h.quits.length, 1, '사본을 만든 뒤 다시 종료');
            assert.equal(fs.readdirSync(path.join(userData, 'update-backups')).length, 1);
            beforeQuit({ preventDefault: () => { prevented += 1; } });
            assert.equal(prevented, 1, '다시 들어온 종료는 막지 않음');
        } finally {
            fs.rmSync(userData, { recursive: true, force: true });
        }
    });

    await test('이미 알고 있는 새 버전은 자동 재확인이 실패해도 그대로 보여 준다', async () => {
        const h = makeHarness();
        h.service.register();
        h.updater.nextCheck = updater => { updater.emit('update-available', { version: '3.2.0' }); return {}; };
        await h.invoke('jjss-update:check');
        assert.equal(h.sent.at(-1).payload.phase, 'available');
        h.updater.nextCheck = () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); };
        h.timers[1].fn();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(h.sent.at(-1).payload.phase, 'available');
        assert.equal(h.sent.at(-1).payload.availableVersion, '3.2.0');
    });

    await test('macOS(서명·공증 전)는 알림과 내려받기 페이지만, 자동 설치는 하지 않는다', async () => {
        const h = makeHarness({ platform: 'darwin' });
        h.service.register();
        h.updater.nextCheck = updater => { updater.emit('update-available', { version: '3.2.0' }); return {}; };
        const status = await h.invoke('jjss-update:check');
        assert.equal(status.manualOnly, true);
        assert.equal(h.updater.autoInstallOnAppQuit, false);
        await h.invoke('jjss-update:download');
        await h.invoke('jjss-update:install');
        assert.equal(h.updater.downloadCalls, 0);
        assert.equal(h.updater.installCalls.length, 0);
        await h.invoke('jjss-update:open-download-page');
        assert.deepEqual(h.opened, [RELEASES_PAGE_URL], '주소는 앱에 고정(렌더러가 바꿀 수 없음)');
        assert.equal(RELEASES_PAGE_URL, 'https://github.com/enkidua/JJSS/releases/latest');
    });

    await test('앱 화면이 아닌 곳에서 온 요청은 거부한다', async () => {
        const h = makeHarness();
        h.service.register();
        for (const channel of ['jjss-update:get-status', 'jjss-update:check', 'jjss-update:download', 'jjss-update:install', 'jjss-update:open-download-page']) {
            await assert.rejects(h.invoke(channel, false), /untrusted sender/, channel);
        }
    });

    await test('자동 확인 실패는 조용히, 사용자가 누른 확인 실패는 한국어로 원인만 알린다(원문·경로 없음)', async () => {
        const h = makeHarness();
        h.service.register();
        h.updater.nextCheck = () => { throw new Error('net::ERR_NAME_NOT_RESOLVED C:\\Users\\someone\\AppData'); };
        h.timers[0].fn();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(h.sent.at(-1).payload.phase, 'idle');
        assert.equal(h.sent.at(-1).payload.message, '');
        const status = await h.invoke('jjss-update:check');
        assert.equal(status.phase, 'error');
        assert.equal(status.message, '인터넷에 연결하지 못해 업데이트를 확인하지 못했습니다.');
        assert.equal(JSON.stringify(status).includes('Users'), false);
        h.updater.nextCheck = () => { throw new Error('Cannot find latest.yml in the latest release artifacts'); };
        assert.match((await h.invoke('jjss-update:check')).message, /게시된 업데이트 정보를 찾지 못했습니다/);
        h.updater.nextCheck = () => { throw new Error('New version 3.2.0 is not signed by the application owner: publisherNames: JJSS'); };
        assert.match((await h.invoke('jjss-update:check')).message, /서명을 확인하지 못해 설치하지 않았습니다/);
    });

    console.log(`updater tests passed (${passed}) — fake updater, no network, no install.`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
