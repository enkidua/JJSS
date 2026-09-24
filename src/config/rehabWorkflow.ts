import { localDateKey } from '../utils/date';

export interface FollowUpTask {
    id: string;
    title: string;
    dueDate: string;
    done: boolean;
    category?: 'counseling' | 'reevaluation' | 'employment' | 'other';
}

export interface GoalCheckIn {
    id: string;
    date: string;
    note: string;
    currentLevel?: string;
}

export interface RehabGoal {
    id: string;
    title: string;
    baseline: string;
    target: string;
    checkIns: GoalCheckIn[];
    sourceDocumentId?: string;
}

export interface EmploymentCheck {
    id: string;
    date: string;
    retention: string;
    commute: string;
    adaptation: string;
    satisfaction: string;
    employerOpinion: string;
    supportAction: string;
    outcome: string;
    nextDate?: string;
}

export interface JobComparison {
    id: string;
    date: string;
    jobId: string;
    jobLabel: string;
    jobSnapshot: Record<'role' | 'hours' | 'commute' | 'environment' | 'preferences', string>;
    supportNeeds: Record<'role' | 'hours' | 'commute' | 'environment' | 'preferences', string>;
    adjustment: string;
}

export interface ParticipantPlan {
    plainSummary: string;
    desiredGoal: string;
    ownAction: string;
    supportRequest: string;
    revisionRequest: string;
    reviewStatus: 'not_reviewed' | 'discussed' | 'agreed' | 'changes_requested';
    reviewedAt: string;
    reviewMethod: string;
}

/** 현황판에서만 쓰는 담당자 메모 한 개. 저장 시각은 ISO 문자열. */
export interface SituationNote {
    text: string;
    updatedAt: string;
}

export interface RehabWorkflowData {
    version: 1;
    tasks: FollowUpTask[];
    goals: RehabGoal[];
    employmentChecks: EmploymentCheck[];
    jobComparisons: JobComparison[];
    participantPlan: ParticipantPlan;
    /** 없으면 메모를 아직 쓰지 않은 것입니다(이전 기록 호환). */
    situationNote?: SituationNote;
}

export const EMPTY_PARTICIPANT_PLAN: ParticipantPlan = {
    plainSummary: '', desiredGoal: '', ownAction: '', supportRequest: '', revisionRequest: '',
    reviewStatus: 'not_reviewed', reviewedAt: '', reviewMethod: '',
};

export const EMPTY_REHAB_WORKFLOW: RehabWorkflowData = {
    version: 1, tasks: [], goals: [], employmentChecks: [], jobComparisons: [],
    participantPlan: EMPTY_PARTICIPANT_PLAN,
};

const isText = (value: unknown): value is string => typeof value === 'string';
const isDate = (value: unknown): value is string => {
    if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};
const isOptionalText = (value: unknown): value is string | undefined => value === undefined || isText(value);
const isOptionalDate = (value: unknown): value is string | undefined => value === undefined || value === '' || isDate(value);
const categories = ['counseling', 'reevaluation', 'employment', 'other'];
const comparisonKeys = ['role', 'hours', 'commute', 'environment', 'preferences'] as const;
const reviewStatuses = ['not_reviewed', 'discussed', 'agreed', 'changes_requested'];

