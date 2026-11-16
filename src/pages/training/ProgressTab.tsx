import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import {
    buildProgressState,
    ensureProgressEntry,
    programDefinitions,
    type ProgramKey,
    type ProgressBook,
    type TrainingRoom,
} from './trainingModel';
import { RoomSelect } from './TrainingUi';

export function ProgressTab({
    room,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    progressYear,
    effectiveYear,
    setProgressYear,
    progressBook,
    setProgressBook,
}: {
    room: TrainingRoom;
    rooms: TrainingRoom[];
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    /** 입력칸에 적힌 그대로의 값(입력 중에는 비어 있거나 덜 적힌 상태일 수 있음) */
    progressYear: string;
    /** 실제로 진도를 읽고 쓰는 연도. 입력칸이 비었거나 4자리가 아니면 올해입니다(빈 연도 '' 로 저장되지 않게 함). */
    effectiveYear: string;
    setProgressYear: (year: string) => void;
    progressBook: ProgressBook;
    setProgressBook: (book: ProgressBook | ((prev: ProgressBook) => ProgressBook)) => void;
}) {
    const yearBook = progressBook[effectiveYear] || {};
    const yearInputPending = progressYear.trim() !== effectiveYear;
    const [expandedTraineeId, setExpandedTraineeId] = useState(room.trainees[0]?.id || '');

    const toggleProgram = (traineeId: string, key: ProgramKey) => {
        setProgressBook(prev => ({
            ...prev,
            [effectiveYear]: {
                ...(prev[effectiveYear] || {}),
                [traineeId]: buildProgressState(prev[effectiveYear]?.[traineeId], key),
            },
        }));
    };

    const updateProgramNote = (traineeId: string, key: ProgramKey, note: string) => {
        setProgressBook(prev => {
            const current = ensureProgressEntry(prev[effectiveYear]?.[traineeId]);
            return {
                ...prev,
                [effectiveYear]: {
                    ...(prev[effectiveYear] || {}),
                    [traineeId]: {
                        ...current,
                        [key]: { ...current[key], note },
                    },
                },
            };
        });
    };

    return (
        <div className="glass-strong rounded-4xl p-6 border border-white/10 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-white">훈련상황 진도</h2>
                    <p className="text-white/40 text-sm mt-1">연도별로 어떤 훈련프로그램을 진행했는지 자가점검합니다.</p>
                </div>
                <div className="flex flex-col lg:items-end gap-1">
                    <div className="flex flex-wrap gap-2">
                        <RoomSelect rooms={rooms} selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
                        <input
                            value={progressYear}
                            onChange={e => setProgressYear(e.target.value)}
                            placeholder={effectiveYear}
                            inputMode="numeric"
                            className="input-field w-28"
                            aria-label="기준연도"
                            aria-describedby={yearInputPending ? 'progress-year-hint' : undefined}
                        />
                    </div>
                    {yearInputPending && (
                        <p id="progress-year-hint" className="text-xs text-amber-200/90">
                            연도 4자리를 입력해 주세요. 지금은 {effectiveYear}년 기준으로 표시·저장합니다.
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {room.trainees.map(trainee => {
                    const checked = ensureProgressEntry(yearBook[trainee.id]);
                    const doneCount = programDefinitions.filter(program => checked[program.key].checked).length;
                    const isExpanded = expandedTraineeId === trainee.id;
                    return (
                        <div key={trainee.id} className={`rounded-3xl border transition-all ${isExpanded ? 'bg-emerald-500/6 border-emerald-400/25 p-5' : 'bg-white/3 border-white/10 p-4'}`}>
                            <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedTraineeId(isExpanded ? '' : trainee.id)} className="w-full flex items-center justify-between gap-3 text-left">
                                <div>
                                    <h3 className="font-black text-white">{trainee.name}</h3>
                                    <p className="text-xs text-white/35">{room.name} · {effectiveYear}년 진행 프로그램 {doneCount}/4</p>
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
                                                type="button"
                                                aria-pressed={checked[program.key].checked}
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
                                                aria-label={`${trainee.name} ${program.label} 기록`}
                                                className="textarea-field min-h-[72px]! text-xs leading-relaxed"
                                            />
                                        </div>
                                    ))}
                                </motion.div>
                            )}
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
