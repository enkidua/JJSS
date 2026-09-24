import type { CaseDocument } from '../types/caseDocument';
import type { Seeker } from '../types/matching';
import {
    caseDocumentDate, getTaskTiming, parseRehabWorkflow,
    type FollowUpTask, type RehabWorkflowData,
} from './rehabWorkflow';

// 직업재활 현황판의 순수 계산 함수 모음. 화면(React)에 의존하지 않으며 scripts/test-rehab-workflow.mjs에서 검증합니다.

export interface TrainingState {
    rooms?: Array<{ name: string; program?: string; trainees?: Array<{ id: string; seekerId?: string }> }>;
    trainingRecords?: Record<string, {
        plan?: string; evaluation?: string; counselingHistory?: string[];
        trainingPeriod?: string; counselingDate?: string;
    }>;
    attendanceBook?: Record<string, Record<string, string>>;
}

export interface TrainingOverview {
    room: string;
    program: string;
    counselingCount: number;
    hasPlan: boolean;
    hasEvaluation: boolean;
    lastAttendanceDate: string;
    lastAttendanceStatus: string;
    /** 훈련생별 입력 메모의 훈련기간(없으면 빈 문자열) */
    trainingPeriod: string;
    /** 실제로 체크된 날만으로 계산한 출석률(%). 기록이 없으면 null */
    attendanceRate: number | null;
    attendanceDays: number;
    /** 상담 기록 본문 또는 상담일 메모에서 읽은 가장 최근 날짜 */
    lastCounselingDate: string;
    /** 훈련계획 첫 2줄 */
    planSummary: string[];
    counselingHistory: string[];
}

const PRESENT_STATUSES = ['출석', '지각', '조퇴'];
const ABSENT_STATUS = '결석';

