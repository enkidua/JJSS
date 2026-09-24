import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    BookOpenCheck,
    CalendarCheck2,
    ClipboardList,
    Copy,
    Dumbbell,
    Loader2,
    RotateCcw,
    Save,
    Users,
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/common/ConfirmProvider';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { localDateKey } from '../utils/date';
import { isSameSeeker } from '../utils/seeker';
import {
    copyWithToast,
    getTrainingRecord,
    initialRooms,
    sanitizeTrainingRooms,
    type GeneratingKind,
    type TrainingRoom,
    type TrainingTab,
} from './training/trainingModel';
import { useTrainingState } from './training/useTrainingState';
import { TrainingPlanTab } from './training/TrainingPlanTab';
import { TrainingRoomsTab } from './training/TrainingRoomsTab';
import { AttendanceTab } from './training/AttendanceTab';
import { ProgressTab } from './training/ProgressTab';
import { SaveStatusBadge, StatPill } from './training/TrainingUi';

const tabs: { key: TrainingTab; label: string; icon: typeof ClipboardList }[] = [
    { key: 'rooms', label: '훈련실 관리', icon: Users },
    { key: 'attendance', label: '출석 관리', icon: CalendarCheck2 },
    { key: 'progress', label: '훈련상황/진도', icon: BookOpenCheck },
    { key: 'case', label: '계획·일지·공유', icon: ClipboardList },
];

/** 다른 화면(직업재활 현황판 등)에서 넘겨주는 이동 정보 */
interface TrainingNavigationState {
    seekerId?: string;
    seekerName?: string;
    tab?: string;
    step?: string;
}

function isTrainingTab(value: unknown): value is TrainingTab {
    return typeof value === 'string' && tabs.some(tab => tab.key === value);
}

