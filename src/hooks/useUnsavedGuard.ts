import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../components/common/ConfirmProvider';

const DEFAULT_MESSAGE = '저장하지 않은 내용이 있습니다.\n이 화면을 떠나면 작성한 내용이 사라집니다. 계속할까요?';

/**
 * 저장하지 않은 내용이 있을 때 다른 메뉴로 이동하면 확인창을 띄웁니다.
 *
 * 주의: React Router는 blocker를 한 번에 하나만 지원합니다. 이 훅은 "페이지 컴포넌트"에서만 호출하고,
 * 하위 컴포넌트는 `onDirtyChange(dirty)` prop으로 상태를 페이지에 올려 주세요.
 *
 * 반환하는 confirmDiscard()는 탭 전환·뒤로가기·이용자 전환처럼 라우트 이동이 아닌 동작 전에 호출합니다.
 */
export function useUnsavedGuard(dirty: boolean, message: string = DEFAULT_MESSAGE) {
    const confirm = useConfirm();
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
    const blockerRef = useRef(blocker);
    blockerRef.current = blocker;

    useEffect(() => {
        if (blocker.state !== 'blocked') return;
        let settled = false;
        void confirm({ title: '저장하지 않은 내용', message, confirmLabel: '나가기', cancelLabel: '계속 작성', tone: 'danger' }).then(ok => {
            if (settled) return;
            settled = true;
            const current = blockerRef.current;
            if (current.state !== 'blocked') return;
            if (ok) current.proceed();
            else current.reset();
        });
        return () => { settled = true; };
    }, [blocker.state, confirm, message]);

    const confirmDiscard = useCallback(async (customMessage?: string) => {
        if (!dirty) return true;
        return confirm({ title: '저장하지 않은 내용', message: customMessage || message, confirmLabel: '버리고 계속', cancelLabel: '취소', tone: 'danger' });
    }, [confirm, dirty, message]);

    return { confirmDiscard };
}
