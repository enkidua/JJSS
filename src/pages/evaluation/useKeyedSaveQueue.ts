/**
 * 여러 기록(분석지·결과지·관찰 세션 등)을 각자 따로 한 줄로 세워 저장하는 큐.
 *
 * 왜 필요한가: 문장 칸에 글자를 칠 때마다 "읽기 → 암호화 → 쓰기"가 겹쳐 실행되면, 끝나는 순서가 뒤바뀌어
 * 예전 글자가 최신 글자를 덮을 수 있다. 또 이 저장이 실패하거나 진행 중이어도 메뉴 이동·창 닫기 보호가
 * 몰랐다. 기록(key)마다 앞의 저장이 끝난 뒤 다음을 보내고, 대기 중이면 마지막 값만 남긴다.
 * 진행 중·실패 상태는 페이지 저장 추적(useEvaluationSaveTracker)에 알린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEvaluationSaveTracker } from './EvaluationSaveStatus';

interface KeyState<T> {
    chain: Promise<void>;
    pending: T | null;
    timer: ReturnType<typeof setTimeout> | null;
    request: number;
    failed: T | null;
}

export interface KeyedSaveQueue<T> {
    /** 저장 중이거나 실패한 기록이 있는지 */
    busy: boolean;
    /** 바로 저장(같은 기록의 앞 저장이 끝난 뒤 실행). 끝나면 성공 여부 */
    save: (key: string, value: T) => Promise<boolean>;
    /** 지연 저장. 같은 기록에 지연이 걸려 있으면 마지막 값만 남는다 */
    saveDebounced: (key: string, value: T, delayMs: number) => void;
}

export function useKeyedSaveQueue<T>(
    persist: (value: T) => Promise<unknown>,
    onError?: (message: string) => void,
): KeyedSaveQueue<T> {
    const statesRef = useRef(new Map<string, KeyState<T>>());
    const persistRef = useRef(persist);
    const errorRef = useRef(onError);
    persistRef.current = persist;
    errorRef.current = onError;
    const [activeKeys, setActiveKeys] = useState<ReadonlySet<string>>(() => new Set());
    useEvaluationSaveTracker(activeKeys.size > 0);

    const mark = useCallback((key: string, active: boolean) => {
        setActiveKeys(current => {
            if (current.has(key) === active) return current;
            const next = new Set(current);
            if (active) next.add(key);
            else next.delete(key);
            return next;
        });
    }, []);

    const stateFor = useCallback((key: string): KeyState<T> => {
        let state = statesRef.current.get(key);
        if (!state) {
            state = { chain: Promise.resolve(), pending: null, timer: null, request: 0, failed: null };
            statesRef.current.set(key, state);
        }
        return state;
    }, []);

    const enqueue = useCallback(
        (key: string, value: T): Promise<boolean> => {
            const state = stateFor(key);
            const request = ++state.request;
            mark(key, true);
            let succeeded = false;
            const run = state.chain.then(async () => {
                try {
                    await persistRef.current(value);
                    succeeded = true;
                    if (request === state.request && state.pending === null) {
                        state.failed = null;
                        mark(key, false);
                    }
                } catch (error) {
                    if (request === state.request) {
                        state.failed = value;
                        try {
                            errorRef.current?.(error instanceof Error ? error.message : '저장하지 못했습니다.');
                        } catch {
                            // 알림 오류가 저장 큐를 끊지 않게 한다(실패 상태는 유지).
                        }
                    }
                }
            });
            state.chain = run;
            return run.then(() => succeeded);
        },
        [mark, stateFor],
    );

    const save = useCallback(
        (key: string, value: T) => {
            const state = stateFor(key);
            if (state.timer) {
                clearTimeout(state.timer);
                state.timer = null;
            }
            state.pending = null;
            return enqueue(key, value);
        },
        [enqueue, stateFor],
    );

    const saveDebounced = useCallback(
        (key: string, value: T, delayMs: number) => {
            const state = stateFor(key);
            state.request += 1;
            state.pending = value;
            mark(key, true);
            if (state.timer) clearTimeout(state.timer);
            state.timer = setTimeout(() => {
                state.timer = null;
                const next = state.pending;
                state.pending = null;
                if (next !== null) void enqueue(key, next);
            }, delayMs);
        },
        [enqueue, mark, stateFor],
    );

    // 화면을 떠날 때 대기 중인 지연 저장을 흘려보낸다(타이머만 지우면 마지막 입력이 사라진다).
    useEffect(
        () => () => {
            for (const [key, state] of statesRef.current) {
                if (state.timer) {
                    clearTimeout(state.timer);
                    state.timer = null;
                }
                const next = state.pending;
                state.pending = null;
                if (next !== null) void enqueue(key, next);
            }
        },
        [enqueue],
    );

    return useMemo(() => ({ busy: activeKeys.size > 0, save, saveDebounced }), [activeKeys, save, saveDebounced]);
}