export default function WorkTraining() {
    const location = useLocation();
    const navigate = useNavigate();
    const { seekers, fetchData, initialized } = useDataStore();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const currentYear = String(new Date().getFullYear());
    const [activeTab, setActiveTab] = useState<TrainingTab>('rooms');
    const [selectedRoomId, setSelectedRoomId] = useState(initialRooms[0].id);
    const [attendanceDate, setAttendanceDate] = useState(() => localDateKey());
    const [selectedTraineeId, setSelectedTraineeId] = useState('');
    const [generating, setGenerating] = useState<GeneratingKind | null>(null);

    const handleLoaded = useCallback((loadedRooms: TrainingRoom[]) => {
        const firstRoom = loadedRooms[0];
        setSelectedRoomId(firstRoom?.id || initialRooms[0].id);
        setSelectedTraineeId(firstRoom?.trainees?.[0]?.id || '');
    }, []);

    const {
        rooms,
        setRooms,
        attendanceBook,
        setAttendanceBook,
        progressYear,
        setProgressYear,
        progressBook,
        setProgressBook,
        trainingRecords,
        setTrainingRecords,
        manager,
        setManager,
        loadState,
        reload,
        saveStatus,
        lastSavedAt,
        saveNow,
    } = useTrainingState({ showToast, defaultYear: currentYear, onLoaded: handleLoaded });

    useUnsavedGuard(
        generating !== null || saveStatus === 'error',
        generating !== null
            ? 'AI가 문서를 작성하는 중입니다.\n지금 다른 메뉴로 이동하면 작성 결과를 받을 수 없습니다. 계속할까요?'
            : '저장하지 못한 직업훈련 자료가 있습니다.\n지금 이동하면 마지막 변경 내용이 사라질 수 있습니다. 계속할까요?',
    );

    const selectedRoom = rooms.find(room => room.id === selectedRoomId) || rooms[0];
    const totalTrainees = rooms.reduce((sum, room) => sum + room.trainees.length, 0);
    const selectedTrainee = rooms.flatMap(room => room.trainees).find(trainee => trainee.id === selectedTraineeId) || null;

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!initialized || loadState !== 'ready') return;
        setRooms(prevRooms => {
            const nextRooms = sanitizeTrainingRooms(prevRooms, seekers);
            const changed = nextRooms.length !== prevRooms.length
                || nextRooms.some((room, index) => room.trainees.length !== (prevRooms[index]?.trainees?.length ?? -1));
            if (!changed) return prevRooms;
            setSelectedTraineeId(prev => {
                if (!prev) return prev;
                const exists = nextRooms.flatMap(room => room.trainees).some(trainee => trainee.id === prev);
                return exists ? prev : '';
            });
            return nextRooms;
        });
    }, [initialized, seekers, loadState, setRooms]);

    useEffect(() => {
        if (!rooms.length) return;
        if (!rooms.some(room => room.id === selectedRoomId)) {
            setSelectedRoomId(rooms[0].id);
            setSelectedTraineeId(rooms[0].trainees?.[0]?.id || '');
        }
    }, [rooms, selectedRoomId]);

    // 다른 화면에서 넘겨받은 state는 한 번만 쓰고 기록에서 지웁니다(지우지 않으면 다시 들어올 때 같은 훈련생이 또 선택됩니다).
    // 훈련 자료와 이용자 목록을 모두 불러온 뒤에 적용합니다(불러오기가 끝나면 첫 훈련실로 선택이 초기화되기 때문).
    const consumedNavigationKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const state = location.state as TrainingNavigationState | null;
        if (!state || consumedNavigationKeyRef.current === location.key) return;
        if (loadState === 'loading') return;
        const wantsSeeker = Boolean(state.seekerId);
        if (wantsSeeker && !initialized && seekers.length === 0) return;
        consumedNavigationKeyRef.current = location.key;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        if (loadState !== 'ready') return; // 불러오기 실패 화면에서는 선택을 바꾸지 않습니다.

        const requestedTab = isTrainingTab(state.tab) ? state.tab : undefined;
        if (!wantsSeeker) {
            if (requestedTab) setActiveTab(requestedTab);
            return;
        }
        const key = String(state.seekerId);
        const seekerRef = seekers.find(seeker => isSameSeeker(seeker, { id: key, seekerId: key })) || { id: key, seekerId: key };
        for (const room of rooms) {
            const trainee = room.trainees.find(item => !!item.seekerId && isSameSeeker(seekerRef, { id: item.seekerId }));
            if (trainee) {
                setSelectedRoomId(room.id);
                setSelectedTraineeId(trainee.id);
                setActiveTab(requestedTab || 'case');
                return;
            }
        }
        showToast('이 이용자는 아직 훈련실에 배정되지 않았습니다. 훈련실 관리에서 훈련생으로 추가해 주세요.', 'info', 4000);
        setActiveTab('rooms');
    }, [location.key, location.state, loadState, initialized, seekers, rooms]);

    const saveAndReport = useCallback(async (successMessage: string) => {
        const ok = await saveNow();
        if (ok) showToast(successMessage, 'success', 1800);
        return ok;
    }, [saveNow, showToast]);

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

    const deleteRoom = async (roomId: string) => {
        if (rooms.length === 1) {
            showToast('훈련실은 최소 1개가 필요합니다.', 'error');
            return;
        }
        const target = rooms.find(room => room.id === roomId);
        if (!target) return;
        const traineeCount = target.trainees.length;
        const ok = await confirm({
            title: '훈련실 삭제',
            message: `'${target.name || '이름 없는 훈련실'}'을(를) 삭제할까요?\n${traineeCount > 0 ? `배정된 훈련생 ${traineeCount}명의 훈련실 배정도 함께 해제됩니다.\n` : ''}작성된 훈련 기록(계획·상담일지·출석·진도)은 지워지지 않으며, 같은 이용자를 다른 훈련실에 다시 추가하면 이어서 볼 수 있습니다.`,
            confirmLabel: '삭제',
            tone: 'danger',
        });
        if (!ok) return;
        setRooms(prev => prev.filter(room => room.id !== roomId));
        if (selectedRoomId === roomId) {
            setSelectedRoomId(rooms.find(room => room.id !== roomId)?.id || rooms[0].id);
            setSelectedTraineeId('');
        }
        showToast('훈련실을 삭제했습니다.', 'info');
    };

    const selectRoom = (roomId: string) => {
        setSelectedRoomId(roomId);
        const nextRoom = rooms.find(room => room.id === roomId);
        setSelectedTraineeId(nextRoom?.trainees[0]?.id || '');
    };

    const copySelectedSummary = () => {
        if (!selectedTrainee) return;
        const summary = `${selectedTrainee.name} / ${selectedRoom?.name || ''} / 상담 ${getTrainingRecord(trainingRecords, selectedTraineeId).counselingHistory.length}건`;
        void copyWithToast(showToast, summary, '현재 훈련생 요약을 복사했습니다.');
    };

    return (
        <div className="min-h-screen py-8 px-4 flex flex-col items-center">
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
                            <SaveStatusBadge status={loadState === 'ready' ? saveStatus : loadState} lastSavedAt={lastSavedAt} />
                            <button
                                type="button"
                                title="훈련자료 지금 저장"
                                aria-label="훈련자료 지금 저장"
                                onClick={() => void saveAndReport('직업훈련 자료를 저장했습니다.')}
                                disabled={loadState !== 'ready' || saveStatus === 'saving'}
                                className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                title="현재 훈련생 요약 복사"
                                aria-label="현재 훈련생 요약 복사"
                                onClick={copySelectedSummary}
                                disabled={!selectedTrainee}
                                className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                title="훈련생 선택 초기화"
                                aria-label="훈련생 선택 초기화"
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
                {loadState === 'loading' && (
                    <div className="glass-strong rounded-[2rem] p-8 border border-white/10 text-center text-white/60 flex items-center justify-center gap-3" role="status">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        저장된 직업훈련 자료를 불러오는 중입니다.
                    </div>
                )}
                {loadState === 'failed' && (
                    <div className="glass-strong rounded-[2rem] p-8 border border-rose-400/30 bg-rose-500/10 text-center" role="alert">
                        <AlertTriangle className="w-8 h-8 text-rose-300 mx-auto mb-3" />
                        <p className="text-lg font-black text-white">저장된 직업훈련 자료를 불러오지 못했습니다.</p>
                        <p className="text-sm text-white/60 mt-2">기존 자료가 빈 내용으로 덮어써지지 않도록 편집과 자동 저장을 멈췄습니다. 잠시 후 다시 불러와 주세요.</p>
                        <button type="button" onClick={() => void reload()} className="btn-primary mt-5 inline-flex items-center gap-2">
                            <RotateCcw className="w-4 h-4" /> 다시 불러오기
                        </button>
                    </div>
                )}
                {loadState === 'ready' && (
                    <AnimatePresence mode="wait" initial={false}>
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
                                    manager={manager}
                                    setManager={setManager}
                                    generating={generating}
                                    setGenerating={setGenerating}
                                    saveStatus={saveStatus}
                                    onSave={saveAndReport}
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
                                    deleteRoom={roomId => void deleteRoom(roomId)}
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
                                    showToast={showToast}
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
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
