// 공유 저장소 "PC 폴더 방식" — main 프로세스 쪽.
//
// 구글 드라이브(데스크톱)가 PC에 붙여 둔 기관 공유 드라이브 폴더(예: G:\공유 드라이브\사례관리)를 저장소로 쓴다.
// 구글 로그인·업로드는 구글 드라이브 프로그램이 하고, JJSS는 그 폴더에 암호화한 기록 파일을 읽고 쓰기만 한다.
// OAuth 클라이언트가 필요 없다. 대신 앱이 공유 드라이브의 구성원·공유 설정을 직접 볼 수 없으므로 보안 설정은 관리자가 확인한다.
//
// - 레코드 파일: "JJSSF1\n" + 속성 JSON(평문, 드라이브 API 방식의 appProperties와 같은 내용) + "\n" + 암호문.
//   한 파일에 속성과 내용을 함께 두어, 구글 드라이브가 파일 단위로 옮겨도 둘이 어긋나지 않는다.
// - 쓰기는 같은 폴더의 임시 파일에 쓴 뒤 이름 바꾸기(원자적 교체). 임시 파일 이름은 "."으로 시작해 목록에서 뺀다.
//   읽고 고쳐 쓰는 경우(편집 표시)는 읽은 뒤 파일이 그대로일 때만 바꾼다 — 그사이 구글 드라이브가 내려놓은 새 버전을 되돌리지 않게.
// - 파일 id는 저장소 폴더 기준 상대 경로("seekers/seekers-….jjss"). 렌더러가 넘긴 id는 저장소 밖을 가리킬 수 없게 검사한다.
// - 변경 감지: 파일 목록·수정 시각·크기·만든 시각의 스냅숏을 토큰별로 사용자 데이터 폴더에 두고 비교한다(이전 토큰을 모르면 전부
//   변경으로 본다 — 엔진은 같은 버전·같은 지문이면 건너뛰므로 안전하다).
// - 구글 드라이브(데스크톱)가 같은 파일을 두 PC에서 동시에 고쳐 "충돌 사본"을 만들어도, 사본 안의 속성(rid·버전)으로 읽어
//   엔진이 같은 버전·다른 내용을 충돌로 남긴다.
// - 파일 입출력은 모두 비동기다(스트리밍 모드에서 아직 내려받지 않은 파일을 열 때 main 프로세스가 멈추지 않게).

const MAGIC = Buffer.from('JJSSF1\n', 'utf8');
const HEADER_LIMIT = 8 * 1024;
const ROOT_FOLDER_NAME = 'JJSS 사례관리 (PC 폴더 방식)';
const INDEX_FILE = 'shared-folder-index.json';
const KEEP_SNAPSHOTS = 3;
const TOP_FOLDERS = new Set(['_meta', 'seekers', 'documents']);
const SCAN_CONCURRENCY = 8;
const HEADER_CACHE_LIMIT = 50_000;

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
 *
 * 경로 모양으로 보는 판단이라 같은 이름의 폴더를 손으로 만들면 통과할 수 있다(사용자가 스스로 속이는 경우).
 * 내용은 기관 키로 암호화되어 있고, 구성원·공유 설정은 어차피 관리자가 확인한다.
 */
