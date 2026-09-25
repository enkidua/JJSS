/**
 * 평가 회차(Episode). 한 사람에 대한 한 번의 직업평가 전체를 묶는다.
 * caseDocuments에 type 've_episode' 문서 하나로 저장한다(계획서 §6).
 */
import { createDominantHandAssessment, resolveDominantHand, type DominantHandAssessment } from '../dominantHand';
import { createId } from '../ids';
import { normalizeInterpretationRun, type InterpretationRun } from '../interpretation/run';
import type { DominantHand, EpisodeStatus, EvaluationVenue, ISODateTime } from './types';

export const VE_EPISODE_VERSION = 1 as const;

/** 기관 보고서 서식의 "욕구" 체크 항목 */
export const EPISODE_NEED_KEYS = [
    'interest',
    'aptitude',
    'behavior',
    'jobSeeking',
    'adaptation',
    'emotion',
] as const;

export type EpisodeNeedKey = (typeof EPISODE_NEED_KEYS)[number];

export const EPISODE_NEED_LABELS: Record<EpisodeNeedKey, string> = {
    interest: '직업흥미',
    aptitude: '직업적성',
    behavior: '행동',
    jobSeeking: '구직욕구',
    adaptation: '적응수준',
    emotion: '정서',
};

export interface EvaluationEpisode {
    version: number;
    id: string;
    seekerId: string;
    seekerName: string;
    title: string;
    status: EpisodeStatus;
    /** 평가목적 */
    purpose: string;
    /** 의뢰요청기관 */
    referralOrganization: string;
    /** 평가실시기관 */
    evaluationOrganization: string;
    venue: EvaluationVenue;
    /** YYYY-MM-DD */
    evaluationDate: string;
    evaluator: string;
    needs: Record<EpisodeNeedKey, boolean>;
    dominantHandAssessment: DominantHandAssessment;
    /** 판정 결과를 저장해 둔다(판정 로직이 바뀌어도 과거 회차의 기록이 흔들리지 않게). */
    dominantHand: DominantHand;
    sessionIds: string[];
    sourceDocumentIds: string[];
    reportIds: string[];
    /** 해석 실행 기록(AI 제안과 평가사의 채택·수정·제외) */
    interpretations: InterpretationRun[];
    note: string;
    createdAt?: ISODateTime;
    updatedAt?: ISODateTime;
}

function emptyNeeds(): Record<EpisodeNeedKey, boolean> {
    return EPISODE_NEED_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: false }),
        {} as Record<EpisodeNeedKey, boolean>,
    );
}

export function createEpisode(input: {
    seekerId: string;
    seekerName: string;
    title?: string;
    evaluationDate: string;
    evaluationOrganization?: string;
}): EvaluationEpisode {
    return {
        version: VE_EPISODE_VERSION,
        id: createId('veepisode'),
        seekerId: input.seekerId,
        seekerName: input.seekerName,
        title: input.title?.trim() || '직업평가',
        status: 'DRAFT',
        purpose: '',
        referralOrganization: '',
        evaluationOrganization: input.evaluationOrganization ?? '',
        venue: 'IN_HOUSE',
        evaluationDate: input.evaluationDate,
        evaluator: '',
        needs: emptyNeeds(),
        dominantHandAssessment: createDominantHandAssessment(),
        dominantHand: 'UNKNOWN',
        sessionIds: [],
        sourceDocumentIds: [],
        reportIds: [],
        interpretations: [],
        note: '',
    };
}

const STATUSES: EpisodeStatus[] = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ARCHIVED'];
const VENUES: EvaluationVenue[] = ['IN_HOUSE', 'OUTREACH'];
const HANDS: DominantHand[] = ['RIGHT', 'LEFT', 'AMBIDEXTROUS', 'UNKNOWN'];

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const idList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];

function normalizeHandAnswers(value: unknown): Record<string, 'RIGHT' | 'LEFT' | 'EITHER' | null> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, 'RIGHT' | 'LEFT' | 'EITHER' | null> = {};
    for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
        if (answer === 'RIGHT' || answer === 'LEFT' || answer === 'EITHER') result[key] = answer;
    }
    return result;
}

function normalizeAssessment(value: unknown): DominantHandAssessment {
    const raw = (value ?? {}) as Partial<DominantHandAssessment>;
    const override = HANDS.includes(raw.override as DominantHand) ? (raw.override as DominantHand) : undefined;
    return {
        questions: normalizeHandAnswers(raw.questions),
        form: normalizeHandAnswers(raw.form),
        ...(override ? { override } : {}),
        note: text(raw.note),
    };
}

/** 저장 전 정리. 모르는 값은 기본값으로 돌리고, 우세손 판정 결과를 다시 계산해 맞춘다. */
export function normalizeEpisode(value: EvaluationEpisode): EvaluationEpisode {
    const assessment = normalizeAssessment(value.dominantHandAssessment);
    const resolved = resolveDominantHand(assessment);
    const needs = EPISODE_NEED_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: Boolean(value.needs?.[key]) }),
        {} as Record<EpisodeNeedKey, boolean>,
    );
    return {
        version: VE_EPISODE_VERSION,
        id: value.id,
        seekerId: text(value.seekerId),
        seekerName: text(value.seekerName),
        title: text(value.title).trim() || '직업평가',
        status: STATUSES.includes(value.status) ? value.status : 'DRAFT',
        purpose: text(value.purpose),
        referralOrganization: text(value.referralOrganization),
        evaluationOrganization: text(value.evaluationOrganization),
        venue: VENUES.includes(value.venue) ? value.venue : 'IN_HOUSE',
        evaluationDate: text(value.evaluationDate),
        evaluator: text(value.evaluator),
        needs,
        dominantHandAssessment: assessment,
        dominantHand: resolved.hand,
        sessionIds: idList(value.sessionIds),
        sourceDocumentIds: idList(value.sourceDocumentIds),
        reportIds: idList(value.reportIds),
        interpretations: (Array.isArray(value.interpretations) ? value.interpretations : [])
            .map(normalizeInterpretationRun)
            .filter((run): run is InterpretationRun => run !== null),
        note: text(value.note),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}

export function serializeEpisode(value: EvaluationEpisode): string {
    return JSON.stringify(normalizeEpisode(value));
}

export type ParseEpisodeResult =
    | { ok: true; episode: EvaluationEpisode }
    | { ok: false; error: string };

export function parseEpisode(content: string): ParseEpisodeResult {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return { ok: false, error: 'JSON 형식이 아닙니다.' };
    }
    if (!raw || typeof raw !== 'object') return { ok: false, error: '내용이 비어 있습니다.' };
    const candidate = raw as EvaluationEpisode;
    if (typeof candidate.id !== 'string' || !candidate.id) return { ok: false, error: '회차 ID가 없습니다.' };
    return { ok: true, episode: normalizeEpisode(candidate) };
}
