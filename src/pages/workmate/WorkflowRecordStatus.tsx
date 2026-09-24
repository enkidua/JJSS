import { Link } from 'react-router-dom';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

/** 현황 기록(useRehabWorkflowRecord)의 불러오기·저장 상태 표시. 여러 폼이 같은 모양으로 씁니다. */
export function WorkflowRecordStatus({ record }: { record: RehabWorkflowRecord }) {
    return <>
        {record.loading && <p role="status" className="text-sm text-white/60">이용자 기록을 불러오는 중...</p>}
        {record.error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <p>{record.error}</p>
            {record.corrupt && <p className="mt-1">백업 파일로 되돌리려면 <Link to={{ pathname: '/settings', hash: 'files-backup' }} className="underline text-red-100">설정 &gt; 파일·백업</Link>에서 확인해 주세요.</p>}
            {record.loadFailed && !record.loading && <button type="button" className="btn-secondary !px-4 !py-2 text-sm mt-3" onClick={record.reload}>다시 불러오기</button>}
        </div>}
        {record.notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{record.notice}</p>}
    </>;
}

interface SeekerSelectProps {
    id: string;
    label: string;
    seekers: Array<{ id?: string; seekerId: string; name: string }>;
    value: string;
    disabled?: boolean;
    onChange: (seekerKey: string) => void;
}

/** 사례관리 파이프라인 밖(적응지원·직무 비교)에서 쓰는 이용자 선택 칸 */
export function WorkflowSeekerSelect({ id, label, seekers, value, disabled, onChange }: SeekerSelectProps) {
    return <label htmlFor={id} className="block text-sm font-semibold text-white/80">{label}
        <select id={id} className="input-field mt-1" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
            <option value="">이용자를 선택하세요</option>
            {seekers.filter(seeker => seeker.id || seeker.seekerId).map(seeker => {
                const key = seeker.id || seeker.seekerId;
                return <option key={key} value={key}>{seeker.name} · {seeker.seekerId || 'ID 없음'}</option>;
            })}
        </select>
    </label>;
}
