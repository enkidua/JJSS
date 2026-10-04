/**
 * 검사 타이머. VE Assist `src/domain/timer.ts` 이식.
 * 남은 시간만 저장하고 경과는 호출부가 주는 단조 시계(performance.now())로 계산한다 —
 * 시스템 시각이 바뀌어도 측정이 틀어지지 않는다.
 */
export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXPIRED';

export interface TimerSnapshot {
    status: TimerStatus;
    remainingMs: number;
    /** RUNNING일 때 마지막으로 계산한 시점의 단조 시계값 */
    anchorMs?: number;
}

export function resetTimer(durationMs: number): TimerSnapshot {
    return { status: 'IDLE', remainingMs: durationMs };
}

export function startTimer(timer: TimerSnapshot, monotonicNow: number): TimerSnapshot {
    if (timer.remainingMs <= 0) return { status: 'EXPIRED', remainingMs: 0 };
    if (timer.status === 'RUNNING') return timer;
    return { ...timer, status: 'RUNNING', anchorMs: monotonicNow };
}

export function tickTimer(timer: TimerSnapshot, monotonicNow: number): TimerSnapshot {
    if (timer.status !== 'RUNNING' || timer.anchorMs === undefined) return timer;
    const remainingMs = Math.max(0, timer.remainingMs - Math.max(0, monotonicNow - timer.anchorMs));
    return remainingMs === 0
        ? { status: 'EXPIRED', remainingMs: 0 }
        : { status: 'RUNNING', remainingMs, anchorMs: monotonicNow };
}

export function pauseTimer(timer: TimerSnapshot, monotonicNow: number): TimerSnapshot {
    const ticked = tickTimer(timer, monotonicNow);
    return ticked.status === 'EXPIRED' ? ticked : { status: 'PAUSED', remainingMs: ticked.remainingMs };
}

/** mm:ss */
export function formatTimer(remainingMs: number): string {
    const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

/** 경과 시간(초). 사건 기록에 쓴다. */
export function elapsedSeconds(durationSeconds: number, remainingMs: number): number {
    return Math.max(0, Math.round((durationSeconds * 1000 - remainingMs) / 1000));
}
