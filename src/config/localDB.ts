/**
 * IndexedDB 기반 로컬 데이터베이스 유틸리티
 * Firebase/Firestore를 대체하여 사용자 PC에 데이터를 영구 저장합니다.
 */

import {
    DECRYPT_FAILURE_MESSAGE,
    decryptWithStatus,
    encrypt,
    getAtRestTargetScheme,
    getCipherScheme,
    isEncrypted,
} from './crypto';

const DB_NAME = 'JJSS_LOCAL_DB';
const DB_VERSION = 3;
const VOCATIONAL_EVALUATION_HISTORY_KEY = 'jjss:vocational-evaluation-history';
const BUDGET_PROJECTS_KEY = 'jjss:budget-projects';

// IndexedDB에 생성할 ObjectStore(=컬렉션) 목록
const STORES = [
    'seekers',
    'jobs',
    'caseDocuments',
    'expenses',
    'resources',
    'posts',
    'comments',
    'settings',
    'trainingState',
] as const;

export type StoreName = (typeof STORES)[number];

let dbInstance: IDBDatabase | null = null;

/**
 * 저장 시 암호화하는 개인정보 필드 정책.
 * - fields: 지정한 필드만 암호화
 * - allExcept: 식별에 쓰이지 않는 최소 메타데이터(id·종류·시각 등)만 평문으로 두고 나머지 필드를 모두 암호화
 *   (나중에 추가되는 필드·가져오기로 들어온 필드도 자동으로 암호화된다)
 * 문자열이 아닌 값(배열·객체·숫자)은 JSON으로 직렬화해 통째로 암호화하므로 중첩된 개인정보(훈련생·사진 등)도 보호된다.
 * 조회·필터는 모두 복호화한 뒤 메모리에서 하므로(IndexedDB 인덱스 없음) 암호화 범위를 넓혀도 기존 조회가 그대로 동작한다.
 * 기존 평문 레코드는 그대로 읽히며, 해당 레코드를 다음에 저장할 때 암호화된다.
 */
type SensitivePolicy =
    | { fields: readonly string[] }
    | { allExcept: readonly string[] };

const SENSITIVE_POLICY: Partial<Record<StoreName, SensitivePolicy>> = {
    // 이용자: 이름·구직자ID·연락처·주소·생년월일·나이·장애정보·희망조건·상태·추천기관·비고·사진 등 전부
    seekers: { allExcept: ['id', 'organization', 'createdAt', 'updatedAt'] },
    // 사례문서: 이용자 ID·이름·내용·제목·사업체·직무·근무지·사진 파일명 등. 문서 종류·탭·출처·시각·jobId만 평문
    caseDocuments: {
        allExcept: ['id', 'type', 'tab', 'source', 'organization', 'createdAt', 'updatedAt', 'jobId', 'evaluationKind', 'legacyHistoryId', 'photoCount'],
    },
    // 직업훈련: 훈련실·훈련생(이름·메모·사진)·출결·진행·훈련 기록·담당자 전체. 연도·저장 시각만 평문
    trainingState: { allExcept: ['id', 'updatedAt', 'progressYear'] },
    // 사업체: 개인 담당자 정보만 (회사명·직무는 평문)
    jobs: { fields: ['contactPerson', 'contactPhone', 'contactEmail', 'managerName', 'managerPhone'] },
    // 지출: 이름이 들어갈 수 있는 자유 입력·거래처·결제 식별 정보 (금액·날짜·과목은 예산 계산용으로 평문)
    expenses: { fields: ['description', 'notes', 'vendor', 'vendorBizNo', 'cardLastFour', 'approvalNo'] },
};

/** 복호화에 실패하면 빈 값으로 두지 않고 읽기 자체를 실패시키는 store (자동 저장이 기본값으로 덮어쓰지 않게) */
const STRICT_DECRYPT_STORES = new Set<StoreName>(['trainingState']);

function hasSensitivePolicy(storeName: StoreName): boolean {
    return Boolean(SENSITIVE_POLICY[storeName]);
}

/** 이 레코드들에서 암호화 대상인 필드 목록 */
function sensitiveFieldsFor(storeName: StoreName, ...records: Array<Record<string, any> | undefined>): string[] {
    const policy = SENSITIVE_POLICY[storeName];
    if (!policy) return [];
    if ('fields' in policy) return [...policy.fields];
    const clear = new Set(policy.allExcept);
    const fields = new Set<string>();
    for (const record of records) {
        if (!record) continue;
        for (const field of Object.keys(record)) {
            if (!clear.has(field)) fields.add(field);
        }
    }
    return [...fields];
}

// 문자열이 아닌 값을 JSON으로 암호화할 때 평문 앞에 붙이는 표지 (기존 문자열 암호문과 구분)
const JSON_VALUE_MARKER = '\u0000jjss-json:';

/** 암호화할 평문으로 바꾼다. 암호화하지 않을 값(빈 값·이미 암호문)은 null. */
function serializeSensitiveValue(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
        if (!value || isEncrypted(value)) return null;
        return value.startsWith(JSON_VALUE_MARKER) ? `${JSON_VALUE_MARKER}${JSON.stringify(value)}` : value;
    }
    if (typeof value === 'function' || typeof value === 'symbol') return null;
    const json = JSON.stringify(value);
    return json === undefined ? null : `${JSON_VALUE_MARKER}${json}`;
}

/** 복호화한 평문을 원래 값으로 되돌린다. */
function deserializeSensitiveValue(plain: string): { ok: true; value: unknown } | { ok: false } {
    if (!plain.startsWith(JSON_VALUE_MARKER)) return { ok: true, value: plain };
    try {
        return { ok: true, value: JSON.parse(plain.slice(JSON_VALUE_MARKER.length)) };
    } catch {
        return { ok: false };
    }
}

/** 복호화에 실패해 읽기를 멈췄다. 저장된 원본은 그대로 두었다. */
export class DataDecryptError extends Error {
    readonly code = 'DATA_DECRYPT_FAILED';
    constructor() {
        super(DECRYPT_FAILURE_MESSAGE);
        this.name = 'DataDecryptError';
    }
}

// ─── 복호화 실패(복구 필요) 상태 ───

export const DATA_RECOVERY_EVENT = 'jjss:data-recovery-needed';

