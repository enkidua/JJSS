/**
 * 결과지·검사 기록에서 보고서 문단을 자동으로 쓴다.
 *
 * 공단 검사해석 프로그램이 점수로 결과지를 만들어 주므로, 평가사는 점수를 정확히 입력하고
 * 결과지에 나온 값을 해석하는 데 집중하면 된다. 이 모듈은 그 해석의 초안을 만든다.
 *
 * 원칙(계획서 §2·§5, claimQuality와 같은 기준)
 *  - 확정된 값만 쓴다. 공식 결과지를 확정했으면 결과지 값, 아니면 앱에 기록한 값.
 *  - 규준 값은 결과지에 **인쇄된 그대로** 옮긴다. 백분위·순위를 새로 계산하지 않는다.
 *  - 사람 안의 비교(우세손/비우세손, 핀 크기, 부품별)와 기록된 사건만 사실로 적는다.
 *  - 취업 가능·직무 적합·진단 같은 판단은 쓰지 않는다. 그 판단은 평가사가 직접 서술한다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import { HAND_MODE_LABELS, PIN_SIZE_LABELS, type TestSession } from '../model/types';
import { buildInterpretationContext } from '../interpretation/context';
import { buildPatterns, COMPONENT_NAMES } from '../interpretation/patterns';
import { isOfficialDocumentUsable } from '../sourceDocument/record';
import type { CanonicalFact, SourceDocumentRecord } from '../sourceDocument/types';
import { bimanualPartSpecification } from '../tests/keadBimanual';
import { getTestPlugin } from '../tests/registry';

export interface ResultNarrative {
    /** 직업진단 섹션에 넣을 문장(순서대로) */
    paragraphs: Array<{ key: string; text: string }>;
    /** 요약의 "직업적 강점" 초안 문장 */
    strengths: string[];
    /** 요약의 "제한점·고려사항" 초안 문장 */
    limitations: string[];
    /** 공식 결과지 값을 썼는지 */
    fromOfficialDocument: boolean;
}

const SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
const HANDS = ['DOMINANT', 'NON_DOMINANT', 'BILATERAL'] as const;

const display = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes ? `${minutes}분${rest ? ` ${rest}초` : ''}` : `${rest}초`;
}

