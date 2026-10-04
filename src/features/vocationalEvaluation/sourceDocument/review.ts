/**
 * 결과지 검토. 읽은 값을 항목별로 펼치고, 앱 기록과 대조해 문제를 찾는다.
 * VE Assist `documentImport.ts`의 검토 부분 이식.
 *
 * 이름은 애초에 읽지 않는다(비식별화 원칙). 사람이 다를 위험은 생년월일·우세손으로만 경고한다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import { factValueIssue } from './valueLimits';
import { conditionLabel } from '../tests/keadHandFunction';
import type { DominantHand, HandMode, PinSize, TestSession } from '../model/types';
import type {
    ExtractedScalar,
    ReviewField,
    ReviewIssue,
    ReviewSeverity,
    SupportedExtraction,
} from './types';

const COMPONENT_LABELS: Record<string, string> = {
    cylinder: '원통결합',
    largeBolt: '볼트(대)',
    largeNut: '너트(대)',
    smallBolt: '볼트(소)',
    smallNut: '너트(소)',
    plate: '판',
    fixingPin: '고정핀',
};

const HAND_CONDITIONS: Array<{ size: PinSize; hands: HandMode[] }> = [
    { size: 'SMALL', hands: ['DOMINANT', 'NON_DOMINANT', 'BILATERAL'] },
    { size: 'MEDIUM', hands: ['DOMINANT', 'NON_DOMINANT'] },
    { size: 'LARGE', hands: ['DOMINANT', 'NON_DOMINANT'] },
];

/** "1분 20초" → 80000 */
export function parseKoreanDuration(raw: string): number | null {
    const normalized = raw.trim();
    const minute = /([0-9]+)\s*분/.exec(normalized);
    const second = /([0-9]+)\s*초/.exec(normalized);
    if (!minute && !second) return null;
    return ((minute ? Number(minute[1]) : 0) * 60 + (second ? Number(second[1]) : 0)) * 1000;
}

export function normalizeReviewValue(path: string, value: string | number | null): string | number | null {
    return path === 'bimanual.recordedDurationMs' && typeof value === 'string' ? parseKoreanDuration(value) : value;
}

function cloneScalar(value: ExtractedScalar): ExtractedScalar {
    return { ...value };
}

/** 결과지에서 읽은 값을 검토 항목으로 펼친다. 앱 기록(session)이 있으면 대조값을 함께 넣는다. */
export function flattenExtraction(result: SupportedExtraction, session?: TestSession): ReviewField[] {
    const fields: ReviewField[] = [];
    const add = (path: string, label: string, extracted: ExtractedScalar, directValue?: string | number | null) => {
        const comparable = normalizeReviewValue(path, extracted.value);
        fields.push({
            path,
            label,
            originalExtracted: cloneScalar(extracted),
            extracted: cloneScalar(extracted),
            status: extracted.value === null ? 'MISSING' : 'EXTRACTED',
            directValue,
            comparison:
                directValue === undefined || comparable === null
                    ? 'NOT_AVAILABLE'
                    : directValue === comparable
                      ? 'MATCHED'
                      : 'CONFLICT',
        });
    };

    if (result.documentType === 'KEAD_BIMANUAL') {
        const direct = session?.bimanual?.attempt.result;
        for (const key of COMPONENT_KEYS) {
            add(`bimanual.components.${key}`, COMPONENT_LABELS[key], result.performance.components[key], direct?.components[key]);
        }
        add('bimanual.recordedDurationMs', '완성소요시간', result.performance.recordedDuration, direct?.recordedDurationMs);
        const directTotal =
            direct && COMPONENT_KEYS.every(key => direct.components[key] !== undefined)
                ? COMPONENT_KEYS.reduce((sum, key) => sum + (direct.components[key] ?? 0), 0)
                : undefined;
        add('bimanual.reportedTotalCompleted', '결과지 표기 총 수행량', result.performance.reportedTotalCompleted, directTotal);
        add('bimanual.reportedTotalTools', '결과지 표기 총 도구수', result.performance.reportedTotalTools);
        for (const key of COMPONENT_KEYS) {
            add(
                `bimanual.componentDenominators.${key}`,
                `${COMPONENT_LABELS[key]} 분모`,
                result.performance.componentDenominators[key],
            );
        }
    } else {
        for (const { size, hands } of HAND_CONDITIONS) {
            for (const hand of hands) {
                const condition = result.trials[size]?.[hand];
                if (!condition) continue;
                for (const trialNumber of [1, 2, 3] as const) {
                    const trial = session?.trials.find(
                        item => item.size === size && item.handMode === hand && item.trialNumber === trialNumber,
                    );
                    add(
                        `trials.${size}.${hand}.${trialNumber}`,
                        `${conditionLabel(size, hand)} · ${trialNumber}회`,
                        condition[`trial${trialNumber}`],
                        trial?.status === 'SKIPPED' ? undefined : trial?.score,
                    );
                }
            }
        }
        for (const { size, hands } of HAND_CONDITIONS) {
            for (const hand of hands) {
                const condition = result.trials[size]?.[hand];
                if (!condition) continue;
                const scores = session?.trials
                    .filter(item => item.size === size && item.handMode === hand && item.status !== 'SKIPPED')
                    .map(item => item.score)
                    .filter((value): value is number => value !== undefined);
                const computed =
                    scores && scores.length
                        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                        : undefined;
                add(
                    `trials.${size}.${hand}.reportedAverage`,
                    `${conditionLabel(size, hand)} · 결과지 표기 평균`,
                    condition.reportedAverage,
                    computed,
                );
            }
        }
    }

    for (const norm of result.norms) add(`norms.${norm.path}`, norm.sourceLabel, norm.sourceValue);
    return fields;
}

