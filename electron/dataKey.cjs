const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { validateSender } = require('./fileService.cjs');

const DATA_KEY_FILE_NAME = 'jjss-data-key.bin';
const DATA_KEY_BYTES = 32;
const pendingKeyRequests = new Map();
const cachedKeys = new Map();

function getDataKeyPath(app) {
    return path.join(app.getPath('userData'), DATA_KEY_FILE_NAME);
}

function isValidBase64Key(value) {
    return typeof value === 'string'
        && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
        && Buffer.from(value, 'base64').length === DATA_KEY_BYTES;
}

function isEncryptionUsable(safeStorage, platform) {
    if (!safeStorage?.isEncryptionAvailable?.()) return false;
    // Linux에서 키링이 없으면 평문과 같은 basic_text로 동작하므로 사용하지 않는다.
    if (platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false;
    return true;
}

function decryptStoredKey(safeStorage, encrypted) {
    try {
        const decrypted = safeStorage.decryptString(encrypted);
        return isValidBase64Key(decrypted) ? decrypted : null;
    } catch {
        return null;
    }
}

// 새 키 파일은 "없을 때만" 만든다. 임시 파일을 쓴 뒤 link(대상이 있으면 실패)로 옮겨
// 동시에 두 요청이 와도 기존 키를 덮어쓰지 않는다.
async function createKeyFileIfMissing(keyPath, encrypted) {
    const tempPath = `${keyPath}.${crypto.randomUUID()}.tmp`;
    try {
        const handle = await fsp.open(tempPath, 'wx', 0o600);
        try {
            await handle.writeFile(encrypted);
            await handle.sync();
        } finally {
            await handle.close();
        }
        try {
            await fsp.link(tempPath, keyPath);
            return true;
        } catch (error) {
            if (error?.code === 'EEXIST') return false;
            // 하드 링크를 지원하지 않는 저장소: 대상이 없을 때만 이름을 바꾼다.
            try {
                await fsp.access(keyPath);
                return false;
            } catch {
                await fsp.rename(tempPath, keyPath);
                return true;
            }
        }
    } finally {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    }
}

async function readOrCreateDataKey({ app, safeStorage, platform = process.platform }) {
    if (!isEncryptionUsable(safeStorage, platform)) return null;
    const keyPath = getDataKeyPath(app);

    let existing = null;
    try {
        existing = await fsp.readFile(keyPath);
    } catch (error) {
        if (error?.code !== 'ENOENT') return null;
    }
    // 파일이 있는데 풀리지 않으면(다른 PC·다른 계정에서 복사 등) 절대 새로 만들지 않고 null을 돌려준다.
    if (existing) return decryptStoredKey(safeStorage, existing);

    const newKey = crypto.randomBytes(DATA_KEY_BYTES).toString('base64');
    const encrypted = safeStorage.encryptString(newKey);
    await fsp.mkdir(path.dirname(keyPath), { recursive: true });
    await createKeyFileIfMissing(keyPath, encrypted);

    // 실제로 저장된 파일을 다시 읽어 확인한다(다른 요청이 먼저 만들었다면 그 키를 쓴다).
    const stored = await fsp.readFile(keyPath);
    return decryptStoredKey(safeStorage, stored);
}

async function getDataKey(options) {
    const keyPath = getDataKeyPath(options.app);
    if (cachedKeys.has(keyPath)) return cachedKeys.get(keyPath);
    if (!pendingKeyRequests.has(keyPath)) {
        pendingKeyRequests.set(keyPath, readOrCreateDataKey(options)
            .then(key => {
                if (key) cachedKeys.set(keyPath, key);
                return key;
            })
            .catch(error => {
                if (!options.app?.isPackaged) {
                    console.warn('[JJSS data key]', { errorName: error?.name || 'Error', errorCode: error?.code });
                }
                return null;
            })
            .finally(() => pendingKeyRequests.delete(keyPath)));
    }
    return pendingKeyRequests.get(keyPath);
}

/** 렌더러에 알려 주는 최소 상태(키 값·경로 없음). 배포용 앱의 fail-closed 판단에 쓴다. */
function getSecureStatus({ app, safeStorage, platform = process.platform }) {
    let available = false;
    try {
        available = isEncryptionUsable(safeStorage, platform);
    } catch {
        available = false;
    }
    return { available, packaged: Boolean(app?.isPackaged), platform: String(platform) };
}

function registerDataKeyIpc({ app, ipcMain, safeStorage, expectedIndexPath }) {
    ipcMain.handle('jjss-secure:get-data-key', async event => {
        validateSender(event, expectedIndexPath);
        return getDataKey({ app, safeStorage });
    });
    ipcMain.handle('jjss-secure:get-status', async event => {
        validateSender(event, expectedIndexPath);
        return getSecureStatus({ app, safeStorage });
    });
}

module.exports = { DATA_KEY_FILE_NAME, getDataKey, getSecureStatus, registerDataKeyIpc };
