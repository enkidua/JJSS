// 공유 저장소(기관 Google Workspace 공유 드라이브) — main 프로세스 쪽.
//
// - 로그인: 시스템 브라우저 + 127.0.0.1 루프백 + PKCE(S256). 관리자가 등록한 기관 내부(Internal) OAuth 클라이언트를 쓴다.
//   로그인한 계정의 hd(호스팅 도메인)·메일 도메인이 설정한 기관 도메인과 같아야 받아들인다.
// - 토큰(refresh token)·클라이언트 비밀·기관 키는 운영체제 보안 저장소(safeStorage)로 암호화해 사용자 데이터 폴더에 둔다.
//   safeStorage를 쓸 수 없으면 저장하지 않는다(평문 저장 없음). access token은 메모리에만 둔다. 렌더러에는 토큰을 주지 않는다.
// - 드라이브 범위는 drive 전체 권한이 필요하다(drive.file은 "이 사용자가 이 앱으로 만든 파일"만 보여 여러 직원이 공유할 수 없다).
//   대신 코드에서 모든 요청을 선택한 공유 드라이브 하나로 제한한다(파일 id마다 driveId 확인).
// - 요청 주소는 구글 고정 주소만 쓴다. 429·5xx는 잠시 기다렸다 다시 시도한다(최대 3번).

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive'];
const CONFIG_FILE = 'shared-drive.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'JJSS 사례관리';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const RECORD_PROPERTY_KEYS = new Set(['jjssKind', 'store', 'rid', 'version', 'updatedAt', 'updatedBy', 'deleted', 'keyId', 'hash', 'editingBy', 'editingSince']);
const EDITING_PROPERTY_KEYS = new Set(['editingBy', 'editingSince']);

