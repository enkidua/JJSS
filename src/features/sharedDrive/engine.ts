/**
 * 공유 저장소 동기화 엔진(오프라인 우선).
 *
 * - 화면은 언제나 이 PC의 IndexedDB를 읽고 쓴다. 엔진은 뒤에서 변경을 주고받는다.
 * - 레코드 하나 = 드라이브 파일 하나(암호문). 파일 속성에는 버전·지문·수정자만 평문으로 둔다.
 * - 올릴 때 드라이브의 버전이 내가 마지막으로 맞춘 버전과 같아야 올린다(낙관적 잠금). 다르면 충돌로 남겨
 *   사람이 고르게 한다(자동 병합 없음).
 * - 받기는 드라이브 변경 목록(changes) 토큰으로 바뀐 파일만. 처음에는 목록 한 번(1000개씩)으로 전체를 맞춘다.
 * - 드라이브에서 파일이 휴지통으로 가거나 지워져도 이 PC의 자료는 지우지 않는다(삭제는 묘비 표시로만 전파).
 * - 파일 속성(평문)은 누구나(드라이브 구성원) 고칠 수 있으므로 판단의 근거로 쓰지 않는다. 삭제 여부·버전은
 *   기관 키로 암호화·인증한 봉투(envelope) 안의 값으로만 정하고, 속성과 봉투가 다르면 그 파일은 격리한다.
 * - 열지 못하는 파일(위조·손상·모르는 키)은 격리 목록에 남기고 건너뛴다. 한 파일 때문에 동기화가 멈추지 않는다.
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
    /** 열지 못해 격리한 드라이브 파일의 레코드 id */
    quarantined: string[];
}

export interface PullResult {
    applied: number;
    conflicts: number;
    /** 드라이브의 키 확인 표식이 이 PC 키로 열리지 않아(기관 키 교체) 새 기관 키 코드가 필요하다 */
    needsNewKey: boolean;
    ignoredRemovals: number;
    /** 열지 못해 격리하고 건너뛴 파일 수 */
    quarantined: number;
    /** 키 확인 표식이 이 키로 열리지 않는데 교체 증명도 없다(관리자 확인 필요) */
    keyCheckTampered?: boolean;
}

/** 드라이브 파일 안의 암호화된 봉투. 속성(평문)과 달리 기관 키 없이는 만들거나 바꿀 수 없다. */
interface RecordEnvelope {
    format: 'jjss-record-v1';
    version: number;
    deleted: boolean;
    record: (Record<string, unknown> & { id: string }) | null;
}

interface OpenedRemote {
    version: number;
    deleted: boolean;
    record: (Record<string, unknown> & { id: string }) | null;
    hash: string;
}

/** 드라이브 파일을 믿을 수 없을 때(위조·손상·속성과 내용 불일치) */
export class QuarantineError extends Error {
    readonly code = 'SHARED_DRIVE_QUARANTINED';
    constructor(readonly rid: string, message: string) {
        super(message);
    }
}

const QUARANTINE_LIMIT = 500;
/** 버전 상한(정상 사용으로는 닿지 않는 값). 넘거나 정수가 아니면 위조로 본다. */
const MAX_VERSION = 1_000_000_000;

/** 파일 속성의 버전 → 0 이상 정수(상한 이내). 형식이 틀리면 -1. */
export function parseVersion(value: unknown): number {
    const text = String(value ?? '');
    if (!/^\d{1,10}$/.test(text)) return -1;
    const version = Number(text);
    return Number.isSafeInteger(version) && version <= MAX_VERSION ? version : -1;
}

export type KeyStatus = 'none' | 'current' | 'rotated' | 'tampered';

