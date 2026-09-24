import { useRef, useState, type ReactNode, type DragEvent, type KeyboardEvent } from 'react';

interface FileDropZoneProps {
    /** input accept 속성. 실제 형식 검증은 onFiles에서 fileValidation 유틸로 하세요. */
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    onFiles: (files: File[]) => void;
    /** 스크린리더용 이름. 예: "평가 결과 파일 선택" */
    ariaLabel: string;
    className?: string;
    activeClassName?: string;
    children: ReactNode;
}

/**
 * 클릭·키보드(Enter/Space)·끌어다 놓기를 모두 지원하는 파일 선택 영역.
 * 선택 후 input 값을 비워 같은 파일을 다시 고를 수 있습니다.
 */
export function FileDropZone({ accept, multiple, disabled, onFiles, ariaLabel, className, activeClassName, children }: FileDropZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);

    const emit = (list: FileList | null) => {
        if (disabled || !list || list.length === 0) return;
        const files = Array.from(list);
        onFiles(multiple ? files : files.slice(0, 1));
    };

    const open = () => { if (!disabled) inputRef.current?.click(); };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    };

    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setDragging(true);
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        emit(event.dataTransfer?.files || null);
    };

    const base = className || 'cursor-pointer rounded-xl border-2 border-dashed border-white/15 p-6 text-center transition hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';
    const active = activeClassName || 'border-violet-400 bg-violet-500/10';

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={ariaLabel}
            aria-disabled={disabled || undefined}
            onClick={open}
            onKeyDown={onKeyDown}
            onDragEnter={onDragEnter}
            onDragOver={event => event.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`${base} ${dragging ? active : ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                onClick={event => event.stopPropagation()}
                onChange={event => {
                    emit(event.target.files);
                    event.target.value = '';
                }}
            />
            {children}
        </div>
    );
}

export default FileDropZone;
