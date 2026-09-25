const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
// 실제 D:\ 드라이브나 사용자 문서 폴더를 건드리지 않도록 root 결정 규칙은 rootOptions로 주입한다
// (process.platform을 위장하지 않는다). 모든 파일은 임시 폴더 안에서만 만든다.
const {
    ROOT_UNAVAILABLE_CODE,
    classifyLegacyFileName,
    chooseSavePath,
    cleanupStalePdfTempFiles,
    ensureJjssFolders,
    getJjssPaths,
    hasPdfSignature,
    hasPngSignature,
    importCandidates,
    isPathInside,
    registerJjssFileIpc,
    resolveJjssRoot,
    scanLegacyFolder,
    saveBuffer,
    savePdf,
    toFileWriteError,
    validateFileName,
} = require('../electron/fileService.cjs');
const { DATA_KEY_FILE_NAME, getDataKey } = require('../electron/dataKey.cjs');

function createMockApp(tempRoot, userDataName = 'userData', documentsName = 'Documents') {
    const documents = path.join(tempRoot, documentsName);
    return {
        isPackaged: true,
        documents,
        getPath: name => {
            if (name === 'documents') return documents;
            if (name === 'userData') return path.join(tempRoot, userDataName);
            return path.join(tempRoot, name);
        },
    };
}

async function readPreferences(app) {
    return JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'file-save-preferences.json'), 'utf8'));
}

function createMockSafeStorage({ available = true } = {}) {
    return {
        isEncryptionAvailable: () => available,
        encryptString: value => Buffer.from(`enc:${Buffer.from(value, 'utf8').toString('hex')}`, 'utf8'),
        decryptString: buffer => {
            const text = Buffer.from(buffer).toString('utf8');
            if (!text.startsWith('enc:')) throw new Error('decrypt-failed');
            return Buffer.from(text.slice(4), 'hex').toString('utf8');
        },
    };
}

