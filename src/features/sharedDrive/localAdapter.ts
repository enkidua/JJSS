/**
 * 동기화 엔진이 이 PC 저장소(IndexedDB "jjss")를 읽고 쓰는 통로. 필드 암호화·복원 봉인 등 기존 규칙을 그대로 따른다.
 * 동기화로 받은 쓰기는 origin 'sync'로 알려, 받은 것을 다시 올리지 않는다.
 */
import { decryptWithStatus, encrypt } from '../../config/crypto';
import { deleteFromSync, getAll, getById, listUnreadableRecordIds, putFromSync } from '../../config/localDB';
import type { LocalAdapter, SyncedStore } from './types';

export const localDbAdapter: LocalAdapter = {
    get: (store: SyncedStore, id: string) => getById<Record<string, unknown>>(store, id),
    all: (store: SyncedStore) => getAll<Record<string, unknown> & { id: string }>(store),
    unreadableIds: (store: SyncedStore) => listUnreadableRecordIds(store),
    putFromSync: (store, record) => putFromSync(store, record),
    deleteFromSync: (store, id) => deleteFromSync(store, id),
};

/** 충돌 사본(개인정보가 든 레코드 내용)을 이 PC의 데이터 키로 암호화해 jjss-sync에 둔다. */
export const conflictCodec = {
    async encode(value: unknown): Promise<string> {
        return encrypt(JSON.stringify(value ?? null));
    },
    async decode(value: string): Promise<unknown> {
        const result = await decryptWithStatus(String(value || ''));
        if (!result.ok) throw new Error('충돌 사본을 이 PC의 데이터 키로 열지 못했습니다.');
        return JSON.parse(result.value || 'null');
    },
};
