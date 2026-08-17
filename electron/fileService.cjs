const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { fileURLToPath } = require('url');

const MAX_SAVE_BYTES = 100 * 1024 * 1024;
const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
const MAX_IMPORT_FILES = 5_000;
const MAX_IMPORT_DEPTH = 5;
const MAX_PENDING_IMPORTS = 20;
const IMPORT_TOKEN_TTL_MS = 30 * 60 * 1000;
const SAVED_DIRECTORY_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_SAVED_DIRECTORY_TOKENS = 100;
const lastSaveDirectories = new Map();
const savedDirectoriesByToken = new Map();
let loadedSavePreferencesPath = '';

const CATEGORY_CONFIG = Object.freeze({
    backup: { segments: ['JJSS Pro', '백업'], extensions: ['.json'], label: '백업' },
    'rehab-plan': { segments: ['문서', '직업재활계획서'], extensions: ['.pdf', '.png', '.docx'], label: '직업재활계획서' },
    'vocational-evaluation': { segments: ['문서', '직업평가'], extensions: ['.pdf', '.docx'], label: '직업평가' },
    'case-management': { segments: ['문서', '상담·사례관리'], extensions: ['.pdf', '.txt', '.docx'], label: '상담·사례관리' },
    budget: { segments: ['문서', '예산'], extensions: ['.csv', '.pdf'], label: '예산' },
    minutes: { segments: ['문서', '회의록'], extensions: ['.txt', '.docx'], label: '회의록' },
    utility: { segments: ['문서', '업무지원'], extensions: ['.txt', '.docx', '.pdf'], label: '업무지원' },
    image: { segments: ['문서', '이미지'], extensions: ['.png', '.jpg', '.jpeg', '.webp'], label: '이미지' },
    other: { segments: ['문서', '기타'], extensions: ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.csv'], label: '기타' },
});

const FOLDER_KEYS = new Set(['root', 'documents', ...Object.keys(CATEGORY_CONFIG)]);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function getJjssPaths(app, rootOverride) {
    const root = rootOverride || path.join(app.getPath('documents'), 'JJSS');
    const categories = {};
    for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
        categories[category] = path.join(root, ...config.segments);
    }
    return {
        root,
        appData: path.join(root, 'JJSS Pro'),
        backup: categories.backup,
        documents: path.join(root, '문서'),
        categories,
    };
}

async function resolveJjssRoot(app, options = {}) {
    const documentsRoot = path.join(app.getPath('documents'), 'JJSS');
    const platform = options.platform || process.platform;
    if (platform !== 'win32') return documentsRoot;

    const driveRoot = options.preferredDrive || 'D:\\';
    const preferredRoot = path.join(driveRoot, 'JJSS');
    try {
        const driveInfo = await fsp.stat(driveRoot);
        if (!driveInfo.isDirectory()) return documentsRoot;
        await fsp.access(driveRoot, fs.constants.W_OK);
        await fsp.mkdir(preferredRoot, { recursive: true });
        await fsp.access(preferredRoot, fs.constants.W_OK);
        return preferredRoot;
    } catch {
        return documentsRoot;
    }
}

async function ensureJjssFolders(app) {
    const root = await resolveJjssRoot(app);
    const paths = getJjssPaths(app, root);
    const directories = new Set([
        paths.root,
        paths.appData,
        paths.documents,
        ...Object.values(paths.categories),
    ]);
    await Promise.all([...directories].map(directory => fsp.mkdir(directory, { recursive: true })));
    return paths;
}

function validateCategory(category) {
    if (typeof category !== 'string' || !Object.hasOwn(CATEGORY_CONFIG, category)) {
        throw new Error('지원하지 않는 JJSS 파일 분류입니다.');
    }
    return CATEGORY_CONFIG[category];
}