/** 손상된 기록을 빈 기록으로 간주해 덮어쓰지 않도록 null을 반환합니다. */
export function parseRehabWorkflow(content: string): RehabWorkflowData | null {
    try {
        const value = JSON.parse(content);
        if (!value || value.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.goals)) return null;
        const tasks = value.tasks.map((task: FollowUpTask) => {
            if (!task || !isText(task.id) || !isText(task.title) || !isDate(task.dueDate) || typeof task.done !== 'boolean'
                || task.category !== undefined && !categories.includes(task.category)) throw new Error('Invalid task');
            return { id: task.id, title: task.title, dueDate: task.dueDate, done: task.done,
                ...(task.category ? { category: task.category } : {}) };
        });
        const goals = value.goals.map((goal: RehabGoal) => {
            if (!goal || !isText(goal.id) || !isText(goal.title) || !isText(goal.baseline) || !isText(goal.target)
                || !Array.isArray(goal.checkIns) || !isOptionalText(goal.sourceDocumentId)) throw new Error('Invalid goal');
            const checkIns = goal.checkIns.map((entry: GoalCheckIn) => {
                if (!entry || !isText(entry.id) || !isDate(entry.date) || !isText(entry.note) || !isOptionalText(entry.currentLevel)) throw new Error('Invalid check-in');
                return { id: entry.id, date: entry.date, note: entry.note,
                    ...(entry.currentLevel ? { currentLevel: entry.currentLevel } : {}) };
            });
            return { id: goal.id, title: goal.title, baseline: goal.baseline, target: goal.target, checkIns,
                ...(goal.sourceDocumentId ? { sourceDocumentId: goal.sourceDocumentId } : {}) };
        });
        const employmentChecks = (value.employmentChecks ?? []).map((entry: EmploymentCheck) => {
            if (!entry || !isText(entry.id) || !isDate(entry.date) || !isOptionalDate(entry.nextDate)
                || !['retention', 'commute', 'adaptation', 'satisfaction', 'employerOpinion', 'supportAction', 'outcome']
                    .every(key => isText(entry[key as keyof EmploymentCheck]))) throw new Error('Invalid employment check');
            return { id: entry.id, date: entry.date, retention: entry.retention, commute: entry.commute,
                adaptation: entry.adaptation, satisfaction: entry.satisfaction, employerOpinion: entry.employerOpinion,
                supportAction: entry.supportAction, outcome: entry.outcome,
                ...(entry.nextDate ? { nextDate: entry.nextDate } : {}) };
        });
        const jobComparisons = (value.jobComparisons ?? []).map((entry: JobComparison) => {
            if (!entry || !isText(entry.id) || !isDate(entry.date) || !isText(entry.jobId) || !isText(entry.jobLabel)
                || !isText(entry.adjustment) || !entry.jobSnapshot || !entry.supportNeeds
                || !comparisonKeys.every(key => isText(entry.jobSnapshot[key]) && isText(entry.supportNeeds[key]))) throw new Error('Invalid job comparison');
            return { id: entry.id, date: entry.date, jobId: entry.jobId, jobLabel: entry.jobLabel,
                jobSnapshot: Object.fromEntries(comparisonKeys.map(key => [key, entry.jobSnapshot[key]])) as JobComparison['jobSnapshot'],
                supportNeeds: Object.fromEntries(comparisonKeys.map(key => [key, entry.supportNeeds[key]])) as JobComparison['supportNeeds'],
                adjustment: entry.adjustment };
        });
        const rawPlan = value.participantPlan ?? EMPTY_PARTICIPANT_PLAN;
        if (!rawPlan || !['plainSummary', 'desiredGoal', 'ownAction', 'supportRequest', 'revisionRequest', 'reviewedAt', 'reviewMethod']
            .every(key => isText(rawPlan[key])) || !reviewStatuses.includes(rawPlan.reviewStatus)
            || rawPlan.reviewedAt && !isDate(rawPlan.reviewedAt)) throw new Error('Invalid participant plan');
        const participantPlan: ParticipantPlan = {
            plainSummary: rawPlan.plainSummary, desiredGoal: rawPlan.desiredGoal, ownAction: rawPlan.ownAction,
            supportRequest: rawPlan.supportRequest, revisionRequest: rawPlan.revisionRequest,
            reviewStatus: rawPlan.reviewStatus, reviewedAt: rawPlan.reviewedAt, reviewMethod: rawPlan.reviewMethod,
        };
        if (!Array.isArray(value.employmentChecks ?? []) || !Array.isArray(value.jobComparisons ?? [])) return null;
        const rawNote = value.situationNote;
        if (rawNote !== undefined && (!rawNote || !isText(rawNote.text) || !isText(rawNote.updatedAt))) throw new Error('Invalid situation note');
        return { version: 1, tasks, goals, employmentChecks, jobComparisons, participantPlan,
            ...(rawNote ? { situationNote: { text: rawNote.text, updatedAt: rawNote.updatedAt } } : {}) };
    } catch {
        return null;
    }
}

export { localDateKey };

/** 저장 시각({ seconds } 또는 날짜 문자열)을 로컬 'YYYY-MM-DD'로 바꿉니다. 알 수 없으면 빈 문자열. */
export function timestampDateKey(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
        return localDateKey(new Date((value as { seconds: number }).seconds * 1000));
    }
    if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
    }
    return '';
}

/** 사례문서 날짜. 'latest'는 수정일(없으면 작성일), 'created'는 작성일만 사용합니다. */
export function caseDocumentDate(doc: { createdAt?: unknown; updatedAt?: unknown }, basis: 'latest' | 'created' = 'latest'): string {
    if (basis === 'created') return timestampDateKey(doc.createdAt);
    return timestampDateKey(doc.updatedAt) || timestampDateKey(doc.createdAt);
}

export function getTaskTiming(dueDate: string, today: string): 'overdue' | 'today' | 'upcoming' | 'later' {
    if (dueDate < today) return 'overdue';
    if (dueDate === today) return 'today';
    const limit = new Date(`${today}T12:00:00`);
    limit.setDate(limit.getDate() + 7);
    return dueDate <= localDateKey(limit) ? 'upcoming' : 'later';
}
