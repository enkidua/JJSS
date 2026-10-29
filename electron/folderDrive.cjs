// 공유 저장소 "PC 폴더 방식" — main 프로세스 쪽.
//
// 구글 드라이브(데스크톱)가 PC에 붙여 둔 기관 공유 드라이브 폴더(예: G:\공유 드라이브\사례관리)를 저장소로 쓴다.
// 구글 로그인·업로드는 구글 드라이브 프로그램이 하고, JJSS는 그 폴더에 암호화한 기록 파일을 읽고 쓰기만 한다.
// OAuth 클라이언트가 필요 없다. 대신 앱이 공유 드라이브의 구성원·공유 설정을 직접 볼 수 없으므로 보안 설정은 관리자가 확인한다.
//
// - 레코드 파일: "JJSSF1\n" + 속성 JSON(평문, 드라이브 API 방식의 appProperties와 같은 내용) + "\n" + 암호문.
//   한 파일에 속성과 내용을 함께 두어, 구글 드라이브가 파일 단위로 옮겨도 둘이 어긋나지 않는다.
// - 쓰기는 같은 폴더의 임시 파일에 쓴 뒤 이름 바꾸기(원자적 교체). 임시 파일 이름은 "."으로 시작해 목록에서 뺀다.
// - 파일 id는 저장소 폴더 기준 상대 경로("seekers/seekers-….jjss"). 렌더러가 넘긴 id는 저장소 밖을 가리킬 수 없게 검사한다.
// - 변경 감지: 파일 목록·수정 시각·크기의 스냅숏을 토큰별로 사용자 데이터 폴더에 두고 비교한다(이전 토큰을 모르면 전부 변경으로 본다 —
//   엔진은 같은 버전·같은 지문이면 건너뛰므로 안전하다).
// - 구글 드라이브(데스크톱)가 같은 파일을 두 PC에서 동시에 고쳐 "충돌 사본"을 만들어도, 사본 안의 속성(rid·버전)으로 읽어
//   엔진이 같은 버전·다른 내용을 충돌로 남긴다.

const MAGIC = Buffer.from('JJSSF1\n', 'utf8');
const HEADER_LIMIT = 8 * 1024;
const ROOT_FOLDER_NAME = 'JJSS 사례관리 (PC 폴더 방식)';
const INDEX_FILE = 'shared-folder-index.json';
const KEEP_SNAPSHOTS = 3;
const TOP_FOLDERS = new Set(['_meta', 'seekers', 'documents']);

/** 구글 드라이브(데스크톱)의 폴더 이름(한국어·영어 화면) */
const SHARED_DRIVES_NAMES = ['공유 드라이브', 'shared drives'];
const MY_DRIVE_NAMES = ['내 드라이브', 'my drive'];

function splitSegments(path, value) {
    return path.resolve(String(value)).split(/[\\/]+/).filter(Boolean);
}

/**
 * 고른 폴더가 구글 드라이브(데스크톱)의 공유 드라이브 안인지 알아본다(경로 모양 + 같은 드라이브 뿌리에 "내 드라이브" 폴더가 있는지).
 * - Windows: G:\공유 드라이브\<드라이브 이름>\…  (같은 G:\ 아래에 "내 드라이브"가 있다)
 * - macOS:   ~/Library/CloudStorage/GoogleDrive-<메일>/공유 드라이브/<드라이브 이름>/…
 */