class DriveError extends Error {
    constructor(message, code, status) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function base64url(buffer) {
    return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJwtPayload(token) {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    try {
        return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    } catch {
        return null;
    }
}

function validDomain(domain) {
    return /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(String(domain || ''));
}

function validDriveObjectId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{8,200}$/.test(id);
}

function validPageToken(token) {
    return typeof token === 'string' && token.length > 0 && token.length < 4096 && !/[\u0000-\u001f\s]/.test(token);
}

function escapeQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Drive appProperties: 허용한 키만, 값은 문자열(키+값 124바이트 제한) */
function sanitizeProperties(properties, allowed, allowNull = false) {
    const out = {};
    for (const [key, value] of Object.entries(properties || {})) {
        if (!allowed.has(key)) throw new DriveError(`허용하지 않은 파일 속성입니다: ${key}`, 'DRIVE_BAD_PROPERTY');
        if (value === null && allowNull) {
            out[key] = null;
            continue;
        }
        const text = String(value ?? '');
        if (Buffer.byteLength(key + text, 'utf8') > 124) throw new DriveError(`파일 속성이 너무 깁니다: ${key}`, 'DRIVE_BAD_PROPERTY');
        out[key] = text;
    }
    return out;
}

function userMessage(error) {
    if (error instanceof DriveError) return error.message;
    const text = String(error?.message || '').toLowerCase();
    if (/enotfound|econnrefused|etimedout|network|fetch failed/.test(text)) return '인터넷에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
    return '공유 저장소 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function createDriveService(deps) {
    const {
        app, ipcMain, shell, safeStorage, fs, path, http, crypto,
        fetchFn = globalThis.fetch,
        validateSender, expectedIndexPath,
        logMainError = () => {},
        copyLocalData,
        sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
        now = () => Date.now(),
    } = deps;

    const configPath = () => path.join(app.getPath('userData'), CONFIG_FILE);
    let config = null;
    let accessToken = null;
    let accessTokenExpiresAt = 0;
    const verifiedFileIds = new Set();

    function readConfig() {
        if (config) return config;
        try {
            config = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
        } catch {
            config = {};
        }
        return config;
    }

    function writeConfig(patch) {
        config = { ...readConfig(), ...patch };
        for (const [key, value] of Object.entries(config)) if (value === undefined) delete config[key];
        const target = configPath();
        const temp = `${target}.tmp`;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(temp, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temp, target);
    }

    function seal(text) {
        if (!safeStorage?.isEncryptionAvailable?.()) {
            throw new DriveError('이 PC의 운영체제 보안 저장소를 쓸 수 없어 공유 저장소 정보를 저장하지 않았습니다.', 'DRIVE_SECURE_STORE_UNAVAILABLE');
        }
        return safeStorage.encryptString(String(text)).toString('base64');
    }

    function unseal(sealed) {
        if (!sealed) return '';
        try {
            return safeStorage.decryptString(Buffer.from(sealed, 'base64'));
        } catch {
            return '';
        }
    }

    function status() {
        const current = readConfig();
        return {
            configured: Boolean(current.clientId && current.clientSecret && current.domain),
            domain: current.domain || '',
            clientIdHint: current.clientId ? `${String(current.clientId).slice(0, 8)}…` : '',
            accountEmail: current.accountEmail || '',
            signedIn: Boolean(current.refreshToken),
            driveId: current.driveId || '',
            driveName: current.driveName || '',
            enabled: Boolean(current.enabled),
            hasOrgKey: Boolean(current.orgKey),
            secureStorage: Boolean(safeStorage?.isEncryptionAvailable?.()),
        };
    }

    // ─── OAuth ───

    function configure({ clientId, clientSecret, domain } = {}) {
        const id = String(clientId || '').trim();
        const secret = String(clientSecret || '').trim();
        const orgDomain = String(domain || '').trim().toLowerCase();
        if (!/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i.test(id)) throw new DriveError('OAuth 클라이언트 ID 형식이 아닙니다. "…apps.googleusercontent.com"으로 끝나는 값을 넣어 주세요.', 'DRIVE_BAD_CLIENT');
        if (!secret || secret.length > 200) throw new DriveError('OAuth 클라이언트 보안 비밀을 넣어 주세요.', 'DRIVE_BAD_CLIENT');
        if (!validDomain(orgDomain)) throw new DriveError('기관 도메인 형식이 아닙니다(예: example.org).', 'DRIVE_BAD_DOMAIN');
        const current = readConfig();
        const changed = current.clientId !== id || current.domain !== orgDomain;
        writeConfig({
            clientId: id,
            clientSecret: seal(secret),
            domain: orgDomain,
            ...(changed ? { refreshToken: undefined, accountEmail: undefined, driveId: undefined, driveName: undefined, folders: undefined, enabled: false } : {}),
        });
        return status();
    }

    async function tokenRequest(params) {
        const current = readConfig();
        const body = new URLSearchParams({ client_id: current.clientId, client_secret: unseal(current.clientSecret), ...params });
        const response = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const reason = String(payload?.error || '');
            if (reason === 'invalid_grant') throw new DriveError('구글 로그인이 만료되었거나 취소되었습니다. 설정 → 공유 저장소에서 다시 로그인해 주세요.', 'DRIVE_SIGN_IN_REQUIRED', 401);
            if (reason === 'invalid_client' || reason === 'unauthorized_client') throw new DriveError('OAuth 클라이언트 ID·보안 비밀이 맞지 않습니다. 관리자에게 확인해 주세요.', 'DRIVE_BAD_CLIENT', 401);
            throw new DriveError('구글 로그인을 처리하지 못했습니다.', 'DRIVE_TOKEN_FAILED', response.status);
        }
        return payload;
    }

    function verifyIdentity(idToken) {
        const domain = readConfig().domain;
        const claims = decodeJwtPayload(idToken);
        const email = String(claims?.email || '').toLowerCase();
        if (!claims || !email) throw new DriveError('구글 계정 정보를 확인하지 못했습니다.', 'DRIVE_IDENTITY_FAILED');
        if (claims.email_verified === false) throw new DriveError('확인되지 않은 메일 계정입니다.', 'DRIVE_IDENTITY_FAILED');
        if (String(claims.hd || '').toLowerCase() !== domain || !email.endsWith(`@${domain}`)) {
            throw new DriveError(`기관 계정(@${domain})으로만 로그인할 수 있습니다. 로그인한 계정: ${email}`, 'DRIVE_WRONG_DOMAIN');
        }
        return email;
    }

