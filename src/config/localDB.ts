/**
 * IndexedDB 기반 로컬 데이터베이스 유틸리티
 * Firebase/Firestore를 대체하여 사용자 PC에 데이터를 영구 저장합니다.
 */

import { decrypt, encrypt, isEncrypted } from './crypto';

const DB_NAME = 'JJSS_LOCAL_DB';
const DB_VERSION = 3;
const VOCATIONAL_EVALUATION_HISTORY_KEY = 'jjss:vocational-evaluation-history';

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

const SENSITIVE_FIELDS: Partial<Record<StoreName, string[]>> = {
    seekers: ['name', 'seekerId'],
    caseDocuments: ['content'],
};

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

// ─── CRUD Operations ───

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

async function decryptSensitiveFields<T extends Record<string, any>>(storeName: StoreName, doc: T): Promise<T> {
    const fields = SENSITIVE_FIELDS[storeName];
    if (!fields || fields.length === 0) return doc;

    const decrypted = { ...doc } as Record<string, any>;
    for (const field of fields) {
        const value = decrypted[field];
        if (typeof value === 'string' && value) {
            const plain = isEncrypted(value) ? await decrypt(value) : value;
            decrypted[field] = plain || value;
        }
    }
    return decrypted as T;
}

function transactionDone(tx: IDBTransaction, fallbackMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(fallbackMessage));
        tx.onabort = () => reject(tx.error || new Error(fallbackMessage));
    });
}

/** 모든 문서 조회 */
export async function getAll<T>(storeName: StoreName): Promise<T[]> {
    const db = await openDB();
    const items: T[] = await new Promise((resolve, reject) => {
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

    if (!SENSITIVE_FIELDS[storeName]) return items;
    return Promise.all(items.map(item => decryptSensitiveFields(storeName, item as any))) as Promise<T[]>;
}

/** 단일 문서 조회 */
export async function getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    const db = await openDB();
    const item: T | undefined = await new Promise((resolve, reject) => {
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
    if (!item) return undefined;
    return decryptSensitiveFields(storeName, item as any) as Promise<T>;
}

/** 문서 추가 (id 자동 생성) */
export async function addDoc<T extends { id?: string }>(
    storeName: StoreName,
    data: T,
): Promise<T & { id: string }> {
    const db = await openDB();
    const doc = { ...data, id: data.id || generateId() } as T & { id: string };
    const encryptedDoc = await encryptSensitiveFields(storeName, doc as any);
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
    const encryptedData = await encryptSensitiveFields(storeName, data as any);
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

// ─── 데이터 내보내기 / 불러오기 ───

/** 전체 데이터를 JSON으로 내보내기 */
export async function exportAllData(): Promise<string> {
    const data: Record<string, unknown[]> = {};
    for (const store of STORES) {
        let items = await getAll(store);
        // 보안: settings 스토어에서 API 키 관련 정보 제거 후 내보내기
        if (store === 'settings') {
            items = items.map(item => sanitizeCredentialFields(item));
        }
        data[store] = items;
    }
    try {
        const budgetProjects = localStorage.getItem('jjss:budget-projects');
        data.budgetProjects = budgetProjects ? JSON.parse(budgetProjects) : [];
    } catch {
        data.budgetProjects = [];
    }
    const vocationalEvaluationHistory = localStorage.getItem(VOCATIONAL_EVALUATION_HISTORY_KEY);
    data.vocationalEvaluationHistory = vocationalEvaluationHistory
        ? validateVocationalEvaluationHistory(JSON.parse(vocationalEvaluationHistory))
        : [];
    return JSON.stringify(data, null, 2);
}

type BackupItem = Record<string, unknown> & { id?: string };
type VocationalEvaluationHistoryItem = {
    id: string;
    type: 'analysis' | 'report';
    title: string;
    content: string;
    savedAt: string;
    updatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVocationalEvaluationHistory(value: unknown): VocationalEvaluationHistoryItem[] {
    if (!Array.isArray(value)) {
        throw new Error('백업 파일의 "vocationalEvaluationHistory" 데이터가 배열 형식이 아닙니다.');
    }

    const ids = new Set<string>();
    return value.map((item, index) => {
        if (!isRecord(item)) {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 형식이 올바르지 않습니다.`);
        }
        if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 ID가 올바르지 않습니다.`);
        }
        if ((item.type !== 'analysis' && item.type !== 'report')
            || typeof item.title !== 'string'
            || typeof item.content !== 'string'
            || typeof item.savedAt !== 'string'
            || (item.updatedAt !== undefined && typeof item.updatedAt !== 'string')) {
            throw new Error(`백업 파일의 "vocationalEvaluationHistory" ${index + 1}번째 항목 내용이 올바르지 않습니다.`);
        }
        ids.add(item.id);
        return {
            id: item.id,
            type: item.type,
            title: item.title,
            content: item.content,
            savedAt: item.savedAt,
            ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
        };
    });
}

function validateBackupData(value: unknown): Record<string, unknown> {
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

/** JSON 데이터를 불러와서 저장 (확인 후 기존 데이터 대체) */
export async function importAllData(jsonString: string): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        throw new Error('백업 파일이 올바른 JSON 형식이 아닙니다.');
    }
    const data = validateBackupData(parsed);
    const db = await openDB();
    const currentSettings = await getById<BackupItem>('settings', 'app-settings').catch(() => undefined);
    const affectedStores = STORES.filter(storeName => Array.isArray(data[storeName]));
    const snapshots = new Map<StoreName, BackupItem[]>();
    const preparedSnapshots = new Map<StoreName, BackupItem[]>();
    const preparedImports = new Map<StoreName, BackupItem[]>();

    // 모든 검증·암호화 준비와 현재 데이터 snapshot을 끝낸 뒤에만 기존 store를 변경한다.
    for (const storeName of affectedStores) {
        const snapshot = await getAll<BackupItem>(storeName);
        snapshots.set(storeName, snapshot);
        preparedSnapshots.set(storeName, await prepareStoreItems(storeName, snapshot));

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
    const previousBudgetProjects = budgetProjectsIncluded ? localStorage.getItem('jjss:budget-projects') : null;
    const vocationalEvaluationHistoryIncluded = Array.isArray(data.vocationalEvaluationHistory);
    const previousVocationalEvaluationHistory = vocationalEvaluationHistoryIncluded
        ? localStorage.getItem(VOCATIONAL_EVALUATION_HISTORY_KEY)
        : null;

    try {
        for (const storeName of affectedStores) {
            await replaceStoreContents(db, storeName, preparedImports.get(storeName) || []);
        }
        if (budgetProjectsIncluded) {
            localStorage.setItem('jjss:budget-projects', JSON.stringify(data.budgetProjects));
        }
        if (vocationalEvaluationHistoryIncluded) {
            localStorage.setItem(VOCATIONAL_EVALUATION_HISTORY_KEY, JSON.stringify(data.vocationalEvaluationHistory));
        }
    } catch (error: any) {
        const rollbackErrors: string[] = [];
        for (const storeName of affectedStores) {
            try {
                await replaceStoreContents(db, storeName, preparedSnapshots.get(storeName) || snapshots.get(storeName) || []);
            } catch {
                rollbackErrors.push(storeName);
            }
        }
        if (budgetProjectsIncluded) {
            try {
                if (previousBudgetProjects === null) localStorage.removeItem('jjss:budget-projects');
                else localStorage.setItem('jjss:budget-projects', previousBudgetProjects);
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
