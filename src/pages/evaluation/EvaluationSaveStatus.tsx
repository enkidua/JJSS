import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Tracker = (id: symbol, dirty: boolean | null) => void;
const SaveStatus = createContext<{ dirty: boolean; track: Tracker }>({ dirty: false, track: () => {} });

/** 페이지 안의 여러 독립 저장 큐를 하나의 메뉴 이동 보호에 연결한다. */
export function EvaluationSaveStatusProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<Set<symbol>>(() => new Set());
    const track = useCallback<Tracker>((id, dirty) => {
        setPending(current => {
            if (current.has(id) === Boolean(dirty)) return current;
            const next = new Set(current);
            if (dirty) next.add(id); else next.delete(id);
            return next;
        });
    }, []);
    const value = useMemo(() => ({ dirty: pending.size > 0, track }), [pending, track]);
    return <SaveStatus.Provider value={value}>{children}</SaveStatus.Provider>;
}

export const useEvaluationSaveStatus = () => useContext(SaveStatus);

export function useEvaluationSaveTracker(dirty: boolean): void {
    const { track } = useContext(SaveStatus);
    const id = useRef(Symbol('evaluation-save')).current;
    useEffect(() => { track(id, dirty); }, [dirty, id, track]);
    useEffect(() => () => { track(id, null); }, [id, track]);
}
