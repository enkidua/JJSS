/**
 * 검사 세션 상태기계. VE Assist `src/domain/session.ts` 이식 + JJSS 추가분.
 * 추가한 것: 2·3차 미실시(SKIPPED), 재설명 2회 한정·중단 3회 실패(요강 p.41~42), 조건별 평균 산출.
 */
import { createBimanualState, validateBimanual } from './bimanual';
import { createId } from './ids';
import { getTestPlugin } from './tests/registry';
import { conditionKey, conditionLabel } from './tests/keadHandFunction';
import { HAND_FUNCTION_MAX_SCORE } from './sourceDocument/valueLimits';
import type {
    HandMode,
    Observation,
    PinSize,
    SessionCondition,
    SessionPauseReason,
    TestSession,
    Trial,
    TrialStatus,
    ValidationIssue,
} from './model/types';

/** 요강 p.41~42 */
export const MAX_REINSTRUCTIONS = 2;
export const MAX_INTERRUPTIONS = 3;

export function currentTrial(session: TestSession): Trial {
    const trial = session.trials.find(item => item.id === session.currentTrialId);
    if (!trial) throw new Error('현재 검사 위치를 찾을 수 없습니다.');
    return trial;
}

const transitions: Record<TrialStatus, readonly TrialStatus[]> = {
    PENDING: ['READY', 'SKIPPED'],
    READY: ['RUNNING', 'SKIPPED'],
    RUNNING: ['PAUSED', 'FINISHED', 'INTERRUPTED'],
    PAUSED: ['RUNNING', 'FINISHED', 'INTERRUPTED', 'READY'],
    INTERRUPTED: ['READY'],
    FINISHED: ['CONFIRMED', 'READY'],
    CONFIRMED: [],
    SKIPPED: ['READY'],
};

export function transitionTrial(
    trial: Trial,
    status: TrialStatus,
    now: string,
    remainingMs = trial.remainingMs,
): Trial {
    if (!transitions[trial.status].includes(status)) {
        throw new Error(`허용되지 않은 상태 전환: ${trial.status} → ${status}`);
    }
    if (status === 'CONFIRMED' && trial.score === undefined) {
        throw new Error('수행량을 입력하세요. 0도 직접 확인해야 합니다.');
    }
    return {
        ...trial,
        status,
        remainingMs: Math.max(0, Math.round(remainingMs)),
        updatedAt: now,
        startedAt: status === 'RUNNING' ? (trial.startedAt ?? now) : trial.startedAt,
        runningStartedAt: status === 'RUNNING' ? now : undefined,
        endedAt: status === 'FINISHED' ? now : trial.endedAt,
        interruptedAt: status === 'INTERRUPTED' ? now : trial.interruptedAt,
        confirmedAt: status === 'CONFIRMED' ? now : trial.confirmedAt,
    };
}

export function updateTrial(session: TestSession, trial: Trial, now: string): TestSession {
    return {
        ...session,
        trials: session.trials.map(item => (item.id === trial.id ? trial : item)),
        updatedAt: now,
        revision: session.revision + 1,
    };
}

export function changeTrialState(
    session: TestSession,
    status: TrialStatus,
    now: string,
    remainingMs?: number,
): TestSession {
    if (session.status !== 'IN_PROGRESS') throw new Error('평가를 재개한 후 조작하세요.');
    const next = updateTrial(session, transitionTrial(currentTrial(session), status, now, remainingMs), now);
    if (status !== 'INTERRUPTED') return next;
    const interruptionCount = next.interruptionCount + 1;
    return {
        ...next,
        interruptionCount,
        failedAt: interruptionCount >= MAX_INTERRUPTIONS ? (next.failedAt ?? now) : next.failedAt,
    };
}

export function setScore(
    session: TestSession,
    score: number | undefined,
    now: string,
    trialId = session.currentTrialId,
): TestSession {
    if (session.status === 'COMPLETED') throw new Error('기록 수정 재개 후 변경하세요.');
    if (score !== undefined && (!Number.isSafeInteger(score) || score < 0 || score > HAND_FUNCTION_MAX_SCORE)) {
        throw new Error(`수행량은 0~${HAND_FUNCTION_MAX_SCORE} 정수여야 합니다(핀 ${HAND_FUNCTION_MAX_SCORE}개).`);
    }
    const trial = session.trials.find(item => item.id === trialId);
    if (!trial) throw new Error('검사를 찾을 수 없습니다.');
    if (trial.status === 'PENDING') throw new Error('아직 실시하지 않은 검사의 수행량은 입력할 수 없습니다.');
    if (trial.status === 'SKIPPED') throw new Error('미실시로 표시한 검사의 수행량은 입력할 수 없습니다.');
    return updateTrial(session, { ...trial, score, updatedAt: now }, now);
}

