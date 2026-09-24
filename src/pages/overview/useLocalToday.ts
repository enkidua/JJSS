import { useEffect, useState } from 'react';
import { localDateKey } from '../../utils/date';

/** 자정이 지나거나 창을 다시 볼 때 오늘 날짜를 새로 계산합니다(앱을 며칠 켜 두어도 기한 표시가 맞도록). */
export function useLocalToday(): string {
    const [today, setToday] = useState(() => localDateKey());
    useEffect(() => {
        const refresh = () => setToday(current => {
            const next = localDateKey();
            return next === current ? current : next;
        });
        const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
        const timer = window.setInterval(refresh, 60_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
    return today;
}
