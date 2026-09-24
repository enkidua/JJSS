import type { ToastType } from '../../components/Toast';
import type { Seeker } from '../../types/matching';
import { getSeekerKey, isSameSeeker } from '../../utils/seeker';
import { copyText } from '../../utils/clipboard';

// 직업훈련 화면의 자료 형식·상수·순수 함수 모음. 저장 형식(trainingState)은 이전 버전과 호환되어야 합니다.

export type TrainingTab = 'rooms' | 'case' | 'attendance' | 'progress';
export type AttendanceStatus = '출석' | '지각' | '조퇴' | '결석';
export type ProgramKey = 'social' | 'prep' | 'job' | 'field';
export type GeneratingKind = 'plan' | 'counseling' | 'evaluation' | 'checklist' | 'field' | 'share';
export type InsightMode = 'checklist' | 'field' | 'share';
export type TrainingSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type ShowToast = (message: string, type?: ToastType, duration?: number) => void;

export interface Trainee {
    id: string;
    seekerId?: string;
    name: string;
    gender: string;
    memo: string;
    score: number;
    photoDataUrl?: string;
}

export interface TrainingRoom {
    id: string;
    name: string;
    teacher: string;
    program: string;
    year: string;
    trainees: Trainee[];
}

export type AttendanceBook = Record<string, Record<string, AttendanceStatus>>;
export type ProgressEntry = Record<ProgramKey, { checked: boolean; note: string }>;
export type ProgressBook = Record<string, Record<string, ProgressEntry>>;

export interface TrainingRecord {
    plan: string;
    counselingDraft: string;
    counselingHistory: string[];
    evaluation: string;
    checklist: string;
    fieldNote: string;
    shareSummary: string;
    /** 이하 입력 메모는 훈련생별로 저장합니다. 이전 버전에서 저장한 기록에는 없을 수 있어 읽을 때 빈 값으로 채웁니다. */
    trainingPeriod: string;
    planRoom: string;
    planMemo: string;
    counselingDate: string;
    counselingPlace: string;
    counselingMemo: string;
    evaluationMemo: string;
    insightMemo: string;
}

export type TrainingRecordBook = Record<string, TrainingRecord>;

export interface AttendanceStats {
    total: number;
    counts: Record<AttendanceStatus, number>;
    attendanceRate: number;
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['출석', '지각', '조퇴', '결석'];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
    return typeof value === 'string' && (ATTENDANCE_STATUSES as string[]).includes(value);
}

export const programDefinitions: { key: ProgramKey; label: string; description: string }[] = [
    { key: 'social', label: '개인·사회생활 적응훈련', description: '일상생활, 대인관계, 자기관리, 사회규칙 적응' },
    { key: 'prep', label: '직업준비·직업수행 적응훈련', description: '직업태도, 출퇴근, 지시이해, 안전수칙, 면접 준비' },
    { key: 'job', label: '직무능력향상·직업유지 적응훈련', description: '작업속도, 정확도, 직무기술, 피드백 수용, 유지 전략' },
    { key: 'field', label: '현장중심 직업훈련', description: '사업체 현장훈련, 실습 평가, 현장 적응, 고용 전환 준비' },
];

export const statusStyles: Record<AttendanceStatus, string> = {
    출석: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    지각: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    조퇴: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
    결석: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
};

export const uncheckedStatusStyle = 'bg-white/5 text-white/70 border-white/20';

export const initialRooms: TrainingRoom[] = [
    {
        id: 'room-1',
        name: '직업적응훈련 1실',
        teacher: '',
        program: '사무보조 직무기초',
        year: String(new Date().getFullYear()),
        trainees: [],
    },
];

const RECORD_TEXT_KEYS = [
    'plan',
    'counselingDraft',
    'evaluation',
    'checklist',
    'fieldNote',
    'shareSummary',
    'trainingPeriod',
    'planRoom',
    'planMemo',
    'counselingDate',
    'counselingPlace',
    'counselingMemo',
    'evaluationMemo',
    'insightMemo',
] as const;