export interface ValidationContext {
    documentId: string;
    session?: TestSession;
    /** 회차에서 판정한 우세손 */
    dominantHand?: DominantHand;
    /** 이용자 등록 정보의 생년월일(YYYY-MM-DD). 없으면 대조하지 않는다 */
    birthDate?: string;
}

function issueFactory(documentId: string, issues: ReviewIssue[]) {
    return (severity: ReviewSeverity, code: string, message: string, path?: string) => {
        issues.push({
            id: `${documentId}.${code}.${path ?? issues.length}`,
            documentId,
            severity,
            code,
            message,
            path,
            status: 'OPEN',
        });
    };
}

function sameBirthDate(a: string, b: string): boolean {
    const digits = (value: string) => value.replace(/\D/g, '');
    const left = digits(a);
    const right = digits(b);
    if (!left || !right) return true;
    return left.slice(-6) === right.slice(-6) || left === right;
}

/** 문서 수준 확인(제목·사람 확인). 값 하나하나는 fieldIssues가 본다. */
function documentIssues(result: SupportedExtraction, context: ValidationContext): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const add = issueFactory(context.documentId, issues);

    const expected = result.documentType === 'KEAD_BIMANUAL' ? '양손협응' : '손기능';
    if (!result.detectedTitle.includes(expected)) {
        add('ERROR', 'TITLE_MISMATCH', '결과지 제목이 이 검사와 맞는지 확인해 주세요.', 'detectedTitle');
    }
    if (
        context.dominantHand &&
        context.dominantHand !== 'UNKNOWN' &&
        result.participant.dominantHand &&
        result.participant.dominantHand !== 'UNKNOWN' &&
        result.participant.dominantHand !== context.dominantHand
    ) {
        add('WARNING', 'DOMINANT_HAND_CONFLICT', '회차에서 판정한 우세손과 결과지의 우세손이 다릅니다.', 'participant.dominantHand');
    }
    if (context.birthDate && result.participant.birthDate && !sameBirthDate(context.birthDate, result.participant.birthDate)) {
        add('ERROR', 'POSSIBLE_DIFFERENT_PERSON', '이 이용자의 결과지가 아닐 수 있습니다(생년월일 불일치).', 'participant.birthDate');
    }
    return issues;
}

/** 결과지 자체의 앞뒤가 맞는지, 앱 기록과 어긋나지 않는지 본다. */
export function validateExtraction(result: SupportedExtraction, context: ValidationContext): ReviewIssue[] {
    return [...documentIssues(result, context), ...fieldIssues(flattenExtraction(result, context.session), result, context)];
}

