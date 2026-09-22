import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpenCheck,
    CalendarCheck2,
    CheckCircle2,
    ClipboardList,
    Clock,
    Dumbbell,
    FileText,
    Loader2,
    Plus,
    Copy,
    RotateCcw,
    Save,
    Search,
    Sparkles,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { generateText } from '../services/gemini';
import { buildCurrentContentRegenerationPrompt } from '../services/documentRegenerationService';
import { buildClientContextSummary, withClientContextPrompt } from '../services/clientContextService';
import { useToast, ToastContainer } from '../components/Toast';
import { Seeker } from '../types/matching';
import * as localDB from '../config/localDB';
import { safeErrorMetadata } from '../utils/safeError';
import { getStoredImageValidationError } from '../utils/fileValidation';

type TrainingTab = 'rooms' | 'case' | 'attendance' | 'progress';
type AttendanceStatus = '출석' | '지각' | '조퇴' | '결석';
type ProgramKey = 'social' | 'prep' | 'job' | 'field';

interface Trainee {
    id: string;
    seekerId?: string;
    name: string;
    gender: string;
    memo: string;
    score: number;
    photoDataUrl?: string;
}

interface TrainingRoom {
    id: string;
    name: string;
    teacher: string;
    program: string;
    year: string;
    trainees: Trainee[];
}

type AttendanceBook = Record<string, Record<string, AttendanceStatus>>;
type ProgressEntry = Record<ProgramKey, { checked: boolean; note: string }>;
type ProgressBook = Record<string, Record<string, ProgressEntry>>;
type TrainingRecordBook = Record<string, {
    plan: string;
    counselingDraft: string;
    counselingHistory: string[];
    evaluation: string;
    checklist: string;
    fieldNote: string;
    shareSummary: string;
}>;

interface PersistedTrainingState {
    id: string;
    rooms: TrainingRoom[];
    attendanceBook: AttendanceBook;
    progressYear: string;
    progressBook: ProgressBook;
    trainingRecords: TrainingRecordBook;
    updatedAt: { seconds: number };
}

const tabs: { key: TrainingTab; label: string; icon: typeof ClipboardList }[] = [
    { key: 'rooms', label: '훈련실 관리', icon: Users },
    { key: 'attendance', label: '출석 관리', icon: CalendarCheck2 },
    { key: 'progress', label: '훈련상황/진도', icon: BookOpenCheck },
    { key: 'case', label: '계획·일지·공유', icon: ClipboardList },
];

const programDefinitions: { key: ProgramKey; label: string; description: string }[] = [
    { key: 'social', label: '개인·사회생활 적응훈련', description: '일상생활, 대인관계, 자기관리, 사회규칙 적응' },
    { key: 'prep', label: '직업준비·직업수행 적응훈련', description: '직업태도, 출퇴근, 지시이해, 안전수칙, 면접 준비' },
    { key: 'job', label: '직무능력향상·직업유지 적응훈련', description: '작업속도, 정확도, 직무기술, 피드백 수용, 유지 전략' },
    { key: 'field', label: '현장중심 직업훈련', description: '사업체 현장훈련, 실습 평가, 현장 적응, 고용 전환 준비' },
];

const statusStyles: Record<AttendanceStatus, string> = {
    출석: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    지각: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    조퇴: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
    결석: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
};

const initialRooms: TrainingRoom[] = [
    {
        id: 'room-1',
        name: '직업적응훈련 1실',
        teacher: '김정훈',
        program: '사무보조 직무기초',
        year: String(new Date().getFullYear()),
        trainees: [],
    },
];

function buildTraineeId(seeker: Pick<Seeker, 'id' | 'seekerId' | 'name'>) {
    return `trainee-${seeker.id || seeker.seekerId || seeker.name}`;
}

