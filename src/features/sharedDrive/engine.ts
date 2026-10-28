/**
 * 공유 저장소 동기화 엔진(오프라인 우선).
 *
 * - 화면은 언제나 이 PC의 IndexedDB를 읽고 쓴다. 엔진은 뒤에서 변경을 주고받는다.
 * - 레코드 하나 = 드라이브 파일 하나(암호문). 파일 속성에는 버전·지문·수정자만 평문으로 둔다.
 * - 올릴 때 드라이브의 버전이 내가 마지막으로 맞춘 버전과 같아야 올린다(낙관적 잠금). 다르면 충돌로 남겨
 *   사람이 고르게 한다(자동 병합 없음).
 * - 받기는 드라이브 변경 목록(changes) 토큰으로 바뀐 파일만. 처음에는 목록 한 번(1000개씩)으로 전체를 맞춘다.
 * - 드라이브에서 파일이 휴지통으로 가거나 지워져도 이 PC의 자료는 지우지 않는다(삭제는 묘비 표시로만 전파).
 */
import { contentHash, createKeyCheck, decryptRecord, encryptRecord, verifyKeyCheck, type OrgKey } from './orgKey';
import {
    parseRecordKey,
    recordKey,
    SYNCED_STORES,
    type ConflictEntry,
    type DriveApi,
    type FolderKey,
    type LocalAdapter,
    type RecordProperties,
    type RemoteFile,
    type SyncedStore,
    type SyncStateStore,
} from './types';

export const KEY_CHECK_META_NAME = 'key-check.jjss';

export interface SyncProgress {
    phase: 'listing' | 'uploading' | 'downloading' | 'verifying' | 'rotating';
    done: number;
    total: number;
}

export interface InitialSyncResult {
    uploaded: number;
    downloaded: number;
    linked: number;
    conflicts: number;
    skippedUnreadable: string[];
    duplicates: SeekerDuplicateGroup[];
}

export interface PullResult {
    applied: number;
    conflicts: number;
    /** 다른 기관 키로 암호화된 파일이 있어 새 기관 키 코드가 필요하다 */
    needsNewKey: boolean;
    ignoredRemovals: number;
}

export interface PushResult {
    uploaded: number;
    conflicts: number;
    remaining: number;
}

export interface VerifyResult {
    ok: boolean;
    checked: number;
    missing: string[];
    mismatched: string[];
}

export interface SeekerDuplicateGroup {
    key: string;
    seekerIds: string[];
    label: string;
}

export interface EditingInfo {
    by: string;
    since: string;
}

export interface SyncEngineOptions {
    drive: DriveApi;
    local: LocalAdapter;
    state: SyncStateStore;
    key: OrgKey;
    accountEmail: string;
    now?: () => Date;
    concurrency?: number;
    onProgress?: (progress: SyncProgress) => void;
}

const EDITING_STALE_MS = 30 * 60 * 1000;

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    let index = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (index < items.length) {
            const current = items[index++];
            await worker(current);
        }
    });
    await Promise.all(runners);
}

function stampYear(record: Record<string, unknown> | null | undefined, fallback: Date): number {
    const created = record?.createdAt as { seconds?: number } | string | undefined;
    const seconds = typeof created === 'object' && created ? Number(created.seconds) : NaN;
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).getUTCFullYear();
    if (typeof created === 'string' && Number.isFinite(Date.parse(created))) return new Date(created).getUTCFullYear();
    return fallback.getUTCFullYear();
}

function folderFor(store: SyncedStore, record: Record<string, unknown> | null, now: Date): FolderKey {
    return store === 'seekers' ? 'seekers' : (`documents/${stampYear(record, now)}` as FolderKey);
}

