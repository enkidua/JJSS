import { useEffect, useRef, useState } from 'react';
import { Loader2, NotebookPen, Sparkles } from 'lucide-react';
import { generateText } from '../../services/gemini';
import { useAppToast } from '../../components/Toast';
import { useConfirm } from '../../components/common/ConfirmProvider';
import type { SituationNote as SituationNoteData } from '../../config/rehabWorkflow';

interface Props {
    note?: SituationNoteData;
    disabled: boolean;
    saving: boolean;
    onSave: (text: string) => Promise<boolean>;
    /** 위 카드 데이터로 만든 AI 요청 본문(이름 없음). generateText가 전송 전에 한 번 더 비식별화합니다. */
    buildPrompt: () => string;
    onDirtyChange: (dirty: boolean) => void;
}

function formatSavedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 현황판에서 유일하게 저장하는 입력: 담당자의 "현재 상황 정리" 메모 한 개 */
export function SituationNote({ note, disabled, saving, onSave, buildPrompt, onDirtyChange }: Props) {
    const [text, setText] = useState(note?.text ?? '');
    const [generating, setGenerating] = useState(false);
    const mounted = useRef(true);
    const showToast = useAppToast();
    const confirm = useConfirm();
    const dirty = text !== (note?.text ?? '');

    useEffect(() => { onDirtyChange(dirty || generating); }, [dirty, generating, onDirtyChange]);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; onDirtyChange(false); };
    }, [onDirtyChange]);

    const draftWithAI = async () => {
        if (generating) return;
        if (text.trim() && !(await confirm({
            title: 'AI 요약 초안', message: '메모 칸의 내용을 AI 초안으로 바꿉니다. 저장한 메모는 "저장"을 누르기 전까지 바뀌지 않습니다. 계속할까요?',
            confirmLabel: '초안으로 바꾸기', cancelLabel: '취소',
        }))) return;
        setGenerating(true);
        try {
            const result = await generateText('summary', buildPrompt(), undefined, {
                featureKey: 'overview', documentType: 'situation-summary', requestLabel: '현재 상황 요약 초안',
            });
            if (!mounted.current) return;
            setText(result.trim());
            showToast('AI 초안을 메모 칸에 넣었습니다. 내용을 확인하고 고친 뒤 "저장"을 눌러 주세요.', 'info');
        } catch (error) {
            if (mounted.current) showToast(error instanceof Error ? error.message : 'AI 초안을 만들지 못했습니다. 메모는 그대로입니다.', 'error');
        } finally {
            if (mounted.current) setGenerating(false);
        }
    };

    const savedAt = note?.updatedAt ? formatSavedAt(note.updatedAt) : '';
    return <section className="glass-card !p-5" aria-labelledby="situation-note-title">
        <h2 id="situation-note-title" className="text-xl font-bold text-white flex items-center gap-2"><NotebookPen className="w-5 h-5 text-amber-300" aria-hidden="true" /> 현재 상황 정리</h2>
        <p className="text-xs text-white/50 mt-1">담당자가 이 이용자의 현재 상황을 한 문단으로 정리합니다. AI 초안은 저장하지 않고 메모 칸에만 넣습니다.</p>
        <label htmlFor="situation-note" className="sr-only">현재 상황 정리 메모</label>
        <textarea id="situation-note" className="textarea-field mt-3" rows={5} maxLength={3000} value={text}
            onChange={event => setText(event.target.value)} disabled={disabled || generating}
            placeholder="예: 직업평가 후 사무보조 훈련 중이며, 출석은 안정적입니다. 다음 달 현장실습을 준비하고 있습니다." />
        <div className="flex flex-wrap items-center gap-3 mt-3">
            <button type="button" className="btn-primary !px-4 !py-2" disabled={disabled || generating || !dirty}
                onClick={() => void onSave(text.trim()).then(ok => { if (ok && mounted.current) setText(text.trim()); })}>
                {saving ? '저장 중...' : '저장'}
            </button>
            <button type="button" className="btn-secondary !px-4 !py-2 inline-flex items-center gap-2" disabled={disabled || generating} onClick={() => void draftWithAI()}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                {generating ? 'AI 초안 만드는 중...' : 'AI로 요약 초안 만들기'}
            </button>
            <span className="text-xs text-white/50">{savedAt ? `마지막 저장: ${savedAt}` : '아직 저장한 메모가 없습니다.'}{dirty ? ' · 저장하지 않은 변경 있음' : ''}</span>
        </div>
    </section>;
}