function validateFileName(category, fileName) {
    const config = validateCategory(category);
    if (typeof fileName !== 'string' || fileName.length < 1 || fileName.length > 180) {
        throw new Error('파일명이 올바르지 않습니다.');
    }
    if (fileName !== path.basename(fileName)
        || fileName.includes('..')
        || /[<>:"/\\|?*\u0000-\u001f]/.test(fileName)
        || /[. ]$/.test(fileName)
        || WINDOWS_RESERVED_NAMES.test(fileName)) {
        throw new Error('안전하지 않은 파일명은 사용할 수 없습니다.');
    }
    const extension = path.extname(fileName).toLowerCase();
    if (!config.extensions.includes(extension)) {
        throw new Error('이 분류에서 허용되지 않는 파일 형식입니다.');
    }
    return { config, extension };
}

function isPathInside(root, candidate) {
    const normalizeForComparison = value => process.platform === 'win32'
        ? path.resolve(value).toLocaleLowerCase('en-US')
        : path.resolve(value);
    const relative = path.relative(normalizeForComparison(root), normalizeForComparison(candidate));
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function hasPngSignature(buffer) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function hasPdfSignature(buffer) {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function normalizeBytes(data) {
    if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    throw new Error('저장할 파일 데이터 형식이 올바르지 않습니다.');
}

function validateSender(event, expectedIndexPath) {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) throw new Error('허용되지 않은 프레임 요청입니다.');
    let senderPath;
    try {
        const senderUrl = new URL(frame.url);
        if (senderUrl.protocol !== 'file:') throw new Error('invalid-protocol');
        senderPath = path.resolve(fileURLToPath(senderUrl));
    } catch {
        throw new Error('허용되지 않은 파일 요청 출처입니다.');
    }
    if (senderPath !== path.resolve(expectedIndexPath)) throw new Error('허용되지 않은 파일 요청 출처입니다.');
}

function getDialogFilters(extension) {
    const labelByExtension = {
        '.json': 'JSON 백업', '.pdf': 'PDF 문서', '.png': 'PNG 이미지', '.docx': 'Word 문서',
        '.csv': 'CSV 문서', '.txt': '텍스트 문서', '.jpg': 'JPEG 이미지', '.jpeg': 'JPEG 이미지', '.webp': 'WebP 이미지',
    };
    return [{ name: labelByExtension[extension] || 'JJSS 파일', extensions: [extension.slice(1)] }];
}

function getSavePreferencesPath(app) {
    return path.join(app.getPath('userData'), 'file-save-preferences.json');
}

async function loadSavePreferences(app) {
    const preferencePath = getSavePreferencesPath(app);
    if (loadedSavePreferencesPath === preferencePath) return;
    loadedSavePreferencesPath = preferencePath;
    lastSaveDirectories.clear();
    try {
        const parsed = JSON.parse(await fsp.readFile(preferencePath, 'utf8'));
        for (const [category, directory] of Object.entries(parsed?.lastSaveDirectories || {})) {
            if (Object.hasOwn(CATEGORY_CONFIG, category)
                && typeof directory === 'string'
                && directory.length <= 1_024
                && path.isAbsolute(directory)) {
                lastSaveDirectories.set(category, path.resolve(path.normalize(directory)));
            }
        }
    } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError) && !app.isPackaged) {
            console.warn('[JJSS file preferences]', { stage: 'load', errorName: error?.name || 'Error', errorCode: error?.code });
        }
    }
}

async function persistSavePreferences(app) {
    const preferencePath = getSavePreferencesPath(app);
    await fsp.mkdir(path.dirname(preferencePath), { recursive: true });
    await fsp.writeFile(preferencePath, JSON.stringify({
        version: 1,
        lastSaveDirectories: Object.fromEntries(lastSaveDirectories),
    }), { encoding: 'utf8', mode: 0o600 });
}

async function existingSuggestedDirectory(category, fallbackDirectory) {
    const remembered = lastSaveDirectories.get(category);
    if (!remembered) return fallbackDirectory;
    try {
        const info = await fsp.stat(remembered);
        return info.isDirectory() ? remembered : fallbackDirectory;
    } catch {
        return fallbackDirectory;
    }
}

