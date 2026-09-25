/**
 * 해석을 시작해도 되는 상태인지 본다. VE Assist `src/domain/interpretationReadiness.ts` 이식.
 * 자료가 모자라면 BLOCKED, 일부만 있으면 PARTIAL로 두고 "확인된 범위에서만" 해석하게 한다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import type { CanonicalFact } from '../sourceDocument/types';
import type { InterpretationReadiness } from './types';

const HAND_GROUPS = [
    'SMALL.DOMINANT',
    'SMALL.NON_DOMINANT',
    'SMALL.BILATERAL',
    'MEDIUM.DOMINANT',
    'MEDIUM.NON_DOMINANT',
    'LARGE.DOMINANT',
    'LARGE.NON_DOMINANT',
];

export function interpretationReadiness(
    testPluginId: string,
    facts: CanonicalFact[],
    conflictPaths: string[],
): InterpretationReadiness {
    const paths = new Set(facts.map(fact => fact.path));

    if (testPluginId === 'kead-hand-function') {
        // 조건마다 1회라도 확인되면 그 조건은 쓸 수 있다(2·3차 생략을 인정).
        const usable = HAND_GROUPS.filter(group => [1, 2, 3].some(trial => paths.has(`trials.${group}.${trial}`)));
        const complete = HAND_GROUPS.filter(group => [1, 2, 3].every(trial => paths.has(`trials.${group}.${trial}`)));
        const missing = HAND_GROUPS.filter(group => !usable.includes(group)).map(group => group.replace(/\./g, ' / '));
        if (usable.length === HAND_GROUPS.length && complete.length === HAND_GROUPS.length && !conflictPaths.length) {
            return {
                status: 'READY',
                message: '핵심 수행결과가 모두 확인되었습니다.',
                missing: [],
                usableCoreFields: usable.length,
                totalCoreFields: HAND_GROUPS.length,
            };
        }
        if (usable.length) {
            return {
                status: 'PARTIAL',
                message: '일부 결과가 확인되지 않아 확인된 자료 범위에서만 해석합니다.',
                missing: [...missing, ...conflictPaths],
                usableCoreFields: usable.length,
                totalCoreFields: HAND_GROUPS.length,
            };
        }
        return {
            status: 'BLOCKED',
            message: '해석 전에 손기능 수행결과를 먼저 확인해야 합니다.',
            missing: [...missing, ...conflictPaths],
            usableCoreFields: 0,
            totalCoreFields: HAND_GROUPS.length,
        };
    }

    if (testPluginId === 'kead-bimanual') {
        const components = COMPONENT_KEYS.filter(key => paths.has(`bimanual.components.${key}`));
        const hasSummary = paths.has('bimanual.reportedTotalCompleted') || paths.has('bimanual.recordedDurationMs');
        const total = COMPONENT_KEYS.length + 1;
        if (components.length === COMPONENT_KEYS.length && hasSummary && !conflictPaths.length) {
            return {
                status: 'READY',
                message: '핵심 수행결과가 모두 확인되었습니다.',
                missing: [],
                usableCoreFields: total,
                totalCoreFields: total,
            };
        }
        const missing = [
            ...COMPONENT_KEYS.filter(key => !paths.has(`bimanual.components.${key}`)),
            ...(hasSummary ? [] : ['기록시간 또는 총 수행량']),
            ...conflictPaths,
        ];
        if (components.length || hasSummary) {
            return {
                status: 'PARTIAL',
                message: '일부 결과가 확인되지 않아 확인된 자료 범위에서만 해석합니다.',
                missing,
                usableCoreFields: components.length + (hasSummary ? 1 : 0),
                totalCoreFields: total,
            };
        }
        return {
            status: 'BLOCKED',
            message: '해석 전에 양손협응 수행결과를 먼저 확인해야 합니다.',
            missing,
            usableCoreFields: 0,
            totalCoreFields: total,
        };
    }

    return {
        status: 'BLOCKED',
        message: '지원하는 검사 종류를 확인할 수 없습니다.',
        missing: ['검사 종류'],
        usableCoreFields: 0,
        totalCoreFields: 1,
    };
}
