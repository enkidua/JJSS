import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../../utils/clipboard';
import { useToast } from '../Toast';

interface CopyButtonProps {
    text: string;
    label?: string;
    copiedLabel?: string;
    className?: string;
    disabled?: boolean;
    /** 아이콘만 표시할 때도 스크린리더용 이름으로 label을 사용합니다. */
    iconOnly?: boolean;
}

/** 복사 성공 시에만 "복사됨"을 보여 주고, 실패하면 오류 알림을 띄웁니다. */
export function CopyButton({ text, label = '복사', copiedLabel = '복사됨', className, disabled, iconOnly }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<number | undefined>(undefined);
    const { showToast } = useToast();

    useEffect(() => () => window.clearTimeout(timerRef.current), []);

    const handleCopy = async () => {
        const ok = await copyText(text);
        if (!ok) {
            showToast('클립보드에 복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.', 'error');
            return;
        }
        setCopied(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={disabled || !text}
            aria-label={iconOnly ? label : undefined}
            title={iconOnly ? label : undefined}
            className={className || 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'}
        >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
            <span className="sr-only" aria-live="polite">{copied ? '클립보드에 복사했습니다.' : ''}</span>
        </button>
    );
}

export default CopyButton;