export interface DataRecoveryStatus {
    /** 이번 실행 중 읽지 못한 암호화 필드 수 */
    unreadableCount: number;
    /** 이 PC에서 보안 데이터 키(운영체제 보안 저장소)를 불러오지 못해 읽지 못한 값이 있음 */
    dataKeyUnavailable: boolean;
}

const unreadableFieldKeys = new Set<string>();
let dataKeyUnavailableSeen = false;

export function getDataRecoveryStatus(): DataRecoveryStatus {
    return { unreadableCount: unreadableFieldKeys.size, dataKeyUnavailable: dataKeyUnavailableSeen };
}

function noteUnreadableField(storeName: StoreName, id: unknown, field: string, dataKeyUnavailable: boolean) {
    const key = `${storeName}:${typeof id === 'string' ? id : '?'}:${field}`;
    const firstFailure = unreadableFieldKeys.size === 0;
    const firstKeyFailure = dataKeyUnavailable && !dataKeyUnavailableSeen;
    unreadableFieldKeys.add(key);
    if (dataKeyUnavailable) dataKeyUnavailableSeen = true;
    if ((firstFailure || firstKeyFailure) && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<DataRecoveryStatus>(DATA_RECOVERY_EVENT, { detail: getDataRecoveryStatus() }));
    }
}

interface DecryptStats {
    unreadable: number;
}

// ─── DB 열기 ───

function hasAllStores(db: IDBDatabase): boolean {
    return STORES.every(storeName => db.objectStoreNames.contains(storeName));
}

function createMissingStores(db: IDBDatabase) {
    for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
        }
    }
}

function openIndexedDB(version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);

        request.onupgradeneeded = () => {
            const db = request.result;
            createMissingStores(db);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('데이터베이스 업그레이드가 다른 창에서 차단되었습니다. JJSS 창을 모두 닫고 다시 실행해 주세요.'));
    });
}

async function openDB(): Promise<IDBDatabase> {
    if (dbInstance && hasAllStores(dbInstance)) return dbInstance;

    let db: IDBDatabase;
    try {
        db = await openIndexedDB(DB_VERSION);
    } catch (error: any) {
        if (error?.name !== 'VersionError') throw error;
        db = await openIndexedDB();
    }

    if (!hasAllStores(db)) {
        const nextVersion = Math.max(db.version + 1, DB_VERSION);
        db.close();
        db = await openIndexedDB(nextVersion);
    }

    db.onversionchange = () => {
        db.close();
        if (dbInstance === db) dbInstance = null;
    };
    dbInstance = db;
    return dbInstance;
}

/** 고유 ID 생성 (Firestore의 auto-ID 대체) */
export function generateId(): string {
    return crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

/** 현재 타임스탬프 (Firestore serverTimestamp 대체) */
export function localTimestamp(): { seconds: number } {
    return { seconds: Math.floor(Date.now() / 1000) };
}

// ─── 암호화 필드 처리 ───

async function encryptSensitiveFields<T extends Record<string, any>>(storeName: StoreName, doc: T): Promise<T> {
    const fields = sensitiveFieldsFor(storeName, doc);
    if (fields.length === 0) return doc;

    const encrypted = { ...doc } as Record<string, any>;
    for (const field of fields) {
        const plain = serializeSensitiveValue(encrypted[field]);
        if (plain !== null) encrypted[field] = await encrypt(plain);
    }
    return encrypted as T;
}

interface DecryptOptions {
    stats?: DecryptStats;
    /** true면 읽지 못한 필드가 있어도 예외 대신 빈 값으로 둔다(백업처럼 전체를 훑는 경우) */
    lenient?: boolean;
}

type StoredValueOutcome =
    | { ok: true; value: unknown; encrypted: boolean; needsReEncrypt: boolean }
    | { ok: false; dataKeyUnavailable: boolean };

/** 저장값 하나를 복호화한다. 암호문이 아니면(기존 평문) 그대로 돌려준다. */
async function decryptStoredValue(value: unknown): Promise<StoredValueOutcome> {
    if (typeof value !== 'string' || !value) return { ok: true, value, encrypted: false, needsReEncrypt: false };
    const result = await decryptWithStatus(value);
    if (!result.ok) return { ok: false, dataKeyUnavailable: result.dataKeyUnavailable };
    if (!result.encrypted) return { ok: true, value, encrypted: false, needsReEncrypt: false };
    const restored = deserializeSensitiveValue(result.value);
    if (!restored.ok) return { ok: false, dataKeyUnavailable: false };
    return { ok: true, value: restored.value, encrypted: true, needsReEncrypt: result.needsReEncrypt };
}

async function decryptSensitiveFields<T extends Record<string, any>>(storeName: StoreName, doc: T, options: DecryptOptions = {}): Promise<T> {
    const fields = sensitiveFieldsFor(storeName, doc);
    if (fields.length === 0) return doc;

    const strict = STRICT_DECRYPT_STORES.has(storeName);
    const decrypted = { ...doc } as Record<string, any>;
    let failed = false;
    for (const field of fields) {
        const outcome = await decryptStoredValue(decrypted[field]);
        if (outcome.ok) {
            decrypted[field] = outcome.value;
            continue;
        }
        // 암호문을 화면에 보여 주지 않는다. 저장된 원본은 그대로 둔다(저장 시 빈 값은 원본 보존 대상).
        decrypted[field] = strict ? undefined : '';
        failed = true;
        if (options.stats) options.stats.unreadable += 1;
        noteUnreadableField(storeName, doc.id, field, outcome.dataKeyUnavailable);
    }
    if (failed && strict && !options.lenient) throw new DataDecryptError();
    return decrypted as T;
}

function isEmptyFieldValue(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

/** 읽었을 때의 저장값과 지금 저장값이 같은지 (배열·객체 평문도 비교) */
function sameStoredValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/**
 * 저장 직전 보정:
 * - 읽지 못한 암호문(빈 칸으로 표시된 값)을 빈 값으로 덮어쓰지 않는다.
 * - 이번 저장에 포함되지 않은 필드 중 평문이거나 이전 키로 암호화된 값은 현재 키로 다시 암호화한다.
 * migrated에는 "읽었을 때의 저장값"을 기록해, 그사이 다른 저장이 바꾼 값은 덮어쓰지 않게 한다.
 */
async function prepareSensitivePatch(
    storeName: StoreName,
    stored: Record<string, any> | undefined,
    data: Record<string, any>,
    includeMigration: boolean,
): Promise<{ patch: Record<string, any>; migrated: Record<string, unknown> }> {
    const patch = { ...data };
    const migrated: Record<string, unknown> = {};
    if (!stored || !hasSensitivePolicy(storeName)) return { patch, migrated };

    for (const field of sensitiveFieldsFor(storeName, stored)) {
        const storedValue = stored[field];
        if (isEmptyFieldValue(storedValue)) continue;
        const included = Object.prototype.hasOwnProperty.call(data, field);
        if (included && !isEmptyFieldValue(data[field])) continue;

        const status = await decryptStoredValue(storedValue);
        if (!status.ok) {
            // 복호화하지 못한 원본은 보존 (나중에 보안 키가 돌아오거나 백업으로 복원할 수 있게)
            if (included) patch[field] = storedValue;
            continue;
        }
        if (!included && includeMigration && (!status.encrypted || status.needsReEncrypt)) {
            patch[field] = status.value;
            migrated[field] = storedValue;
        }
    }
    return { patch, migrated };
}

function transactionDone(tx: IDBTransaction, fallbackMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(fallbackMessage));
        tx.onabort = () => reject(tx.error || new Error(fallbackMessage));
    });
}