    function signIn() {
        const current = readConfig();
        if (!current.clientId || !current.clientSecret || !current.domain) throw new DriveError('먼저 관리자 설정(클라이언트 ID·보안 비밀·기관 도메인)을 넣어 주세요.', 'DRIVE_NOT_CONFIGURED');
        const verifier = base64url(crypto.randomBytes(48));
        const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
        const state = base64url(crypto.randomBytes(24));
        return new Promise((resolve, reject) => {
            let settled = false;
            let handling = false;
            let timer = null;
            const server = http.createServer(async (request, response) => {
                const url = new URL(request.url, 'http://127.0.0.1');
                const finish = (ok, message) => {
                    response.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
                    response.end(`<!doctype html><meta charset="utf-8"><title>JJSS</title><body style="font-family:sans-serif;padding:40px"><h2>${ok ? '로그인되었습니다' : '로그인하지 못했습니다'}</h2><p>${message}</p><p>이 창을 닫고 JJSS로 돌아가세요.</p></body>`);
                };
                // 다른 요청(다른 경로, state가 다른 요청, 브라우저가 같은 주소를 두 번 여는 경우)은 로그인을 끝내지 않고 거절만 한다.
                if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
                    response.writeHead(404);
                    response.end();
                    return;
                }
                if (settled || handling) {
                    finish(settled, settled ? '이미 로그인을 마쳤습니다.' : '로그인을 처리하는 중입니다.');
                    return;
                }
                handling = true;
                try {
                    if (url.searchParams.get('error')) throw new DriveError('로그인을 취소했거나 허용하지 않았습니다.', 'DRIVE_SIGN_IN_DENIED');
                    const code = url.searchParams.get('code');
                    if (!code) throw new DriveError('로그인 코드를 받지 못했습니다.', 'DRIVE_SIGN_IN_FAILED');
                    const address = server.address();
                    const tokens = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: `http://127.0.0.1:${address.port}` });
                    const email = verifyIdentity(tokens.id_token);
                    if (!tokens.refresh_token) throw new DriveError('구글이 갱신 토큰을 주지 않았습니다. 다시 로그인해 주세요.', 'DRIVE_SIGN_IN_FAILED');
                    writeConfig({ refreshToken: seal(tokens.refresh_token), accountEmail: email });
                    accessToken = tokens.access_token || null;
                    accessTokenExpiresAt = now() + Math.max(0, Number(tokens.expires_in || 0) - 60) * 1000;
                    settled = true;
                    finish(true, `${email} 계정으로 로그인했습니다.`);
                    resolve(status());
                } catch (error) {
                    settled = true;
                    finish(false, userMessage(error));
                    reject(error instanceof DriveError ? error : new DriveError(userMessage(error), 'DRIVE_SIGN_IN_FAILED'));
                } finally {
                    if (settled) {
                        clearTimeout(timer);
                        setTimeout(() => server.close(), 50);
                    }
                }
            });
            server.on('error', error => reject(new DriveError(userMessage(error), 'DRIVE_SIGN_IN_FAILED')));
            server.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                const query = new URLSearchParams({
                    client_id: current.clientId,
                    redirect_uri: `http://127.0.0.1:${port}`,
                    response_type: 'code',
                    scope: SCOPES.join(' '),
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                    state,
                    hd: current.domain,
                    access_type: 'offline',
                    prompt: 'consent select_account',
                });
                timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    server.close();
                    reject(new DriveError('로그인 시간이 지났습니다(5분). 다시 시도해 주세요.', 'DRIVE_SIGN_IN_TIMEOUT'));
                }, SIGN_IN_TIMEOUT_MS);
                Promise.resolve(shell.openExternal(`${AUTH_URL}?${query.toString()}`)).catch(error => {
                    logMainError('shared-drive-open-browser-failed', error);
                });
            });
        });
    }

    async function signOut() {
        const current = readConfig();
        const refresh = unseal(current.refreshToken);
        if (refresh) {
            await fetchFn(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined);
        }
        accessToken = null;
        accessTokenExpiresAt = 0;
        verifiedFileIds.clear();
        writeConfig({ refreshToken: undefined, accountEmail: undefined, driveId: undefined, driveName: undefined, folders: undefined, orgKey: undefined, pendingOrgKey: undefined, enabled: false });
        return status();
    }

    async function getAccessToken(force = false) {
        if (!force && accessToken && now() < accessTokenExpiresAt) return accessToken;
        const refresh = unseal(readConfig().refreshToken);
        if (!refresh) throw new DriveError('공유 저장소에 로그인해 주세요.', 'DRIVE_SIGN_IN_REQUIRED', 401);
        const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
        accessToken = tokens.access_token;
        accessTokenExpiresAt = now() + Math.max(0, Number(tokens.expires_in || 0) - 60) * 1000;
        return accessToken;
    }

    // ─── Drive REST ───

    async function driveFetch(url, init = {}, { raw = false } = {}) {
        let refreshed = false;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const token = await getAccessToken();
            const response = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
            if (response.status === 401 && !refreshed) {
                refreshed = true;
                accessToken = null;
                continue;
            }
            if ((response.status === 429 || response.status >= 500 || response.status === 403) && attempt < 3) {
                const payload = response.status === 403 ? await response.clone().json().catch(() => ({})) : {};
                const reason = String(payload?.error?.errors?.[0]?.reason || '');
                if (response.status !== 403 || /rateLimitExceeded|userRateLimitExceeded/.test(reason)) {
                    await sleep(1000 * 2 ** attempt);
                    continue;
                }
            }
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const reason = String(payload?.error?.errors?.[0]?.reason || payload?.error?.status || '');
                if (response.status === 404) throw new DriveError('공유 드라이브나 파일을 찾지 못했습니다. 권한이 바뀌었는지 확인해 주세요.', 'DRIVE_NOT_FOUND', 404);
                if (response.status === 403) throw new DriveError(`공유 드라이브 권한이 없습니다${reason ? `(${reason})` : ''}. 관리자에게 구성원 권한을 확인해 주세요.`, 'DRIVE_FORBIDDEN', 403);
                throw new DriveError('공유 저장소 요청이 실패했습니다.', 'DRIVE_REQUEST_FAILED', response.status);
            }
            return raw ? response : response.json();
        }
        throw new DriveError('공유 저장소가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.', 'DRIVE_BUSY', 429);
    }

    function requireDrive() {
        const current = readConfig();
        if (!current.refreshToken) throw new DriveError('공유 저장소에 로그인해 주세요.', 'DRIVE_SIGN_IN_REQUIRED', 401);
        if (!current.driveId) throw new DriveError('공유 드라이브를 먼저 골라 주세요.', 'DRIVE_NOT_SELECTED');
        return current.driveId;
    }

    function driveListParams(extra) {
        const driveId = requireDrive();
        return new URLSearchParams({ corpora: 'drive', driveId, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', ...extra });
    }

    async function listSharedDrives() {
        const result = await driveFetch(`${DRIVE_URL}/drives?pageSize=100&fields=${encodeURIComponent('drives(id,name)')}`);
        return (result.drives || []).map(drive => ({ id: drive.id, name: drive.name }));
    }

    async function selectDrive(driveId) {
        if (!validDriveObjectId(driveId)) throw new DriveError('공유 드라이브 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        const drive = await driveFetch(`${DRIVE_URL}/drives/${encodeURIComponent(driveId)}?fields=id,name`);
        verifiedFileIds.clear();
        writeConfig({ driveId: drive.id, driveName: drive.name, folders: undefined, enabled: false });
        return status();
    }

    async function securityFacts() {
        const driveId = requireDrive();
        const current = readConfig();
        const drive = await driveFetch(`${DRIVE_URL}/drives/${encodeURIComponent(driveId)}?fields=${encodeURIComponent('id,name,restrictions,capabilities')}`);
        const permissions = [];
        let permissionsVisible = true;
        let pageToken;
        try {
            do {
                const params = new URLSearchParams({ supportsAllDrives: 'true', pageSize: '100', fields: 'nextPageToken,permissions(type,emailAddress,domain,role)' });
                if (pageToken) params.set('pageToken', pageToken);
                const page = await driveFetch(`${DRIVE_URL}/files/${encodeURIComponent(driveId)}/permissions?${params}`);
                permissions.push(...(page.permissions || []));
                pageToken = page.nextPageToken;
            } while (pageToken);
        } catch (error) {
            // 관리자(구성원 관리 권한)가 아니면 구성원 목록을 볼 수 없다 → 점검 결과에 "확인 못 함"으로 남긴다.
            if (error?.status !== 403) throw error;
            permissionsVisible = false;
            permissions.length = 0;
        }
        return {
            isSharedDrive: Boolean(drive?.id),
            driveName: drive?.name || '',
            restrictions: drive?.restrictions || {},
            permissions: permissions.map(item => ({ type: item.type, emailAddress: item.emailAddress, domain: item.domain, role: item.role })),
            permissionsVisible,
            accountEmail: current.accountEmail || '',
            accountIsMember: Boolean(drive?.capabilities?.canAddChildren),
        };
    }

    async function findFolder(name, parentId) {
        const params = driveListParams({
            q: `name='${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
            fields: 'files(id,name)',
            pageSize: '10',
        });
        const result = await driveFetch(`${DRIVE_URL}/files?${params}`);
        return result.files?.[0]?.id || null;
    }

    async function createFolder(name, parentId) {
        const result = await driveFetch(`${DRIVE_URL}/files?supportsAllDrives=true&fields=id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
        });
        return result.id;
    }

    const folderPromises = new Map();

    /** 폴더 id(캐시). 같은 폴더를 동시에 여러 번 만들지 않게 진행 중인 조회를 공유한다. */
    function ensureFolder(folderKey) {
        if (folderPromises.has(folderKey)) return folderPromises.get(folderKey);
        const pending = resolveFolder(folderKey).finally(() => folderPromises.delete(folderKey));
        folderPromises.set(folderKey, pending);
        return pending;
    }

    async function resolveFolder(folderKey) {
        const driveId = requireDrive();
        const current = readConfig();
        const folders = { ...(current.folders || {}) };
        if (folders[folderKey]) return folders[folderKey];
        const ensure = async (key, name, parent) => {
            if (folders[key]) return folders[key];
            folders[key] = (await findFolder(name, parent)) || (await createFolder(name, parent));
            return folders[key];
        };
        const rootId = await ensure('root', ROOT_FOLDER_NAME, driveId);
        let id;
        if (folderKey === 'meta') id = await ensure('meta', '_meta', rootId);
        else if (folderKey === 'seekers') id = await ensure('seekers', 'seekers', rootId);
        else {
            const match = /^documents\/(\d{4})$/.exec(String(folderKey));
            if (!match) throw new DriveError('알 수 없는 폴더입니다.', 'DRIVE_BAD_FOLDER');
            const documentsId = await ensure('documents', 'documents', rootId);
            id = await ensure(folderKey, match[1], documentsId);
        }
        writeConfig({ folders });
        return id;
    }

    /** 폴더 캐시를 버린다(누군가 드라이브에서 폴더를 지웠을 때 다음 올리기가 다시 찾거나 만든다). */
    function forgetFolders() {
        writeConfig({ folders: undefined });
    }

    const FILE_FIELDS = 'id,name,modifiedTime,trashed,driveId,appProperties';

    function toRemote(file) {
        if (file?.id) verifiedFileIds.add(file.id);
        return { id: file.id, name: file.name, modifiedTime: file.modifiedTime, appProperties: { ...(file.appProperties || {}) } };
    }

    async function assertInDrive(fileId) {
        if (!validDriveObjectId(fileId)) throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        if (verifiedFileIds.has(fileId)) return;
        const file = await driveFetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${FILE_FIELDS}`);
        if (file.driveId !== requireDrive()) throw new DriveError('선택한 공유 드라이브 밖의 파일입니다.', 'DRIVE_OUT_OF_SCOPE', 403);
        verifiedFileIds.add(fileId);
    }

    async function listRecords(pageToken) {
        const extra = {
            q: "appProperties has { key='jjssKind' and value='record' } and trashed=false",
            fields: `nextPageToken,files(${FILE_FIELDS})`,
            pageSize: '1000',
        };
        if (pageToken !== undefined && pageToken !== null) {
            if (!validPageToken(pageToken)) throw new DriveError('목록 토큰이 올바르지 않습니다.', 'DRIVE_BAD_TOKEN');
            extra.pageToken = pageToken;
        }
        const result = await driveFetch(`${DRIVE_URL}/files?${driveListParams(extra)}`);
        const driveId = requireDrive();
        return { files: (result.files || []).filter(file => file.driveId === driveId).map(toRemote), nextPageToken: result.nextPageToken };
    }

    async function getStartPageToken() {
        const driveId = requireDrive();
        const result = await driveFetch(`${DRIVE_URL}/changes/startPageToken?driveId=${encodeURIComponent(driveId)}&supportsAllDrives=true`);
        return String(result.startPageToken);
    }

    async function listChanges(pageToken) {
        if (!validPageToken(pageToken)) throw new DriveError('변경 토큰이 올바르지 않습니다.', 'DRIVE_BAD_TOKEN');
        const driveId = requireDrive();
        const params = new URLSearchParams({
            pageToken,
            driveId,
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
            pageSize: '1000',
            fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
        });
        const result = await driveFetch(`${DRIVE_URL}/changes?${params}`);
        const changes = (result.changes || [])
            .filter(change => !change.file || change.file.driveId === driveId)
            .map(change => ({ fileId: change.fileId, removed: Boolean(change.removed), file: change.file ? { ...toRemote(change.file), trashed: Boolean(change.file.trashed) } : undefined }));
        return { changes, nextPageToken: result.nextPageToken, newStartPageToken: result.newStartPageToken };
    }

    async function getFile(fileId) {
        if (!validDriveObjectId(fileId)) throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        try {
            const file = await driveFetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${FILE_FIELDS}`);
            if (file.driveId !== requireDrive()) throw new DriveError('선택한 공유 드라이브 밖의 파일입니다.', 'DRIVE_OUT_OF_SCOPE', 403);
            if (file.trashed) return null;
            return toRemote(file);
        } catch (error) {
            if (error?.status === 404) return null;
            throw error;
        }
    }

    async function download(fileId) {
        await assertInDrive(fileId);
        const response = await driveFetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, { raw: true });
        return new Uint8Array(await response.arrayBuffer());
    }

    async function upload({ fileId, folder, name, appProperties, content } = {}) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content || []);
        if (bytes.length > 20 * 1024 * 1024) throw new DriveError('파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
        const allowed = folder === 'meta' ? new Set(['jjssKind', 'keyId', 'updatedAt', 'updatedBy', ...RECORD_PROPERTY_KEYS]) : RECORD_PROPERTY_KEYS;
        const properties = sanitizeProperties(appProperties, allowed);
        const boundary = `jjss-${crypto.randomBytes(12).toString('hex')}`;
        let metadata;
        let url;
        let method;
        if (fileId) {
            await assertInDrive(fileId);
            metadata = { appProperties: properties };
            url = `${UPLOAD_URL}/files/${encodeURIComponent(fileId)}?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`;
            method = 'PATCH';
        } else {
            const parent = await ensureFolder(folder);
            metadata = { name, parents: [parent], appProperties: properties, mimeType: 'application/octet-stream' };
            url = `${UPLOAD_URL}/files?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`;
            method = 'POST';
        }
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
            Buffer.from(bytes),
            Buffer.from(`\r\n--${boundary}--`),
        ]);
        let file;
        try {
            file = await driveFetch(url, { method, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
        } catch (error) {
            // 새 파일을 만들 때 부모 폴더가 사라졌으면(누군가 드라이브에서 지움) 폴더 캐시를 버리고 한 번 다시 만든다.
            if (!(error instanceof DriveError) || error.code !== 'DRIVE_NOT_FOUND' || fileId) throw error;
            forgetFolders();
            const parent = await ensureFolder(folder);
            const retryMetadata = { ...metadata, parents: [parent] };
            const retryBody = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(retryMetadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
                Buffer.from(bytes),
                Buffer.from(`\r\n--${boundary}--`),
            ]);
            file = await driveFetch(url, { method, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: retryBody });
        }
        if (file.driveId && file.driveId !== requireDrive()) throw new DriveError('선택한 공유 드라이브 밖의 파일입니다.', 'DRIVE_OUT_OF_SCOPE', 403);
        return toRemote(file);
    }

    async function setProperties(fileId, appProperties) {
        await assertInDrive(fileId);
        const properties = sanitizeProperties(appProperties, EDITING_PROPERTY_KEYS, true);
        await driveFetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appProperties: properties }),
        });
    }

    async function findMeta(name) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        const metaId = await ensureFolder('meta');
        const params = driveListParams({ q: `name='${escapeQuery(name)}' and '${escapeQuery(metaId)}' in parents and trashed=false`, fields: `files(${FILE_FIELDS})`, pageSize: '5' });
        const result = await driveFetch(`${DRIVE_URL}/files?${params}`);
        const file = (result.files || []).find(item => item.driveId === requireDrive());
        return file ? toRemote(file) : null;
    }

    // ─── 기관 키·사용 여부·자료 사본 ───

    function setOrgKey(base64) {
        const bytes = Buffer.from(String(base64 || ''), 'base64');
        if (bytes.length !== 16) throw new DriveError('기관 키 길이가 올바르지 않습니다.', 'DRIVE_BAD_KEY');
        writeConfig({ orgKey: seal(bytes.toString('base64')) });
        return status();
    }

    function getOrgKey() {
        const value = unseal(readConfig().orgKey);
        return value || null;
    }

    /**
     * 기관 키 바꾸기를 시작하기 전에 새 키를 먼저 암호화해 둔다. 바꾸는 도중 앱이 꺼져도 같은 새 키로 이어서 할 수 있다
     * (새 키로 이미 다시 쓴 파일을 다른 키로는 열 수 없다). 끝나면 지운다.
     */
    function setPendingOrgKey(base64) {
        if (base64 === null) {
            writeConfig({ pendingOrgKey: undefined });
            return status();
        }
        const bytes = Buffer.from(String(base64 || ''), 'base64');
        if (bytes.length !== 16) throw new DriveError('기관 키 길이가 올바르지 않습니다.', 'DRIVE_BAD_KEY');
        writeConfig({ pendingOrgKey: seal(bytes.toString('base64')) });
        return status();
    }

    function getPendingOrgKey() {
        const value = unseal(readConfig().pendingOrgKey);
        return value || null;
    }

    function setEnabled(enabled) {
        if (enabled) {
            const current = readConfig();
            if (!current.refreshToken || !current.driveId || !current.orgKey) throw new DriveError('로그인·공유 드라이브 선택·기관 키 등록을 마친 뒤에 켤 수 있습니다.', 'DRIVE_NOT_READY');
        }
        writeConfig({ enabled: Boolean(enabled) });
        return status();
    }

    async function backupLocalData() {
        const copy = await copyLocalData({ fs, path, userDataPath: app.getPath('userData'), version: 'before-shared-drive', folderName: 'shared-drive-backups' });
        return { copied: Boolean(copy) };
    }

    const handlers = {
        'jjss-drive:get-status': async () => status(),
        'jjss-drive:configure': async input => configure(input),
        'jjss-drive:sign-in': async () => signIn(),
        'jjss-drive:sign-out': async () => signOut(),
        'jjss-drive:list-shared-drives': async () => listSharedDrives(),
        'jjss-drive:select-drive': async driveId => selectDrive(driveId),
        'jjss-drive:security-facts': async () => securityFacts(),
        'jjss-drive:list-records': async pageToken => listRecords(pageToken),
        'jjss-drive:get-start-token': async () => getStartPageToken(),
        'jjss-drive:list-changes': async pageToken => listChanges(pageToken),
        'jjss-drive:get-file': async fileId => getFile(fileId),
        'jjss-drive:download': async fileId => download(fileId),
        'jjss-drive:upload': async input => upload(input),
        'jjss-drive:set-properties': async (fileId, properties) => setProperties(fileId, properties),
        'jjss-drive:find-meta': async name => findMeta(name),
        'jjss-drive:set-org-key': async base64 => setOrgKey(base64),
        'jjss-drive:get-org-key': async () => getOrgKey(),
        'jjss-drive:set-pending-org-key': async base64 => setPendingOrgKey(base64),
        'jjss-drive:get-pending-org-key': async () => getPendingOrgKey(),
        'jjss-drive:set-enabled': async enabled => setEnabled(enabled),
        'jjss-drive:backup-local-data': async () => backupLocalData(),
    };

    function register() {
        for (const [channel, handler] of Object.entries(handlers)) {
            ipcMain.handle(channel, async (event, ...args) => {
                validateSender(event, expectedIndexPath);
                try {
                    return { ok: true, value: await handler(...args) };
                } catch (error) {
                    if (!(error instanceof DriveError)) logMainError(`shared-drive:${channel}`, error);
                    return { ok: false, error: { message: userMessage(error), code: error?.code || 'DRIVE_ERROR', status: error?.status } };
                }
            });
        }
    }

    return { register, handlers, status, DriveError };
}

module.exports = { createDriveService, sanitizeProperties, decodeJwtPayload, SCOPES, AUTH_URL, TOKEN_URL, ROOT_FOLDER_NAME };
