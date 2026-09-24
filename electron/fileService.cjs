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
const LEGACY_ROOT_SCAN_DEPTH = 4;
const ROOT_UNAVAILABLE_CODE = 'JJSS_ROOT_UNAVAILABLE';
const VERIFY_FAILED_CODE = 'JJSS_VERIFY_FAILED';
const IGNORED_SYSTEM_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const lastSaveDirectories = new Map();
const savedDirectoriesByToken = new Map();
const pendingRootResolutions = new Map();
let loadedSavePreferencesPath = '';
let savedJjssRoot = '';

const CATEGORY_CONFIG = Object.freeze({
    backup: { segments: ['JJSS Pro', '백업'], extensions: ['.json'], label: '백업' },
    'rehab-plan': { segments: ['문서', '직업재활계획서'], extensions: ['.pdf', '.png', '.docx'], label: '직업재활계획서' },
    'vocational-evaluation': { segments: ['문서', '직업평가'], extensions: ['.pdf', '.docx'], label: '직업평가' },
    'case-management': { segments: ['문서', '상담·사례관리'], extensions: ['.pdf', '.txt', '.docx', '.zip'], label: '상담·사례관리' },
    budget: { segments: ['문서', '예산'], extensions: ['.csv', '.pdf'], label: '예산' },
    minutes: { segments: ['문서', '회의록'], extensions: ['.txt', '.docx'], label: '회의록' },
    utility: { segments: ['문서', '업무지원'], extensions: ['.txt', '.docx', '.pdf'], label: '업무지원' },
    image: { segments: ['문서', '이미지'], extensions: ['.png', '.jpg', '.jpeg', '.webp'], label: '이미지' },
    other: { segments: ['문서', '기타'], extensions: ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.csv'], label: '기타' },
});

const FOLDER_KEYS = new Set(['root', 'documents', ...Object.keys(CATEGORY_CONFIG)]);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function getDefaultJjssRoot(app) {
    return path.join(app.getPath('documents'), 'JJSS');
}

function getJjssPaths(app, rootOverride) {
    const root = rootOverride || getDefaultJjssRoot(app);
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

function warnInDevelopment(app, scope, stage, error) {
    if (app?.isPackaged) return;
    console.warn(scope, { stage, errorName: error?.name || 'Error', errorCode: error?.code });
}

// ---------------------------------------------------------------------------
// 저장 위치 설정 파일(userData/file-save-preferences.json)
//  - jjssRoot: 한 번 정한 JJSS 기본 폴더. 실행할 때마다 다시 계산하지 않는다.
//  - lastSaveDirectories: 분류별로 사용자가 마지막에 고른 저장 폴더.
// ---------------------------------------------------------------------------
function getSavePreferencesPath(app) {
    return path.join(app.getPath('userData'), 'file-save-preferences.json');
}

function sanitizeStoredDirectory(directory) {
    if (typeof directory !== 'string' || directory.length < 1 || directory.length > 1_024 || !path.isAbsolute(directory)) return '';
    return path.resolve(path.normalize(directory));
}

async function loadSavePreferences(app) {
    const preferencePath = getSavePreferencesPath(app);
    if (loadedSavePreferencesPath === preferencePath) return;
    loadedSavePreferencesPath = preferencePath;
    lastSaveDirectories.clear();
    savedJjssRoot = '';
    try {
        const parsed = JSON.parse(await fsp.readFile(preferencePath, 'utf8'));
        savedJjssRoot = sanitizeStoredDirectory(parsed?.jjssRoot);
        for (const [category, directory] of Object.entries(parsed?.lastSaveDirectories || {})) {
            const sanitized = sanitizeStoredDirectory(directory);
            if (Object.hasOwn(CATEGORY_CONFIG, category) && sanitized) {
                lastSaveDirectories.set(category, sanitized);
            }
        }
    } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return;
        // 일시적으로 읽지 못한 경우 기존 설정을 덮어쓰지 않도록 다음 요청에서 다시 읽는다.
        loadedSavePreferencesPath = '';
        warnInDevelopment(app, '[JJSS file preferences]', 'load', error);
    }
}

async function persistSavePreferences(app) {
    const preferencePath = getSavePreferencesPath(app);
    if (loadedSavePreferencesPath !== preferencePath) {
        throw new Error('저장 위치 설정을 읽지 못해 새 설정을 기록하지 않았습니다.');
    }
    await fsp.mkdir(path.dirname(preferencePath), { recursive: true });
    const serialized = JSON.stringify({
        version: 2,
        ...(savedJjssRoot ? { jjssRoot: savedJjssRoot } : {}),
        lastSaveDirectories: Object.fromEntries(lastSaveDirectories),
    });
    const tempPath = `${preferencePath}.${crypto.randomUUID()}.tmp`;
    try {
        await fsp.writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
        await fsp.rename(tempPath, preferencePath);
    } catch (error) {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined);
        if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
        // 백신 등이 설정 파일을 잠깐 잡고 있으면 교체(rename)가 실패할 수 있어 직접 기록한다.
        await fsp.writeFile(preferencePath, serialized, { encoding: 'utf8', mode: 0o600 });
    }
}

