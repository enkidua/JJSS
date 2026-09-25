/**
 * 확정값에서 기계적으로 만드는 비교 패턴. VE Assist `src/domain/interpretationPatterns.ts` 이식.
 * 여기서 만드는 것은 사실의 비교일 뿐이며 해석·판정이 아니다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import { HAND_MODE_LABELS, PIN_SIZE_LABELS } from '../model/types';
import type { CanonicalFact } from '../sourceDocument/types';
import type { PatternFact } from './types';

const SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
const HANDS = ['DOMINANT', 'NON_DOMINANT', 'BILATERAL'] as const;

const NAMES: Record<string, string> = { ...PIN_SIZE_LABELS, ...HAND_MODE_LABELS };

export const COMPONENT_NAMES: Record<string, string> = {
    cylinder: '원통결합',
    largeBolt: '볼트(대)',
    largeNut: '너트(대)',
    smallBolt: '볼트(소)',
    smallNut: '너트(소)',
    plate: '판',
    fixingPin: '고정핀',
};

/** 경로를 사람이 읽는 이름으로 바꾼다. */
export function factLabel(path: string): string {
    const parts = path.split('.');
    if (parts[0] === 'trials') {
        return `${NAMES[parts[1] as string]} · ${NAMES[parts[2] as string]} · ${
            parts[3] === 'reportedAverage' ? '결과지 표기 평균' : `${parts[3]}회`
        }`;
    }
    if (parts[1] === 'components') return COMPONENT_NAMES[parts[2] as string] ?? '부품 수행량';
    if (parts[1] === 'componentDenominators') return `${COMPONENT_NAMES[parts[2] as string] ?? '부품'} 분모`;
    const fixed: Record<string, string> = {
        'bimanual.recordedDurationMs': '기록된 검사시간(ms)',
        'bimanual.reportedTotalCompleted': '결과지 표기 총 수행량',
        'bimanual.reportedTotalTools': '결과지 표기 총 도구수',
    };
    return fixed[path] ?? '결과지 표기값';
}

const display = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const groupFor = (type: string): PatternFact['group'] =>
    type === 'TRIAL_SEQUENCE' || type === 'TRIAL_VARIABILITY'
        ? 'TRIAL_SEQUENCE'
        : type === 'HAND_COMPARISON'
          ? 'HAND_COMPARISON'
          : type === 'SIZE_COMPARISON'
            ? 'SIZE_COMPARISON'
            : type.includes('BILATERAL')
              ? 'BILATERAL'
              : 'SUMMARY';

const priorityFor = (type: string): number =>
    (
        ({
            OBSERVED_EXTREME: 10,
            HAND_COMPARISON: 20,
            SIZE_COMPARISON: 30,
            BILATERAL_COMPARISON: 40,
            COMPONENT_SUM: 10,
            REPORTED_TOTAL: 20,
            RECORDED_DURATION: 30,
            COMPONENT_DISTRIBUTION: 40,
            TRIAL_VARIABILITY: 60,
            TRIAL_SEQUENCE: 70,
        }) as Record<string, number>
    )[type] ?? 50;

