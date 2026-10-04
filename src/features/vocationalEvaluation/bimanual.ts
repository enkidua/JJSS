/**
 * 다차원 양손협응 검사 로직. VE Assist `src/domain/bimanual.ts` 이식(zod → 자체 검증).
 * 수행량은 종료 후에만 입력하고, 기록시간·종료사유는 항상 함께 저장한다.
 */
import {
    COMPONENT_KEYS,
    type BimanualAttempt,
    type BimanualResult,
    type BimanualState,
    type ComponentKey,
    type PartSpecification,
} from './model/bimanualTypes';
import type { TestSession, TrialStatus, ValidationIssue } from './model/types';

export { COMPONENT_KEYS } from './model/bimanualTypes';
export type { ComponentKey, PartSpecification, BimanualAttempt, BimanualState } from './model/bimanualTypes';

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** zod superRefine 대신 쓰는 측정 검증. 문제가 있으면 사유 목록을 돌려준다. */
export function attemptProblems(attempt: BimanualAttempt): string[] {
    const problems: string[] = [];
    const limit = attempt.durationSeconds * 1000;
    if (!Number.isSafeInteger(attempt.durationSeconds) || attempt.durationSeconds <= 0) {
        problems.push('제한시간이 올바르지 않습니다.');
    }
    if (!isCount(attempt.remainingMs) || attempt.remainingMs > limit) {
        problems.push('시간이 제한시간 범위를 벗어났습니다.');
    }
    const recorded = attempt.result.recordedDurationMs;
    if (recorded !== undefined && (!isCount(recorded) || recorded > limit)) {
        problems.push('시간이 제한시간 범위를 벗어났습니다.');
    }
    if ((recorded === undefined) !== (attempt.result.endReason === undefined)) {
        problems.push('기록 시간과 종료 사유는 함께 저장해야 합니다.');
    }
    if (attempt.result.endReason === 'TIME_LIMIT' && recorded !== limit) {
        problems.push('제한시간 종료 기록은 전체 제한시간과 일치해야 합니다.');
    }
    if (['FINISHED', 'CONFIRMED'].includes(attempt.status) && (recorded === undefined || !attempt.result.endReason)) {
        problems.push('종료된 측정에는 시간과 종료 사유가 필요합니다.');
    }
    for (const key of COMPONENT_KEYS) {
        const value = attempt.result.components[key];
        if (value !== undefined && !isCount(value)) problems.push('부품 수행량이 올바르지 않습니다.');
    }
    return [...new Set(problems)];
}

export function createBimanualAttempt(id: string, durationSeconds: number): BimanualAttempt {
    return {
        id,
        status: 'READY',
        durationSeconds,
        remainingMs: durationSeconds * 1000,
        result: { components: {} },
        pauseCount: 0,
        pauses: [],
    };
}

export function createBimanualState(
    id: string,
    specification: PartSpecification,
    durationSeconds: number,
): BimanualState {
    return { specification, attempt: createBimanualAttempt(id, durationSeconds), previousAttempts: [] };
}

/** 입력한 부품 수행량의 합계 */
export function totalCompleted(result: BimanualResult): number {
    return COMPONENT_KEYS.reduce((sum, key) => sum + (result.components[key] ?? 0), 0);
}

/** 분모 합계. 실시요강 기준 25 */
export function totalMaximum(spec: PartSpecification): number {
    return spec.components.reduce((sum, component) => sum + component.maximum, 0);
}

export function requireBimanual(session: TestSession): BimanualState {
    if (!session.bimanual) throw new Error('양손협응 검사 세션이 아닙니다.');
    return session.bimanual;
}

function assertEditable(session: TestSession): void {
    if (['COMPLETED', 'CANCELLED'].includes(session.status)) throw new Error('기록 수정 재개 후 변경하세요.');
}

export function updateBimanual(session: TestSession, attempt: BimanualAttempt): TestSession {
    assertEditable(session);
    const problems = attemptProblems(attempt);
    if (problems.length) throw new Error(problems[0]);
    return { ...session, bimanual: { ...requireBimanual(session), attempt } };
}