async function main() {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jjss-file-service-'));
    const mockApp = createMockApp(tempRoot);
    const documents = mockApp.documents;
    const rootOptions = { platform: 'win32', preferredDrive: path.join(tempRoot, 'missing-drive') };
    const oldFolder = path.join(tempRoot, 'Downloads', 'JJSS-old-test');
    const fixtureNames = [
        '직업재활계획서_2026-01-01.docx',
        '직업재활계획서_2026-01-01.png',
        '직업평가_종합보고서_20260101.docx',
        'jjss-budget-expenses-2026-01-01.csv',
        'JJSS_backup_2026-01-01.json',
        '회의록.txt',
        'result_test.txt',
        '일반사진.jpg',
        '개인문서.docx',
    ];
    try {
        await fs.mkdir(oldFolder, { recursive: true });
        await Promise.all(fixtureNames.map((name, index) => fs.writeFile(path.join(oldFolder, name), `synthetic-${index}`)));
        const nestedFolder = path.join(oldFolder, 'archive', '2025');
        await fs.mkdir(nestedFolder, { recursive: true });
        await fs.writeFile(path.join(nestedFolder, '직업재활계획서_2025-12-31.pdf'), 'synthetic-nested-plan');
        await fs.writeFile(path.join(nestedFolder, '회의록_하위폴더.docx'), 'synthetic-nested-minutes');
        let tooDeep = oldFolder;
        for (let depth = 1; depth <= 6; depth += 1) tooDeep = path.join(tooDeep, `depth-${depth}`);
        await fs.mkdir(tooDeep, { recursive: true });
        await fs.writeFile(path.join(tooDeep, 'JJSS-too-deep.txt'), 'synthetic-too-deep');
        const outsideFolder = path.join(tempRoot, 'outside-link-target');
        await fs.mkdir(outsideFolder, { recursive: true });
        await fs.writeFile(path.join(outsideFolder, 'JJSS-linked.txt'), 'synthetic-linked');
        let junctionCreated = false;
        try {
            await fs.symlink(outsideFolder, path.join(oldFolder, 'linked-folder'), process.platform === 'win32' ? 'junction' : 'dir');
            junctionCreated = true;
        } catch (error) {
            if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
        }

        assert.equal(classifyLegacyFileName('직업재활계획서_2026-01-01.docx'), 'rehab-plan');
        assert.equal(classifyLegacyFileName('일반사진.jpg'), null);
        assert.equal(classifyLegacyFileName('개인문서.docx'), null);
        assert.throws(() => validateFileName('backup', '../backup.json'));
        assert.throws(() => validateFileName('backup', 'backup.exe'));
        assert.equal(hasPngSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true);
        assert.equal(hasPngSignature(Buffer.from('not-png')), false);
        assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\nsynthetic')), true);
        assert.equal(hasPdfSignature(Buffer.from('not-pdf')), false);

        // Windows 경로는 대소문자를 구분하지 않고, 다른 OS는 구분한다(호스트와 무관하게 검사).
        assert.equal(isPathInside('C:\\Users\\Tester\\Documents\\JJSS', 'c:\\users\\tester\\documents\\jjss\\문서\\a.pdf', 'win32'), true);
        assert.equal(isPathInside('C:\\JJSS', 'C:\\JJSS2\\a.pdf', 'win32'), false);
        assert.equal(isPathInside('C:\\JJSS', 'c:\\jjss', 'win32'), false);
        assert.equal(isPathInside('C:\\JJSS', 'C:\\JJSS\\..\\Other', 'win32'), false);
        assert.equal(isPathInside('/home/tester/JJSS', '/home/tester/jjss/a.pdf', 'linux'), false);
        assert.equal(isPathInside('/home/tester/JJSS', '/home/tester/JJSS/a.pdf', 'linux'), true);

        assert.match(toFileWriteError({ code: 'EBUSY' }).message, /한글\/Word 등 다른 프로그램에서 열려 있습니다/);
        assert.match(toFileWriteError({ code: 'ENOSPC' }).message, /저장 공간이 부족합니다/);
        assert.match(toFileWriteError({ code: 'EPERM' }).message, /권한이 없습니다/);

        const rootOnlyScan = await scanLegacyFolder(oldFolder, false);
        assert.equal(rootOnlyScan.candidates.length, 7);
        const scan = await scanLegacyFolder(oldFolder, true);
        const candidates = scan.candidates;
        assert.equal(candidates.length, 9);
        assert.equal(scan.truncated, false);
        assert.equal(scan.skippedDirectories, 0);
        assert.ok(candidates.some(candidate => candidate.relativePath === path.join('archive', '2025', '직업재활계획서_2025-12-31.pdf')));
        assert.equal(candidates.some(candidate => candidate.name === 'JJSS-too-deep.txt'), false);
        if (junctionCreated) assert.equal(candidates.some(candidate => candidate.name === 'JJSS-linked.txt'), false);
        await assert.rejects(scanLegacyFolder(path.join(tempRoot, 'no-such-folder')), /선택한 폴더를 읽을 수 없습니다/);

        const firstCopy = await importCandidates({ app: mockApp, candidates, mode: 'copy', rootOptions });
        assert.equal(firstCopy.length, 9);
        assert.ok(firstCopy.every(result => result.sourceDeleted === false && !result.failed));
        await fs.access(path.join(oldFolder, '일반사진.jpg'));
        await fs.access(path.join(oldFolder, '개인문서.docx'));

        const secondCopy = await importCandidates({ app: mockApp, candidates: candidates.slice(0, 1), mode: 'copy', rootOptions });
        assert.match(secondCopy[0].savedName, / \(1\)\.[a-z0-9]+$/i);

        // 파일 하나가 사라져도 나머지는 계속 가져오고, 실패 사유를 돌려준다.
        const partialFolder = path.join(tempRoot, 'Downloads', 'JJSS-partial-test');
        await fs.mkdir(partialFolder, { recursive: true });
        await fs.writeFile(path.join(partialFolder, '회의록_부분1.txt'), 'synthetic-partial-1');
        await fs.writeFile(path.join(partialFolder, '회의록_부분2.txt'), 'synthetic-partial-2');
        const partialCandidates = (await scanLegacyFolder(partialFolder)).candidates;
        await fs.rm(path.join(partialFolder, '회의록_부분1.txt'));
        const partialResults = await importCandidates({ app: mockApp, candidates: partialCandidates, mode: 'copy', rootOptions });
        assert.equal(partialResults.length, 2);
        assert.equal(partialResults.filter(result => result.failed).length, 1);
        assert.match(partialResults.find(result => result.failed).reason, /원본 파일을 찾을 수 없습니다/);
        assert.equal(partialResults.filter(result => !result.failed).length, 1);

        const moveFolder = path.join(tempRoot, 'Downloads', 'JJSS-move-test');
        await fs.mkdir(moveFolder, { recursive: true });
        await fs.writeFile(path.join(moveFolder, '회의록_이동검증.txt'), 'synthetic-move');
        const moveCandidates = (await scanLegacyFolder(moveFolder)).candidates;
        const moved = await importCandidates({ app: mockApp, candidates: moveCandidates, mode: 'move', rootOptions });
        assert.equal(moved.length, 1);
        assert.equal(moved[0].sourceDeleted, true);
        await assert.rejects(fs.access(path.join(moveFolder, '회의록_이동검증.txt')));

        // 기본 root는 문서\JJSS이고 설정 파일에 저장된다.
        const jjssPaths = getJjssPaths(mockApp);
        assert.equal(await resolveJjssRoot(mockApp, rootOptions), path.join(documents, 'JJSS'));
        assert.equal((await readPreferences(mockApp)).jjssRoot, path.join(documents, 'JJSS'));

        const externalFolder = path.join(tempRoot, 'OneDrive 한글 폴더');
        const externalPath = path.join(externalFolder, '계획서 1.pdf');
        let saveDialogCalls = 0;
        const externalResult = await chooseSavePath({
            app: mockApp,
            rootOptions,
            category: 'rehab-plan',
            fileName: '직업재활계획서_2026-01-01.pdf',
            dialog: {
                showSaveDialog: async () => {
                    saveDialogCalls += 1;
                    return { canceled: false, filePath: externalPath };
                },
            },
        });
        assert.equal(externalResult.canceled, false);
        assert.equal(externalResult.filePath, path.resolve(externalPath));
        assert.equal(saveDialogCalls, 1);
        await fs.access(externalFolder);
        const preferences = await readPreferences(mockApp);
        assert.equal(preferences.lastSaveDirectories['rehab-plan'], path.resolve(externalFolder));
        assert.equal(preferences.jjssRoot, path.join(documents, 'JJSS'));
        let rememberedDefaultPath = '';
        const cancelResult = await chooseSavePath({
            app: mockApp,
            rootOptions,
            category: 'rehab-plan',
            fileName: '직업재활계획서_2026-01-01.pdf',
            dialog: {
                showSaveDialog: async (_window, options) => {
                    rememberedDefaultPath = options.defaultPath;
                    return { canceled: true };
                },
            },
        });
        assert.equal(cancelResult.canceled, true);
        assert.equal(path.dirname(rememberedDefaultPath), path.resolve(externalFolder));
        const pngPath = path.join(externalFolder, '한글 이미지.png');
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
        const savedPng = await saveBuffer({
            app: mockApp,
            rootOptions,
            category: 'rehab-plan',
            fileName: '한글 이미지.png',
            data: pngBytes,
            dialog: { showSaveDialog: async () => ({ canceled: false, filePath: pngPath }) },
        });
        assert.equal(savedPng.filePath, path.resolve(pngPath));
        assert.match(savedPng.openToken, /^[0-9a-f-]{36}$/i);
        assert.deepEqual(await fs.readFile(pngPath), pngBytes);

        // PDF: 임시 HTML 파일을 loadFile로 불러오고, 인쇄 창은 JavaScript·이동을 막으며, 임시 파일은 지운다.
        const pdfPath = path.join(externalFolder, '한글 문서.pdf');
        const pdfBytes = Buffer.from('%PDF-1.7\nsynthetic-pdf');
        const printHtml = `<!doctype html><html><body>${'긴 한글 문서 '.repeat(200_000)}</body></html>`;
        const printWindows = [];
        class MockBrowserWindow {
            constructor(options) {
                this.options = options;
                this.listeners = {};
                this.loadedFile = '';
                this.loadedContent = '';
                this.destroyed = false;
                this.webContents = {
                    on: (eventName, listener) => { this.listeners[eventName] = listener; },
                    setWindowOpenHandler: handler => { this.windowOpenHandler = handler; },
                    printToPDF: async () => pdfBytes,
                };
                printWindows.push(this);
            }
            async loadURL() { throw new Error('PDF must not be loaded through a data: URL'); }
            async loadFile(filePath) {
                this.loadedFile = filePath;
                this.loadedContent = await fs.readFile(filePath, 'utf8');
            }
            isDestroyed() { return this.destroyed; }
            destroy() { this.destroyed = true; }
        }
        const savedPdf = await savePdf({
            app: mockApp,
            rootOptions,
            BrowserWindow: MockBrowserWindow,
            category: 'rehab-plan',
            fileName: '한글 문서.pdf',
            html: printHtml,
            dialog: { showSaveDialog: async () => ({ canceled: false, filePath: pdfPath }) },
        });
        assert.equal(savedPdf.filePath, path.resolve(pdfPath));
        assert.match(savedPdf.openToken, /^[0-9a-f-]{36}$/i);
        assert.deepEqual(await fs.readFile(pdfPath), pdfBytes);
        assert.equal(printWindows.length, 1);
        const [printWindow] = printWindows;
        assert.equal(printWindow.options.webPreferences.javascript, false);
        assert.equal(printWindow.options.webPreferences.sandbox, true);
        assert.equal(printWindow.loadedContent, printHtml);
        assert.equal(printWindow.destroyed, true);
        await assert.rejects(fs.access(printWindow.loadedFile));
        let navigationBlocked = false;
        printWindow.listeners['will-navigate']({ preventDefault: () => { navigationBlocked = true; } });
        assert.equal(navigationBlocked, true);
        assert.deepEqual(printWindow.windowOpenHandler({ url: 'https://example.com' }), { action: 'deny' });

        // 나이를 지정하면 그보다 오래된 PDF 임시 폴더만 정리한다.
        const staleTemp = path.join(mockApp.getPath('temp'), 'jjss-pdf-Stale1');
        const freshTemp = path.join(mockApp.getPath('temp'), 'jjss-pdf-Fresh1');
        const otherTemp = path.join(mockApp.getPath('temp'), 'other-program-tmp');
        await fs.mkdir(staleTemp, { recursive: true });
        await fs.mkdir(freshTemp, { recursive: true });
        await fs.mkdir(otherTemp, { recursive: true });
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await fs.utimes(staleTemp, twoHoursAgo, twoHoursAgo);
        assert.equal(await cleanupStalePdfTempFiles(mockApp, 60 * 60 * 1000), 1);
        await assert.rejects(fs.access(staleTemp));
        await fs.access(freshTemp);

        // 앱 시작 시(기본값)에는 남아 있는 JJSS PDF 임시 폴더를 나이와 상관없이 모두 지운다.
        // 개인정보가 담긴 임시 HTML을 필요 이상으로 오래 두지 않기 위해서다.
        assert.equal(await cleanupStalePdfTempFiles(mockApp), 1);
        await assert.rejects(fs.access(freshTemp));
        // 다른 프로그램의 임시 폴더는 건드리지 않는다.
        await fs.access(otherTemp);
        await fs.rm(otherTemp, { recursive: true, force: true });

        await fs.rm(externalFolder, { recursive: true, force: true });
        let missingFolderFallback = '';
        await chooseSavePath({
            app: mockApp,
            rootOptions,
            category: 'rehab-plan',
            fileName: 'fallback.pdf',
            dialog: {
                showSaveDialog: async (_window, options) => {
                    missingFolderFallback = options.defaultPath;
                    return { canceled: true };
                },
            },
        });
        assert.equal(path.dirname(missingFolderFallback), path.resolve(jjssPaths.categories['rehab-plan']));
        await fs.access(path.join(jjssPaths.categories['rehab-plan'], '직업재활계획서_2026-01-01.docx'));
        await fs.access(path.join(jjssPaths.categories.backup, 'JJSS_backup_2026-01-01.json'));

        // 가져오기 IPC: 실패한 파일만 같은 token으로 다시 시도할 수 있고, 이미 가져온 파일은 중복 생성하지 않는다.
        const ipcApp = createMockApp(tempRoot, 'userData-ipc', 'Documents-ipc');
        const expectedIndexPath = path.join(tempRoot, 'app', 'dist', 'index.html');
        const handlers = {};
        const retryFolder = path.join(tempRoot, 'Downloads', 'JJSS-retry-test');
        await fs.mkdir(retryFolder, { recursive: true });
        await fs.writeFile(path.join(retryFolder, '회의록_재시도1.txt'), 'synthetic-retry-1');
        await fs.writeFile(path.join(retryFolder, '회의록_재시도2.txt'), 'synthetic-retry-2');
        registerJjssFileIpc({
            app: ipcApp,
            ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } },
            dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [retryFolder] }) },
            shell: {},
            BrowserWindow: { fromWebContents: () => null },
            expectedIndexPath,
            rootOptions,
        });
        const trustedFrame = { url: pathToFileURL(expectedIndexPath).toString() };
        const trustedEvent = { senderFrame: trustedFrame, sender: { mainFrame: trustedFrame } };
        const untrustedFrame = { url: 'https://example.com/' };
        await assert.rejects(
            handlers['jjss-files:get-paths']({ senderFrame: untrustedFrame, sender: { mainFrame: untrustedFrame } }),
            /허용되지 않은 파일 요청 출처/,
        );
        const preview = await handlers['jjss-files:choose-import-folder'](trustedEvent, { includeSubfolders: true });
        assert.equal(preview.total, 2);
        assert.equal(preview.truncated, false);
        const hiddenPath = path.join(tempRoot, 'retry-hidden.txt');
        await fs.rename(path.join(retryFolder, '회의록_재시도1.txt'), hiddenPath);
        const firstAttempt = await handlers['jjss-files:import-legacy-documents'](trustedEvent, { token: preview.token, mode: 'copy' });
        assert.equal(firstAttempt.imported, 1);
        assert.equal(firstAttempt.failed, 1);
        assert.equal(firstAttempt.retryAvailable, true);
        await fs.rename(hiddenPath, path.join(retryFolder, '회의록_재시도1.txt'));
        const secondAttempt = await handlers['jjss-files:import-legacy-documents'](trustedEvent, { token: preview.token, mode: 'copy' });
        assert.equal(secondAttempt.imported, 2);
        assert.equal(secondAttempt.failed, 0);
        const ipcMinutes = await fs.readdir(getJjssPaths(ipcApp).categories.minutes);
        assert.deepEqual(ipcMinutes.sort(), ['회의록_재시도1.txt', '회의록_재시도2.txt']);
        await assert.rejects(
            handlers['jjss-files:import-legacy-documents'](trustedEvent, { token: preview.token, mode: 'copy' }),
            /가져오기 미리보기가 만료되었습니다/,
        );

        // 기존 사용자 이관: 설정이 없고 D:\JJSS 안에 실제 파일이 있을 때만 D:\JJSS를 유지한다.
        const emptyDrive = path.join(tempRoot, 'D-empty');
        await fs.mkdir(path.join(emptyDrive, 'JJSS', '문서', '직업재활계획서'), { recursive: true });
        await fs.writeFile(path.join(emptyDrive, 'JJSS', 'desktop.ini'), 'synthetic-system-file');
        const emptyDriveApp = createMockApp(tempRoot, 'userData-empty-drive');
        assert.equal(
            await resolveJjssRoot(emptyDriveApp, { platform: 'win32', preferredDrive: emptyDrive }),
            path.join(documents, 'JJSS'),
        );

        const legacyDrive = path.join(tempRoot, 'D-legacy');
        const legacyRoot = path.join(legacyDrive, 'JJSS');
        await fs.mkdir(path.join(legacyRoot, '문서', '직업재활계획서'), { recursive: true });
        await fs.writeFile(path.join(legacyRoot, '문서', '직업재활계획서', '직업재활계획서_기존.docx'), 'synthetic-legacy');
        const legacyApp = createMockApp(tempRoot, 'userData-legacy');
        const legacyOptions = { platform: 'win32', preferredDrive: legacyDrive };
        assert.equal(await resolveJjssRoot(legacyApp, legacyOptions), legacyRoot);
        assert.equal((await readPreferences(legacyApp)).jjssRoot, legacyRoot);
        const nonWindowsApp = createMockApp(tempRoot, 'userData-non-windows');
        assert.equal(await resolveJjssRoot(nonWindowsApp, { platform: 'linux', preferredDrive: legacyDrive }), path.join(documents, 'JJSS'));
        // 저장된 root는 다음 실행에서도 그대로(파일이 비어도 다시 계산하지 않음).
        await fs.rm(path.join(legacyRoot, '문서', '직업재활계획서', '직업재활계획서_기존.docx'));
        await resolveJjssRoot(mockApp, rootOptions);
        assert.equal(await resolveJjssRoot(legacyApp, legacyOptions), legacyRoot);

        // 저장된 root에 접근할 수 없으면 조용히 바꾸지 않고 한국어 안내 오류를 낸다.
        const blockedParent = path.join(tempRoot, 'blocked-volume-file');
        await fs.writeFile(blockedParent, 'synthetic-file-blocking-directory');
        const unreachableRoot = path.join(blockedParent, 'JJSS');
        const unreachableApp = createMockApp(tempRoot, 'userData-unreachable');
        await fs.mkdir(unreachableApp.getPath('userData'), { recursive: true });
        await fs.writeFile(
            path.join(unreachableApp.getPath('userData'), 'file-save-preferences.json'),
            JSON.stringify({ version: 2, jjssRoot: unreachableRoot, lastSaveDirectories: {} }),
        );
        await assert.rejects(ensureJjssFolders(unreachableApp, rootOptions), error => {
            assert.equal(error.code, ROOT_UNAVAILABLE_CODE);
            assert.ok(error.message.includes(`저장 위치(${unreachableRoot})를 찾을 수 없습니다`));
            assert.match(error.message, /USB\/드라이브 연결을 확인하세요/);
            return true;
        });
        assert.equal((await readPreferences(unreachableApp)).jjssRoot, unreachableRoot);
        let saveDialogAfterCancel = false;
        const canceledRecovery = await chooseSavePath({
            app: unreachableApp,
            rootOptions,
            category: 'minutes',
            fileName: '회의록_복구.txt',
            dialog: {
                showMessageBox: async () => ({ response: 2 }),
                showSaveDialog: async () => { saveDialogAfterCancel = true; return { canceled: true }; },
            },
        });
        assert.equal(canceledRecovery.canceled, true);
        assert.equal(saveDialogAfterCancel, false);
        assert.equal((await readPreferences(unreachableApp)).jjssRoot, unreachableRoot);
        let recoveredDefaultPath = '';
        let recoveryPrompt = null;
        await chooseSavePath({
            app: unreachableApp,
            rootOptions,
            category: 'minutes',
            fileName: '회의록_복구.txt',
            dialog: {
                showMessageBox: async (_window, options) => { recoveryPrompt = options; return { response: 1 }; },
                showSaveDialog: async (_window, options) => { recoveredDefaultPath = options.defaultPath; return { canceled: true }; },
            },
        });
        assert.deepEqual(recoveryPrompt.buttons, ['다시 확인', '문서 폴더로 변경', '취소']);
        assert.equal(path.dirname(recoveredDefaultPath), path.join(documents, 'JJSS', '문서', '회의록'));
        assert.equal((await readPreferences(unreachableApp)).jjssRoot, path.join(documents, 'JJSS'));

        // 데이터 키(DPAPI): 없을 때만 만들고, 풀리지 않는 기존 파일은 절대 덮어쓰지 않는다.
        const keyApp = createMockApp(tempRoot, 'userData-key');
        const safeStorage = createMockSafeStorage();
        const firstKey = await getDataKey({ app: keyApp, safeStorage });
        assert.match(firstKey, /^[A-Za-z0-9+/]{43}=$/);
        assert.equal(Buffer.from(firstKey, 'base64').length, 32);
        const keyPath = path.join(keyApp.getPath('userData'), DATA_KEY_FILE_NAME);
        assert.equal(safeStorage.decryptString(await fs.readFile(keyPath)), firstKey);
        assert.equal(await getDataKey({ app: keyApp, safeStorage }), firstKey);
        const [concurrentA, concurrentB] = await Promise.all([
            getDataKey({ app: createMockApp(tempRoot, 'userData-key-concurrent'), safeStorage }),
            getDataKey({ app: createMockApp(tempRoot, 'userData-key-concurrent'), safeStorage }),
        ]);
        assert.equal(concurrentA, concurrentB);

        const corruptKeyApp = createMockApp(tempRoot, 'userData-key-corrupt');
        const corruptKeyPath = path.join(corruptKeyApp.getPath('userData'), DATA_KEY_FILE_NAME);
        await fs.mkdir(path.dirname(corruptKeyPath), { recursive: true });
        await fs.writeFile(corruptKeyPath, 'encrypted-on-another-pc');
        assert.equal(await getDataKey({ app: corruptKeyApp, safeStorage }), null);
        assert.equal(await fs.readFile(corruptKeyPath, 'utf8'), 'encrypted-on-another-pc');

        const unavailableKeyApp = createMockApp(tempRoot, 'userData-key-unavailable');
        assert.equal(await getDataKey({ app: unavailableKeyApp, safeStorage: createMockSafeStorage({ available: false }) }), null);
        await assert.rejects(fs.access(path.join(unavailableKeyApp.getPath('userData'), DATA_KEY_FILE_NAME)));

        console.log('PASS recursive legacy import 9/9');
        console.log('PASS root-only option and depth limit');
        console.log(junctionCreated ? 'PASS junction/symlink exclusion' : 'PASS-WARN junction creation unavailable; exclusion code inspected');
        console.log('PASS non-JJSS files protected 2/2');
        console.log('PASS collision rename');
        console.log('PASS per-file import failure reporting');
        console.log('PASS copy-verify-delete move');
        console.log('PASS path and extension validation');
        console.log('PASS Windows case-insensitive / POSIX case-sensitive containment');
        console.log('PASS EBUSY/ENOSPC/EPERM user messages');
        console.log('PASS normalized free save path and PNG/PDF signatures');
        console.log('PASS Korean/OneDrive-style path, remembered folder, and cancel');
        console.log('PASS PNG/PDF end-to-end write, temp HTML loadFile, locked print window, temp cleanup (incl. stale)');
        console.log('PASS persisted category folder and missing-folder fallback');
        console.log('PASS import IPC sender check, idempotent retry with same token');
        console.log('PASS Documents default root, legacy D:\\JJSS migration only with files, persisted root');
        console.log('PASS unreachable persisted root: Korean error, no silent switch, explicit recovery');
        console.log('PASS DPAPI data key create-once, concurrent, never overwrite undecryptable file');
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error?.stack || error?.message || 'file-service-test-failed');
    process.exit(1);
});