// ---------------------------------------------------------------------------
// JJSS 기본 폴더 결정
//  - 기본값: 문서\JJSS
//  - 기존 사용자: 설정이 아직 없고 D:\JJSS 안에 실제 파일이 있으면 D:\JJSS를 계속 사용
//  - 결정한 위치는 설정 파일에 저장해 실행할 때마다 바뀌지 않게 한다.
//  - 테스트는 options.preferredDrive(가상 드라이브, null이면 이전 위치 확인 안 함)와
//    options.platform으로 주입한다.
// ---------------------------------------------------------------------------
async function directoryContainsUserFiles(directory, depth = 0) {
    let entries;
    try {
        entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
        return false;
    }
    if (entries.some(entry => entry.isFile() && !IGNORED_SYSTEM_FILES.has(entry.name.toLowerCase()))) return true;
    if (depth >= LEGACY_ROOT_SCAN_DEPTH) return false;
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (await directoryContainsUserFiles(path.join(directory, entry.name), depth + 1)) return true;
    }
    return false;
}

async function hasLegacyJjssFiles(driveRoot) {
    const legacyRoot = path.join(driveRoot, 'JJSS');
    try {
        const info = await fsp.stat(legacyRoot);
        if (!info.isDirectory()) return false;
        await fsp.access(driveRoot, fs.constants.W_OK);
        await fsp.access(legacyRoot, fs.constants.W_OK);
        return await directoryContainsUserFiles(legacyRoot);
    } catch {
        return false;
    }
}

