import { useState } from 'react';
import { Plus, Search, Trash2, Users } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { getStoredImageValidationError } from '../../utils/fileValidation';
import { fileToDataUrl } from '../../utils/file';
import { getSeekerKey } from '../../utils/seeker';
import {
    buildTraineeId,
    findSeekerForTrainee,
    getSeekerProfileValue,
    isSeekerAssigned,
    type ShowToast,
    type Trainee,
    type TrainingRoom,
} from './trainingModel';
import { RoomSelect, TrainingInput } from './TrainingUi';

export function TrainingRoomsTab({
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
    showToast: ShowToast;
}) {
    const room = rooms.find(item => item.id === selectedRoomId) || rooms[0];
    const [search, setSearch] = useState('');

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
        const seekerKey = getSeekerKey(seeker);
        if (!seekerKey) {
            showToast('이용자 식별정보(구직자ID)가 없어 불러올 수 없습니다. 이용자 관리에서 정보를 확인해 주세요.', 'error');
            return;
        }
        if (isSeekerAssigned(rooms, seeker)) {
            showToast('이미 훈련실에 배정된 이용자입니다.', 'info');
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
        showToast(`${seeker.name} 이용자를 훈련실에 불러왔습니다.`, 'success');
    };

    const deleteTrainee = (traineeId: string) => {
        updateRoom(room.id, prev => ({ ...prev, trainees: prev.trainees.filter(trainee => trainee.id !== traineeId) }));
        showToast('훈련실 배정만 해제했습니다. 작성된 훈련 기록은 보존됩니다.', 'info');
    };

    const updateTraineePhoto = async (traineeId: string, file?: File) => {
        if (!file) return;
        const validationError = getStoredImageValidationError(file);
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }
        try {
            const dataUrl = await fileToDataUrl(file);
            updateRoom(room.id, prev => ({
                ...prev,
                trainees: prev.trainees.map(trainee => trainee.id === traineeId ? { ...trainee, photoDataUrl: dataUrl } : trainee),
            }));
            showToast('이용자 사진을 등록했습니다.', 'success');
        } catch {
            showToast('사진 파일을 읽지 못했습니다.', 'error');
        }
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
                    <button type="button" onClick={addRoom} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> 훈련실 생성</button>
                    <button type="button" onClick={() => deleteRoom(room.id)} className="btn-ghost !bg-white/5 border border-white/10 text-red-300" title="훈련실 삭제" aria-label="훈련실 삭제"><Trash2 className="w-4 h-4" /></button>
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
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름, 장애유형, 희망직무, 약력 검색" className="input-field pl-9" aria-label="이용자 검색" />
                    </div>
                </div>
                {seekers.length === 0 ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                        먼저 이용자 관리에서 이용자를 등록해주세요. 직업훈련은 등록된 이용자를 불러온 뒤 계획, 상담, 출석, 진도 기록을 계속 누적합니다.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredSeekers.map((seeker, index) => {
                            const assigned = isSeekerAssigned(rooms, seeker);
                            return (
                                <button
                                    key={getSeekerKey(seeker) || `seeker-${index}`}
                                    type="button"
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

            <div className="space-y-3">
                <h3 className="font-black text-white">배정된 훈련생 명단</h3>
                {room.trainees.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
                        아직 배정된 훈련생이 없습니다. 위 검색에서 이용자를 찾아 명단에 추가해주세요.
                    </div>
                ) : (
                    room.trainees.map(trainee => {
                        const seeker = findSeekerForTrainee(seekers, trainee);
                        const birthDate = seeker ? getSeekerProfileValue(seeker, ['birthDate', 'birthday', 'dateOfBirth']) || (seeker.age ? `연령 ${seeker.age}` : '-') : '-';
                        const career = seeker ? getSeekerProfileValue(seeker, ['career', 'briefHistory', 'workHistory', 'profileSummary']) || seeker.notes || '-' : '-';
                        const trainingInfo = seeker ? [seeker.disabilityType, seeker.severity, seeker.desiredJob1 || seeker.desiredJob2].filter(Boolean).join(' / ') || trainee.memo || '-' : trainee.memo || '-';
                        return (
                            <div key={trainee.id} className="rounded-2xl border border-emerald-300/45 bg-emerald-500/10 p-4 shadow-[0_0_0_1px_rgba(110,231,183,0.18)]">
                                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1.2fr_auto] gap-3 lg:items-center">
                                    <div className="flex items-center gap-3">
                                        <label className="group relative w-12 h-12 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-300/60 shrink-0" title={`${trainee.name} 사진 등록`}>
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
                                                aria-label={`${trainee.name} 사진 등록`}
                                                onChange={event => {
                                                    const file = event.target.files?.[0];
                                                    event.target.value = '';
                                                    void updateTraineePhoto(trainee.id, file);
                                                }}
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
                                        <button type="button" onClick={() => deleteTrainee(trainee.id)} className="p-2 rounded-xl bg-black/20 text-red-200 hover:bg-red-500/15" title="명단에서 제거" aria-label={`${trainee.name} 명단에서 제거`}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
