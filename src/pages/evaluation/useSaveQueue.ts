/**
 * 저장을 한 줄로 세우는 작은 큐.
 *
 * 왜 필요한가: 수행량을 빠르게 10 → 11 → 12로 고치면 저장 요청 세 개가 동시에 날아가고,
 * 끝나는 순서가 뒤바뀌면 예전 값이 최신 값을 덮을 수 있다.
 * 요청을 앞의 것이 끝난 뒤에 보내 순서를 지키고, 대기 중인 요청은 마지막 것만 남긴다.
 *
 * 함께 쓰는 것: 저장소의 revision 비교(예전 상태 저장 거부)와 `flush()`(화면을 떠나기 전에 강제 저장).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'SAVED' | 'SAVING' | 'ERROR';

export interface SaveQueue<T> {
    saveState: SaveState;
    saveError: string;
    /** 바로 저장한다(앞의 저장이 끝난 뒤 실행). */
    save: (value: T) => void;
    /** 지연 저장. 같은 지연이 이미 걸려 있으면 마지막 값만 남는다. */
    saveDebounced: (value: T, delayMs: number) => void;
    /** 대기 중인 지연 저장을 즉시 실행하고 끝날 때까지 기다린다. */
    flush: () => Promise<void>;
}

export function useSaveQueue<T>(
    persist: (value: T) => Promise<unknown>,
    onError?: (message: string) => void,
): SaveQueue<T> {
    const [saveState, setSaveState] = useState<SaveState>('SAVED');
    const [saveError, setSaveError] = useState('');
    const chainRef = useRef<Promise<void>>(Promise.resolve());
    const pendingRef = useRef<T | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistRef = useRef(persist);
    const errorRef = useRef(onError);
    persistRef.current = persist;
    errorRef.current = onError;

    const enqueue = useCallback((value: T) => {
        setSaveState('SAVING');
        chainRef.current = chainRef.current.then(async () => {
            try {
                await persistRef.current(value);
                setSaveState('SAVED');
                setSaveError('');
            } catch (error) {
                const message = error instanceof Error ? error.message : '저장하지 못했습니다.';
                setSaveState('ERROR');
                setSaveError(message);
                errorRef.current?.(message);
            }
        });
        return chainRef.current;
    }, []);

    const save = useCallback(
        (value: T) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            pendingRef.current = null;
            void enqueue(value);
        },
        [enqueue],
    );

    const saveDebounced = useCallback(
        (value: T, delayMs: number) => {
            pendingRef.current = value;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                const next = pendingRef.current;
                pendingRef.current = null;
                if (next !== null) void enqueue(next);
            }, delayMs);
        },
        [enqueue],
    );

    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next !== null) await enqueue(next);
        await chainRef.current;
    }, [enqueue]);

    // 화면을 떠날 때 대기 중인 저장을 흘려보낸다(타이머만 지우면 마지막 수정이 사라진다).
    useEffect(
        () => () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            const next = pendingRef.current;
            pendingRef.current = null;
            if (next !== null) void enqueue(next);
        },
        [enqueue],
    );

    return { saveState, saveError, save, saveDebounced, flush };
}