async function resolveJjssRoot(app, options = {}) {
    await loadSavePreferences(app);
    if (savedJjssRoot) return savedJjssRoot;

    const preferencePath = getSavePreferencesPath(app);
    if (loadedSavePreferencesPath !== preferencePath) {
        // 설정 파일이 있는데 읽지 못했다면 다른 위치를 새로 정하지 않는다(위치가 바뀌는 것 방지).
        throw new Error('JJSS 저장 위치 설정을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!pendingRootResolutions.has(preferencePath)) {
        const resolution = (async () => {
            const documentsRoot = path.join(app.getPath('documents'), 'JJSS');
            const platform = options.platform || process.platform;
            let chosenRoot = documentsRoot;
            if (platform === 'win32' && options.preferredDrive !== null) {
                const driveRoot = options.preferredDrive || 'D:\\';
                if (await hasLegacyJjssFiles(driveRoot)) chosenRoot = path.join(driveRoot, 'JJSS');
            }
            savedJjssRoot = path.resolve(chosenRoot);
            try {
                await persistSavePreferences(app);
            } catch (error) {
                warnInDevelopment(app, '[JJSS file preferences]', 'save-root', error);
            }
            return savedJjssRoot;
        })().finally(() => pendingRootResolutions.delete(preferencePath));
        pendingRootResolutions.set(preferencePath, resolution);
    }
    return pendingRootResolutions.get(preferencePath);
}

async function setJjssRoot(app, root) {
    const sanitized = sanitizeStoredDirectory(root);
    if (!sanitized) throw new Error('저장 위치 경로가 올바르지 않습니다.');
    await loadSavePreferences(app);
    savedJjssRoot = sanitized;
    await persistSavePreferences(app);
    return savedJjssRoot;
}

function createRootUnavailableError(root) {
    const error = new Error(`저장 위치(${root})를 찾을 수 없습니다. USB/드라이브 연결을 확인하세요.`);
    error.code = ROOT_UNAVAILABLE_CODE;
    return error;
}

async function ensureJjssFolders(app, options = {}) {
    const root = await resolveJjssRoot(app, options);
    // 드라이브(USB·외장 디스크)가 빠져 있으면 다른 곳으로 조용히 바꾸지 않고 알린다.
    try {
        const volumeInfo = await fsp.stat(path.parse(root).root || root);
        if (!volumeInfo.isDirectory()) throw new Error('volume-unavailable');
    } catch {
        throw createRootUnavailableError(root);
    }
    const paths = getJjssPaths(app, root);
    const directories = new Set([
        paths.root,
        paths.appData,
        paths.documents,
        ...Object.values(paths.categories),
    ]);
    try {
        await Promise.all([...directories].map(directory => fsp.mkdir(directory, { recursive: true })));
    } catch (error) {
        if (error?.code === 'ENOSPC') throw new Error('저장 공간이 부족해 JJSS 폴더를 만들지 못했습니다. 디스크 공간을 확인해 주세요.');
        throw createRootUnavailableError(root);
    }
    return paths;
}

// 사용자가 직접 조작하는 저장·폴더 열기·가져오기에서는 저장 위치가 없을 때
// "다시 확인 / 문서 폴더로 변경 / 취소"를 묻는다. 선택 없이 위치를 바꾸지 않는다.
async function ensureJjssFoldersWithRecovery({ app, dialog, browserWindow, rootOptions }) {
    for (;;) {
        try {
            return await ensureJjssFolders(app, rootOptions);
        } catch (error) {
            if (error?.code !== ROOT_UNAVAILABLE_CODE || typeof dialog?.showMessageBox !== 'function') throw error;
            const documentsRoot = path.resolve(getDefaultJjssRoot(app));
            const canSwitch = path.resolve(savedJjssRoot || '') !== documentsRoot;
            const buttons = canSwitch ? ['다시 확인', '문서 폴더로 변경', '취소'] : ['다시 확인', '취소'];
            const detail = canSwitch
                ? `드라이브를 연결한 뒤 [다시 확인]을 누르세요.\n더 이상 이 위치를 쓰지 않는다면 [문서 폴더로 변경]을 누르면 앞으로 ${documentsRoot}에 저장합니다. 기존 위치의 파일은 지워지지 않습니다.`
                : '드라이브나 폴더 상태를 확인한 뒤 [다시 확인]을 누르세요.';
            const { response } = await dialog.showMessageBox(browserWindow || undefined, {
                type: 'warning',
                title: 'JJSS 저장 위치',
                message: error.message,
                detail,
                buttons,
                defaultId: 0,
                cancelId: buttons.length - 1,
                noLink: true,
            });
            if (response === 0) continue;
            if (canSwitch && response === 1) {
                await setJjssRoot(app, documentsRoot);
                continue;
            }
            error.userCanceled = true;
            throw error;
        }
    }
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

// Windows 경로는 대소문자를 구분하지 않으므로 platform에 맞는 규칙으로 비교한다.
function isPathInside(root, candidate, platform = process.platform) {
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    const normalizeForComparison = value => platform === 'win32'
        ? pathApi.resolve(value).toLocaleLowerCase('en-US')
        : pathApi.resolve(value);
    const relative = pathApi.relative(normalizeForComparison(root), normalizeForComparison(candidate));
    return relative !== '' && !relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative);
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
        '.csv': 'CSV 문서', '.txt': '텍스트 문서', '.zip': 'ZIP 압축 파일', '.jpg': 'JPEG 이미지', '.jpeg': 'JPEG 이미지', '.webp': 'WebP 이미지',
    };
    return [{ name: labelByExtension[extension] || 'JJSS 파일', extensions: [extension.slice(1)] }];
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
    savedDirectoriesByToken.set(openToken, { filePath, directory: path.dirname(filePath), createdAt: now });
    return openToken;
}