export function buildPatterns(testPluginId: string, canonical: CanonicalFact[]): PatternFact[] {
    const facts = canonical.filter(fact => ['SINGLE_SOURCE', 'MATCHED', 'RESOLVED'].includes(fact.resolutionStatus));
    const get = (path: string) =>
        facts.find(
            fact =>
                fact.path === path &&
                typeof fact.selectedFact.value === 'number' &&
                Number.isFinite(fact.selectedFact.value),
        );
    const patterns: PatternFact[] = [];
    const add = (
        key: string,
        type: string,
        label: string,
        value: PatternFact['value'],
        source: CanonicalFact[],
        extra: Partial<PatternFact> = {},
    ) => {
        patterns.push({
            id: `pattern:${key}`,
            testType: testPluginId,
            patternType: type,
            label,
            value,
            evidenceFactIds: source.map(fact => fact.selectedFact.id).sort(),
            ruleId: key.split(':')[0] as string,
            ruleVersion: '1',
            group: groupFor(type),
            summaryPriority: priorityFor(type),
            ...extra,
        });
    };

    if (testPluginId === 'kead-hand-function') {
        const groups = new Map<string, { mean: number; source: CanonicalFact[]; label: string }>();
        for (const size of SIZES) {
            for (const hand of HANDS) {
                if (hand === 'BILATERAL' && size !== 'SMALL') continue;
                const source = [1, 2, 3].map(n => get(`trials.${size}.${hand}.${n}`));
                const present = source.filter((fact): fact is CanonicalFact => Boolean(fact));
                // 요강은 3회가 원칙이지만 현장에서 2·3차를 생략하기도 한다. 확인된 회차만으로 평균을 낸다.
                if (!present.length) continue;
                const values = present.map(fact => fact.selectedFact.value as number);
                const key = `${size}:${hand}`;
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const label = `${NAMES[size]} ${NAMES[hand]}`;
                groups.set(key, { mean, source: present, label });
                add(
                    `sequence:${key}`,
                    'TRIAL_SEQUENCE',
                    `${label} ${present.length === 3 ? '1~3회' : `${present.length}회 실시`} 수행량: ${values.join(', ')}개`,
                    values,
                    present,
                );
                const range = Math.max(...values) - Math.min(...values);
                add(`range:${key}`, 'TRIAL_VARIABILITY', `${label} 수행량 범위 ${display(range)}개`, range, present);
            }
        }
        const compare = (key: string, type: string, a: string, b: string) => {
            const left = groups.get(a);
            const right = groups.get(b);
            if (!left || !right) return;
            const absoluteDifference = Math.abs(left.mean - right.mean);
            const equal = absoluteDifference < Number.EPSILON;
            const higher = equal ? 'EQUAL' : left.mean > right.mean ? left.label : right.label;
            const lower = equal ? 'EQUAL' : left.mean < right.mean ? left.label : right.label;
            const label = `${left.label} 평균 ${display(left.mean)}개, ${right.label} 평균 ${display(right.mean)}개 — ${
                equal ? '두 조건의 평균이 같게 나타남' : `${higher} 조건이 ${display(absoluteDifference)}개 높게 나타남`
            }`;
            add(key, type, label, absoluteDifference, [...left.source, ...right.source], {
                direction: equal ? 'EQUAL' : left.mean > right.mean ? 'HIGHER' : 'LOWER',
                comparison: {
                    conditionA: left.label,
                    valueA: left.mean,
                    conditionB: right.label,
                    valueB: right.mean,
                    higherCondition: higher,
                    lowerCondition: lower,
                    absoluteDifference,
                    displayDifference: `${display(absoluteDifference)}개`,
                },
            });
        };
        for (const size of SIZES) compare(`hand:${size}`, 'HAND_COMPARISON', `${size}:DOMINANT`, `${size}:NON_DOMINANT`);
        for (const hand of HANDS.slice(0, 2)) {
            compare(`size:large-small:${hand}`, 'SIZE_COMPARISON', `LARGE:${hand}`, `SMALL:${hand}`);
            compare(`size:medium-small:${hand}`, 'SIZE_COMPARISON', `MEDIUM:${hand}`, `SMALL:${hand}`);
            compare(`size:large-medium:${hand}`, 'SIZE_COMPARISON', `LARGE:${hand}`, `MEDIUM:${hand}`);
        }
        for (const hand of HANDS.slice(0, 2)) {
            compare(`bilateral:${hand}`, 'BILATERAL_COMPARISON', 'SMALL:BILATERAL', `SMALL:${hand}`);
        }
        const entries = [...groups.entries()];
        if (entries.length) {
            for (const [kind, value] of [
                ['highest', Math.max(...entries.map(([, item]) => item.mean))],
                ['lowest', Math.min(...entries.map(([, item]) => item.mean))],
            ] as const) {
                const matches = entries.filter(([, item]) => item.mean === value);
                add(
                    `observed:${kind}`,
                    'OBSERVED_EXTREME',
                    `현재 확인된 조건 중 ${kind === 'highest' ? '가장 높은' : '가장 낮은'} 평균: ${matches
                        .map(([, item]) => item.label)
                        .join(', ')} (${display(value)}개)`,
                    value,
                    matches.flatMap(([, item]) => item.source),
                );
            }
        }
        return patterns.sort((a, b) => a.id.localeCompare(b.id));
    }

    if (testPluginId === 'kead-bimanual') {
        const components = COMPONENT_KEYS.map(key => get(`bimanual.components.${key}`)).filter(
            (fact): fact is CanonicalFact => Boolean(fact),
        );
        if (components.length) {
            add(
                'components',
                'COMPONENT_DISTRIBUTION',
                components.map(fact => `${factLabel(fact.path)} ${fact.selectedFact.value}개`).join(', '),
                components.map(fact => fact.selectedFact.value as number),
                components,
            );
        }
        if (components.length === COMPONENT_KEYS.length) {
            const sum = components.reduce((total, fact) => total + (fact.selectedFact.value as number), 0);
            add('component-sum', 'COMPONENT_SUM', `확인된 7개 부품 수행량 합계: ${sum}개`, sum, components);
        }
        const duration = get('bimanual.recordedDurationMs');
        if (duration) {
            const seconds = (duration.selectedFact.value as number) / 1000;
            add(
                'duration',
                'RECORDED_DURATION',
                `기록된 검사시간: ${display(seconds)}초. 전체 조립 완료를 뜻하지 않습니다.`,
                seconds,
                [duration],
            );
        }
        const total = get('bimanual.reportedTotalCompleted');
        if (total) {
            add(
                'reported-total',
                'REPORTED_TOTAL',
                `결과지 표기 총 수행량: ${total.selectedFact.value}개`,
                total.selectedFact.value as number,
                [total],
            );
        }
    }
    return patterns.sort((a, b) => a.id.localeCompare(b.id));
}