const KEY_ROTATION_PURPOSE = 'jjss-shared-drive-key-rotation-v1';
function rotationMetaName(oldKeyId: string): string {
    return `key-rotation-${oldKeyId}.jjss`;
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

    /**
     * 드라이브의 키 확인 표식이 이 키로 열리는지(다른 PC가 처음 켤 때, 키 교체 감지). 표식이 없으면 null.
     * 속성의 keyId는 보지 않고 암호문을 실제로 열어 본다(속성만 바꾼 위조로 키 교체를 꾸밀 수 없게).
     */
    async verifyOrgKey(key: OrgKey = this.key): Promise<boolean | null> {
        const meta = await this.drive.findMeta(KEY_CHECK_META_NAME);
        if (!meta) return null;
        return verifyKeyCheck(key, await this.drive.download(meta.id));
    }

    /**
     * 이 PC 키의 상태.
     * - current: 키 확인 표식이 이 키로 열린다.
     * - rotated: 표식은 안 열리지만, 이 키로 봉인한 "키 교체 증명"이 있다(기관 키를 가진 사람이 실제로 바꿈).
     * - tampered: 표식이 안 열리고 증명도 없다(드라이브 구성원이 표식을 지우거나 바꿈) → 동기화는 멈추지 않는다.
     * - none: 표식이 없다(처음).
     */
    async keyStatus(): Promise<KeyStatus> {
        // 증명을 먼저 본다: 교체가 진행 중이면(표식은 아직 옛 키) 이미 새 키로 바뀐 파일을 격리하지 않게.
        const proof = await this.drive.findMeta(rotationMetaName(this.key.keyId));
        if (proof) {
            try {
                const value = await decryptRecord<{ purpose?: string; newKeyId?: string }>(this.key, `_meta:key-rotation|${this.key.keyId}`, await this.drive.download(proof.id));
                if (value?.purpose === KEY_ROTATION_PURPOSE && typeof value.newKeyId === 'string' && value.newKeyId !== this.key.keyId) return 'rotated';
            } catch {
                // 열리지 않는 증명은 위조
            }
        }
        const ok = await this.verifyOrgKey();
        if (ok === true) return 'current';
        return ok === null ? 'none' : 'tampered';
    }

    /** 첫 PC: 키 확인 표식을 만든다(이미 있으면 그대로 둔다). */
    async ensureKeyCheck(): Promise<void> {
        const existing = await this.drive.findMeta(KEY_CHECK_META_NAME);
        if (existing && await verifyKeyCheck(this.key, await this.drive.download(existing.id))) return;
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
                if (!existing || parseVersion(file.appProperties.version) > parseVersion(existing.appProperties.version)) remote.set(rid, file);
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
            // 먼저 읽어야 이 PC 저장소가 읽지 못한 필드를 알 수 있다.
            const records = await this.local.all(store);
            const broken = new Set(this.local.unreadableIds(store));
            for (const record of records) {
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
            const result: InitialSyncResult = { uploaded: 0, downloaded: 0, linked: 0, conflicts: 0, skippedUnreadable: [], duplicates: [], quarantined: [] };
            const uploads: Array<{ store: SyncedStore; record: Record<string, unknown> & { id: string } }> = [];
            const localKeys = new Set<string>();

            for (const store of SYNCED_STORES) {
                const records = await this.local.all(store);
                const broken = new Set(this.local.unreadableIds(store));
                for (const record of records) {
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
                    const remoteVersion = parseVersion(file.appProperties.version);
                    if (remoteVersion < 0 || (known && remoteVersion < known.baseVersion)) {
                        // 형식이 틀렸거나 이 PC가 이미 본 버전보다 낮다(되돌리기) → 믿지 않는다.
                        result.quarantined.push(rid);
                        continue;
                    }
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
                    try {
                        await this.recordConflict(rid, record, file);
                        result.conflicts += 1;
                    } catch (error) {
                        if (!(error instanceof QuarantineError)) throw error;
                        result.quarantined.push(rid);
                    }
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
                if (applied === 'quarantined' || applied === 'unknown-key') result.quarantined.push(String(file.appProperties.rid));
                this.progress('downloading', ++downloaded, downloads.length);
            });

            if (result.quarantined.length) await this.noteQuarantined(result.quarantined);
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
                const records = await this.local.all(store);
                const broken = new Set(this.local.unreadableIds(store));
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
            const result: PullResult = { applied: 0, conflicts: 0, needsNewKey: false, ignoredRemovals: 0, quarantined: 0 };
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
            const unknownKey: string[] = [];
            const quarantined: string[] = [];
            let done = 0;
            await pool(files, this.concurrency, async file => {
                this.noteEditing(String(file.appProperties.rid), file);
                const outcome = await this.applyRemote(file, { initial: false });
                if (outcome === 'applied') result.applied += 1;
                if (outcome === 'conflict') result.conflicts += 1;
                if (outcome === 'unknown-key') unknownKey.push(String(file.appProperties.rid));
                if (outcome === 'quarantined') quarantined.push(String(file.appProperties.rid));
                if (files.length > 20) this.progress('downloading', ++done, files.length);
            });
            if (unknownKey.length) {
                // 속성의 keyId·키 확인 표식은 드라이브 구성원 누구나 바꿀 수 있다. 이 PC 키로 봉인한 "키 교체 증명"이
                // 있을 때만 "키가 바뀜"으로 보고 토큰을 넘기지 않는다(새 키를 넣은 뒤 다시 받는다).
                // 증명이 없으면 그 파일들은 격리하고 동기화는 계속한다.
                const status = await this.keyStatus();
                if (status === 'rotated') result.needsNewKey = true;
                else {
                    quarantined.push(...unknownKey);
                    if (status === 'tampered') result.keyCheckTampered = true;
                }
            }
            if (quarantined.length) await this.noteQuarantined(quarantined);
            result.quarantined = quarantined.length;
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
            const quarantined: string[] = [];
            await pool(queue, Math.max(1, Math.floor(this.concurrency / 2)), async entry => {
                let outcome: Awaited<ReturnType<SyncEngine['pushOne']>>;
                try {
                    outcome = await this.pushOne(entry.rid, entry.queuedAt);
                } catch (error) {
                    // 드라이브 쪽 파일을 믿을 수 없으면 덮어쓰지 않고 남겨 둔다(관리자 확인).
                    if (!(error instanceof QuarantineError)) throw error;
                    quarantined.push(entry.rid);
                    return;
                }
                if (outcome === 'uploaded') result.uploaded += 1;
                if (outcome === 'conflict') result.conflicts += 1;
            });
            if (quarantined.length) await this.noteQuarantined(quarantined);
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

    // ─── 격리한 파일 ───

    async quarantined(): Promise<string[]> {
        return (await this.state.getMeta()).quarantined ?? [];
    }

    /**
     * 격리한 파일을 이 PC의 기록으로 다시 쓴다(관리자가 확인한 뒤). 이 PC에 기록이 없으면 격리 목록에서만 뺀다.
     * 드라이브의 속성 버전보다 하나 높은 버전으로 올려 다른 PC들이 받게 한다.
     */
    restoreQuarantined(rid: string): Promise<'restored' | 'dismissed'> {
        return this.exclusive(async () => {
            const parsed = parseRecordKey(rid);
            const meta = await this.state.getMeta();
            const remaining = (meta.quarantined ?? []).filter(item => item !== rid);
            const read = parsed ? (await this.local.get(parsed.store, parsed.id)) ?? null : null;
            const local = parsed && read && !this.local.unreadableIds(parsed.store).includes(parsed.id) ? read : null;
            if (!parsed || !local) {
                await this.state.setMeta({ quarantined: remaining });
                return 'dismissed';
            }
            const remote = await this.listAllRemote();
            const file = remote.get(rid);
            const known = await this.state.getRecord(rid);
            // 속성 버전은 믿지 않되(상한·형식 검사), 다른 PC가 받으려면 그보다 높아야 하므로 둘 중 큰 값 위로 올린다.
            const remoteVersion = Math.max(parseVersion(file?.appProperties.version), known?.baseVersion ?? 0, 0);
            if (remoteVersion >= MAX_VERSION) throw new Error('버전 번호가 너무 커서 복구할 수 없습니다. 관리자에게 문의해 주세요.');
            await this.uploadRecord(parsed.store, parsed.id, local, remoteVersion, file?.id ?? known?.fileId);
            await this.state.setMeta({ quarantined: remaining });
            return 'restored';
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
    rotateKey(newKey: OrgKey): Promise<{ rewritten: number; skipped: string[] }> {
        return this.exclusive(async () => {
            if ((await this.state.outbox()).length) throw new Error('아직 올리지 않은 변경이 있습니다. 동기화를 마친 뒤 기관 키를 바꿔 주세요.');
            if ((await this.state.conflicts()).length) throw new Error('해결하지 않은 충돌이 있습니다. 충돌을 먼저 해결해 주세요.');
            const oldKey = this.key;
            if (newKey.keyId === oldKey.keyId) throw new Error('새 기관 키가 지금 키와 같습니다.');
            // 1) 옛 키로 봉인한 교체 증명을 먼저 남긴다. 옛 키를 가진 PC만 열 수 있으므로 위조할 수 없고,
            //    중간에 끊겨도 다른 PC는 "키가 바뀌는 중"으로 알고 새 키 코드를 기다린다.
            const proofName = rotationMetaName(oldKey.keyId);
            const existingProof = await this.drive.findMeta(proofName);
            await this.drive.upload({
                fileId: existingProof?.id,
                folder: 'meta',
                name: proofName,
                appProperties: { jjssKind: 'meta', keyId: oldKey.keyId, updatedAt: this.now().toISOString(), updatedBy: this.accountEmail },
                content: await encryptRecord(oldKey, `_meta:key-rotation|${oldKey.keyId}`, { purpose: KEY_ROTATION_PURPOSE, newKeyId: newKey.keyId, rotatedAt: this.now().toISOString() }),
            });
            const remote = await this.listAllRemote();
            const files = [...remote.values()];
            const skipped: string[] = [];
            let done = 0;
            await pool(files, Math.max(1, Math.floor(this.concurrency / 2)), async file => {
                const rid = String(file.appProperties.rid);
                const minVersion = (await this.state.getRecord(rid))?.baseVersion ?? 0;
                // 끊겼다가 다시 하는 경우: 이미 새 키로 바뀐 파일은 확인만 하고 넘어간다.
                if (file.appProperties.keyId === newKey.keyId) {
                    try {
                        const already = await this.openRemote(file, newKey, minVersion);
                        await this.state.putRecord({ rid, fileId: file.id, baseVersion: already.version, baseHash: already.hash, deleted: already.deleted });
                        this.progress('rotating', ++done, files.length);
                        return;
                    } catch (error) {
                        if (!(error instanceof QuarantineError)) throw error;
                    }
                }
                // 옛 키로 봉투를 열어 확인한 값만 새 키로 옮긴다(열리지 않으면 바꾸기를 멈춘다).
                let opened: OpenedRemote;
                try {
                    opened = await this.openRemote(file, oldKey, minVersion);
                } catch (error) {
                    // 위조·손상 파일은 옮기지 않는다(새 키 PC에서도 격리된다).
                    if (!(error instanceof QuarantineError)) throw error;
                    skipped.push(rid);
                    return;
                }
                const version = opened.version;
                const deleted = opened.deleted;
                const record = opened.record;
                const props: RecordProperties = {
                    jjssKind: 'record',
                    store: parseRecordKey(rid)!.store,
                    rid,
                    version: String(version + 1),
                    updatedAt: this.now().toISOString(),
                    updatedBy: this.accountEmail,
                    deleted: deleted ? '1' : '0',
                    keyId: newKey.keyId,
                    hash: record ? await contentHash(newKey, record) : '',
                };
                await this.drive.upload({ fileId: file.id, folder: 'meta', name: file.name, appProperties: { ...props }, content: await this.sealEnvelope(newKey, rid, version + 1, record) });
                await this.state.putRecord({ rid, fileId: file.id, baseVersion: version + 1, baseHash: props.hash, deleted });
                this.progress('rotating', ++done, files.length);
            });
            this.key = newKey;
            await this.ensureKeyCheck();
            if (skipped.length) await this.noteQuarantined(skipped);
            return { rewritten: files.length - skipped.length, skipped };
        });
    }

    /** 다른 PC에서 키가 바뀐 뒤 새 키를 넣었을 때: 키를 바꾸고 전체를 다시 맞춘다. */
    async adoptKey(newKey: OrgKey): Promise<void> {
        // 확인이 끝나기 전에는 지금 키를 바꾸지 않는다(틀린 코드를 넣어도 기존 키로 계속 쓸 수 있게).
        const ok = await this.verifyOrgKey(newKey);
        if (ok !== true) throw new Error('입력한 기관 키 코드가 공유 저장소의 키와 맞지 않습니다.');
        this.key = newKey;
        await this.state.setMeta({ pageToken: undefined });
    }

    // ─── 내부 ───

    /** 드라이브에 올릴 암호문: 버전·삭제 여부를 레코드와 함께 기관 키로 봉인한다. */
    private sealEnvelope(key: OrgKey, rid: string, version: number, record: Record<string, unknown> | null): Promise<Uint8Array> {
        const envelope: RecordEnvelope = {
            format: 'jjss-record-v1',
            version,
            deleted: record === null,
            record: record as RecordEnvelope['record'],
        };
        return encryptRecord(key, rid, envelope);
    }

    /**
     * 드라이브 파일을 내려받아 봉투를 연다. 열리지 않거나, 봉투의 버전이 속성의 버전과 다르거나,
     * 레코드 id가 다르면 믿을 수 없는 파일로 보고 QuarantineError를 던진다.
     */
    private async openRemote(file: RemoteFile, key: OrgKey = this.key, minVersion = 0): Promise<OpenedRemote> {
        const rid = String(file.appProperties.rid);
        const parsed = parseRecordKey(rid);
        if (!parsed) throw new QuarantineError(rid, '레코드 id 형식이 올바르지 않습니다.');
        const propsVersion = parseVersion(file.appProperties.version);
        if (propsVersion < 0) throw new QuarantineError(rid, '파일 속성의 버전 형식이 올바르지 않습니다.');
        // 이 PC가 이미 맞춘 버전보다 낮으면 예전 암호문을 다시 넣은 것(되돌리기)으로 본다.
        if (propsVersion < minVersion) throw new QuarantineError(rid, '이 PC가 이미 받은 것보다 예전 버전입니다.');
        let envelope: RecordEnvelope;
        try {
            envelope = await decryptRecord<RecordEnvelope>(key, rid, await this.drive.download(file.id));
        } catch (error) {
            if ((error as { code?: string })?.code === 'SHARED_DRIVE_DECRYPT_FAILED' || /형식이 올바르지/.test(String((error as Error)?.message))) {
                throw new QuarantineError(rid, '기관 키로 열 수 없는 파일입니다.');
            }
            throw error;
        }
        if (!envelope || envelope.format !== 'jjss-record-v1' || typeof envelope.version !== 'number' || typeof envelope.deleted !== 'boolean') {
            throw new QuarantineError(rid, '파일 내용 형식이 올바르지 않습니다.');
        }
        if (envelope.version !== propsVersion) {
            throw new QuarantineError(rid, '파일 속성의 버전과 암호화된 내용의 버전이 다릅니다.');
        }
        if (envelope.deleted) {
            if (envelope.record !== null) throw new QuarantineError(rid, '삭제 표시와 내용이 맞지 않습니다.');
            return { version: envelope.version, deleted: true, record: null, hash: '' };
        }
        const record = envelope.record;
        if (!record || typeof record !== 'object' || record.id !== parsed.id) throw new QuarantineError(rid, '파일 안의 레코드 id가 맞지 않습니다.');
        return { version: envelope.version, deleted: false, record, hash: await contentHash(key, record) };
    }

    /** 격리한 레코드 id를 남긴다(설정 화면에서 관리자가 확인). 오래된 것부터 잘라 최대 500개. */
    private async noteQuarantined(rids: string[]): Promise<void> {
        const meta = await this.state.getMeta();
        const merged = [...new Set([...(meta.quarantined ?? []), ...rids])].slice(-QUARANTINE_LIMIT);
        await this.state.setMeta({ quarantined: merged });
    }

    private async recordConflict(rid: string, local: Record<string, unknown> | null, file: RemoteFile, opened?: OpenedRemote): Promise<void> {
        const remote = opened ?? await this.openRemote(file);
        await this.state.putConflict({
            rid,
            detectedAt: this.now().toISOString(),
            local,
            remote: remote.record,
            remoteVersion: remote.version,
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
        const content = await this.sealEnvelope(this.key, rid, baseVersion + 1, record);
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
        const local = (await this.local.get(store, id)) ?? null;
        // 읽지 못한 필드가 있는 기록은 올리지 않는다(빈 값으로 드라이브를 덮지 않게).
        if (this.local.unreadableIds(store).includes(id)) return 'skipped';
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
            const remoteVersion = parseVersion(remote?.appProperties.version);
            if (remote && remoteVersion !== known.baseVersion) {
                // 드라이브가 바뀌었다: 속성이 아니라 봉투를 열어 실제 내용으로 판단한다
                // (열리지 않거나 이 PC가 맞춘 버전보다 낮으면 격리).
                const opened = await this.openRemote(remote, this.key, known.baseVersion);
                if (local && !opened.deleted && opened.hash === hash) {
                    await this.state.putRecord({ rid, fileId: known.fileId, baseVersion: opened.version, baseHash: hash });
                    await this.state.dequeue(rid, queuedAt);
                    return 'skipped';
                }
                await this.recordConflict(rid, local, remote, opened);
                return 'conflict';
            }
            await this.uploadRecord(store, id, local, known.baseVersion, known.fileId, queuedAt);
            return 'uploaded';
        }
        await this.uploadRecord(store, id, local, 0, undefined, queuedAt);
        return 'uploaded';
    }

    private async applyRemote(file: RemoteFile, { initial }: { initial: boolean }): Promise<'applied' | 'conflict' | 'skipped' | 'unknown-key' | 'quarantined'> {
        const rid = String(file.appProperties.rid);
        const parsed = parseRecordKey(rid);
        if (!parsed) return 'skipped';
        const remoteVersion = parseVersion(file.appProperties.version);
        if (remoteVersion < 0) return 'quarantined';
        const known = await this.state.getRecord(rid);
        if (known && known.baseVersion >= remoteVersion) return 'skipped';
        if (file.appProperties.keyId !== this.key.keyId) return 'unknown-key';
        // 삭제 여부·버전·내용은 모두 봉투(기관 키로 인증된 값)에서 읽는다. 속성의 deleted는 쓰지 않는다.
        let opened: OpenedRemote;
        try {
            opened = await this.openRemote(file, this.key, known?.baseVersion ?? 0);
        } catch (error) {
            if (error instanceof QuarantineError) return 'quarantined';
            throw error;
        }
        const queued = !initial && await this.state.isQueued(rid);
        if (queued) {
            const local = (await this.local.get(parsed.store, parsed.id)) ?? null;
            if (local && !opened.deleted && opened.hash === await contentHash(this.key, local)) {
                await this.state.putRecord({ rid, fileId: file.id, baseVersion: opened.version, baseHash: opened.hash });
                await this.state.dequeue(rid);
                return 'skipped';
            }
            await this.recordConflict(rid, local, file, opened);
            return 'conflict';
        }
        if (opened.deleted) {
            if (await this.local.get(parsed.store, parsed.id)) await this.local.deleteFromSync(parsed.store, parsed.id);
            await this.state.putRecord({ rid, fileId: file.id, baseVersion: opened.version, baseHash: '', deleted: true });
            return 'applied';
        }
        await this.local.putFromSync(parsed.store, opened.record!);
        await this.state.putRecord({ rid, fileId: file.id, baseVersion: opened.version, baseHash: opened.hash });
        return 'applied';
    }
}
