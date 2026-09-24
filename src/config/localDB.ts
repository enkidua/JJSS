/**
 * IndexedDB 기반 로컬 데이터베이스 유틸리티
 * Firebase/Firestore를 대체하여 사용자 PC에 데이터를 영구 저장합니다.
 */

import { decryptWithStatus, encrypt, isEncrypted } from './crypto';

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
 * 저장 시 암호화하는 개인정보 필드.
 * 기존 평문 레코드는 그대로 읽히며, 해당 레코드를 다음에 저장할 때 암호화된다.
 */
const SENSITIVE_FIELDS: Partial<Record<StoreName, string[]>> = {
    seekers: ['name', 'seekerId', 'phone', 'address', 'birthDate', 'disabilityType', 'notes'],
    caseDocuments: ['content', 'seekerName'],
};

// ─── 복호화 실패(복구 필요) 상태 ───

export const DATA_RECOVERY_EVENT = 'jjss:data-recovery-needed';

export interface DataRecoveryStatus {
    /** 이번 실행 중 읽지 못한 암호화 필드 수 */
    unreadableCount: number;
    /** 이 PC에서 보안 데이터 키(DPAPI)를 불러오지 못해 읽지 못한 값이 있음 */
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
    const fields = SENSITIVE_FIELDS[storeName];
    if (!fields || fields.length === 0) return doc;

    const encrypted = { ...doc } as Record<string, any>;
    for (const field of fields) {
        const value = encrypted[field];
        if (typeof value === 'string' && value && !isEncrypted(value)) {
            encrypted[field] = await encrypt(value);
        }
    }
    return encrypted as T;
}

async function decryptSensitiveFields<T extends Record<string, any>>(storeName: StoreName, doc: T, stats?: DecryptStats): Promise<T> {
    const fields = SENSITIVE_FIELDS[storeName];
    if (!fields || fields.length === 0) return doc;

    const decrypted = { ...doc } as Record<string, any>;
    for (const field of fields) {
        const value = decrypted[field];
        if (typeof value !== 'string' || !value) continue;
        const result = await decryptWithStatus(value);
        if (result.ok) {
            decrypted[field] = result.value;
        } else {
            // 암호문을 화면에 보여 주지 않고 빈 값으로 표시한다. 저장된 원본은 그대로 둔다.
            decrypted[field] = '';
            if (stats) stats.unreadable += 1;
            noteUnreadableField(storeName, doc.id, field, result.dataKeyUnavailable);
        }
    }
    return decrypted as T;
}

function isEmptyFieldValue(value: unknown): boolean {
    return value === undefined || value === null || value === '';
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
    const fields = SENSITIVE_FIELDS[storeName];
    const patch = { ...data };
    const migrated: Record<string, unknown> = {};
    if (!fields || !stored) return { patch, migrated };

    for (const field of fields) {
        const storedValue = stored[field];
        if (typeof storedValue !== 'string' || !storedValue) continue;
        const included = Object.prototype.hasOwnProperty.call(data, field);
        if (included && !isEmptyFieldValue(data[field])) continue;

        const status = await decryptWithStatus(storedValue);
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

async function getAllDecrypted<T>(storeName: StoreName, stats?: DecryptStats): Promise<T[]> {
    const items = await getAllRaw<T>(storeName);
    if (!SENSITIVE_FIELDS[storeName]) return items;
    return Promise.all(items.map(item => decryptSensitiveFields(storeName, item as any, stats))) as Promise<T[]>;
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
    if (data.id && SENSITIVE_FIELDS[storeName]) {
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
    if (SENSITIVE_FIELDS[storeName]) {
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
                if (current[field] !== storedValue) updated[field] = current[field];
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
export function parseBackupJson(jsonString: string): ParsedBackupData {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        throw new Error('백업 파일이 올바른 JSON 형식이 아닙니다.');
    }
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
        let items = await getAllDecrypted<unknown>(store, stats);
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
        throw new Error(`${error?.message || '데이터 복원 중 오류가 발생했습니다.'}${rollbackMessage}`);
    }
}
