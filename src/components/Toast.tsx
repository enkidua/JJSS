import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

let toastCounter = 0;

export function useToast() {
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

    return { toasts, showToast, removeToast };
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
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 100, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 100, scale: 0.9 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className={`flex items-center gap-3 px-5 py-4 rounded-xl bg-[#1a1d3a]/95 backdrop-blur-xl border ${borderColors[toast.type]} shadow-2xl`}
                    >
                        {icons[toast.type]}
                        <p className="text-white text-sm font-medium flex-1">{toast.message}</p>
                        <button
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
