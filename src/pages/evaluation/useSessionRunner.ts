/**
 * 검사 실시 화면의 상태·타이머·저장을 한곳에서 다룬다.
 * 타이머는 performance.now() 기준으로만 계산하고(시스템 시각 변경에 영향받지 않음),
 * 남은 시간은 5초마다 체크포인트로 저장해 앱이 꺼져도 마지막 지점에서 이어 갈 수 있게 한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    applyTimerCheckpoint,
    changeBimanualState,
    changeTrialState,
    confirmCurrentTrial,
    confirmSession,
    currentMeasurement,
    goToTrial,
    pauseSession,
    recordEvent,
    recoverSession,
    reopenSession,
    restartBimanual,
    restartTrial,
    resumeSession,
    setComponentCount,
    setScore,
    setTrialMemo,
    skipTrial,
    snapshotMeasurement,
    undoLatestEvent,
    upsertObservation,
    upsertCondition,
    type ComponentKey,
    type EvaluationEventType,
    type Observation,
    type SessionCondition,
    type SessionPauseReason,
    type TestSession,
} from '../../features/vocationalEvaluation';
import { createId } from '../../features/vocationalEvaluation/ids';
import { saveSession } from '../../features/vocationalEvaluation/storage';
import { useSaveQueue, type SaveState } from './useSaveQueue';

export type { SaveState } from './useSaveQueue';

const CHECKPOINT_INTERVAL_MS = 5_000;
const TICK_MS = 100;
const MEMO_DEBOUNCE_MS = 650;

interface Anchor {
    /** performance.now() 시점 */
    at: number;
    /** 그 시점에 남아 있던 시간 */
    remainingMs: number;
}

export interface SessionRunner {
    session: TestSession;
    /** 화면에 그리는 남은 시간. 측정 중에는 세션 값보다 최신이다. */
    remainingMs: number;
    saveState: SaveState;
    saveError: string;
    /** 화면을 떠나기 전에 대기 중인 저장을 끝낸다 */
    flushSave: () => Promise<void>;
    start(): void;
    pause(): void;
    finish(): void;
    interrupt(): void;
    restartMeasurement(): void;
    updateScore(value: number | undefined, trialId?: string): void;
    adjustScore(delta: number): void;
    confirmTrial(): void;
    selectTrial(trialId: string): void;
    skip(reason: string, trialId?: string): void;
    updateMemo(value: string, trialId?: string): void;
    updateSessionNote(value: string): void;
    addEvent(type: EvaluationEventType, memo?: string): void;
    undoEvent(): void;
    setComponent(key: ComponentKey, value: number | undefined): void;
    saveObservation(observation: Observation): void;
    saveCondition(condition: SessionCondition): void;
    pauseWholeSession(reason?: SessionPauseReason): void;
    resume(): void;
    confirmWholeSession(confirmedBy: string): void;
    reopen(): void;
    lastError: string;
    clearError(): void;
}