async function chooseSavePath({ app, dialog, category, fileName, browserWindow, rootOptions }) {
    const { extension } = validateFileName(category, fileName);
    let paths;
    try {
        paths = await ensureJjssFoldersWithRecovery({ app, dialog, browserWindow, rootOptions });
    } catch (error) {
        if (error?.userCanceled) return { canceled: true };
        throw error;
    }
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
    try {
        await fsp.mkdir(selectedDirectory, { recursive: true });
    } catch (error) {
        throw toFileWriteError(error);
    }
    lastSaveDirectories.set(category, selectedDirectory);
    try {
        await persistSavePreferences(app);
    } catch (error) {
        warnInDevelopment(app, '[JJSS file preferences]', 'save', error);
    }
    return { canceled: false, filePath: selectedPath, paths };
}

function toFileWriteError(error) {
    switch (error?.code) {
        case 'EBUSY':
            return new Error('파일이 한글/Word 등 다른 프로그램에서 열려 있습니다. 닫은 뒤 다시 저장해 주세요.');
        case 'ENOSPC':
        case 'EDQUOT':
            return new Error('저장 공간이 부족합니다. 필요 없는 파일을 정리하거나 다른 드라이브·폴더를 선택해 주세요.');
        case 'EACCES':
        case 'EPERM':
        case 'EROFS':
            return new Error('선택한 위치에 파일을 저장할 권한이 없습니다. 파일이 읽기 전용인지 확인하거나 다른 폴더를 선택해 주세요.');
        case 'ENOENT':
            return new Error('선택한 저장 폴더를 찾거나 만들 수 없습니다. 다른 위치를 선택해 주세요.');
        case 'ENAMETOOLONG':
            return new Error('폴더 경로와 파일명이 너무 깁니다. 더 짧은 이름이나 상위 폴더를 선택해 주세요.');
        default:
            return new Error('파일을 디스크에 기록하지 못했습니다. 경로와 사용 가능한 저장 공간을 확인해 주세요.');
    }
}

async function verifyWrittenFile(filePath, expectedSize) {
    const written = await fsp.stat(filePath);
    if (!written.isFile() || written.size !== expectedSize || written.size <= 0) {
        const error = new Error('저장 후 파일 검증에 실패했습니다.');
        error.code = VERIFY_FAILED_CODE;
        throw error;
    }
}

async function writeVerifiedFile(app, filePath, bytes) {
    try {
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        await fsp.writeFile(filePath, bytes);
        await verifyWrittenFile(filePath, bytes.length);
    } catch (error) {
        warnInDevelopment(app, '[JJSS file save]', 'file-write', error);
        if (error?.code === VERIFY_FAILED_CODE) throw error;
        throw toFileWriteError(error);
    }
}

async function saveBuffer({ app, dialog, category, fileName, data, browserWindow, rootOptions }) {
    const buffer = normalizeBytes(data);
    if (!buffer.length || buffer.length > MAX_SAVE_BYTES) throw new Error('저장할 파일의 크기가 허용 범위를 벗어났습니다.');
    if (path.extname(fileName).toLowerCase() === '.png' && !hasPngSignature(buffer)) {
        throw new Error('생성된 PNG 파일의 형식이 올바르지 않습니다.');
    }
    const destination = await chooseSavePath({ app, dialog, category, fileName, browserWindow, rootOptions });
    if (destination.canceled || destination.error) return destination;
    await writeVerifiedFile(app, destination.filePath, buffer);
    return { canceled: false, filePath: destination.filePath, category, openToken: registerSavedDirectory(destination.filePath) };
}

