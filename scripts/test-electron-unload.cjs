// Real Electron + built UI; isolated synthetic profile, no documents-folder setup or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const mainPath = path.resolve(__dirname, '../electron/main.cjs');

function isTestDirectory(directory) {
    return path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir())
        && path.basename(directory).startsWith('jjss-unload-test-');
}

if (process.env.JJSS_UNLOAD_TEST_CHILD === '1') {
    const electron = require('electron');
    const directory = process.env.JJSS_UNLOAD_TEST_DIRECTORY;
    if (!directory || !isTestDirectory(directory)) throw new Error('Invalid isolated test directory');
    electron.app.setPath('userData', directory);
    electron.app.setName('JJSS isolated unload test');
    electron.app.__unloadChoice = 0;
    electron.app.__unloadDialogs = [];
    electron.dialog.showMessageBoxSync = (_parent, options) => {
        if (!options || options.title !== '저장하지 않은 내용') throw new Error('Unexpected native dialog');
        electron.app.__unloadDialogs.push({ defaultId: options.defaultId, cancelId: options.cancelId });
        return electron.app.__unloadChoice;
    };
    // Keep the test window hidden; DOM/renderer and real close/reload events still run.
    electron.BrowserWindow.prototype.show = function () {};
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function (request, parent, ...rest) {
        if (request === './fileService.cjs' && parent?.filename === mainPath) return {
            registerJjssFileIpc() {}, ensureJjssFolders: async () => {}, cleanupStalePdfTempFiles: async () => {},
        };
        return originalLoad.call(this, request, parent, ...rest);
    };
    electron.app.whenReady().then(() => {
        electron.session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            callback({ cancel: !/^(file:|data:|blob:|devtools:)/.test(details.url) });
        });
    });
    require(mainPath);
} else {
    const { _electron } = require('playwright');
    async function main() {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jjss-unload-test-'));
        const env = { ...process.env, JJSS_UNLOAD_TEST_CHILD: '1', JJSS_UNLOAD_TEST_DIRECTORY: directory };
        delete env.ELECTRON_RUN_AS_NODE;
        let application;
        try {
            application = await _electron.launch({ executablePath: require('electron'), args: [__filename], env, timeout: 15000 });
            const page = await application.firstWindow();
            // Electron main handles unload synchronously; do not let Playwright auto-answer a CDP browser prompt.
            page.on('dialog', () => {});
            await page.evaluate(() => { localStorage.setItem('jjss:api-key-onboarding-v1', 'later'); location.hash = '/infomate'; });
            await page.getByRole('button', { name: '새 리소스 추가' }).click();
            await page.getByLabel('제목', { exact: true }).fill('합성 Electron 종료 검증');
            const waitForDialog = count => application.evaluate(({ app }, expected) => new Promise((resolve, reject) => {
                const deadline = Date.now() + 4000;
                const check = () => {
                    if (app.__unloadDialogs.length >= expected) return resolve(app.__unloadDialogs.length);
                    if (Date.now() > deadline) return reject(new Error('Native unload guard did not run'));
                    setTimeout(check, 20);
                };
                check();
            }), count);
            await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
            await waitForDialog(1);
            assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
            assert.equal(await page.getByLabel('제목', { exact: true }).inputValue(), '합성 Electron 종료 검증');
            await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.reload(); });
            await waitForDialog(2);
            assert.equal(await page.getByLabel('제목', { exact: true }).inputValue(), '합성 Electron 종료 검증');
            console.log('PASS real Electron close/reload cancellation retains the built UI and draft');

            await page.getByRole('button', { name: '자료 편집 창 닫기' }).click();
            await page.getByRole('alertdialog').getByRole('button', { name: '닫기', exact: true }).click();
            await page.getByRole('dialog').waitFor({ state: 'hidden' });
            await page.evaluate(() => { window.unloadTestMarker = 'old'; });
            await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.reload(); });
            await page.waitForFunction(() => window.unloadTestMarker === undefined);
            await page.getByRole('button', { name: '새 리소스 추가' }).waitFor();
            assert.equal(await application.evaluate(({ app }) => app.__unloadDialogs.length), 2);
            await page.getByRole('button', { name: '새 리소스 추가' }).click();
            await page.getByLabel('제목', { exact: true }).fill('합성 명시적 폐기 검증');
            const options = await application.evaluate(({ app }) => app.__unloadDialogs);
            assert.ok(options.every(item => item.defaultId === 0 && item.cancelId === 0));
            await application.evaluate(({ app }) => { app.__unloadChoice = 1; });
            const closed = application.waitForEvent('close', { timeout: 10000 });
            await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); }).catch(() => undefined);
            await closed;
            console.log('PASS real Electron clean reload has no prompt; explicit discard permits close');
        } finally {
            if (application) {
                await application.evaluate(({ app }) => { app.__unloadChoice = 1; }).catch(() => undefined);
                await application.close().catch(() => undefined);
            }
            // Only delete the exact temporary directory created by this test.
            assert.ok(isTestDirectory(directory));
            await fs.rm(directory, { recursive: true, force: true });
        }
    }
    main().catch(error => { console.error(error); process.exitCode = 1; });
}
