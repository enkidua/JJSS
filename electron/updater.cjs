// 자동 업데이트(electron-updater, GitHub Releases).
//
// 원칙
// - 알림이 먼저다. 업데이트가 있으면 화면에 알리기만 하고, 내려받기는 사용자가 누를 때만 한다(autoDownload=false).
// - 설치는 사용자가 "지금 다시 시작"을 누르거나 앱을 끌 때 한다. 미저장 보호(will-prevent-unload)는 그대로 거친다.
// - Windows는 내려받은 설치파일의 서명이 지금 설치된 앱의 서명자(CN=JJSS)와 같아야 설치된다(electron-updater 기본 검증).
// - macOS는 Apple Developer ID 서명·공증이 없으면 설치가 거부되므로 알림 + 내려받기 페이지 열기만 한다.
// - 설치 직전에 이 PC의 저장소(IndexedDB 폴더 — 필드는 이미 암호화된 상태)를 사본으로 남긴다(최근 2개 보관).
// - 업데이트 확인은 버전·운영체제 정보만 GitHub에 보낸다. 업무 데이터·API 키는 보내지 않는다.
// - 개발 실행(app.isPackaged=false)과 JJSS_DISABLE_UPDATES=1에서는 아무것도 하지 않는다.

const RELEASES_PAGE_URL = 'https://github.com/enkidua/JJSS/releases/latest';
/** 업데이트 설치파일이 반드시 가져야 하는 서명자(코드서명 인증서 CN). package.json build.win.signtoolOptions.publisherName과 같아야 한다. */
const REQUIRED_PUBLISHER = 'JJSS';

/**
 * 배포본의 resources/app-update.yml에 서명자가 고정돼 있는지 본다(Windows).
 * 고정돼 있지 않으면 electron-updater가 내려받은 설치파일의 서명을 확인하지 않으므로 업데이트를 끈다.
 */
function hasPinnedPublisher(updateYmlText) {
    const text = String(updateYmlText || '');
    const block = /publisherName:[ \t]*((?:\r?\n[ \t]*-[ \t]*.+)+|.+)/.exec(text);
    if (!block) return false;
    const names = block[1].split('\n').map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    return names.includes(REQUIRED_PUBLISHER);
}
const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const KEEP_DATA_COPIES = 2;

/** 렌더러에 보내는 상태(개인정보·경로 없음) */
function publicState(state) {
    return {
        phase: state.phase,
        currentVersion: state.currentVersion,
        availableVersion: state.availableVersion || '',
        percent: typeof state.percent === 'number' ? Math.max(0, Math.min(100, Math.round(state.percent))) : null,
        manualOnly: state.manualOnly,
        lastCheckedAt: state.lastCheckedAt || '',
        message: state.message || '',
    };
}