function inspectFolderPath({ fs, path }, folderPath) {
    const resolved = path.resolve(String(folderPath || ''));
    const segments = splitSegments(path, resolved);
    const lower = segments.map(segment => segment.toLowerCase());
    const sharedIndex = lower.findIndex(segment => SHARED_DRIVES_NAMES.includes(segment));
    const myDriveIndex = lower.findIndex(segment => MY_DRIVE_NAMES.includes(segment));
    const cloudAccount = segments.map(segment => /^GoogleDrive-(.+@.+)$/i.exec(segment)?.[1] || '').find(Boolean) || '';
    let driveRoot = '';
    if (sharedIndex >= 0) {
        // 뿌리 = "공유 드라이브" 폴더의 부모(Windows는 "G:\\", macOS는 ".../GoogleDrive-메일")
        const rootText = path.parse(resolved).root;
        const rootSegments = splitSegments(path, rootText).length;
        driveRoot = path.join(rootText, ...segments.slice(rootSegments, sharedIndex));
    }
    let hasMyDriveSibling = false;
    if (driveRoot) {
        for (const name of ['내 드라이브', 'My Drive']) {
            try {
                if (fs.statSync(path.join(driveRoot, name)).isDirectory()) hasMyDriveSibling = true;
            } catch { /* 없음 */ }
        }
    }
    const isSharedDrive = sharedIndex >= 0 && sharedIndex + 1 < segments.length;
    return {
        folderPath: resolved,
        isSharedDrive,
        isMyDrive: myDriveIndex >= 0 && sharedIndex < 0,
        isGoogleDrive: Boolean(cloudAccount) || hasMyDriveSibling,
        driveName: isSharedDrive ? segments[sharedIndex + 1] : '',
        accountEmail: cloudAccount.toLowerCase(),
    };
}

