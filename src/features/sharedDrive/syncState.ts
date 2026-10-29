/**
 * 동기화 상태 저장소.
 * - 앱: 별도 IndexedDB "jjss-sync"(본 저장소 jjss의 구조·버전은 건드리지 않는다).
 *   레코드 id·버전·지문·올릴 목록만 평문이고, 충돌 사본(개인정보가 든 레코드 내용)은 이 PC의 데이터 키로 암호화한다.
 * - 테스트: 메모리 구현.
 */
import type { ConflictEntry, OutboxEntry, RecordSyncState, SyncMeta, SyncStateStore } from './types';

let sequence = 0;
function stamp(): string {
    sequence = (sequence + 1) % 1_000_000;
    return `${new Date().toISOString()}#${String(sequence).padStart(6, '0')}`;
}

export class MemorySyncState implements SyncStateStore {
    private records = new Map<string, RecordSyncState>();
    private queue = new Map<string, OutboxEntry>();
    private conflictMap = new Map<string, ConflictEntry>();
    private meta: SyncMeta = {};

    async getRecord(rid: string) { return this.records.get(rid) ? { ...this.records.get(rid)! } : undefined; }
    async putRecord(state: RecordSyncState) { this.records.set(state.rid, { ...state }); }
    async allRecords() { return [...this.records.values()].map(item => ({ ...item })); }
    async enqueue(rid: string) { this.queue.set(rid, { rid, queuedAt: stamp() }); }
    async dequeue(rid: string, queuedAt?: string) {
        const current = this.queue.get(rid);
        if (!current) return;
        if (queuedAt && current.queuedAt !== queuedAt) return;
        this.queue.delete(rid);
    }
    async outbox() { return [...this.queue.values()].map(item => ({ ...item })); }
    async isQueued(rid: string) { return this.queue.has(rid); }
    async queuedEntry(rid: string) { const entry = this.queue.get(rid); return entry ? { ...entry } : undefined; }
    async putConflict(conflict: ConflictEntry) { this.conflictMap.set(conflict.rid, structuredClone(conflict)); }
    async removeConflict(rid: string) { this.conflictMap.delete(rid); }
    async conflicts() { return [...this.conflictMap.values()].map(item => structuredClone(item)); }
    async getMeta() { return { ...this.meta }; }
    async setMeta(patch: Partial<SyncMeta>) { this.meta = { ...this.meta, ...patch }; }
    async clearAll() {
        this.records.clear();
        this.queue.clear();
        this.conflictMap.clear();
        this.meta = {};
    }
}

const DB_NAME = 'jjss-sync';
const DB_VERSION = 1;
const STORES = ['records', 'outbox', 'conflicts', 'meta'] as const;

interface ConflictCodec {
    encode(value: unknown): Promise<string>;
    decode(value: string): Promise<unknown>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export class IndexedDbSyncState implements SyncStateStore {
    private dbPromise: Promise<IDBDatabase> | null = null;

    constructor(private readonly codec: ConflictCodec, private readonly factory: IDBFactory = indexedDB) {}

    private open(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const request = this.factory.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    for (const name of STORES) {
                        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'meta' ? 'id' : 'rid' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    const error = request.error;
                    // 더 새로운 버전의 JJSS가 만든 동기화 상태 저장소는 옛 버전이 열 수 없다.
                    if (error?.name === 'VersionError') reject(new Error('이 PC의 공유 저장소 상태는 더 새로운 JJSS가 만든 것입니다. JJSS를 최신 버전으로 업데이트해 주세요.'));
                    else reject(error);
                };
            });
            // 열기에 실패했으면 다음 호출에서 다시 연다(실패를 영구히 기억하지 않게).
            this.dbPromise.catch(() => { this.dbPromise = null; });
        }
        return this.dbPromise;
    }

    private async run<T>(store: (typeof STORES)[number], mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await this.open();
        const tx = db.transaction(store, mode);
        const result = await requestToPromise(action(tx.objectStore(store)));
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        return result;
    }

    async getRecord(rid: string) { return (await this.run('records', 'readonly', store => store.get(rid))) as RecordSyncState | undefined; }
    async putRecord(state: RecordSyncState) { await this.run('records', 'readwrite', store => store.put(state)); }
    async allRecords() { return (await this.run('records', 'readonly', store => store.getAll())) as RecordSyncState[]; }
    async enqueue(rid: string) { await this.run('outbox', 'readwrite', store => store.put({ rid, queuedAt: stamp() })); }
    async dequeue(rid: string, queuedAt?: string) {
        const db = await this.open();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('outbox', 'readwrite');
            const store = tx.objectStore('outbox');
            const request = store.get(rid);
            // 읽기와 지우기를 같은 트랜잭션의 콜백 안에서 한다(사이에 다른 대기 표지가 끼지 않게).
            request.onsuccess = () => {
                const current = request.result as OutboxEntry | undefined;
                if (current && (!queuedAt || current.queuedAt === queuedAt)) store.delete(rid);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
    async outbox() { return (await this.run('outbox', 'readonly', store => store.getAll())) as OutboxEntry[]; }
    async isQueued(rid: string) { return Boolean(await this.run('outbox', 'readonly', store => store.get(rid))); }
    async queuedEntry(rid: string) { return (await this.run('outbox', 'readonly', store => store.get(rid))) as OutboxEntry | undefined; }
    async putConflict(conflict: ConflictEntry) {
        const sealed = { ...conflict, local: await this.codec.encode(conflict.local), remote: await this.codec.encode(conflict.remote) };
        await this.run('conflicts', 'readwrite', store => store.put(sealed));
    }
    async removeConflict(rid: string) { await this.run('conflicts', 'readwrite', store => store.delete(rid)); }
    async conflicts() {
        const sealed = (await this.run('conflicts', 'readonly', store => store.getAll())) as Array<Omit<ConflictEntry, 'local' | 'remote'> & { local: string; remote: string }>;
        const out: ConflictEntry[] = [];
        for (const item of sealed) {
            try {
                out.push({ ...item, local: await this.codec.decode(item.local), remote: await this.codec.decode(item.remote) });
            } catch {
                // 이 PC의 데이터 키로 열지 못한 사본: 목록에는 남기되(올리기 차단 유지) 내용 없이 표시한다.
                out.push({ ...item, local: null, remote: null, undecodable: true });
            }
        }
        return out;
    }
    async getMeta() {
        const value = (await this.run('meta', 'readonly', store => store.get('sync'))) as (SyncMeta & { id: string }) | undefined;
        if (!value) return {};
        const { id: _id, ...meta } = value;
        return meta;
    }
    async setMeta(patch: Partial<SyncMeta>) {
        const current = await this.getMeta();
        await this.run('meta', 'readwrite', store => store.put({ ...current, ...patch, id: 'sync' }));
    }
    async clearAll() {
        for (const name of STORES) await this.run(name, 'readwrite', store => store.clear());
    }
}
