import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import RehabDueBoard from '../components/RehabDueBoard';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useSeekerOverview } from './overview/useSeekerOverview';
import { SeekerPicker } from './overview/SeekerPicker';
import { SeekerHeader } from './overview/SeekerHeader';
import { StatusCards } from './overview/StatusCards';
import { NextActions } from './overview/NextActions';
import { CaseTimeline } from './overview/CaseTimeline';
import { GoalProgress } from './overview/GoalProgress';
import { SituationNote } from './overview/SituationNote';

const NOTE_UNSAVED_MESSAGE = '저장하지 않은 "현재 상황 정리" 메모가 있습니다.\n이동하면 작성한 내용이 사라집니다. 계속할까요?';

/** 직업재활 현황판: 이용자 한 명의 상황을 한눈에 보는 읽기 전용 대시보드(입력은 각 서비스 화면에서). */
export default function RehabWorkflow() {
    const seekers = useDataStore(state => state.seekers);
    const seekersReady = useDataStore(state => state.initialized);
    const [params, setParams] = useSearchParams();
    const selectedId = params.get('seekerId') || '';
    const overview = useSeekerOverview(selectedId);
    const { seeker, record } = overview;
    const [noteDirty, setNoteDirty] = useState(false);
    const { confirmDiscard } = useUnsavedGuard(noteDirty, NOTE_UNSAVED_MESSAGE);

    async function selectSeeker(nextId: string) {
        if (nextId === selectedId) return;
        if (!(await confirmDiscard())) return;
        setParams(nextId ? { seekerId: nextId } : {});
    }

    return (
        <main className="min-h-screen px-4 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div>
                    <div className="flex items-center gap-2 text-accent-300 text-sm mb-2"><ClipboardList className="w-4 h-4" aria-hidden="true" /> 이용자별 업무 현황</div>
                    <h1 className="section-title">직업재활 현황판</h1>
                    <p className="text-white/60 mt-2">평가·훈련·고용지원 기록을 이용자별로 모아 보여 줍니다. 기록 작성은 각 서비스 화면에서 합니다.</p>
                </div>

                <SeekerPicker seekers={seekers} ready={seekersReady} selectedId={selectedId} selectedFound={!!seeker}
                    onSelect={id => { void selectSeeker(id); }} />

                {!selectedId && <RehabDueBoard seekers={seekers} onSelect={id => { void selectSeeker(id); }} />}

                {seeker && overview.loading && <p role="status" className="text-white/60">이용자 기록을 불러오는 중...</p>}

                {seeker && !overview.loading && overview.loadFailed && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    <p>이용자 기록을 불러오지 못했습니다. 기존 기록은 지우지 않았습니다.</p>
                    <button type="button" className="btn-secondary !px-4 !py-2 text-sm mt-3" onClick={overview.reload}>다시 불러오기</button>
                </div>}

                {seeker && !overview.loading && !overview.loadFailed && <>
                    {record.error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        <p>{record.error}</p>
                        {record.corrupt && <p className="mt-1">백업 파일로 되돌리려면 <Link to={{ pathname: '/settings', hash: 'files-backup' }} className="underline text-red-100">설정 &gt; 파일·백업</Link>에서 확인해 주세요.</p>}
                    </div>}
                    {record.notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{record.notice}</p>}

                    <SeekerHeader seeker={seeker} stage={overview.stage} />
                    <StatusCards seeker={seeker} evaluation={overview.evaluation} training={overview.training} employment={overview.employment} />
                    <NextActions seeker={seeker} actions={overview.nextActions} disabled={record.unavailable}
                        onComplete={taskId => { void overview.completeTask(taskId); }} />
                    <CaseTimeline key={seeker.id} entries={overview.timeline} />
                    <GoalProgress seeker={seeker} goals={record.workflow.goals} />
                    <SituationNote key={seeker.id} note={record.workflow.situationNote} disabled={record.unavailable} saving={record.saving}
                        onSave={overview.saveSituationNote} buildPrompt={overview.buildSummaryPrompt} onDirtyChange={setNoteDirty} />
                </>}
            </div>
        </main>
    );
}
