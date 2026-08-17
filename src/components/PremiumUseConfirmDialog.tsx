import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    PREMIUM_USE_CONFIRM_EVENT,
    type PremiumUseConfirmDetail,
    type PremiumUseDecision,
} from '../utils/aiUsagePrompt';

export default function PremiumUseConfirmDialog() {
    const [detail, setDetail] = useState<Omit<PremiumUseConfirmDetail, 'resolve'> | null>(null);
    const resolverRef = useRef<PremiumUseConfirmDetail['resolve'] | null>(null);

    useEffect(() => {
        const handleConfirmation = (event: Event) => {
            const next = (event as CustomEvent<PremiumUseConfirmDetail>).detail;
            resolverRef.current = next.resolve;
            setDetail({ provider: next.provider, modelLabel: next.modelLabel });
        };
        window.addEventListener(PREMIUM_USE_CONFIRM_EVENT, handleConfirmation);
        return () => {
            window.removeEventListener(PREMIUM_USE_CONFIRM_EVENT, handleConfirmation);
            resolverRef.current?.('cancel');
        };
    }, []);

    const finish = (decision: PremiumUseDecision) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setDetail(null);
        resolve?.(decision);
    };

    if (!detail) return null;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="premium-use-title">
            <div className="glass-card w-full max-w-lg !p-6 shadow-2xl">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div>
                        <h2 id="premium-use-title" className="text-lg font-bold text-white">고성능 AI 모델을 사용하시겠습니까?</h2>
                        <p className="mt-1 text-xs text-white/45">{detail.modelLabel}</p>
                    </div>
                </div>
                <p className="text-sm leading-relaxed text-white/70">
                    현재 작업을 계속하면 제공업체 정책에 따라 API 비용이 더 발생할 수 있습니다. JJSS는 실제 결제 금액이나 남은 크레딧을 계산하지 않습니다.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => finish('cancel')}>취소</button>
                    <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => finish('skip')}>저비용 모델 유지</button>
                    <button type="button" className="btn-primary !px-4 !py-2" onClick={() => finish('use')}>사용</button>
                </div>
            </div>
        </div>
    );
}
