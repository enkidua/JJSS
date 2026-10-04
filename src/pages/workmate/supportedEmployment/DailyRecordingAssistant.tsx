import { useState } from 'react';
import type { SupportedEmploymentDailyLog } from '../../../features/supportedEmployment/model';
import { appendRecordingOutline, missingRecordFields } from '../../../features/supportedEmployment/recording';

interface Props {
    logs: SupportedEmploymentDailyLog[];
    onChange: (logs: SupportedEmploymentDailyLog[]) => void;
}

/** 표와 같은 데이터를 편집하므로 별도 저장소·AI 전송·자동 출결 처리가 없다. */
export function DailyRecordingAssistant({ logs, onChange }: Props) {
    const [date, setDate] = useState('');
    const [message, setMessage] = useState('');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const due = logs.filter(log => log.date <= today && missingRecordFields(log).length);
    const log = logs.find(item => item.date === date) ?? logs.find(item => item.date === today) ?? due[0] ?? logs[0];
    if (!log) return null;
    const update = (patch: Partial<SupportedEmploymentDailyLog>) => {
        setDate(log.date);
        setMessage('');
        onChange(logs.map(item => item.date === log.date ? { ...item, ...patch } : item));
    };
    const missing = missingRecordFields(log);
    return <details className="mt-3 rounded-lg border border-white/15 p-3">
        <summary className="cursor-pointer text-sm text-sky-100">하루 기록 도우미 · 오늘까지 보완할 기록 {due.length}일</summary>
        <p className="text-xs text-white/70 mt-2">표가 좁을 때 날짜별로 편하게 작성하세요. 아래 입력은 기존 일지에 바로 반영되며, 회차 저장 버튼으로 저장합니다. 작성 여부 안내는 출석·수당 확정이 아닙니다.</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="text-sm">기록 날짜 <select className="input-field w-auto!" value={log.date} onChange={e => { setDate(e.target.value); setMessage(''); }}>
                {logs.map(item => <option key={item.date} value={item.date}>{item.date} · {item.phase} · {item.attendance}{item.date > today ? ' (예정)' : ''}</option>)}
            </select></label>
            <button type="button" className="btn-secondary text-sm" disabled={!due.length} onClick={() => {
                const next = due.find(item => item.date > log.date) ?? due[0];
                if (next) setDate(next.date);
                setMessage('');
            }}>다음 미작성 기록</button>
        </div>
        <p className="text-xs text-amber-100 mt-2">{missing.length ? `확인할 항목: ${missing.join(', ')}` : '기본 항목이 입력되었습니다. 실제 내용과 출결은 담당자가 확인하세요.'}</p>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
            <label className="text-sm">수행과제<input className="input-field mt-1" value={log.task} maxLength={200} onChange={e => update({ task: e.target.value })} placeholder="실제로 수행한 작업과 단계" /></label>
            <label className="text-sm">수행정도 · 측정시간<input className="input-field mt-1" value={log.performanceHours} maxLength={60} onChange={e => update({ performanceHours: e.target.value })} placeholder="예: 30분 동안 20개 중 18개 정확 수행" /></label>
        </div>
        <label className="block text-sm mt-3">평가 및 지도사항
            <textarea aria-label="평가 및 지도사항" className="textarea-field mt-1" rows={7} value={log.note} maxLength={1000} onChange={e => update({ note: e.target.value })} placeholder="관찰한 사실 → 실시한 지원 → 변화 → 다음 확인사항 순서로 기록하세요." />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <button type="button" className="btn-secondary text-sm" onClick={() => {
                const note = appendRecordingOutline(log.note);
                if (note === null) { setMessage('1,000자를 초과하여 틀을 추가하지 않았습니다. 기존 기록은 유지됩니다.'); return; }
                update({ note });
                setMessage('기록 끝에 빈 작성 틀을 추가했습니다. 실제 관찰 내용을 채워 주세요.');
            }}>기존 기록 뒤에 작성 틀 추가</button>
            <span>{log.note.length}/1,000자</span>
            <span role="status">{message}</span>
        </div>
        <p className="text-xs text-white/70 mt-2">매뉴얼 붙임 18 참고: 정확성·속도·도구 사용, 작업태도·대인관계·기본규칙, 지도 후 변화와 지속 지원을 기록합니다. 출퇴근·휴식시간 지도는 실제 실시 내용과 시간을 기록하고 출근부와 대조하세요. 개선이 없으면 다음 지원 방안을 남기세요.</p>
    </details>;
}
