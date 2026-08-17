import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AI_USAGE_NOTICE_EVENT, type AIUsageNoticeDetail } from '../utils/aiUsagePrompt';

export default function AIUsageNotice() {
    const [notice, setNotice] = useState<AIUsageNoticeDetail | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleNotice = (event: Event) => {
            setNotice((event as CustomEvent<AIUsageNoticeDetail>).detail);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setNotice(null), 8000);
        };
        window.addEventListener(AI_USAGE_NOTICE_EVENT, handleNotice);
        return () => {
            window.removeEventListener(AI_USAGE_NOTICE_EVENT, handleNotice);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    if (!notice) return null;

    return (
        <div className="fixed bottom-5 right-5 z-[105] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-amber-300/20 bg-slate-900/95 p-4 shadow-2xl" role="status">
            <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-sm leading-relaxed text-white/75">{notice.message}</p>
            </div>
        </div>
    );
}
