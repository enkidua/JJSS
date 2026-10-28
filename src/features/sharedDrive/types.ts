/**
 * 공유 저장소(기관 Google Workspace 공유 드라이브) 동기화의 계약.
 * 드라이브 접근(OAuth 토큰·HTTP)은 Electron main 프로세스(electron/googleDrive.cjs)만 하고,
 * 렌더러는 window.jjssDrive(DriveApi)로 요청한다. 토큰은 렌더러에 오지 않는다.
 */
import type { StoreName } from '../../config/localDB';

/** 1단계에서 공유하는 저장소(사례관리). 직업훈련·예산은 2단계. */
export const SYNCED_STORES = ['seekers', 'caseDocuments'] as const;
export type SyncedStore = (typeof SYNCED_STORES)[number];

export function isSyncedStore(store: StoreName | string): store is SyncedStore {
    return (SYNCED_STORES as readonly string[]).includes(store);
}

/** 레코드 식별자: "<store>:<id>" */
export type RecordKey = `${SyncedStore}:${string}`;

export function recordKey(store: SyncedStore, id: string): RecordKey {
    return `${store}:${id}` as RecordKey;
}

export function parseRecordKey(key: string): { store: SyncedStore; id: string } | null {
    const index = key.indexOf(':');
    if (index < 0) return null;
    const store = key.slice(0, index);
    const id = key.slice(index + 1);
    if (!isSyncedStore(store) || !id) return null;
    return { store, id };
}

/** 드라이브 파일 속성(appProperties). 모두 평문이므로 개인정보를 넣지 않는다. */
export interface RecordProperties {
    jjssKind: 'record';
    store: SyncedStore;
    rid: string;
    version: string;
    updatedAt: string;
    /** 마지막으로 올린 직원 계정(기관 도메인 메일) */
    updatedBy: string;
    deleted: '0' | '1';
    keyId: string;
    /** 기관 키로 만든 내용 지문(HMAC) */
    hash: string;
    editingBy?: string;
    editingSince?: string;
}

export interface RemoteFile {
    id: string;
    name: string;
    modifiedTime?: string;
    appProperties: Partial<RecordProperties> & Record<string, string | undefined>;
}

export interface DriveChange {
    fileId: string;
    removed: boolean;
    file?: RemoteFile & { trashed?: boolean };
}

export interface SharedDriveInfo {
    id: string;
    name: string;
}

/** 공유 드라이브 보안 점검에 쓰는 정보(main이 드라이브 API에서 모아 준다) */
export interface DriveSecurityFacts {
    isSharedDrive: boolean;
    driveName: string;
    restrictions: {
        adminManagedRestrictions?: boolean;
        copyRequiresWriterPermission?: boolean;
        domainUsersOnly?: boolean;
        driveMembersOnly?: boolean;
    };
    permissions: Array<{ type: 'user' | 'group' | 'domain' | 'anyone'; emailAddress?: string; domain?: string; role?: string }>;
    accountEmail: string;
    accountIsMember: boolean;
}

export type FolderKey = 'meta' | 'seekers' | `documents/${number}`;

/** 렌더러가 쓰는 드라이브 기능(main 프로세스 IPC, 테스트에서는 가짜 드라이브) */
export interface DriveApi {
    /** 선택한 공유 드라이브 안의 동기화 레코드 목록(한 쪽 최대 1000개) */
    listRecords(pageToken?: string): Promise<{ files: RemoteFile[]; nextPageToken?: string }>;
    getStartPageToken(): Promise<string>;
    listChanges(pageToken: string): Promise<{ changes: DriveChange[]; nextPageToken?: string; newStartPageToken?: string }>;
    getFile(fileId: string): Promise<RemoteFile | null>;
    download(fileId: string): Promise<Uint8Array>;
    /** fileId가 있으면 그 파일을 바꾸고, 없으면 folder에 새로 만든다. */
    upload(input: { fileId?: string; folder: FolderKey; name: string; appProperties: Record<string, string>; content: Uint8Array }): Promise<RemoteFile>;
    setProperties(fileId: string, appProperties: Record<string, string | null>): Promise<void>;
    /** _meta 폴더의 파일(키 확인 표식 등) 찾기·읽기·쓰기 */
    findMeta(name: string): Promise<RemoteFile | null>;
}

/** 이 PC의 동기화 상태 저장소(별도 IndexedDB "jjss-sync") */
export interface RecordSyncState {
    rid: string;
    fileId?: string;
    /** 마지막으로 드라이브와 맞춘 버전 */
    baseVersion: number;
    /** 마지막으로 드라이브와 맞춘 내용 지문 */
    baseHash: string;
    deleted?: boolean;
}

export interface OutboxEntry {
    rid: string;
    queuedAt: string;
}

export interface ConflictEntry {
    rid: string;
    detectedAt: string;
    local: unknown | null;
    remote: unknown | null;
    remoteVersion: number;
    remoteUpdatedBy: string;
    remoteUpdatedAt: string;
    fileId: string;
}

export interface SyncMeta {
    pageToken?: string;
    lastPullAt?: string;
    lastPushAt?: string;
    lastSecurityCheckAt?: string;
}

export interface SyncStateStore {
    getRecord(rid: string): Promise<RecordSyncState | undefined>;
    putRecord(state: RecordSyncState): Promise<void>;
    allRecords(): Promise<RecordSyncState[]>;
    /** 올릴 목록에 넣는다. 이미 있으면 대기 표지(queuedAt)만 새로 찍는다. */
    enqueue(rid: string): Promise<void>;
    /** 목록에서 뺀다. queuedAt을 주면 그 사이에 새로 찍힌 표지가 없을 때만 뺀다. */
    dequeue(rid: string, queuedAt?: string): Promise<void>;
    outbox(): Promise<OutboxEntry[]>;
    isQueued(rid: string): Promise<boolean>;
    putConflict(conflict: ConflictEntry): Promise<void>;
    removeConflict(rid: string): Promise<void>;
    conflicts(): Promise<ConflictEntry[]>;
    getMeta(): Promise<SyncMeta>;
    setMeta(patch: Partial<SyncMeta>): Promise<void>;
    clearAll(): Promise<void>;
}

/** 이 PC의 사례관리 레코드(평문)에 대한 읽기·쓰기 */
export interface LocalAdapter {
    get(store: SyncedStore, id: string): Promise<Record<string, unknown> | undefined>;
    all(store: SyncedStore): Promise<Array<Record<string, unknown> & { id: string }>>;
    /** 복호화하지 못한 필드가 있는 레코드 id(올리지 않는다) */
    unreadableIds(store: SyncedStore): string[];
    putFromSync(store: SyncedStore, record: Record<string, unknown> & { id: string }): Promise<void>;
    deleteFromSync(store: SyncedStore, id: string): Promise<void>;
}
