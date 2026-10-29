const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const { getAllowedExternalUrl } = require('./externalUrl.cjs');
const { cleanupStalePdfTempFiles, ensureJjssFolders, registerJjssFileIpc, validateSender } = require('./fileService.cjs');
const { registerDataKeyIpc } = require('./dataKey.cjs');
const { initMainLog, logMainError, logMainEvent, safeToken } = require('./mainLog.cjs');
const { createUpdateService, copyLocalDataForUpdate } = require('./updater.cjs');
const { createDriveService } = require('./googleDrive.cjs');

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
        if (canReload && mainWindow && !mainWindow.isDestroyed()) return mainWindow.loadFile(INDEX_PATH);
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

    // beforeunload가 막은 종료·새로고침은 명시적으로 버리기를 선택한 경우만 허용한다.
    window.webContents.on('will-prevent-unload', event => {
        try {
            const choice = dialog.showMessageBoxSync(window, {
                type: 'warning',
                title: '저장하지 않은 내용',
                message: '작성 중이거나 저장이 완료되지 않은 내용이 있습니다.',
                detail: '내용을 보관하려면 화면을 유지하고 저장을 완료해 주세요.\n변경사항을 버리고 나가면 마지막 입력이나 진행 중인 작업 결과가 사라질 수 있습니다.',
                buttons: ['계속 작성', '변경사항 버리고 나가기'],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
            });
            // Electron에서는 preventDefault가 beforeunload 차단을 무시하고 종료를 허용한다.
            if (choice === 1) event.preventDefault();
        } catch (error) {
            // 확인창 실패를 저장하지 않은 내용의 폐기 승인으로 취급하지 않는다.
            logMainError('unsaved-unload-dialog-failed', error);
        }
    });

    // 빌드된 Vite 정적 파일 로드
    window.loadFile(INDEX_PATH).catch(error => {
        if (!window.isDestroyed()) handleFatalError('main-window-load-failed', error);
    });

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
        // F11/새로고침 메뉴는 검사 단축키와 충돌하므로 제외한다.
        // macOS는 표준 편집 메뉴가 있어야 Cmd+C/V/Z 같은 기본 동작을 유지한다.
        Menu.setApplicationMenu(process.platform === 'darwin'
            ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
            : null);
        // 렌더러의 권한 요청(카메라·마이크·위치·알림 등)은 쓰지 않으므로 모두 거부한다. 복사 버튼의 클립보드 쓰기만 허용.
        const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);
        const defaultSession = session?.defaultSession;
        if (defaultSession) {
            defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
            defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission));
        }
        registerJjssFileIpc({ app, ipcMain, dialog, shell, BrowserWindow, expectedIndexPath: INDEX_PATH });
        registerDataKeyIpc({ app, ipcMain, safeStorage, expectedIndexPath: INDEX_PATH });
        // 공유 저장소(기관 공유 드라이브): 사용자가 설정에서 켜기 전에는 구글에 아무 요청도 하지 않는다.
        createDriveService({
            app, ipcMain, shell, safeStorage,
            fs: require('fs'), path, http: require('http'), crypto: require('crypto'),
            validateSender, expectedIndexPath: INDEX_PATH,
            logMainError,
            copyLocalData: copyLocalDataForUpdate,
        }).register();
        // 새 PDF 작업이 시작되기 전에 이전 실행의 임시 파일 정리를 끝낸다.
        await cleanupStalePdfTempFiles(app).catch(error => {
            logMainError('pdf-temp-cleanup-failed', error);
        });
        createWindow();
        ensureJjssFolders(app).catch(error => {
            logMainError('jjss-folder-preparation-failed', error);
        });
        // 자동 업데이트: 배포본에서만 동작. 알림 우선, 내려받기·설치는 사용자가 고른다.
        try {
            createUpdateService({
                app, ipcMain, shell,
                getWindow: () => mainWindow,
                validateSender, expectedIndexPath: INDEX_PATH,
                loadAutoUpdater: () => require('electron-updater').autoUpdater,
                execFile: require('child_process').execFile,
                platform: process.platform,
                env: process.env,
                fs: require('fs'),
                path,
                logMainEvent, logMainError,
            }).register();
        } catch (error) {
            logMainError('update-service-failed', error);
        }

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
