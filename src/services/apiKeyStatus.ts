/**
 * API 키 칸별 "마지막 확인 결과"(확인됨 / 실패 / 미확인). 이 PC에만 보관한다.
 *
 * - 키 자체는 저장하지 않고, 키의 SHA-256 앞 12자(지문)만 둔다. 키가 바뀌면 지문이 달라져 "미확인"으로 돌아간다.
 * - 연결 확인 버튼·저장 직후 자동 확인·실제 AI 요청의 인증 실패가 이 상태를 갱신한다.
 * - 저장소(localStorage)를 쓸 수 없으면 현재 실행 동안만 기억한다.
 */
import { create } from 'zustand';
import type { ApiKeySlot } from '../config/apiKeyFormat';

export type KeyCheckState = 'ok' | 'failed';

export interface KeyStatusRecord {
    state: KeyCheckState;
    /** ISO 시각 */
    checkedAt: string;
    /** 사용자에게 보여 줄 한 줄(성공 메시지 또는 실패 원인) */
    message: string;
    /** 키 지문(SHA-256 앞 12자). 키 원문은 저장하지 않는다. */
    fingerprint: string;
    /** 어디서 확인했는지 */
    source: 'check' | 'auto-check' | 'request';
}

export const API_KEY_STATUS_STORAGE_KEY = 'jjss:api-key-status:v1';

type StatusMap = Partial<Record<ApiKeySlot, KeyStatusRecord>>;

function readStored(): StatusMap {
    try {
        const raw = localStorage.getItem(API_KEY_STATUS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as StatusMap;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeStored(map: StatusMap): void {
    try {
        localStorage.setItem(API_KEY_STATUS_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // 저장하지 못해도 현재 실행 중에는 상태를 보여 준다.
    }
}

interface ApiKeyStatusState {
    statuses: StatusMap;
    record: (slot: ApiKeySlot, record: KeyStatusRecord) => void;
    clear: (slot: ApiKeySlot) => void;
}

export const useApiKeyStatusStore = create<ApiKeyStatusState>((set, get) => ({
    statuses: typeof localStorage === 'undefined' ? {} : readStored(),
    record: (slot, record) => {
        const next = { ...get().statuses, [slot]: record };
        writeStored(next);
        set({ statuses: next });
    },
    clear: slot => {
        const next = { ...get().statuses };
        delete next[slot];
        writeStored(next);
        set({ statuses: next });
    },
}));

/** 키의 지문(SHA-256 앞 12자). 같은 키인지 비교하는 데만 쓴다. */
export async function fingerprintApiKey(key: string): Promise<string> {
    const value = String(key ?? '').trim();
    if (!value) return '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest).slice(0, 6)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 이 키에 대한 확인 결과를 기록한다(키 원문은 저장하지 않음). */
export async function recordApiKeyStatus(
    slot: ApiKeySlot,
    key: string,
    state: KeyCheckState,
    message: string,
    source: KeyStatusRecord['source'],
): Promise<void> {
    const fingerprint = await fingerprintApiKey(key);
    if (!fingerprint) return;
    useApiKeyStatusStore.getState().record(slot, { state, checkedAt: new Date().toISOString(), message, fingerprint, source });
}

/** 지금 키에 해당하는 기록만 돌려준다(키가 바뀌었으면 null = 미확인). */
export function statusForKey(statuses: StatusMap, slot: ApiKeySlot, fingerprint: string): KeyStatusRecord | null {
    const record = statuses[slot];
    if (!record || !fingerprint || record.fingerprint !== fingerprint) return null;
    return record;
}