function registerSavedDirectory(filePath) {
    const now = Date.now();
    for (const [token, entry] of savedDirectoriesByToken) {
        if (now - entry.createdAt > SAVED_DIRECTORY_TOKEN_TTL_MS) savedDirectoriesByToken.delete(token);
    }
    while (savedDirectoriesByToken.size >= MAX_SAVED_DIRECTORY_TOKENS) {
        const oldest = savedDirectoriesByToken.keys().next().value;
        if (!oldest) break;
        savedDirectoriesByToken.delete(oldest);
    }
    const openToken = crypto.randomUUID();
    savedDirectoriesByToken.set(openToken, { directory: path.dirname(filePath), createdAt: now });
    return openToken;
}

async function chooseSavePath({ app, dialog, category, fileName, browserWindow }) {
    const { extension } = validateFileName(category, fileName);
    const paths = await ensureJjssFolders(app);
    const baseDirectory = paths.categories[category];
    await loadSavePreferences(app);
    const suggestedDirectory = await existingSuggestedDirectory(category, baseDirectory);
    const result = await dialog.showSaveDialog(browserWindow || undefined, {
        title: '원하는 위치를 선택해 저장하세요',
        defaultPath: path.join(suggestedDirectory, fileName),
        filters: getDialogFilters(extension),
        properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const selectedPath = path.resolve(path.normalize(result.filePath));
    if (path.extname(selectedPath).toLowerCase() !== extension) {
        return { canceled: false, error: 'invalid-extension' };
    }
    const selectedDirectory = path.dirname(selectedPath);
    await fsp.mkdir(selectedDirectory, { recursive: true });
    lastSaveDirectories.set(category, selectedDirectory);
    try {
        await persistSavePreferences(app);
    } catch (error) {
        if (!app.isPackaged) console.warn('[JJSS file preferences]', { stage: 'save', errorName: error?.name || 'Error', errorCode: error?.code });
    }
    return { canceled: false, filePath: selectedPath, paths };
}

function toFileWriteError(error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
        return new Error('선택한 위치에 파일을 저장할 권한이 없습니다. 다른 폴더를 선택해 주세요.');
    }
    if (error?.code === 'ENOENT') {
        return new Error('선택한 저장 폴더를 찾거나 만들 수 없습니다. 다른 위치를 선택해 주세요.');
    }
    return new Error('파일을 디스크에 기록하지 못했습니다. 경로와 사용 가능한 저장 공간을 확인해 주세요.');
}

async function verifyWrittenFile(filePath, expectedSize) {
    const written = await fsp.stat(filePath);
    if (!written.isFile() || written.size !== expectedSize || written.size <= 0) {
        throw new Error('저장 후 파일 검증에 실패했습니다.');
    }
}

async function saveBuffer({ app, dialog, category, fileName, data, browserWindow }) {
    const buffer = normalizeBytes(data);
    if (!buffer.length || buffer.length > MAX_SAVE_BYTES) throw new Error('저장할 파일의 크기가 허용 범위를 벗어났습니다.');
    if (path.extname(fileName).toLowerCase() === '.png' && !hasPngSignature(buffer)) {
        throw new Error('생성된 PNG 파일의 형식이 올바르지 않습니다.');
    }
    const destination = await chooseSavePath({ app, dialog, category, fileName, browserWindow });
    if (destination.canceled || destination.error) return destination;
    try {
        await fsp.mkdir(path.dirname(destination.filePath), { recursive: true });
        await fsp.writeFile(destination.filePath, buffer);
        await verifyWrittenFile(destination.filePath, buffer.length);
    } catch (error) {
        if (!app.isPackaged) console.error('[JJSS file save]', { stage: 'file-write', errorName: error?.name || 'Error', errorCode: error?.code });
        if (error?.message === '저장 후 파일 검증에 실패했습니다.') throw error;
        throw toFileWriteError(error);
    }
    return { canceled: false, filePath: destination.filePath, category, openToken: registerSavedDirectory(destination.filePath) };
}

async function savePdf({ app, dialog, BrowserWindow, category, fileName, html, browserWindow }) {
    validateFileName(category, fileName);
    if (path.extname(fileName).toLowerCase() !== '.pdf') {
        throw new Error('PDF 저장 분류가 올바르지 않습니다.');
    }
    if (typeof html !== 'string' || html.length < 1 || Buffer.byteLength(html, 'utf8') > 20 * 1024 * 1024) {
        throw new Error('PDF 문서 데이터 크기가 허용 범위를 벗어났습니다.');
    }
    const destination = await chooseSavePath({ app, dialog, category, fileName, browserWindow });
    if (destination.canceled || destination.error) return destination;

    const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    try {
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await printWindow.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
        });
        if (!pdf.length || pdf.length > MAX_SAVE_BYTES || !hasPdfSignature(pdf)) throw new Error('생성된 PDF 파일의 형식이 올바르지 않습니다.');
        try {
            await fsp.writeFile(destination.filePath, pdf);
            await verifyWrittenFile(destination.filePath, pdf.length);
        } catch (error) {
            if (!app.isPackaged) console.error('[JJSS file save]', { stage: 'file-write', errorName: error?.name || 'Error', errorCode: error?.code });
            if (error?.message === '저장 후 파일 검증에 실패했습니다.') throw error;
            throw toFileWriteError(error);
        }
        return { canceled: false, filePath: destination.filePath, category, openToken: registerSavedDirectory(destination.filePath) };
    } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
    }
}

