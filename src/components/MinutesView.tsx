import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Zap, Download, Sparkles, Loader2, Trash2, FileUp, MessageSquare } from 'lucide-react';
import { generateText } from '../services/gemini';
import { useToast } from './Toast';
import { safeErrorMetadata } from '../utils/safeError';
import { getTextFileValidationError } from '../utils/fileValidation';
import { saveJjssText, savedLocationMessage } from '../utils/jjssFileService';
import { CopyButton } from './common/CopyButton';
import { FileDropZone } from './common/FileDropZone';
import { useConfirm } from './common/ConfirmProvider';
import { ToolPageShell } from './tools/ToolPageShell';
import { AiTransmissionNotice } from './tools/AiTransmissionNotice';
import { useReportDirty } from './tools/useReportDirty';

interface MinutesViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

export function MinutesView({ onBack, onDirtyChange }: MinutesViewProps) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [transcript, setTranscript] = useState('');
    const [activeTab, setActiveTab] = useState<'input' | 'result'>('input');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState('');
    /** 마지막으로 AI가 만든 원본. result와 다르면 사용자가 직접 고친 것입니다. */
    const [generatedResult, setGeneratedResult] = useState('');
    const [savedResult, setSavedResult] = useState('');

    const dirty = isGenerating || (result ? result !== savedResult : Boolean(transcript.trim()));
    useReportDirty(dirty, onDirtyChange);

    const handleFiles = (files: File[]) => {
        const file = files[0];
        if (!file) return;

        const validationError = getTextFileValidationError(file);
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setTranscript(String(reader.result ?? ''));
            setActiveTab('input');
            showToast('녹취록이 업로드되었습니다.', 'success');
        };
        reader.onerror = () => showToast('녹취록 파일을 읽지 못했습니다.', 'error');
        reader.readAsText(file);
    };

    const handleGenerate = async () => {
        if (isGenerating) return;
        if (!transcript.trim()) {
            showToast('분석할 녹취록 내용을 입력하거나 파일을 업로드해 주세요.', 'error');
            return;
        }
        if (result && result !== generatedResult && !(await confirm({
            title: '회의록 다시 생성',
            message: '직접 수정한 회의록이 있습니다.\n다시 생성하면 수정한 내용이 새 결과로 바뀝니다. 계속할까요?',
            confirmLabel: '다시 생성하기',
            cancelLabel: '취소',
            tone: 'danger',
        }))) return;

        setIsGenerating(true);
        setActiveTab('result');
        try {
            const generatedMinutes = await generateText('minutes', transcript);
            setResult(generatedMinutes);
            setGeneratedResult(generatedMinutes);
            showToast('회의록 작성이 완료되었습니다.', 'success');
        } catch (error: unknown) {
            console.error('Minutes generation error:', safeErrorMetadata(error, 'minutes-generate'));
            showToast(error instanceof Error && error.message ? error.message : '회의록 생성 중 오류가 발생했습니다.', 'error');
            if (!result) setActiveTab('input');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = async () => {
        try {
            const saved = await saveJjssText('minutes', '회의록.txt', result);
            showToast(savedLocationMessage(saved), saved.canceled ? 'info' : 'success', 5000);
            if (!saved.canceled) setSavedResult(result);
        } catch (error: unknown) {
            showToast(error instanceof Error && error.message ? error.message : '회의록 파일을 저장하지 못했습니다.', 'error');
        }
    };

    const clearTranscript = async () => {
        if (!(await confirm({
            title: '녹취록 지우기',
            message: '입력한 녹취록 원문을 모두 지웁니다. 계속할까요?',
            confirmLabel: '지우기',
            tone: 'danger',
        }))) return;
        setTranscript('');
    };

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-7xl mx-auto pb-10"
            actions={result ? (
                <>
                    <CopyButton
                        text={result}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white text-sm font-bold transition-colors disabled:opacity-40"
                    />
                    <button
                        type="button"
                        onClick={() => void handleDownload()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold border border-emerald-400/30 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                    >
                        <Download className="w-4 h-4" /> 파일로 저장
                    </button>
                </>
            ) : undefined}
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-[700px]">
                {/* Left Panel: Stats & Controls */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="glass-strong rounded-[2.5rem] p-8 border border-white/10 flex flex-col h-fit">
                        <div className="mb-8">
                            <span className="inline-block px-3 py-1 bg-primary-500/10 text-primary-400 text-[10px] font-black tracking-widest rounded-full mb-3 uppercase">Transcript Analysis</span>
                            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
                                회의 녹취록 <br/>전문 분석
                            </h1>
                            <p className="text-white/40 mt-3 text-sm leading-relaxed">
                                단순한 요약을 넘어 회의의 맥락과 결정 사항, 팀별 공지사항을 행정 문서 양식으로 구조화합니다.
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <h4 className="text-xs font-bold text-white/30 mb-2 uppercase tracking-widest">분석 핵심 지침</h4>
                                <ul className="space-y-2">
                                    <li className="flex items-start gap-2 text-xs text-white/60">
                                        <div className="w-1 h-1 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                                        <span>팀별 공지사항 자동 분류</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-xs text-white/60">
                                        <div className="w-1 h-1 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                                        <span>주요 안건 및 결정 사항 구조화</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-xs text-white/60">
                                        <div className="w-1 h-1 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                                        <span>부서 스터디 및 향후 과제 도출</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <AiTransmissionNotice className="mb-6" />

                        <button
                            type="button"
                            onClick={() => void handleGenerate()}
                            disabled={isGenerating || !transcript.trim()}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 ${isGenerating ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-primary-500 text-white shadow-primary-500/20 hover:shadow-primary-500/30'}`}
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-white" />}
                            {result ? '회의록 다시 생성하기' : 'AI 회의록 생성하기'}
                        </button>
                    </div>

                    <div className="glass-strong rounded-[2rem] p-6 border border-white/10">
                        <h4 className="text-xs font-bold text-white/30 mb-4 uppercase tracking-widest">파일 업로드</h4>
                        <FileDropZone
                            accept=".txt,.md"
                            onFiles={handleFiles}
                            disabled={isGenerating}
                            ariaLabel="녹취록 텍스트 파일 선택"
                            className="w-full py-6 rounded-2xl border-2 border-dashed border-white/10 hover:border-primary-500/50 hover:bg-white/5 transition-all flex flex-col items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                            activeClassName="border-primary-400 bg-primary-500/10"
                        >
                            <FileUp className="w-8 h-8 text-white/20" aria-hidden="true" />
                            <span className="text-xs font-bold text-white/40">녹취록 파일 업로드 (.txt 등) · 끌어다 놓아도 됩니다</span>
                        </FileDropZone>
                    </div>
                </div>

                {/* Right Panel: Content Area */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    <div className="flex bg-white/5 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 w-fit" role="tablist" aria-label="회의록 화면">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'input'}
                            onClick={() => setActiveTab('input')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'input' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            녹취록 입력
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'result'}
                            onClick={() => setActiveTab('result')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'result' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                        >
                            <FileText className="w-4 h-4" />
                            생성된 회의록
                        </button>
                    </div>

                    <div className="flex-1 glass-strong rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col relative">
                        <AnimatePresence mode="wait">
                            {activeTab === 'input' ? (
                                <motion.div
                                    key="input"
                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                    className="flex-1 flex flex-col"
                                >
                                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            회의 녹취록 원문
                                        </h2>
                                        {transcript && (
                                            <button
                                                type="button"
                                                aria-label="녹취록 지우기"
                                                title="녹취록 지우기"
                                                onClick={() => void clearTranscript()}
                                                className="text-white/20 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        aria-label="회의 녹취록 원문"
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        placeholder="이곳에 회의 녹취록이나 두서없는 회의 메모를 붙여넣으세요. AI가 분석하여 행정 문서 양식의 회의록으로 바꿔드립니다."
                                        className="flex-1 p-8 bg-transparent text-white/80 resize-none focus:outline-none text-lg leading-relaxed placeholder:text-white/10 custom-scrollbar"
                                    />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="result"
                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                    className="flex-1 flex flex-col"
                                >
                                    {isGenerating ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                            <div className="w-20 h-20 bg-primary-500/20 text-primary-400 rounded-3xl flex items-center justify-center mb-8 animate-pulse">
                                                <Zap className="w-10 h-10" />
                                            </div>
                                            <h2 className="text-2xl font-black text-white mb-4">AI 심층 분석 진행 중</h2>
                                            <p className="text-white/40 leading-relaxed max-w-sm mx-auto font-medium">
                                                녹취록의 맥락을 파악하고 팀별 공지사항과 결정 사항을 구조화하고 있습니다. 잠시만 기다려 주세요.
                                                {result && <span className="block mt-2 text-white/30">실패하면 기존 회의록은 그대로 남습니다.</span>}
                                            </p>
                                        </div>
                                    ) : result ? (
                                        <div className="flex-1 flex flex-col overflow-hidden">
                                            <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                    분석 결과
                                                </h2>
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 tracking-widest">
                                                    {result !== generatedResult ? '직접 수정함' : '생성 완료'}
                                                </div>
                                            </div>
                                            <textarea
                                                aria-label="생성된 회의록"
                                                value={result}
                                                onChange={(e) => setResult(e.target.value)}
                                                className="flex-1 p-8 bg-transparent text-white/90 resize-none focus:outline-none text-base leading-relaxed font-sans custom-scrollbar"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30 grayscale">
                                            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-8">
                                                <Sparkles className="w-10 h-10 text-white" />
                                            </div>
                                            <p className="text-lg font-bold text-white">생성된 결과가 없습니다. <br/>왼쪽의 'AI 회의록 생성하기' 버튼을 눌러주세요.</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </ToolPageShell>
    );
}
