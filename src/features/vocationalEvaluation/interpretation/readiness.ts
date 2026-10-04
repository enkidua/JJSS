/**
 * 해석을 시작해도 되는 상태인지 본다. VE Assist `src/domain/interpretationReadiness.ts` 이식.
 * 자료가 모자라면 BLOCKED, 일부만 있으면 PARTIAL로 두고 "확인된 범위에서만" 해석하게 한다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import type { HandMode, PinSize, TestSession } from '../model/types';
import type { CanonicalFact } from '../sourceDocument/types';
import { bimanualPartSpecification } from '../tests/keadBimanual';
import { conditionLabel } from '../tests/keadHandFunction';
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

/* ── 화면 안내 ─────────────────────────────────────────────────────
 * readiness.missing은 테스트·저장 호환을 위해 내부 키(SMALL / DOMINANT, cylinder, trials.… 경로)를 그대로 둔다.
 * 화면에는 아래 함수로 한글 이름을 보여 준다.
 */

const PART_LABELS: Record<string, string> = Object.fromEntries(
    bimanualPartSpecification.components.map(component => [component.key, component.label]),
);

/** readiness.missing 항목 하나를 평가사가 읽을 수 있는 이름으로 바꾼다. */
export function describeReadinessItem(item: string): string {
    const group = /^(SMALL|MEDIUM|LARGE) \/ (DOMINANT|NON_DOMINANT|BILATERAL)$/.exec(item);
    if (group) return conditionLabel(group[1] as PinSize, group[2] as HandMode);
    const trial = /^trials\.(SMALL|MEDIUM|LARGE)\.(DOMINANT|NON_DOMINANT|BILATERAL)\.(\d|reportedAverage)$/.exec(item);
    if (trial) {
        const which = trial[3] === 'reportedAverage' ? '평균' : `${trial[3]}차`;
        return `${conditionLabel(trial[1] as PinSize, trial[2] as HandMode)} ${which} (값 충돌)`;
    }
    const part = /^(?:bimanual\.components\.)?(\w+)$/.exec(item);
    if (part && PART_LABELS[part[1]]) return `${PART_LABELS[part[1]]}${item.startsWith('bimanual.') ? ' (값 충돌)' : ''}`;
    return item;
}

export interface EntryGuide {
    /** 측정은 끝났는데 수행량을 넣지 않은 시행·부품 */
    measuredWithoutScore: string[];
    /** 아직 시작하지 않은 시행 수(손기능) */
    notStarted: number;
    /** 평가사에게 보여 줄 한 줄 안내. 할 일이 없으면 빈 문자열 */
    message: string;
}

/**
 * 해석을 막고 있는 "입력하지 않은 값"을 회차 기록에서 직접 찾는다.
 * 타이머만 끝나고 수행량을 넣지 않은 시행은 해석 근거가 되지 않는다 — 평가사가 그 사실을 바로 알 수 있게 한다.
 */
export function entryGuide(session: TestSession): EntryGuide {
    if (session.bimanual) {
        const { attempt } = session.bimanual;
        const measured = attempt.status === 'FINISHED' || attempt.status === 'CONFIRMED' || attempt.status === 'PAUSED';
        const empty = COMPONENT_KEYS.filter(key => attempt.result.components[key] === undefined).map(key => PART_LABELS[key] ?? key);
        if (!measured && empty.length === COMPONENT_KEYS.length) {
            return { measuredWithoutScore: [], notStarted: 1, message: '② 검사 실시에서 측정을 마치고 부품별 수행량을 입력해 주세요.' };
        }
        return {
            measuredWithoutScore: empty,
            notStarted: 0,
            message: empty.length ? `부품별 수행량이 비어 있습니다: ${empty.join(', ')}. ② 검사 실시에서 입력해 주세요.` : '',
        };
    }
    const measuredWithoutScore = session.trials
        .filter(trial => ['PAUSED', 'INTERRUPTED', 'FINISHED'].includes(trial.status) && trial.score === undefined)
        .map(trial => `${conditionLabel(trial.size, trial.handMode)} ${trial.trialNumber}차`);
    const notStarted = session.trials.filter(trial => trial.status === 'READY' || trial.status === 'PENDING').length;
    const scored = session.trials.some(trial => trial.status !== 'SKIPPED' && trial.score !== undefined);
    let message = '';
    if (measuredWithoutScore.length) {
        message = `측정은 끝났지만 수행량(꽂은 핀 개수)을 입력하지 않은 시행이 ${measuredWithoutScore.length}개 있습니다. ② 검사 실시에서 개수를 입력하고 "이 시행 확정"을 눌러 주세요.`;
    } else if (!scored) {
        message = '아직 수행량을 입력한 시행이 없습니다. ② 검사 실시에서 시행마다 꽂은 핀 개수를 입력해 주세요.';
    }
    return { measuredWithoutScore, notStarted, message };
}
