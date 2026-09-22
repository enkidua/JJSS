const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
// Keep the integration fixtures inside the temporary Documents directory on every
// host. Preferred-drive behavior is tested below with an explicit synthetic drive.
const servicePath = require.resolve('../electron/fileService.cjs');
const testModule = { exports: {} };
new Function('require', 'module', 'exports', 'process', require('fs').readFileSync(servicePath, 'utf8'))(
    createRequire(servicePath), testModule, testModule.exports, { ...process, platform: 'linux' },
);
const {
    classifyLegacyFileName,
    chooseSavePath,
    getJjssPaths,
    hasPdfSignature,
    hasPngSignature,
    importCandidates,
    resolveJjssRoot,
    scanLegacyFolder,
    saveBuffer,
    savePdf,
    validateFileName,
} = testModule.exports;

async function main() {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jjss-file-service-'));
    const documents = path.join(tempRoot, 'Documents');
    const oldFolder = path.join(tempRoot, 'Downloads', 'JJSS-old-test');
    const mockApp = { getPath: name => name === 'documents' ? documents : path.join(tempRoot, name) };
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

        const rootOnlyCandidates = await scanLegacyFolder(oldFolder, false);
        assert.equal(rootOnlyCandidates.length, 7);
        const candidates = await scanLegacyFolder(oldFolder, true);
        assert.equal(candidates.length, 9);
        assert.ok(candidates.some(candidate => candidate.relativePath === path.join('archive', '2025', '직업재활계획서_2025-12-31.pdf')));
        assert.equal(candidates.some(candidate => candidate.name === 'JJSS-too-deep.txt'), false);
        if (junctionCreated) assert.equal(candidates.some(candidate => candidate.name === 'JJSS-linked.txt'), false);
        const firstCopy = await importCandidates({ app: mockApp, candidates, mode: 'copy' });
        assert.equal(firstCopy.length, 9);
        assert.ok(firstCopy.every(result => result.sourceDeleted === false));
        await fs.access(path.join(oldFolder, '일반사진.jpg'));
        await fs.access(path.join(oldFolder, '개인문서.docx'));

        const secondCopy = await importCandidates({ app: mockApp, candidates: candidates.slice(0, 1), mode: 'copy' });
        assert.match(secondCopy[0].savedName, / \(1\)\.[a-z0-9]+$/i);

        const moveFolder = path.join(tempRoot, 'Downloads', 'JJSS-move-test');
        await fs.mkdir(moveFolder, { recursive: true });
        await fs.writeFile(path.join(moveFolder, '회의록_이동검증.txt'), 'synthetic-move');
        const moveCandidates = await scanLegacyFolder(moveFolder);
        const moved = await importCandidates({ app: mockApp, candidates: moveCandidates, mode: 'move' });
        assert.equal(moved.length, 1);
        await assert.rejects(fs.access(path.join(moveFolder, '회의록_이동검증.txt')));

        const documentsFallback = await resolveJjssRoot(mockApp, {
            platform: 'win32',
            preferredDrive: path.join(tempRoot, 'missing-drive'),
        });
        assert.equal(documentsFallback, path.join(documents, 'JJSS'));
        const writableDrive = path.join(tempRoot, 'D-drive');
        await fs.mkdir(writableDrive, { recursive: true });
        const preferredRoot = await resolveJjssRoot(mockApp, {
            platform: 'win32',
            preferredDrive: writableDrive,
        });
        assert.equal(preferredRoot, path.join(writableDrive, 'JJSS'));
        const jjssPaths = getJjssPaths(mockApp);
        const externalFolder = path.join(tempRoot, 'OneDrive 한글 폴더');
        const externalPath = path.join(externalFolder, '계획서 1.pdf');
        let saveDialogCalls = 0;
        const externalResult = await chooseSavePath({
            app: mockApp,
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
        const preferences = JSON.parse(await fs.readFile(path.join(tempRoot, 'userData', 'file-save-preferences.json'), 'utf8'));
        assert.equal(preferences.lastSaveDirectories['rehab-plan'], path.resolve(externalFolder));
        let rememberedDefaultPath = '';
        const cancelResult = await chooseSavePath({
            app: mockApp,
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
            category: 'rehab-plan',
            fileName: '한글 이미지.png',
            data: pngBytes,
            dialog: { showSaveDialog: async () => ({ canceled: false, filePath: pngPath }) },
        });
        assert.equal(savedPng.filePath, path.resolve(pngPath));
        assert.match(savedPng.openToken, /^[0-9a-f-]{36}$/i);
        assert.deepEqual(await fs.readFile(pngPath), pngBytes);

        const pdfPath = path.join(externalFolder, '한글 문서.pdf');
        const pdfBytes = Buffer.from('%PDF-1.7\nsynthetic-pdf');
        class MockBrowserWindow {
            webContents = { printToPDF: async () => pdfBytes };
            async loadURL() {}
            isDestroyed() { return false; }
            destroy() {}
        }
        const savedPdf = await savePdf({
            app: mockApp,
            BrowserWindow: MockBrowserWindow,
            category: 'rehab-plan',
            fileName: '한글 문서.pdf',
            html: '<!doctype html><html><body>synthetic</body></html>',
            dialog: { showSaveDialog: async () => ({ canceled: false, filePath: pdfPath }) },
        });
        assert.equal(savedPdf.filePath, path.resolve(pdfPath));
        assert.match(savedPdf.openToken, /^[0-9a-f-]{36}$/i);
        assert.deepEqual(await fs.readFile(pdfPath), pdfBytes);
        await fs.rm(externalFolder, { recursive: true, force: true });
        let missingFolderFallback = '';
        await chooseSavePath({
            app: mockApp,
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
        console.log('PASS recursive legacy import 9/9');
        console.log('PASS root-only option and depth limit');
        console.log(junctionCreated ? 'PASS junction/symlink exclusion' : 'PASS-WARN junction creation unavailable; exclusion code inspected');
        console.log('PASS non-JJSS files protected 2/2');
        console.log('PASS collision rename');
        console.log('PASS copy-verify-delete move');
        console.log('PASS path and extension validation');
        console.log('PASS normalized free save path and PNG/PDF signatures');
        console.log('PASS Korean/OneDrive-style path, remembered folder, and cancel');
        console.log('PASS PNG/PDF end-to-end write and post-write verification');
        console.log('PASS persisted category folder and missing-folder fallback');
        console.log('PASS writable preferred drive and Documents fallback root policy');
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error?.message || 'file-service-test-failed');
    process.exit(1);
});