// ─── 원본(암호문 그대로) 읽기 ───

async function getAllRaw<T>(storeName: StoreName): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        let result: T[] = [];
        request.onsuccess = () => {
            result = request.result as T[];
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || request.error);
        tx.onabort = () => reject(tx.error || request.error);
    });
}

async function getRawById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        let result: T | undefined;
        request.onsuccess = () => {
            result = request.result as T | undefined;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || request.error);
        tx.onabort = () => reject(tx.error || request.error);
    });
}

async function getAllDecrypted<T>(storeName: StoreName, options?: DecryptOptions): Promise<T[]> {
    const items = await getAllRaw<T>(storeName);
    if (!hasSensitivePolicy(storeName)) return items;
    return Promise.all(items.map(item => decryptSensitiveFields(storeName, item as any, options))) as Promise<T[]>;
}

// ─── CRUD Operations ───

/** 모든 문서 조회 */
export async function getAll<T>(storeName: StoreName): Promise<T[]> {
    return getAllDecrypted<T>(storeName);
}

/** 단일 문서 조회 */
export async function getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    const item = await getRawById<T>(storeName, id);
    if (!item) return undefined;
    return decryptSensitiveFields(storeName, item as any) as Promise<T>;
}

/** 문서 추가 (id 자동 생성, 같은 id가 있으면 교체) */
export async function addDoc<T extends { id?: string }>(
    storeName: StoreName,
    data: T,
): Promise<T & { id: string }> {
    const db = await openDB();
    const doc = { ...data, id: data.id || generateId() } as T & { id: string };
    let source: Record<string, any> = doc;
    if (data.id && hasSensitivePolicy(storeName)) {
        const stored = await getRawById<Record<string, any>>(storeName, data.id);
        source = (await prepareSensitivePatch(storeName, stored, doc, false)).patch;
    }
    const encryptedDoc = await encryptSensitiveFields(storeName, source);
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(encryptedDoc);
    request.onerror = () => tx.abort();
    await transactionDone(tx, '문서 저장 중 오류가 발생했습니다.');
    return doc;
}

/**
 * 저장된 문서를 다시 읽어 필드가 암호문으로 저장되었고 복호화한 값이 기대값과 같은지 확인한다.
 * localStorage 평문 사본을 지우기 전에 사용한다(확인하지 못하면 false → 원본 유지).
 */
export async function verifyEncryptedField(storeName: StoreName, id: string, field: string, expected: string): Promise<boolean> {
    try {
        const raw = await getRawById<Record<string, unknown>>(storeName, id);
        if (!raw || !isEncrypted(raw[field])) return false;
        const outcome = await decryptStoredValue(raw[field]);
        return outcome.ok && outcome.value === expected;
    } catch {
        return false;
    }
}

/** 조건 필터 조회 */
export async function query<T>(
    storeName: StoreName,
    filter: (item: T) => boolean,
): Promise<T[]> {
    const all = await getAll<T>(storeName);
    return all.filter(filter);
}

/** 문서 업데이트 */
export async function updateDoc<T extends { id?: string }>(
    storeName: StoreName,
    id: string,
    data: Partial<T>,
): Promise<void> {
    const db = await openDB();
    let patch: Record<string, any> = data as Record<string, any>;
    let migrated: Record<string, unknown> = {};
    if (hasSensitivePolicy(storeName)) {
        const stored = await getRawById<Record<string, any>>(storeName, id);
        ({ patch, migrated } = await prepareSensitivePatch(storeName, stored, data as Record<string, any>, true));
    }
    const encryptedData = await encryptSensitiveFields(storeName, patch);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        let requestError: unknown = null;
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(requestError || tx.error || new Error('문서 업데이트 중 오류가 발생했습니다.'));
        tx.onabort = () => reject(requestError || tx.error || new Error('문서 업데이트가 중단되었습니다.'));
        request.onsuccess = () => {
            const current = request.result;
            if (!current) {
                requestError = new Error(`"${storeName}" 스토어에서 ID "${id}" 문서를 찾을 수 없습니다.`);
                tx.abort();
                return;
            }
            const updated = { ...current, ...encryptedData, id };
            for (const [field, storedValue] of Object.entries(migrated)) {
                // 재암호화용으로 읽은 뒤 다른 저장이 먼저 값을 바꿨다면 그 값을 유지한다.
                if (!sameStoredValue(current[field], storedValue)) updated[field] = current[field];
            }
            const putRequest = store.put(updated);
            putRequest.onerror = () => {
                requestError = putRequest.error;
                tx.abort();
            };
        };
        request.onerror = () => {
            requestError = request.error;
            tx.abort();
        };
    });
}

/** 문서 삭제 */
export async function deleteDoc(storeName: StoreName, id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onerror = () => tx.abort();
    await transactionDone(tx, '문서 삭제 중 오류가 발생했습니다.');
}

/**
 * 이용자와 그 이용자의 사례문서를 **한 트랜잭션에서 함께** 삭제한다.
 * 따로 삭제하면 문서만 지워지고 이용자는 남는 중간 상태가 생길 수 있다(그 문서는 되돌릴 수 없다).
 * 하나라도 실패하면 둘 다 지워지지 않는다.
 */