export function changeScore(session: TestSession, delta: number, now: string): TestSession {
    const next = Math.min(HAND_FUNCTION_MAX_SCORE, Math.max(0, (currentTrial(session).score ?? 0) + delta));
    return setScore(session, next, now);
}

export function setTrialMemo(session: TestSession, memo: string, now: string, trialId = session.currentTrialId): TestSession {
    const trial = session.trials.find(item => item.id === trialId);
    if (!trial) throw new Error('검사를 찾을 수 없습니다.');
    return updateTrial(session, { ...trial, memo, updatedAt: now }, now);
}

/**
 * 2·3차 미실시. 요강에는 생략 규정이 없으므로 사유를 반드시 남긴다.
 * 1차는 건너뛸 수 없다 — 조건 자체가 실시되지 않은 것이 되기 때문이다.
 */
export function skipTrial(session: TestSession, reason: string, now: string, trialId = session.currentTrialId): TestSession {
    if (session.status !== 'IN_PROGRESS') throw new Error('평가를 재개한 후 조작하세요.');
    if (!reason.trim()) throw new Error('미실시 사유를 입력하세요.');
    const trial = session.trials.find(item => item.id === trialId);
    if (!trial) throw new Error('검사를 찾을 수 없습니다.');
    if (trial.trialNumber === 1) throw new Error('1차는 미실시로 둘 수 없습니다. 조건을 실시한 뒤 기록하세요.');
    const skipped = transitionTrial({ ...trial, score: undefined }, 'SKIPPED', now);
    const next = updateTrial(session, { ...skipped, skipReason: reason.trim() }, now);
    return advanceToNextPending(next, now);
}

export function confirmCurrentTrial(session: TestSession, now: string): TestSession {
    if (session.status !== 'IN_PROGRESS') throw new Error('진행 중인 평가가 아닙니다.');
    const trial = transitionTrial(currentTrial(session), 'CONFIRMED', now);
    return advanceToNextPending(updateTrial(session, trial, now), now);
}

/** 아직 끝나지 않은 다음 시행으로 이동한다. 없으면 그대로 둔다. */
function advanceToNextPending(session: TestSession, now: string): TestSession {
    const pending = session.trials.find(item => item.status !== 'CONFIRMED' && item.status !== 'SKIPPED');
    if (!pending) return session;
    const next = pending.status === 'PENDING' ? updateTrial(session, transitionTrial(pending, 'READY', now), now) : session;
    return { ...next, currentTrialId: pending.id };
}

export function goToTrial(session: TestSession, trialId: string, now: string): TestSession {
    const trial = session.trials.find(item => item.id === trialId);
    if (!trial) throw new Error('검사를 찾을 수 없습니다.');
    if (trial.status === 'PENDING') {
        return { ...updateTrial(session, transitionTrial(trial, 'READY', now), now), currentTrialId: trialId };
    }
    return { ...session, currentTrialId: trialId };
}

export function restartTrial(session: TestSession, now: string): TestSession {
    const trial = currentTrial(session);
    const reset = transitionTrial(trial, 'READY', now, trial.durationSeconds * 1000);
    return {
        ...updateTrial(
            session,
            {
                ...reset,
                score: undefined,
                skipReason: undefined,
                startedAt: undefined,
                endedAt: undefined,
                interruptionReviewedAt: now,
            },
            now,
        ),
        status: 'IN_PROGRESS',
        pausedAt: undefined,
        pauseReason: undefined,
        events: session.events.map(event =>
            event.trialId === trial.id && !event.excludedAt
                ? { ...event, excludedAt: now, excludedReason: 'TRIAL_RESTARTED' as const }
                : event,
        ),
        recoveryReason: undefined,
    };
}

