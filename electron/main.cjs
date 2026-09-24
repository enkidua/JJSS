const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const { getAllowedExternalUrl } = require('./externalUrl.cjs');
const { cleanupStalePdfTempFiles, ensureJjssFolders, registerJjssFileIpc } = require('./fileService.cjs');
const { registerDataKeyIpc } = require('./dataKey.cjs');
const { initMainLog, logMainError, logMainEvent, safeToken } = require('./mainLog.cjs');

const INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const CRASH_RELAUNCH_ARG = '--jjss-crash-relaunch';
const MIN_UPTIME_BEFORE_AUTO_RELAUNCH_MS = 30_000;
const RENDERER_CRASH_WINDOW_MS = 60_000;
const MAX_RENDERER_RELOADS_PER_WINDOW = 2;

let mainWindow = null;
let handlingFatalError = false;
const rendererCrashTimes = [];

// 하드웨어 가속 관련 이슈(화면 튕김, 깜빡임) 발생 시 비활성화
// 실제 배포 시 성능 문제가 있다면 다시 켤 수 있음
// app.disableHardwareAcceleration();

initMainLog(app);

// 예기치 않은 오류: 기록(개인정보 제외) → 안내창 → 다시 시작
function handleFatalError(event, error) {
    logMainError(event, error);
    if (handlingFatalError) return;
    handlingFatalError = true;
    const relaunchedRecently = process.argv.includes(CRASH_RELAUNCH_ARG)
        && process.uptime() * 1000 < MIN_UPTIME_BEFORE_AUTO_RELAUNCH_MS;
    try {
        if (!app.isReady() || relaunchedRecently) {
            dialog.showErrorBox(
                'JJSS 오류',
                relaunchedRecently
                    ? '다시 시작한 뒤에도 같은 오류가 발생해 JJSS를 종료합니다.\n컴퓨터를 다시 시작한 뒤 JJSS를 실행해 주세요. 문제가 계속되면 개발자에게 알려 주세요.'
                    : '예기치 않은 오류로 JJSS를 종료합니다.\nJJSS를 다시 실행해 주세요.',
            );
        } else {
            const response = dialog.showMessageBoxSync({
                type: 'error',
                title: 'JJSS 오류',
                message: '예기치 않은 오류가 발생해 JJSS를 다시 시작합니다.',
                detail: '저장하지 않은 입력 내용은 사라질 수 있습니다.\n같은 문제가 반복되면 개발자에게 알려 주세요.',
                buttons: ['다시 시작', '종료'],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
            });
            if (response === 0) {
                const args = process.argv.slice(1).filter(arg => arg !== CRASH_RELAUNCH_ARG);
                app.relaunch({ args: [...args, CRASH_RELAUNCH_ARG] });
            }
        }
    } catch (dialogError) {
        logMainError('fatal-dialog-failed', dialogError);
    }
    app.exit(1);
}

process.on('uncaughtException', error => {
    // 콘솔 출력 통로가 닫혀 생기는 오류는 기록만 하고 계속 실행한다.
    if (error?.code === 'EPIPE') {
        logMainError('uncaughtException-ignored', error);
        return;
    }
    handleFatalError('uncaughtException', error);
});

process.on('unhandledRejection', reason => {
    logMainError('unhandledRejection', reason);
});

function isAppIndexUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'file:' && path.resolve(fileURLToPath(parsed)) === path.resolve(INDEX_PATH);
    } catch {
        return false;
    }
}

function openExternalIfAllowed(rawUrl) {
    const externalUrl = getAllowedExternalUrl(rawUrl);
    if (!externalUrl) {
        logMainEvent('warn', 'blocked-external-url');
        return;
    }
    shell.openExternal(externalUrl).catch(error => {
        logMainError('external-url-open-failed', error);
    });
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
}

function handleRendererGone(details) {
    logMainEvent('error', 'render-process-gone', {
        reason: safeToken(details?.reason, 'unknown'),
        exitCode: Number.isInteger(details?.exitCode) ? details.exitCode : undefined,
    });
    if (!mainWindow || mainWindow.isDestroyed() || details?.reason === 'clean-exit') return;
    const now = Date.now();
    while (rendererCrashTimes.length && now - rendererCrashTimes[0] > RENDERER_CRASH_WINDOW_MS) rendererCrashTimes.shift();
    rendererCrashTimes.push(now);
    const canReload = rendererCrashTimes.length <= MAX_RENDERER_RELOADS_PER_WINDOW;
    void dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'JJSS 화면 오류',
        message: canReload ? '화면에 오류가 생겨 다시 불러옵니다.' : '화면 오류가 반복되고 있습니다.',
        detail: canReload
            ? '저장하지 않은 입력 내용은 사라질 수 있습니다.'
            : 'JJSS를 종료한 뒤 다시 실행해 주세요. 문제가 계속되면 컴퓨터를 다시 시작해 주세요.',
        buttons: ['확인'],
        noLink: true,
    }).then(() => {
        if (canReload && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadFile(INDEX_PATH);
    }).catch(error => logMainError('renderer-crash-dialog-failed', error));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: '직업재활업무시스템(JJSS)',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        autoHideMenuBar: true,
        show: false,
    });
    const window = mainWindow;

    // 빌드된 Vite 정적 파일 로드
    window.loadFile(INDEX_PATH);

    // 준비되면 표시 (깜빡임 방지)
    window.once('ready-to-show', () => {
        window.show();
        window.focus();
        window.webContents.focus();
    });

    window.on('focus', () => {
        window.webContents.focus();
    });

    window.on('closed', () => {
        if (mainWindow === window) mainWindow = null;
    });

    // 새 창 요청(target="_blank" 등)은 허용된 외부 주소만 기본 브라우저로 연다.
    window.webContents.setWindowOpenHandler(({ url }) => {
        openExternalIfAllowed(url);
        return { action: 'deny' };
    });

    // 앱 화면(index.html) 밖으로의 이동은 모두 막고, 허용된 외부 주소(https·mailto)만 기본 프로그램으로 연다.
    window.webContents.on('will-navigate', (event, url) => {
        if (isAppIndexUrl(url)) return;
        event.preventDefault();
        openExternalIfAllowed(url);
    });

    window.webContents.on('render-process-gone', (_event, details) => handleRendererGone(details));
}

// 두 번 실행하면 같은 IndexedDB를 두 프로세스가 동시에 쓰게 되므로 하나만 실행한다.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        focusMainWindow();
    });

    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', event => event.preventDefault());
    });

    app.whenReady().then(async () => {
        registerJjssFileIpc({ app, ipcMain, dialog, shell, BrowserWindow, expectedIndexPath: INDEX_PATH });
        registerDataKeyIpc({ app, ipcMain, safeStorage, expectedIndexPath: INDEX_PATH });
        createWindow();
        ensureJjssFolders(app).catch(error => {
            logMainError('jjss-folder-preparation-failed', error);
        });
        cleanupStalePdfTempFiles(app).catch(error => {
            logMainError('pdf-temp-cleanup-failed', error);
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