function fieldIssues(fields: ReviewField[], result: SupportedExtraction, context: ValidationContext): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const add = issueFactory(context.documentId, issues);

    for (const field of fields) {
        if (
            field.status === 'MISSING' &&
            !field.path.includes('reportedAverage') &&
            !field.path.startsWith('norms.') &&
            !field.path.startsWith('bimanual.componentDenominators.')
        ) {
            add('ERROR', 'MISSING_REQUIRED_VALUE', `${field.label} 값을 확인하지 못했습니다.`, field.path);
        }
        if (field.comparison === 'CONFLICT') {
            add('WARNING', 'DIRECT_ENTRY_CONFLICT', `${field.label}: 앱 기록과 결과지 값이 다릅니다.`, field.path);
        }
        if (field.status !== 'REJECTED') {
            const limit = factValueIssue(field.path, field.extracted.value);
            if (limit) {
                add(
                    limit.severity,
                    limit.severity === 'ERROR'
                        ? 'VALUE_OUT_OF_RANGE'
                        : field.path.startsWith('bimanual.componentDenominators.')
                            ? 'SOURCE_CONFLICT'
                            : 'NORM_VALUE_SUSPECT',
                    `${field.label}: ${limit.message}`,
                    field.path,
                );
            }
        }
        if (typeof field.extracted.value === 'number' && field.originalExtracted.rawText && field.status !== 'CORRECTED') {
            const rawNumber = Number(field.originalExtracted.rawText.replace(/,/g, '').trim());
            if (Number.isFinite(rawNumber) && rawNumber !== field.extracted.value) {
                add('WARNING', 'RAW_NUMERIC_CONFLICT', `${field.label}: 원문 숫자와 읽은 숫자가 다릅니다.`, field.path);
            }
        }
    }

    const lookup = (path: string) => fields.find(field => field.path === path && field.status !== 'REJECTED')?.extracted.value;

    if (result.documentType === 'KEAD_HAND_FUNCTION') {
        for (const { size, hands } of HAND_CONDITIONS) {
            for (const hand of hands) {
                const values = [1, 2, 3].map(n => lookup(`trials.${size}.${hand}.${n}`));
                const average = lookup(`trials.${size}.${hand}.reportedAverage`);
                if (values.every(value => typeof value === 'number') && typeof average === 'number') {
                    const computed = (values as number[]).reduce((a, b) => a + b, 0) / 3;
                    if (Math.abs(computed - average) > 0.051) {
                        add(
                            'WARNING',
                            'AVERAGE_CONFLICT',
                            `${conditionLabel(size, hand)}: 결과지 표기 평균과 1~3회 계산값이 다릅니다.`,
                            `trials.${size}.${hand}.reportedAverage`,
                        );
                    }
                }
            }
        }
    }

    if (result.documentType === 'KEAD_BIMANUAL') {
        const componentValues = COMPONENT_KEYS.map(key => lookup(`bimanual.components.${key}`));
        const reported = lookup('bimanual.reportedTotalCompleted');
        if (
            componentValues.every(value => typeof value === 'number') &&
            typeof reported === 'number' &&
            (componentValues as number[]).reduce((a, b) => a + b, 0) !== reported
        ) {
            add(
                'WARNING',
                'SOURCE_CONFLICT',
                '부품별 수행량 합계와 결과지 표기 총 수행량이 다릅니다.',
                'bimanual.reportedTotalCompleted',
            );
        }
        const denominators = COMPONENT_KEYS.map(key => lookup(`bimanual.componentDenominators.${key}`));
        const tools = lookup('bimanual.reportedTotalTools');
        if (
            denominators.every(value => typeof value === 'number') &&
            typeof tools === 'number' &&
            (denominators as number[]).reduce((a, b) => a + b, 0) !== tools
        ) {
            add('WARNING', 'SOURCE_CONFLICT', '부품별 분모 합계와 결과지 표기 총 도구수가 다릅니다.', 'bimanual.reportedTotalTools');
        }
        const duration = lookup('bimanual.recordedDurationMs');
        if (typeof duration === 'string' && parseKoreanDuration(duration) === null) {
            add('ERROR', 'INVALID_DURATION', '완성소요시간 형식을 확인할 수 없습니다.', 'bimanual.recordedDurationMs');
        }
    }

    if (result.reportedSummary || result.evaluatorComment) {
        add('INFO', 'REPORTED_COMMENT', '결과지에 기존 소견 문장이 있습니다. 그대로 옮겨 쓸지 평가사가 정하세요.');
    }
    return issues;
}

