import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    PREMIUM_USE_CONFIRM_EVENT,
    type PremiumUseConfirmDetail,
    type PremiumUseDecision,
} from '../utils/aiUsagePrompt';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface PendingRequest extends PremiumUseConfirmDetail {
    id: number;
}

/**
 * 고성능(유료) 모델 사용 확인창.
 * 확인창이 떠 있는 동안 다른 요청이 오면 덮어쓰지 않고 순서대로 묻는다(앞 작업이 영원히 대기하지 않도록).
 */
export default function PremiumUseConfirmDialog() {
    const [queue, setQueue] = useState<PendingRequest[]>([]);
    const queueRef = useRef<PendingRequest[]>([]);
    const counterRef = useRef(0);
    const current = queue[0];

    const updateQueue = (next: PendingRequest[]) => {
        queueRef.current = next;
        setQueue(next);
    };

    useEffect(() => {
        const handleConfirmation = (event: Event) => {
            const next = (event as CustomEvent<PremiumUseConfirmDetail>).detail;
            if (!next || typeof next.resolve !== 'function') return;
            counterRef.current += 1;
            updateQueue([...queueRef.current, { ...next, id: counterRef.current }]);
        };
        window.addEventListener(PREMIUM_USE_CONFIRM_EVENT, handleConfirmation);
        return () => {
            window.removeEventListener(PREMIUM_USE_CONFIRM_EVENT, handleConfirmation);
            // 화면에서 사라지면 대기 중인 요청을 모두 취소로 끝낸다.
            const pending = queueRef.current;
            queueRef.current = [];
            pending.forEach(request => request.resolve('cancel'));
        };
    }, []);

    const finish = (decision: PremiumUseDecision) => {
        const [head, ...rest] = queueRef.current;
        if (!head) return;
        updateQueue(rest);
        head.resolve(decision);
    };

    const dialogRef = useDialogFocus(Boolean(current), () => finish('cancel'));

    if (!current) return null;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4">
            <div
                key={current.id}
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="premium-use-title"
                aria-describedby="premium-use-desc"
                tabIndex={-1}
                className="glass-card w-full max-w-lg !p-6 shadow-2xl focus:outline-none"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div>
                        <h2 id="premium-use-title" className="text-lg font-bold text-white">고성능 AI 모델을 사용하시겠습니까?</h2>
                        <p className="mt-1 text-xs text-white/45">{current.modelLabel}</p>
                    </div>
                </div>
                <p id="premium-use-desc" className="text-sm leading-relaxed text-white/70">
                    현재 작업을 계속하면 제공업체 정책에 따라 API 비용이 더 발생할 수 있습니다. JJSS는 실제 결제 금액이나 남은 크레딧을 계산하지 않습니다.
                </p>
                {queue.length > 1 && (
                    <p className="mt-2 text-xs text-white/45">확인을 기다리는 다른 작업이 {queue.length - 1}건 더 있습니다.</p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => finish('cancel')}>취소</button>
                    <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => finish('skip')}>저비용 모델 유지</button>
                    <button type="button" className="btn-primary !px-4 !py-2" onClick={() => finish('use')}>사용</button>
                </div>
            </div>
        </div>
    );
}
