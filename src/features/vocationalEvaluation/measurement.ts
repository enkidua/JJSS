/**
 * 손기능(시행)과 다차원(측정)을 한 가지 타이머 대상으로 다루는 얇은 층.
 * VE Assist `src/domain/measurement.ts` 이식.
 */
import { currentTrial } from './session';
import type { TestSession, TimerCheckpoint, Trial } from './model/types';

export type Measurement = Pick<Trial, 'id' | 'status' | 'remainingMs' | 'durationSeconds'>;

export function currentMeasurement(session: TestSession): Measurement {
    return session.bimanual?.attempt ?? currentTrial(session);
}

export function snapshotMeasurement(session: TestSession, remainingMs: number): TestSession {
    const rounded = Math.max(0, Math.round(remainingMs));
    if (session.bimanual) {
        return {
            ...session,
            bimanual: {
                ...session.bimanual,
                attempt: { ...session.bimanual.attempt, remainingMs: rounded },
            },
        };
    }
    return {
        ...session,
        trials: session.trials.map(trial =>
            trial.id === session.currentTrialId ? { ...trial, remainingMs: rounded } : trial,
        ),
    };
}

/**
 * 5초마다 저장한 남은 시간을 되살린다.
 * 체크포인트가 저장된 세션보다 오래됐거나, 대상이 다르거나, 남은 시간이 더 많으면 무시한다
 * — 복구로 시간이 늘어나는 일이 없어야 한다.
 *
 * 같은 시각(`updatedAt` 동일)은 받아들인다. JJSS는 체크포인트를 세션 문서 안에 함께 저장하므로
 * 두 시각이 같아질 수 있고, "남은 시간이 더 많으면 무시" 규칙이 이미 시간을 늘리지 못하게 막는다.
 */
export function applyTimerCheckpoint(session: TestSession, checkpoint?: TimerCheckpoint): TestSession {
    const measurement = currentMeasurement(session);
    if (
        !checkpoint ||
        checkpoint.sessionId !== session.id ||
        checkpoint.updatedAt < session.updatedAt ||
        checkpoint.trialId !== measurement.id ||
        measurement.status !== 'RUNNING' ||
        checkpoint.remainingMs > measurement.remainingMs ||
        checkpoint.remainingMs < 0
    ) {
        return session;
    }
    return { ...snapshotMeasurement(session, checkpoint.remainingMs), updatedAt: checkpoint.updatedAt };
}
