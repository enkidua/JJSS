/**
 * 검사 중 사건 기록. VE Assist `src/domain/evaluationEvents.ts` 이식 + 재설명 횟수 집계.
 */
import { createId } from './ids';
import { currentMeasurement } from './measurement';
import { getTestPlugin } from './tests/registry';
import { MAX_REINSTRUCTIONS } from './session';
import type { EvaluationEvent, EvaluationEventType, TestSession } from './model/types';

/** 요강 p.41 — 재설명은 2회로 한정한다. */
const REINSTRUCTION_EVENTS: EvaluationEventType[] = ['REPEATED_INSTRUCTION', 'ADDITIONAL_DEMONSTRATION'];

export function countReinstructions(session: TestSession): number {
    return session.events.filter(event => !event.excludedAt && REINSTRUCTION_EVENTS.includes(event.eventType)).length;
}

export function reinstructionsExceeded(session: TestSession): boolean {
    return countReinstructions(session) > MAX_REINSTRUCTIONS;
}

export function recordEvent(
    session: TestSession,
    eventType: EvaluationEventType,
    now: string,
    elapsedSeconds: number,
    memo?: string,
): TestSession {
    const measurement = currentMeasurement(session);
    if (!['RUNNING', 'PAUSED', 'FINISHED'].includes(measurement.status)) {
        throw new Error('검사 시작 후 사건을 기록하세요.');
    }
    const next: TestSession = {
        ...session,
        events: [
            ...session.events,
            {
                id: createId('veevent'),
                testSessionId: session.id,
                ...(session.bimanual ? { attemptId: measurement.id } : { trialId: measurement.id }),
                eventType,
                memo,
                elapsedSeconds,
                createdAt: now,
            },
        ],
        updatedAt: now,
        revision: session.revision + 1,
    };
    return { ...next, reinstructionCount: countReinstructions(next) };
}

export function undoLatestEvent(session: TestSession, now: string): TestSession {
    const measurement = currentMeasurement(session);
    const own = session.events.filter(
        event =>
            !event.excludedAt &&
            (session.bimanual ? event.attemptId === measurement.id : event.trialId === measurement.id),
    );
    const last = own[own.length - 1];
    if (!last) return session;
    const next: TestSession = {
        ...session,
        events: session.events.map(event =>
            event.id === last.id ? { ...event, excludedAt: now, excludedReason: 'UNDO' as const } : event,
        ),
        updatedAt: now,
        revision: session.revision + 1,
    };
    return { ...next, reinstructionCount: countReinstructions(next) };
}

export interface EventTally {
    eventType: EvaluationEventType;
    label: string;
    count: number;
    /** 요강 표4-2·4-3의 수행량 처리 */
    scoreEffect?: 'INCLUDE' | 'EXCLUDE';
}

/** 시행(또는 측정) 하나에 기록된 사건 집계. 취소한 사건은 빼고 센다. */
export function tallyEvents(session: TestSession, targetId?: string): EventTally[] {
    const plugin = getTestPlugin(session.testPluginId);
    const target = targetId ?? currentMeasurement(session).id;
    const counts = new Map<EvaluationEventType, number>();
    for (const event of session.events) {
        if (event.excludedAt) continue;
        const owner = session.bimanual ? event.attemptId : event.trialId;
        if (owner !== target) continue;
        counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
    }
    return [...counts.entries()].map(([eventType, count]) => {
        const definition = plugin.events.find(item => item.type === eventType);
        return {
            eventType,
            label: definition?.label ?? eventType,
            count,
            scoreEffect: definition?.scoreEffect,
        };
    });
}

export function activeEvents(session: TestSession): EvaluationEvent[] {
    return session.events.filter(event => !event.excludedAt);
}
