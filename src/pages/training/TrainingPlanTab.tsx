import { useMemo, useRef } from 'react';
import { generateText } from '../../services/gemini';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { ClientContextBox } from '../../components/ClientContextBox';
import { useClientContext } from '../../hooks/useClientContext';
import type { Seeker } from '../../types/matching';
import {
    computeAttendanceStats,
    copyWithToast,
    ensureProgressEntry,
    findSeekerForTrainee,
    getTrainingRecord,
    programDefinitions,
    type AttendanceBook,
    type GeneratingKind,
    type InsightMode,
    type ProgressBook,
    type ShowToast,
    type Trainee,
    type TrainingRecord,
    type TrainingRecordBook,
    type TrainingRoom,
    type TrainingSaveStatus,
} from './trainingModel';
import { buildCounselingPrompt, buildEvaluationPrompt, buildInsightPrompt, buildPlanPrompt, buildSeekerContext } from './trainingPrompts';
import { InsightResult, TrainingStageCard } from './TrainingStageCard';
import { TrainingTimelineStage } from './TrainingTimelineStage';
import { GenerateButton, RoomSelect, StatPill, TrainingInput, TrainingTextarea } from './TrainingUi';

interface TrainingPlanTabProps {
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
    manager: string;
    setManager: (value: string) => void;
    /** 페이지 단위로 한 번에 하나의 AI 작업만 실행합니다(탭을 옮겨도 유지). */
    generating: GeneratingKind | null;
    setGenerating: (kind: GeneratingKind | null) => void;
    saveStatus: TrainingSaveStatus;
    onSave: (successMessage: string) => Promise<boolean>;
    showToast: ShowToast;
}

