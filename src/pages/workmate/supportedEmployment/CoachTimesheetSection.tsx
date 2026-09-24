import { RefreshCw } from 'lucide-react';
import type { SupportedEmploymentCoachTimesheetEntry } from '../../../features/supportedEmployment/model';
import { timeRangeHours } from '../../../features/supportedEmployment/schedule';
import { weekdayOf } from '../../../features/supportedEmployment/holidays';

interface Props {
    entries: SupportedEmploymentCoachTimesheetEntry[];
    onChange: (entries: SupportedEmploymentCoachTimesheetEntry[]) => void;
    /** 훈련일지 시간으로 모두 다시 채우기 */
    onRebuild: () => void;
    hasLogs: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const input = 'input-field !py-1 !px-2 text-sm';
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 직무지도원 출근부(D-2 #3, D-5). 훈련일지 시간에서 자동으로 채우고, 여기서 고친 값은 유지합니다. */
export function CoachTimesheetSection({ entries, onChange, onRebuild, hasLogs }: Props) {
    const setRow = (index: number, patch: Partial<SupportedEmploymentCoachTimesheetEntry>) =>
        onChange(entries.map((entry, i) => {
            if (i !== index) return entry;
            const next = { ...entry, ...patch };
            // 시간을 바꾸면 지도시간도 다시 계산(직접 고친 지도시간은 시간 칸을 바꾸기 전까지 유지)
            if ('start' in patch || 'end' in patch) next.hours = timeRangeHours(next.start, next.end);
            return next;
        }));
    const totals = entries.reduce((acc, entry) => ({
        hours: acc.hours + (entry.oneToMany ? 0 : entry.hours),
        oneToMany: acc.oneToMany + (entry.oneToMany ? entry.hours : 0),
        overtime: acc.overtime + entry.overtime,
    }), { hours: 0, oneToMany: 0, overtime: 0 });

    return <section className="glass-card !p-5" aria-labelledby="se-timesheet-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="se-timesheet-title" className="text-lg font-bold text-white">직무지도원 출근부</h3>
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1" onClick={onRebuild} disabled={!hasLogs}>
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> 훈련일지 시간으로 다시 채우기
            </button>
        </div>
        <p className="text-xs text-white/55 mt-1">훈련일지의 시작~종료 시간으로 자동 작성됩니다. 여기서 직접 고친 날은 일지를 바꿔도 그대로 둡니다.</p>
        {entries.length === 0
            ? <p className="text-sm text-white/55 mt-3">훈련일이 만들어지면 출근부도 함께 만들어집니다.</p>
            : <>
                <p className="text-sm text-white/80 mt-2">총 지도시간 {round2(totals.hours)}시간 · 1:多 {round2(totals.oneToMany)}시간 · 연장 {round2(totals.overtime)}시간</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full min-w-[640px] text-sm">
                        <caption className="sr-only">직무지도원 출근부 입력 표</caption>
                        <thead className="text-white/55 text-left border-b border-white/10">
                            <tr>
                                <th scope="col" className="px-1 py-1 w-28">일자</th>
                                <th scope="col" className="px-1 py-1 w-44">시작~종료</th>
                                <th scope="col" className="px-1 py-1 w-28">지도시간(시간)</th>
                                <th scope="col" className="px-1 py-1 w-16">1:多</th>
                                <th scope="col" className="px-1 py-1 w-28">연장(시간)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry, index) => <tr key={entry.date} className="border-b border-white/5">
                                <td className="px-1 py-1 text-white/85 whitespace-nowrap">{entry.date.slice(5).replace('-', '/')}({WEEKDAYS[weekdayOf(entry.date)]})</td>
                                <td className="px-1 py-1">
                                    <div className="flex items-center gap-1">
                                        <input type="time" aria-label={`${entry.date} 지도 시작`} className={input} value={entry.start}
                                            onChange={e => setRow(index, { start: e.target.value })} />
                                        <span className="text-white/40">~</span>
                                        <input type="time" aria-label={`${entry.date} 지도 종료`} className={input} value={entry.end}
                                            onChange={e => setRow(index, { end: e.target.value })} />
                                    </div>
                                </td>
                                <td className="px-1 py-1">
                                    <input type="number" min={0} step={0.5} aria-label={`${entry.date} 지도시간`} className={input} value={entry.hours}
                                        onChange={e => setRow(index, { hours: Math.max(0, Number(e.target.value) || 0) })} />
                                </td>
                                <td className="px-1 py-1 text-center">
                                    <input type="checkbox" aria-label={`${entry.date} 1:多 지도`} checked={entry.oneToMany}
                                        onChange={e => setRow(index, { oneToMany: e.target.checked })} />
                                </td>
                                <td className="px-1 py-1">
                                    <input type="number" min={0} step={0.5} aria-label={`${entry.date} 연장 지도시간`} className={input} value={entry.overtime}
                                        onChange={e => setRow(index, { overtime: Math.max(0, Number(e.target.value) || 0) })} />
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
            </>}
    </section>;
}