/** 본문에서 'YYYY-MM-DD' / 'YYYY.M.D' / 'YYYY년 M월 D일' 형태의 날짜를 찾아 가장 늦은 날짜를 돌려줍니다. */
export function extractLatestDateKey(text: string): string {
    const pattern = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
    let latest = '';
    for (const match of text.matchAll(pattern)) {
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;
        const key = `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (key > latest) latest = key;
    }
    return latest;
}

/** 비어 있지 않은 앞쪽 n줄 */
export function firstLines(text: string, count: number): string[] {
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, count);
}

export function getTrainingOverview(seeker: Seeker, state?: TrainingState): TrainingOverview | null {
    const keys = new Set([seeker.id, seeker.seekerId].filter(Boolean));
    const matches = state?.rooms?.flatMap(room => (room.trainees || [])
        .filter(trainee => trainee.seekerId && keys.has(trainee.seekerId))
        .map(trainee => ({ room, trainee }))) || [];
    const match = matches[0];
    if (!match) return null;
    const record = state?.trainingRecords?.[match.trainee.id];
    const attendanceDates = Object.keys(state?.attendanceBook || {})
        .filter(date => state?.attendanceBook?.[date]?.[match.trainee.id])
        .sort();
    const lastAttendanceDate = attendanceDates[attendanceDates.length - 1] || '';
    let present = 0;
    let total = 0;
    for (const date of attendanceDates) {
        const status = state?.attendanceBook?.[date]?.[match.trainee.id] || '';
        if (PRESENT_STATUSES.includes(status)) { present += 1; total += 1; } else if (status === ABSENT_STATUS) total += 1;
    }
    const history = record?.counselingHistory || [];
    const historyDates = history.map(extractLatestDateKey).filter(Boolean).sort();
    return {
        room: match.room.name,
        program: match.room.program || '',
        counselingCount: history.length,
        hasPlan: !!record?.plan,
        hasEvaluation: !!record?.evaluation,
        lastAttendanceDate,
        lastAttendanceStatus: lastAttendanceDate ? state?.attendanceBook?.[lastAttendanceDate]?.[match.trainee.id] || '' : '',
        trainingPeriod: record?.trainingPeriod?.trim() || '',
        attendanceRate: total ? Math.round((present / total) * 100) : null,
        attendanceDays: total,
        lastCounselingDate: historyDates[historyDates.length - 1] || record?.counselingDate?.trim() || '',
        planSummary: firstLines(record?.plan || '', 2),
        counselingHistory: history,
    };
}

export interface DueFollowUp {
    seekerId: string;
    seekerName: string;
    task: FollowUpTask;
    timing: ReturnType<typeof getTaskTiming>;
}

export interface DueFollowUpResult {
    items: DueFollowUp[];
    /** 형식을 읽을 수 없어 일정에서 빠진 이용자 현황 기록 수(등록된 이용자 기록만 셉니다) */
    unreadable: number;
}

export function getDueFollowUps(docs: CaseDocument[], seekers: Seeker[], today: string): DueFollowUpResult {
    const due: DueFollowUp[] = [];
    let unreadable = 0;
    for (const doc of docs) {
        if (doc.type !== 'workflow') continue;
        const seeker = seekers.find(item => item.id && (item.id === doc.seekerId || item.seekerId === doc.seekerId));
        if (!seeker?.id) continue;
        const workflow = parseRehabWorkflow(doc.content);
        if (!workflow) {
            unreadable += 1;
            continue;
        }
        for (const task of workflow.tasks) {
            const timing = getTaskTiming(task.dueDate, today);
            if (!task.done && timing !== 'later') due.push({ seekerId: seeker.id, seekerName: seeker.name, task, timing });
        }
    }
    const items = due.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate)
        || a.seekerName.localeCompare(b.seekerName));
    return { items, unreadable };
}

// ─── 지원고용 회차(계획 D) ───

/** 지원고용 회차 문서(type 'supported_employment')의 형식. 전체 계산은 src/features/supportedEmployment가 합니다. */
export const SUPPORTED_EMPLOYMENT_TYPE = 'supported_employment';

export interface SupportedEmploymentMeta {
    round: number;
    status: string;
    completed: boolean;
    employed: boolean;
}

/** 회차 JSON에서 목록·단계 판정에 필요한 값만 읽습니다. 읽을 수 없으면 null(예외 없음). */
export function readSupportedEmploymentMeta(content: string | null | undefined): SupportedEmploymentMeta | null {
    if (typeof content !== 'string' || !content.trim()) return null;
    try {
        const raw = JSON.parse(content) as Record<string, unknown> | null;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !(Number(raw.version) >= 1)) return null;
        const result = raw.result && typeof raw.result === 'object' ? raw.result as Record<string, unknown> : {};
        const status = typeof raw.status === 'string' ? raw.status : '진행중';
        const round = Number(raw.round);
        return {
            round: Number.isFinite(round) && round > 0 ? Math.floor(round) : 0,
            status,
            completed: result.completed === true || status === '수료' || status === '취업',
            employed: result.employed === true || status === '취업',
        };
    } catch {
        return null;
    }
}

/** 타임라인·이력 목록 표시용 이름(원문 JSON을 보여 주지 않습니다) */
export function supportedEmploymentLabel(doc: Pick<CaseDocument, 'content' | 'title'>): string {
    const round = readSupportedEmploymentMeta(doc.content)?.round || Number(/(\d+)\s*차/.exec(doc.title || '')?.[1] || 0);
    return round ? `지원고용 ${round}차 결과보고` : '지원고용 결과보고';
}

/** 현황판 고용지원 카드에 보이는 가장 최근 회차 요약(화면에서 계산해 넘깁니다) */
export interface SupportedEmploymentOverview {
    caseId: string;
    round: number;
    status: string;
    /** 오늘까지 지난 현장훈련일 */
    fieldDoneDays: number;
    fieldTotalDays: number;
    /** 예정 지급액 합계(원) */
    plannedTotal: number;
    completed: boolean;
    employed: boolean;
}

const formatWonText = (value: number) => String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "지원고용 14차 · 진행중 · 현장 12/15일 · 예정 지급액 1,250,100원" */
export function formatSupportedEmploymentLine(overview: SupportedEmploymentOverview): string {
    return [
        overview.round ? `지원고용 ${overview.round}차` : '지원고용',
        overview.status,
        `현장 ${overview.fieldDoneDays}/${overview.fieldTotalDays}일`,
        `예정 지급액 ${formatWonText(overview.plannedTotal)}원`,
    ].join(' · ');
}

/** 진행중 회차가 있는 이용자 수(같은 이용자의 여러 회차는 한 명) */
export function countActiveSupportedEmployment(docs: ReadonlyArray<Pick<CaseDocument, 'type' | 'content' | 'seekerId' | 'id'>>): number {
    const keys = new Set<string>();
    docs.forEach((doc, index) => {
        if (doc.type !== SUPPORTED_EMPLOYMENT_TYPE) return;
        if (readSupportedEmploymentMeta(doc.content)?.status === '진행중') keys.add(doc.seekerId || doc.id || `doc-${index}`);
    });
    return keys.size;
}

// ─── 전체 일정판 요약 ───

export interface DueBoardSummary {
    registered: number;
    inTraining: number;
    /** 지원고용 진행중 회차가 있는 이용자 수 */
    supportedEmployment: number;
    dueThisWeek: number;
}

export function getDueBoardSummary(
    seekers: Seeker[], workflowDocs: CaseDocument[], training: TrainingState | undefined, today: string,
    supportedEmploymentDocs: CaseDocument[] = [],
): DueBoardSummary {
    const traineeKeys = new Set((training?.rooms || []).flatMap(room => (room.trainees || [])
        .map(trainee => trainee.seekerId).filter((key): key is string => !!key)));
    const inTraining = seekers.filter(seeker => [seeker.id, seeker.seekerId].some(key => key && traineeKeys.has(key))).length;
    const due = getDueFollowUps(workflowDocs, seekers, today).items;
    return {
        registered: seekers.length,
        inTraining,
        supportedEmployment: countActiveSupportedEmployment(supportedEmploymentDocs),
        dueThisWeek: due.filter(item => item.timing === 'today' || item.timing === 'upcoming').length,
    };
}

// ─── 단계 판정 ───

export const REHAB_STAGES = ['평가', '훈련', '지원고용', '취업', '적응지원'] as const;
export type RehabStage = typeof REHAB_STAGES[number];

const EMPLOYMENT_DOC_TYPES: CaseDocument['type'][] = ['matching_opinion', 'employment_matching', 'interview_note', 'employment_interview_note'];

export interface StageInput {
    seekerStatus?: string;
    documents: Array<Pick<CaseDocument, 'type'>>;
    workflow: Pick<RehabWorkflowData, 'employmentChecks' | 'jobComparisons'>;
    training: { room: string } | null;
    /** 지원고용 회차가 진행 중이면 true(이전 호출 호환) */
    supportedEmploymentActive?: boolean;
    /** 가장 최근 지원고용 회차 요약. 진행중이면 '지원고용', 취업으로 끝났으면 '취업' */
    supportedEmployment?: Pick<SupportedEmploymentOverview, 'status' | 'employed'> | null;
}

/** 문서·기록 존재 여부로 현재 단계를 판정합니다. 뒤 단계 근거가 있으면 뒤 단계를 우선합니다. */
export function deriveStage(input: StageInput): RehabStage {
    if (input.workflow.employmentChecks.length > 0) return '적응지원';
    const status = input.seekerStatus || '';
    if (status.includes('취업') && !status.includes('구직')) return '취업';
    const supported = input.supportedEmployment;
    if (supported?.employed) return '취업';
    if (input.supportedEmploymentActive || supported?.status === '진행중' || input.workflow.jobComparisons.length > 0
        || input.documents.some(doc => EMPLOYMENT_DOC_TYPES.includes(doc.type))) return '지원고용';
    if (input.training) return '훈련';
    return '평가';
}

// ─── 상태 카드 요약 ───

export interface EvaluationSummary {
    lastDate: string;
    documentCount: number;
    /** 가장 최근 문서의 첫 2줄 */
    lastOpinion: string[];
}

const EVALUATION_DOC_TYPES: CaseDocument['type'][] = ['evaluation', 'vocational_evaluation'];

function sortNewest(docs: CaseDocument[]): CaseDocument[] {
    return [...docs].sort((a, b) => caseDocumentDate(b).localeCompare(caseDocumentDate(a)));
}

export function getEvaluationSummary(documents: CaseDocument[]): EvaluationSummary {
    const docs = sortNewest(documents.filter(doc => EVALUATION_DOC_TYPES.includes(doc.type)));
    const latest = docs[0];
    return {
        lastDate: latest ? caseDocumentDate(latest) : '',
        documentCount: docs.length,
        lastOpinion: latest ? firstLines(latest.content, 2) : [],
    };
}

export interface EmploymentSummary {
    /** 가장 최근 지원고용 회차(없으면 null) */
    supportedEmployment: SupportedEmploymentOverview | null;
    matchingCount: number;
    interviewCount: number;
    comparisonCount: number;
    lastCheckDate: string;
    checkCount: number;
}

export function getEmploymentSummary(
    documents: CaseDocument[], workflow: RehabWorkflowData, supportedEmployment: SupportedEmploymentOverview | null = null,
): EmploymentSummary {
    const checkDates = workflow.employmentChecks.map(entry => entry.date).sort();
    return {
        supportedEmployment,
        matchingCount: documents.filter(doc => doc.type === 'matching_opinion' || doc.type === 'employment_matching').length,
        interviewCount: documents.filter(doc => doc.type === 'interview_note' || doc.type === 'employment_interview_note').length,
        comparisonCount: workflow.jobComparisons.length,
        lastCheckDate: checkDates[checkDates.length - 1] || '',
        checkCount: workflow.employmentChecks.length,
    };
}

// ─── 다음 할 일 ───

export interface NextAction {
    task: FollowUpTask;
    timing: 'overdue' | 'today' | 'upcoming';
}

export function getNextActions(tasks: FollowUpTask[], today: string): NextAction[] {
    return tasks.filter(task => !task.done)
        .map(task => ({ task, timing: getTaskTiming(task.dueDate, today) }))
        .filter((item): item is NextAction => item.timing !== 'later')
        .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
}

// ─── 타임라인 ───

export type TimelineKind = 'meeting' | 'plan' | 'counseling' | 'evaluation' | 'matching' | 'interview'
    | 'job_analysis' | 'review' | 'vocational_evaluation' | 'training_counseling' | 'employment_check' | 'job_comparison'
    | 'supported_employment' | 'other';

export interface TimelineTarget {
    path: '/workmate' | '/training' | '/evaluation';
    state: { seekerId: string; seekerName: string; tab?: string; step?: string; documentId?: string };
}

export interface TimelineEntry {
    id: string;
    date: string;
    kind: TimelineKind;
    label: string;
    summary: string;
    target: TimelineTarget;
}

export const TIMELINE_LABELS: Record<TimelineKind, string> = {
    meeting: '사례회의록', plan: '직업재활계획서', counseling: '상담일지', evaluation: '정기평가',
    matching: '매칭 의견', interview: '면접일지', job_analysis: '직무분석지', review: '작성 내용 점검',
    vocational_evaluation: '직업평가 문서', training_counseling: '훈련 상담', employment_check: '적응지원 점검',
    job_comparison: '직무 비교', supported_employment: '지원고용', other: '업무 문서',
};

function documentKind(type: CaseDocument['type']): TimelineKind {
    switch (type) {
        case 'meeting': case 'plan': case 'counseling': case 'evaluation': case 'job_analysis': case 'vocational_evaluation': return type;
        case 'matching_opinion': case 'employment_matching': return 'matching';
        case 'interview_note': case 'employment_interview_note': return 'interview';
        case 'document_review': return 'review';
        case 'supported_employment': return 'supported_employment';
        default: return 'other';
    }
}

function documentTarget(kind: TimelineKind, base: TimelineTarget['state'], documentId?: string): TimelineTarget {
    const state = { ...base, ...(documentId ? { documentId } : {}) };
    switch (kind) {
        case 'meeting': case 'plan': return { path: '/workmate', state: { ...state, tab: 'pipeline', step: kind } };
        case 'counseling': case 'evaluation': return { path: '/workmate', state: { ...state, tab: 'pipeline', step: kind } };
        case 'matching': case 'job_comparison': return { path: '/workmate', state: { ...state, tab: 'matching' } };
        case 'interview': return { path: '/workmate', state: { ...state, tab: 'interview' } };
        case 'job_analysis': return { path: '/workmate', state: { ...state, tab: 'jobAnalysis' } };
        case 'review': return { path: '/workmate', state: { ...state, tab: 'review' } };
        case 'vocational_evaluation': return { path: '/evaluation', state };
        case 'training_counseling': return { path: '/training', state };
        case 'employment_check': return { path: '/workmate', state: { ...state, tab: 'adaptation' } };
        case 'supported_employment': return { path: '/workmate', state: { ...state, tab: 'supportedEmployment' } };
        default: return { path: '/workmate', state: { ...state, tab: 'pipeline' } };
    }
}

/** 사례문서 + 훈련 상담 기록 + 적응지원 점검 + 직무 비교를 날짜 역순으로 합칩니다. */
export function buildTimeline(
    documents: CaseDocument[], workflow: RehabWorkflowData, training: TrainingOverview | null,
    seeker: Pick<Seeker, 'id' | 'seekerId' | 'name'>,
): TimelineEntry[] {
    const base: TimelineTarget['state'] = { seekerId: seeker.id || seeker.seekerId || '', seekerName: seeker.name };
    const entries: TimelineEntry[] = documents.filter(doc => doc.type !== 'workflow').map((doc, index) => {
        const kind = documentKind(doc.type);
        return {
            id: doc.id || `doc-${index}`, date: caseDocumentDate(doc), kind, label: TIMELINE_LABELS[kind],
            // 지원고용 회차는 내용이 JSON이므로 원문 대신 "지원고용 N차 결과보고"로 표시합니다.
            summary: kind === 'supported_employment' ? supportedEmploymentLabel(doc) : doc.title || firstLines(doc.content, 1)[0] || '',
            target: documentTarget(kind, base, doc.id),
        };
    });
    (training?.counselingHistory || []).forEach((text, index) => entries.push({
        id: `training-counseling-${index}`, date: extractLatestDateKey(text), kind: 'training_counseling',
        label: TIMELINE_LABELS.training_counseling, summary: firstLines(text, 1)[0] || '',
        target: documentTarget('training_counseling', base),
    }));
    workflow.employmentChecks.forEach(entry => entries.push({
        id: `check-${entry.id}`, date: entry.date, kind: 'employment_check', label: TIMELINE_LABELS.employment_check,
        summary: entry.retention || entry.adaptation || entry.supportAction || '', target: documentTarget('employment_check', base),
    }));
    workflow.jobComparisons.forEach(entry => entries.push({
        id: `comparison-${entry.id}`, date: entry.date, kind: 'job_comparison', label: TIMELINE_LABELS.job_comparison,
        summary: entry.jobLabel, target: documentTarget('job_comparison', base),
    }));
    return entries.sort((a, b) => b.date.localeCompare(a.date));
}

// ─── AI 요약 초안 입력 ───

export interface SituationSummaryInput {
    stage: RehabStage;
    disabilityType?: string;
    evaluation: EvaluationSummary;
    training: TrainingOverview | null;
    employment: EmploymentSummary;
    nextActions: NextAction[];
    goals: RehabWorkflowData['goals'];
}

/**
 * "현재 상황 정리" AI 초안 요청 본문. 이름·연락처는 넣지 않고 "이용자"로만 부릅니다.
 * (전송 직전에 generateText가 한 번 더 비식별화합니다.)
 */
export function buildSituationSummaryPrompt(input: SituationSummaryInput): string {
    const lines = [
        '아래는 직업재활 담당자가 한 이용자의 현재 상황을 정리하기 위한 기록 요약입니다.',
        '기록에 있는 내용만 사용해 담당자가 그대로 쓸 수 있는 한 문단(4~6문장)의 상황 정리를 작성해 주세요. 추정하거나 없는 사실을 만들지 마세요.',
        '',
        `[현재 단계] ${input.stage}`,
        `[장애유형] ${input.disabilityType || '미기록'}`,
        `[직업평가] 문서 ${input.evaluation.documentCount}건, 최근 ${input.evaluation.lastDate || '기록 없음'}`,
        ...input.evaluation.lastOpinion.map(line => `  - ${line}`),
        input.training
            ? `[직업훈련] ${input.training.room}${input.training.program ? ` · ${input.training.program}` : ''}, 훈련기간 ${input.training.trainingPeriod || '미기록'}, 출석률 ${input.training.attendanceRate === null ? '기록 없음' : `${input.training.attendanceRate}%`}, 훈련 상담 ${input.training.counselingCount}건`
            : '[직업훈련] 배정 기록 없음',
        ...(input.training?.planSummary || []).map(line => `  - ${line}`),
        ...(input.employment.supportedEmployment ? [`[지원고용] ${formatSupportedEmploymentLine(input.employment.supportedEmployment)}`] : []),
        `[고용지원] 매칭 의견 ${input.employment.matchingCount}건, 면접일지 ${input.employment.interviewCount}건, 직무 비교 ${input.employment.comparisonCount}건, 적응지원 점검 ${input.employment.checkCount}건${input.employment.lastCheckDate ? ` (최근 ${input.employment.lastCheckDate})` : ''}`,
        `[다음 할 일] ${input.nextActions.length === 0 ? '없음' : ''}`,
        ...input.nextActions.map(item => `  - ${item.task.dueDate} ${item.task.title}`),
        `[목표] ${input.goals.length === 0 ? '없음' : ''}`,
        ...input.goals.map(goal => {
            const latest = [...goal.checkIns].sort((a, b) => b.date.localeCompare(a.date))[0];
            return `  - ${goal.title}: 출발점 ${goal.baseline} → 목표 ${goal.target}${latest ? ` (최근 ${latest.date}: ${latest.currentLevel || latest.note})` : ''}`;
        }),
    ];
    return lines.join('\n');
}
