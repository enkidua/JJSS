import { CheckCircle2 } from 'lucide-react';
import {
    ATTENDANCE_STATUSES,
    isAttendanceStatus,
    statusStyles,
    uncheckedStatusStyle,
    type AttendanceBook,
    type AttendanceStatus,
    type ShowToast,
    type TrainingRoom,
} from './trainingModel';
import { RoomSelect } from './TrainingUi';

type AttendanceCountKey = AttendanceStatus | '미체크';

export function AttendanceTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    attendanceDate,
    setAttendanceDate,
    attendanceBook,
    setAttendanceBook,
    showToast,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    attendanceDate: string;
    setAttendanceDate: (date: string) => void;
    attendanceBook: AttendanceBook;
    setAttendanceBook: (book: AttendanceBook | ((prev: AttendanceBook) => AttendanceBook)) => void;
    showToast: ShowToast;
}) {
    const dayBook = (attendanceDate && attendanceBook[attendanceDate]) || {};
    const getStatus = (traineeId: string): AttendanceStatus | null => {
        const value = dayBook[traineeId];
        return isAttendanceStatus(value) ? value : null;
    };

    /** 같은 상태를 한 번 더 누르면 기록을 지워 '미체크'로 되돌립니다. */
    const setStatus = (traineeId: string, status: AttendanceStatus) => {
        if (!attendanceDate || !traineeId) return;
        setAttendanceBook(prev => {
            const day = { ...(prev[attendanceDate] || {}) };
            if (day[traineeId] === status) delete day[traineeId];
            else day[traineeId] = status;
            const next = { ...prev };
            if (Object.keys(day).length > 0) next[attendanceDate] = day;
            else delete next[attendanceDate];
            return next;
        });
    };

    const counts: Record<AttendanceCountKey, number> = { 출석: 0, 지각: 0, 조퇴: 0, 결석: 0, 미체크: 0 };
    room.trainees.forEach(trainee => {
        counts[getStatus(trainee.id) || '미체크'] += 1;
    });
    const uncheckedCount = counts.미체크;

    const markAllPresent = () => {
        if (!attendanceDate) {
            showToast('출석 날짜를 먼저 선택해 주세요.', 'error');
            return;
        }
        if (uncheckedCount === 0) return;
        setAttendanceBook(prev => {
            const day = { ...(prev[attendanceDate] || {}) };
            room.trainees.forEach(trainee => {
                if (!isAttendanceStatus(day[trainee.id])) day[trainee.id] = '출석';
            });
            return { ...prev, [attendanceDate]: day };
        });
        showToast(`미체크 훈련생 ${uncheckedCount}명을 출석으로 기록했습니다.`, 'success');
    };

    const countKeys: AttendanceCountKey[] = ['출석', '지각', '조퇴', '결석', '미체크'];

    return (
        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-white">훈련실 출석관리</h2>
                    <p className="text-white/40 text-sm mt-1">훈련생별 출석, 지각, 조퇴, 결석을 체크합니다. 체크하지 않은 훈련생은 '미체크'로 남고 출석률 계산에 들어가지 않습니다.</p>
                    <p className="text-white/35 text-xs mt-1">선택한 상태를 한 번 더 누르면 미체크로 되돌아갑니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                    <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="input-field w-auto" aria-label="출석 날짜" />
                    <button
                        type="button"
                        onClick={markAllPresent}
                        disabled={!attendanceDate || uncheckedCount === 0}
                        className="btn-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="이 날짜에 아직 체크하지 않은 훈련생을 모두 출석으로 기록합니다. 이미 체크한 훈련생은 바꾸지 않습니다."
                    >
                        <CheckCircle2 className="w-4 h-4" /> 미체크 전원 출석 처리
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                {countKeys.map(key => (
                    <div key={key} className={`rounded-2xl border p-4 ${key === '미체크' ? uncheckedStatusStyle : statusStyles[key]}`}>
                        <p className="text-xs font-bold opacity-75">{key}</p>
                        <p className="text-2xl font-black mt-1">{counts[key]}명</p>
                    </div>
                ))}
            </div>

            {!attendanceDate && (
                <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100 mb-4">출석을 기록할 날짜를 먼저 선택해 주세요.</p>
            )}

            <div className="space-y-3">
                {room.trainees.map(trainee => {
                    const status = getStatus(trainee.id);
                    return (
                        <div key={trainee.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div>
                                    <p className="font-bold text-white">{trainee.name}</p>
                                    <p className="text-xs text-white/35">{room.name} · {trainee.memo || '메모 없음'}</p>
                                </div>
                                {!status && (
                                    <span className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-black ${uncheckedStatusStyle}`}>미체크</span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {ATTENDANCE_STATUSES.map(item => (
                                    <button
                                        key={item}
                                        type="button"
                                        aria-pressed={status === item}
                                        disabled={!attendanceDate}
                                        title={status === item ? '한 번 더 누르면 미체크로 되돌립니다.' : `${item}(으)로 기록`}
                                        onClick={() => setStatus(trainee.id, item)}
                                        className={`px-3 py-2 rounded-xl border text-xs font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed ${status === item ? statusStyles[item] : 'bg-white/5 text-white/35 border-white/10 hover:text-white'}`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {room.trainees.length === 0 && (
                    <p className="text-center text-white/35 py-12">이 훈련실에 등록된 훈련생이 없습니다. 훈련실관리에서 이용자를 먼저 추가해주세요.</p>
                )}
            </div>
        </div>
    );
}