export async function deleteSeekerWithDocuments(seekerId: string, documentIds: string[]): Promise<void> {
    if (!seekerId) throw new Error('삭제할 이용자 ID가 없습니다.');
    const db = await openDB();
    const tx = db.transaction(['seekers', 'caseDocuments'], 'readwrite');
    const seekerStore = tx.objectStore('seekers');
    const documentStore = tx.objectStore('caseDocuments');
    const seekerRequest = seekerStore.delete(seekerId);
    seekerRequest.onerror = () => tx.abort();
    for (const id of documentIds) {
        const request = documentStore.delete(id);
        request.onerror = () => tx.abort();
    }
    await transactionDone(tx, '이용자와 사례문서를 삭제하는 중 오류가 발생했습니다. 아무것도 삭제하지 않았습니다.');
}

/** 여러 문서를 한 번에 삭제 (모두 삭제되거나 하나도 삭제되지 않음) */
export async function deleteDocs(storeName: StoreName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const id of ids) {
        const request = store.delete(id);
        request.onerror = () => tx.abort();
    }
    await transactionDone(tx, '문서 삭제 중 오류가 발생했습니다.');
}

// ─── 저장 데이터 일괄 재암호화 (at-rest migration) ───
//
// 수정하지 않는 오래된 레코드도 디스크에 평문·이전 형식으로 남지 않도록, 앱 시작 후 한 번 저장값을 훑어 현재 형식으로 다시 암호화한다.
// - DB_VERSION·store·필드 구조는 바꾸지 않는다. 값의 저장 형식만 바꾸고(복호화하면 같은 값), 삭제하는 것은 없다.
// - 레코드 하나씩 작은 트랜잭션으로 쓰고, 형식이 바뀌는 필드가 있을 때만 쓴다(중단돼도 다음 실행에서 이어서 진행).
// - 이미 현재 형식인 값은 복호화하지 않고 건너뛴다. v2를 v1으로 바꾸는 등 형식을 낮추지 않는다.
// - 복호화하지 못한 값은 원래 암호문 그대로 둔다. 평문을 쓰지 않는다(암호화 결과를 확인한 뒤에만 쓴다).
// - 배포용 앱에서 데이터 키를 쓸 수 없으면 아무것도 하지 않는다.

/** 완료 표지(localStorage). 개인정보 없이 형식 버전·완료 시각·목표 형식만 기록한다. */
export const AT_REST_MIGRATION_KEY = 'jjss:at-rest-migration';
/** 암호화 정책(대상 필드)이 바뀌면 올린다. */
export const AT_REST_MIGRATION_VERSION = 1;

export interface AtRestMigrationMarker {
    version: number;
    completedAt: string;
    scheme: 'v2' | 'v1';
}

export interface AtRestMigrationResult {
    status: 'completed' | 'skipped' | 'failed';
    /** skipped 사유 */
    reason?: 'secure-storage-unavailable';
    scheme?: 'v2' | 'v1';
    /** 훑어본 레코드 수 */
    scanned: number;
    /** 실제로 다시 쓴 레코드 수 */
    updatedRecords: number;
    /** 형식을 바꾼 필드 수 */
    convertedFields: number;
    /** 복호화하지 못해 원본을 그대로 둔 필드 수 */
    unreadableFields: number;
    /** 훑는 사이 다른 저장이 먼저 값을 바꿔 건너뛴 필드 수 */
    concurrentSkips: number;
    /** 쓰기에 실패한 레코드 수(다음 실행에서 다시 시도) */
    failedRecords: number;
    /** failed일 때 원인(호출하는 쪽에서 메타데이터만 기록할 것) */
    error?: unknown;
}

class AtRestMigrationAbort extends Error {
    readonly code = 'AT_REST_MIGRATION_ABORTED';
    constructor(reason: string) {
        super(reason);
        this.name = 'AtRestMigrationAbort';
    }
}

export function readAtRestMigrationMarker(): AtRestMigrationMarker | null {
    try {
        const raw = localStorage.getItem(AT_REST_MIGRATION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed) || typeof parsed.version !== 'number' || typeof parsed.completedAt !== 'string') return null;
        return {
            version: parsed.version,
            completedAt: parsed.completedAt,
            scheme: parsed.scheme === 'v1' ? 'v1' : 'v2',
        };
    } catch {
        return null;
    }
}

function writeAtRestMigrationMarker(scheme: 'v2' | 'v1') {
    try {
        const marker: AtRestMigrationMarker = { version: AT_REST_MIGRATION_VERSION, completedAt: new Date().toISOString(), scheme };
        localStorage.setItem(AT_REST_MIGRATION_KEY, JSON.stringify(marker));
    } catch {
        // 표지를 남기지 못해도 다음 실행에서 다시 훑을 뿐이다.
    }
}

/** 형식만 보고(복호화 없이) 이 값을 현재 형식으로 바꿔야 하는지 판단한다. */
function storedValueNeedsMigration(value: unknown, target: 'v2' | 'v1'): boolean {
    if (isEmptyFieldValue(value)) return false;
    if (typeof value !== 'string') return serializeSensitiveValue(value) !== null;
    const scheme = getCipherScheme(value);
    if (scheme === null) return true; // 평문
    if (scheme === 'legacy') return true;
    if (scheme === 'v1') return target === 'v2';
    return false; // v2는 이미 최신 형식
}

type FieldConversion =
    | { kind: 'converted'; value: string }
    | { kind: 'unchanged' }
    | { kind: 'unreadable' };

async function convertStoredValue(value: unknown, target: 'v2' | 'v1'): Promise<FieldConversion> {
    let plain: string | null;
    if (typeof value === 'string' && isEncrypted(value)) {
        const result = await decryptWithStatus(value);
        if (!result.ok) return { kind: 'unreadable' };
        if (!result.needsReEncrypt || !result.value) return { kind: 'unchanged' };
        // 복호화한 평문(JSON 표지 포함)을 그대로 다시 암호화한다 → 읽으면 같은 값
        plain = result.value;
    } else {
        plain = serializeSensitiveValue(value);
        if (plain === null) return { kind: 'unchanged' };
    }
    const cipher = await encrypt(plain);
    const scheme = getCipherScheme(cipher);
    // 평문·이전 형식·낮은 형식은 절대 쓰지 않는다.
    if (scheme === null || scheme === 'legacy' || (target === 'v2' && scheme !== 'v2')) {
        throw new AtRestMigrationAbort('unexpected-cipher-scheme');
    }
    return { kind: 'converted', value: cipher };
}