function sanitizeTrainingRooms(rooms: TrainingRoom[], seekers: Seeker[] = []) {
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

function sanitizeTrainingRecords(records: TrainingRecordBook = {}) {
    return Object.fromEntries(
        Object.entries(records).filter(([traineeId]) => !traineeId.startsWith('sample-'))
    ) as TrainingRecordBook;
}

function getSeekerProfileValue(seeker: Seeker, keys: string[]) {
    const source = seeker as Record<string, any>;
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return '';
}

export default function WorkTraining() {
    const { seekers, fetchData, initialized } = useDataStore();
    const { toasts, showToast, removeToast } = useToast();
    const currentYear = String(new Date().getFullYear());
    const [activeTab, setActiveTab] = useState<TrainingTab>('rooms');
    const [rooms, setRooms] = useState<TrainingRoom[]>(initialRooms);
    const [selectedRoomId, setSelectedRoomId] = useState(initialRooms[0].id);
    const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
    const [attendanceBook, setAttendanceBook] = useState<AttendanceBook>({});
    const [progressYear, setProgressYear] = useState(currentYear);
    const [progressBook, setProgressBook] = useState<ProgressBook>({});
    const [selectedTraineeId, setSelectedTraineeId] = useState('');
    const [trainingRecords, setTrainingRecords] = useState<TrainingRecordBook>({});
    const [trainingLoaded, setTrainingLoaded] = useState(false);

    const selectedRoom = rooms.find(room => room.id === selectedRoomId) || rooms[0];
    const totalTrainees = rooms.reduce((sum, room) => sum + room.trainees.length, 0);
    const selectedTrainee = rooms.flatMap(room => room.trainees).find(trainee => trainee.id === selectedTraineeId) || null;

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        let cancelled = false;
        const loadTrainingState = async () => {
            try {
                const saved = await localDB.getById<PersistedTrainingState>('trainingState', 'work-training');
                if (!cancelled && saved) {
                    const nextRooms = sanitizeTrainingRooms(saved.rooms?.length ? saved.rooms : initialRooms);
                    setRooms(nextRooms);
                    setAttendanceBook(saved.attendanceBook || {});
                    setProgressYear(saved.progressYear || currentYear);
                    setProgressBook(saved.progressBook || {});
                    setTrainingRecords(sanitizeTrainingRecords(saved.trainingRecords || {}));
                    const firstRoom = nextRooms[0];
                    setSelectedRoomId(firstRoom?.id || initialRooms[0].id);
                    setSelectedTraineeId(firstRoom?.trainees?.[0]?.id || '');
                }
            } catch (error) {
                console.error('[WorkTraining] 훈련 데이터 로드 실패:', safeErrorMetadata(error, 'training-state-load'));
                showToast('저장된 직업훈련 데이터를 불러오지 못했습니다.', 'error', 3500);
            } finally {
                if (!cancelled) setTrainingLoaded(true);
            }
        };
        loadTrainingState();
        return () => {
            cancelled = true;
        };
    }, [currentYear, showToast]);

    useEffect(() => {
        if (!initialized) return;
        setRooms(prevRooms => {
            const nextRooms = sanitizeTrainingRooms(prevRooms, seekers);
            setSelectedTraineeId(prev => {
                if (!prev) return prev;
                const exists = nextRooms.flatMap(room => room.trainees).some(trainee => trainee.id === prev);
                return exists ? prev : '';
            });
            return nextRooms;
        });
    }, [initialized, seekers]);

    useEffect(() => {
        if (!rooms.length) return;
        if (!rooms.some(room => room.id === selectedRoomId)) {
            setSelectedRoomId(rooms[0].id);
            setSelectedTraineeId(rooms[0].trainees?.[0]?.id || '');
        }
    }, [rooms, selectedRoomId]);

    useEffect(() => {
        if (!trainingLoaded) return;
        const timeout = window.setTimeout(async () => {
            try {
                await localDB.addDoc<PersistedTrainingState>('trainingState', {
                    id: 'work-training',
                    rooms,
                    attendanceBook,
                    progressYear,
                    progressBook,
                    trainingRecords,
                    updatedAt: localDB.localTimestamp(),
                });
            } catch (error) {
                console.error('[WorkTraining] 훈련 데이터 저장 실패:', safeErrorMetadata(error, 'training-state-save'));
            }
        }, 500);

        return () => window.clearTimeout(timeout);
    }, [rooms, attendanceBook, progressYear, progressBook, trainingRecords, trainingLoaded]);

    const updateRoom = (roomId: string, updater: (room: TrainingRoom) => TrainingRoom) => {
        setRooms(prev => prev.map(room => room.id === roomId ? updater(room) : room));
    };

    const addRoom = () => {
        const id = `room-${Date.now()}`;
        const nextRoom: TrainingRoom = {
            id,
            name: `신규 훈련실 ${rooms.length + 1}`,
            teacher: '',
            program: '',
            year: progressYear,
            trainees: [],
        };
        setRooms(prev => [...prev, nextRoom]);
        setSelectedRoomId(id);
        setSelectedTraineeId('');
        setActiveTab('rooms');
    };

    const deleteRoom = (roomId: string) => {
        if (rooms.length === 1) {
            showToast('훈련실은 최소 1개가 필요합니다.', 'error', 2500);
            return;
        }
        setRooms(prev => prev.filter(room => room.id !== roomId));
        if (selectedRoomId === roomId) {
            setSelectedRoomId(rooms.find(room => room.id !== roomId)?.id || rooms[0].id);
            setSelectedTraineeId('');
        }
    };

    const selectRoom = (roomId: string) => {
        setSelectedRoomId(roomId);
        const nextRoom = rooms.find(room => room.id === roomId);
        setSelectedTraineeId(nextRoom?.trainees[0]?.id || '');
    };

    return (
        <div className="min-h-screen py-8 px-4 flex flex-col items-center">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="w-full max-w-7xl mb-8">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                            <Dumbbell className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs text-emerald-300 font-bold uppercase tracking-wider">Vocational Training</span>
                        </div>
                        <h1 className="text-4xl font-black text-white mb-2">직업훈련</h1>
                        <p className="text-white/40 text-lg">훈련계획, 상담일지, 훈련실, 출석, 연간 프로그램 진도를 한 곳에서 관리합니다.</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-3 gap-3">
                            <StatPill label="훈련실" value={`${rooms.length}개`} />
                            <StatPill label="훈련생" value={`${totalTrainees}명`} />
                            <StatPill label="기준연도" value={progressYear} />
                        </div>
                        <div className="flex items-center justify-end gap-2 rounded-2xl bg-slate-900/70 border border-white/10 p-2">
                            <button
                                title="훈련자료 임시저장"
                                onClick={() => showToast('직업훈련 자료가 자동 저장되어 있습니다.', 'success', 1800)}
                                className="p-2 rounded-xl text-emerald-300 hover:bg-white/10"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                            <button
                                title="현재 훈련생 요약 복사"
                                onClick={() => {
                                    const summary = selectedTrainee ? `${selectedTrainee.name} / ${selectedRoom?.name || ''} / 상담 ${getTrainingRecord(trainingRecords, selectedTraineeId).counselingHistory.length}건` : '선택된 훈련생 없음';
                                    navigator.clipboard.writeText(summary);
                                    showToast('현재 훈련생 요약을 복사했습니다.', 'success', 1800);
                                }}
                                className="p-2 rounded-xl text-blue-300 hover:bg-white/10"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                title="훈련생 선택 초기화"
                                onClick={() => setSelectedTraineeId('')}
                                className="p-2 rounded-xl text-rose-300 hover:bg-white/10"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div role="group" aria-label="직업훈련 메뉴" className="flex gap-2 mt-8 border-b border-white/5 pb-0 max-w-full overflow-x-auto">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                aria-pressed={activeTab === tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`shrink-0 whitespace-nowrap px-6 py-3 text-sm font-black transition-all border-b-2 -mb-px relative flex items-center gap-2 ${
                                    activeTab === tab.key ? 'border-emerald-500 text-white' : 'border-transparent text-white/65 hover:text-white'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="w-full max-w-7xl">

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                    >
                        {activeTab === 'case' && selectedRoom && (
                            <TrainingPlanTab
                                room={selectedRoom}
                                rooms={rooms}
                                selectedRoomId={selectedRoomId}
                                setSelectedRoomId={selectRoom}
                                selectedTraineeId={selectedTraineeId}
                                setSelectedTraineeId={setSelectedTraineeId}
                                selectedTrainee={selectedTrainee}
                                seekers={seekers}
                                attendanceBook={attendanceBook}
                                progressYear={progressYear}
                                progressBook={progressBook}
                                trainingRecords={trainingRecords}
                                setTrainingRecords={setTrainingRecords}
                                showToast={showToast}
                            />
                        )}
                        {activeTab === 'rooms' && (
                            <TrainingRoomsTab
                                rooms={rooms}
                                seekers={seekers}
                                selectedRoomId={selectedRoomId}
                                setSelectedRoomId={selectRoom}
                                setSelectedTraineeId={setSelectedTraineeId}
                                updateRoom={updateRoom}
                                addRoom={addRoom}
                                deleteRoom={deleteRoom}
                                showToast={showToast}
                            />
                        )}
                        {activeTab === 'attendance' && selectedRoom && (
                            <AttendanceTab
                                room={selectedRoom}
                                rooms={rooms}
                                selectedRoomId={selectedRoomId}
                                setSelectedRoomId={selectRoom}
                                attendanceDate={attendanceDate}
                                setAttendanceDate={setAttendanceDate}
                                attendanceBook={attendanceBook}
                                setAttendanceBook={setAttendanceBook}
                            />
                        )}
                        {activeTab === 'progress' && selectedRoom && (
                            <ProgressTab
                                room={selectedRoom}
                                rooms={rooms}
                                selectedRoomId={selectedRoomId}
                                setSelectedRoomId={selectRoom}
                                progressYear={progressYear}
                                setProgressYear={setProgressYear}
                                progressBook={progressBook}
                                setProgressBook={setProgressBook}
                            />
                        )}
                        {!['case', 'rooms', 'attendance', 'progress'].includes(activeTab) && (
                            <div className="glass-strong rounded-[2rem] p-8 border border-white/10 text-center text-white/50">
                                표시할 훈련 메뉴를 다시 선택해 주세요.
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

function TrainingPlanTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    selectedTraineeId,
    setSelectedTraineeId,
    selectedTrainee,
    seekers,
    attendanceBook,
    progressYear,
    progressBook,
    trainingRecords,
    setTrainingRecords,
    showToast,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    selectedTraineeId: string;
    setSelectedTraineeId: (id: string) => void;
    selectedTrainee: Trainee | null;
    seekers: Seeker[];
    attendanceBook: AttendanceBook;
    progressYear: string;
    progressBook: ProgressBook;
    trainingRecords: TrainingRecordBook;
    setTrainingRecords: (records: TrainingRecordBook | ((prev: TrainingRecordBook) => TrainingRecordBook)) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}) {
    const [generating, setGenerating] = useState<'plan' | 'counseling' | 'evaluation' | 'checklist' | 'field' | 'share' | null>(null);
    const currentRecord = getTrainingRecord(trainingRecords, selectedTraineeId);
    const selectedSeeker = selectedTrainee ? seekers.find(seeker => seeker.id === selectedTrainee.seekerId || seeker.seekerId === selectedTrainee.seekerId || seeker.name === selectedTrainee.name) || null : null;
    const yearBook = progressBook[progressYear] || {};
    const [form, setForm] = useState({
        trainingPeriod: '',
        room: '',
        trainingMemo: '',
        manager: '김정훈',
    });
    const [counselingForm, setCounselingForm] = useState({
        date: '',
        place: '',
        memo: '',
    });
    const [evaluationInput, setEvaluationInput] = useState('');
    const [insightMemo, setInsightMemo] = useState('');
    const [clientContextSummary, setClientContextSummary] = useState('');
    const [clientContextLoading, setClientContextLoading] = useState(false);

    const attendanceStats = useMemo(() => {
        let total = 0;
        const counts: Record<AttendanceStatus, number> = { 출석: 0, 지각: 0, 조퇴: 0, 결석: 0 };
        Object.values(attendanceBook).forEach(day => {
            if (!selectedTraineeId || !day[selectedTraineeId]) return;
            total += 1;
            counts[day[selectedTraineeId]] += 1;
        });
        const present = counts.출석 + counts.지각 + counts.조퇴;
        return { total, counts, attendanceRate: total ? Math.round((present / total) * 100) : 0 };
    }, [attendanceBook, selectedTraineeId]);

    const progressEntry = ensureProgressEntry(selectedTraineeId ? yearBook[selectedTraineeId] : undefined);
    const donePrograms = programDefinitions.filter(program => progressEntry[program.key].checked);
    const progressRate = Math.round((donePrograms.length / programDefinitions.length) * 100);

    const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
    const updateCounseling = (key: keyof typeof counselingForm, value: string) => setCounselingForm(prev => ({ ...prev, [key]: value }));

    const updateRecord = (patch: Partial<TrainingRecordBook[string]>) => {
        if (!selectedTraineeId) return;
        setTrainingRecords(prev => ({
            ...prev,
            [selectedTraineeId]: { ...getTrainingRecord(prev, selectedTraineeId), ...patch },
        }));
    };

    const loadClientContext = async () => {
        if (!selectedSeeker) {
            showToast('정확히 연결된 이용자 정보를 먼저 선택해 주세요.', 'error', 2500);
            return;
        }
        setClientContextLoading(true);
        try {
            const result = await buildClientContextSummary(selectedSeeker, seekers);
            if (!result.hasRecords) {
                setClientContextSummary('');
                showToast(result.note || '불러올 최근 직업훈련·고용지원 기록이 없습니다.', 'info', 2500);
                return;
            }
            setClientContextSummary(result.summary);
            showToast('최근 기록 참고자료를 불러왔습니다.', 'success', 2200);
        } catch (error: any) {
            showToast(error?.message || '최근 기록 참고자료를 불러오지 못했습니다. 현재 작성 내용은 유지됩니다.', 'error', 3500);
        } finally {
            setClientContextLoading(false);
        }
    };

    const seekerContext = selectedTrainee ? `
[이용자 기본 정보]
성명: ${selectedTrainee.name}
나이: ${selectedSeeker?.age || '확인 필요'}
장애유형: ${selectedSeeker?.disabilityType || selectedTrainee.memo || '확인 필요'}
중경증: ${selectedSeeker?.severity || '확인 필요'}
희망직무: ${selectedSeeker?.desiredJob1 || selectedSeeker?.desiredJob2 || '확인 필요'}
희망지역: ${selectedSeeker?.desiredLocation || '확인 필요'}
소속 훈련실: ${room.name}
훈련실 대표 프로그램: ${room.program || '확인 필요'}
보유능력/특이사항: ${selectedSeeker?.notes || selectedTrainee.memo || '확인 필요'}` : '';

    const generatePlan = async () => {
        if (!selectedTrainee) {
            showToast('먼저 훈련실에서 훈련생을 선택해주세요.', 'error', 2500);
            return;
        }
        setGenerating('plan');
        try {
            const basePrompt = `다음 내용을 바탕으로 직업훈련에 특화된 훈련계획서를 작성해줘. 직업재활계획서 형식을 참고하되, 훈련목표, 세부 훈련프로그램, 수행방법, 평가방법, 담당자 지원계획이 중심이 되게 작성해.

${seekerContext}
[훈련기간] ${form.trainingPeriod}
[훈련실] ${form.room}
[담당자 간략 입력]
${form.trainingMemo || '담당자 입력 없음'}

위 간략 입력${currentRecord.plan ? '과 수정된 훈련계획서' : ''}을 바탕으로 현재 수행수준, 훈련 필요도, 장기목표, 단기목표, 적용 프로그램, 지원계획, 평가계획을 자연스럽게 구분해서 작성해줘. 내용이 부족한 부분은 직업훈련 현장에서 일반적으로 필요한 항목을 보수적으로 추정하되, 확인이 필요한 부분은 '확인 필요'로 표시해.
[담당자] ${form.manager}`;
            const prompt = currentRecord.plan
                ? buildCurrentContentRegenerationPrompt({
                    documentTitle: '직업훈련계획서',
                    currentContent: currentRecord.plan,
                    userContext: seekerContext,
                    contextSummary: clientContextSummary,
                    draftInstruction: basePrompt,
                    additionalInstruction: '현재 훈련계획서의 표현과 담당자 수정 의도를 유지하면서 부족한 근거, 평가방법, 지원계획만 보완해 주세요.',
                })
                : withClientContextPrompt(basePrompt, clientContextSummary);
            const generated = await generateText('rehab_plan', prompt, undefined, { featureKey: 'training', documentType: 'training-plan' });
            updateRecord({ plan: generated });
            showToast('훈련계획서가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련계획서 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setGenerating(null);
        }
    };

    const generateCounseling = async () => {
        if (!selectedTrainee) {
            showToast('먼저 훈련실에서 훈련생을 선택해주세요.', 'error', 2500);
            return;
        }
        setGenerating('counseling');
        try {
            const historyContext = currentRecord.counselingHistory.length > 0
                ? currentRecord.counselingHistory.map((item, index) => `[이전 훈련 상담일지 ${index + 1}]\n${item}`).join('\n\n')
                : '이전 훈련 상담일지 없음';
            const basePrompt = `다음 내용을 바탕으로 직업훈련 상담일지를 작성해줘. 고용지원의 사례관리 문서 연속작성처럼 기존 훈련계획과 이전 상담일지 흐름을 이어서 작성해.

${seekerContext}

[기준 훈련계획서]
${currentRecord.plan || '아직 작성되지 않음'}

[이전 상담 기록]
${historyContext}

[이번 상담 입력]
상담일시: ${counselingForm.date}
상담장소: ${counselingForm.place}
이번 상담 메모:
${counselingForm.memo || '담당자 입력 없음'}

위 메모${currentRecord.counselingDraft ? '와 수정된 상담일지' : ''}를 바탕으로 훈련 참여 및 수행상황, 상담 주요 이슈, 담당자 피드백, 향후 훈련계획이 드러나도록 상담일지 형식으로 정리해줘. 이전 기록이 있으면 반복하지 말고 다음 회기 흐름으로 이어줘.
담당자: ${form.manager}`;
            const prompt = currentRecord.counselingDraft
                ? buildCurrentContentRegenerationPrompt({
                    documentTitle: '직업훈련 상담일지',
                    currentContent: currentRecord.counselingDraft,
                    userContext: seekerContext,
                    previousRecords: historyContext,
                    contextSummary: clientContextSummary,
                    draftInstruction: basePrompt,
                    additionalInstruction: '현재 상담일지의 흐름과 담당자 표현을 유지하고, 반복을 줄이며 다음 회기 지원계획을 보완해 주세요.',
                })
                : withClientContextPrompt(basePrompt, clientContextSummary);
            const generated = await generateText('counseling', prompt, undefined, { featureKey: 'training', documentType: 'training-counseling' });
            updateRecord({ counselingDraft: generated });
            showToast('훈련 상담일지가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 상담일지 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setGenerating(null);
        }
    };

    const saveCounselingToHistory = () => {
        if (!currentRecord.counselingDraft.trim()) {
            showToast('붙여갈 상담일지가 없습니다.', 'error', 2200);
            return;
        }
        updateRecord({ counselingHistory: [...currentRecord.counselingHistory, currentRecord.counselingDraft], counselingDraft: '' });
        setCounselingForm({ date: '', place: '', memo: '' });
        showToast('상담일지를 아래 기록에 붙였습니다.', 'success', 2200);
    };

    const generateEvaluation = async () => {
        if (!selectedTrainee) {
            showToast('먼저 훈련실에서 훈련생을 선택해주세요.', 'error', 2500);
            return;
        }
        setGenerating('evaluation');
        try {
            const basePrompt = `다음 내용을 바탕으로 직업훈련 정기평가서를 작성해줘. 훈련계획 달성도, 상담일지 흐름, 현재 수행 변화, 향후 재수립 방향이 드러나게 작성해.

${seekerContext}

[훈련계획서]
${currentRecord.plan || '아직 작성되지 않음'}

[누적 상담일지]
${currentRecord.counselingHistory.length ? currentRecord.counselingHistory.join('\n\n') : '아직 누적 상담일지 없음'}

[담당자 평가 입력]
${evaluationInput || '추가 입력 없음'}

[담당자] ${form.manager}`;
            const prompt = currentRecord.evaluation
                ? buildCurrentContentRegenerationPrompt({
                    documentTitle: '직업훈련 정기평가서',
                    currentContent: currentRecord.evaluation,
                    userContext: seekerContext,
                    previousRecords: currentRecord.counselingHistory.join('\n\n'),
                    contextSummary: clientContextSummary,
                    draftInstruction: basePrompt,
                    additionalInstruction: '현재 평가서의 판단과 담당자 수정 의도를 유지하면서 목표 달성 근거와 향후 재수립 방향만 보완해 주세요.',
                })
                : withClientContextPrompt(basePrompt, clientContextSummary);
            const generated = await generateText('evaluation', prompt, undefined, { featureKey: 'training', documentType: 'training-evaluation' });
            updateRecord({ evaluation: generated });
            showToast('훈련 정기평가서가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 정기평가서 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setGenerating(null);
        }
    };

    const generateInsight = async (mode: 'checklist' | 'field' | 'share') => {
        if (!selectedTrainee) {
            showToast('성과를 정리할 훈련생을 먼저 선택해주세요.', 'error', 2500);
            return;
        }
        setGenerating(mode);
        try {
            const progressContext = donePrograms.length
                ? donePrograms.map(program => `- ${program.label}: ${progressEntry[program.key].note || '세부 기록 없음'}`).join('\n')
                : '체크된 훈련 프로그램 없음';
            const historyContext = currentRecord.counselingHistory.length
                ? currentRecord.counselingHistory.slice(-4).map((item, index) => `[최근 훈련 상담 ${index + 1}]\n${item}`).join('\n\n')
                : '최근 상담 기록 없음';
            let prompt = `${seekerContext}

[현행 훈련계획서]
${currentRecord.plan || '아직 작성되지 않음'}

[최근 훈련 상담/평가 흐름]
${historyContext}

[정기평가]
${currentRecord.evaluation || '아직 작성되지 않음'}

[출석 통계]
기록일수: ${attendanceStats.total}일 / 출석률: ${attendanceStats.attendanceRate}% / 출석 ${attendanceStats.counts.출석}회, 지각 ${attendanceStats.counts.지각}회, 조퇴 ${attendanceStats.counts.조퇴}회, 결석 ${attendanceStats.counts.결석}회

[${progressYear}년 훈련 프로그램 진행]
${progressContext}

[담당자 보충 메모]
${insightMemo || '담당자 입력 없음'}

`;
            if (mode === 'checklist') {
                prompt += `위 정보를 바탕으로 [작업수행 체크리스트 및 개인별 목표 달성률 점검표]를 작성해 줘. 고용지원 사례관리 문서처럼 담당자 입력을 빠뜨리지 말고 반영하되, 직업훈련에 맞게 1. 출석/참여, 2. 작업태도, 3. 지시이해, 4. 작업속도, 5. 정확도, 6. 대인관계, 7. 안전수칙, 8. 목표 달성률, 9. 다음 훈련과제를 포함해. 각 항목은 달성/부분달성/미달성/확인필요 중 하나로 판정하고 근거를 함께 적어줘.`;
            } else if (mode === 'field') {
                prompt += `위 정보를 바탕으로 [현장중심 직업훈련 연계 기록]을 작성해 줘. 사업체 현장훈련 또는 실습 전환을 준비하는 문서로, 훈련생 강점, 현장 배치 시 고려사항, 사업체 요청사항, 담당자 지원계획, 위험요인과 예방조치, 다음 연계 일정을 포함해. 정보가 부족하면 확인 필요로 표시해.`;
            } else {
                prompt += `위 정보를 바탕으로 보호자, 유관기관, 내부회의에서 공유할 수 있는 [훈련 경과 공유용 요약]을 작성해 줘. 개인정보 노출을 최소화하고, 1. 현재 훈련 경과, 2. 주요 변화, 3. 지원이 필요한 부분, 4. 다음 계획, 5. 공유 시 유의사항 순서로 간결하되 신뢰성 있게 작성해.`;
            }
            const generated = await generateText(mode === 'share' ? 'summary' : 'evaluation', withClientContextPrompt(prompt, clientContextSummary), undefined, { featureKey: 'training', documentType: `training-${mode}` });
            if (mode === 'checklist') updateRecord({ checklist: generated });
            if (mode === 'field') updateRecord({ fieldNote: generated });
            if (mode === 'share') updateRecord({ shareSummary: generated });
            showToast('훈련 성과 문서가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 성과 문서 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setGenerating(null);
        }
    };

    if (!selectedTrainee) {
        return (
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-white">훈련계획 수립 대상 선택</h2>
                        <p className="text-white/40 text-sm mt-1">훈련실에 등록된 훈련생을 선택하면 계획·상담·출석·진도가 같은 기록으로 이어집니다.</p>
                    </div>
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {room.trainees.map(trainee => (
                        <button key={trainee.id} onClick={() => setSelectedTraineeId(trainee.id)} className="text-left rounded-3xl bg-white/[0.03] border border-white/10 p-5 hover:bg-emerald-500/10 hover:border-emerald-400/30 transition-all">
                            <p className="text-lg font-black text-white">{trainee.name}</p>
                            <p className="text-sm text-white/45 mt-1">{room.name} · {trainee.memo || '메모 없음'}</p>
                            <p className="text-xs text-white/30 mt-3">출석·진도·문서 작성이 이 훈련생 기준으로 연결됩니다.</p>
                        </button>
                    ))}
                </div>
                {room.trainees.length === 0 && <p className="text-center text-white/35 py-12">이 훈련실에 등록된 훈련생이 없습니다. 훈련실관리에서 이용자를 먼저 추가해주세요.</p>}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="glass-strong rounded-[2rem] p-5 border border-emerald-400/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <p className="text-xs font-bold text-emerald-300 mb-1">선택된 훈련생</p>
                    <h2 className="text-2xl font-black text-white">{selectedTrainee.name}</h2>
                    <p className="text-sm text-white/45">{room.name} · {selectedTrainee.memo || '메모 없음'}</p>
                </div>
                <button onClick={() => setSelectedTraineeId('')} className="btn-ghost !bg-white/5 border border-white/10">다른 훈련생 선택</button>
            </div>

            <TrainingClientContextBox
                summary={clientContextSummary}
                loading={clientContextLoading}
                onLoad={loadClientContext}
                onClear={() => setClientContextSummary('')}
            />

            <TrainingStageCard
                step="1"
                title="STEP 1. 훈련계획 수립"
                description="선택된 이용자 정보를 기준으로 직업훈련 특화 계획서를 작성합니다."
                result={currentRecord.plan}
                setResult={value => updateRecord({ plan: value })}
                resultPlaceholder="AI가 작성한 직업훈련계획서가 여기에 표시됩니다."
                onSave={() => showToast('훈련계획서가 자동 저장되어 있습니다.', 'success', 1800)}
                onCopy={() => {
                    navigator.clipboard.writeText(currentRecord.plan);
                    showToast('훈련계획서가 복사되었습니다.', 'success', 1800);
                }}
                onRewrite={generatePlan}
                onReset={() => updateRecord({ plan: '' })}
                actions={<GenerateButton label="새 훈련계획서 초안 생성" isGenerating={generating === 'plan'} onClick={generatePlan} />}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <TrainingInput label="훈련기간" value={form.trainingPeriod} onChange={v => update('trainingPeriod', v)} placeholder="2026.04.01~2026.12.31" />
                    <TrainingInput label="훈련실" value={form.room} onChange={v => update('room', v)} placeholder="직업적응훈련 1실" />
                    <TrainingInput label="담당자" value={form.manager} onChange={v => update('manager', v)} placeholder="담당자명" />
                </div>
                <TrainingTextarea label="훈련계획 간략 입력" value={form.trainingMemo} onChange={v => update('trainingMemo', v)} placeholder="현재 수행수준, 필요한 지원, 목표, 진행할 프로그램을 짧게 적어주세요. 예: 출석은 안정적이나 작업속도가 느림. 직업준비훈련과 직무능력향상훈련 중심으로 반복지도 필요. 연말까지 보호작업장 전환 목표." />
            </TrainingStageCard>

            <TrainingTimelineStage
                title="STEP 2. 상담일지 연속 작성"
                description="훈련계획을 기준으로 상담일지를 계속 추가하고 전체 흐름을 타임라인으로 관리합니다."
                history={currentRecord.counselingHistory}
                draft={currentRecord.counselingDraft}
                setDraft={value => updateRecord({ counselingDraft: value })}
                date={counselingForm.date}
                place={counselingForm.place}
                memo={counselingForm.memo}
                onDateChange={value => updateCounseling('date', value)}
                onPlaceChange={value => updateCounseling('place', value)}
                onMemoChange={value => updateCounseling('memo', value)}
                onGenerate={generateCounseling}
                isGenerating={generating === 'counseling'}
                onSaveDraft={saveCounselingToHistory}
                evaluation={currentRecord.evaluation}
                setEvaluation={value => updateRecord({ evaluation: value })}
                evaluationMemo={evaluationInput}
                onEvaluationMemoChange={setEvaluationInput}
                onGenerateEvaluation={generateEvaluation}
                isGeneratingEvaluation={generating === 'evaluation'}
                onSaveEvaluation={() => showToast('훈련 정기평가서가 자동 저장되어 있습니다.', 'success', 1800)}
                onCopy={text => {
                    navigator.clipboard.writeText(text);
                    showToast('문서가 복사되었습니다.', 'success', 1800);
                }}
            />

            <div className="glass-strong rounded-[2rem] p-6 border border-emerald-400/15 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
                    <div>
                        <h3 className="text-xl font-black text-white">STEP 4. 성과·공유관리</h3>
                        <p className="text-sm text-white/45 mt-1">계획, 상담, 평가, 출석, 진도를 한 번에 묶어 공유용 기록을 작성합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatPill label="출석률" value={`${attendanceStats.attendanceRate}%`} />
                        <StatPill label="진도" value={`${progressRate}%`} />
                        <StatPill label="상담" value={`${currentRecord.counselingHistory.length}건`} />
                    </div>
                </div>
                <TrainingTextarea label="성과관리 보충 메모" value={insightMemo} onChange={setInsightMemo} placeholder="최근 변화, 보호자 공유 필요사항, 현장훈련 전환 가능성, 위험요인 등을 짧게 적어주세요." />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
                    <GenerateButton label="새 체크리스트/목표달성률 초안 생성" isGenerating={generating === 'checklist'} onClick={() => generateInsight('checklist')} />
                    <GenerateButton label="새 현장훈련 연계기록 초안 생성" isGenerating={generating === 'field'} onClick={() => generateInsight('field')} />
                    <GenerateButton label="새 공유용 요약 초안 생성" isGenerating={generating === 'share'} onClick={() => generateInsight('share')} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
                    <InsightResult
                        title="작업수행 체크리스트"
                        value={currentRecord.checklist}
                        onChange={value => updateRecord({ checklist: value })}
                        onRewrite={() => generateInsight('checklist')}
                        isRewriting={generating === 'checklist'}
                        onSave={() => showToast('체크리스트가 자동 저장되어 있습니다.', 'success', 1800)}
                        onCopy={() => {
                            navigator.clipboard.writeText(currentRecord.checklist);
                            showToast('체크리스트가 복사되었습니다.', 'success', 1800);
                        }}
                        onReset={() => updateRecord({ checklist: '' })}
                    />
                    <InsightResult
                        title="현장중심 직업훈련 기록"
                        value={currentRecord.fieldNote}
                        onChange={value => updateRecord({ fieldNote: value })}
                        onRewrite={() => generateInsight('field')}
                        isRewriting={generating === 'field'}
                        onSave={() => showToast('현장훈련 연계기록이 자동 저장되어 있습니다.', 'success', 1800)}
                        onCopy={() => {
                            navigator.clipboard.writeText(currentRecord.fieldNote);
                            showToast('현장훈련 연계기록이 복사되었습니다.', 'success', 1800);
                        }}
                        onReset={() => updateRecord({ fieldNote: '' })}
                    />
                    <InsightResult
                        title="보호자/유관기관 공유 요약"
                        value={currentRecord.shareSummary}
                        onChange={value => updateRecord({ shareSummary: value })}
                        onRewrite={() => generateInsight('share')}
                        isRewriting={generating === 'share'}
                        onSave={() => showToast('공유용 요약이 자동 저장되어 있습니다.', 'success', 1800)}
                        onCopy={() => {
                            navigator.clipboard.writeText(currentRecord.shareSummary);
                            showToast('공유용 요약이 복사되었습니다.', 'success', 1800);
                        }}
                        onReset={() => updateRecord({ shareSummary: '' })}
                    />
                </div>
            </div>
        </div>
    );
}

function TrainingCounselingTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    selectedTraineeId,
    setSelectedTraineeId,
    selectedTrainee,
    seekers,
    trainingRecords,
    setTrainingRecords,
    showToast,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    selectedTraineeId: string;
    setSelectedTraineeId: (id: string) => void;
    selectedTrainee: Trainee | null;
    seekers: Seeker[];
    trainingRecords: TrainingRecordBook;
    setTrainingRecords: (records: TrainingRecordBook | ((prev: TrainingRecordBook) => TrainingRecordBook)) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}) {
    const [isGenerating, setIsGenerating] = useState(false);
    const currentRecord = getTrainingRecord(trainingRecords, selectedTraineeId);
    const selectedSeeker = selectedTrainee ? seekers.find(seeker => seeker.id === selectedTrainee.seekerId || seeker.seekerId === selectedTrainee.seekerId || seeker.name === selectedTrainee.name) || null : null;
    const [form, setForm] = useState({
        date: '',
        place: '',
        memo: '',
        manager: '김정훈',
    });
    const [evaluationMemo, setEvaluationMemo] = useState('');

    const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

    const updateRecord = (patch: Partial<TrainingRecordBook[string]>) => {
        if (!selectedTraineeId) return;
        setTrainingRecords(prev => ({
            ...prev,
            [selectedTraineeId]: { ...getTrainingRecord(prev, selectedTraineeId), ...patch },
        }));
    };

    const seekerContext = selectedTrainee ? `
[이용자 기본 정보]
성명: ${selectedTrainee.name}
나이: ${selectedSeeker?.age || '확인 필요'}
장애유형: ${selectedSeeker?.disabilityType || selectedTrainee.memo || '확인 필요'}
중경증: ${selectedSeeker?.severity || '확인 필요'}
희망직무: ${selectedSeeker?.desiredJob1 || selectedSeeker?.desiredJob2 || '확인 필요'}
희망지역: ${selectedSeeker?.desiredLocation || '확인 필요'}
소속 훈련실: ${room.name}
기준 훈련계획서: ${currentRecord.plan || '아직 작성되지 않음'}
비고: ${selectedSeeker?.notes || selectedTrainee.memo || '확인 필요'}` : '';

    const generate = async () => {
        if (!selectedTrainee) {
            showToast('상담 대상 훈련생을 먼저 선택해주세요.', 'error', 2500);
            return;
        }
        setIsGenerating(true);
        try {
            const prompt = `다음 내용을 바탕으로 직업훈련 상담일지를 작성해줘. 기존 상담일지처럼 상담일시, 장소, 상담내용, 향후계획을 포함하되, 훈련 참여도, 수행 진전, 출석, 작업태도, 프로그램 적응, 다음 훈련지원 계획이 잘 드러나게 작성해.

${seekerContext}
[상담일시] ${form.date}
[상담장소] ${form.place}
[상담 메모]
${form.memo || '담당자 입력 없음'}

위 메모를 바탕으로 훈련 참여도, 수행 진전, 출석, 작업태도, 프로그램 적응, 다음 훈련지원 계획이 자연스럽게 드러나도록 상담일지 형식으로 확장해줘. 부족한 정보는 임의로 단정하지 말고 확인 필요로 표시해.
[담당자] ${form.manager}`;
            const generated = await generateText('counseling', prompt, undefined, { featureKey: 'training', documentType: 'training-counseling' });
            updateRecord({ counselingDraft: generated });
            showToast('훈련 상담일지가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 상담일지 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setIsGenerating(false);
        }
    };

    const generateEvaluation = async () => {
        if (!selectedTrainee) {
            showToast('평가 대상 훈련생을 먼저 선택해주세요.', 'error', 2500);
            return;
        }
        setIsGenerating(true);
        try {
            const prompt = `다음 내용을 바탕으로 직업훈련 정기평가서를 작성해줘. 상담일지 작성 화면에서 선택해 작성하는 평가 문서이므로, 훈련계획 달성도, 누적 상담 흐름, 현재 수행 변화, 미달성 사유, 향후 재수립 방향이 드러나게 작성해.

${seekerContext}

[누적 상담일지]
${currentRecord.counselingHistory.length ? currentRecord.counselingHistory.join('\n\n') : '아직 누적 상담일지 없음'}

[담당자 평가 입력]
${evaluationMemo || form.memo || '담당자 입력 없음'}

[평가일/장소]
${form.date || '확인 필요'} / ${form.place || '확인 필요'}

${currentRecord.evaluation ? `[현재 작성칸의 수정된 정기평가서]\n${currentRecord.evaluation}\n\n위 수정본의 의도와 담당자 수정 내용을 유지하면서 다시 보완해 작성해줘.\n` : ''}

[담당자] ${form.manager}`;
            const generated = await generateText('evaluation', prompt, undefined, { featureKey: 'training', documentType: 'training-evaluation' });
            updateRecord({ evaluation: generated });
            showToast('훈련 정기평가서가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 정기평가서 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setIsGenerating(false);
        }
    };

    const saveCounselingToHistory = () => {
        if (!currentRecord.counselingDraft.trim()) {
            showToast('붙여갈 상담일지가 없습니다.', 'error', 2200);
            return;
        }
        updateRecord({ counselingHistory: [...currentRecord.counselingHistory, currentRecord.counselingDraft], counselingDraft: '' });
        setForm(prev => ({ ...prev, date: '', place: '', memo: '' }));
        showToast('상담일지를 누적 기록에 저장했습니다.', 'success', 2200);
    };

    if (!selectedTrainee) {
        return (
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-white">상담일지 작성 대상 선택</h2>
                        <p className="text-white/40 text-sm mt-1">훈련실에 등록된 훈련생을 선택하면 계획·출석·진도 기록과 연결됩니다.</p>
                    </div>
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {room.trainees.map(trainee => (
                        <button key={trainee.id} onClick={() => setSelectedTraineeId(trainee.id)} className="text-left rounded-3xl bg-white/[0.03] border border-white/10 p-5 hover:bg-emerald-500/10 hover:border-emerald-400/30 transition-all">
                            <p className="text-lg font-black text-white">{trainee.name}</p>
                            <p className="text-sm text-white/45 mt-1">{room.name} · {trainee.memo || '메모 없음'}</p>
                            <p className="text-xs text-white/30 mt-3">계획·출석·진도와 연결된 상담일지를 작성합니다.</p>
                        </button>
                    ))}
                </div>
                {room.trainees.length === 0 && <p className="text-center text-white/35 py-12">이 훈련실에 등록된 훈련생이 없습니다. 훈련실관리에서 이용자를 먼저 추가해주세요.</p>}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="glass-strong rounded-[2rem] p-5 border border-emerald-400/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <p className="text-xs font-bold text-emerald-300 mb-1">선택된 상담 대상</p>
                    <h2 className="text-2xl font-black text-white">{selectedTrainee.name}</h2>
                    <p className="text-sm text-white/45">{room.name} · {selectedTrainee.memo || '메모 없음'}</p>
                </div>
                <button onClick={() => setSelectedTraineeId('')} className="btn-ghost !bg-white/5 border border-white/10">다른 훈련생 선택</button>
            </div>
            <TrainingTimelineStage
                title="상담일지·정기평가 작성"
                description="상담일지와 정기평가 중 필요한 문서를 선택해 같은 작성 칸에서 작성합니다."
                history={currentRecord.counselingHistory}
                draft={currentRecord.counselingDraft}
                setDraft={value => updateRecord({ counselingDraft: value })}
                date={form.date}
                place={form.place}
                memo={form.memo}
                onDateChange={value => update('date', value)}
                onPlaceChange={value => update('place', value)}
                onMemoChange={value => update('memo', value)}
                onGenerate={generate}
                isGenerating={isGenerating}
                onSaveDraft={saveCounselingToHistory}
                evaluation={currentRecord.evaluation}
                setEvaluation={value => updateRecord({ evaluation: value })}
                evaluationMemo={evaluationMemo}
                onEvaluationMemoChange={setEvaluationMemo}
                onGenerateEvaluation={generateEvaluation}
                isGeneratingEvaluation={isGenerating}
                onSaveEvaluation={() => showToast('직업훈련 정기평가서가 자동 저장되어 있습니다.', 'success', 1800)}
                onCopy={text => {
                    navigator.clipboard.writeText(text);
                    showToast('문서가 복사되었습니다.', 'success', 1800);
                }}
            />
        </div>
    );
}

function TrainingRoomsTab({
    rooms,
    seekers,
    selectedRoomId,
    setSelectedRoomId,
    setSelectedTraineeId,
    updateRoom,
    addRoom,
    deleteRoom,
    showToast,
}: {
    rooms: TrainingRoom[];
    seekers: Seeker[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    setSelectedTraineeId: (id: string) => void;
    updateRoom: (roomId: string, updater: (room: TrainingRoom) => TrainingRoom) => void;
    addRoom: () => void;
    deleteRoom: (roomId: string) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}) {
    const room = rooms.find(item => item.id === selectedRoomId) || rooms[0];
    const [search, setSearch] = useState('');

    const assignedSeekerIds = new Set(rooms.flatMap(item => item.trainees.map(trainee => trainee.seekerId)).filter(Boolean));
    const filteredSeekers = seekers
        .filter(seeker => {
            const keyword = search.trim().toLowerCase();
            if (!keyword) return true;
            return [
                seeker.name,
                seeker.seekerId,
                seeker.disabilityType,
                seeker.severity,
                seeker.desiredJob1,
                seeker.desiredJob2,
                seeker.desiredLocation,
            ].some(value => String(value || '').toLowerCase().includes(keyword));
        })
        .slice(0, 8);

    const addFromSeeker = (seeker: Seeker) => {
        const seekerKey = seeker.id || seeker.seekerId || seeker.name;
        if (!seekerKey) {
            showToast('이용자 식별정보가 없어 불러올 수 없습니다.', 'error', 2500);
            return;
        }
        if (assignedSeekerIds.has(seekerKey)) {
            showToast('이미 훈련실에 배정된 이용자입니다.', 'info', 2200);
            return;
        }
        const trainee: Trainee = {
            id: buildTraineeId(seeker),
            seekerId: seekerKey,
            name: seeker.name,
            gender: '등록정보',
            memo: [
                seeker.disabilityType,
                seeker.severity,
                seeker.desiredJob1 || seeker.desiredJob2,
                getSeekerProfileValue(seeker, ['birthDate', 'birthday', 'dateOfBirth']),
                seeker.notes,
            ].filter(Boolean).join(' / '),
            score: 0,
            photoDataUrl: getSeekerProfileValue(seeker, ['photoDataUrl', 'photoUrl', 'profileImage']),
        };
        updateRoom(room.id, prev => ({ ...prev, trainees: [...prev.trainees, trainee] }));
        setSelectedTraineeId(trainee.id);
        setSearch('');
        showToast(`${seeker.name} 이용자를 훈련실에 불러왔습니다.`, 'success', 2200);
    };

    const deleteTrainee = (traineeId: string) => {
        updateRoom(room.id, prev => ({ ...prev, trainees: prev.trainees.filter(trainee => trainee.id !== traineeId) }));
        showToast('훈련실 배정만 해제했습니다. 작성된 훈련 기록은 보존됩니다.', 'info', 2500);
    };

    const updateTraineePhoto = (traineeId: string, file?: File) => {
        if (!file) return;
        const validationError = getStoredImageValidationError(file);
        if (validationError) {
            showToast(validationError, 'error', 3200);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            updateRoom(room.id, prev => ({
                ...prev,
                trainees: prev.trainees.map(trainee => trainee.id === traineeId ? { ...trainee, photoDataUrl: String(reader.result || '') } : trainee),
            }));
            showToast('이용자 사진을 등록했습니다.', 'success', 1800);
        };
        reader.onerror = () => showToast('사진 파일을 읽지 못했습니다.', 'error', 3200);
        reader.readAsDataURL(file);
    };

    return (
        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-white">훈련실관리</h2>
                    <p className="text-white/40 text-sm mt-1">등록된 이용자를 훈련실에 배정하고, 이용자별 훈련 기록을 이어서 관리합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                    <button onClick={addRoom} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> 훈련실 생성</button>
                    <button onClick={() => deleteRoom(room.id)} className="btn-ghost !bg-white/5 border border-white/10 text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                <TrainingInput label="훈련실명" value={room.name} onChange={v => updateRoom(room.id, prev => ({ ...prev, name: v }))} />
                <TrainingInput label="담당교사" value={room.teacher} onChange={v => updateRoom(room.id, prev => ({ ...prev, teacher: v }))} />
                <TrainingInput label="대표 프로그램" value={room.program} onChange={v => updateRoom(room.id, prev => ({ ...prev, program: v }))} />
                <TrainingInput label="운영연도" value={room.year} onChange={v => updateRoom(room.id, prev => ({ ...prev, year: v }))} />
            </div>

            <div className="rounded-3xl bg-white/[0.03] border border-white/10 p-6 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                    <div>
                        <h3 className="font-black text-white">검색하여 명단에 추가</h3>
                        <p className="text-xs text-white/40 mt-1">이용자를 검색한 뒤 [명단에 추가]를 누르면 아래 훈련생 명단에 바로 들어갑니다.</p>
                    </div>
                    <div className="relative w-full lg:max-w-md">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름, 장애유형, 희망직무, 약력 검색" className="input-field pl-9" />
                    </div>
                </div>
                {seekers.length === 0 ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                        먼저 이용자 관리에서 이용자를 등록해주세요. 직업훈련은 등록된 이용자를 불러온 뒤 계획, 상담, 출석, 진도 기록을 계속 누적합니다.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredSeekers.map(seeker => {
                            const assigned = assignedSeekerIds.has(seeker.id || seeker.seekerId || seeker.name);
                            return (
                                <button
                                    key={seeker.id || seeker.name}
                                    onClick={() => addFromSeeker(seeker)}
                                    disabled={assigned}
                                    className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                                        assigned
                                            ? 'bg-white/[0.03] border-white/10 text-white/40 cursor-not-allowed'
                                            : 'bg-slate-950/35 border-white/10 text-white hover:bg-emerald-500/10 hover:border-emerald-400/35'
                                    }`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <div>
                                            <p className="font-black text-base text-white">{seeker.name}</p>
                                            <p className="text-xs text-white/50 mt-1">{[seeker.disabilityType, seeker.severity, seeker.desiredJob1 || seeker.desiredJob2].filter(Boolean).join(' / ') || '직업훈련 정보 미등록'}</p>
                                        </div>
                                        <span className={`text-center text-[12px] font-black px-3 py-2 rounded-xl border ${
                                            assigned ? 'bg-white/5 text-white/45 border-white/10' : 'bg-white/5 text-white/80 border-white/10'
                                        }`}>
                                            {assigned ? '추가 완료' : '명단에 추가'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                        {filteredSeekers.length === 0 && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
                                검색 조건에 맞는 이용자가 없습니다.
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-3 mb-6">
                <h3 className="font-black text-white">배정된 훈련생 명단</h3>
                {room.trainees.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
                        아직 배정된 훈련생이 없습니다. 위 검색에서 이용자를 찾아 명단에 추가해주세요.
                    </div>
                ) : (
                    room.trainees.map(trainee => {
                        const seeker = seekers.find(item => item.id === trainee.seekerId || item.seekerId === trainee.seekerId || item.name === trainee.name);
                        const birthDate = seeker ? getSeekerProfileValue(seeker, ['birthDate', 'birthday', 'dateOfBirth']) || (seeker.age ? `연령 ${seeker.age}` : '-') : '-';
                        const career = seeker ? getSeekerProfileValue(seeker, ['career', 'briefHistory', 'workHistory', 'profileSummary']) || seeker.notes || '-' : '-';
                        const trainingInfo = seeker ? [seeker.disabilityType, seeker.severity, seeker.desiredJob1 || seeker.desiredJob2].filter(Boolean).join(' / ') || trainee.memo || '-' : trainee.memo || '-';
                        return (
                            <div key={trainee.id} className="rounded-2xl border border-emerald-300/45 bg-emerald-500/10 p-4 shadow-[0_0_0_1px_rgba(110,231,183,0.18)]">
                                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1.2fr_auto] gap-3 lg:items-center">
                                    <div className="flex items-center gap-3">
                                        <label className="group relative w-12 h-12 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-300/60 shrink-0">
                                            {trainee.photoDataUrl ? (
                                                <img src={trainee.photoDataUrl} alt={`${trainee.name} 사진`} className="w-full h-full object-cover" />
                                            ) : (
                                                <Users className="w-4 h-4 text-white/45" />
                                            )}
                                            <span className="absolute inset-0 bg-black/55 text-[10px] font-black text-white hidden group-hover:flex items-center justify-center">사진</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={event => updateTraineePhoto(trainee.id, event.target.files?.[0])}
                                            />
                                        </label>
                                        <div>
                                            <p className="font-black text-white">{trainee.name}</p>
                                            <p className="text-xs text-white/55 mt-1">{trainingInfo}</p>
                                        </div>
                                    </div>
                                    <p className="rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-xs text-white/80">생년월일/연령: {birthDate}</p>
                                    <p className="rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-xs text-white/80 line-clamp-2">약력: {career}</p>
                                    <div className="flex items-center justify-end gap-2">
                                        <span className="text-center text-[12px] font-black px-3 py-2 rounded-xl bg-emerald-400 text-slate-950 border border-emerald-200">추가 완료</span>
                                        <button onClick={() => deleteTrainee(trainee.id)} className="p-2 rounded-xl bg-black/20 text-red-200 hover:bg-red-500/15" title="명단에서 제거">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="overflow-x-auto hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-white/45 border-b border-white/10">
                            <th className="py-3 px-2">번호</th>
                            <th className="py-3 px-2">이름</th>
                            <th className="py-3 px-2">사진</th>
                            <th className="py-3 px-2">생년월일/연령</th>
                            <th className="py-3 px-2">약력</th>
                            <th className="py-3 px-2">훈련정보</th>
                            <th className="py-3 px-2">총점</th>
                            <th className="py-3 px-2">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {room.trainees.map((trainee, index) => {
                            const seeker = seekers.find(item => item.id === trainee.seekerId || item.seekerId === trainee.seekerId || item.name === trainee.name);
                            const birthDate = seeker ? getSeekerProfileValue(seeker, ['birthDate', 'birthday', 'dateOfBirth']) || (seeker.age ? `연령 ${seeker.age}` : '-') : '-';
                            const career = seeker ? getSeekerProfileValue(seeker, ['career', 'briefHistory', 'workHistory', 'profileSummary']) || seeker.notes || '-' : '-';
                            const trainingInfo = seeker ? [seeker.disabilityType, seeker.severity, seeker.desiredJob1 || seeker.desiredJob2].filter(Boolean).join(' / ') || trainee.memo || '-' : trainee.memo || '-';
                            return (
                            <tr key={trainee.id} className="border-b border-white/10 text-white/75">
                                <td className="py-3 px-2 font-bold">{index + 1}</td>
                                <td className="py-3 px-2">{trainee.name}</td>
                                <td className="py-3 px-2">
                                    <label className="group relative w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-300/60">
                                        {trainee.photoDataUrl ? (
                                            <img src={trainee.photoDataUrl} alt={`${trainee.name} 사진`} className="w-full h-full object-cover" />
                                        ) : (
                                            <Users className="w-4 h-4 text-white/45" />
                                        )}
                                        <span className="absolute inset-0 bg-black/55 text-[10px] font-black text-white hidden group-hover:flex items-center justify-center">사진</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={event => updateTraineePhoto(trainee.id, event.target.files?.[0])}
                                        />
                                    </label>
                                </td>
                                <td className="py-3 px-2">{birthDate}</td>
                                <td className="py-3 px-2 max-w-[260px] truncate" title={career}>{career}</td>
                                <td className="py-3 px-2 max-w-[260px] truncate" title={trainingInfo}>{trainingInfo}</td>
                                <td className="py-3 px-2">{trainee.score}</td>
                                <td className="py-3 px-2">
                                    <button onClick={() => deleteTrainee(trainee.id)} className="p-2 rounded-xl bg-white/5 text-red-300 hover:bg-red-500/10">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TrainingClientContextBox({
    summary,
    loading,
    onLoad,
    onClear,
}: {
    summary: string;
    loading: boolean;
    onLoad: () => void;
    onClear: () => void;
}) {
    return (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p className="text-sm font-black text-emerald-100">통합 참고자료</p>
                    <p className="text-xs text-white/45 mt-1">버튼을 눌렀을 때만 같은 이용자의 최근 직업훈련 및 고용지원 기록을 문서 생성 프롬프트에 참고자료로 포함합니다.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onLoad} disabled={loading} className="btn-secondary !py-2 flex items-center gap-2 text-sm">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                        최근 기록 참고
                    </button>
                    {summary && (
                        <button onClick={onClear} className="btn-ghost !bg-white/5 border border-white/10 !py-2 text-sm">
                            참고자료 제외
                        </button>
                    )}
                </div>
            </div>
            {summary && (
                <pre className="mt-4 max-h-56 overflow-y-auto rounded-2xl bg-black/25 border border-white/10 p-4 text-xs leading-relaxed text-white/70 whitespace-pre-wrap font-sans">
                    {summary}
                </pre>
            )}
        </div>
    );
}

function AttendanceTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    attendanceDate,
    setAttendanceDate,
    attendanceBook,
    setAttendanceBook,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    attendanceDate: string;
    setAttendanceDate: (date: string) => void;
    attendanceBook: AttendanceBook;
    setAttendanceBook: (book: AttendanceBook | ((prev: AttendanceBook) => AttendanceBook)) => void;
}) {
    const dayBook = attendanceBook[attendanceDate] || {};

    const setStatus = (traineeId: string, status: AttendanceStatus) => {
        if (!attendanceDate || !traineeId) return;
        setAttendanceBook(prev => ({
            ...prev,
            [attendanceDate]: {
                ...(prev[attendanceDate] || {}),
                [traineeId]: status,
            },
        }));
    };

    const counts = useMemo(() => {
        return room.trainees.reduce<Record<AttendanceStatus, number>>((acc, trainee) => {
            const status = dayBook[trainee.id] || '출석';
            acc[status] += 1;
            return acc;
        }, { 출석: 0, 지각: 0, 조퇴: 0, 결석: 0 });
    }, [room.trainees, dayBook]);

    return (
        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-white">훈련실 출석관리</h2>
                    <p className="text-white/40 text-sm mt-1">훈련생별 출석, 지각, 조퇴, 결석을 체크합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                    <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="input-field w-auto" />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {(Object.keys(counts) as AttendanceStatus[]).map(status => (
                    <div key={status} className={`rounded-2xl border p-4 ${statusStyles[status]}`}>
                        <p className="text-xs font-bold opacity-75">{status}</p>
                        <p className="text-2xl font-black mt-1">{counts[status]}명</p>
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                {room.trainees.map(trainee => {
                    const status = dayBook[trainee.id] || '출석';
                    return (
                        <div key={trainee.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <p className="font-bold text-white">{trainee.name}</p>
                                <p className="text-xs text-white/35">{room.name} · {trainee.memo || '메모 없음'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(['출석', '지각', '조퇴', '결석'] as AttendanceStatus[]).map(item => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setStatus(trainee.id, item)}
                                        className={`px-3 py-2 rounded-xl border text-xs font-black transition-all ${status === item ? statusStyles[item] : 'bg-white/5 text-white/35 border-white/10 hover:text-white'}`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ProgressTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    progressYear,
    setProgressYear,
    progressBook,
    setProgressBook,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    progressYear: string;
    setProgressYear: (year: string) => void;
    progressBook: ProgressBook;
    setProgressBook: (book: ProgressBook | ((prev: ProgressBook) => ProgressBook)) => void;
}) {
    const yearBook = progressBook[progressYear] || {};
    const [expandedTraineeId, setExpandedTraineeId] = useState(room.trainees[0]?.id || '');

    const toggleProgram = (traineeId: string, key: ProgramKey) => {
        setProgressBook(prev => ({
            ...prev,
            [progressYear]: {
                ...(prev[progressYear] || {}),
                [traineeId]: buildProgressState(prev[progressYear]?.[traineeId], key),
            },
        }));
    };

    const updateProgramNote = (traineeId: string, key: ProgramKey, note: string) => {
        setProgressBook(prev => {
            const current = ensureProgressEntry(prev[progressYear]?.[traineeId]);
            return {
                ...prev,
                [progressYear]: {
                    ...(prev[progressYear] || {}),
                    [traineeId]: {
                        ...current,
                        [key]: { ...current[key], note },
                    },
                },
            };
        });
    };

    return (
        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-white">훈련상황 진도</h2>
                    <p className="text-white/40 text-sm mt-1">연도별로 어떤 훈련프로그램을 진행했는지 자가점검합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                    <input value={progressYear} onChange={e => setProgressYear(e.target.value)} placeholder="2026" className="input-field w-28" />
                </div>
            </div>

            <div className="space-y-3">
                {room.trainees.map(trainee => {
                    const checked = ensureProgressEntry(yearBook[trainee.id]);
                    const doneCount = programDefinitions.filter(program => checked[program.key].checked).length;
                    const isExpanded = expandedTraineeId === trainee.id;
                    return (
                        <div key={trainee.id} className={`rounded-3xl border transition-all ${isExpanded ? 'bg-emerald-500/[0.06] border-emerald-400/25 p-5' : 'bg-white/[0.03] border-white/10 p-4'}`}>
                            <button onClick={() => setExpandedTraineeId(isExpanded ? '' : trainee.id)} className="w-full flex items-center justify-between gap-3 text-left">
                                <div>
                                    <h3 className="font-black text-white">{trainee.name}</h3>
                                    <p className="text-xs text-white/35">{room.name} · {progressYear}년 진행 프로그램 {doneCount}/4</p>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-200 font-black">
                                    {doneCount}
                                </div>
                            </button>
                            {isExpanded && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 mt-5">
                                    {programDefinitions.map(program => (
                                        <div key={program.key} className="space-y-2 rounded-2xl bg-black/15 border border-white/10 p-3">
                                            <button
                                                onClick={() => toggleProgram(trainee.id, program.key)}
                                                className={`w-full text-left rounded-2xl border p-4 transition-all ${
                                                    checked[program.key].checked ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <CheckCircle2 className={`w-5 h-5 mt-0.5 ${checked[program.key].checked ? 'text-emerald-300' : 'text-white/20'}`} />
                                                    <div>
                                                        <p className="font-bold text-white">{program.label}</p>
                                                        <p className="text-xs text-white/40 mt-1">{program.description}</p>
                                                    </div>
                                                </div>
                                            </button>
                                            <textarea
                                                value={checked[program.key].note}
                                                onChange={e => updateProgramNote(trainee.id, program.key, e.target.value)}
                                                placeholder="어떤 훈련을 진행해서 체크했는지 기록하세요. 예: 출퇴근 경로 연습, 모의면접 2회, 사업체 현장실습 1회"
                                                className="textarea-field !min-h-[72px] text-xs leading-relaxed"
                                            />
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TrainingInsightTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    selectedTraineeId,
    setSelectedTraineeId,
    selectedTrainee,
    seekers,
    attendanceBook,
    progressYear,
    progressBook,
    trainingRecords,
    setTrainingRecords,
    showToast,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    selectedTraineeId: string;
    setSelectedTraineeId: (id: string) => void;
    selectedTrainee: Trainee | null;
    seekers: Seeker[];
    attendanceBook: AttendanceBook;
    progressYear: string;
    progressBook: ProgressBook;
    trainingRecords: TrainingRecordBook;
    setTrainingRecords: (records: TrainingRecordBook | ((prev: TrainingRecordBook) => TrainingRecordBook)) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}) {
    const [memo, setMemo] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const currentRecord = getTrainingRecord(trainingRecords, selectedTraineeId);
    const selectedSeeker = selectedTrainee ? seekers.find(seeker => seeker.id === selectedTrainee.seekerId || seeker.seekerId === selectedTrainee.seekerId || seeker.name === selectedTrainee.name) || null : null;
    const yearBook = progressBook[progressYear] || {};

    const attendanceStats = useMemo(() => {
        let total = 0;
        const counts: Record<AttendanceStatus, number> = { 출석: 0, 지각: 0, 조퇴: 0, 결석: 0 };
        Object.values(attendanceBook).forEach(day => {
            if (!selectedTraineeId || !day[selectedTraineeId]) return;
            total += 1;
            counts[day[selectedTraineeId]] += 1;
        });
        const present = counts.출석 + counts.지각 + counts.조퇴;
        return { total, counts, attendanceRate: total ? Math.round((present / total) * 100) : 0 };
    }, [attendanceBook, selectedTraineeId]);

    const progressEntry = ensureProgressEntry(selectedTraineeId ? yearBook[selectedTraineeId] : undefined);
    const donePrograms = programDefinitions.filter(program => progressEntry[program.key].checked);
    const progressRate = Math.round((donePrograms.length / programDefinitions.length) * 100);

    const updateRecord = (patch: Partial<TrainingRecordBook[string]>) => {
        if (!selectedTraineeId) return;
        setTrainingRecords(prev => ({
            ...prev,
            [selectedTraineeId]: { ...getTrainingRecord(prev, selectedTraineeId), ...patch },
        }));
    };

    const generateInsight = async (mode: 'checklist' | 'field' | 'share') => {
        if (!selectedTrainee) {
            showToast('성과를 정리할 훈련생을 먼저 선택해주세요.', 'error', 2500);
            return;
        }
        setIsGenerating(true);
        try {
            const ctx = `
[이용자 정보]
이름: ${selectedTrainee.name} / 나이: ${selectedSeeker?.age || '확인 필요'}
장애유형: ${selectedSeeker?.disabilityType || selectedTrainee.memo || '확인 필요'} (${selectedSeeker?.severity || '확인 필요'})
희망직종: ${selectedSeeker?.desiredJob1 || '확인 필요'}${selectedSeeker?.desiredJob2 ? ` / ${selectedSeeker.desiredJob2}` : ''}
소속 훈련실: ${room.name} / 대표 프로그램: ${room.program || '확인 필요'}
특이사항: ${selectedSeeker?.notes || selectedTrainee.memo || '없음'}`;
            const progressContext = donePrograms.length
                ? donePrograms.map(program => `- ${program.label}: ${progressEntry[program.key].note || '세부 기록 없음'}`).join('\n')
                : '체크된 훈련 프로그램 없음';
            const historyContext = currentRecord.counselingHistory.length
                ? currentRecord.counselingHistory.slice(-4).map((item, index) => `[최근 훈련 상담 ${index + 1}]\n${item}`).join('\n\n')
                : '최근 상담 기록 없음';
            let prompt = `${ctx}

[현행 훈련계획서]
${currentRecord.plan || '아직 작성되지 않음'}

[최근 훈련 상담/평가 흐름]
${historyContext}

[출석 통계]
기록일수: ${attendanceStats.total}일 / 출석률: ${attendanceStats.attendanceRate}% / 출석 ${attendanceStats.counts.출석}회, 지각 ${attendanceStats.counts.지각}회, 조퇴 ${attendanceStats.counts.조퇴}회, 결석 ${attendanceStats.counts.결석}회

[${progressYear}년 훈련 프로그램 진행]
${progressContext}

${mode === 'checklist' && currentRecord.checklist ? `[현재 작성칸의 수정된 작업수행 체크리스트]\n${currentRecord.checklist}\n\n위 수정본을 기준으로 다시 보완해줘.\n` : ''}
${mode === 'field' && currentRecord.fieldNote ? `[현재 작성칸의 수정된 현장중심 직업훈련 기록]\n${currentRecord.fieldNote}\n\n위 수정본을 기준으로 다시 보완해줘.\n` : ''}
${mode === 'share' && currentRecord.shareSummary ? `[현재 작성칸의 수정된 공유용 요약]\n${currentRecord.shareSummary}\n\n위 수정본을 기준으로 다시 보완해줘.\n` : ''}

--- 담당자가 입력한 보충 메모 ---
${memo || '(담당자 입력 없음)'}

`;
            if (mode === 'checklist') {
                prompt += `위 정보를 바탕으로 [작업수행 체크리스트 및 개인별 목표 달성률 점검표]를 작성해 줘. 고용지원 사례관리 문서처럼 담당자 입력을 빠뜨리지 말고 반영하되, 직업훈련에 맞게 1. 출석/참여, 2. 작업태도, 3. 지시이해, 4. 작업속도, 5. 정확도, 6. 대인관계, 7. 안전수칙, 8. 목표 달성률, 9. 다음 훈련과제를 포함해. 각 항목은 달성/부분달성/미달성/확인필요 중 하나로 판정하고 근거를 함께 적어줘.`;
            } else if (mode === 'field') {
                prompt += `위 정보를 바탕으로 [현장중심 직업훈련 연계 기록]을 작성해 줘. 사업체 현장훈련 또는 실습 전환을 준비하는 문서로, 훈련생 강점, 현장 배치 시 고려사항, 사업체 요청사항, 담당자 지원계획, 위험요인과 예방조치, 다음 연계 일정을 포함해. 정보가 부족하면 확인 필요로 표시해.`;
            } else {
                prompt += `위 정보를 바탕으로 보호자, 유관기관, 내부회의에서 공유할 수 있는 [훈련 경과 공유용 요약]을 작성해 줘. 개인정보 노출을 최소화하고, 1. 현재 훈련 경과, 2. 주요 변화, 3. 지원이 필요한 부분, 4. 다음 계획, 5. 공유 시 유의사항 순서로 간결하되 신뢰성 있게 작성해.`;
            }
            const generated = await generateText(mode === 'share' ? 'summary' : 'evaluation', prompt, undefined, { featureKey: 'training', documentType: `training-${mode}` });
            if (mode === 'checklist') updateRecord({ checklist: generated });
            if (mode === 'field') updateRecord({ fieldNote: generated });
            if (mode === 'share') updateRecord({ shareSummary: generated });
            showToast('훈련 성과 문서가 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error.message || '훈련 성과 문서 생성 중 오류가 발생했습니다.', 'error', 4000);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-white">성과·공유관리</h2>
                        <p className="text-white/40 text-sm mt-1">목표 달성률, 작업수행 체크리스트, 현장훈련 기록, 공유용 요약을 한 화면에서 생성합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                        <select value={selectedTraineeId} onChange={e => setSelectedTraineeId(e.target.value)} className="input-field w-auto">
                            <option value="">훈련생 선택</option>
                            {room.trainees.map(trainee => <option key={trainee.id} value={trainee.id}>{trainee.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                    <StatPill label="출석률" value={`${attendanceStats.attendanceRate}%`} />
                    <StatPill label="프로그램 진도" value={`${progressRate}%`} />
                    <StatPill label="상담기록" value={`${currentRecord.counselingHistory.length}건`} />
                </div>

                <TrainingTextarea label="보충 메모" value={memo} onChange={setMemo} placeholder="성과 점검에 반영할 내용을 짧게 적어주세요. 예: 최근 검수 정확도가 좋아졌고, 현장실습 전환 가능성을 검토 중임." />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                    <GenerateButton label="체크리스트/목표달성률" isGenerating={isGenerating} onClick={() => generateInsight('checklist')} />
                    <GenerateButton label="현장훈련 연계기록" isGenerating={isGenerating} onClick={() => generateInsight('field')} />
                    <GenerateButton label="공유용 요약" isGenerating={isGenerating} onClick={() => generateInsight('share')} />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <InsightResult title="작업수행 체크리스트" value={currentRecord.checklist} onChange={value => updateRecord({ checklist: value })} onRewrite={() => generateInsight('checklist')} isRewriting={isGenerating} onSave={() => showToast('체크리스트가 자동 저장되어 있습니다.', 'success', 1800)} onCopy={() => { navigator.clipboard.writeText(currentRecord.checklist); showToast('체크리스트가 복사되었습니다.', 'success', 1800); }} onReset={() => updateRecord({ checklist: '' })} />
                <InsightResult title="현장중심 직업훈련 기록" value={currentRecord.fieldNote} onChange={value => updateRecord({ fieldNote: value })} onRewrite={() => generateInsight('field')} isRewriting={isGenerating} onSave={() => showToast('현장훈련 연계기록이 자동 저장되어 있습니다.', 'success', 1800)} onCopy={() => { navigator.clipboard.writeText(currentRecord.fieldNote); showToast('현장훈련 연계기록이 복사되었습니다.', 'success', 1800); }} onReset={() => updateRecord({ fieldNote: '' })} />
                <InsightResult title="보호자/유관기관 공유 요약" value={currentRecord.shareSummary} onChange={value => updateRecord({ shareSummary: value })} onRewrite={() => generateInsight('share')} isRewriting={isGenerating} onSave={() => showToast('공유용 요약이 자동 저장되어 있습니다.', 'success', 1800)} onCopy={() => { navigator.clipboard.writeText(currentRecord.shareSummary); showToast('공유용 요약이 복사되었습니다.', 'success', 1800); }} onReset={() => updateRecord({ shareSummary: '' })} />
            </div>
        </div>
    );
}

function InsightResult({
    title,
    value,
    onChange,
    onRewrite,
    isRewriting,
    onSave,
    onCopy,
    onReset,
}: {
    title: string;
    value: string;
    onChange: (value: string) => void;
    onRewrite: () => void;
    isRewriting: boolean;
    onSave: () => void;
    onCopy: () => void;
    onReset: () => void;
}) {
    const hasValue = !!value.trim();
    return (
        <div className="glass-strong rounded-[2rem] p-5 border border-white/10 shadow-2xl min-h-[520px] flex flex-col">
            <div className="flex flex-col gap-3 mb-3">
                <h3 className="font-black text-white">{title}</h3>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={onRewrite} disabled={isRewriting} className="px-3 py-2 rounded-xl bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title={hasValue ? '현재 내용 기반 보완' : '새 초안 생성'}>
                        {isRewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {hasValue ? '현재 내용 기반 보완' : '새 초안 생성'}
                    </button>
                    <button onClick={onSave} disabled={!hasValue} className="px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="저장"><Save className="w-3.5 h-3.5" />저장</button>
                    <button onClick={onCopy} disabled={!hasValue} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="복사"><Copy className="w-3.5 h-3.5" />복사</button>
                    <button onClick={onReset} disabled={!hasValue} className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="초기화"><RotateCcw className="w-3.5 h-3.5" />초기화</button>
                </div>
            </div>
            <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={`${title} 결과가 여기에 표시됩니다.`} className="textarea-field !bg-black/30 flex-1 text-sm leading-relaxed resize-none" />
        </div>
    );
}

function TrainingTimelineStage({
    title,
    description,
    history,
    draft,
    setDraft,
    date,
    place,
    memo,
    onDateChange,
    onPlaceChange,
    onMemoChange,
    onGenerate,
    isGenerating,
    onSaveDraft,
    evaluation,
    setEvaluation,
    evaluationMemo,
    onEvaluationMemoChange,
    onGenerateEvaluation,
    isGeneratingEvaluation,
    onSaveEvaluation,
    onCopy,
}: {
    title: string;
    description: string;
    history: string[];
    draft: string;
    setDraft: (value: string) => void;
    date: string;
    place: string;
    memo: string;
    onDateChange: (value: string) => void;
    onPlaceChange: (value: string) => void;
    onMemoChange: (value: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    onSaveDraft: () => void;
    evaluation: string;
    setEvaluation: (value: string) => void;
    evaluationMemo: string;
    onEvaluationMemoChange: (value: string) => void;
    onGenerateEvaluation: () => void;
    isGeneratingEvaluation: boolean;
    onSaveEvaluation: () => void;
    onCopy: (text: string) => void;
}) {
    const [documentMode, setDocumentMode] = useState<'counseling' | 'evaluation'>('counseling');
    const hasHistory = history.length > 0;
    const activeText = documentMode === 'counseling' ? draft : evaluation;
    const hasDraft = !!activeText.trim();
    const isEvaluation = documentMode === 'evaluation';
    const activeGenerate = isEvaluation ? onGenerateEvaluation : onGenerate;
    const activeGenerating = isEvaluation ? isGeneratingEvaluation : isGenerating;
    const activeSetText = isEvaluation ? setEvaluation : setDraft;
    const activeSave = isEvaluation ? onSaveEvaluation : onSaveDraft;
    const activeTitle = isEvaluation ? '정기평가 생성결과' : '새 상담일지 생성결과';

    return (
        <motion.div
            layout
            className={`glass-strong rounded-[2rem] border overflow-hidden transition-all ${
                hasHistory || hasDraft ? 'border-blue-400/35 bg-blue-500/[0.04]' : 'border-white/10'
            }`}
        >
            <div className="p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${
                            hasHistory ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-200 border border-blue-400/25'
                        }`}>
                            {hasHistory ? '✓' : '2'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{title}</h2>
                            <p className="text-sm text-white/40 mt-1">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
                        <button
                            title={isEvaluation ? '정기평가 저장 확인' : '임시 상담일지 저장'}
                            onClick={activeSave}
                            disabled={!hasDraft}
                            className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                        </button>
                        <button
                            title={isEvaluation ? '정기평가 복사' : '임시 상담일지 복사'}
                            onClick={() => onCopy(activeText)}
                            disabled={!hasDraft}
                            className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <button
                            title={hasDraft ? '현재 내용 기반 보완' : '새 초안 생성'}
                            onClick={activeGenerate}
                            disabled={activeGenerating}
                            className="p-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            {activeGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                        <button
                            title="초기화"
                            onClick={() => activeSetText('')}
                            disabled={!hasDraft}
                            className="p-2 rounded-xl text-white/45 hover:text-red-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h5 className="text-[11px] font-black text-white/30 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Clock className="w-3 h-3" /> 진행 경과 요약 ({history.length}건)
                        </h5>
                        <div className="space-y-5 max-h-[760px] overflow-y-auto pr-3 custom-scrollbar border-l-2 border-white/5 pl-4 ml-2 relative">
                            {history.map((item, index) => (
                                <div key={index} className="relative">
                                    <div className="absolute -left-[23px] top-4 w-3 h-3 rounded-full border-4 border-[#12121a] bg-emerald-400" />
                                    <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-bold flex items-center gap-2 text-emerald-400">
                                                <FileText className="w-3.5 h-3.5" />
                                                상담일지
                                                <span className="text-white/20 font-normal ml-1 text-[10px]">{index + 1}회기</span>
                                            </span>
                                            <div className="flex gap-1">
                                                <button onClick={() => onCopy(item)} className="p-1.5 text-white/30 hover:text-white transition-colors" title="복사"><Copy className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={item}
                                            readOnly
                                            className="textarea-field !bg-black/20 !border-none !p-4 rounded-2xl !min-h-[220px] !max-h-[620px] text-sm leading-relaxed text-white/85 resize-y"
                                        />
                                    </div>
                                </div>
                            ))}
                            {!hasHistory && <p className="text-sm text-white/35 py-8">아직 누적된 상담일지가 없습니다. 아래 입력칸에서 첫 상담일지를 생성해 주세요.</p>}
                        </div>
                    </div>

                    {hasDraft && (
                        <div className="p-5 rounded-2xl bg-accent-500/10 border border-accent-500/30 shadow-lg shadow-accent-500/5">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                                <span className="text-xs font-bold text-accent-300 flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5" /> {activeTitle}
                                </span>
                                <div className="flex gap-2">
                                    <button onClick={activeGenerate} disabled={activeGenerating} className="px-3 py-1.5 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50" title="현재 작성칸에서 수정한 내용을 기준으로 다시 생성합니다.">
                                        {activeGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                    <button onClick={activeSave} className="px-3 py-1.5 bg-accent-500 text-white font-bold text-xs rounded-lg hover:bg-accent-600 transition-colors">{isEvaluation ? '정기평가 저장 확인' : '작성 완료(저장)'}</button>
                                    <button onClick={() => activeSetText('')} className="p-1.5 text-white/30 hover:text-red-400 transition-colors" title="닫기"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <textarea
                                value={activeText}
                                onChange={e => activeSetText(e.target.value)}
                                className="textarea-field !bg-black/30 border-accent-500/20 !min-h-[180px] !max-h-[460px] text-sm leading-relaxed font-sans resize-y"
                            />
                        </div>
                    )}

                    <div className="rounded-3xl bg-white/[0.03] border border-white/10 overflow-hidden">
                        <div className="grid grid-cols-2 border-b border-white/10">
                            <button
                                type="button"
                                onClick={() => setDocumentMode('counseling')}
                                className={`py-3 text-center text-sm font-black transition-colors ${
                                    documentMode === 'counseling' ? 'text-emerald-300 bg-emerald-500/10 border-b-2 border-emerald-400' : 'text-white/35 bg-white/[0.02] hover:text-white/70'
                                }`}
                            >
                                상담일지 추가
                            </button>
                            <button
                                type="button"
                                onClick={() => setDocumentMode('evaluation')}
                                className={`py-3 text-center text-sm font-black transition-colors ${
                                    documentMode === 'evaluation' ? 'text-emerald-300 bg-emerald-500/10 border-b-2 border-emerald-400' : 'text-white/35 bg-white/[0.02] hover:text-white/70'
                                }`}
                            >
                                정기평가 작성
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TrainingInput label={isEvaluation ? '평가일시' : '상담일시'} value={date} onChange={onDateChange} placeholder="2026년 4월 24일 14:00" />
                                <TrainingInput label={isEvaluation ? '평가장소' : '상담장소'} value={place} onChange={onPlaceChange} placeholder="훈련실 / 상담실" />
                            </div>
                            <textarea
                                value={isEvaluation ? evaluationMemo : memo}
                                onChange={e => isEvaluation ? onEvaluationMemoChange(e.target.value) : onMemoChange(e.target.value)}
                                placeholder={isEvaluation ? '목표 달성도, 변화, 미달성 사유, 다음 훈련계획에 반영할 내용을 입력하세요. 누적 상담일지와 훈련계획 흐름이 함께 반영됩니다.' : '상담 일시, 장소, 주요 대화 내용 및 진전 피드백을 입력하세요. 이전 타임라인 흐름이 함께 반영됩니다.'}
                                className="textarea-field !bg-black/30 border-white/10 !min-h-[130px] text-sm leading-relaxed"
                            />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <p className="text-xs text-white/35 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> 이전 상담/평가 기록을 참조하여 자연스럽게 연속되는 문서로 정리됩니다.
                                </p>
                                <button onClick={activeGenerate} disabled={activeGenerating} className="btn-primary flex items-center justify-center gap-2 md:min-w-[160px]">
                                    {activeGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isEvaluation ? '새 훈련 평가서 초안 생성' : '새 훈련 상담일지 초안 생성'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function TrainingStageCard({
    step,
    title,
    description,
    children,
    actions,
    result,
    setResult,
    resultPlaceholder,
    onSave,
    onCopy,
    onRewrite,
    onReset,
}: {
    step: string;
    title: string;
    description: string;
    children: React.ReactNode;
    actions: React.ReactNode;
    result: string;
    setResult: (value: string) => void;
    resultPlaceholder: string;
    onSave?: () => void;
    onCopy?: () => void;
    onRewrite?: () => void;
    onReset?: () => void;
}) {
    const hasResult = !!result.trim();

    return (
        <motion.div
            layout
            className={`glass-strong rounded-[2rem] border overflow-hidden transition-all ${
                hasResult ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-emerald-400/20'
            }`}
        >
            <div className="p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${
                            hasResult ? 'bg-emerald-500 text-white' : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/25'
                        }`}>
                            {hasResult ? '✓' : step}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{title}</h2>
                            <p className="text-sm text-white/40 mt-1">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ResultActionBar
                            hasResult={hasResult}
                            onSave={onSave}
                            onCopy={onCopy || (() => navigator.clipboard.writeText(result))}
                            onRewrite={onRewrite}
                            onReset={onReset}
                        />
                    </div>
                </div>

                {!hasResult ? (
                    <div className="rounded-3xl bg-white/[0.025] border border-white/10 p-5">
                        <div className="space-y-4">{children}</div>
                        <div className="mt-5">{actions}</div>
                    </div>
                ) : (
                    <div className="rounded-3xl bg-black/20 border border-emerald-400/15 p-5 flex flex-col min-h-[460px]">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <h3 className="font-black text-white">작성 결과</h3>
                                <p className="text-xs text-white/35 mt-1">생성된 문서만 남겼습니다. 필요하면 이 칸에서 바로 수정할 수 있습니다.</p>
                            </div>
                            <span className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-200 border border-emerald-400/20">자동저장됨</span>
                        </div>
                        <textarea
                            value={result}
                            onChange={e => setResult(e.target.value)}
                            placeholder={resultPlaceholder}
                            className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[360px] text-sm leading-relaxed resize-y"
                        />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function ClockIcon() {
    return (
        <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
            <Clock className="w-4 h-4 text-emerald-300" />
        </div>
    );
}

function TwoPane({
    title,
    description,
    children,
    actions,
    result,
    setResult,
    resultPlaceholder,
    onSave,
    onCopy,
    onRewrite,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
    actions: React.ReactNode;
    result: string;
    setResult: (value: string) => void;
    resultPlaceholder: string;
    onSave?: () => void;
    onCopy?: () => void;
    onRewrite?: () => void;
}) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <h2 className="text-2xl font-black text-white">{title}</h2>
                <p className="text-white/40 text-sm mt-1 mb-6">{description}</p>
                <div className="space-y-4">{children}</div>
                <div className="mt-6">{actions}</div>
            </div>
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl flex flex-col min-h-[680px]">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="font-black text-white">작성 결과</h3>
                    <ResultActionBar
                        hasResult={!!result.trim()}
                        onSave={onSave}
                        onCopy={onCopy || (() => navigator.clipboard.writeText(result))}
                        onRewrite={onRewrite}
                    />
                </div>
                <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    placeholder={resultPlaceholder}
                    className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[580px] text-sm leading-relaxed resize-none"
                />
            </div>
        </div>
    );
}

function ResultActionBar({
    hasResult,
    onSave,
    onCopy,
    onRewrite,
    onReset,
}: {
    hasResult: boolean;
    onSave?: () => void;
    onCopy?: () => void;
    onRewrite?: () => void;
    onReset?: () => void;
}) {
    return (
        <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
            <button
                title="저장"
                onClick={onSave}
                disabled={!hasResult || !onSave}
                className="px-3 py-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">저장</span>
            </button>
            <button
                title="복사"
                onClick={onCopy}
                disabled={!hasResult || !onCopy}
                className="px-3 py-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">복사</span>
            </button>
            <button
                title="현재 내용 기반 보완"
                onClick={onRewrite}
                disabled={!onRewrite}
                className="px-3 py-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">현재 내용 기반 보완</span>
            </button>
            <button
                title="초기화"
                onClick={onReset}
                disabled={!hasResult || !onReset}
                className="px-3 py-2 rounded-xl text-white/45 hover:text-red-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">초기화</span>
            </button>
        </div>
    );
}

function GenerateButton({ label, isGenerating, onClick }: { label: string; isGenerating: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} disabled={isGenerating} className="btn-primary w-full flex items-center justify-center gap-2">
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {label}
        </button>
    );
}

function RoomSelect({ rooms, selectedRoomId, setSelectedRoomId }: { rooms: TrainingRoom[]; selectedRoomId: string; setSelectedRoomId: (id: string) => void }) {
    return (
        <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className="input-field w-auto">
            {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
    );
}

function getTrainingRecord(records: TrainingRecordBook, traineeId: string): TrainingRecordBook[string] {
    return records[traineeId] || { plan: '', counselingDraft: '', counselingHistory: [], evaluation: '', checklist: '', fieldNote: '', shareSummary: '' };
}

function ensureProgressEntry(current?: Partial<ProgressEntry>): ProgressEntry {
    return {
        social: { checked: current?.social?.checked || false, note: current?.social?.note || '' },
        prep: { checked: current?.prep?.checked || false, note: current?.prep?.note || '' },
        job: { checked: current?.job?.checked || false, note: current?.job?.note || '' },
        field: { checked: current?.field?.checked || false, note: current?.field?.note || '' },
    };
}

function buildProgressState(current: Partial<ProgressEntry> | undefined, key: ProgramKey): ProgressEntry {
    const base = ensureProgressEntry(current);
    return { ...base, [key]: { ...base[key], checked: !base[key].checked } };
}

function TrainingInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-field" />
        </label>
    );
}

function TrainingTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="textarea-field !min-h-[108px] text-sm leading-relaxed" />
        </label>
    );
}

function StatPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 min-w-24">
            <p className="text-[11px] text-white/35 font-bold uppercase">{label}</p>
            <p className="text-xl font-black text-white">{value}</p>
        </div>
    );
}