/** 평가사가 값을 고친 뒤 상태와 대조 결과를 다시 계산한다. */
export function recalculateReviewFields(fields: ReviewField[]): ReviewField[] {
    return fields.map(field => {
        const comparable = normalizeReviewValue(field.path, field.extracted.value);
        const comparison =
            field.directValue === undefined || comparable === null
                ? 'NOT_AVAILABLE'
                : field.directValue === comparable
                  ? 'MATCHED'
                  : 'CONFLICT';
        return {
            ...field,
            status:
                field.status === 'REJECTED'
                    ? ('REJECTED' as const)
                    : field.extracted.value === null
                      ? ('MISSING' as const)
                      : field.extracted.value !== field.originalExtracted.value
                        ? ('CORRECTED' as const)
                        : field.status === 'VERIFIED'
                          ? ('VERIFIED' as const)
                          : ('EXTRACTED' as const),
            comparison,
        };
    });
}

/** 값을 고친 뒤 전체를 다시 본다. 이미 확인 처리한 문제는 그대로 남긴다. */
export function revalidateReview(
    result: SupportedExtraction,
    fields: ReviewField[],
    issues: ReviewIssue[],
    context: ValidationContext,
): { fields: ReviewField[]; issues: ReviewIssue[] } {
    const recalculated = recalculateReviewFields(fields);
    const next = [...documentIssues(result, context), ...fieldIssues(recalculated, result, context)];
    // 평가사가 이미 확인한 문제는 상태를 유지한다.
    const previous = new Map(issues.map(issue => [issue.id, issue]));
    return {
        fields: recalculated,
        issues: next.map(issue => {
            const before = previous.get(issue.id);
            return before && before.status !== 'OPEN' ? { ...issue, ...before, message: issue.message } : issue;
        }),
    };
}

export function issueActionPolicy(issue: ReviewIssue): 'BLOCKED' | 'FIELD_ACTION' | 'ACKNOWLEDGE' | 'STRONG_ACKNOWLEDGE' {
    if (issue.code === 'UNSUPPORTED_DOCUMENT') return 'BLOCKED';
    if (['MISSING_REQUIRED_VALUE', 'INVALID_DURATION', 'VALUE_OUT_OF_RANGE'].includes(issue.code)) return 'FIELD_ACTION';
    if (issue.code === 'POSSIBLE_DIFFERENT_PERSON') return 'STRONG_ACKNOWLEDGE';
    return 'ACKNOWLEDGE';
}

export function isBlockingIssue(issue: ReviewIssue): boolean {
    return issue.severity === 'ERROR' && issue.status === 'OPEN';
}

export function acknowledgeIssue(issue: ReviewIssue, input: { by: string; at: string; reason: string }): ReviewIssue {
    const policy = issueActionPolicy(issue);
    if (policy === 'BLOCKED' || policy === 'FIELD_ACTION') throw new Error('이 오류는 확인만으로 해제할 수 없습니다.');
    if (policy === 'STRONG_ACKNOWLEDGE' && !input.reason.trim()) throw new Error('같은 사람의 결과지가 맞는지 확인한 사유를 적어 주세요.');
    return {
        ...issue,
        status: 'ACKNOWLEDGED',
        resolutionType:
            policy === 'STRONG_ACKNOWLEDGE'
                ? 'IDENTITY_OVERRIDE'
                : issue.code === 'TITLE_MISMATCH'
                  ? 'DOCUMENT_TYPE_CONFIRMED'
                  : 'EVALUATOR_ACKNOWLEDGED',
        resolvedAt: input.at,
        resolvedBy: input.by,
        resolutionReason: input.reason,
    };
}