function classifyLegacyFileName(fileName) {
    const rules = [
        ['backup', /^jjss[_-]backup_.*\.json$/i],
        ['rehab-plan', /^직업재활계획서_.*\.(docx|png|pdf)$/i],
        ['vocational-evaluation', /^직업평가_.*\.(docx|pdf)$/i],
        ['budget', /^jjss-budget-expenses-.*\.csv$/i],
        ['minutes', /^회의록.*\.(txt|docx)$/i],
        ['utility', /^result_.*\.txt$/i],
        ['image', /^(ai-poster|JJSS_Design_.*)\.(png|jpg|jpeg|webp)$/i],
        ['other', /^JJSS[_-].*\.(txt|docx|pdf|png|jpg|jpeg|webp|csv)$/i],
    ];
    const matched = rules.find(([, expression]) => expression.test(fileName));
    return matched?.[0] || null;
}

async function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return hash.digest('hex');
}

async function findAvailableDestination(directory, fileName) {
    const extension = path.extname(fileName);
    const stem = path.basename(fileName, extension);
    for (let index = 0; index <= 9_999; index += 1) {
        const candidateName = index === 0 ? fileName : `${stem} (${index})${extension}`;
        const candidate = path.join(directory, candidateName);
        try {
            await fsp.access(candidate);
        } catch {
            return candidate;
        }
    }
    throw new Error('같은 이름의 파일이 너무 많아 새 파일명을 만들지 못했습니다.');
}

