import { Calculator } from 'lucide-react';
import { formatWon, type PaymentCalculation } from '../../../features/supportedEmployment/calc';
import { attendanceRuleNote } from './caseEditing';
import type { SupportedEmploymentDailyLog } from '../../../features/supportedEmployment/model';

interface Props {
    payments: PaymentCalculation;
    logs: SupportedEmploymentDailyLog[];
    coachDaysBasis: 'scheduled' | 'attended';
}

/** 수당 계산 카드(D-2 #5). 편집 화면 오른쪽에 항상 보입니다. 계산은 엔진(calculatePayments) 결과를 그대로 보여 줍니다. */
export function PaymentCard({ payments, logs, coachDaysBasis }: Props) {
    const a = payments.attendance;
    return <section className="glass-card !p-5" aria-labelledby="se-payment-title" aria-live="polite">
        <h3 id="se-payment-title" className="text-lg font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-300" aria-hidden="true" /> 수당 계산
        </h3>
        <p className="text-xs text-white/55 mt-1">
            훈련일 사전 {a.preDays}일 · 현장 {a.fieldDays}일 · 계 {a.preDays + a.fieldDays}일
            {' '}(지급: 사전 {a.paidPreDays}일 · 현장 {a.paidFieldDays}일)
        </p>
        {logs.length === 0
            ? <p className="text-sm text-white/55 mt-3">훈련기간을 정하면 훈련일이 만들어지고 수당이 계산됩니다.</p>
            : <dl className="mt-3 space-y-2" data-testid="se-payment-items">
                {payments.items.map(item => <div key={item.key} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-sm text-white/80">{item.label} <span className="text-xs text-white/45">({item.payee})</span></dt>
                        <dd className="text-sm font-bold text-white">{formatWon(item.amount)}원</dd>
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">{item.formula}</p>
                </div>)}
            </dl>}
        <div className="flex items-center justify-between mt-3 border-t border-white/10 pt-3">
            <span className="text-sm text-white/70">계</span>
            <span className="text-xl font-black text-emerald-200" data-testid="se-payment-total">{formatWon(payments.total)}원</span>
        </div>
        <p className="text-xs text-white/55 mt-2 break-words">출결 환산: {attendanceRuleNote(logs)}</p>
        <p className="text-xs text-white/45 mt-1">
            훈련수당은 사전+현장 지급일, 사업주보조금은 현장 지급일만, 직무지도원수당은 {coachDaysBasis === 'attended' ? '훈련생 출석일' : '편성된 훈련일 전체'} 기준입니다.
        </p>
    </section>;
}
