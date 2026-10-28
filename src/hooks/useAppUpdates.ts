import { useCallback, useEffect, useState } from 'react';
import type { JjssUpdateStatus } from '../types/jjssUpdates';

/**
 * 자동 업데이트 상태 구독. 브라우저 개발 모드(window.jjssUpdates 없음)에서는 null.
 * 동작(확인·내려받기·설치)은 모두 main 프로세스가 하고, 여기서는 요청과 상태 표시만 한다.
 */
export function useAppUpdates() {
    const api = typeof window === 'undefined' ? undefined : window.jjssUpdates;
    const [status, setStatus] = useState<JjssUpdateStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!api) return;
        let active = true;
        api.getStatus().then(next => { if (active) setStatus(next); }).catch(() => undefined);
        const unsubscribe = api.onStatus(next => { if (active) setStatus(next); });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [api]);

    const run = useCallback(async (action: 'check' | 'download' | 'install' | 'openDownloadPage') => {
        if (!api || busy) return;
        setBusy(true);
        try {
            const result = await api[action]();
            if (result && typeof result === 'object') setStatus(result);
        } catch {
            // main 프로세스가 상태 메시지로 알린다.
        } finally {
            setBusy(false);
        }
    }, [api, busy]);

    return { available: Boolean(api), status, busy, run };
}