function userMessageFor(error) {
    const text = String(error?.message || '').toLowerCase();
    if (/net::|enotfound|econnrefused|etimedout|network|getaddrinfo/.test(text)) return '인터넷에 연결하지 못해 업데이트를 확인하지 못했습니다.';
    if (/latest(-mac)?\.yml|cannot find|404/.test(text)) return '게시된 업데이트 정보를 찾지 못했습니다. 지금 버전을 계속 쓰면 됩니다.';
    if (/signature|not signed|publisher/.test(text)) return '내려받은 업데이트의 서명을 확인하지 못해 설치하지 않았습니다.';
    return '업데이트를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

/**
 * 설치 직전 저장소 사본. IndexedDB 폴더를 userData/update-backups/<버전>-<시각>/IndexedDB로 복사한다.
 * LevelDB의 LOCK 파일은 실행 중 잠겨 있어 건너뛴다. 실패해도 설치는 막지 않고 기록만 한다.
 */
async function copyLocalDataForUpdate({ fs, path, userDataPath, version, now = new Date(), folderName = 'update-backups' }) {
    const source = path.join(userDataPath, 'IndexedDB');
    try {
        await fs.promises.access(source);
    } catch {
        return null;
    }
    if (!/^[a-z-]+$/.test(folderName)) throw new Error('사본 폴더 이름이 올바르지 않습니다.');
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const root = path.join(userDataPath, folderName);
    const target = path.join(root, `${String(version).replace(/[^0-9A-Za-z.-]/g, '_')}-${stamp}`, 'IndexedDB');
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.cp(source, target, {
        recursive: true,
        filter: item => path.basename(item) !== 'LOCK',
    });
    // 오래된 사본 정리(최근 KEEP_DATA_COPIES개만)
    const entries = (await fs.promises.readdir(root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    for (const name of entries.slice(0, Math.max(0, entries.length - KEEP_DATA_COPIES))) {
        await fs.promises.rm(path.join(root, name), { recursive: true, force: true });
    }
    return target;
}

/**
 * @param {object} deps 주입(테스트에서 가짜로 바꿀 수 있게)
 */
function createUpdateService(deps) {
    const {
        app, ipcMain, shell, getWindow, validateSender, expectedIndexPath,
        loadAutoUpdater, platform, env, fs, path, logMainEvent, logMainError,
        readUpdateConfig = () => fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'),
        setTimeoutFn = setTimeout, setIntervalFn = setInterval,
    } = deps;
    const manualOnly = platform === 'darwin';
    let disabledReason = '';
    if (!app.isPackaged) disabledReason = '개발 실행에서는 업데이트를 확인하지 않습니다.';
    else if (env.JJSS_DISABLE_UPDATES === '1') disabledReason = '이 PC에서는 업데이트 확인을 껐습니다.';
    else if (platform === 'win32') {
        // 서명자가 고정되지 않은 빌드(서명 없이 만든 설치본 등)는 내려받은 설치파일의 서명을 확인할 수 없다. 업데이트를 끈다.
        let configText = '';
        try {
            configText = readUpdateConfig();
        } catch {
            configText = '';
        }
        if (!hasPinnedPublisher(configText)) disabledReason = '서명 정보가 없는 설치본이라 자동 업데이트를 끕니다. 서명된 설치파일로 다시 설치해 주세요.';
    }
    const disabled = Boolean(disabledReason);
    const state = {
        phase: disabled ? 'disabled' : 'idle',
        currentVersion: app.getVersion(),
        availableVersion: '',
        percent: null,
        manualOnly,
        lastCheckedAt: '',
        message: disabledReason,
    };
    let updater = null;
    let checking = null;
    let installing = false;

    const send = () => {
        const window = getWindow();
        if (window && !window.isDestroyed()) window.webContents.send('jjss-update:status', publicState(state));
    };
    const setState = patch => {
        Object.assign(state, patch);
        send();
    };

    function ensureUpdater() {
        if (updater || disabled) return updater;
        updater = loadAutoUpdater();
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = !manualOnly;
        updater.allowPrerelease = false;
        updater.allowDowngrade = false;
        updater.fullChangelog = false;
        updater.logger = null;
        updater.on('update-available', info => setState({ phase: 'available', availableVersion: String(info?.version || ''), percent: null, message: '' }));
        updater.on('update-not-available', () => setState({ phase: 'up-to-date', availableVersion: '', percent: null, message: '' }));
        updater.on('download-progress', progress => setState({ phase: 'downloading', percent: Number(progress?.percent) || 0 }));
        updater.on('update-downloaded', info => setState({ phase: 'downloaded', availableVersion: String(info?.version || state.availableVersion), percent: 100, message: '' }));
        updater.on('error', error => {
            logMainError('update-error', error);
            // 자동 확인의 실패는 조용히 둔다(사용자가 누른 확인·내려받기에서만 안내).
            setState({ phase: state.phase === 'downloading' ? 'available' : 'error', percent: null, message: userMessageFor(error) });
        });
        return updater;
    }

    async function check({ userInitiated = false } = {}) {
        if (disabled) return publicState(state);
        if (checking) return checking;
        if (state.phase === 'downloading' || state.phase === 'downloaded' || installing) return publicState(state);
        checking = (async () => {
            setState({ phase: 'checking', message: '' });
            try {
                await ensureUpdater().checkForUpdates();
                state.lastCheckedAt = new Date().toISOString();
                if (state.phase === 'checking') setState({ phase: 'up-to-date' });
                else send();
            } catch (error) {
                logMainError('update-check-failed', error);
                state.lastCheckedAt = new Date().toISOString();
                setState({ phase: userInitiated ? 'error' : 'idle', message: userInitiated ? userMessageFor(error) : '' });
            } finally {
                checking = null;
            }
            return publicState(state);
        })();
        return checking;
    }

    async function download() {
        if (disabled || manualOnly) return publicState(state);
        if (state.phase !== 'available') return publicState(state);
        setState({ phase: 'downloading', percent: 0, message: '' });
        try {
            await ensureUpdater().downloadUpdate();
        } catch (error) {
            logMainError('update-download-failed', error);
            setState({ phase: 'available', percent: null, message: userMessageFor(error) });
        }
        return publicState(state);
    }

    async function install() {
        if (disabled || manualOnly || installing) return publicState(state);
        if (state.phase !== 'downloaded') return publicState(state);
        installing = true;
        try {
            const copy = await copyLocalDataForUpdate({ fs, path, userDataPath: app.getPath('userData'), version: state.currentVersion });
            logMainEvent('info', 'update-data-copied', { copied: Boolean(copy) });
        } catch (error) {
            logMainError('update-data-copy-failed', error);
        }
        setState({ phase: 'installing', message: '' });
        // 창 닫기 → 미저장 보호 확인 → 설치. 사용자가 닫기를 취소하면 다음에 앱을 끌 때 설치된다.
        ensureUpdater().quitAndInstall(false, true);
        installing = false;
        return publicState(state);
    }

    function openDownloadPage() {
        return shell.openExternal(RELEASES_PAGE_URL);
    }

    function register() {
        const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
            validateSender(event, expectedIndexPath);
            return fn(...args);
        });
        handle('jjss-update:get-status', async () => publicState(state));
        handle('jjss-update:check', async () => check({ userInitiated: true }));
        handle('jjss-update:download', async () => download());
        handle('jjss-update:install', async () => install());
        handle('jjss-update:open-download-page', async () => { await openDownloadPage(); return true; });
        if (disabled) return;
        setTimeoutFn(() => { void check(); }, FIRST_CHECK_DELAY_MS);
        setIntervalFn(() => { void check(); }, CHECK_INTERVAL_MS);
    }

    return { register, check, download, install, getState: () => publicState(state) };
}

module.exports = { createUpdateService, copyLocalDataForUpdate, hasPinnedPublisher, userMessageFor, RELEASES_PAGE_URL, REQUIRED_PUBLISHER, FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS };
