import type React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { ClientContextBox } from '../../components/ClientContextBox';
import { getSeekerKey } from '../../utils/seeker';
import { EmploymentResultPanel } from './EmploymentResultPanel';

export type EmploymentField = { label: string; value: string; onChange: (value: string) => void; placeholder: string };

export function EmploymentDocumentTab({
    title,
    description,
    icon,
    seekers,
    selectedSeekerId,
    onSelectSeeker,
    fields,
    textareas,
    result,
    setResult,
    resultPlaceholder,
    busy,
    isGenerating,
    isRefining,
    isSaving,
    onGenerate,
    onRefine,
    onSave,
    onReset,
    contextSummary,
    contextLoading,
    onLoadContext,
    onClearContext,
}: {
    title: string;
    description: string;
    icon: React.ReactNode;
    /** 식별자(getSeekerKey)가 있는 이용자만 넘깁니다. */
    seekers: Seeker[];
    selectedSeekerId: string;
    onSelectSeeker: (seekerKey: string) => void;
    fields: EmploymentField[];
    textareas: EmploymentField[];
    result: string;
    setResult: (value: string) => void;
    resultPlaceholder: string;
    busy: boolean;
    isGenerating: boolean;
    isRefining: boolean;
    isSaving: boolean;
    onGenerate: () => void;
    onRefine: () => void;
    onSave: () => void;
    onReset: () => void;
    contextSummary: string;
    contextLoading: boolean;
    onLoadContext: () => void;
    onClearContext: () => void;
}) {
    return (
        <motion.div
            key={title}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-2 gap-6"
        >
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex items-start gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white">{title}</h2>
                        <p className="text-white/40 text-sm mt-1">{description}</p>
                    </div>
                </div>

                <label className="block mb-5">
                    <span className="block text-sm font-medium text-white/70 mb-1.5">이용자 선택</span>
                    <select value={selectedSeekerId} onChange={e => onSelectSeeker(e.target.value)} disabled={busy} className="input-field disabled:opacity-60">
                        <option value="">이용자를 선택해 주세요</option>
                        {seekers.map(seeker => {
                            const seekerKey = getSeekerKey(seeker);
                            return (
                                <option key={seekerKey} value={seekerKey}>
                                    {seeker.name} {seeker.disabilityType ? ` / ${seeker.disabilityType}` : ''}
                                </option>
                            );
                        })}
                    </select>
                </label>

                <ClientContextBox
                    summary={contextSummary}
                    loading={contextLoading}
                    onLoad={onLoadContext}
                    onClear={onClearContext}
                    className="mb-5"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map(field => (
                        <label key={field.label} className="block">
                            <span className="block text-sm font-medium text-white/70 mb-1.5">{field.label}</span>
                            <input value={field.value} onChange={e => field.onChange(e.target.value)} placeholder={field.placeholder} className="input-field" />
                        </label>
                    ))}
                </div>

                <div className="space-y-4 mt-4">
                    {textareas.map(field => (
                        <label key={field.label} className="block">
                            <span className="block text-sm font-medium text-white/70 mb-1.5">{field.label}</span>
                            <textarea value={field.value} onChange={e => field.onChange(e.target.value)} placeholder={field.placeholder} className="textarea-field !min-h-[110px] text-sm leading-relaxed" />
                        </label>
                    ))}
                </div>

                <button type="button" onClick={onGenerate} disabled={busy} className="btn-primary w-full mt-5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    새 초안 생성
                </button>
            </div>

            <EmploymentResultPanel
                description="생성 후 직접 수정할 수 있고, 저장하면 이 이용자의 고용지원 문서로 보관됩니다."
                result={result}
                setResult={setResult}
                placeholder={resultPlaceholder}
                busy={busy}
                isGenerating={isGenerating}
                isRefining={isRefining}
                isSaving={isSaving}
                onRefine={onRefine}
                onSave={onSave}
                onReset={onReset}
            />
        </motion.div>
    );
}
