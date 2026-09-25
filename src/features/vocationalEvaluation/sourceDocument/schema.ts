/**
 * AI가 돌려준 결과지 구조화 결과를 믿지 않고 검사한다(zod 대신 자체 검증).
 * 모양이 맞지 않으면 UNSUPPORTED_OR_UNKNOWN으로 떨어뜨려 평가사가 직접 입력하는 경로로 보낸다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import type { HandMode, PinSize } from '../model/types';
import type {
    ExtractedScalar,
    ExtractionMetadata,
    ExtractionResult,
    HandConditionExtraction,
    HandFunctionExtraction,
    NormExtraction,
    ParticipantExtraction,
} from './types';

export const VE_EXTRACTOR_VERSION = '1.0.0';
export const VE_EXTRACTION_SCHEMA_VERSION = '1.0.0';

const HAND_CONDITIONS: Array<{ size: PinSize; hands: HandMode[] }> = [
    { size: 'SMALL', hands: ['DOMINANT', 'NON_DOMINANT', 'BILATERAL'] },
    { size: 'MEDIUM', hands: ['DOMINANT', 'NON_DOMINANT'] },
    { size: 'LARGE', hands: ['DOMINANT', 'NON_DOMINANT'] },
];

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

function scalar(value: unknown): ExtractedScalar {
    const raw = (value ?? {}) as Partial<ExtractedScalar>;
    const numberOrText =
        typeof raw.value === 'number' && Number.isFinite(raw.value)
            ? raw.value
            : typeof raw.value === 'string' && raw.value.trim()
              ? raw.value.trim()
              : null;
    const page = typeof raw.pageNumber === 'number' && Number.isInteger(raw.pageNumber) && raw.pageNumber > 0 ? raw.pageNumber : null;
    return { value: numberOrText, rawText: text(raw.rawText), pageNumber: page, sourceLabel: text(raw.sourceLabel) };
}

function participant(value: unknown): ParticipantExtraction {
    const raw = (value ?? {}) as Record<string, unknown>;
    const hand = raw.dominantHand;
    return {
        sex: text(raw.sex),
        birthDate: text(raw.birthDate),
        age: typeof raw.age === 'number' && Number.isFinite(raw.age) ? raw.age : null,
        organization: text(raw.organization),
        disabilityType: text(raw.disabilityType),
        dominantHand:
            hand === 'RIGHT' || hand === 'LEFT' || hand === 'AMBIDEXTROUS' || hand === 'UNKNOWN' ? hand : null,
    };
}

function norms(value: unknown): NormExtraction[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => {
            const raw = (item ?? {}) as Record<string, unknown>;
            const path = text(raw.path);
            const label = text(raw.sourceLabel);
            if (!path || !label) return null;
            return { path, sourceLabel: label, sourceValue: scalar(raw.sourceValue) };
        })
        .filter((item): item is NormExtraction => item !== null);
}

function metadata(value: unknown, model: string): ExtractionMetadata {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
        extractorVersion: text(raw.extractorVersion) ?? VE_EXTRACTOR_VERSION,
        schemaVersion: text(raw.schemaVersion) ?? VE_EXTRACTION_SCHEMA_VERSION,
        model: text(raw.model) ?? model,
    };
}

function warnings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function condition(value: unknown): HandConditionExtraction {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
        trial1: scalar(raw.trial1),
        trial2: scalar(raw.trial2),
        trial3: scalar(raw.trial3),
        reportedAverage: scalar(raw.reportedAverage),
    };
}

/** 구조화 결과를 안전한 모양으로 맞춘다. 모르는 종류이면 UNSUPPORTED_OR_UNKNOWN. */
export function normalizeExtraction(value: unknown, model: string): ExtractionResult {
    const raw = (value ?? {}) as Record<string, unknown>;
    const type = raw.documentType;

    if (type === 'KEAD_HAND_FUNCTION') {
        const trialsRaw = (raw.trials ?? {}) as Record<string, Record<string, unknown>>;
        const trials = {} as HandFunctionExtraction['trials'];
        for (const { size, hands } of HAND_CONDITIONS) {
            const bySize: Partial<Record<HandMode, HandConditionExtraction>> = {};
            for (const hand of hands) bySize[hand] = condition(trialsRaw?.[size]?.[hand]);
            trials[size] = bySize;
        }
        return {
            documentType: 'KEAD_HAND_FUNCTION',
            detectedTitle: text(raw.detectedTitle) ?? '',
            participant: participant(raw.participant),
            // 평가사 이름은 읽지 않는다. 요청 문구 규칙 2와 같은 뜻이며, 모델이 넣어 보내도 여기서 버린다.
            test: { testDate: text((raw.test as Record<string, unknown>)?.testDate) },
            trials,
            norms: norms(raw.norms),
            reportedSummary: text(raw.reportedSummary),
            evaluatorComment: text(raw.evaluatorComment),
            warnings: warnings(raw.warnings),
            extractionMetadata: metadata(raw.extractionMetadata, model),
        };
    }

    if (type === 'KEAD_BIMANUAL') {
        const performanceRaw = (raw.performance ?? {}) as Record<string, unknown>;
        const componentsRaw = (performanceRaw.components ?? {}) as Record<string, unknown>;
        const denominatorsRaw = (performanceRaw.componentDenominators ?? {}) as Record<string, unknown>;
        const components: Record<string, ExtractedScalar> = {};
        const componentDenominators: Record<string, ExtractedScalar> = {};
        for (const key of COMPONENT_KEYS) {
            components[key] = scalar(componentsRaw[key]);
            componentDenominators[key] = scalar(denominatorsRaw[key]);
        }
        return {
            documentType: 'KEAD_BIMANUAL',
            detectedTitle: text(raw.detectedTitle) ?? '',
            participant: participant(raw.participant),
            // 평가사 이름은 읽지 않는다. 요청 문구 규칙 2와 같은 뜻이며, 모델이 넣어 보내도 여기서 버린다.
            test: { testDate: text((raw.test as Record<string, unknown>)?.testDate) },
            performance: {
                recordedDuration: scalar(performanceRaw.recordedDuration),
                components,
                componentDenominators,
                reportedTotalCompleted: scalar(performanceRaw.reportedTotalCompleted),
                reportedTotalTools: scalar(performanceRaw.reportedTotalTools),
            },
            norms: norms(raw.norms),
            reportedSummary: text(raw.reportedSummary),
            evaluatorComment: text(raw.evaluatorComment),
            warnings: warnings(raw.warnings),
            extractionMetadata: metadata(raw.extractionMetadata, model),
        };
    }

    return {
        documentType: 'UNSUPPORTED_OR_UNKNOWN',
        detectedTitle: text(raw.detectedTitle),
        warnings: warnings(raw.warnings),
        extractionMetadata: metadata(raw.extractionMetadata, model),
    };
}

/** AI 응답에서 JSON을 꺼낸다. 코드 펜스와 앞뒤 설명을 견딘다. */
export function parseExtractionJson(responseText: string, model: string): ExtractionResult | null {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(responseText);
    const candidates = [fenced?.[1], responseText].filter((item): item is string => Boolean(item));
    for (const candidate of candidates) {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            return normalizeExtraction(JSON.parse(candidate.slice(start, end + 1)), model);
        } catch {
            // 다음 후보로 넘어간다.
        }
    }
    return null;
}
