import { CopyCheck, ArrowDownToLine, CornerLeftDown } from 'lucide-react';
import {
    ATTENDANCE_STATUSES,
    type AttendanceStatus,
    type SupportedEmploymentDailyLog,
} from '../../../features/supportedEmployment/model';
import { getHolidayName, weekdayOf } from '../../../features/supportedEmployment/holidays';
import { attendanceRuleNote, copyFirstRowDown, copyFromPreviousRow, markAllPresent } from './caseEditing';
import { DailyRecordingAssistant } from './DailyRecordingAssistant';

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
const input = 'input-field py-1! px-2! text-sm';

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
    const handleCopyPrevious = async (index: number) => {
        const log = logs[index];
        if ((log.start || log.end || log.task.trim() || log.performanceHours.trim() || log.commuteGuidance)
            && !(await confirmBulk('이 날짜의 시간·출퇴근지도·과제·수행정도가 이전 행 내용으로 바뀝니다. 출결과 지도사항은 유지합니다. 실제 수행정도는 날짜별로 확인해 주세요. 계속할까요?'))) return;
        onChange(copyFromPreviousRow(logs, index));
    };

    if (!logs.length) {
        return <section className="glass-card p-5! hover:transform-none!" aria-labelledby="se-log-title">
            <h3 id="se-log-title" className="text-lg font-bold text-white">훈련일지</h3>
            <p className="text-sm text-white/55 mt-2">기본정보에서 훈련 시작·종료일을 고르면 훈련일 행이 자동으로 만들어집니다.</p>
        </section>;
    }

    return <section className="glass-card p-5! hover:transform-none!" aria-labelledby="se-log-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="se-log-title" className="text-lg font-bold text-white">훈련일지 ({logs.length}일)</h3>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary px-3! py-1.5! text-sm flex items-center gap-1" onClick={() => void handleCopyDown()}>
                    <ArrowDownToLine className="w-4 h-4" aria-hidden="true" /> 첫 행 내용을 아래로 복사
                </button>
                <button type="button" className="btn-secondary px-3! py-1.5! text-sm flex items-center gap-1" onClick={() => void handleAllPresent()}>
                    <CopyCheck className="w-4 h-4" aria-hidden="true" /> 전체 출석 처리
                </button>
            </div>
        </div>
        <p className="text-xs text-white/55 mt-1">첫 행의 시간·과제를 입력하고 "아래로 복사"를 누르면 지도사항만 날마다 바꾸면 됩니다. 결석일은 수당에서 자동으로 빠집니다.</p>
        <p className="text-sm text-amber-100/90 mt-2" role="status">출결 환산(지각·조퇴 3회 = 결석 1일): {attendanceRuleNote(logs)}</p>
        <DailyRecordingAssistant logs={logs} onChange={onChange} />
        <details className="mt-2 text-sm text-white/80">
            <summary className="cursor-pointer">2026 매뉴얼 · 출결과 일지 작성 시 확인할 규칙</summary>
            <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>훈련은 1일 4~8시간 기준입니다. 4시간 이상에는 30분 이상, 8시간에는 1시간 이상의 휴식시간을 확보합니다. 현장훈련은 야간·휴일에 실시하지 않습니다.</li>
                <li>지각·조퇴·외출로 실제 출석시간이 예정 훈련시간의 50% 미만이면 결석 처리합니다. 현재 시작·종료만으로 예정시간과 실제 출석시간을 구분할 수 없으므로 담당자가 확인하여 출결을 변경하세요.</li>
                <li>출퇴근·휴식시간 동행지도는 훈련일지와 직무지도원 출근부 양쪽에 실제 내용·시간을 기록하여 확인하세요.</li>
                <li>복사된 과제·수행정도와 예정일의 출석 표시는 실제 기록을 대신하지 않습니다. 저장·출력 전에 날짜별로 확인하세요.</li>
            </ul>
            <p className="text-xs mt-2">근거: 2026년 중증장애인 지원고용사업 업무 매뉴얼의 훈련생 관리·휴게시간·직무지도원 수당 및 붙임 16·18·19. 이 안내는 자동 수당 판정이 아닙니다.</p>
        </details>
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
                                <input aria-label={`${log.date} 수행정도`} className={input} value={log.performanceHours} maxLength={60} placeholder="예: 30분, 20개 중 18개 정확"
                                    onChange={e => setRow(index, { performanceHours: e.target.value })} />
                            </td>
                            <td className={cell}>
                                <textarea aria-label={`${log.date} 평가 및 지도사항`} className="textarea-field py-1! px-2! text-sm min-h-9" rows={1}
                                    value={log.note} maxLength={1000} onChange={e => setRow(index, { note: e.target.value })} />
                            </td>
                            <td className={cell}>
                                {index > 0 && <button type="button" className="btn-ghost p-1.5!" title="이전 행 복사"
                                    aria-label={`${log.date} 행에 이전 행 내용 복사`} onClick={() => void handleCopyPrevious(index)}>
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
