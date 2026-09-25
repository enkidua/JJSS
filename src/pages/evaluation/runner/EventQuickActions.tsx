import { Undo2 } from 'lucide-react';
import { getTestPlugin, tallyEvents, type EvaluationEventType, type TestSession } from '../../../features/vocationalEvaluation';

const EFFECT_LABELS: Record<'INCLUDE' | 'EXCLUDE', string> = {
    INCLUDE: '수행량 포함',
    EXCLUDE: '수행량 제외',
};

/**
 * 검사 중 오류·사건 빠른 기록.
 * 손기능 오류는 실시요강 표4-2·4-3의 수행량 처리(포함/제외)를 함께 보여 준다.
 */
export function EventQuickActions({
    session,
    disabled,
    onRecord,
    onUndo,
}: {
    session: TestSession;
    disabled: boolean;
    onRecord: (type: EvaluationEventType) => void;
    onUndo: () => void;
}) {
    const plugin = getTestPlugin(session.testPluginId);
    const tally = tallyEvents(session);
    const countOf = (type: EvaluationEventType) => tally.find(item => item.eventType === type)?.count ?? 0;
    const errors = plugin.events.filter(event => event.scoreEffect || event.requiresReinstruction);
    const others = plugin.events.filter(event => !event.scoreEffect && !event.requiresReinstruction);

    const renderButton = (type: EvaluationEventType, label: string, shortcut?: string, effect?: 'INCLUDE' | 'EXCLUDE') => {
        const count = countOf(type);
        return (
            <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => onRecord(type)}
                className={`px-3 py-2 rounded-xl text-sm border transition-all text-left ${
                    count > 0
                        ? 'bg-primary-500/20 border-primary-500/40 text-white'
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={effect ? EFFECT_LABELS[effect] : undefined}
            >
                <span className="flex items-center gap-2">
                    <span>{label}</span>
                    {shortcut && <kbd className="text-[10px] px-1 py-0.5 rounded bg-black/30 text-white/50">{shortcut}</kbd>}
                    {count > 0 && <span className="ml-auto font-bold tabular-nums">{count}</span>}
                </span>
                {effect && <span className="block text-[11px] text-white/40 mt-0.5">{EFFECT_LABELS[effect]}</span>}
            </button>
        );
    };

    return (
        <div className="space-y-3">
            {errors.length > 0 && (
                <div>
                    <p className="text-xs text-white/40 mb-2">오류 기록 (실시요강 표4-2·4-3)</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {errors.map(event => renderButton(event.type, event.label, event.shortcut, event.scoreEffect))}
                    </div>
                </div>
            )}
            <div>
                <p className="text-xs text-white/40 mb-2">진행 기록</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {others.map(event => renderButton(event.type, event.label, event.shortcut))}
                </div>
            </div>
            <button type="button" className="btn-ghost text-sm" onClick={onUndo} disabled={disabled}>
                <span className="inline-flex items-center gap-1">
                    <Undo2 size={14} /> 마지막 기록 취소 <kbd className="text-[10px] px-1 rounded bg-black/30">Ctrl+Z</kbd>
                </span>
            </button>
        </div>
    );
}