/** 앱이 비정상 종료된 뒤 다시 열었을 때 진행 중이던 측정을 중단 상태로 되돌린다. */
export function recoverSession(session: TestSession, now: string): TestSession {
    if (session.bimanual) {
        const attempt = session.bimanual.attempt;
        if (attempt.status !== 'RUNNING') return session;
        const recordedDurationMs = attempt.durationSeconds * 1000 - attempt.remainingMs;
        return {
            ...session,
            status: 'PAUSED',
            recoveryReason: 'CRASH',
            pausedAt: now,
            updatedAt: now,
            revision: session.revision + 1,
            bimanual: {
                ...session.bimanual,
                attempt: {
                    ...attempt,
                    status: 'INTERRUPTED',
                    endedAt: now,
                    result: { ...attempt.result, recordedDurationMs, endReason: 'INTERRUPTED' },
                },
            },
        };
    }
    const running = session.trials.filter(trial => trial.status === 'RUNNING');
    if (!running.length) return session;
    return {
        ...session,
        status: 'PAUSED',
        recoveryReason: 'CRASH',
        pausedAt: now,
        updatedAt: now,
        revision: session.revision + 1,
        trials: session.trials.map(trial =>
            trial.status === 'RUNNING' ? transitionTrial(trial, 'INTERRUPTED', now) : trial,
        ),
    };
}

export function pauseSession(session: TestSession, now: string, reason?: SessionPauseReason): TestSession {
    if (session.bimanual) {
        const attempt = session.bimanual.attempt;
        const isActive = ['RUNNING', 'PAUSED'].includes(attempt.status);
        return {
            ...session,
            status: 'PAUSED',
            pausedAt: now,
            pauseReason: reason,
            recoveryReason: 'SESSION_PAUSE',
            updatedAt: now,
            revision: session.revision + 1,
            bimanual: {
                ...session.bimanual,
                attempt: isActive
                    ? {
                          ...attempt,
                          status: 'INTERRUPTED',
                          endedAt: now,
                          result: {
                              ...attempt.result,
                              recordedDurationMs: attempt.durationSeconds * 1000 - attempt.remainingMs,
                              endReason: 'INTERRUPTED',
                          },
                      }
                    : attempt,
            },
        };
    }
    const trial = currentTrial(session);
    const next = ['RUNNING', 'PAUSED'].includes(trial.status)
        ? updateTrial(session, transitionTrial(trial, 'INTERRUPTED', now), now)
        : session;
    return {
        ...next,
        status: 'PAUSED',
        pausedAt: now,
        pauseReason: reason,
        recoveryReason: 'SESSION_PAUSE',
        updatedAt: now,
        revision: next.revision + 1,
    };
}

export function resumeSession(session: TestSession, now: string): TestSession {
    return {
        ...session,
        status: 'IN_PROGRESS',
        pausedAt: undefined,
        pauseReason: undefined,
        recoveryReason: undefined,
        updatedAt: now,
        revision: session.revision + 1,
    };
}

export function upsertObservation(session: TestSession, observation: Observation, now: string): TestSession {
    const observations = session.observations.filter(
        item => !(item.definitionId === observation.definitionId && item.trialId === observation.trialId),
    );
    return {
        ...session,
        observations: [...observations, observation],
        updatedAt: now,
        revision: session.revision + 1,
    };
}

export function upsertCondition(session: TestSession, condition: SessionCondition, now: string): TestSession {
    const conditions = session.conditions.filter(item => item.conditionType !== condition.conditionType);
    return {
        ...session,
        conditions: [...conditions, condition],
        updatedAt: now,
        revision: session.revision + 1,
    };
}

/* ── 조건별 결과 ─────────────────────────────────────────────────── */

export interface ConditionSummary {
    key: string;
    size: PinSize;
    handMode: HandMode;
    label: string;
    /** 시행 순서대로. 미실시는 null */
    scores: Array<number | null>;
    /** 실시한 회차의 평균. 실시 회차가 없으면 null */
    average: number | null;
    /** 평균을 낸 회차 수. 보고서에 "n회 실시 평균"으로 표기한다 */
    executedCount: number;
    skipped: boolean;
}

/** 요강 부록1 — 조건 점수는 실시한 회차의 평균이다. */
export function conditionSummaries(session: TestSession): ConditionSummary[] {
    const groups = new Map<string, Trial[]>();
    for (const trial of session.trials) {
        const key = conditionKey(trial.size, trial.handMode);
        groups.set(key, [...(groups.get(key) ?? []), trial]);
    }
    return [...groups.entries()].map(([key, trials]) => {
        const ordered = [...trials].sort((a, b) => a.trialNumber - b.trialNumber);
        const scores = ordered.map(trial => (trial.status === 'SKIPPED' ? null : (trial.score ?? null)));
        const executed = scores.filter((score): score is number => score !== null);
        const average = executed.length
            ? Math.round((executed.reduce((sum, score) => sum + score, 0) / executed.length) * 10) / 10
            : null;
        return {
            key,
            size: ordered[0].size,
            handMode: ordered[0].handMode,
            label: conditionLabel(ordered[0].size, ordered[0].handMode),
            scores,
            average,
            executedCount: executed.length,
            skipped: ordered.some(trial => trial.status === 'SKIPPED'),
        };
    });
}

