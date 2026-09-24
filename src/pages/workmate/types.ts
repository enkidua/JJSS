// ─── 고용지원(WorkMate) 화면 공용 타입 ───

// 탭을 하나 더하려면 여기에 키를 추가하고, WorkMate.tsx의 TABS(이름·아이콘)와 renderTab()에 한 줄씩 추가합니다.
export const TAB_KEYS = ['pipeline', 'matching', 'interview', 'jobAnalysis', 'adaptation', 'supportedEmployment', 'review'] as const;
export type TabKey = typeof TAB_KEYS[number];
export const isTabKey = (value: unknown): value is TabKey => TAB_KEYS.includes(value as TabKey);

// ─── 사례관리 단계 정의 ───
export type CaseStep = 'select' | 'meeting' | 'plan' | 'followup';
export type CaseDocumentAction = 'meeting' | 'plan' | 'counseling' | 'evaluation';
export type FollowUpMode = 'counseling' | 'evaluation';

// ─── 고용지원 문서 ───
export type EmploymentKind = 'interview' | 'jobAnalysis';
export type EmploymentTask = 'interview' | 'jobAnalysis' | 'interviewRefine' | 'jobAnalysisRefine';

export type JobAnalysisPhoto = { id: string; file: File; previewUrl: string };

/**
 * 다른 화면에서 navigate('/workmate', { state })로 넘겨주는 값.
 * seekerId(getSeekerKey 값)를 우선 사용합니다. seekerName은 이전 호출 호환용이며,
 * 같은 이름의 이용자가 정확히 한 명일 때만 사용합니다(동명이인 혼입 방지).
 */
export interface WorkMateNavigationState {
    tab?: string;
    seekerId?: string;
    seekerName?: string;
    /** meeting | plan | followup | counseling | evaluation | workflow(후속 일정·목표·당사자 확인 패널 열기) */
    step?: string;
    /** 열 문서 ID. 지원고용 관리 탭(tab 'supportedEmployment')에서는 이 회차를 바로 엽니다. */
    documentId?: string;
}

export const EMPTY_INTERVIEW_FORM = {
    date: '',
    companyName: '',
    jobRole: '',
    participants: '',
    memo: '',
    seekerResponse: '',
    companyOpinion: '',
    supportPlan: '',
};
export type InterviewForm = typeof EMPTY_INTERVIEW_FORM;

export const EMPTY_JOB_ANALYSIS_FORM = {
    companyName: '',
    jobRole: '',
    traits: '',
    interviewNotes: '',
    tasks: '',
    environment: '',
    abilities: '',
    risks: '',
    supports: '',
    suitableSeeker: '',
};
export type JobAnalysisForm = typeof EMPTY_JOB_ANALYSIS_FORM;

export const hasAnyText = (values: Record<string, string>, ignoreKeys: string[] = []) =>
    Object.entries(values).some(([key, value]) => !ignoreKeys.includes(key) && String(value || '').trim().length > 0);
