import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

let toastCounter = 0;

interface ToastApi {
    toasts: Toast[];
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: number) => void;
}

const GlobalToastContext = createContext<ToastApi | null>(null);
const EMPTY_TOASTS: Toast[] = [];

function useLocalToast(): ToastApi {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<number, number>>(new Map());

    useEffect(() => () => {
        timersRef.current.forEach(timerId => window.clearTimeout(timerId));
        timersRef.current.clear();
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'success', duration = 2500) => {
        const id = ++toastCounter;
        setToasts(prev => [...prev, { id, message, type }]);
        const timerId = window.setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            timersRef.current.delete(id);
        }, duration);
        timersRef.current.set(id, timerId);
    }, []);

    const removeToast = useCallback((id: number) => {
        const timerId = timersRef.current.get(id);
        if (timerId !== undefined) window.clearTimeout(timerId);
        timersRef.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return useMemo(() => ({ toasts, showToast, removeToast }), [toasts, showToast, removeToast]);
}

/**
 * 토스트 알림 훅. 앱 최상단의 GlobalToastProvider 안에서는 전역 한 곳에 쌓이므로,
 * 화면마다 렌더링하던 <ToastContainer toasts={toasts}>는 아무것도 그리지 않아 겹치지 않습니다.
 * 오류는 기본 5초, 그 외는 2.5초 동안 보입니다.
 */
export function useToast(): ToastApi {
    const global = useContext(GlobalToastContext);
    const local = useLocalToast();
    return useMemo(() => (global ? { toasts: EMPTY_TOASTS, showToast: global.showToast, removeToast: global.removeToast } : local), [global, local]);
}

/** 전역 알림 훅(useToast와 동일한 API의 showToast만 필요할 때). */
export function useAppToast() {
    return useToast().showToast;
}

export function GlobalToastProvider({ children }: { children: ReactNode }) {
    const local = useLocalToast();
    const showToast = useCallback((message: string, type: ToastType = 'success', duration?: number) => {
        local.showToast(message, type, duration ?? (type === 'error' ? 5000 : 2500));
    }, [local.showToast]);
    const value = useMemo<ToastApi>(() => ({ toasts: local.toasts, showToast, removeToast: local.removeToast }), [local.toasts, showToast, local.removeToast]);
    return (
        <GlobalToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={local.toasts} removeToast={local.removeToast} />
        </GlobalToastContext.Provider>
    );
}

export function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: number) => void }) {
    const icons = {
        success: <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />,
        error: <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
        info: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
    };

    const borderColors = {
        success: 'border-green-500/40',
        error: 'border-red-500/40',
        info: 'border-blue-500/40',
    };

    return (
        <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-3 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        role={toast.type === 'error' ? 'alert' : 'status'}
                        aria-atomic="true"
                        initial={{ opacity: 0, x: 100, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 100, scale: 0.9 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className={`pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-xl bg-[#1a1d3a]/95 backdrop-blur-xl border ${borderColors[toast.type]} shadow-2xl`}
                    >
                        {icons[toast.type]}
                        <p className="text-white text-sm font-medium flex-1">{toast.message}</p>
                        <button
                            type="button"
                            aria-label="알림 닫기"
                            onClick={() => removeToast(toast.id)}
                            className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
