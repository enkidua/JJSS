import { useEffect, useRef } from 'react';

/** Keep keyboard focus within an open dialog and restore its trigger on close. */
export function useDialogFocus(open: boolean, onClose: () => void) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) || []).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
        const frame = requestAnimationFrame(() => {
            const initial = dialogRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)');
            (initial || focusable()[0] || dialogRef.current)?.focus();
        });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.isComposing) {
                event.preventDefault();
                closeRef.current();
            }
            if (event.key !== 'Tab') return;
            const elements = focusable();
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
            if (!dialogRef.current?.contains(document.activeElement) ||
                (event.shiftKey && document.activeElement === first) ||
                (!event.shiftKey && document.activeElement === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKeyDown);
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);
    return dialogRef;
}