/**
 * 바뀐 필드만 현재 레코드에 반영한다. 훑은 뒤 다른 저장이 값을 먼저 바꿨다면 그 필드는 건드리지 않는다.
 * 반영한 필드 수를 돌려준다.
 */
async function applyMigratedFields(
    storeName: StoreName,
    id: IDBValidKey,
    changes: Map<string, { from: unknown; to: string }>,
): Promise<{ applied: number; skipped: number }> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        let applied = 0;
        let skipped = 0;
        let requestError: unknown = null;
        tx.oncomplete = () => resolve({ applied, skipped });
        tx.onerror = () => reject(requestError || tx.error || new Error('at-rest-migration-write-failed'));
        tx.onabort = () => reject(requestError || tx.error || new Error('at-rest-migration-write-aborted'));
        request.onsuccess = () => {
            const current = request.result as Record<string, any> | undefined;
            if (!current) {
                skipped = changes.size;
                return;
            }
            const updated = { ...current };
            for (const [field, change] of changes) {
                if (sameStoredValue(current[field], change.from)) {
                    updated[field] = change.to;
                    applied += 1;
                } else {
                    skipped += 1;
                }
            }
            if (applied === 0) return;
            const putRequest = store.put(updated);
            putRequest.onerror = () => {
                requestError = putRequest.error;
                tx.abort();
            };
        };
        request.onerror = () => {
            requestError = request.error;
            tx.abort();
        };
    });
}

let atRestMigrationRunning: Promise<AtRestMigrationResult> | null = null;

/**
 * 저장된 개인정보 필드를 현재 형식(데이터 키가 있으면 enc:v2)으로 다시 암호화한다.
 * 여러 번 실행해도 안전하며(이미 현재 형식이면 쓰지 않음), 같은 창에서 동시에 두 번 돌지 않는다.
 */
export function migrateAtRestEncryption(): Promise<AtRestMigrationResult> {
    if (!atRestMigrationRunning) {
        const running = runAtRestMigration();
        atRestMigrationRunning = running;
        void running.finally(() => {
            if (atRestMigrationRunning === running) atRestMigrationRunning = null;
        });
    }
    return atRestMigrationRunning;
}

async function runAtRestMigration(): Promise<AtRestMigrationResult> {
    const result: AtRestMigrationResult = {
        status: 'completed',
        scanned: 0,
        updatedRecords: 0,
        convertedFields: 0,
        unreadableFields: 0,
        concurrentSkips: 0,
        failedRecords: 0,
    };

    let target: 'v2' | 'v1' | null;
    try {
        target = await getAtRestTargetScheme();
    } catch (error) {
        return { ...result, status: 'failed', error };
    }
    if (!target) return { ...result, status: 'skipped', reason: 'secure-storage-unavailable' };
    result.scheme = target;

    try {
        for (const storeName of STORES) {
            if (!hasSensitivePolicy(storeName)) continue;
            const records = await getAllRaw<Record<string, any>>(storeName);
            for (const record of records) {
                if (!isRecord(record)) continue;
                const id = record.id as IDBValidKey | undefined;
                if (id === undefined || id === null) continue;
                result.scanned += 1;
                const fields = sensitiveFieldsFor(storeName, record).filter(field => storedValueNeedsMigration(record[field], target));
                if (fields.length === 0) continue;

                const changes = new Map<string, { from: unknown; to: string }>();
                for (const field of fields) {
                    const conversion = await convertStoredValue(record[field], target);
                    if (conversion.kind === 'unreadable') result.unreadableFields += 1;
                    else if (conversion.kind === 'converted') changes.set(field, { from: record[field], to: conversion.value });
                }
                if (changes.size === 0) continue;

                try {
                    const { applied, skipped } = await applyMigratedFields(storeName, id, changes);
                    result.convertedFields += applied;
                    result.concurrentSkips += skipped;
                    if (applied > 0) result.updatedRecords += 1;
                } catch {
                    // 이 레코드는 원본 그대로 남는다. 나머지는 계속 진행하고 다음 실행에서 다시 시도한다.
                    result.failedRecords += 1;
                }
            }
        }
    } catch (error) {
        // 보안 저장소를 쓸 수 없게 됐거나 예상하지 못한 형식이 나오면 즉시 멈춘다(이미 쓴 레코드는 올바른 암호문).
        return { ...result, status: 'failed', error };
    }

    if (result.failedRecords > 0) {
        return { ...result, status: 'failed' };
    }
    const previous = readAtRestMigrationMarker();
    if (result.updatedRecords > 0 || !previous || previous.version !== AT_REST_MIGRATION_VERSION || previous.scheme !== target) {
        writeAtRestMigrationMarker(target);
    }
    return result;
}

// ─── 데이터 내보내기 / 불러오기 ───

type BackupItem = Record<string, unknown> & { id?: string };
type VocationalEvaluationHistoryItem = {
    id: string;
    type: 'analysis' | 'report';
    title: string;
    content: string;
    savedAt: string;
    updatedAt?: string;
};

export interface BackupExportResult {
    /** 백업 JSON(평문). 비밀번호 암호화는 호출하는 쪽에서 처리한다. */
    json: string;
    /** 사용자에게 알려야 할 주의 사항(일부 항목 제외 등) */
    warnings: string[];
}

/** 복원 전 검증을 마친 백업 데이터 */
export type ParsedBackupData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 평가 이력 항목 하나를 검사한다. 올바르면 정규화한 항목, 아니면 오류 사유 문자열. */
function checkVocationalEvaluationItem(item: unknown, ids: Set<string>): VocationalEvaluationHistoryItem | 'shape' | 'id' | 'content' {
    if (!isRecord(item)) return 'shape';
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) return 'id';
    if ((item.type !== 'analysis' && item.type !== 'report')
        || typeof item.title !== 'string'
        || typeof item.content !== 'string'
        || typeof item.savedAt !== 'string'
        || (item.updatedAt !== undefined && typeof item.updatedAt !== 'string')) {
        return 'content';
    }
    return {
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        savedAt: item.savedAt,
        ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    };
}

