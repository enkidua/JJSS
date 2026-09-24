import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export interface ConfirmOptions {
    title?: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** 'danger'는 삭제·초기화·덮어쓰기처럼 되돌릴 수 없는 동작에 사용합니다. */
    tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

interface PendingConfirm { id: number; options: ConfirmOptions; resolve: (value: boolean) => void }

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * window.confirm 대체 확인창. 요청이 겹치면 덮어쓰지 않고 순서대로 표시합니다.
 * Provider 밖에서 호출되면 window.confirm으로 대체합니다.
 */
export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    return useMemo<ConfirmFn>(() => confirm ?? (async options => {
        const opts = typeof options === 'string' ? { message: options } : options;
        return window.confirm(typeof opts.message === 'string' ? opts.message : (opts.title || '계속할까요?'));
    }), [confirm]);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<PendingConfirm[]>([]);
    const counter = useRef(0);

    const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>(resolve => {
        const normalized = typeof options === 'string' ? { message: options } : options;
        counter.current += 1;
        setQueue(prev => [...prev, { id: counter.current, options: normalized, resolve }]);
    }), []);

    const current = queue[0];
    const settle = useCallback((value: boolean) => {
        setQueue(prev => {
            const [head, ...rest] = prev;
            head?.resolve(value);
            return rest;
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {current && <ConfirmDialog key={current.id} options={current.options} onSettle={settle} />}
        </ConfirmContext.Provider>
    );
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (value: boolean) => void }) {
    const dialogRef = useDialogFocus(true, () => onSettle(false));
    const danger = options.tone === 'danger';
    const titleId = 'jjss-confirm-title';
    const descId = 'jjss-confirm-desc';
    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onSettle(false); }}>
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                tabIndex={-1}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141731] p-6 shadow-2xl focus:outline-none"
            >
                <div className="flex items-start gap-3">
                    {danger
                        ? <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-400" aria-hidden="true" />
                        : <HelpCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-blue-300" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-lg font-bold text-white">{options.title || (danger ? '확인이 필요합니다' : '계속할까요?')}</h2>
                        <div id={descId} className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/75">{options.message}</div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" onClick={() => onSettle(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
                        {options.cancelLabel || '취소'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSettle(true)}
                        className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'}`}
                    >
                        {options.confirmLabel || '확인'}
                    </button>
                </div>
            </div>
        </div>
    );
}
