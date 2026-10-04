import { useEffect } from 'react';
import { isUnloadPromptBypassed } from './unloadBypass';

/** 라우터 이동과 달리 창 닫기·새로고침은 동기 beforeunload로 보호한다. */
export function useBeforeUnloadGuard(dirty: boolean): void {
    useEffect(() => {
        if (!dirty) return;
        const preventUnload = (event: BeforeUnloadEvent) => {
            // 복원 직후 다시 불러오기는 확인 없이 진행한다(unloadBypass.ts 참고).
            if (isUnloadPromptBypassed()) return;
            event.preventDefault();
            // Chromium/Electron의 이전 구현에서도 미저장 상태를 전달한다.
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventUnload);
        return () => window.removeEventListener('beforeunload', preventUnload);
    }, [dirty]);
}
