import { Loader2, Sparkles } from 'lucide-react';
import type { TrainingRoom, TrainingSaveStatus } from './trainingModel';

export function GenerateButton({ label, isGenerating, disabled = false, onClick }: { label: string; isGenerating: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} disabled={isGenerating || disabled} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {label}
        </button>
    );
}

export function RoomSelect({ rooms, selectedRoomId, setSelectedRoomId }: { rooms: TrainingRoom[]; selectedRoomId: string; setSelectedRoomId: (id: string) => void }) {
    return (
        <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className="input-field w-auto" aria-label="훈련실 선택">
            {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
    );
}

export function TrainingInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-field" />
        </label>
    );
}

export function TrainingTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="textarea-field !min-h-[108px] text-sm leading-relaxed" />
        </label>
    );
}

export function StatPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 min-w-24">
            <p className="text-[11px] text-white/35 font-bold uppercase">{label}</p>
            <p className="text-xl font-black text-white">{value}</p>
        </div>
    );
}

const saveStatusLabels: Record<TrainingSaveStatus | 'loading' | 'failed', { text: string; className: string }> = {
    idle: { text: '저장됨', className: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/20' },
    pending: { text: '저장 대기 중', className: 'bg-white/5 text-white/60 border-white/15' },
    saving: { text: '저장 중…', className: 'bg-white/5 text-white/70 border-white/15' },
    saved: { text: '저장됨', className: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/20' },
    error: { text: '저장 실패 · [저장]을 다시 눌러 주세요', className: 'bg-rose-500/15 text-rose-200 border-rose-400/30' },
    loading: { text: '불러오는 중…', className: 'bg-white/5 text-white/60 border-white/15' },
    failed: { text: '불러오기 실패 · 저장 멈춤', className: 'bg-rose-500/15 text-rose-200 border-rose-400/30' },
};

/** 자동 저장의 실제 상태를 보여 줍니다(저장 실패를 숨기지 않습니다). */
export function SaveStatusBadge({ status, lastSavedAt }: { status: TrainingSaveStatus | 'loading' | 'failed'; lastSavedAt?: Date | null }) {
    const { text, className } = saveStatusLabels[status];
    const time = status === 'saved' && lastSavedAt
        ? ` · ${lastSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
        : '';
    return (
        <span role="status" aria-live="polite" className={`text-[11px] px-2 py-1 rounded-lg border font-bold inline-flex items-center gap-1 ${className}`}>
            {(status === 'saving' || status === 'loading') && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
            {text}{time}
        </span>
    );
}
