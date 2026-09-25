import { Minus, Plus } from 'lucide-react';

/** 수행량 입력. 0도 직접 확인한 값이므로 빈 값과 구분한다. */
export function ScoreControl({
    score,
    onChange,
    disabled,
    autoFocus,
    label = '수행량',
    max,
}: {
    score: number | undefined;
    onChange: (value: number | undefined) => void;
    disabled?: boolean;
    autoFocus?: boolean;
    label?: string;
    max?: number;
}) {
    const clamp = (value: number) => Math.max(0, max === undefined ? value : Math.min(max, value));
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                className="btn-secondary !px-3 !py-2"
                onClick={() => onChange(clamp((score ?? 0) - 1))}
                disabled={disabled || score === undefined || score <= 0}
                aria-label={`${label} 1 줄이기`}
            >
                <Minus size={16} />
            </button>
            <input
                type="number"
                min={0}
                max={max}
                inputMode="numeric"
                aria-label={label}
                autoFocus={autoFocus}
                disabled={disabled}
                value={score ?? ''}
                onChange={event => {
                    const raw = event.target.value;
                    if (raw === '') return onChange(undefined);
                    const parsed = Number.parseInt(raw, 10);
                    if (Number.isNaN(parsed)) return;
                    onChange(clamp(parsed));
                }}
                className="input-field !w-24 text-center text-2xl font-bold tabular-nums"
                placeholder="—"
            />
            <button
                type="button"
                className="btn-secondary !px-3 !py-2"
                onClick={() => onChange(clamp((score ?? 0) + 1))}
                disabled={disabled || (max !== undefined && (score ?? 0) >= max)}
                aria-label={`${label} 1 늘리기`}
            >
                <Plus size={16} />
            </button>
            {max !== undefined && <span className="text-white/40 text-sm">/ {max}</span>}
        </div>
    );
}
