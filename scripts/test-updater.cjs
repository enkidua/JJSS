// 자동 업데이트 서비스(electron/updater.cjs) 단위 테스트. 가짜 autoUpdater·ipcMain으로 정책을 확인한다.
// 네트워크·실제 설치를 하지 않는다. 저장소 사본은 임시 폴더의 합성 파일로만 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createUpdateService, copyLocalDataForUpdate, RELEASES_PAGE_URL, FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS } = require('../electron/updater.cjs');

function makeHarness({ packaged = true, platform = 'win32', env = {}, userData } = {}) {
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
    const window = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
    const service = createUpdateService({
        app: {
            isPackaged: packaged,
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
        setTimeoutFn: (fn, ms) => timers.push({ fn, ms, kind: 'timeout' }),
        setIntervalFn: (fn, ms) => timers.push({ fn, ms, kind: 'interval' }),
    });
    const invoke = (channel, trusted = true) => handlers.get(channel)({ trusted });
    return { service, handlers, sent, timers, opened, logs, updater, invoke, loads: () => loads };
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
            await h.invoke('jjss-update:install');
            assert.deepEqual(h.updater.installCalls, [[false, true]]);
            const copies = fs.readdirSync(path.join(userData, 'update-backups'));
            assert.equal(copies.length, 1);
            const copied = path.join(userData, 'update-backups', copies[0], 'IndexedDB', 'file__0.indexeddb.leveldb');
            assert.equal(fs.readFileSync(path.join(copied, '000003.log'), 'utf8'), 'synthetic-encrypted-record');
            assert.equal(fs.existsSync(path.join(copied, 'LOCK')), false, '잠긴 LOCK 파일은 복사하지 않음');
            assert.match(copies[0], /^3\.1\.0-/, '사본 이름에 설치 전 버전');
        } finally {
            fs.rmSync(userData, { recursive: true, force: true });
        }
    });

    await test('저장소 사본은 최근 2개만 남긴다', async () => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-updater-keep-'));
        try {
            fs.mkdirSync(path.join(userData, 'IndexedDB'), { recursive: true });
            fs.writeFileSync(path.join(userData, 'IndexedDB', 'x.log'), 'x');
            for (const day of [1, 2, 3]) {
                await copyLocalDataForUpdate({ fs, path, userDataPath: userData, version: '3.1.0', now: new Date(Date.UTC(2026, 9, day)) });
            }
            const copies = fs.readdirSync(path.join(userData, 'update-backups')).sort();
            assert.equal(copies.length, 2);
            assert.match(copies[0], /2026-10-02/);
            assert.match(copies[1], /2026-10-03/);
            assert.equal(await copyLocalDataForUpdate({ fs, path, userDataPath: path.join(userData, 'none'), version: '3.1.0' }), null, '저장소가 없으면 건너뜀');
        } finally {
            fs.rmSync(userData, { recursive: true, force: true });
        }
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
