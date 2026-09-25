import { formatTimer } from '../../../features/vocationalEvaluation';

const STATUS_LABELS: Record<string, string> = {
    PENDING: '대기',
    READY: '검사 준비',
    RUNNING: '측정 중',
    PAUSED: '일시정지',
    INTERRUPTED: '중단됨',
    FINISHED: '측정 완료',
    CONFIRMED: '확정됨',
    SKIPPED: '미실시',
};

/** 남은 시간 표시. 마지막 5초는 색으로 알린다. */
export function TimerDisplay({
    remainingMs,
    durationSeconds,
    status,
}: {
    remainingMs: number;
    durationSeconds: number;
    status: string;
}) {
    const total = durationSeconds * 1000;
    const ratio = total > 0 ? Math.max(0, Math.min(1, remainingMs / total)) : 0;
    const urgent = status === 'RUNNING' && remainingMs <= 5_000;
    return (
        <div className="text-center">
            <div
                className={`font-mono tabular-nums leading-none transition-colors ${
                    urgent ? 'text-rose-300' : status === 'RUNNING' ? 'text-white' : 'text-white/70'
                } text-6xl md:text-7xl font-bold`}
                role="timer"
                aria-live={status === 'RUNNING' ? 'off' : 'polite'}
                aria-label={`남은 시간 ${formatTimer(remainingMs)}`}
            >
                {formatTimer(remainingMs)}
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-[width] duration-100 ${urgent ? 'bg-rose-400' : 'bg-primary-500'}`}
                    style={{ width: `${ratio * 100}%` }}
                />
            </div>
            <p className="mt-2 text-sm text-white/50">{STATUS_LABELS[status] ?? status}</p>
        </div>
    );
}
