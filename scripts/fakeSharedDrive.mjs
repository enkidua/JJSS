// 테스트용 가짜 공유 드라이브(DriveApi 계약). 여러 PC가 같은 인스턴스를 공유한다.
// 실제 드라이브처럼: 파일 id는 드라이브가 정하고, 속성(appProperties)은 병합(null이면 지움), 변경마다 변경 목록에 남는다.
// 요청 수를 세고, 실패를 주입할 수 있다(오프라인·429 흉내).

export function createFakeSharedDrive() {
    const files = new Map(); // id -> { id, name, folder, appProperties, content, trashed }
    const changeLog = []; // { seq, fileId }
    let seq = 0;
    let nextId = 1;
    const counters = { list: 0, changes: 0, get: 0, download: 0, upload: 0, setProperties: 0, findMeta: 0, startToken: 0 };
    let failures = 0;
    let failureError = null;

    function checkFailure() {
        if (failures > 0) {
            failures -= 1;
            throw failureError || Object.assign(new Error('synthetic network failure'), { code: 'ENETDOWN' });
        }
    }
    function snapshot(file) {
        return { id: file.id, name: file.name, modifiedTime: file.modifiedTime, appProperties: { ...file.appProperties } };
    }
    function logChange(fileId) {
        seq += 1;
        changeLog.push({ seq, fileId });
    }
    function mergeProps(target, patch) {
        for (const [key, value] of Object.entries(patch || {})) {
            if (value === null || value === undefined) delete target[key];
            else target[key] = String(value);
        }
    }

    const api = {
        async listRecords(pageToken) {
            checkFailure();
            counters.list += 1;
            const all = [...files.values()].filter(file => !file.trashed && file.appProperties.jjssKind === 'record').sort((a, b) => a.id.localeCompare(b.id));
            const start = pageToken ? Number(pageToken) : 0;
            const page = all.slice(start, start + 1000);
            return { files: page.map(snapshot), nextPageToken: start + 1000 < all.length ? String(start + 1000) : undefined };
        },
        async getStartPageToken() {
            checkFailure();
            counters.startToken += 1;
            return String(seq + 1);
        },
        async listChanges(pageToken) {
            checkFailure();
            counters.changes += 1;
            const from = Number(pageToken);
            const pending = changeLog.filter(entry => entry.seq >= from);
            const page = pending.slice(0, 100);
            const changes = page.map(entry => {
                const file = files.get(entry.fileId);
                if (!file) return { fileId: entry.fileId, removed: true };
                return { fileId: entry.fileId, removed: false, file: { ...snapshot(file), trashed: Boolean(file.trashed) } };
            });
            if (pending.length > 100) return { changes, nextPageToken: String(page.at(-1).seq + 1) };
            return { changes, newStartPageToken: String(seq + 1) };
        },
        async getFile(fileId) {
            checkFailure();
            counters.get += 1;
            const file = files.get(fileId);
            return file && !file.trashed ? snapshot(file) : null;
        },
        async download(fileId) {
            checkFailure();
            counters.download += 1;
            const file = files.get(fileId);
            if (!file) throw Object.assign(new Error('not found'), { status: 404 });
            return new Uint8Array(file.content);
        },
        async upload({ fileId, folder, name, appProperties, content }) {
            checkFailure();
            counters.upload += 1;
            let file = fileId ? files.get(fileId) : null;
            if (fileId && !file) throw Object.assign(new Error('not found'), { status: 404 });
            if (!file) {
                file = { id: `f${String(nextId++).padStart(6, '0')}`, name, folder, appProperties: {}, content: new Uint8Array(), trashed: false };
                files.set(file.id, file);
            }
            mergeProps(file.appProperties, appProperties);
            file.content = new Uint8Array(content);
            file.modifiedTime = new Date().toISOString();
            logChange(file.id);
            return snapshot(file);
        },
        async setProperties(fileId, appProperties) {
            checkFailure();
            counters.setProperties += 1;
            const file = files.get(fileId);
            if (!file) throw Object.assign(new Error('not found'), { status: 404 });
            mergeProps(file.appProperties, appProperties);
            logChange(fileId);
        },
        async findMeta(name) {
            checkFailure();
            counters.findMeta += 1;
            const file = [...files.values()].find(item => item.folder === 'meta' && item.name === name && !item.trashed);
            return file ? snapshot(file) : null;
        },
    };

    return {
        api,
        files,
        counters,
        resetCounters() { for (const key of Object.keys(counters)) counters[key] = 0; },
        failNext(count = 1, error = null) { failures = count; failureError = error; },
        trash(fileId) {
            const file = files.get(fileId);
            file.trashed = true;
            logChange(fileId);
        },
        rawFiles() { return [...files.values()]; },
    };
}

/** 테스트용 이 PC 저장소(평문). 앱 저장을 흉내 내면 엔진의 올릴 목록에 넣는다. */
export function createFakeLocal(engineRef) {
    const stores = { seekers: new Map(), caseDocuments: new Map() };
    const unreadable = { seekers: new Set(), caseDocuments: new Set() };
    // 실제 저장소처럼: 읽어 본 뒤에야 읽지 못한 필드가 있는 기록을 안다.
    const seen = { seekers: new Set(), caseDocuments: new Set() };
    return {
        stores,
        unreadable,
        async get(store, id) { seen[store].add(id); const value = stores[store].get(id); return value ? structuredClone(value) : undefined; },
        async all(store) { for (const id of stores[store].keys()) seen[store].add(id); return [...stores[store].values()].map(value => structuredClone(value)); },
        unreadableIds(store) { return [...unreadable[store]].filter(id => seen[store].has(id)); },
        async putFromSync(store, record) { stores[store].set(record.id, structuredClone(record)); },
        async deleteFromSync(store, id) { stores[store].delete(id); },
        /** 화면에서 저장 */
        async appPut(store, record) {
            stores[store].set(record.id, structuredClone(record));
            await engineRef.current?.noteLocalChange(store, [record.id]);
        },
        async appDelete(store, id) {
            stores[store].delete(id);
            await engineRef.current?.noteLocalChange(store, [id]);
        },
    };
}