/** 복원용 엄격 검증: 항목 하나라도 잘못되면 복원을 중단한다. */
function validateVocationalEvaluationHistory(value: unknown): VocationalEvaluationHistoryItem[] {
    if (!Array.isArray(value)) {
        throw new Error('백업 파일의 "vocationalEvaluationHistory" 데이터가 배열 형식이 아닙니다.');
    }

    const ids = new Set<string>();
    return value.map((item, index) => {
        const checked = checkVocationalEvaluationItem(item, ids);
        if (checked === 'shape') {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 형식이 올바르지 않습니다.`);
        }
        if (checked === 'id') {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 ID가 올바르지 않습니다.`);
        }
        if (checked === 'content') {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 내용이 올바르지 않습니다.`);
        }
        ids.add(checked.id);
        return checked;
    });
}

/** 내보내기용 관용 처리: 깨진 항목만 빼고 나머지는 백업한다. */
function collectVocationalEvaluationHistoryForExport(raw: string | null, warnings: string[]): VocationalEvaluationHistoryItem[] | undefined {
    if (!raw) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        warnings.push('직업평가 저장 이력을 읽지 못해 이번 백업에서 제외했습니다. 기존 이력은 그대로 두었습니다.');
        return undefined;
    }
    if (!Array.isArray(parsed)) {
        warnings.push('직업평가 저장 이력의 형식이 올바르지 않아 이번 백업에서 제외했습니다. 기존 이력은 그대로 두었습니다.');
        return undefined;
    }
    const ids = new Set<string>();
    const items: VocationalEvaluationHistoryItem[] = [];
    let skipped = 0;
    for (const item of parsed) {
        const checked = checkVocationalEvaluationItem(item, ids);
        if (typeof checked === 'string') {
            skipped += 1;
            continue;
        }
        ids.add(checked.id);
        items.push(checked);
    }
    if (skipped > 0) {
        warnings.push(`직업평가 저장 이력 ${skipped}건은 형식이 올바르지 않아 백업에서 제외했습니다.`);
    }
    return items;
}

function validateBackupData(value: unknown): ParsedBackupData {
    if (!isRecord(value)) {
        throw new Error('백업 파일의 최상위 형식이 올바르지 않습니다.');
    }

    let recognizedSections = 0;
    for (const storeName of STORES) {
        if (!Object.prototype.hasOwnProperty.call(value, storeName)) continue;
        recognizedSections += 1;
        const items = value[storeName];
        if (!Array.isArray(items)) {
            throw new Error(`백업 파일의 "${storeName}" 데이터가 배열 형식이 아닙니다.`);
        }

        const ids = new Set<string>();
        items.forEach((item, index) => {
            if (!isRecord(item)) {
                throw new Error(`백업 파일의 "${storeName}" ${index + 1}번째 항목 형식이 올바르지 않습니다.`);
            }
            if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) {
                throw new Error(`백업 파일의 "${storeName}" ${index + 1}번째 항목 ID가 올바르지 않습니다.`);
            }
            if (typeof item.id === 'string') {
                if (ids.has(item.id)) {
                    throw new Error(`백업 파일의 "${storeName}"에 중복 ID "${item.id}"가 있습니다.`);
                }
                ids.add(item.id);
            }
        });
    }

    if (Object.prototype.hasOwnProperty.call(value, 'budgetProjects')) {
        recognizedSections += 1;
        if (!Array.isArray(value.budgetProjects)) {
            throw new Error('백업 파일의 "budgetProjects" 데이터가 배열 형식이 아닙니다.');
        }
        value.budgetProjects.forEach((item, index) => {
            if (!isRecord(item)) {
                throw new Error(`백업 파일의 "budgetProjects" ${index + 1}번째 항목 형식이 올바르지 않습니다.`);
            }
        });
    }

    if (Object.prototype.hasOwnProperty.call(value, 'vocationalEvaluationHistory')) {
        recognizedSections += 1;
        value.vocationalEvaluationHistory = validateVocationalEvaluationHistory(value.vocationalEvaluationHistory);
    }

    if (recognizedSections === 0) {
        throw new Error('백업 파일에 복원할 수 있는 JJSS 데이터가 없습니다.');
    }

    return value;
}

/** 백업 JSON 문자열을 해석·검증한다(복원 전 미리 확인용). 문제가 있으면 한국어 오류를 던진다. */
/**
 * 백업 파일 방어 한계값.
 * 실제 기관 백업은 수 MB, 항목 수천 건 수준이라 아래 값은 정상 사용을 막지 않는다.
 * 지나치게 큰 파일이나 깊게 중첩된 구조로 앱이 멈추는 것을 막기 위한 것이다.
 */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
export const MAX_BACKUP_ITEMS_PER_STORE = 200_000;
const MAX_BACKUP_DEPTH = 32;
/** JSON 프로토타입 오염에 쓰이는 키. 백업에 들어 있으면 거부한다. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafeStructure(value: unknown, depth = 0): void {
    if (depth > MAX_BACKUP_DEPTH) {
        throw new Error('백업 파일의 구조가 너무 깊습니다. 올바른 JJSS 백업 파일인지 확인해 주세요.');
    }
    if (Array.isArray(value)) {
        if (value.length > MAX_BACKUP_ITEMS_PER_STORE) {
            throw new Error('백업 파일의 항목이 너무 많습니다. 올바른 JJSS 백업 파일인지 확인해 주세요.');
        }
        for (const item of value) assertSafeStructure(item, depth + 1);
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) {
            throw new Error('백업 파일에 허용되지 않은 항목 이름이 있습니다.');
        }
        assertSafeStructure(item, depth + 1);
    }
}

export function parseBackupJson(jsonString: string): ParsedBackupData {
    // JSON.parse 전에 크기부터 본다. 아주 큰 파일은 파싱 자체가 화면을 멈추게 한다.
    const size = typeof jsonString === 'string' ? jsonString.length : 0;
    if (size === 0) throw new Error('백업 파일이 비어 있습니다.');
    if (size > MAX_BACKUP_BYTES) {
        throw new Error(
            `백업 파일이 너무 큽니다(${Math.round(size / (1024 * 1024))}MB). 올바른 JJSS 백업 파일인지 확인해 주세요.`,
        );
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        throw new Error('백업 파일이 올바른 JSON 형식이 아닙니다.');
    }
    assertSafeStructure(parsed);
    return validateBackupData(parsed);
}

function isCredentialField(field: string): boolean {
    const normalized = field.replace(/[\s_-]/g, '').toLowerCase();
    return normalized.includes('apikey')
        || /token(encrypted)?$/.test(normalized)
        || /secret(encrypted)?$/.test(normalized)
        || /credentials?(encrypted)?$/.test(normalized)
        || /password(encrypted)?$/.test(normalized);
}

function sanitizeCredentialFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sanitizeCredentialFields);
    if (!isRecord(value)) return value;

    const sanitized: Record<string, unknown> = {};
    for (const [field, fieldValue] of Object.entries(value)) {
        sanitized[field] = isCredentialField(field) ? '' : sanitizeCredentialFields(fieldValue);
    }
    return sanitized;
}

/**
 * 전체 데이터를 백업 JSON으로 만든다.
 * 개인정보 필드는 복호화된 평문으로 들어가므로, 파일로 저장할 때는 비밀번호 암호화를 권장한다.
 * 깨진 보조 데이터(직업평가 이력 등)가 있어도 백업 전체를 실패시키지 않고 경고로 알린다.
 */
export async function createBackupJson(): Promise<BackupExportResult> {
    const data: Record<string, unknown> = {};
    const warnings: string[] = [];
    const stats: DecryptStats = { unreadable: 0 };
    for (const store of STORES) {
        let items = await getAllDecrypted<unknown>(store, { stats, lenient: true });
        // 보안: settings 스토어에서 API 키 관련 정보 제거 후 내보내기
        if (store === 'settings') {
            items = items.map(item => sanitizeCredentialFields(item));
        }
        data[store] = items;
    }

    const budgetProjectsRaw = localStorage.getItem(BUDGET_PROJECTS_KEY);
    if (!budgetProjectsRaw) {
        data.budgetProjects = [];
    } else {
        try {
            const budgetProjects = JSON.parse(budgetProjectsRaw);
            if (!Array.isArray(budgetProjects)) throw new Error('not-array');
            const validProjects = budgetProjects.filter(isRecord);
            if (validProjects.length !== budgetProjects.length) {
                warnings.push(`사업 예산 ${budgetProjects.length - validProjects.length}건은 형식이 올바르지 않아 백업에서 제외했습니다.`);
            }
            data.budgetProjects = validProjects;
        } catch {
            warnings.push('사업 예산 데이터를 읽지 못해 이번 백업에서 제외했습니다. 기존 데이터는 그대로 두었습니다.');
        }
    }

    const vocationalEvaluationHistory = collectVocationalEvaluationHistoryForExport(
        localStorage.getItem(VOCATIONAL_EVALUATION_HISTORY_KEY),
        warnings,
    );
    if (vocationalEvaluationHistory) data.vocationalEvaluationHistory = vocationalEvaluationHistory;

    if (stats.unreadable > 0) {
        warnings.unshift(`이 PC에서 읽지 못한 암호화 항목 ${stats.unreadable}개는 백업 파일에 빈 칸으로 저장되었습니다.`);
    }

    return { json: JSON.stringify(data, null, 2), warnings };
}

function findMatchingCurrentItem(imported: unknown, currentItems: unknown[], index: number): unknown {
    if (!isRecord(imported)) return currentItems[index];
    const identityFields = ['provider', 'id', 'name'];
    for (const field of identityFields) {
        const identity = imported[field];
        if (typeof identity !== 'string' || !identity) continue;
        const matched = currentItems.find(item => isRecord(item) && item[field] === identity);
        if (matched) return matched;
    }
    return currentItems[index];
}

function preserveCredentialFields(imported: unknown, current: unknown): unknown {
    if (Array.isArray(imported)) {
        const currentItems = Array.isArray(current) ? current : [];
        return imported.map((item, index) =>
            preserveCredentialFields(item, findMatchingCurrentItem(item, currentItems, index))
        );
    }
    if (!isRecord(imported)) return imported;

    const currentRecord = isRecord(current) ? current : {};
    const result: Record<string, unknown> = {};
    for (const [field, importedValue] of Object.entries(imported)) {
        if (isCredentialField(field)) {
            result[field] = Object.prototype.hasOwnProperty.call(currentRecord, field) ? currentRecord[field] : '';
        } else {
            result[field] = preserveCredentialFields(importedValue, currentRecord[field]);
        }
    }

    for (const [field, currentValue] of Object.entries(currentRecord)) {
        if (isCredentialField(field) && !Object.prototype.hasOwnProperty.call(result, field)) {
            result[field] = currentValue;
        }
    }
    return result;
}

function mergeSettingsWithCurrentCredentials(imported: BackupItem, current?: BackupItem): BackupItem {
    const merged = preserveCredentialFields(imported, current) as BackupItem;
    if (!current) return merged;

    const currentConfigs = Array.isArray(current.llmConfigs) ? current.llmConfigs.filter(isRecord) : [];
    const importedConfigs = Array.isArray(merged.llmConfigs) ? merged.llmConfigs.filter(isRecord) : [];
    if (!Array.isArray(merged.llmConfigs)) {
        merged.llmConfigs = currentConfigs;
    } else {
        const importedProviders = new Set(importedConfigs.map(config => config.provider).filter(Boolean));
        merged.llmConfigs = [
            ...importedConfigs,
            ...currentConfigs.filter(config => !importedProviders.has(config.provider)),
        ];
    }
    return merged;
}

async function prepareStoreItems(storeName: StoreName, items: BackupItem[]): Promise<BackupItem[]> {
    return Promise.all(items.map(item =>
        encryptSensitiveFields(storeName, { ...item, id: item.id || generateId() } as BackupItem)
    ));
}

async function replaceStoreContents(db: IDBDatabase, storeName: StoreName, items: BackupItem[]): Promise<void> {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const clearRequest = store.clear();
    clearRequest.onerror = () => tx.abort();
    for (const item of items) {
        const request = store.put(item);
        request.onerror = () => tx.abort();
    }
    await transactionDone(tx, `"${storeName}" 데이터 복원 중 오류가 발생했습니다.`);
}

/**
 * 복원 진행 표지(journal).
 *
 * 복원 도중 앱이 강제 종료되거나 PC 전원이 꺼지면 `catch`가 실행되지 않아
 * 일부 store만 새 백업으로 바뀐 **혼합 상태**가 남을 수 있다.
 * 시작할 때 이 표지를 남기고 끝나면 지워서, 다음 실행에서 미완료 복원을 알아채게 한다.
 * 개인정보는 넣지 않는다(시각과 대상 store 이름만).
 */
export const RESTORE_JOURNAL_KEY = 'jjss:restore-journal';

export interface RestoreJournal {
    restoreId: string;
    startedAt: string;
    stores: string[];
}

function writeRestoreJournal(journal: RestoreJournal | null): void {
    try {
        if (journal === null) localStorage.removeItem(RESTORE_JOURNAL_KEY);
        else localStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
    } catch {
        // 표지를 남기지 못해도 복원 자체는 진행한다.
    }
}

/** 지난 실행에서 끝내지 못한 복원이 있으면 그 표지를 돌려준다. */
export function readRestoreJournal(): RestoreJournal | null {
    try {
        const raw = localStorage.getItem(RESTORE_JOURNAL_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<RestoreJournal>;
        if (typeof parsed?.restoreId !== 'string' || !parsed.restoreId) return null;
        return {
            restoreId: parsed.restoreId,
            startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
            stores: Array.isArray(parsed.stores) ? parsed.stores.filter(item => typeof item === 'string') : [],
        };
    } catch {
        return null;
    }
}

/** 사용자가 확인한 뒤 표지를 치운다. */
export function clearRestoreJournal(): void {
    writeRestoreJournal(null);
}

/**
 * 백업 데이터를 불러와서 저장 (확인 후 기존 데이터 대체)
 * @param source 평문 백업 JSON 문자열 또는 parseBackupJson으로 검증한 데이터
 */
export async function importAllData(source: string | ParsedBackupData): Promise<void> {
    const data = typeof source === 'string' ? parseBackupJson(source) : validateBackupData(source);
    const db = await openDB();
    // settings에는 암호화 필드가 없으므로 원본을 그대로 쓴다(API 키 암호문 보존).
    const currentSettings = await getRawById<BackupItem>('settings', 'app-settings').catch(() => undefined);
    const affectedStores = STORES.filter(storeName => Array.isArray(data[storeName]));
    // 원복용 스냅샷은 저장된 원본(암호문 포함)을 그대로 보관한다. 읽지 못한 암호문도 잃지 않는다.
    const snapshots = new Map<StoreName, BackupItem[]>();
    const preparedImports = new Map<StoreName, BackupItem[]>();

    // 모든 검증·암호화 준비와 현재 데이터 snapshot을 끝낸 뒤에만 기존 store를 변경한다.
    for (const storeName of affectedStores) {
        snapshots.set(storeName, await getAllRaw<BackupItem>(storeName));

        const importedItems = data[storeName] as BackupItem[];
        let sourceItems = importedItems;
        if (storeName === 'settings') {
            sourceItems = importedItems.map(item =>
                item.id === 'app-settings'
                    ? mergeSettingsWithCurrentCredentials(item, currentSettings)
                    : preserveCredentialFields(item, undefined) as BackupItem
            );
            if (currentSettings && !sourceItems.some(item => item.id === 'app-settings')) {
                sourceItems = [...sourceItems, currentSettings];
            }
        }
        preparedImports.set(storeName, await prepareStoreItems(storeName, sourceItems));
    }

    const budgetProjectsIncluded = Array.isArray(data.budgetProjects);
    const previousBudgetProjects = budgetProjectsIncluded ? localStorage.getItem(BUDGET_PROJECTS_KEY) : null;
    const vocationalEvaluationHistoryIncluded = Array.isArray(data.vocationalEvaluationHistory);
    const previousVocationalEvaluationHistory = vocationalEvaluationHistoryIncluded
        ? localStorage.getItem(VOCATIONAL_EVALUATION_HISTORY_KEY)
        : null;

    // 실제 쓰기를 시작하기 직전에 표지를 남긴다. 여기서부터가 되돌릴 수 없는 구간이다.
    writeRestoreJournal({
        restoreId: generateId(),
        startedAt: new Date().toISOString(),
        stores: affectedStores.map(String),
    });

    try {
        for (const storeName of affectedStores) {
            await replaceStoreContents(db, storeName, preparedImports.get(storeName) || []);
        }
        if (budgetProjectsIncluded) {
            localStorage.setItem(BUDGET_PROJECTS_KEY, JSON.stringify(data.budgetProjects));
        }
        if (vocationalEvaluationHistoryIncluded) {
            localStorage.setItem(VOCATIONAL_EVALUATION_HISTORY_KEY, JSON.stringify(data.vocationalEvaluationHistory));
        }
    } catch (error: any) {
        const rollbackErrors: string[] = [];
        for (const storeName of affectedStores) {
            try {
                await replaceStoreContents(db, storeName, snapshots.get(storeName) || []);
            } catch {
                rollbackErrors.push(storeName);
            }
        }
        if (budgetProjectsIncluded) {
            try {
                if (previousBudgetProjects === null) localStorage.removeItem(BUDGET_PROJECTS_KEY);
                else localStorage.setItem(BUDGET_PROJECTS_KEY, previousBudgetProjects);
            } catch {
                rollbackErrors.push('budgetProjects');
            }
        }
        if (vocationalEvaluationHistoryIncluded) {
            try {
                if (previousVocationalEvaluationHistory === null) localStorage.removeItem(VOCATIONAL_EVALUATION_HISTORY_KEY);
                else localStorage.setItem(VOCATIONAL_EVALUATION_HISTORY_KEY, previousVocationalEvaluationHistory);
            } catch {
                rollbackErrors.push('vocationalEvaluationHistory');
            }
        }
        const rollbackMessage = rollbackErrors.length
            ? ` 일부 데이터(${rollbackErrors.join(', ')})는 자동 원복 여부를 확인해야 합니다.`
            : ' 변경된 데이터는 복원 전 상태로 되돌렸습니다.';
        // 원복까지 끝났으면 미완료 표지를 남길 이유가 없다. 원복에 실패한 것이 있으면 표지를 남겨
        // 다음 실행에서 사용자에게 알린다.
        if (!rollbackErrors.length) writeRestoreJournal(null);
        throw new Error(`${error?.message || '데이터 복원 중 오류가 발생했습니다.'}${rollbackMessage}`);
    }
    // 모든 쓰기가 끝났다. 여기까지 와야 복원이 완료된 것이다.
    writeRestoreJournal(null);
}