async function scanLegacyFolder(sourceFolder, includeSubfolders = true) {
    const sourceRoot = await fsp.realpath(sourceFolder);
    const pendingDirectories = [{ directory: sourceRoot, depth: 0 }];
    const visitedDirectories = new Set();
    const candidates = [];
    while (pendingDirectories.length && candidates.length < MAX_IMPORT_FILES) {
        const current = pendingDirectories.shift();
        const realDirectory = await fsp.realpath(current.directory);
        if (realDirectory !== sourceRoot && !isPathInside(sourceRoot, realDirectory)) continue;
        if (visitedDirectories.has(realDirectory)) continue;
        visitedDirectories.add(realDirectory);

        const directoryEntries = await fsp.readdir(realDirectory, { withFileTypes: true });
        for (const entry of directoryEntries) {
            if (entry.isSymbolicLink()) continue;
            const fullPath = path.join(realDirectory, entry.name);
            if (entry.isDirectory()) {
                if (includeSubfolders && current.depth < MAX_IMPORT_DEPTH) {
                    pendingDirectories.push({ directory: fullPath, depth: current.depth + 1 });
                }
                continue;
            }
            if (!entry.isFile()) continue;
            const category = classifyLegacyFileName(entry.name);
            if (!category) continue;
            const stat = await fsp.lstat(fullPath);
            if (stat.isSymbolicLink() || !stat.isFile()) continue;
            if (stat.size > 0 && stat.size <= MAX_IMPORT_BYTES) {
                candidates.push({
                    name: entry.name,
                    category,
                    size: stat.size,
                    sourcePath: fullPath,
                    relativePath: path.relative(sourceRoot, fullPath),
                });
            }
            if (candidates.length >= MAX_IMPORT_FILES) break;
        }
    }
    return candidates;
}

function summarizeCandidates(candidates) {
    const summary = {};
    for (const candidate of candidates) {
        summary[candidate.category] = (summary[candidate.category] || 0) + 1;
    }
    return summary;
}

async function importCandidates({ app, candidates, mode }) {
    if (!['copy', 'move'].includes(mode)) throw new Error('가져오기 방식이 올바르지 않습니다.');
    const paths = await ensureJjssFolders(app);
    const results = [];
    for (const candidate of candidates) {
        validateFileName(candidate.category, candidate.name);
        const destinationDirectory = paths.categories[candidate.category];
        await fsp.mkdir(destinationDirectory, { recursive: true });
        const destinationPath = await findAvailableDestination(destinationDirectory, candidate.name);
        await fsp.copyFile(candidate.sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);

        const [sourceStat, destinationStat, sourceHash, destinationHash] = await Promise.all([
            fsp.stat(candidate.sourcePath),
            fsp.stat(destinationPath),
            hashFile(candidate.sourcePath),
            hashFile(destinationPath),
        ]);
        if (sourceStat.size !== destinationStat.size || sourceHash !== destinationHash) {
            await fsp.unlink(destinationPath).catch(() => undefined);
            throw new Error('복사 검증에 실패해 원본 파일을 유지했습니다.');
        }
        let sourceDeleted = false;
        if (mode === 'move') {
            await fsp.unlink(candidate.sourcePath);
            sourceDeleted = true;
        }
        results.push({ name: candidate.name, savedName: path.basename(destinationPath), category: candidate.category, sourceDeleted });
    }
    return results;
}

