import { useEffect, useRef } from 'react';

/**
 * 하위 화면의 "저장하지 않은 입력/결과" 여부를 부모 페이지에 알립니다(계약 C5).
 * 부모가 매 렌더마다 새 콜백을 넘겨도 dirty 값이 바뀔 때만 호출하며, 화면이 사라지면 false를 보냅니다.
 */
export function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
    const callbackRef = useRef(onDirtyChange);
    callbackRef.current = onDirtyChange;

    useEffect(() => {
        callbackRef.current?.(dirty);
    }, [dirty]);

    useEffect(() => () => callbackRef.current?.(false), []);
}
