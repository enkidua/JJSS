import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { useRehabWorkflowRecord } from './useRehabWorkflowRecord';
import { WorkflowRecordStatus } from './WorkflowRecordStatus';
import { FollowUpTasks } from './FollowUpTasks';
import { GoalTracking } from './GoalTracking';
import { ParticipantPlanSection } from './ParticipantPlanSection';

const REVIEW_LABELS = { not_reviewed: '당사자 확인 전', discussed: '함께 논의함', agreed: '당사자 동의 확인', changes_requested: '당사자 수정 요청' } as const;

interface Props {
    seeker: Seeker;
    open: boolean;
    onToggle: () => void;
    /** 세 입력 폼 중 하나라도 저장하지 않은 내용이 있으면 true. 패널이 사라질 때 false를 보냅니다. */
    onDirtyChange: (dirty: boolean) => void;
}

type FormKey = 'tasks' | 'goals' | 'participant';

/**
 * 사례관리 파이프라인 아래 "후속 일정·목표·당사자 확인" 접이식 패널.
 * 세 폼이 현황 기록 하나(useRehabWorkflowRecord)를 함께 쓰므로 서로의 저장 내용을 덮어쓰지 않습니다.
 * 접어도 폼을 없애지 않아(hidden) 입력 중인 내용이 유지됩니다.
 */
export function WorkflowPanel({ seeker, open, onToggle, onDirtyChange }: Props) {
    const record = useRehabWorkflowRecord(seeker);
    const [dirty, setDirty] = useState<Record<FormKey, boolean>>({ tasks: false, goals: false, participant: false });
    const sectionRef = useRef<HTMLElement>(null);
    const reportDirty = useMemo(() => {
        const make = (key: FormKey) => (value: boolean) =>
            setDirty(current => (current[key] === value ? current : { ...current, [key]: value }));
        return { tasks: make('tasks'), goals: make('goals'), participant: make('participant') };
    }, []);
    const anyDirty = dirty.tasks || dirty.goals || dirty.participant;

    useEffect(() => { onDirtyChange(anyDirty); }, [anyDirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
    // 다른 화면에서 "일정 추가·편집"으로 넘어온 경우 패널이 열린 채로 나타나므로 패널 위치로 이동합니다.
    useEffect(() => {
        if (open) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const { workflow } = record;
    const openTaskCount = workflow.tasks.filter(task => !task.done).length;
    const ready = !record.loading && !record.loadFailed;

    return <section id="workflow-panel" ref={sectionRef} className="glass-strong rounded-[2rem] border border-white/10 p-6 scroll-mt-24" aria-labelledby="workflow-panel-title">
        <button type="button" aria-expanded={open} aria-controls="workflow-panel-body" onClick={onToggle}
            className="w-full flex flex-wrap items-center justify-between gap-3 text-left">
            <span id="workflow-panel-title" className="text-lg font-black text-white flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-accent-300" aria-hidden="true" /> 후속 일정·목표·당사자 확인
            </span>
            <span className="flex items-center gap-2 text-sm text-white/60">
                {ready && `진행 중 일정 ${openTaskCount}건 · 목표 ${workflow.goals.length}개 · ${REVIEW_LABELS[workflow.participantPlan.reviewStatus]}`}
                {anyDirty && <span className="text-amber-200">· 저장 안 한 입력 있음</span>}
                <ChevronDown className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </span>
        </button>
        <div id="workflow-panel-body" hidden={!open} className="mt-6 space-y-8">
            <p className="text-sm text-white/55">직업재활 현황판에 표시되는 후속 일정·목표 변화·당사자 확인 기록을 여기서 작성합니다.</p>
            <WorkflowRecordStatus record={record} />
            {ready && <>
                <FollowUpTasks record={record} onDirtyChange={reportDirty.tasks} />
                <div className="border-t border-white/10" />
                <GoalTracking record={record} onDirtyChange={reportDirty.goals} />
                <div className="border-t border-white/10" />
                <ParticipantPlanSection record={record} onDirtyChange={reportDirty.participant} />
            </>}
        </div>
    </section>;
}