export function TrainingPlanTab({
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
    manager,
    setManager,
    generating,
    setGenerating,
    saveStatus,
    onSave,
    showToast,
}: TrainingPlanTabProps) {
    const confirm = useConfirm();
    const generationLockRef = useRef(false);
    const currentRecord = getTrainingRecord(trainingRecords, selectedTraineeId);
    const selectedSeeker = findSeekerForTrainee(seekers, selectedTrainee);
    // 훈련생(이용자)이 바뀌면 참고자료를 자동으로 비우고, 늦게 도착한 이전 이용자의 결과는 버립니다.
    const clientContext = useClientContext(selectedSeeker, seekers, {
        missingSeekerMessage: '정확히 연결된 이용자 정보를 먼저 선택해 주세요.',
    });
    const clientContextSummary = clientContext.summary;
    const yearBook = progressBook[progressYear] || {};
    const busy = generating !== null;

    const attendanceStats = useMemo(() => computeAttendanceStats(attendanceBook, selectedTraineeId), [attendanceBook, selectedTraineeId]);
    const progressEntry = ensureProgressEntry(selectedTraineeId ? yearBook[selectedTraineeId] : undefined);
    const donePrograms = programDefinitions.filter(program => progressEntry[program.key].checked);
    const progressRate = Math.round((donePrograms.length / programDefinitions.length) * 100);

    const updateRecordFor = (traineeId: string, patch: Partial<TrainingRecord>) => {
        if (!traineeId) return;
        setTrainingRecords(prev => ({
            ...prev,
            [traineeId]: { ...getTrainingRecord(prev, traineeId), ...patch },
        }));
    };
    const updateRecord = (patch: Partial<TrainingRecord>) => updateRecordFor(selectedTraineeId, patch);

    const confirmReset = async (label: string, patch: Partial<TrainingRecord>) => {
        const traineeId = selectedTraineeId;
        const ok = await confirm({
            title: `${label} 초기화`,
            message: `${label} 내용을 모두 지웁니다.\n자동으로 저장되므로 되돌릴 수 없습니다. 계속할까요?`,
            confirmLabel: '초기화',
            tone: 'danger',
        });
        if (ok) updateRecordFor(traineeId, patch);
    };

    const updateHistoryItem = (index: number, value: string) => {
        const traineeId = selectedTraineeId;
        if (!traineeId) return;
        setTrainingRecords(prev => {
            const record = getTrainingRecord(prev, traineeId);
            return { ...prev, [traineeId]: { ...record, counselingHistory: record.counselingHistory.map((item, i) => (i === index ? value : item)) } };
        });
    };

    const deleteHistoryItem = async (index: number) => {
        const traineeId = selectedTraineeId;
        if (!traineeId) return;
        const ok = await confirm({
            title: '상담일지 삭제',
            message: `${index + 1}회기 상담일지를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`,
            confirmLabel: '삭제',
            tone: 'danger',
        });
        if (!ok) return;
        setTrainingRecords(prev => {
            const record = getTrainingRecord(prev, traineeId);
            return { ...prev, [traineeId]: { ...record, counselingHistory: record.counselingHistory.filter((_, i) => i !== index) } };
        });
        showToast(`${index + 1}회기 상담일지를 삭제했습니다.`, 'info');
    };

    const copy = (text: string, successMessage: string) => {
        void copyWithToast(showToast, text, successMessage);
    };

    const seekerContext = buildSeekerContext(selectedTrainee, selectedSeeker, room);
    // 이 요청과 관련 있는 이름(현재 훈련생·담당자)만 비식별화 이름 사전에 더합니다.
    const requestKnownNames = [selectedTrainee?.name, manager];

    /** AI 작업 시작. 이미 다른 작업이 실행 중이면 호출하지 않습니다(각 핸들러 첫 줄에서 확인). */
    const beginGeneration = (kind: GeneratingKind) => {
        if (!selectedTrainee || !selectedTraineeId) {
            showToast('먼저 훈련실에서 훈련생을 선택해주세요.', 'error');
            return null;
        }
        generationLockRef.current = true;
        setGenerating(kind);
        return selectedTraineeId;
    };

    const endGeneration = () => {
        generationLockRef.current = false;
        setGenerating(null);
    };

    const generatePlan = async () => {
        if (generating || generationLockRef.current) return;
        const traineeId = beginGeneration('plan');
        if (!traineeId) return;
        try {
            const prompt = buildPlanPrompt({ seekerContext, record: currentRecord, manager, contextSummary: clientContextSummary });
            const generated = await generateText('rehab_plan', prompt, undefined, { featureKey: 'training', documentType: 'training-plan', knownNames: requestKnownNames });
            updateRecordFor(traineeId, { plan: generated });
            showToast('훈련계획서가 생성되었습니다.', 'success');
        } catch (error: any) {
            showToast(error?.message || '훈련계획서 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            endGeneration();
        }
    };

    const generateCounseling = async () => {
        if (generating || generationLockRef.current) return;
        const traineeId = beginGeneration('counseling');
        if (!traineeId) return;
        try {
            const prompt = buildCounselingPrompt({ seekerContext, record: currentRecord, manager, contextSummary: clientContextSummary });
            const generated = await generateText('counseling', prompt, undefined, { featureKey: 'training', documentType: 'training-counseling', knownNames: requestKnownNames });
            updateRecordFor(traineeId, { counselingDraft: generated });
            showToast('훈련 상담일지가 생성되었습니다.', 'success');
        } catch (error: any) {
            showToast(error?.message || '훈련 상담일지 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            endGeneration();
        }
    };

    const saveCounselingToHistory = () => {
        if (!currentRecord.counselingDraft.trim()) {
            showToast('붙여갈 상담일지가 없습니다.', 'error');
            return;
        }
        updateRecord({
            counselingHistory: [...currentRecord.counselingHistory, currentRecord.counselingDraft],
            counselingDraft: '',
            counselingDate: '',
            counselingPlace: '',
            counselingMemo: '',
        });
        showToast('상담일지를 아래 기록에 붙였습니다.', 'success');
    };

    const generateEvaluation = async () => {
        if (generating || generationLockRef.current) return;
        const traineeId = beginGeneration('evaluation');
        if (!traineeId) return;
        try {
            const prompt = buildEvaluationPrompt({ seekerContext, record: currentRecord, manager, contextSummary: clientContextSummary });
            const generated = await generateText('evaluation', prompt, undefined, { featureKey: 'training', documentType: 'training-evaluation', knownNames: requestKnownNames });
            updateRecordFor(traineeId, { evaluation: generated });
            showToast('훈련 정기평가서가 생성되었습니다.', 'success');
        } catch (error: any) {
            showToast(error?.message || '훈련 정기평가서 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            endGeneration();
        }
    };

    const generateInsight = async (mode: InsightMode) => {
        if (generating || generationLockRef.current) return;
        const traineeId = beginGeneration(mode);
        if (!traineeId) return;
        try {
            const prompt = buildInsightPrompt(mode, {
                seekerContext,
                record: currentRecord,
                contextSummary: clientContextSummary,
                attendanceStats,
                progressYear,
                progressEntry,
            });
            const generated = await generateText(mode === 'share' ? 'summary' : 'evaluation', prompt, undefined, { featureKey: 'training', documentType: `training-${mode}`, knownNames: requestKnownNames });
            if (mode === 'checklist') updateRecordFor(traineeId, { checklist: generated });
            if (mode === 'field') updateRecordFor(traineeId, { fieldNote: generated });
            if (mode === 'share') updateRecordFor(traineeId, { shareSummary: generated });
            showToast('훈련 성과 문서가 생성되었습니다.', 'success');
        } catch (error: any) {
            showToast(error?.message || '훈련 성과 문서 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            endGeneration();
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
                        <button key={trainee.id} type="button" onClick={() => setSelectedTraineeId(trainee.id)} className="text-left rounded-3xl bg-white/[0.03] border border-white/10 p-5 hover:bg-emerald-500/10 hover:border-emerald-400/30 transition-all">
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
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <label className="block">
                        <span className="block text-xs font-bold text-white/60 mb-1">담당자 (문서에 들어갈 이름)</span>
                        <input
                            value={manager}
                            onChange={event => setManager(event.target.value)}
                            placeholder="비워 두면 문서에 넣지 않습니다"
                            className="input-field !py-2 w-full sm:w-64"
                        />
                    </label>
                    <button type="button" onClick={() => setSelectedTraineeId('')} className="btn-ghost !bg-white/5 border border-white/10">다른 훈련생 선택</button>
                </div>
            </div>

            <ClientContextBox
                tone="emerald"
                summary={clientContext.summary}
                loading={clientContext.loading}
                onLoad={() => void clientContext.load()}
                onClear={clientContext.clear}
                disabled={busy}
            />

            <TrainingStageCard
                step="1"
                title="STEP 1. 훈련계획 수립"
                description="선택된 이용자 정보를 기준으로 직업훈련 특화 계획서를 작성합니다."
                result={currentRecord.plan}
                setResult={value => updateRecord({ plan: value })}
                resultPlaceholder="AI가 작성한 직업훈련계획서가 여기에 표시됩니다."
                saveStatus={saveStatus}
                onSave={() => void onSave('훈련계획서를 저장했습니다.')}
                onCopy={() => copy(currentRecord.plan, '훈련계획서가 복사되었습니다.')}
                onRewrite={generatePlan}
                isRewriting={generating === 'plan'}
                rewriteDisabled={busy}
                onReset={() => void confirmReset('훈련계획서', { plan: '' })}
                actions={<GenerateButton label="새 훈련계획서 초안 생성" isGenerating={generating === 'plan'} disabled={busy} onClick={generatePlan} />}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TrainingInput label="훈련기간" value={currentRecord.trainingPeriod} onChange={v => updateRecord({ trainingPeriod: v })} placeholder="2026.04.01~2026.12.31" />
                    <TrainingInput label="훈련실" value={currentRecord.planRoom} onChange={v => updateRecord({ planRoom: v })} placeholder={room.name || '직업적응훈련 1실'} />
                </div>
                <TrainingTextarea label="훈련계획 간략 입력" value={currentRecord.planMemo} onChange={v => updateRecord({ planMemo: v })} placeholder="현재 수행수준, 필요한 지원, 목표, 진행할 프로그램을 짧게 적어주세요. 예: 출석은 안정적이나 작업속도가 느림. 직업준비훈련과 직무능력향상훈련 중심으로 반복지도 필요. 연말까지 보호작업장 전환 목표." />
            </TrainingStageCard>

            <TrainingTimelineStage
                title="STEP 2. 상담일지 연속 작성"
                description="훈련계획을 기준으로 상담일지를 계속 추가하고 전체 흐름을 타임라인으로 관리합니다."
                history={currentRecord.counselingHistory}
                onHistoryChange={updateHistoryItem}
                onHistoryDelete={index => void deleteHistoryItem(index)}
                draft={currentRecord.counselingDraft}
                setDraft={value => updateRecord({ counselingDraft: value })}
                onResetDraft={() => void confirmReset('상담일지 생성결과', { counselingDraft: '' })}
                date={currentRecord.counselingDate}
                place={currentRecord.counselingPlace}
                memo={currentRecord.counselingMemo}
                onDateChange={value => updateRecord({ counselingDate: value })}
                onPlaceChange={value => updateRecord({ counselingPlace: value })}
                onMemoChange={value => updateRecord({ counselingMemo: value })}
                onGenerate={generateCounseling}
                isGenerating={generating === 'counseling'}
                busy={busy}
                onSaveDraft={saveCounselingToHistory}
                evaluation={currentRecord.evaluation}
                setEvaluation={value => updateRecord({ evaluation: value })}
                onResetEvaluation={() => void confirmReset('정기평가서', { evaluation: '' })}
                evaluationMemo={currentRecord.evaluationMemo}
                onEvaluationMemoChange={value => updateRecord({ evaluationMemo: value })}
                onGenerateEvaluation={generateEvaluation}
                isGeneratingEvaluation={generating === 'evaluation'}
                onSaveEvaluation={() => void onSave('훈련 정기평가서를 저장했습니다.')}
                onCopy={text => copy(text, '문서가 복사되었습니다.')}
            />

            <div className="glass-strong rounded-[2rem] p-6 border border-emerald-400/15 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
                    <div>
                        <h3 className="text-xl font-black text-white">STEP 4. 성과·공유관리</h3>
                        <p className="text-sm text-white/45 mt-1">계획, 상담, 평가, 출석, 진도를 한 번에 묶어 공유용 기록을 작성합니다.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatPill label="출석률" value={attendanceStats.total ? `${attendanceStats.attendanceRate}%` : '기록 없음'} />
                        <StatPill label="진도" value={`${progressRate}%`} />
                        <StatPill label="상담" value={`${currentRecord.counselingHistory.length}건`} />
                    </div>
                </div>
                <TrainingTextarea label="성과관리 보충 메모" value={currentRecord.insightMemo} onChange={value => updateRecord({ insightMemo: value })} placeholder="최근 변화, 보호자 공유 필요사항, 현장훈련 전환 가능성, 위험요인 등을 짧게 적어주세요." />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
                    <GenerateButton label="새 체크리스트/목표달성률 초안 생성" isGenerating={generating === 'checklist'} disabled={busy} onClick={() => generateInsight('checklist')} />
                    <GenerateButton label="새 현장훈련 연계기록 초안 생성" isGenerating={generating === 'field'} disabled={busy} onClick={() => generateInsight('field')} />
                    <GenerateButton label="새 공유용 요약 초안 생성" isGenerating={generating === 'share'} disabled={busy} onClick={() => generateInsight('share')} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
                    <InsightResult
                        title="작업수행 체크리스트"
                        value={currentRecord.checklist}
                        onChange={value => updateRecord({ checklist: value })}
                        onRewrite={() => generateInsight('checklist')}
                        isRewriting={generating === 'checklist'}
                        busy={busy}
                        onSave={() => void onSave('체크리스트를 저장했습니다.')}
                        onCopy={() => copy(currentRecord.checklist, '체크리스트가 복사되었습니다.')}
                        onReset={() => void confirmReset('작업수행 체크리스트', { checklist: '' })}
                    />
                    <InsightResult
                        title="현장중심 직업훈련 기록"
                        value={currentRecord.fieldNote}
                        onChange={value => updateRecord({ fieldNote: value })}
                        onRewrite={() => generateInsight('field')}
                        isRewriting={generating === 'field'}
                        busy={busy}
                        onSave={() => void onSave('현장훈련 연계기록을 저장했습니다.')}
                        onCopy={() => copy(currentRecord.fieldNote, '현장훈련 연계기록이 복사되었습니다.')}
                        onReset={() => void confirmReset('현장중심 직업훈련 기록', { fieldNote: '' })}
                    />
                    <InsightResult
                        title="보호자/유관기관 공유 요약"
                        value={currentRecord.shareSummary}
                        onChange={value => updateRecord({ shareSummary: value })}
                        onRewrite={() => generateInsight('share')}
                        isRewriting={generating === 'share'}
                        busy={busy}
                        onSave={() => void onSave('공유용 요약을 저장했습니다.')}
                        onCopy={() => copy(currentRecord.shareSummary, '공유용 요약이 복사되었습니다.')}
                        onReset={() => void confirmReset('공유용 요약', { shareSummary: '' })}
                    />
                </div>
            </div>
        </div>
    );
}