function normalizeName(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

export class SyncEngine {
    private readonly drive: DriveApi;
    private readonly local: LocalAdapter;
    private readonly state: SyncStateStore;
    private key: OrgKey;
    private readonly accountEmail: string;
    private readonly now: () => Date;
    private readonly concurrency: number;
    private readonly onProgress?: (progress: SyncProgress) => void;
    private readonly editing = new Map<string, EditingInfo>();
    private running: Promise<unknown> = Promise.resolve();

    constructor(options: SyncEngineOptions) {
        this.drive = options.drive;
        this.local = options.local;
        this.state = options.state;
        this.key = options.key;
        this.accountEmail = options.accountEmail;
        this.now = options.now ?? (() => new Date());
        this.concurrency = options.concurrency ?? 6;
        this.onProgress = options.onProgress;
    }

    get keyId(): string {
        return this.key.keyId;
    }

    /** 동시에 두 작업(받기·올리기·처음 맞추기)이 돌지 않게 줄 세운다. */
    private exclusive<T>(run: () => Promise<T>): Promise<T> {
        const next = this.running.then(run, run);
        this.running = next.catch(() => undefined);
        return next;
    }

    private progress(phase: SyncProgress['phase'], done: number, total: number) {
        this.onProgress?.({ phase, done, total });
    }

    // ─── 기관 키 확인 ───

    /** 드라이브의 키 확인 표식과 이 키가 맞는지(다른 PC가 처음 켤 때). 표식이 없으면 null. */
    async verifyOrgKey(): Promise<boolean | null> {
        const meta = await this.drive.findMeta(KEY_CHECK_META_NAME);
        if (!meta) return null;
        if (meta.appProperties.keyId && meta.appProperties.keyId !== this.key.keyId) return false;
        return verifyKeyCheck(this.key, await this.drive.download(meta.id));
    }

    /** 첫 PC: 키 확인 표식을 만든다(이미 있으면 그대로 둔다). */
    async ensureKeyCheck(): Promise<void> {
        const existing = await this.drive.findMeta(KEY_CHECK_META_NAME);
        if (existing && existing.appProperties.keyId === this.key.keyId) return;
        await this.drive.upload({
            fileId: existing?.id,
            folder: 'meta',
            name: KEY_CHECK_META_NAME,
            appProperties: { jjssKind: 'meta', keyId: this.key.keyId, updatedAt: this.now().toISOString(), updatedBy: this.accountEmail },
            content: await createKeyCheck(this.key),
        });
    }

    // ─── 전체 목록 ───

    async listAllRemote(): Promise<Map<string, RemoteFile>> {
        const remote = new Map<string, RemoteFile>();
        let pageToken: string | undefined;
        do {
            const page = await this.drive.listRecords(pageToken);
            for (const file of page.files) {
                const rid = file.appProperties.rid;
                if (file.appProperties.jjssKind !== 'record' || !rid || !parseRecordKey(rid)) continue;
                const existing = remote.get(rid);
                // 같은 rid 파일이 둘 있으면(드물게 동시에 처음 올림) 버전이 높은 쪽을 쓴다.
                if (!existing || Number(file.appProperties.version) > Number(existing.appProperties.version)) remote.set(rid, file);
                this.noteEditing(rid, file);
            }
            this.progress('listing', remote.size, remote.size);
            pageToken = page.nextPageToken;
        } while (pageToken);
        return remote;
    }

    private noteEditing(rid: string, file: RemoteFile) {
        const by = file.appProperties.editingBy;
        const since = file.appProperties.editingSince;
        if (by && since && by !== this.accountEmail && this.now().getTime() - Date.parse(since) < EDITING_STALE_MS) {
            this.editing.set(rid, { by, since });
        } else {
            this.editing.delete(rid);
        }
    }

    /** 다른 PC에서 지금 편집 중인 레코드(30분 지나면 무시) */
    editingInfo(store: SyncedStore, id: string): EditingInfo | null {
        const info = this.editing.get(recordKey(store, id));
        if (!info) return null;
        if (this.now().getTime() - Date.parse(info.since) >= EDITING_STALE_MS) return null;
        return info;
    }

    // ─── 처음 맞추기(기존 데이터 올리기·받아오기·합치기) ───

    /** 올리기 전 요약: 올라갈 건수(종류별)와 올리지 않을 깨진 레코드 */
    async summarizeLocal(): Promise<{ counts: Record<SyncedStore, number>; documentTypes: Record<string, number>; unreadable: string[] }> {
        const counts = { seekers: 0, caseDocuments: 0 } as Record<SyncedStore, number>;
        const documentTypes: Record<string, number> = {};
        const unreadable: string[] = [];
        for (const store of SYNCED_STORES) {
            const broken = new Set(this.local.unreadableIds(store));
            for (const record of await this.local.all(store)) {
                if (broken.has(record.id)) {
                    unreadable.push(recordKey(store, record.id));
                    continue;
                }
                counts[store] += 1;
                if (store === 'caseDocuments') {
                    const type = String(record.type || '기타');
                    documentTypes[type] = (documentTypes[type] || 0) + 1;
                }
            }
        }
        return { counts, documentTypes, unreadable };
    }

    /**
     * 이 PC의 사례관리 기록과 드라이브를 처음 맞춘다.
     * - 드라이브에 없는 이 PC의 기록 → 올린다(버전 1).
     * - 이 PC에 없는 드라이브 기록 → 받는다.
     * - 둘 다 있고 내용이 같으면 연결만, 다르면 충돌 목록(자동으로 고르지 않는다).
     * - 읽지 못한 기록은 올리지 않고 건너뛴 목록에 넣는다.
     * 중간에 끊겨도 다시 부르면 이미 맞춘 기록은 건너뛰고 이어서 한다.
     */
    initialSync(): Promise<InitialSyncResult> {
        return this.exclusive(async () => {
            // 목록을 받는 동안 생긴 변경을 놓치지 않도록 변경 토큰을 먼저 받는다.
            const meta = await this.state.getMeta();
            if (!meta.pageToken) await this.state.setMeta({ pageToken: await this.drive.getStartPageToken() });
            const remote = await this.listAllRemote();
            const result: InitialSyncResult = { uploaded: 0, downloaded: 0, linked: 0, conflicts: 0, skippedUnreadable: [], duplicates: [] };
            const uploads: Array<{ store: SyncedStore; record: Record<string, unknown> & { id: string } }> = [];
            const localKeys = new Set<string>();

            for (const store of SYNCED_STORES) {
                const broken = new Set(this.local.unreadableIds(store));
                for (const record of await this.local.all(store)) {
                    const rid = recordKey(store, record.id);
                    localKeys.add(rid);
                    if (broken.has(record.id)) {
                        result.skippedUnreadable.push(rid);
                        continue;
                    }
                    const file = remote.get(rid);
                    const known = await this.state.getRecord(rid);
                    if (!file) {
                        uploads.push({ store, record });
                        continue;
                    }
                    const remoteVersion = Number(file.appProperties.version) || 0;
                    if (known && known.baseVersion === remoteVersion && known.fileId === file.id) {
                        result.linked += 1;
                        continue;
                    }
                    const hash = await contentHash(this.key, record);
                    if (file.appProperties.hash === hash && file.appProperties.deleted !== '1') {
                        await this.state.putRecord({ rid, fileId: file.id, baseVersion: remoteVersion, baseHash: hash });
                        result.linked += 1;
                        continue;
                    }
                    await this.recordConflict(rid, record, file);
                    result.conflicts += 1;
                }
            }

            const total = uploads.length;
            let done = 0;
            await pool(uploads, Math.max(1, Math.floor(this.concurrency / 2)), async ({ store, record }) => {
                await this.uploadRecord(store, record.id, record, 0, undefined);
                result.uploaded += 1;
                this.progress('uploading', ++done, total);
            });

            // 이 PC에 없는 드라이브 기록 받기: 이용자 먼저, 문서는 최근 것부터
            const downloads = [...remote.values()]
                .filter(file => !localKeys.has(String(file.appProperties.rid)))
                .sort((a, b) => {
                    const storeOrder = (file: RemoteFile) => (file.appProperties.store === 'seekers' ? 0 : 1);
                    return storeOrder(a) - storeOrder(b) || String(b.appProperties.updatedAt).localeCompare(String(a.appProperties.updatedAt));
                });
            let downloaded = 0;
            await pool(downloads, this.concurrency, async file => {
                const applied = await this.applyRemote(file, { initial: true });
                if (applied === 'applied') result.downloaded += 1;
                this.progress('downloading', ++downloaded, downloads.length);
            });

            result.duplicates = await this.findSeekerDuplicates();
            await this.state.setMeta({ lastPullAt: this.now().toISOString(), lastPushAt: this.now().toISOString() });
            return result;
        });
    }

    /** 드라이브와 이 PC가 같은지 확인(올린 뒤 검증): 빠진 것·내용이 다른 것을 돌려준다. */
    verifyAgainstRemote(): Promise<VerifyResult> {
        return this.exclusive(async () => {
            const remote = await this.listAllRemote();
            const result: VerifyResult = { ok: true, checked: 0, missing: [], mismatched: [] };
            const conflicts = new Set((await this.state.conflicts()).map(conflict => conflict.rid));
            for (const store of SYNCED_STORES) {
                const broken = new Set(this.local.unreadableIds(store));
                const records = await this.local.all(store);
                let done = 0;
                for (const record of records) {
                    this.progress('verifying', ++done, records.length);
                    const rid = recordKey(store, record.id);
                    if (broken.has(record.id) || conflicts.has(rid)) continue;
                    result.checked += 1;
                    const file = remote.get(rid);
                    if (!file || file.appProperties.deleted === '1') {
                        result.missing.push(rid);
                        continue;
                    }
                    if (file.appProperties.hash !== await contentHash(this.key, record)) result.mismatched.push(rid);
                }
            }
            result.ok = result.missing.length === 0 && result.mismatched.length === 0;
            return result;
        });
    }

    // ─── 평소 동기화 ───

    /** 화면에서 저장·삭제한 레코드를 올릴 목록에 넣는다(같은 레코드는 한 번만). */
    async noteLocalChange(store: SyncedStore, ids: string[]): Promise<void> {
        for (const id of ids) await this.state.enqueue(recordKey(store, id));
    }

    /** 바뀐 파일만 받는다(변경 토큰). */
    pull(): Promise<PullResult> {
        return this.exclusive(async () => {
            const result: PullResult = { applied: 0, conflicts: 0, needsNewKey: false, ignoredRemovals: 0 };
            let { pageToken } = await this.state.getMeta();
            if (!pageToken) {
                pageToken = await this.drive.getStartPageToken();
                await this.state.setMeta({ pageToken });
            }
            const changed = new Map<string, RemoteFile>();
            for (;;) {
                const page = await this.drive.listChanges(pageToken);
                for (const change of page.changes) {
                    if (change.removed || !change.file || change.file.trashed) {
                        // 드라이브에서 파일을 지우거나 휴지통으로 보내도 이 PC의 자료는 지우지 않는다.
                        result.ignoredRemovals += 1;
                        continue;
                    }
                    const rid = change.file.appProperties.rid;
                    if (change.file.appProperties.jjssKind !== 'record' || !rid) continue;
                    changed.set(rid, change.file);
                }
                if (page.nextPageToken) {
                    pageToken = page.nextPageToken;
                    continue;
                }
                pageToken = page.newStartPageToken || pageToken;
                break;
            }
            const files = [...changed.values()];
            let done = 0;
            await pool(files, this.concurrency, async file => {
                this.noteEditing(String(file.appProperties.rid), file);
                const outcome = await this.applyRemote(file, { initial: false });
                if (outcome === 'applied') result.applied += 1;
                if (outcome === 'conflict') result.conflicts += 1;
                if (outcome === 'unknown-key') result.needsNewKey = true;
                if (files.length > 20) this.progress('downloading', ++done, files.length);
            });
            // 새 키가 필요한 파일이 있으면 토큰을 넘기지 않는다(키를 넣은 뒤 다시 받는다).
            if (!result.needsNewKey) await this.state.setMeta({ pageToken, lastPullAt: this.now().toISOString() });
            return result;
        });
    }

    /** 올릴 목록을 올린다. 충돌한 레코드는 남겨 둔다. */
    push(): Promise<PushResult> {
        return this.exclusive(async () => {
            const result: PushResult = { uploaded: 0, conflicts: 0, remaining: 0 };
            const conflicts = new Set((await this.state.conflicts()).map(conflict => conflict.rid));
            const queue = (await this.state.outbox()).filter(entry => !conflicts.has(entry.rid));
            await pool(queue, Math.max(1, Math.floor(this.concurrency / 2)), async entry => {
                const outcome = await this.pushOne(entry.rid, entry.queuedAt);
                if (outcome === 'uploaded') result.uploaded += 1;
                if (outcome === 'conflict') result.conflicts += 1;
            });
            result.remaining = (await this.state.outbox()).length;
            await this.state.setMeta({ lastPushAt: this.now().toISOString() });
            return result;
        });
    }

    /** 받고 나서 올린다(받기를 먼저 해 충돌을 줄인다). */
    async syncOnce(): Promise<{ pull: PullResult; push: PushResult }> {
        const pull = await this.pull();
        const push = await this.push();
        return { pull, push };
    }

    // ─── 충돌 ───

    conflicts(): Promise<ConflictEntry[]> {
        return this.state.conflicts();
    }

    /** 충돌 해결: 이 PC 것으로 덮기(keep-local) 또는 드라이브 것 받기(take-remote) */
    resolveConflict(rid: string, choice: 'keep-local' | 'take-remote'): Promise<void> {
        return this.exclusive(async () => {
            const conflict = (await this.state.conflicts()).find(item => item.rid === rid);
            const parsed = parseRecordKey(rid);
            if (!conflict || !parsed) return;
            if (choice === 'take-remote') {
                if (conflict.remote) {
                    await this.local.putFromSync(parsed.store, conflict.remote as Record<string, unknown> & { id: string });
                    await this.state.putRecord({ rid, fileId: conflict.fileId, baseVersion: conflict.remoteVersion, baseHash: await contentHash(this.key, conflict.remote) });
                } else {
                    await this.local.deleteFromSync(parsed.store, parsed.id);
                    await this.state.putRecord({ rid, fileId: conflict.fileId, baseVersion: conflict.remoteVersion, baseHash: '', deleted: true });
                }
                await this.state.dequeue(rid);
                await this.state.removeConflict(rid);
                return;
            }
            // 이 PC 것으로: 드라이브의 지금 버전을 기준으로 삼아 다음 올리기에서 덮는다(그사이 또 바뀌면 다시 충돌).
            await this.state.putRecord({ rid, fileId: conflict.fileId, baseVersion: conflict.remoteVersion, baseHash: 'resolve-keep-local' });
            await this.state.removeConflict(rid);
            await this.state.enqueue(rid);
        });
    }

    // ─── 편집 중 표시 ───

    async setEditing(store: SyncedStore, id: string, editing: boolean): Promise<void> {
        const state = await this.state.getRecord(recordKey(store, id));
        if (!state?.fileId) return;
        await this.drive.setProperties(state.fileId, editing
            ? { editingBy: this.accountEmail, editingSince: this.now().toISOString() }
            : { editingBy: null, editingSince: null });
    }

    // ─── 같은 사람으로 보이는 이용자 ───

    async findSeekerDuplicates(): Promise<SeekerDuplicateGroup[]> {
        const groups = new Map<string, { ids: string[]; label: string }>();
        for (const seeker of await this.local.all('seekers')) {
            const name = normalizeName(seeker.name);
            if (!name) continue;
            const key = `${name}|${normalizeName(seeker.seekerId)}`;
            const group = groups.get(key) ?? { ids: [], label: String(seeker.name ?? '') };
            group.ids.push(seeker.id);
            groups.set(key, group);
        }
        return [...groups.entries()]
            .filter(([, group]) => group.ids.length > 1)
            .map(([key, group]) => ({ key, seekerIds: group.ids.sort(), label: group.label }));
    }

    // ─── 기관 키 바꾸기(퇴사 등) ───

    /**
     * 드라이브의 모든 레코드를 새 키로 다시 암호화해 올린다. 올릴 목록·충돌이 남아 있으면 하지 않는다.
     * 끝나면 키 확인 표식도 새 키로 바꾼다. 다른 PC는 새 키 코드를 넣어야 이어서 쓸 수 있다.
     */
    rotateKey(newKey: OrgKey): Promise<{ rewritten: number }> {
        return this.exclusive(async () => {
            if ((await this.state.outbox()).length) throw new Error('아직 올리지 않은 변경이 있습니다. 동기화를 마친 뒤 기관 키를 바꿔 주세요.');
            if ((await this.state.conflicts()).length) throw new Error('해결하지 않은 충돌이 있습니다. 충돌을 먼저 해결해 주세요.');
            const oldKey = this.key;
            const remote = await this.listAllRemote();
            const files = [...remote.values()];
            let done = 0;
            await pool(files, Math.max(1, Math.floor(this.concurrency / 2)), async file => {
                const rid = String(file.appProperties.rid);
                const version = Number(file.appProperties.version) || 0;
                const deleted = file.appProperties.deleted === '1';
                const record = deleted ? null : await decryptRecord<Record<string, unknown>>(oldKey, rid, await this.drive.download(file.id));
                const props: RecordProperties = {
                    jjssKind: 'record',
                    store: file.appProperties.store as SyncedStore,
                    rid,
                    version: String(version + 1),
                    updatedAt: this.now().toISOString(),
                    updatedBy: this.accountEmail,
                    deleted: deleted ? '1' : '0',
                    keyId: newKey.keyId,
                    hash: record ? await contentHash(newKey, record) : '',
                };
                await this.drive.upload({ fileId: file.id, folder: 'meta', name: file.name, appProperties: { ...props }, content: await encryptRecord(newKey, rid, record ?? { tombstone: true }) });
                await this.state.putRecord({ rid, fileId: file.id, baseVersion: version + 1, baseHash: props.hash, deleted });
                this.progress('rotating', ++done, files.length);
            });
            this.key = newKey;
            await this.ensureKeyCheck();
            return { rewritten: files.length };
        });
    }

    /** 다른 PC에서 키가 바뀐 뒤 새 키를 넣었을 때: 키를 바꾸고 전체를 다시 맞춘다. */
    async adoptKey(newKey: OrgKey): Promise<void> {
        this.key = newKey;
        const ok = await this.verifyOrgKey();
        if (ok === false) throw new Error('입력한 기관 키 코드가 공유 저장소의 키와 맞지 않습니다.');
        await this.state.setMeta({ pageToken: undefined });
    }

    // ─── 내부 ───

    private async recordConflict(rid: string, local: Record<string, unknown> | null, file: RemoteFile): Promise<void> {
        const remoteDeleted = file.appProperties.deleted === '1';
        let remote: unknown = null;
        if (!remoteDeleted) remote = await decryptRecord(this.key, rid, await this.drive.download(file.id));
        await this.state.putConflict({
            rid,
            detectedAt: this.now().toISOString(),
            local,
            remote,
            remoteVersion: Number(file.appProperties.version) || 0,
            remoteUpdatedBy: String(file.appProperties.updatedBy || ''),
            remoteUpdatedAt: String(file.appProperties.updatedAt || ''),
            fileId: file.id,
        });
        await this.state.dequeue(rid);
    }

    private async uploadRecord(
        store: SyncedStore,
        id: string,
        record: Record<string, unknown> | null,
        baseVersion: number,
        fileId: string | undefined,
        queuedAt?: string,
    ): Promise<void> {
        const rid = recordKey(store, id);
        const deleted = record === null;
        const hash = record ? await contentHash(this.key, record) : '';
        const props: RecordProperties = {
            jjssKind: 'record',
            store,
            rid,
            version: String(baseVersion + 1),
            updatedAt: this.now().toISOString(),
            updatedBy: this.accountEmail,
            deleted: deleted ? '1' : '0',
            keyId: this.key.keyId,
            hash,
        };
        const content = await encryptRecord(this.key, rid, record ?? { tombstone: true });
        const uploaded = await this.drive.upload({
            fileId,
            folder: folderFor(store, record, this.now()),
            name: `${store}-${id}.jjss`,
            appProperties: { ...props },
            content,
        });
        await this.state.putRecord({ rid, fileId: uploaded.id, baseVersion: baseVersion + 1, baseHash: hash, deleted });
        // 올리는 사이에 같은 레코드가 또 바뀌었으면(대기 표지가 새로 찍힘) 목록에 남겨 다음에 다시 올린다.
        await this.state.dequeue(rid, queuedAt);
    }

    private async pushOne(rid: string, queuedAt?: string): Promise<'uploaded' | 'conflict' | 'skipped'> {
        const parsed = parseRecordKey(rid);
        if (!parsed) {
            await this.state.dequeue(rid, queuedAt);
            return 'skipped';
        }
        const { store, id } = parsed;
        if (this.local.unreadableIds(store).includes(id)) return 'skipped';
        const local = (await this.local.get(store, id)) ?? null;
        const known = await this.state.getRecord(rid);
        if (!local && !known?.fileId) {
            await this.state.dequeue(rid, queuedAt);
            return 'skipped';
        }
        const hash = local ? await contentHash(this.key, local) : '';
        if (known?.fileId && local && known.baseHash === hash && !known.deleted) {
            await this.state.dequeue(rid, queuedAt);
            return 'skipped';
        }
        if (known?.fileId) {
            const remote = await this.drive.getFile(known.fileId);
            const remoteVersion = Number(remote?.appProperties.version) || 0;
            if (remote && remoteVersion !== known.baseVersion) {
                if (remote.appProperties.keyId !== this.key.keyId) return 'skipped';
                if (local && remote.appProperties.hash === hash && remote.appProperties.deleted !== '1') {
                    await this.state.putRecord({ rid, fileId: known.fileId, baseVersion: remoteVersion, baseHash: hash });
                    await this.state.dequeue(rid, queuedAt);
                    return 'skipped';
                }
                await this.recordConflict(rid, local, remote);
                return 'conflict';
            }
            await this.uploadRecord(store, id, local, known.baseVersion, known.fileId, queuedAt);
            return 'uploaded';
        }
        await this.uploadRecord(store, id, local, 0, undefined, queuedAt);
        return 'uploaded';
    }

    private async applyRemote(file: RemoteFile, { initial }: { initial: boolean }): Promise<'applied' | 'conflict' | 'skipped' | 'unknown-key'> {
        const rid = String(file.appProperties.rid);
        const parsed = parseRecordKey(rid);
        if (!parsed) return 'skipped';
        const remoteVersion = Number(file.appProperties.version) || 0;
        const known = await this.state.getRecord(rid);
        if (known && known.baseVersion >= remoteVersion) return 'skipped';
        if (file.appProperties.keyId !== this.key.keyId) return 'unknown-key';
        const queued = !initial && await this.state.isQueued(rid);
        const remoteDeleted = file.appProperties.deleted === '1';
        if (queued) {
            const local = (await this.local.get(parsed.store, parsed.id)) ?? null;
            if (local && !remoteDeleted && file.appProperties.hash === await contentHash(this.key, local)) {
                await this.state.putRecord({ rid, fileId: file.id, baseVersion: remoteVersion, baseHash: String(file.appProperties.hash) });
                await this.state.dequeue(rid);
                return 'skipped';
            }
            await this.recordConflict(rid, local, file);
            return 'conflict';
        }
        if (remoteDeleted) {
            if (await this.local.get(parsed.store, parsed.id)) await this.local.deleteFromSync(parsed.store, parsed.id);
            await this.state.putRecord({ rid, fileId: file.id, baseVersion: remoteVersion, baseHash: '', deleted: true });
            return 'applied';
        }
        const record = await decryptRecord<Record<string, unknown> & { id: string }>(this.key, rid, await this.drive.download(file.id));
        if (!record || record.id !== parsed.id) throw new Error('공유 저장소 파일의 레코드 id가 맞지 않습니다.');
        await this.local.putFromSync(parsed.store, record);
        await this.state.putRecord({ rid, fileId: file.id, baseVersion: remoteVersion, baseHash: String(file.appProperties.hash) });
        return 'applied';
    }
}