/* ── 검증·확정 ─────────────────────────────────────────────────── */

export function validateSession(session: TestSession, saveFailed = false): ValidationIssue[] {
    const issues: ValidationIssue[] = session.bimanual ? validateBimanual(session) : [];
    for (const trial of session.trials) {
        if (trial.status === 'SKIPPED') continue;
        if (trial.status === 'INTERRUPTED') {
            issues.push({
                id: `${trial.id}.interrupted`,
                trialId: trial.id,
                type: 'INTERRUPTED_TRIAL',
                message: `${trial.label} — 중단된 검사. 다시 실시하거나 미실시로 정리하세요.`,
            });
        } else if (trial.status !== 'CONFIRMED') {
            issues.push({
                id: `${trial.id}.unfinished`,
                trialId: trial.id,
                type: 'INCOMPLETE_TRIAL',
                message: `${trial.label} — 미확정`,
            });
        }
        if (trial.score === undefined) {
            issues.push({
                id: `${trial.id}.score`,
                trialId: trial.id,
                type: 'MISSING_SCORE',
                message: `${trial.label} — 수행량 미입력`,
            });
        }
    }
    // 조건 자체가 통째로 미실시이면 결과를 낼 수 없다.
    for (const summary of conditionSummaries(session)) {
        if (!summary.executedCount) {
            issues.push({
                id: `${summary.key}.empty`,
                type: 'INCOMPLETE_TRIAL',
                message: `${summary.label} — 실시한 회차가 없습니다.`,
            });
        }
    }
    if (saveFailed) {
        issues.push({ id: 'save', type: 'SAVE_ERROR', message: '저장 실패 데이터를 다시 저장하세요.' });
    }
    return issues;
}

export function confirmSession(session: TestSession, now: string, confirmedBy: string): TestSession {
    if (validateSession(session).length) throw new Error('미완료 검사와 수행량을 확인하세요.');
    if (!confirmedBy.trim()) throw new Error('확정자 이름을 입력하세요.');
    return {
        ...session,
        ...(session.bimanual
            ? {
                  bimanual: {
                      ...session.bimanual,
                      attempt: { ...session.bimanual.attempt, status: 'CONFIRMED' as const },
                  },
              }
            : {}),
        status: 'COMPLETED',
        completedAt: now,
        confirmedAt: now,
        confirmedBy: confirmedBy.trim(),
        updatedAt: now,
        revision: session.revision + 1,
    };
}

export function reopenSession(session: TestSession, now: string): TestSession {
    if (session.status !== 'COMPLETED') return session;
    return {
        ...session,
        status: 'IN_PROGRESS',
        completedAt: undefined,
        confirmedAt: undefined,
        confirmedBy: undefined,
        ...(session.bimanual
            ? {
                  bimanual: {
                      ...session.bimanual,
                      attempt: { ...session.bimanual.attempt, status: 'FINISHED' as const },
                  },
              }
            : {}),
        updatedAt: now,
        revision: session.revision + 1,
    };
}

/* ── 세션 생성 ─────────────────────────────────────────────────── */

export function createTestSession(input: {
    episodeId: string;
    seekerId: string;
    seekerName: string;
    testPluginId: string;
    now: string;
}): TestSession {
    const plugin = getTestPlugin(input.testPluginId);
    const id = createId('vesession');
    const now = input.now;
    const descriptors = plugin.createTrials(plugin.manifest.durationSeconds);
    const trials: Trial[] = descriptors.map((descriptor, index) => ({
        ...descriptor,
        testSessionId: id,
        status: index === 0 ? 'READY' : 'PENDING',
        remainingMs: descriptor.durationSeconds * 1000,
        memo: '',
        createdAt: now,
        updatedAt: now,
    }));
    return {
        id,
        episodeId: input.episodeId,
        seekerId: input.seekerId,
        seekerName: input.seekerName,
        testPluginId: input.testPluginId,
        status: 'IN_PROGRESS',
        currentTrialId: trials[0]?.id ?? '',
        trials,
        events: [],
        observations: [],
        conditions: [],
        sessionNote: '',
        bimanual:
            plugin.manifest.workflowKind === 'PART_COUNT' && plugin.manifest.partSpecification
                ? createBimanualState(createId('veattempt'), plugin.manifest.partSpecification, plugin.manifest.durationSeconds)
                : undefined,
        reinstructionCount: 0,
        interruptionCount: 0,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        revision: 1,
    };
}
