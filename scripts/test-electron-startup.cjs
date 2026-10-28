const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');

async function check(platform, loadFails, cleanupFails = false) {
    const sequence = [];
    const logged = [];
    let ready;
    let menu;
    let exits = 0;
    let dialogs = 0;
    let createdWindow;
    let unloadChoice = 0;
    let unloadDialog;
    const app = {
        requestSingleInstanceLock: () => true,
        on() {},
        whenReady: () => ({ then(callback) { ready = callback(); } }),
        isReady: () => true,
        exit: () => { exits++; },
        quit() {}, relaunch() {},
    };
    class Window {
        constructor() {
            sequence.push('window');
            createdWindow = this;
            this.handlers = {};
            this.webContents = { on: (name, fn) => { this.handlers[name] = fn; }, setWindowOpenHandler() {} };
        }
        loadFile() { return loadFails ? Promise.reject(new Error('synthetic load failure')) : Promise.resolve(); }
        once() {} on() {}
        isDestroyed() { return false; }
    }
    const electron = {
        app, BrowserWindow: Window,
        Menu: { setApplicationMenu(value) { menu = value; }, buildFromTemplate: value => value },
        dialog: { showMessageBoxSync(parent, options) {
            if (!options) { dialogs++; return 1; }
            assert.equal(parent, createdWindow);
            unloadDialog = options;
            if (unloadChoice === 'throw') throw new Error('synthetic dialog failure');
            return unloadChoice;
        } },
    };
    vm.runInNewContext(source, {
        __dirname: path.join(__dirname, '../electron'), URL,
        process: { platform, argv: [], uptime: () => 60, on() {} },
        require(name) {
            if (name === 'electron') return electron;
            if (name === 'path' || name === 'url') return require(name);
            if (name === './externalUrl.cjs') return { getAllowedExternalUrl: () => null };
            if (name === './fileService.cjs') return {
                registerJjssFileIpc() {}, ensureJjssFolders: async () => {}, validateSender() {},
                cleanupStalePdfTempFiles: async () => {
                    sequence.push('cleanup-start');
                    await Promise.resolve();
                    sequence.push('cleanup-end');
                    if (cleanupFails) throw new Error('synthetic cleanup failure');
                },
            };
            if (name === './dataKey.cjs') return { registerDataKeyIpc() {} };
            if (name === './updater.cjs') return { createUpdateService: () => ({ register() {} }) };
            if (name === './mainLog.cjs') return {
                initMainLog() {}, logMainEvent() {}, safeToken: value => value,
                logMainError: event => logged.push(event),
            };
            throw new Error('Unexpected dependency: ' + name);
        },
    });
    await ready;
    await Promise.resolve();
    assert.deepEqual(sequence, ['cleanup-start', 'cleanup-end', 'window']);
    if (platform === 'darwin') assert.equal(JSON.stringify(menu), JSON.stringify([{ role: 'appMenu' }, { role: 'editMenu' }]));
    else assert.equal(menu, null);
    assert.equal(dialogs, loadFails ? 1 : 0);
    assert.equal(exits, loadFails ? 1 : 0);
    if (loadFails) assert.ok(logged.includes('main-window-load-failed'));
    if (cleanupFails) assert.ok(logged.includes('pdf-temp-cleanup-failed'));
    if (!loadFails) {
        let allowed = 0;
        const event = { preventDefault() { allowed++; } };
        const preventUnload = createdWindow.handlers['will-prevent-unload'];
        assert.equal(typeof preventUnload, 'function');
        preventUnload(event);
        assert.equal(allowed, 0, 'stay/cancel must retain the renderer');
        assert.equal(unloadDialog.defaultId, 0);
        assert.equal(unloadDialog.cancelId, 0);
        unloadChoice = 1;
        preventUnload(event);
        assert.equal(allowed, 1, 'only explicit discard authorizes unload');
        unloadChoice = 'throw';
        preventUnload(event);
        assert.equal(allowed, 1, 'dialog failure must not authorize unload');
        assert.ok(logged.includes('unsaved-unload-dialog-failed'));
    }
}
(async () => {
    await check('darwin', false);
    await check('win32', false);
    await check('win32', true);
    await check('darwin', false, true);
    console.log('PASS Electron platform menus, startup ordering/errors and safe unload choices');
})().catch(error => { console.error(error); process.exitCode = 1; });