function lockDownPrintWindow(printWindow) {
    const contents = printWindow.webContents;
    // 인쇄용 창은 문서만 그린다. 다른 주소로 이동하거나 새 창을 여는 동작은 모두 막는다.
    contents.on('will-navigate', event => event.preventDefault());
    contents.on('will-redirect', event => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

async function savePdf({ app, dialog, BrowserWindow, category, fileName, html, browserWindow, rootOptions }) {
    validateFileName(category, fileName);
    if (path.extname(fileName).toLowerCase() !== '.pdf') {
        throw new Error('PDF 저장 분류가 올바르지 않습니다.');
    }
    if (typeof html !== 'string' || html.length < 1 || Buffer.byteLength(html, 'utf8') > 20 * 1024 * 1024) {
        throw new Error('PDF 문서 데이터 크기가 허용 범위를 벗어났습니다.');
    }
    const destination = await chooseSavePath({ app, dialog, category, fileName, browserWindow, rootOptions });
    if (destination.canceled || destination.error) return destination;

    // data: URL은 약 2MB 길이 한계가 있어 긴 한글 문서·이미지가 실패한다. 임시 HTML 파일로 불러온다.
    const tempParent = app.getPath('temp');
    await fsp.mkdir(tempParent, { recursive: true });
    const tempDirectory = await fsp.mkdtemp(path.join(tempParent, 'jjss-pdf-'));
    const tempHtmlPath = path.join(tempDirectory, 'print.html');
    let printWindow = null;
    try {
        await fsp.writeFile(tempHtmlPath, html, { encoding: 'utf8', mode: 0o600 });
        printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                javascript: false,
                webSecurity: true,
            },
        });
        lockDownPrintWindow(printWindow);
        await printWindow.loadFile(tempHtmlPath);
        const pdf = await printWindow.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
        });
        if (!pdf.length || pdf.length > MAX_SAVE_BYTES || !hasPdfSignature(pdf)) throw new Error('생성된 PDF 파일의 형식이 올바르지 않습니다.');
        await writeVerifiedFile(app, destination.filePath, pdf);
        return { canceled: false, filePath: destination.filePath, category, openToken: registerSavedDirectory(destination.filePath) };
    } finally {
        if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
        await fsp.rm(tempDirectory, { recursive: true, force: true }).catch(error => {
            warnInDevelopment(app, '[JJSS file save]', 'temp-cleanup', error);
        });
    }
}

