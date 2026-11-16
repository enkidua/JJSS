import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Pencil, Plus, Share2, Sparkles, Trash2 } from 'lucide-react';
import { ToolPageShell } from '../ToolPageShell';
import { useReportDirty } from '../useReportDirty';
import { AiTransmissionNotice } from '../AiTransmissionNotice';
import { CopyButton } from '../../common/CopyButton';
import { useAppToast } from '../../Toast';
import { useConfirm } from '../../common/ConfirmProvider';
import { generateText, wrapAsData } from '../../../services/gemini';
import {
    CUSTOM_TOOL_EXAMPLES, MAX_CUSTOM_TOOLS, MAX_INSTRUCTION_LENGTH, buildCustomToolInput, exportCustomTools, importCustomTools,
    newCustomToolId, normalizeCustomTool, readCustomTools, upsertCustomTool, writeCustomTools,
    type CustomTool,
} from '../../../features/tools/customTools';

interface LocalToolProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

interface Draft {
    id: string | null;
    title: string;
    description: string;
    instruction: string;
    inputHint: string;
}

const EMPTY_DRAFT: Draft = { id: null, title: '', description: '', instruction: '', inputHint: '' };

/** 나만의 AI 도구: 자주 쓰는 지시문을 저장해 두고 내용만 바꿔 실행한다. 동료와는 내보내기/가져오기로 나눈다. */
export function CustomToolsView({ onBack, onDirtyChange }: LocalToolProps) {
    const showToast = useAppToast();
    const confirm = useConfirm();
    const [tools, setTools] = useState<CustomTool[]>(() => readCustomTools());
    const [draft, setDraft] = useState<Draft | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importText, setImportText] = useState('');
    // 도구를 바꾸거나 화면을 떠난 뒤 도착한 응답은 버린다.
    const runRef = useRef(0);
    // 버린 요청은 취소한다. 취소하지 않으면 요청이 끝날 때까지(최대 3분) 같은 도구를 다시 실행할 수 없고 사용량도 든다.
    const abortRef = useRef<AbortController | null>(null);
    const cancelRun = () => {
        runRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
    };
    useEffect(() => () => { runRef.current += 1; abortRef.current?.abort(); }, []);

    const active = tools.find(tool => tool.id === activeId) ?? null;
    const draftDirty = Boolean(draft && (draft.title.trim() || draft.instruction.trim() || draft.description.trim() || draft.inputHint.trim()));
    useReportDirty(Boolean(input.trim() || result || loading || draftDirty || importText.trim()), onDirtyChange);

    const persist = (next: CustomTool[]) => {
        setTools(next);
        if (!writeCustomTools(next)) showToast('이 PC에 저장하지 못했습니다. 화면을 닫으면 사라질 수 있으니 "내보내기"로 복사해 두세요.', 'error');
    };

    const saveDraft = () => {
        if (!draft) return;
        const tool = normalizeCustomTool({ ...draft, id: draft.id ?? newCustomToolId(), updatedAt: new Date().toISOString() });
        if (!tool) {
            showToast('도구 이름과 지시문을 입력해 주세요.', 'error');
            return;
        }
        if (!draft.id && tools.length >= MAX_CUSTOM_TOOLS) {
            showToast(`나만의 AI 도구는 ${MAX_CUSTOM_TOOLS}개까지 만들 수 있습니다. 쓰지 않는 도구를 지운 뒤 다시 시도해 주세요.`, 'error');
            return;
        }
        persist(upsertCustomTool(tools, tool));
        setDraft(null);
        showToast(`"${tool.title}" 도구를 저장했습니다.`, 'success');
    };

    const removeTool = async (tool: CustomTool) => {
        const ok = await confirm({ title: '도구 지우기', message: `"${tool.title}" 도구를 지울까요? 지시문이 함께 지워집니다.`, confirmLabel: '지우기', cancelLabel: '취소', tone: 'danger' });
        if (!ok) return;
        persist(tools.filter(item => item.id !== tool.id));
        if (activeId === tool.id) closeRunner();
    };

    const openRunner = (tool: CustomTool) => {
        cancelRun();
        setActiveId(tool.id);
        setInput('');
        setResult('');
        setError('');
        setLoading(false);
    };
    const closeRunner = () => {
        cancelRun();
        setActiveId(null);
        setInput('');
        setResult('');
        setError('');
        setLoading(false);
    };

    const run = async () => {
        if (!active || loading) return;
        if (!input.trim()) {
            setError('내용을 먼저 입력해 주세요.');
            return;
        }
        const sequence = ++runRef.current;
        const isCurrent = () => runRef.current === sequence;
        const controller = new AbortController();
        abortRef.current = controller;
        setError('');
        setLoading(true);
        try {
            const text = await generateText('utilities', buildCustomToolInput(active, input, wrapAsData), undefined, { featureKey: 'custom-tools', documentType: active.id, signal: controller.signal });
            if (isCurrent()) setResult(text);
        } catch (caught) {
            if (isCurrent()) setError(caught instanceof Error && caught.message ? caught.message : '실행하지 못했습니다.');
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (isCurrent()) setLoading(false);
        }
    };

    const runImport = () => {
        try {
            const { tools: merged, added } = importCustomTools(importText, tools);
            if (!added) {
                showToast('새로 가져올 도구가 없습니다(이미 있는 도구이거나 내용이 비어 있습니다).', 'info');
                return;
            }
            persist(merged);
            setImportText('');
            setImporting(false);
            showToast(`도구 ${added}개를 가져왔습니다.`, 'success');
        } catch (caught) {
            showToast(caught instanceof Error ? caught.message : '가져오지 못했습니다.', 'error');
        }
    };

    const leaveRunner = async () => {
        if ((input.trim() || result) && !(await confirm({ title: '저장하지 않은 내용', message: '입력한 내용과 결과가 사라집니다. 도구 목록으로 돌아갈까요?', confirmLabel: '돌아가기', cancelLabel: '계속 작성', tone: 'danger' }))) return;
        closeRunner();
    };

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
            title="나만의 AI 도구"
            description="자주 쓰는 지시문을 저장해 두고 내용만 바꿔 실행합니다. 동료와 나눠 쓸 수 있습니다"
            icon={Bot}
            iconGradient="from-indigo-500 to-violet-600"
        >
            {active ? (
                <div className="glass-strong rounded-2xl p-6 border border-white/10 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="text-xl font-black text-white">{active.title}</h3>
                            {active.description && <p className="mt-1 text-sm text-white/50">{active.description}</p>}
                        </div>
                        <button type="button" onClick={() => void leaveRunner()} className="btn-ghost px-3! py-2! text-sm">내 도구 목록</button>
                    </div>
                    <details className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                        <summary className="cursor-pointer font-semibold text-white/70">지시문 보기</summary>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{active.instruction}</p>
                    </details>
                    <label className="block text-sm font-medium text-white/70">
                        내용
                        <textarea
                            className="input-field mt-1.5 min-h-[160px]"
                            rows={7}
                            placeholder={active.inputHint || '이 도구에 넣을 내용을 적어 주세요.'}
                            value={input}
                            onChange={event => setInput(event.target.value)}
                        />
                    </label>
                    <AiTransmissionNotice />
                    <button type="button" onClick={() => void run()} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5!">
                        {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> 생성 중...</> : <><Sparkles className="h-5 w-5" /> {result ? '다시 생성하기' : '생성하기'}</>}
                    </button>
                    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}{result ? ' 이전 결과는 그대로 남아 있습니다.' : ''}</p>}
                    {result && (
                        <div className="border-t border-white/10 pt-5">
                            <div className="mb-3 flex items-center justify-between">
                                <h4 className="font-bold text-white">AI 생성 결과</h4>
                                <CopyButton text={result} />
                            </div>
                            <div className="max-h-96 overflow-y-auto rounded-xl bg-white/5 p-4">
                                <pre data-testid="custom-tool-result" className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/80">{result}</pre>
                            </div>
                        </div>
                    )}
                </div>
            ) : draft ? (
                <form className="glass-strong rounded-2xl p-6 border border-white/10 space-y-4" onSubmit={event => { event.preventDefault(); saveDraft(); }}>
                    <h3 className="text-xl font-black text-white">{draft.id ? '도구 고치기' : '새 도구 만들기'}</h3>
                    <label className="block text-sm font-medium text-white/70">
                        도구 이름
                        <input className="input-field mt-1.5" maxLength={40} placeholder="예: 행사 안내 문자 만들기" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
                    </label>
                    <label className="block text-sm font-medium text-white/70">
                        한 줄 설명 (선택)
                        <input className="input-field mt-1.5" maxLength={120} placeholder="목록에서 보일 설명" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
                    </label>
                    <label className="block text-sm font-medium text-white/70">
                        지시문 <span className="text-white/40">({draft.instruction.length.toLocaleString()} / {MAX_INSTRUCTION_LENGTH.toLocaleString()}자)</span>
                        <textarea
                            className="input-field mt-1.5 min-h-[180px]"
                            rows={8}
                            maxLength={MAX_INSTRUCTION_LENGTH}
                            placeholder="AI에게 시킬 일을 구체적으로 적어 주세요. 예: 아래 내용으로 ○○를 작성해 줘. 분량은 …, 말투는 …, 내용에 없는 정보는 지어내지 말 것."
                            value={draft.instruction}
                            onChange={event => setDraft({ ...draft, instruction: event.target.value })}
                            aria-describedby="custom-tool-instruction-help"
                        />
                        <span id="custom-tool-instruction-help" className="mt-1 block text-xs text-amber-200/80">지시문은 그대로 AI에 전달됩니다. 이용자 이름·연락처 같은 개인정보는 지시문에 넣지 마세요(실행할 때 넣는 내용은 평소처럼 가려서 보냅니다).</span>
                    </label>
                    <label className="block text-sm font-medium text-white/70">
                        입력칸 안내 (선택)
                        <input className="input-field mt-1.5" maxLength={200} placeholder="예: 행사명, 일시, 장소, 준비물을 적어 주세요." value={draft.inputHint} onChange={event => setDraft({ ...draft, inputHint: event.target.value })} />
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setDraft(null)} className="btn-secondary px-4! py-2.5! text-sm">취소</button>
                        <button type="submit" className="btn-primary px-5! py-2.5! text-sm">저장</button>
                    </div>
                </form>
            ) : (
                <div className="glass-strong rounded-2xl p-6 border border-white/10 space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} className="btn-primary inline-flex items-center gap-2 px-4! py-2.5! text-sm"><Plus className="h-4 w-4" /> 새 도구 만들기</button>
                        <button type="button" onClick={() => setImporting(value => !value)} className="btn-secondary px-4! py-2.5! text-sm">가져오기</button>
                        {tools.length > 0 && <CopyButton text={exportCustomTools(tools)} label="전체 내보내기(복사)" />}
                        <span className="ml-auto text-xs text-white/40">{tools.length} / {MAX_CUSTOM_TOOLS}개</span>
                    </div>
                    <p className="text-xs leading-relaxed text-white/45">
                        도구는 이 PC에만 저장되고 백업 파일에는 들어가지 않습니다. PC를 옮기거나 동료와 나눌 때는 "내보내기"로 복사한 글을 상대 PC의 "가져오기"에 붙여 넣으세요.
                    </p>

                    {importing && (
                        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                            <label htmlFor="custom-tool-import" className="text-sm font-medium text-white/70">내보내기로 복사한 글 붙여 넣기</label>
                            <textarea id="custom-tool-import" className="input-field min-h-[110px] font-mono text-xs" rows={5} value={importText} onChange={event => setImportText(event.target.value)} />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => { setImporting(false); setImportText(''); }} className="btn-ghost px-3! py-2! text-sm">닫기</button>
                                <button type="button" onClick={runImport} disabled={!importText.trim()} className="btn-primary px-4! py-2! text-sm disabled:opacity-50">가져오기</button>
                            </div>
                        </div>
                    )}

                    {tools.length > 0 ? (
                        <ul className="grid gap-3 sm:grid-cols-2" aria-label="내 도구">
                            {tools.map(tool => (
                                <li key={tool.id} data-testid="custom-tool-card" className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="font-bold text-white">{tool.title}</p>
                                    <p className="mt-1 flex-1 text-xs leading-relaxed text-white/50">{tool.description || tool.instruction.slice(0, 80)}</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <button type="button" onClick={() => openRunner(tool)} className="btn-primary px-4! py-1.5! text-xs">쓰기</button>
                                        <button type="button" onClick={() => setDraft({ id: tool.id, title: tool.title, description: tool.description, instruction: tool.instruction, inputHint: tool.inputHint })} className="btn-ghost inline-flex items-center gap-1 px-2! py-1.5! text-xs"><Pencil className="h-3.5 w-3.5" /> 고치기</button>
                                        <CopyButton text={exportCustomTools([tool])} label="공유" className="btn-ghost inline-flex items-center gap-1 px-2! py-1.5! text-xs" />
                                        <button type="button" onClick={() => void removeTool(tool)} aria-label={`${tool.title} 지우기`} className="ml-auto rounded-lg p-1.5 text-white/40 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">아직 만든 도구가 없습니다. 아래 예시로 시작하거나 "새 도구 만들기"를 눌러 주세요.</p>
                    )}

                    <section aria-label="예시 도구" className="space-y-2 border-t border-white/10 pt-4">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-white/70"><Share2 className="h-4 w-4" /> 예시로 시작하기</h3>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {CUSTOM_TOOL_EXAMPLES.map(example => (
                                <button
                                    key={example.title}
                                    type="button"
                                    onClick={() => setDraft({ id: null, ...example })}
                                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/25"
                                >
                                    <span className="block text-sm font-semibold text-white/85">{example.title}</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-white/45">{example.description}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </ToolPageShell>
    );
}

export default CustomToolsView;