/** 저장된 기록을 읽을 때 빠진 항목(이전 버전 데이터)을 빈 값으로 채웁니다. */
export function getTrainingRecord(records: TrainingRecordBook, traineeId: string): TrainingRecord {
    const saved = (traineeId ? records[traineeId] : undefined) as Partial<Record<keyof TrainingRecord, unknown>> | undefined;
    const record = { counselingHistory: [] as string[] } as TrainingRecord;
    RECORD_TEXT_KEYS.forEach(key => {
        const value = saved?.[key];
        record[key] = typeof value === 'string' ? value : '';
    });
    const history = saved?.counselingHistory;
    record.counselingHistory = Array.isArray(history) ? history.filter((item): item is string => typeof item === 'string') : [];
    return record;
}

export function buildTraineeId(seeker: Seeker) {
    return `trainee-${getSeekerKey(seeker)}`;
}

/** 훈련생에 연결된 이용자를 식별자로만 찾습니다(이름으로 찾지 않아 동명이인 정보가 섞이지 않습니다). */
export function findSeekerForTrainee(seekers: Seeker[], trainee: Pick<Trainee, 'seekerId'> | null | undefined): Seeker | null {
    if (!trainee?.seekerId) return null;
    const traineeRef = { id: trainee.seekerId };
    return seekers.find(seeker => isSameSeeker(seeker, traineeRef)) || null;
}

export function isSeekerAssigned(rooms: TrainingRoom[], seeker: Seeker) {
    return rooms.some(room => room.trainees.some(trainee => !!trainee.seekerId && isSameSeeker(seeker, { id: trainee.seekerId })));
}

export function sanitizeTrainingRooms(rooms: TrainingRoom[], seekers: Seeker[] = []) {
    const seekerIds = new Set(seekers.flatMap(seeker => [seeker.id, seeker.seekerId]).filter(Boolean));
    return (rooms.length ? rooms : initialRooms).map(room => ({
        ...room,
        trainees: (room.trainees || []).filter(trainee => {
            if (trainee.id.startsWith('sample-')) return false;
            if (!trainee.seekerId) return false;
            if (seekerIds.size === 0) return true;
            return seekerIds.has(trainee.seekerId);
        }),
    }));
}

export function sanitizeTrainingRecords(records: TrainingRecordBook = {}) {
    return Object.fromEntries(
        Object.entries(records).filter(([traineeId]) => !traineeId.startsWith('sample-'))
    ) as TrainingRecordBook;
}

export function getSeekerProfileValue(seeker: Seeker, keys: string[]) {
    const source = seeker as unknown as Record<string, unknown>;
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return '';
}

/** 실제로 체크된 날만 셉니다. 미체크 날은 출석률 계산에서 빠집니다. */
export function computeAttendanceStats(attendanceBook: AttendanceBook, traineeId: string): AttendanceStats {
    let total = 0;
    const counts: Record<AttendanceStatus, number> = { 출석: 0, 지각: 0, 조퇴: 0, 결석: 0 };
    if (traineeId) {
        Object.values(attendanceBook).forEach(day => {
            const status = day?.[traineeId];
            if (!isAttendanceStatus(status)) return;
            total += 1;
            counts[status] += 1;
        });
    }
    const present = counts.출석 + counts.지각 + counts.조퇴;
    return { total, counts, attendanceRate: total ? Math.round((present / total) * 100) : 0 };
}

export function ensureProgressEntry(current?: Partial<ProgressEntry>): ProgressEntry {
    return {
        social: { checked: current?.social?.checked || false, note: current?.social?.note || '' },
        prep: { checked: current?.prep?.checked || false, note: current?.prep?.note || '' },
        job: { checked: current?.job?.checked || false, note: current?.job?.note || '' },
        field: { checked: current?.field?.checked || false, note: current?.field?.note || '' },
    };
}

export function buildProgressState(current: Partial<ProgressEntry> | undefined, key: ProgramKey): ProgressEntry {
    const base = ensureProgressEntry(current);
    return { ...base, [key]: { ...base[key], checked: !base[key].checked } };
}

export async function copyWithToast(showToast: ShowToast, text: string, successMessage: string) {
    const ok = await copyText(text);
    if (ok) showToast(successMessage, 'success', 1800);
    else showToast('클립보드에 복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.', 'error');
    return ok;
}