export function useSessionRunner(initial: TestSession, onSaved?: (session: TestSession) => void): SessionRunner {
    const [session, setSession] = useState<TestSession>(() => recoverSession(applyTimerCheckpoint(initial, initial.timerCheckpoint), new Date().toISOString()));
    const [remainingMs, setRemainingMs] = useState(() => currentMeasurement(session).remainingMs);
    const [lastError, setLastError] = useState('');

    const anchorRef = useRef<Anchor | null>(null);
    const sessionRef = useRef(session);
    const checkpointRef = useRef(0);
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    sessionRef.current = session;

    // 저장은 큐로 한 줄로 세운다 — 빠른 입력이 엇갈려 예전 값이 최신을 덮지 않게.
    const queue = useSaveQueue<TestSession>(async next => {
        const saved = await saveSession(next);
        onSavedRef.current?.(saved);
    });
    const persist = queue.save;

    /**
     * 상태를 바꾸고 저장한다. 도메인 규칙 위반은 화면에 문구로 알린다.
     * setState updater 안에서 계산하지 않고 ref의 현재 값으로 계산한다 —
     * updater는 렌더 시점에 실행되므로 그 안에서 저장까지 이어 갈 수 없다.
     */
    const apply = useCallback(
        (mutate: (current: TestSession) => TestSession, options?: { save?: boolean }) => {
            let next: TestSession;
            try {
                next = mutate(sessionRef.current);
            } catch (error) {
                setLastError(error instanceof Error ? error.message : '처리하지 못했습니다.');
                return null;
            }
            sessionRef.current = next;
            setSession(next);
            setLastError('');
            if (options?.save !== false) persist(next);
            return next;
        },
        [persist],
    );

    const clearError = useCallback(() => setLastError(''), []);

    /* ── 타이머 ─────────────────────────────────────────────── */

    const stopAnchor = useCallback(() => {
        const anchor = anchorRef.current;
        anchorRef.current = null;
        if (!anchor) return currentMeasurement(sessionRef.current).remainingMs;
        return Math.max(0, anchor.remainingMs - (performance.now() - anchor.at));
    }, []);

    const measurement = currentMeasurement(session);
    const running = measurement.status === 'RUNNING';

    useEffect(() => {
        if (!running) {
            anchorRef.current = null;
            setRemainingMs(measurement.remainingMs);
            return;
        }
        if (!anchorRef.current) {
            anchorRef.current = { at: performance.now(), remainingMs: measurement.remainingMs };
            checkpointRef.current = performance.now();
        }
        const timer = setInterval(() => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const left = Math.max(0, anchor.remainingMs - (performance.now() - anchor.at));
            setRemainingMs(left);
            if (left <= 0) {
                anchorRef.current = null;
                apply(current =>
                    current.bimanual
                        ? changeBimanualState(current, 'FINISHED', new Date().toISOString(), 0)
                        : changeTrialState(current, 'FINISHED', new Date().toISOString(), 0),
                );
                return;
            }
            if (performance.now() - checkpointRef.current >= CHECKPOINT_INTERVAL_MS) {
                checkpointRef.current = performance.now();
                const at = new Date().toISOString();
                apply(current => ({
                    ...snapshotMeasurement(current, left),
                    timerCheckpoint: {
                        sessionId: current.id,
                        trialId: currentMeasurement(current).id,
                        remainingMs: Math.round(left),
                        updatedAt: at,
                    },
                }));
            }
        }, TICK_MS);
        return () => clearInterval(timer);
    }, [running, measurement.id, measurement.remainingMs, apply, persist]);

    /** 화면을 떠나면 자동으로 일시정지한다(요강 절차를 벗어난 측정을 남기지 않기 위해). */
    useEffect(() => {
        const handleHidden = () => {
            if (document.visibilityState !== 'hidden') return;
            if (currentMeasurement(sessionRef.current).status !== 'RUNNING') return;
            const left = stopAnchor();
            apply(current =>
                current.bimanual
                    ? changeBimanualState(current, 'PAUSED', new Date().toISOString(), left)
                    : changeTrialState(current, 'PAUSED', new Date().toISOString(), left),
            );
        };
        document.addEventListener('visibilitychange', handleHidden);
        return () => document.removeEventListener('visibilitychange', handleHidden);
    }, [apply, stopAnchor]);

    /**
     * 화면을 닫을 때 측정 중이면 일시정지로 저장한다.
     * 그냥 두면 다음에 열 때 "예기치 않게 종료"로 복구되어 시행을 다시 해야 한다.
     */
    useEffect(
        () => () => {
            const current = sessionRef.current;
            if (currentMeasurement(current).status !== 'RUNNING') return;
            const left = stopAnchor();
            const at = new Date().toISOString();
            try {
                const paused = current.bimanual
                    ? changeBimanualState(current, 'PAUSED', at, left)
                    : changeTrialState(current, 'PAUSED', at, left);
                queue.save(paused);
            } catch {
                // 전환이 거부되면 복구 절차(중단 처리)에 맡긴다.
            }
        },
        [stopAnchor, queue],
    );

    /* ── 동작 ───────────────────────────────────────────────── */

    const now = () => new Date().toISOString();

    const start = useCallback(() => {
        const next = apply(current => {
            const left = currentMeasurement(current).remainingMs;
            return current.bimanual
                ? changeBimanualState(current, 'RUNNING', now(), left)
                : changeTrialState(current, 'RUNNING', now(), left);
        });
        // 전환이 거부되면(예: 일시정지 상태) 기준점을 남기지 않는다.
        if (!next) return;
        anchorRef.current = { at: performance.now(), remainingMs: currentMeasurement(next).remainingMs };
        checkpointRef.current = performance.now();
    }, [apply]);

    const pause = useCallback(() => {
        const left = stopAnchor();
        apply(current =>
            current.bimanual
                ? changeBimanualState(current, 'PAUSED', now(), left)
                : changeTrialState(current, 'PAUSED', now(), left),
        );
    }, [apply, stopAnchor]);

    const finish = useCallback(() => {
        const left = stopAnchor();
        apply(current =>
            current.bimanual
                ? changeBimanualState(current, 'FINISHED', now(), left)
                : changeTrialState(current, 'FINISHED', now(), left),
        );
    }, [apply, stopAnchor]);

    const interrupt = useCallback(() => {
        const left = stopAnchor();
        apply(current =>
            current.bimanual
                ? changeBimanualState(current, 'INTERRUPTED', now(), left)
                : changeTrialState(current, 'INTERRUPTED', now(), left),
        );
    }, [apply, stopAnchor]);

    const restartMeasurement = useCallback(() => {
        anchorRef.current = null;
        apply(current => (current.bimanual ? restartBimanual(current, createId('veattempt'), now()) : restartTrial(current, now())));
    }, [apply]);

    const updateScore = useCallback(
        (value: number | undefined, trialId?: string) => {
            apply(current => setScore(current, value, now(), trialId ?? current.currentTrialId));
        },
        [apply],
    );

    const adjustScore = useCallback(
        (delta: number) => {
            apply(current => {
                const trial = current.trials.find(item => item.id === current.currentTrialId);
                const next = Math.max(0, (trial?.score ?? 0) + delta);
                return setScore(current, next, now());
            });
        },
        [apply],
    );

    const confirmTrial = useCallback(() => {
        anchorRef.current = null;
        apply(current => confirmCurrentTrial(current, now()));
    }, [apply]);

    const selectTrial = useCallback(
        (trialId: string) => {
            anchorRef.current = null;
            apply(current => goToTrial(current, trialId, now()));
        },
        [apply],
    );

    const skip = useCallback(
        (reason: string, trialId?: string) => {
            apply(current => skipTrial(current, reason, now(), trialId ?? current.currentTrialId));
        },
        [apply],
    );

    const updateMemo = useCallback(
        (value: string, trialId?: string) => {
            const next = apply(current => setTrialMemo(current, value, now(), trialId ?? current.currentTrialId), { save: false });
            if (!next) return;
            queue.saveDebounced(next, MEMO_DEBOUNCE_MS);
        },
        [apply, queue],
    );

    const updateSessionNote = useCallback(
        (value: string) => {
            const next = apply(
                current => ({ ...current, sessionNote: value, updatedAt: now(), revision: current.revision + 1 }),
                { save: false },
            );
            if (next) queue.saveDebounced(next, MEMO_DEBOUNCE_MS);
        },
        [apply, queue],
    );

    const addEvent = useCallback(
        (type: EvaluationEventType, memo?: string) => {
            apply(current => {
                const target = currentMeasurement(current);
                const anchor = anchorRef.current;
                // 측정 중이면 기준점에서 계산하고, 멈춰 있으면 저장된 남은 시간을 쓴다.
                const left = anchor ? Math.max(0, anchor.remainingMs - (performance.now() - anchor.at)) : target.remainingMs;
                const elapsed = Math.max(0, Math.round((target.durationSeconds * 1000 - left) / 1000));
                return recordEvent(current, type, now(), elapsed, memo);
            });
        },
        [apply],
    );

    const undoEvent = useCallback(() => {
        apply(current => undoLatestEvent(current, now()));
    }, [apply]);

    const setComponent = useCallback(
        (key: ComponentKey, value: number | undefined) => {
            apply(current => setComponentCount(current, key, value));
        },
        [apply],
    );

    const saveObservation = useCallback(
        (observation: Observation) => {
            apply(current => upsertObservation(current, observation, now()));
        },
        [apply],
    );

    const saveCondition = useCallback(
        (condition: SessionCondition) => {
            apply(current => upsertCondition(current, condition, now()));
        },
        [apply],
    );

    const pauseWholeSession = useCallback(
        (reason?: SessionPauseReason) => {
            stopAnchor();
            apply(current => pauseSession(current, now(), reason));
        },
        [apply, stopAnchor],
    );

    const resume = useCallback(() => {
        apply(current => resumeSession(current, now()));
    }, [apply]);

    const confirmWholeSession = useCallback(
        (confirmedBy: string) => {
            apply(current => confirmSession(current, now(), confirmedBy));
        },
        [apply],
    );

    const reopen = useCallback(() => {
        apply(current => reopenSession(current, now()));
    }, [apply]);

    return {
        session,
        remainingMs: running ? remainingMs : measurement.remainingMs,
        saveState: queue.saveState,
        saveError: queue.saveError,
        flushSave: queue.flush,
        start,
        pause,
        finish,
        interrupt,
        restartMeasurement,
        updateScore,
        adjustScore,
        confirmTrial,
        selectTrial,
        skip,
        updateMemo,
        updateSessionNote,
        addEvent,
        undoEvent,
        setComponent,
        saveObservation,
        saveCondition,
        pauseWholeSession,
        resume,
        confirmWholeSession,
        reopen,
        lastError,
        clearError,
    };
}