function registerJjssFileIpc({ app, ipcMain, dialog, shell, BrowserWindow, expectedIndexPath }) {
    const pendingImports = new Map();
    const withTrustedSender = handler => async (event, payload) => {
        validateSender(event, expectedIndexPath);
        return handler(event, payload);
    };
    const currentWindow = event => BrowserWindow.fromWebContents(event.sender) || undefined;

    ipcMain.handle('jjss-files:get-paths', withTrustedSender(async () => {
        const paths = await ensureJjssFolders(app);
        return { root: paths.root, appData: paths.appData, backup: paths.backup, documents: paths.documents, categories: paths.categories };
    }));

    ipcMain.handle('jjss-files:save-file', withTrustedSender(async (event, payload = {}) => saveBuffer({
        app, dialog, category: payload.category, fileName: payload.fileName, data: payload.data, browserWindow: currentWindow(event),
    })));

    ipcMain.handle('jjss-files:save-pdf', withTrustedSender(async (event, payload = {}) => savePdf({
        app, dialog, BrowserWindow, category: payload.category, fileName: payload.fileName, html: payload.html, browserWindow: currentWindow(event),
    })));

    ipcMain.handle('jjss-files:open-folder', withTrustedSender(async (_event, folderKey) => {
        if (typeof folderKey !== 'string' || !FOLDER_KEYS.has(folderKey)) throw new Error('허용되지 않은 폴더 요청입니다.');
        const paths = await ensureJjssFolders(app);
        const target = folderKey === 'root' ? paths.root : folderKey === 'documents' ? paths.documents : paths.categories[folderKey];
        const result = await shell.openPath(target);
        if (result) throw new Error('JJSS 폴더를 열지 못했습니다.');
        return { opened: true };
    }));

    ipcMain.handle('jjss-files:open-saved-directory', withTrustedSender(async (_event, openToken) => {
        if (typeof openToken !== 'string') throw new Error('저장 폴더 열기 요청이 올바르지 않습니다.');
        const saved = savedDirectoriesByToken.get(openToken);
        if (!saved || Date.now() - saved.createdAt > SAVED_DIRECTORY_TOKEN_TTL_MS) {
            savedDirectoriesByToken.delete(openToken);
            throw new Error('저장 폴더 열기 정보가 만료되었습니다.');
        }
        const info = await fsp.stat(saved.directory);
        if (!info.isDirectory()) throw new Error('저장된 파일의 폴더를 찾지 못했습니다.');
        const result = await shell.openPath(saved.directory);
        if (result) throw new Error('저장된 파일의 폴더를 열지 못했습니다.');
        return { opened: true };
    }));

    ipcMain.handle('jjss-files:choose-import-folder', withTrustedSender(async (event, payload = {}) => {
        const selected = await dialog.showOpenDialog(currentWindow(event), {
            title: '기존 JJSS 문서 폴더 선택',
            defaultPath: app.getPath('downloads'),
            properties: ['openDirectory'],
        });
        if (selected.canceled || selected.filePaths.length !== 1) return { canceled: true };
        const sourceFolder = path.resolve(selected.filePaths[0]);
        const paths = await ensureJjssFolders(app);
        if (sourceFolder === path.resolve(paths.root) || isPathInside(paths.root, sourceFolder)) {
            return { canceled: false, error: 'source-inside-jjss-root' };
        }
        const includeSubfolders = payload.includeSubfolders !== false;
        const candidates = await scanLegacyFolder(sourceFolder, includeSubfolders);
        const now = Date.now();
        for (const [key, value] of pendingImports) {
            if (now - value.createdAt > IMPORT_TOKEN_TTL_MS) pendingImports.delete(key);
        }
        while (pendingImports.size >= MAX_PENDING_IMPORTS) {
            const oldestToken = pendingImports.keys().next().value;
            if (!oldestToken) break;
            pendingImports.delete(oldestToken);
        }
        const token = crypto.randomUUID();
        pendingImports.set(token, { createdAt: now, candidates });
        return {
            canceled: false,
            token,
            sourceFolder,
            includeSubfolders,
            total: candidates.length,
            summary: summarizeCandidates(candidates),
            files: candidates.map(({ name, category, size, relativePath }) => ({ name, category, size, relativePath })),
        };
    }));

    ipcMain.handle('jjss-files:import-legacy-documents', withTrustedSender(async (_event, payload = {}) => {
        const pending = typeof payload.token === 'string' ? pendingImports.get(payload.token) : null;
        if (!pending || Date.now() - pending.createdAt > IMPORT_TOKEN_TTL_MS) throw new Error('가져오기 미리보기가 만료되었습니다. 폴더를 다시 선택해 주세요.');
        pendingImports.delete(payload.token);
        const results = await importCandidates({ app, candidates: pending.candidates, mode: payload.mode });
        return { imported: results.length, mode: payload.mode, results };
    }));
}

module.exports = {
    CATEGORY_CONFIG,
    classifyLegacyFileName,
    chooseSavePath,
    ensureJjssFolders,
    getJjssPaths,
    importCandidates,
    hasPdfSignature,
    hasPngSignature,
    isPathInside,
    registerJjssFileIpc,
    resolveJjssRoot,
    saveBuffer,
    savePdf,
    scanLegacyFolder,
    validateFileName,
};