export function changeBimanualState(
    session: TestSession,
    status: TrialStatus,
    now: string,
    remainingMs: number,
): TestSession {
    if (session.status !== 'IN_PROGRESS') throw new Error('평가를 재개한 후 조작하세요.');
    const attempt = requireBimanual(session).attempt;
    const allowed: Partial<Record<TrialStatus, TrialStatus[]>> = {
        READY: ['RUNNING'],
        RUNNING: ['PAUSED', 'FINISHED', 'INTERRUPTED'],
        PAUSED: ['RUNNING', 'FINISHED', 'INTERRUPTED'],
    };
    if (!allowed[attempt.status]?.includes(status)) {
        throw new Error(`허용되지 않은 상태 전환: ${attempt.status} → ${status}`);
    }
    const limit = attempt.durationSeconds * 1000;
    const left = Math.max(0, Math.min(limit, Math.round(remainingMs)));
    const elapsed = limit - left;
    return updateBimanual(session, {
        ...attempt,
        status: status as BimanualAttempt['status'],
        remainingMs: left,
        startedAt: status === 'RUNNING' ? (attempt.startedAt ?? now) : attempt.startedAt,
        endedAt: ['FINISHED', 'INTERRUPTED'].includes(status) ? now : attempt.endedAt,
        pauseCount: attempt.pauseCount + (status === 'PAUSED' ? 1 : 0),
        pauses: status === 'PAUSED' ? [...attempt.pauses, { at: now, elapsedMs: elapsed }] : attempt.pauses,
        result:
            status === 'FINISHED'
                ? {
                      ...attempt.result,
                      recordedDurationMs: elapsed,
                      endReason: left === 0 ? 'TIME_LIMIT' : 'EVALUATOR_FINISH',
                  }
                : status === 'INTERRUPTED'
                  ? { ...attempt.result, recordedDurationMs: elapsed, endReason: 'INTERRUPTED' }
                  : attempt.result,
    });
}

/** 평가자가 실수로 누른 종료를 되돌린다. 되돌리는 동안 흐른 시간을 조용히 빼지 않고 일시정지로 남긴다. */
export function undoBimanualFinish(session: TestSession): TestSession {
    const attempt = requireBimanual(session).attempt;
    if (attempt.status !== 'FINISHED' || attempt.result.endReason !== 'EVALUATOR_FINISH') {
        throw new Error('취소할 평가자 종료 기록이 없습니다.');
    }
    return updateBimanual(session, {
        ...attempt,
        status: 'PAUSED',
        endedAt: undefined,
        pauseCount: attempt.pauseCount + 1,
        pauses: [
            ...attempt.pauses,
            { at: attempt.endedAt as string, elapsedMs: attempt.result.recordedDurationMs as number },
        ],
        result: { components: attempt.result.components },
    });
}

export function setComponentCount(
    session: TestSession,
    key: ComponentKey,
    value: number | undefined,
): TestSession {
    const { attempt, specification } = requireBimanual(session);
    if (!['FINISHED', 'CONFIRMED'].includes(attempt.status)) throw new Error('측정 종료 후 수행량을 입력하세요.');
    const maximum = specification.components.find(component => component.key === key)?.maximum;
    if (maximum === undefined || (value !== undefined && (!isCount(value) || value > maximum))) {
        throw new Error(`수행량은 0~${maximum} 정수로 입력하세요. 실시요강 분모 기준입니다.`);
    }
    return updateBimanual(session, {
        ...attempt,
        result: { ...attempt.result, components: { ...attempt.result.components, [key]: value } },
    });
}

export function validateBimanual(session: TestSession): ValidationIssue[] {
    const { attempt, specification } = requireBimanual(session);
    const issues: ValidationIssue[] = [];
    if (!['FINISHED', 'CONFIRMED'].includes(attempt.status)) {
        issues.push({
            id: 'bimanual.unfinished',
            type: 'INCOMPLETE_TRIAL',
            message: '검사를 종료한 뒤 결과를 확인하세요.',
        });
    }
    for (const component of specification.components) {
        const value = attempt.result.components[component.key];
        if (value === undefined || !isCount(value) || value > component.maximum) {
            issues.push({
                id: component.key,
                type: 'MISSING_SCORE',
                message: `${component.label} 수행량을 확인하세요 (0~${component.maximum}).`,
            });
        }
    }
    if (attemptProblems(attempt).length) {
        issues.push({
            id: 'completion.time',
            type: 'MISSING_SCORE',
            message: '기록 시간과 종료 사유를 확인하세요.',
        });
    }
    return issues;
}

/** 요강 p.44 — 다시 수행할 수 있다. 이전 측정은 버리지 않고 남긴다. */
export function restartBimanual(session: TestSession, id: string, now: string): TestSession {
    assertEditable(session);
    const state = requireBimanual(session);
    const previous = state.attempt;
    if (!['INTERRUPTED', 'FINISHED', 'PAUSED'].includes(previous.status)) {
        throw new Error('현재 상태에서는 재실시할 수 없습니다.');
    }
    return {
        ...session,
        status: 'IN_PROGRESS',
        recoveryReason: undefined,
        pausedAt: undefined,
        pauseReason: undefined,
        bimanual: {
            ...state,
            previousAttempts: [...state.previousAttempts, previous],
            attempt: createBimanualAttempt(id, previous.durationSeconds),
        },
        events: session.events.map(event =>
            event.attemptId === previous.id && !event.excludedAt
                ? { ...event, excludedAt: now, excludedReason: 'TRIAL_RESTARTED' as const }
                : event,
        ),
    };
}
