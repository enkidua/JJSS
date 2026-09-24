import { useEffect, type ReactNode } from 'react';
import type { Seeker } from '../../types/matching';
import { getSeekerKey } from '../../utils/seeker';
import { useRehabWorkflowRecord, type RehabWorkflowRecord } from './useRehabWorkflowRecord';
import { WorkflowRecordStatus, WorkflowSeekerSelect } from './WorkflowRecordStatus';

interface Props {
    id: string;
    label: string;
    seekers: Seeker[];
    seekerKey: string;
    onSeekerChange: (seekerKey: string) => void;
    /** 이 영역이 사라지거나 이용자가 바뀌면 false를 보냅니다(하위 폼의 미저장 상태 초기화). */
    onDirtyChange: (dirty: boolean) => void;
    children: (seeker: Seeker, record: RehabWorkflowRecord) => ReactNode;
    className?: string;
}

/**
 * 사례관리 파이프라인 밖(적응지원 탭·매칭 탭 하단)에서 현황 기록 폼을 보여 주는 틀.
 * 이용자 선택 → 현황 기록 불러오기 → 폼 표시. 폼은 이용자마다 새로 만들어 이전 이용자의 입력이 섞이지 않습니다.
 */
export function WorkflowSeekerSection({ id, label, seekers, seekerKey, onSeekerChange, onDirtyChange, children, className = '' }: Props) {
    const seeker = seekerKey ? seekers.find(item => getSeekerKey(item) === seekerKey) ?? null : null;
    const record = useRehabWorkflowRecord(seeker);
    useEffect(() => () => onDirtyChange(false), [seekerKey, onDirtyChange]);

    return <div className={`glass-strong rounded-[2rem] border border-white/10 p-6 space-y-4 ${className}`}>
        <WorkflowSeekerSelect id={id} label={label} seekers={seekers} value={seekerKey} disabled={record.saving} onChange={onSeekerChange} />
        {!seeker
            ? <p className="text-sm text-white/55">{seekerKey ? '선택한 이용자를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.' : '이용자를 선택하면 저장된 기록을 불러옵니다.'}</p>
            : <>
                <WorkflowRecordStatus record={record} />
                {!record.loading && !record.loadFailed && <div key={seekerKey}>{children(seeker, record)}</div>}
            </>}
    </div>;
}