function createFolderBackend(deps) {
    const {
        fs, path, crypto,
        DriveError,
        sanitizeProperties,
        recordPropertyKeys,
        editingPropertyKeys,
        getRoot,
        indexPath,
        maxFileBytes,
    } = deps;

    const headerCache = new Map();

    function unavailable(error) {
        if (error instanceof DriveError) return error;
        const code = String(error?.code || '');
        if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES' || code === 'EPERM' || code === 'EIO' || code === 'EBUSY') {
            return new DriveError('공유 드라이브 폴더를 쓸 수 없습니다. 이 PC의 구글 드라이브(데스크톱)가 실행 중이고 기관 계정으로 로그인돼 있는지 확인해 주세요.', 'DRIVE_FOLDER_UNAVAILABLE', 503);
        }
        return error;
    }

    /** 저장소 폴더(고른 폴더 아래 "JJSS 사례관리 (PC 폴더 방식)") */
    function storeRoot({ create = false } = {}) {
        const base = getRoot();
        if (!base) throw new DriveError('공유 드라이브 폴더를 먼저 골라 주세요.', 'DRIVE_NOT_SELECTED');
        try {
            if (!fs.statSync(base).isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
        } catch (error) {
            throw unavailable(error);
        }
        const root = path.join(base, ROOT_FOLDER_NAME);
        if (create) {
            try { fs.mkdirSync(root, { recursive: true }); } catch (error) { throw unavailable(error); }
        }
        return root;
    }

    /** 렌더러가 넘긴 파일 id(상대 경로)를 저장소 안의 절대 경로로. 밖을 가리키면 거부한다. */
    function resolveId(fileId) {
        if (typeof fileId !== 'string' || !fileId || fileId.length > 600 || /[\u0000-\u001f\\:]/.test(fileId)) {
            throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        }
        const segments = fileId.split('/');
        if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.')) || !TOP_FOLDERS.has(segments[0]) || segments.length < 2 || segments.length > 3) {
            throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        }
        const root = storeRoot();
        const target = path.resolve(root, ...segments);
        if (!target.startsWith(root + path.sep)) throw new DriveError('공유 저장소 폴더 밖의 파일입니다.', 'DRIVE_OUT_OF_SCOPE', 403);
        return target;
    }

    function folderDir(folderKey, { create }) {
        const root = storeRoot({ create });
        let relative;
        if (folderKey === 'meta') relative = ['_meta'];
        else if (folderKey === 'seekers') relative = ['seekers'];
        else {
            const match = /^documents\/(\d{4})$/.exec(String(folderKey));
            if (!match) throw new DriveError('알 수 없는 폴더입니다.', 'DRIVE_BAD_FOLDER');
            relative = ['documents', match[1]];
        }
        const dir = path.join(root, ...relative);
        if (create) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { throw unavailable(error); }
        }
        return { dir, relative: relative.join('/') };
    }

    function encode(properties, content) {
        return Buffer.concat([MAGIC, Buffer.from(`${JSON.stringify(properties)}\n`, 'utf8'), Buffer.from(content)]);
    }

    /** 파일 머리(속성)만 읽는다. JJSS 형식이 아니면 null. */
    function readHeader(target) {
        let fd;
        try {
            fd = fs.openSync(target, 'r');
            const buffer = Buffer.alloc(HEADER_LIMIT);
            const read = fs.readSync(fd, buffer, 0, HEADER_LIMIT, 0);
            const bytes = buffer.subarray(0, read);
            if (bytes.length < MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) return null;
            const end = bytes.indexOf(0x0a, MAGIC.length);
            if (end < 0) return null;
            const parsed = JSON.parse(bytes.subarray(MAGIC.length, end).toString('utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            const properties = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (recordPropertyKeys.has(key) && typeof value === 'string' && value.length <= 124) properties[key] = value;
            }
            return { properties, bodyOffset: end + 1 };
        } catch (error) {
            if (error instanceof SyntaxError) return null;
            throw unavailable(error);
        } finally {
            if (fd !== undefined) try { fs.closeSync(fd); } catch { /* 닫기 실패는 무시 */ }
        }
    }

    function remoteOf(fileId, target, stat) {
        const cacheKey = `${fileId}|${stat.mtimeMs}|${stat.size}`;
        let header = headerCache.get(cacheKey);
        if (header === undefined) {
            header = readHeader(target);
            if (headerCache.size > 50_000) headerCache.clear();
            headerCache.set(cacheKey, header);
        }
        return {
            id: fileId,
            name: path.basename(target),
            modifiedTime: new Date(stat.mtimeMs).toISOString(),
            appProperties: header ? { ...header.properties } : {},
        };
    }

    /** 저장소 안의 기록 파일(seekers/·documents/<연도>/) 목록: id → 절대 경로·stat */
    function scan() {
        const root = storeRoot();
        const found = new Map();
        const listDir = (relative, absolute) => {
            let entries;
            try {
                entries = fs.readdirSync(absolute, { withFileTypes: true });
            } catch (error) {
                if (error?.code === 'ENOENT') return;
                throw unavailable(error);
            }
            for (const entry of entries) {
                if (!entry.isFile() || entry.name.startsWith('.') || entry.name.startsWith('~')) continue;
                const target = path.join(absolute, entry.name);
                let stat;
                try { stat = fs.statSync(target); } catch { continue; }
                found.set(`${relative}/${entry.name}`, { target, stat });
            }
        };
        listDir('seekers', path.join(root, 'seekers'));
        let years = [];
        try {
            years = fs.readdirSync(path.join(root, 'documents'), { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name)).map(entry => entry.name);
        } catch (error) {
            if (error?.code !== 'ENOENT') throw unavailable(error);
        }
        for (const year of years) listDir(`documents/${year}`, path.join(root, 'documents', year));
        return found;
    }

    function listRecords() {
        const files = [];
        for (const [fileId, { target, stat }] of scan()) {
            const remote = remoteOf(fileId, target, stat);
            if (remote.appProperties.jjssKind === 'record') files.push(remote);
        }
        return { files };
    }

    // ─── 변경 감지(스냅숏 비교) ───

    function readIndex() {
        try {
            const parsed = JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
            return parsed && typeof parsed === 'object' && parsed.snapshots ? parsed : { snapshots: {} };
        } catch {
            return { snapshots: {} };
        }
    }

    function writeIndex(index) {
        const target = indexPath();
        const temp = `${target}.tmp`;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(temp, JSON.stringify(index), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temp, target);
    }

    function snapshotOf(found) {
        const entries = {};
        for (const [fileId, { stat }] of found) entries[fileId] = `${Math.round(stat.mtimeMs)}:${stat.size}`;
        return entries;
    }

    function saveSnapshot(entries) {
        const token = `f${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
        const index = readIndex();
        const root = storeRoot();
        // 다른 폴더의 스냅숏은 버린다(폴더를 바꾸면 처음부터).
        if (index.root !== root) index.snapshots = {};
        index.root = root;
        index.snapshots[token] = { at: Date.now(), entries };
        const tokens = Object.keys(index.snapshots).sort((a, b) => index.snapshots[a].at - index.snapshots[b].at);
        while (tokens.length > KEEP_SNAPSHOTS) delete index.snapshots[tokens.shift()];
        writeIndex(index);
        return token;
    }

    function getStartPageToken() {
        return saveSnapshot(snapshotOf(scan()));
    }

    function listChanges(pageToken) {
        if (typeof pageToken !== 'string' || !/^[A-Za-z0-9]{1,80}$/.test(pageToken)) throw new DriveError('변경 토큰이 올바르지 않습니다.', 'DRIVE_BAD_TOKEN');
        const found = scan();
        const index = readIndex();
        const previous = index.root === storeRoot() ? index.snapshots?.[pageToken]?.entries : undefined;
        const current = snapshotOf(found);
        const changes = [];
        for (const [fileId, { target, stat }] of found) {
            if (previous && previous[fileId] === current[fileId]) continue;
            const remote = remoteOf(fileId, target, stat);
            if (remote.appProperties.jjssKind !== 'record') continue;
            changes.push({ fileId, removed: false, file: { ...remote, trashed: false } });
        }
        if (previous) {
            for (const fileId of Object.keys(previous)) if (!found.has(fileId)) changes.push({ fileId, removed: true });
        }
        return { changes, newStartPageToken: saveSnapshot(current) };
    }

    // ─── 파일 읽기·쓰기 ───

    function getFile(fileId) {
        const target = resolveId(fileId);
        let stat;
        try {
            stat = fs.statSync(target);
        } catch (error) {
            if (error?.code === 'ENOENT') return null;
            throw unavailable(error);
        }
        if (!stat.isFile()) return null;
        return remoteOf(fileId, target, stat);
    }

    function download(fileId) {
        const target = resolveId(fileId);
        let stat;
        try { stat = fs.statSync(target); } catch (error) {
            if (error?.code === 'ENOENT') throw new DriveError('공유 드라이브나 파일을 찾지 못했습니다. 권한이 바뀌었는지 확인해 주세요.', 'DRIVE_NOT_FOUND', 404);
            throw unavailable(error);
        }
        // 레코드 상한보다 큰 파일은 읽지 않는다(구성원이 파일을 바꿔치기해도 메모리에 올리지 않게).
        if (stat.size > maxFileBytes + HEADER_LIMIT) throw new DriveError('공유 저장소 파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
        let bytes;
        try { bytes = fs.readFileSync(target); } catch (error) { throw unavailable(error); }
        const header = readHeader(target);
        // JJSS 형식이 아니면 빈 내용(엔진이 "형식이 올바르지 않음"으로 격리한다).
        if (!header) return new Uint8Array();
        const body = bytes.subarray(header.bodyOffset);
        if (body.length > maxFileBytes) throw new DriveError('공유 저장소 파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
        return new Uint8Array(body);
    }

    /** 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꿔 교체한다(구글 드라이브·백신이 잠깐 잡고 있으면 몇 번 다시 시도). */
    function writeAtomic(target, data) {
        const temp = path.join(path.dirname(target), `.jjss-tmp-${crypto.randomBytes(8).toString('hex')}`);
        try {
            fs.writeFileSync(temp, data);
            let lastError;
            for (let attempt = 0; attempt < 4; attempt += 1) {
                try {
                    fs.renameSync(temp, target);
                    return;
                } catch (error) {
                    lastError = error;
                    if (!['EPERM', 'EBUSY', 'EACCES'].includes(String(error?.code))) break;
                    const until = Date.now() + 100 * 2 ** attempt;
                    while (Date.now() < until) { /* 짧게 기다린다 */ }
                }
            }
            throw lastError;
        } catch (error) {
            try { fs.unlinkSync(temp); } catch { /* 이미 없음 */ }
            throw unavailable(error);
        }
    }

    function upload({ fileId, folder, name, appProperties, content } = {}) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content || []);
        if (bytes.length > maxFileBytes) throw new DriveError('파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
        const allowed = folder === 'meta' ? new Set(['jjssKind', 'keyId', 'updatedAt', 'updatedBy', ...recordPropertyKeys]) : recordPropertyKeys;
        const properties = sanitizeProperties(appProperties, allowed);
        let target;
        let id;
        if (fileId) {
            target = resolveId(fileId);
            if (!fs.existsSync(target)) throw new DriveError('공유 드라이브나 파일을 찾지 못했습니다. 권한이 바뀌었는지 확인해 주세요.', 'DRIVE_NOT_FOUND', 404);
            // 기존 파일의 편집 중 표시는 이어 둔다(드라이브 API 방식의 PATCH와 같게: 보낸 속성만 바뀐다).
            const previous = readHeader(target)?.properties || {};
            for (const key of editingPropertyKeys) if (previous[key] !== undefined && properties[key] === undefined) properties[key] = previous[key];
            id = fileId;
        } else {
            const { dir, relative } = folderDir(folder, { create: true });
            let finalName = name;
            // 같은 이름이 이미 있으면 덮지 않는다(드라이브 API처럼 새 파일을 하나 더 만든다. 엔진이 버전으로 고른다).
            if (fs.existsSync(path.join(dir, finalName))) finalName = name.replace(/(\.[^.]*)?$/, match => `~${crypto.randomBytes(4).toString('hex')}${match}`);
            target = path.join(dir, finalName);
            id = `${relative}/${finalName}`;
        }
        writeAtomic(target, encode(properties, bytes));
        return getFile(id);
    }

    function setProperties(fileId, appProperties) {
        const target = resolveId(fileId);
        const patch = sanitizeProperties(appProperties, editingPropertyKeys, true);
        let bytes;
        try {
            // 받기와 같은 상한: 구성원이 파일을 아주 크게 바꿔 두어도 편집 표시를 바꾸려고 통째로 읽지 않는다.
            if (fs.statSync(target).size > maxFileBytes + HEADER_LIMIT) throw new DriveError('공유 저장소 파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
            bytes = fs.readFileSync(target);
        } catch (error) {
            if (error instanceof DriveError) throw error;
            if (error?.code === 'ENOENT') throw new DriveError('공유 드라이브나 파일을 찾지 못했습니다. 권한이 바뀌었는지 확인해 주세요.', 'DRIVE_NOT_FOUND', 404);
            throw unavailable(error);
        }
        const header = readHeader(target);
        if (!header) throw new DriveError('공유 저장소 파일 형식이 올바르지 않습니다.', 'DRIVE_BAD_FILE');
        const next = { ...header.properties };
        for (const [key, value] of Object.entries(patch)) {
            if (value === null) delete next[key];
            else next[key] = value;
        }
        writeAtomic(target, encode(next, bytes.subarray(header.bodyOffset)));
    }

    function findMeta(name) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        storeRoot({ create: true });
        return getFile(`_meta/${name}`);
    }

    /** 보안 점검에 쓸 정보: 경로가 구글 드라이브 공유 드라이브 안인지, 이 PC에서 쓰고 지울 수 있는지 */
    function securityFacts({ domain, accountEmail }) {
        const base = getRoot();
        if (!base) throw new DriveError('공유 드라이브 폴더를 먼저 골라 주세요.', 'DRIVE_NOT_SELECTED');
        const inspected = inspectFolderPath({ fs, path }, base);
        let writable = false;
        try {
            const root = storeRoot({ create: true });
            const probe = path.join(root, `.jjss-write-test-${crypto.randomBytes(6).toString('hex')}`);
            fs.writeFileSync(probe, 'jjss');
            fs.unlinkSync(probe);
            writable = true;
        } catch {
            writable = false;
        }
        return {
            mode: 'folder',
            isSharedDrive: inspected.isSharedDrive && inspected.isGoogleDrive,
            driveName: inspected.driveName || path.basename(base),
            restrictions: {},
            permissions: [],
            permissionsVisible: false,
            accountEmail,
            accountIsMember: writable,
            folder: {
                path: inspected.folderPath,
                isGoogleDrive: inspected.isGoogleDrive,
                isSharedDrive: inspected.isSharedDrive,
                isMyDrive: inspected.isMyDrive,
                detectedAccountEmail: inspected.accountEmail,
                writable,
                orgDomain: domain,
            },
        };
    }

    return { listRecords, getStartPageToken, listChanges, getFile, download, upload, setProperties, findMeta, securityFacts, storeRoot };
}

module.exports = { createFolderBackend, inspectFolderPath, FOLDER_ROOT_NAME: ROOT_FOLDER_NAME, INDEX_FILE, MAGIC };