// 앱이 PDF 생성 도중 강제 종료되면 개인정보가 담긴 임시 HTML이 남을 수 있어 시작할 때 정리한다.
async function cleanupStalePdfTempFiles(app, maxAgeMs = 60 * 60 * 1000) {
    const tempParent = app.getPath('temp');
    let entries;
    try {
        entries = await fsp.readdir(tempParent, { withFileTypes: true });
    } catch {
        return 0;
    }
    let removed = 0;
    const now = Date.now();
    for (const entry of entries) {
        if (!entry.isDirectory() || !/^jjss-pdf-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
        const directory = path.join(tempParent, entry.name);
        try {
            const info = await fsp.stat(directory);
            if (now - info.mtimeMs < maxAgeMs) continue;
            await fsp.rm(directory, { recursive: true, force: true });
            removed += 1;
        } catch {
            // 다른 프로그램이 잡고 있으면 다음 실행 때 다시 시도한다.
        }
    }
    return removed;
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

// 읽을 수 없는 하위 폴더·파일은 건너뛰고 개수만 센다. 최대 개수에 도달하면 truncated로 알린다.
async function scanLegacyFolder(sourceFolder, includeSubfolders = true) {
    let sourceRoot;
    try {
        sourceRoot = await fsp.realpath(sourceFolder);
    } catch {
        throw new Error('선택한 폴더를 읽을 수 없습니다. 폴더가 있는지, 접근 권한이 있는지 확인해 주세요.');
    }
    const pendingDirectories = [{ directory: sourceRoot, depth: 0 }];
    const visitedDirectories = new Set();
    const candidates = [];
    let skippedDirectories = 0;
    let skippedFiles = 0;
    let truncated = false;
    while (pendingDirectories.length && !truncated) {
        const current = pendingDirectories.shift();
        let realDirectory;
        let directoryEntries;
        try {
            realDirectory = await fsp.realpath(current.directory);
            if (realDirectory !== sourceRoot && !isPathInside(sourceRoot, realDirectory)) continue;
            if (visitedDirectories.has(realDirectory)) continue;
            visitedDirectories.add(realDirectory);
            directoryEntries = await fsp.readdir(realDirectory, { withFileTypes: true });
        } catch {
            if (current.directory === sourceRoot) {
                throw new Error('선택한 폴더를 읽을 수 없습니다. 폴더가 있는지, 접근 권한이 있는지 확인해 주세요.');
            }
            skippedDirectories += 1;
            continue;
        }
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
            let stat;
            try {
                stat = await fsp.lstat(fullPath);
            } catch {
                skippedFiles += 1;
                continue;
            }
            if (stat.isSymbolicLink() || !stat.isFile()) continue;
            if (stat.size <= 0 || stat.size > MAX_IMPORT_BYTES) continue;
            if (candidates.length >= MAX_IMPORT_FILES) {
                truncated = true;
                break;
            }
            candidates.push({
                name: entry.name,
                category,
                size: stat.size,
                sourcePath: fullPath,
                relativePath: path.relative(sourceRoot, fullPath),
            });
        }
    }
    return { candidates, truncated, skippedDirectories, skippedFiles };
}

function summarizeCandidates(candidates) {
    const summary = {};
    for (const candidate of candidates) {
        summary[candidate.category] = (summary[candidate.category] || 0) + 1;
    }
    return summary;
}

function describeImportError(error) {
    switch (error?.code) {
        case VERIFY_FAILED_CODE: return '복사한 파일 검증에 실패해 원본을 그대로 두었습니다.';
        case 'EBUSY': return '다른 프로그램에서 열려 있어 가져오지 못했습니다.';
        case 'ENOENT': return '원본 파일을 찾을 수 없습니다(이동되었거나 삭제됨).';
        case 'EACCES':
        case 'EPERM': return '파일에 접근할 권한이 없습니다.';
        case 'ENOSPC':
        case 'EDQUOT': return '저장 공간이 부족합니다.';
        case 'ENAMETOOLONG': return '경로가 너무 깁니다.';
        default:
            return typeof error?.message === 'string' && /[가-힣]/.test(error.message)
                ? error.message
                : '파일을 가져오지 못했습니다.';
    }
}

async function importOneCandidate(candidate, paths, mode) {
    validateFileName(candidate.category, candidate.name);
    const destinationDirectory = paths.categories[candidate.category];
    await fsp.mkdir(destinationDirectory, { recursive: true });
    const destinationPath = await findAvailableDestination(destinationDirectory, candidate.name);
    await fsp.copyFile(candidate.sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);

    let verified = false;
    try {
        const [sourceStat, destinationStat, sourceHash, destinationHash] = await Promise.all([
            fsp.stat(candidate.sourcePath),
            fsp.stat(destinationPath),
            hashFile(candidate.sourcePath),
            hashFile(destinationPath),
        ]);
        verified = sourceStat.size === destinationStat.size && sourceHash === destinationHash;
    } catch {
        verified = false;
    }
    if (!verified) {
        await fsp.unlink(destinationPath).catch(() => undefined);
        const error = new Error('복사 검증에 실패해 원본 파일을 유지했습니다.');
        error.code = VERIFY_FAILED_CODE;
        throw error;
    }
    const result = {
        name: candidate.name,
        savedName: path.basename(destinationPath),
        category: candidate.category,
        sourceDeleted: false,
    };
    if (mode === 'move') {
        try {
            await fsp.unlink(candidate.sourcePath);
            result.sourceDeleted = true;
        } catch (error) {
            // 복사본은 검증까지 끝났으므로 성공으로 처리하고, 원본이 남았다는 사실만 알린다.
            result.warning = `원본 파일은 지우지 못했습니다(${describeImportError(error)}). 복사본은 저장되었습니다.`;
        }
    }
    return result;
}

// 파일마다 따로 처리해 하나가 실패해도 나머지는 계속 가져온다.
// 반환 배열은 candidates와 같은 순서이며 실패 항목은 { failed: true, reason }을 가진다.
async function importCandidates({ app, candidates, mode, rootOptions, dialog, browserWindow }) {
    if (!['copy', 'move'].includes(mode)) throw new Error('가져오기 방식이 올바르지 않습니다.');
    const paths = await ensureJjssFoldersWithRecovery({ app, dialog, browserWindow, rootOptions });
    const results = [];
    for (const candidate of candidates) {
        try {
            results.push(await importOneCandidate(candidate, paths, mode));
        } catch (error) {
            warnInDevelopment(app, '[JJSS legacy import]', 'file', error);
            results.push({
                name: candidate.name,
                category: candidate.category,
                relativePath: candidate.relativePath,
                failed: true,
                reason: describeImportError(error),
            });
        }
    }
    return results;
}

function registerJjssFileIpc({ app, ipcMain, dialog, shell, BrowserWindow, expectedIndexPath, rootOptions }) {
    const pendingImports = new Map();
    const withTrustedSender = handler => async (event, payload) => {
        validateSender(event, expectedIndexPath);
        return handler(event, payload);
    };
    const currentWindow = event => BrowserWindow.fromWebContents(event.sender) || undefined;

    ipcMain.handle('jjss-files:get-paths', withTrustedSender(async () => {
        const paths = await ensureJjssFolders(app, rootOptions);
        return { root: paths.root, appData: paths.appData, backup: paths.backup, documents: paths.documents, categories: paths.categories };
    }));

    ipcMain.handle('jjss-files:save-file', withTrustedSender(async (event, payload = {}) => saveBuffer({
        app, dialog, category: payload.category, fileName: payload.fileName, data: payload.data, browserWindow: currentWindow(event), rootOptions,
    })));

    ipcMain.handle('jjss-files:save-pdf', withTrustedSender(async (event, payload = {}) => savePdf({
        app, dialog, BrowserWindow, category: payload.category, fileName: payload.fileName, html: payload.html, browserWindow: currentWindow(event), rootOptions,
    })));

    ipcMain.handle('jjss-files:open-folder', withTrustedSender(async (event, folderKey) => {
        if (typeof folderKey !== 'string' || !FOLDER_KEYS.has(folderKey)) throw new Error('허용되지 않은 폴더 요청입니다.');
        const paths = await ensureJjssFoldersWithRecovery({ app, dialog, browserWindow: currentWindow(event), rootOptions });
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
        // 파일이 그대로 있으면 탐색기에서 해당 파일을 선택한 상태로 연다.
        const fileInfo = await fsp.stat(saved.filePath).catch(() => null);
        if (fileInfo?.isFile()) {
            shell.showItemInFolder(saved.filePath);
            return { opened: true };
        }
        const info = await fsp.stat(saved.directory).catch(() => null);
        if (!info?.isDirectory()) throw new Error('저장된 파일의 폴더를 찾지 못했습니다.');
        const result = await shell.openPath(saved.directory);
        if (result) throw new Error('저장된 파일의 폴더를 열지 못했습니다.');
        return { opened: true };
    }));

    ipcMain.handle('jjss-files:choose-import-folder', withTrustedSender(async (event, payload = {}) => {
        const browserWindow = currentWindow(event);
        const selected = await dialog.showOpenDialog(browserWindow, {
            title: '기존 JJSS 문서 폴더 선택',
            defaultPath: app.getPath('downloads'),
            properties: ['openDirectory'],
        });
        if (selected.canceled || selected.filePaths.length !== 1) return { canceled: true };
        const sourceFolder = path.resolve(selected.filePaths[0]);
        const paths = await ensureJjssFoldersWithRecovery({ app, dialog, browserWindow, rootOptions });
        if (sourceFolder === path.resolve(paths.root) || isPathInside(paths.root, sourceFolder)) {
            return { canceled: false, error: 'source-inside-jjss-root' };
        }
        const includeSubfolders = payload.includeSubfolders !== false;
        const scan = await scanLegacyFolder(sourceFolder, includeSubfolders);
        const now = Date.now();
        for (const [key, value] of pendingImports) {
            if (now - value.createdAt > IMPORT_TOKEN_TTL_MS && !value.inFlight) pendingImports.delete(key);
        }
        while (pendingImports.size >= MAX_PENDING_IMPORTS) {
            const oldestToken = pendingImports.keys().next().value;
            if (!oldestToken) break;
            pendingImports.delete(oldestToken);
        }
        const token = crypto.randomUUID();
        pendingImports.set(token, { createdAt: now, candidates: scan.candidates, completed: new Map(), inFlight: false });
        return {
            canceled: false,
            token,
            sourceFolder,
            includeSubfolders,
            total: scan.candidates.length,
            truncated: scan.truncated,
            maxFiles: MAX_IMPORT_FILES,
            skippedDirectories: scan.skippedDirectories,
            skippedFiles: scan.skippedFiles,
            summary: summarizeCandidates(scan.candidates),
            files: scan.candidates.map(({ name, category, size, relativePath }) => ({ name, category, size, relativePath })),
        };
    }));

    // 같은 token으로 다시 요청하면 이미 가져온 파일은 건너뛰고 실패한 파일만 다시 시도한다(중복 파일 생성 방지).
    // 모든 파일이 성공했을 때만 token을 지운다.
    ipcMain.handle('jjss-files:import-legacy-documents', withTrustedSender(async (event, payload = {}) => {
        const token = typeof payload.token === 'string' ? payload.token : '';
        const pending = token ? pendingImports.get(token) : null;
        if (!pending || Date.now() - pending.createdAt > IMPORT_TOKEN_TTL_MS) {
            if (pending && !pending.inFlight) pendingImports.delete(token);
            throw new Error('가져오기 미리보기가 만료되었습니다. 폴더를 다시 선택해 주세요.');
        }
        if (pending.inFlight) throw new Error('파일을 가져오는 중입니다. 끝날 때까지 기다려 주세요.');
        pending.inFlight = true;
        try {
            const remaining = pending.candidates.filter(candidate => !pending.completed.has(candidate.sourcePath));
            const attemptResults = await importCandidates({
                app, candidates: remaining, mode: payload.mode, rootOptions, dialog, browserWindow: currentWindow(event),
            });
            const failures = new Map();
            attemptResults.forEach((result, index) => {
                const sourcePath = remaining[index].sourcePath;
                if (result.failed) failures.set(sourcePath, result);
                else pending.completed.set(sourcePath, result);
            });
            if (failures.size === 0) {
                pendingImports.delete(token);
            } else {
                pending.createdAt = Date.now();
            }
            const results = pending.candidates
                .map(candidate => pending.completed.get(candidate.sourcePath) || failures.get(candidate.sourcePath))
                .filter(Boolean);
            return {
                imported: pending.completed.size,
                failed: failures.size,
                retryAvailable: failures.size > 0,
                mode: payload.mode,
                results,
            };
        } catch (error) {
            if (error?.userCanceled) error.message = `${error.message} 가져오기를 취소했습니다.`;
            throw error;
        } finally {
            pending.inFlight = false;
        }
    }));
}

module.exports = {
    CATEGORY_CONFIG,
    ROOT_UNAVAILABLE_CODE,
    classifyLegacyFileName,
    chooseSavePath,
    cleanupStalePdfTempFiles,
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
    setJjssRoot,
    toFileWriteError,
    validateFileName,
    validateSender,
};
