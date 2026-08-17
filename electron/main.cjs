const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { getAllowedExternalUrl } = require('./externalUrl.cjs');
const { ensureJjssFolders, registerJjssFileIpc } = require('./fileService.cjs');

function safeErrorToken(value, fallback) {
    return typeof value === 'string' && /^[a-z0-9._-]{1,80}$/i.test(value) ? value : fallback;
}

// 하드웨어 가속 관련 이슈(화면 튕김, 깜빡임) 발생 시 비활성화
// 실제 배포 시 성능 문제가 있다면 다시 켤 수 있음
// app.disableHardwareAcceleration();

// 예기치 않은 에러 처리
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', {
        name: safeErrorToken(error?.name, 'Error'),
        code: safeErrorToken(error?.code, 'UNKNOWN'),
    });
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: '직업재활업무시스템(JJSS)',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        autoHideMenuBar: true,
        show: false,
    });

    // 빌드된 Vite 정적 파일 로드
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);

    // 준비되면 표시 (깜빡임 방지)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();
    });

    mainWindow.on('focus', () => {
        mainWindow.webContents.focus();
    });

    // 외부 링크는 기본 브라우저에서 열기
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const externalUrl = getAllowedExternalUrl(url);
        if (externalUrl) {
            shell.openExternal(externalUrl).catch(error => {
                console.error('Approved external URL open failed:', { code: safeErrorToken(error?.code, 'UNKNOWN') });
            });
        } else {
            console.warn('Blocked external URL with an unsupported or invalid protocol.');
        }
        return { action: 'deny' };
    });
}

app.whenReady().then(async () => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    registerJjssFileIpc({ app, ipcMain, dialog, shell, BrowserWindow, expectedIndexPath: indexPath });
    createWindow();
    ensureJjssFolders(app).catch(error => {
        console.error('JJSS document folder preparation failed:', { code: safeErrorToken(error?.code, 'UNKNOWN') });
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
