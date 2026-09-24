import { Copy, Plus, Trash2 } from 'lucide-react';
import { calculatePayments, formatWon } from '../../../features/supportedEmployment/calc';
import type { SupportedEmploymentCase } from '../../../features/supportedEmployment/model';

interface Props {
    cases: SupportedEmploymentCase[];
    loading: boolean;
    error: string;
    busy: boolean;
    onRetry: () => void;
    onCreate: () => void;
    onOpen: (id: string) => void;
    onCopy: (item: SupportedEmploymentCase) => void;
    onDelete: (item: SupportedEmploymentCase) => void;
}

const STATUS_STYLES: Record<string, string> = {
    진행중: 'bg-sky-500/15 text-sky-200',
    수료: 'bg-emerald-500/15 text-emerald-200',
    취업: 'bg-amber-500/15 text-amber-200',
    중단: 'bg-white/10 text-white/60',
};

const periodText = (item: SupportedEmploymentCase) =>
    item.period.start || item.period.end ? `${item.period.start || '?'} ~ ${item.period.end || '?'}` : '기간 미정';

/** 회차 목록(D-2 #1) */
export function CaseList({ cases, loading, error, busy, onRetry, onCreate, onOpen, onCopy, onDelete }: Props) {
    return <section className="glass-card !p-5" aria-labelledby="se-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 id="se-list-title" className="text-xl font-bold text-white">지원고용 회차</h2>
                <p className="text-sm text-white/55 mt-1">회차를 누르면 훈련일지·평가기록부·수당 계산·결과보고 출력을 이어서 작성합니다.</p>
            </div>
            <button type="button" className="btn-primary !px-4 !py-2 flex items-center gap-2" onClick={onCreate} disabled={busy || loading}>
                <Plus className="w-4 h-4" aria-hidden="true" /> 새 회차
            </button>
        </div>
        {loading ? <p role="status" className="text-sm text-white/55 mt-4">회차 목록을 불러오는 중...</p>
            : error ? <div role="alert" className="mt-4 text-sm text-red-200">{error} <button type="button" className="underline ml-2" onClick={onRetry}>다시 불러오기</button></div>
                : cases.length === 0 ? <p className="text-sm text-white/55 mt-4">아직 등록한 회차가 없습니다. "새 회차"를 눌러 시작하세요.</p>
                    : <div className="overflow-x-auto mt-4">
                        <table className="w-full text-sm text-left">
                            <thead className="text-white/55 border-b border-white/10">
                                <tr>
                                    <th scope="col" className="py-2 pr-3 font-medium">회차</th>
                                    <th scope="col" className="py-2 pr-3 font-medium">이용자</th>
                                    <th scope="col" className="py-2 pr-3 font-medium">사업체</th>
                                    <th scope="col" className="py-2 pr-3 font-medium">기간</th>
                                    <th scope="col" className="py-2 pr-3 font-medium">상태</th>
                                    <th scope="col" className="py-2 pr-3 font-medium text-right">계(원)</th>
                                    <th scope="col" className="py-2 font-medium"><span className="sr-only">작업</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {cases.map(item => {
                                    const total = calculatePayments(item, { coachDaysBasis: item.documentOptions?.coachDaysBasis }).total;
                                    return <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-2 pr-3">
                                            <button type="button" className="text-accent-200 font-bold hover:underline" onClick={() => onOpen(item.id)} disabled={busy}
                                                aria-label={`${item.round}차 회차 열기`}>{item.round ? `${item.round}차` : '회차 미정'}</button>
                                        </td>
                                        <td className="py-2 pr-3 text-white/85">{item.seekerName || '-'}</td>
                                        <td className="py-2 pr-3 text-white/85">{item.employerName || '-'}</td>
                                        <td className="py-2 pr-3 text-white/70 whitespace-nowrap">{periodText(item)}</td>
                                        <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[item.status] || ''}`}>{item.status}</span></td>
                                        <td className="py-2 pr-3 text-right text-white font-semibold">{formatWon(total)}</td>
                                        <td className="py-2 whitespace-nowrap text-right">
                                            <button type="button" className="btn-ghost !px-2 !py-1 text-xs inline-flex items-center gap-1" onClick={() => onCopy(item)} disabled={busy}
                                                aria-label={`${item.round}차를 다음 회차로 복사`}>
                                                <Copy className="w-3.5 h-3.5" aria-hidden="true" /> 다음 회차로 복사
                                            </button>
                                            <button type="button" className="btn-ghost !px-2 !py-1 text-xs inline-flex items-center gap-1 text-red-200" onClick={() => onDelete(item)} disabled={busy}
                                                aria-label={`${item.round}차 삭제`}>
                                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> 삭제
                                            </button>
                                        </td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>}
    </section>;
}
