import { CopyCheck, ArrowDownToLine, CornerLeftDown } from 'lucide-react';
import {
    ATTENDANCE_STATUSES,
    type AttendanceStatus,
    type SupportedEmploymentDailyLog,
} from '../../../features/supportedEmployment/model';
import { getHolidayName, weekdayOf } from '../../../features/supportedEmployment/holidays';
import { attendanceRuleNote, copyFirstRowDown, copyFromPreviousRow, markAllPresent } from './caseEditing';

interface Props {
    logs: SupportedEmploymentDailyLog[];
    onChange: (logs: SupportedEmploymentDailyLog[]) => void;
    /** 되돌리기 어려운 일괄 변경 전 확인 */
    confirmBulk: (message: string) => Promise<boolean>;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ATTENDANCE_STYLE: Record<AttendanceStatus, string> = {
    출석: '', 지각: 'text-amber-200', 조퇴: 'text-amber-200', 결석: 'text-red-200',
};

const cell = 'px-1 py-1 align-top';
const input = 'input-field !py-1 !px-2 text-sm';

/** 훈련일지 표(D-2 #3). 행은 훈련기간에서 자동으로 만든 날짜입니다. */
export function DailyLogGrid({ logs, onChange, confirmBulk }: Props) {
    const setRow = (index: number, patch: Partial<SupportedEmploymentDailyLog>) =>
        onChange(logs.map((log, i) => (i === index ? { ...log, ...patch } : log)));

    const handleCopyDown = async () => {
        const overwrites = logs.slice(1).some(log => log.task.trim() || log.start || log.end);
        if (overwrites && !(await confirmBulk('둘째 행부터 입력한 시간·출퇴근지도·수행과제가 첫 행 내용으로 바뀝니다. 계속할까요?'))) return;
        onChange(copyFirstRowDown(logs));
    };
    const handleAllPresent = async () => {
        if (logs.some(log => log.attendance !== '출석') && !(await confirmBulk('지각·조퇴·결석으로 표시한 날이 모두 출석으로 바뀝니다. 계속할까요?'))) return;
        onChange(markAllPresent(logs));
    };

    if (!logs.length) {
        return <section className="glass-card !p-5" aria-labelledby="se-log-title">
            <h3 id="se-log-title" className="text-lg font-bold text-white">훈련일지</h3>
            <p className="text-sm text-white/55 mt-2">기본정보에서 훈련 시작·종료일을 고르면 훈련일 행이 자동으로 만들어집니다.</p>
        </section>;
    }

    return <section className="glass-card !p-5" aria-labelledby="se-log-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="se-log-title" className="text-lg font-bold text-white">훈련일지 ({logs.length}일)</h3>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1" onClick={() => void handleCopyDown()}>
                    <ArrowDownToLine className="w-4 h-4" aria-hidden="true" /> 첫 행 내용을 아래로 복사
                </button>
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1" onClick={() => void handleAllPresent()}>
                    <CopyCheck className="w-4 h-4" aria-hidden="true" /> 전체 출석 처리
                </button>
            </div>
        </div>
        <p className="text-xs text-white/55 mt-1">첫 행의 시간·과제를 입력하고 "아래로 복사"를 누르면 지도사항만 날마다 바꾸면 됩니다. 결석일은 수당에서 자동으로 빠집니다.</p>
        <p className="text-sm text-amber-100/90 mt-2" role="status">출결 환산(지각·조퇴 3회 = 결석 1일): {attendanceRuleNote(logs)}</p>
        <div className="overflow-x-auto mt-3">
            <table className="w-full min-w-[1000px] text-sm">
                <caption className="sr-only">훈련일지 입력 표</caption>
                <thead className="text-white/55 text-left border-b border-white/10">
                    <tr>
                        <th scope="col" className={`${cell} w-12`}>구분</th>
                        <th scope="col" className={`${cell} w-28`}>일자</th>
                        <th scope="col" className={`${cell} w-24`}>출결</th>
                        <th scope="col" className={`${cell} w-44`}>시작~종료</th>
                        <th scope="col" className={`${cell} w-16`}>출퇴근지도</th>
                        <th scope="col" className={cell}>수행과제</th>
                        <th scope="col" className={`${cell} w-32`}>수행정도(시간)</th>
                        <th scope="col" className={cell}>평가 및 지도사항</th>
                        <th scope="col" className={`${cell} w-10`}><span className="sr-only">이전 행 복사</span></th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log, index) => {
                        const dateLabel = `${log.date.slice(5).replace('-', '/')}(${WEEKDAYS[weekdayOf(log.date)]})`;
                        const holiday = getHolidayName(log.date);
                        return <tr key={log.date} className={`border-b border-white/5 ${log.attendance === '결석' ? 'bg-red-500/5' : ''}`}>
                            <td className={`${cell} ${log.phase === '사전' ? 'text-sky-200' : 'text-white/75'}`}>{log.phase}</td>
                            <td className={`${cell} text-white/85 whitespace-nowrap`}>{dateLabel}{holiday && <span className="block text-xs text-amber-200">{holiday}</span>}</td>
                            <td className={cell}>
                                <select aria-label={`${log.date} 출결`} className={`${input} ${ATTENDANCE_STYLE[log.attendance]}`} value={log.attendance}
                                    onChange={e => setRow(index, { attendance: e.target.value as AttendanceStatus })}>
                                    {ATTENDANCE_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </td>
                            <td className={cell}>
                                <div className="flex items-center gap-1">
                                    <input type="time" aria-label={`${log.date} 시작 시간`} className={input} value={log.start}
                                        onChange={e => setRow(index, { start: e.target.value })} />
                                    <span className="text-white/40">~</span>
                                    <input type="time" aria-label={`${log.date} 종료 시간`} className={input} value={log.end}
                                        onChange={e => setRow(index, { end: e.target.value })} />
                                </div>
                            </td>
                            <td className={`${cell} text-center`}>
                                <input type="checkbox" aria-label={`${log.date} 출퇴근지도`} checked={log.commuteGuidance}
                                    onChange={e => setRow(index, { commuteGuidance: e.target.checked })} />
                            </td>
                            <td className={cell}>
                                <input aria-label={`${log.date} 수행과제`} className={input} value={log.task} maxLength={200}
                                    onChange={e => setRow(index, { task: e.target.value })} />
                            </td>
                            <td className={cell}>
                                <input aria-label={`${log.date} 수행정도`} className={input} value={log.performanceHours} maxLength={60} placeholder="예: 80% / 30분"
                                    onChange={e => setRow(index, { performanceHours: e.target.value })} />
                            </td>
                            <td className={cell}>
                                <textarea aria-label={`${log.date} 평가 및 지도사항`} className="textarea-field !py-1 !px-2 text-sm min-h-[2.25rem]" rows={1}
                                    value={log.note} maxLength={1000} onChange={e => setRow(index, { note: e.target.value })} />
                            </td>
                            <td className={cell}>
                                {index > 0 && <button type="button" className="btn-ghost !p-1.5" title="이전 행 복사"
                                    aria-label={`${log.date} 행에 이전 행 내용 복사`} onClick={() => onChange(copyFromPreviousRow(logs, index))}>
                                    <CornerLeftDown className="w-4 h-4" aria-hidden="true" />
                                </button>}
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>
    </section>;
}