function numberAt(facts: CanonicalFact[], path: string): number | null {
    const value = facts.find(fact => fact.path === path)?.selectedFact.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 결과지에 인쇄된 규준 표기값(평가사가 제외하지 않은 것만). 값은 인쇄된 그대로다. */
function printedNorms(document: SourceDocumentRecord | undefined): Array<{ label: string; text: string; value: number | null }> {
    if (!isOfficialDocumentUsable(document)) return [];
    return document.reviewFields
        .filter(field => field.path.startsWith('norms.') && field.status !== 'REJECTED' && field.extracted.value !== null)
        .map(field => {
            const raw = field.extracted.rawText ?? '';
            const value = field.extracted.value;
            const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
            const percent = /%|수행도|대비/.test(`${field.label} ${raw}`);
            return {
                label: field.label,
                text: `${field.label} ${typeof value === 'number' ? display(value) : String(value)}${percent && !String(value).includes('%') ? '%' : ''}`,
                value: Number.isFinite(numeric) ? numeric : null,
            };
        });
}

function normSentences(document: SourceDocumentRecord | undefined): { text: string | null; comparison: string | null } {
    const norms = printedNorms(document);
    if (!norms.length) return { text: null, comparison: null };
    // 값 자체가 소견의 내용이다. "앱이 계산하지 않았다" 같은 출처 설명은 결과표 아래 주석에만 둔다.
    const text = `결과지에 인쇄된 규준 비교는 ${norms.map(norm => norm.text).join(', ')}이다.`;
    // 비장애인 규준과 장애 규준이 함께 인쇄되어 있으면, 두 인쇄값의 크고 작음만 적는다.
    const nondisabled = norms.find(norm => /비장애/.test(norm.label) && /전체/.test(norm.label) && norm.value !== null);
    const disabled = norms.find(norm => !/비장애/.test(norm.label) && /장애/.test(norm.label) && /전체/.test(norm.label) && norm.value !== null);
    let comparison: string | null = null;
    if (nondisabled && disabled && nondisabled.value !== null && disabled.value !== null && nondisabled.value !== disabled.value) {
        comparison =
            disabled.value > nondisabled.value
                ? `같은 장애유형 규준과 비교한 수행도(${display(disabled.value)})가 비장애인 전체 규준 대비 수행도(${display(nondisabled.value)})보다 높게 표기되었다.`
                : `비장애인 전체 규준 대비 수행도(${display(nondisabled.value)})가 같은 장애유형 규준과 비교한 수행도(${display(disabled.value)})보다 높게 표기되었다.`;
    }
    return { text, comparison };
}

/** 검사 중 기록한 사건(되돌린 기록 제외)을 종류별로 센다. */
function eventSentence(session: TestSession): { text: string | null; counts: Array<{ label: string; count: number }> } {
    const plugin = getTestPlugin(session.testPluginId);
    const labels = new Map(plugin.events.map(event => [event.type, event.label]));
    const counts = new Map<string, number>();
    for (const event of session.events) {
        if (event.excludedAt) continue;
        const label = labels.get(event.eventType) ?? event.eventType;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const list = [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    if (!list.length) return { text: null, counts: [] };
    return { text: `검사 중 기록된 사건은 ${list.map(item => `${item.label} ${item.count}회`).join(', ')}이다.`, counts: list };
}

function handFunctionNarrative(session: TestSession, facts: CanonicalFact[]): ResultNarrative {
    const paragraphs: ResultNarrative['paragraphs'] = [];
    const strengths: string[] = [];
    const limitations: string[] = [];

    const averages: Array<{ label: string; value: number; count: number }> = [];
    for (const size of SIZES) {
        for (const hand of HANDS) {
            if (hand === 'BILATERAL' && size !== 'SMALL') continue;
            const trials = [1, 2, 3].map(n => numberAt(facts, `trials.${size}.${hand}.${n}`)).filter((v): v is number => v !== null);
            const reported = numberAt(facts, `trials.${size}.${hand}.reportedAverage`);
            const value = reported ?? (trials.length ? trials.reduce((a, b) => a + b, 0) / trials.length : null);
            if (value === null) continue;
            averages.push({ label: `${PIN_SIZE_LABELS[size]} ${HAND_MODE_LABELS[hand]}`, value, count: trials.length });
        }
    }
    if (!averages.length) return { paragraphs, strengths, limitations, fromOfficialDocument: false };

    paragraphs.push({
        key: 'hand:averages',
        text: `조건별 평균 수행량(30초 동안 꽂은 핀 개수)은 ${averages
            .map(item => `${item.label} ${display(item.value)}개${item.count && item.count < 3 ? `(${item.count}회 실시)` : ''}`)
            .join(', ')}이다.`,
    });

    const patterns = buildPatterns(session.testPluginId, facts);
    const handComparisons = patterns.filter(pattern => pattern.patternType === 'HAND_COMPARISON' && pattern.comparison);
    if (handComparisons.length) {
        const parts = handComparisons.map(pattern => {
            const c = pattern.comparison!;
            const size = c.conditionA.split(' ')[0];
            if (pattern.direction === 'EQUAL') return `${size}은 우세손과 비우세손 평균이 같았다`;
            return `${size}은 ${c.higherCondition.split(' ').slice(1).join(' ')} 평균이 ${c.displayDifference} 많았다`;
        });
        paragraphs.push({ key: 'hand:hands', text: `손 사용 조건을 비교하면 ${parts.join(', ')}.` });
    }

    const bilateral = patterns.filter(pattern => pattern.patternType === 'BILATERAL_COMPARISON' && pattern.comparison);
    if (bilateral.length) {
        paragraphs.push({
            key: 'hand:bilateral',
            text: `소형핀 양손 조건은 ${bilateral
                .map(pattern => {
                    const c = pattern.comparison!;
                    const other = c.conditionB.split(' ').slice(1).join(' ');
                    return pattern.direction === 'EQUAL'
                        ? `${other} 조건과 평균이 같았고`
                        : `${other} 조건보다 평균이 ${c.displayDifference} ${pattern.direction === 'HIGHER' ? '많았고' : '적었고'}`;
                })
                .join(' ')
                .replace(/고$/, '다')}.`,
        });
    }

    const sorted = [...averages].sort((a, b) => b.value - a.value);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    if (highest && lowest && highest.value !== lowest.value) {
        paragraphs.push({
            key: 'hand:extremes',
            text: `확인된 조건 중 평균 수행량이 가장 많은 조건은 ${highest.label}(${display(highest.value)}개), 가장 적은 조건은 ${lowest.label}(${display(lowest.value)}개)이다.`,
        });
        strengths.push(`손기능: 확인된 조건 중 ${highest.label} 평균 수행량이 가장 많았다(${display(highest.value)}개).`);
        limitations.push(`손기능: 확인된 조건 중 ${lowest.label} 평균 수행량이 가장 적었다(${display(lowest.value)}개).`);
    }

    const variability = patterns
        .filter(pattern => pattern.patternType === 'TRIAL_VARIABILITY' && typeof pattern.value === 'number')
        .sort((a, b) => (b.value as number) - (a.value as number))[0];
    if (variability && (variability.value as number) > 0) {
        paragraphs.push({ key: 'hand:variability', text: `회차 간 수행량 차이가 가장 큰 조건은 ${variability.label.replace(' 수행량 범위', '')}였다.` });
    }

    return { paragraphs, strengths, limitations, fromOfficialDocument: false };
}

function bimanualNarrative(facts: CanonicalFact[]): ResultNarrative {
    const paragraphs: ResultNarrative['paragraphs'] = [];
    const strengths: string[] = [];
    const limitations: string[] = [];
    const maxima = new Map(bimanualPartSpecification.components.map(component => [component.key, component.maximum]));

    const components = COMPONENT_KEYS.map(key => ({ key, value: numberAt(facts, `bimanual.components.${key}`), maximum: maxima.get(key) ?? 4 }))
        .filter((item): item is { key: typeof item.key; value: number; maximum: number } => item.value !== null);
    const total = numberAt(facts, 'bimanual.reportedTotalCompleted')
        ?? (components.length === COMPONENT_KEYS.length ? components.reduce((sum, item) => sum + item.value, 0) : null);
    const durationFact = facts.find(fact => fact.path === 'bimanual.recordedDurationMs')?.selectedFact.value;
    const duration = typeof durationFact === 'number' ? formatDuration(durationFact) : typeof durationFact === 'string' ? durationFact : null;

    if (total !== null || duration) {
        const parts = [
            total !== null ? `제한시간 1분 30초 동안의 총 수행량은 ${total}개(총 도구수 ${bimanualPartSpecification.reportedTotal}개 기준)` : '',
            // "완성소요시간"이라고 쓰면 전체 과제를 끝낸 시간으로 읽힌다. 기록된 측정 시간일 뿐이다.
            duration ? `측정 기록시간은 ${duration}` : '',
        ].filter(Boolean);
        paragraphs.push({ key: 'bimanual:total', text: `${parts.join('이고, ')}이다.` });
        // 수행량이 총 도구수에 못 미치면 "완료"로 읽히지 않도록 분명히 적는다.
        if (total !== null && total < bimanualPartSpecification.reportedTotal) {
            paragraphs.push({
                key: 'bimanual:incomplete',
                text: `총 도구수 ${bimanualPartSpecification.reportedTotal}개 중 ${total}개가 기록되어 전체 과제를 끝낸 기록은 아니다. 기록시간은 전체 조립을 마친 시간이 아니라 측정한 시간이다.`,
            });
        }
    }

    if (components.length) {
        const full = components.filter(item => item.value >= item.maximum);
        const partial = components.filter(item => item.value < item.maximum);
        paragraphs.push({
            key: 'bimanual:components',
            text: `부품별 수행량은 ${components.map(item => `${COMPONENT_NAMES[item.key]} ${item.value}/${item.maximum}`).join(', ')}이다.`,
        });
        if (full.length) strengths.push(`양손협응: ${full.map(item => COMPONENT_NAMES[item.key]).join('·')}은(는) 분모만큼 수행했다.`);
        const lowestRatio = Math.min(...partial.map(item => item.value / item.maximum));
        const weakest = partial.filter(item => item.value / item.maximum === lowestRatio);
        if (weakest.length) {
            limitations.push(
                `양손협응: ${weakest.map(item => `${COMPONENT_NAMES[item.key]}(${item.value}/${item.maximum})`).join('·')}의 수행 비율이 가장 낮았다.`,
            );
        }
    }
    return { paragraphs, strengths, limitations, fromOfficialDocument: false };
}

/** 검사 1건의 결과 해석 초안. 값이 하나도 없으면 빈 결과를 돌려준다. */
export function buildResultNarrative(session: TestSession, document?: SourceDocumentRecord, now = new Date().toISOString()): ResultNarrative {
    const context = buildInterpretationContext({ session, document, now });
    const facts = context.canonicalFacts;
    const base = session.bimanual ? bimanualNarrative(facts) : handFunctionNarrative(session, facts);
    if (!base.paragraphs.length) return { ...base, fromOfficialDocument: context.hasOfficialDocument };

    const norms = normSentences(document);
    if (norms.text) base.paragraphs.push({ key: 'norms', text: norms.text });
    if (norms.comparison) base.paragraphs.push({ key: 'norms:comparison', text: norms.comparison });

    const events = eventSentence(session);
    if (events.text) {
        base.paragraphs.push({ key: 'events', text: events.text });
        const name = getTestPlugin(session.testPluginId).manifest.shortName;
        const top = events.counts.slice(0, 3).map(item => `${item.label} ${item.count}회`).join(', ');
        base.limitations.push(`${name}: 검사 중 ${top}이(가) 기록되었다.`);
    }
    return { ...base, fromOfficialDocument: context.hasOfficialDocument };
}