async function inspectFolderPath({ fs, path }, folderPath) {
    const resolved = path.resolve(String(folderPath || ''));
    const segments = splitSegments(path, resolved);
    const lower = segments.map(segment => segment.toLowerCase());
    const sharedIndex = lower.findIndex(segment => SHARED_DRIVES_NAMES.includes(segment));
    const myDriveIndex = lower.findIndex(segment => MY_DRIVE_NAMES.includes(segment));
    const cloudAccount = segments.map(segment => /^GoogleDrive-(.+@.+)$/i.exec(segment)?.[1] || '').find(Boolean) || '';
    let driveRoot = '';
    if (sharedIndex >= 0) {
        // 뿌리 = "공유 드라이브" 폴더의 부모(Windows는 "G:\", macOS는 ".../GoogleDrive-메일")
        const rootText = path.parse(resolved).root;
        const rootSegments = splitSegments(path, rootText).length;
        driveRoot = path.join(rootText, ...segments.slice(rootSegments, sharedIndex));
    }
    let hasMyDriveSibling = false;
    if (driveRoot) {
        for (const name of ['내 드라이브', 'My Drive']) {
            try {
                if ((await fs.promises.stat(path.join(driveRoot, name))).isDirectory()) hasMyDriveSibling = true;
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

/** 여러 파일을 한 번에 limit개씩 처리한다. */
async function mapLimit(items, limit, worker) {
    const list = [...items];
    let index = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, async () => {
        while (index < list.length) {
            const current = list[index++];
            await worker(current);
        }
    });
    await Promise.all(runners);
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
        sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    } = deps;

    const fsp = fs.promises;
    const headerCache = new Map();

    function unavailable(error) {
        if (error instanceof DriveError) return error;
        const code = String(error?.code || '');
        if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES' || code === 'EPERM' || code === 'EIO' || code === 'EBUSY') {
            return new DriveError('공유 드라이브 폴더를 쓸 수 없습니다. 이 PC의 구글 드라이브(데스크톱)가 실행 중이고 기관 계정으로 로그인돼 있는지 확인해 주세요.', 'DRIVE_FOLDER_UNAVAILABLE', 503);
        }
        return error;
    }

    const tooLarge = () => new DriveError('공유 저장소 파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
    const notFound = () => new DriveError('공유 드라이브나 파일을 찾지 못했습니다. 권한이 바뀌었는지 확인해 주세요.', 'DRIVE_NOT_FOUND', 404);
    const keepsChanging = () => new DriveError('공유 드라이브 폴더의 파일이 계속 바뀌고 있습니다. 잠시 후 다시 시도합니다.', 'DRIVE_BUSY', 503);

    /** 저장소 폴더(고른 폴더 아래 "JJSS 사례관리 (PC 폴더 방식)") */
    async function storeRoot({ create = false } = {}) {
        const base = getRoot();
        if (!base) throw new DriveError('공유 드라이브 폴더를 먼저 골라 주세요.', 'DRIVE_NOT_SELECTED');
        try {
            if (!(await fsp.stat(base)).isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
        } catch (error) {
            throw unavailable(error);
        }
        const root = path.join(base, ROOT_FOLDER_NAME);
        if (create) {
            try { await fsp.mkdir(root, { recursive: true }); } catch (error) { throw unavailable(error); }
        }
        return root;
    }

    /** 렌더러가 넘긴 파일 id(상대 경로)를 저장소 안의 절대 경로로. 밖을 가리키면 거부한다. */
    async function resolveId(fileId) {
        if (typeof fileId !== 'string' || !fileId || fileId.length > 600 || /[\u0000-\u001f\\:]/.test(fileId)) {
            throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        }
        const segments = fileId.split('/');
        if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.')) || !TOP_FOLDERS.has(segments[0]) || segments.length < 2 || segments.length > 3) {
            throw new DriveError('파일 id가 올바르지 않습니다.', 'DRIVE_BAD_ID');
        }
        const root = await storeRoot();
        const target = path.resolve(root, ...segments);
        if (!target.startsWith(root + path.sep)) throw new DriveError('공유 저장소 폴더 밖의 파일입니다.', 'DRIVE_OUT_OF_SCOPE', 403);
        return target;
    }

    async function folderDir(folderKey, { create }) {
        const root = await storeRoot({ create });
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
            try { await fsp.mkdir(dir, { recursive: true }); } catch (error) { throw unavailable(error); }
        }
        return { dir, relative: relative.join('/') };
    }

    function encode(properties, content) {
        return Buffer.concat([MAGIC, Buffer.from(`${JSON.stringify(properties)}\n`, 'utf8'), Buffer.from(content)]);
    }

    /** 바이트 앞부분에서 속성을 읽는다. JJSS 형식이 아니면 null. */
    function parseHeader(bytes) {
        if (bytes.length < MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) return null;
        const end = bytes.indexOf(0x0a, MAGIC.length);
        if (end < 0 || end >= HEADER_LIMIT) return null;
        let parsed;
        try {
            parsed = JSON.parse(bytes.subarray(MAGIC.length, end).toString('utf8'));
        } catch {
            return null;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const properties = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (recordPropertyKeys.has(key) && typeof value === 'string' && value.length <= 124) properties[key] = value;
        }
        return { properties, bodyOffset: end + 1 };
    }

    /** 파일 머리(속성)만 읽는다(앞 8KB). JJSS 형식이 아니면 null. */
    async function readHeaderFile(target) {
        let handle;
        try {
            handle = await fsp.open(target, 'r');
            const buffer = Buffer.alloc(HEADER_LIMIT);
            const { bytesRead } = await handle.read(buffer, 0, HEADER_LIMIT, 0);
            return parseHeader(buffer.subarray(0, bytesRead));
        } catch (error) {
            throw unavailable(error);
        } finally {
            if (handle) await handle.close().catch(() => undefined);
        }
    }

    /** 파일 지문(바뀌었는지 비교용). 구글 드라이브가 파일을 통째로 바꿔 놓으면 만든 시각(ctime)도 바뀐다. */
    const stamp = stat => `${stat.mtimeMs}:${stat.size}:${stat.ctimeMs}`;

    /**
     * 파일을 읽는다. 읽는 사이에 구글 드라이브가 파일을 바꿔 놓았으면(앞뒤 지문이 다르면) 다시 읽는다.
     * 계속 바뀌면 다음 주기에 다시 하도록 알린다.
     */
    async function readStable(target) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const statOf = async () => {
                try {
                    return await fsp.stat(target);
                } catch (error) {
                    if (error?.code === 'ENOENT') throw notFound();
                    throw unavailable(error);
                }
            };
            const before = await statOf();
            // 레코드 상한보다 큰 파일은 읽지 않는다(구성원이 파일을 바꿔치기해도 메모리에 올리지 않게).
            if (before.size > maxFileBytes + HEADER_LIMIT) throw tooLarge();
            let bytes;
            try {
                bytes = await fsp.readFile(target);
            } catch (error) {
                if (error?.code === 'ENOENT') throw notFound();
                throw unavailable(error);
            }
            const after = await statOf();
            if (stamp(before) === stamp(after) && bytes.length === before.size) return { bytes, stat: after };
            await sleep(50 * (attempt + 1));
        }
        throw keepsChanging();
    }

    async function remoteOf(fileId, target, stat) {
        const cacheKey = `${fileId}|${stamp(stat)}`;
        let header = headerCache.get(cacheKey);
        if (header === undefined) {
            header = await readHeaderFile(target);
            if (headerCache.size > HEADER_CACHE_LIMIT) headerCache.clear();
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
    async function scan() {
        const root = await storeRoot();
        const found = new Map();
        const listDir = async (relative, absolute) => {
            let entries;
            try {
                entries = await fsp.readdir(absolute, { withFileTypes: true });
            } catch (error) {
                if (error?.code === 'ENOENT') return;
                throw unavailable(error);
            }
            const files = entries.filter(entry => entry.isFile() && !entry.name.startsWith('.') && !entry.name.startsWith('~'));
            await mapLimit(files, SCAN_CONCURRENCY, async entry => {
                const target = path.join(absolute, entry.name);
                try {
                    found.set(`${relative}/${entry.name}`, { target, stat: await fsp.stat(target) });
                } catch { /* 그사이 사라진 파일은 건너뛴다 */ }
            });
        };
        await listDir('seekers', path.join(root, 'seekers'));
        let years = [];
        try {
            years = (await fsp.readdir(path.join(root, 'documents'), { withFileTypes: true }))
                .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
                .map(entry => entry.name);
        } catch (error) {
            if (error?.code !== 'ENOENT') throw unavailable(error);
        }
        for (const year of years) await listDir(`documents/${year}`, path.join(root, 'documents', year));
        return found;
    }

    async function listRecords() {
        const found = await scan();
        const files = [];
        await mapLimit([...found.entries()], SCAN_CONCURRENCY, async ([fileId, { target, stat }]) => {
            const remote = await remoteOf(fileId, target, stat);
            if (remote.appProperties.jjssKind === 'record') files.push(remote);
        });
        return { files };
    }

    // ─── 변경 감지(스냅숏 비교) ───

    async function readIndex() {
        try {
            const parsed = JSON.parse(await fsp.readFile(indexPath(), 'utf8'));
            return parsed && typeof parsed === 'object' && parsed.snapshots ? parsed : { snapshots: {} };
        } catch {
            return { snapshots: {} };
        }
    }

    async function writeIndex(index) {
        const target = indexPath();
        const temp = `${target}.tmp`;
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(temp, JSON.stringify(index), { encoding: 'utf8', mode: 0o600 });
        await fsp.rename(temp, target);
    }

    function snapshotOf(found) {
        const entries = {};
        for (const [fileId, { stat }] of found) entries[fileId] = stamp(stat);
        return entries;
    }

    function sameEntries(a, b) {
        if (!a || !b) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
    }

    /** 스냅숏을 남기고 토큰을 돌려준다. 바뀐 것이 없으면 쓰던 토큰을 그대로 쓴다(폴더가 커도 45초마다 다시 쓰지 않게). */
    async function saveSnapshot(entries, reuseToken) {
        const root = await storeRoot();
        const index = await readIndex();
        // 다른 폴더의 스냅숏은 버린다(폴더를 바꾸면 처음부터).
        if (index.root !== root) index.snapshots = {};
        index.root = root;
        if (reuseToken && sameEntries(index.snapshots?.[reuseToken]?.entries, entries)) return reuseToken;
        const token = `f${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
        index.snapshots[token] = { at: Date.now(), entries };
        const tokens = Object.keys(index.snapshots).sort((a, b) => index.snapshots[a].at - index.snapshots[b].at);
        while (tokens.length > KEEP_SNAPSHOTS) delete index.snapshots[tokens.shift()];
        await writeIndex(index);
        return token;
    }

    async function getStartPageToken() {
        return saveSnapshot(snapshotOf(await scan()));
    }

    async function listChanges(pageToken) {
        if (typeof pageToken !== 'string' || !/^[A-Za-z0-9]{1,80}$/.test(pageToken)) throw new DriveError('변경 토큰이 올바르지 않습니다.', 'DRIVE_BAD_TOKEN');
        const found = await scan();
        const root = await storeRoot();
        const index = await readIndex();
        const previous = index.root === root ? index.snapshots?.[pageToken]?.entries : undefined;
        const current = snapshotOf(found);
        const changes = [];
        const candidates = [...found.entries()].filter(([fileId]) => !previous || previous[fileId] !== current[fileId]);
        await mapLimit(candidates, SCAN_CONCURRENCY, async ([fileId, { target, stat }]) => {
            const remote = await remoteOf(fileId, target, stat);
            if (remote.appProperties.jjssKind !== 'record') return;
            changes.push({ fileId, removed: false, file: { ...remote, trashed: false } });
        });
        if (previous) {
            for (const fileId of Object.keys(previous)) if (!found.has(fileId)) changes.push({ fileId, removed: true });
        }
        return { changes, newStartPageToken: await saveSnapshot(current, pageToken) };
    }

    // ─── 파일 읽기·쓰기 ───

    async function getFile(fileId) {
        const target = await resolveId(fileId);
        let stat;
        try {
            stat = await fsp.stat(target);
        } catch (error) {
            if (error?.code === 'ENOENT') return null;
            throw unavailable(error);
        }
        if (!stat.isFile()) return null;
        return remoteOf(fileId, target, stat);
    }

    async function download(fileId) {
        const target = await resolveId(fileId);
        const { bytes } = await readStable(target);
        const header = parseHeader(bytes);
        // JJSS 형식이 아니면 빈 내용(엔진이 "형식이 올바르지 않음"으로 격리한다).
        if (!header) return new Uint8Array();
        const body = bytes.subarray(header.bodyOffset);
        if (body.length > maxFileBytes) throw tooLarge();
        return new Uint8Array(body);
    }

    /**
     * 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꿔 교체한다(구글 드라이브·백신이 잠깐 잡고 있으면 몇 번 다시 시도).
     * expect를 주면 바꾸기 직전에 대상 파일이 그대로인지 확인하고, 그사이 바뀌었으면 바꾸지 않고 false를 돌려준다.
     */
    async function writeAtomic(target, data, expect) {
        const temp = path.join(path.dirname(target), `.jjss-tmp-${crypto.randomBytes(8).toString('hex')}`);
        try {
            await fsp.writeFile(temp, data);
            let lastError;
            for (let attempt = 0; attempt < 4; attempt += 1) {
                if (expect) {
                    // 읽은 뒤 구글 드라이브가 새 버전을 내려놓았으면 그 위에 옛 내용을 쓰지 않는다.
                    const now = await fsp.stat(target).catch(() => null);
                    if (!now || stamp(now) !== expect) {
                        await fsp.unlink(temp).catch(() => undefined);
                        return false;
                    }
                }
                try {
                    await fsp.rename(temp, target);
                    return true;
                } catch (error) {
                    lastError = error;
                    if (!['EPERM', 'EBUSY', 'EACCES'].includes(String(error?.code))) break;
                    await sleep(100 * 2 ** attempt);
                }
            }
            throw lastError;
        } catch (error) {
            await fsp.unlink(temp).catch(() => undefined);
            throw unavailable(error);
        }
    }

    async function upload({ fileId, folder, name, appProperties, content } = {}) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content || []);
        if (bytes.length > maxFileBytes) throw new DriveError('파일이 너무 큽니다(20MB).', 'DRIVE_TOO_LARGE');
        const allowed = folder === 'meta' ? new Set(['jjssKind', 'keyId', 'updatedAt', 'updatedBy', ...recordPropertyKeys]) : recordPropertyKeys;
        const properties = sanitizeProperties(appProperties, allowed);
        let target;
        let id;
        if (fileId) {
            target = await resolveId(fileId);
            if (!(await fsp.stat(target).catch(() => null))) throw notFound();
            // 기존 파일의 편집 중 표시는 이어 둔다(드라이브 API 방식의 PATCH와 같게: 보낸 속성만 바뀐다).
            const previous = (await readHeaderFile(target))?.properties || {};
            for (const key of editingPropertyKeys) if (previous[key] !== undefined && properties[key] === undefined) properties[key] = previous[key];
            id = fileId;
        } else {
            const { dir, relative } = await folderDir(folder, { create: true });
            let finalName = name;
            // 같은 이름이 이미 있으면 덮지 않는다(드라이브 API처럼 새 파일을 하나 더 만든다. 엔진이 버전으로 고른다).
            if (await fsp.stat(path.join(dir, finalName)).catch(() => null)) {
                finalName = name.replace(/(\.[^.]*)?$/, match => `~${crypto.randomBytes(4).toString('hex')}${match}`);
            }
            target = path.join(dir, finalName);
            id = `${relative}/${finalName}`;
        }
        await writeAtomic(target, encode(properties, bytes));
        return getFile(id);
    }

    async function setProperties(fileId, appProperties) {
        const target = await resolveId(fileId);
        const patch = sanitizeProperties(appProperties, editingPropertyKeys, true);
        // 읽고 고쳐 쓰는 사이에 구글 드라이브가 다른 PC의 새 버전을 내려놓을 수 있다. 그대로일 때만 바꾸고, 바뀌었으면 다시 읽는다.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { bytes, stat } = await readStable(target);
            const header = parseHeader(bytes);
            if (!header) throw new DriveError('공유 저장소 파일 형식이 올바르지 않습니다.', 'DRIVE_BAD_FILE');
            const next = { ...header.properties };
            for (const [key, value] of Object.entries(patch)) {
                if (value === null) delete next[key];
                else next[key] = value;
            }
            if (await writeAtomic(target, encode(next, bytes.subarray(header.bodyOffset)), stamp(stat))) return;
            await sleep(50 * (attempt + 1));
        }
        throw keepsChanging();
    }

    async function findMeta(name) {
        if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) throw new DriveError('파일 이름이 올바르지 않습니다.', 'DRIVE_BAD_NAME');
        await storeRoot({ create: true });
        return getFile(`_meta/${name}`);
    }

    /**
     * 보안 점검에 쓸 정보: 경로가 구글 드라이브 공유 드라이브 안인지, 이 PC에서 쓰고 지울 수 있는지.
     * 폴더 자체에 닿지 못하면(구글 드라이브가 꺼짐) 점검 결과 대신 "연결 없음" 오류를 던진다 —
     * "보안에서 막힘"으로 멈추면 드라이브가 돌아와도 사용자가 설정에서 직접 다시 점검해야 하기 때문이다.
     */
    async function securityFacts({ domain, accountEmail }) {
        if (!getRoot()) throw new DriveError('공유 드라이브 폴더를 먼저 골라 주세요.', 'DRIVE_NOT_SELECTED');
        const base = getRoot();
        await storeRoot();
        const inspected = await inspectFolderPath({ fs, path }, base);
        let writable = false;
        try {
            const root = await storeRoot({ create: true });
            const probe = path.join(root, `.jjss-write-test-${crypto.randomBytes(6).toString('hex')}`);
            await fsp.writeFile(probe, 'jjss');
            await fsp.unlink(probe);
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
