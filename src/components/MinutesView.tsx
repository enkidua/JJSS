import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FileText, Zap, ArrowLeft, Download, Upload, Clock, Search, 
    Sparkles, AlertCircle, CheckCircle2, ListTodo, ClipboardList,
    Loader2, Trash2, FileUp, MessageSquare
} from 'lucide-react';
import { generateText } from '../services/gemini';
import { useToast, ToastContainer } from './Toast';
import { safeErrorMetadata } from '../utils/safeError';
import { getTextFileValidationError } from '../utils/fileValidation';
import { saveJjssText, savedLocationMessage } from '../utils/jjssFileService';

interface MinutesViewProps {
    onBack: () => void;
}

export function MinutesView({ onBack }: MinutesViewProps) {
    const { toasts, showToast, removeToast } = useToast();
    const [transcript, setTranscript] = useState('');
    const [activeTab, setActiveTab] = useState<'input' | 'result'>('input');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validationError = getTextFileValidationError(file);
        if (validationError) {
            showToast(validationError, 'error');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setTranscript(content);
            showToast('녹취록이 업로드되었습니다.', 'success');
        };
        reader.onerror = () => showToast('녹취록 파일을 읽지 못했습니다.', 'error');
        reader.readAsText(file);
    };

    const handleGenerate = async () => {
        if (!transcript.trim()) {
            showToast('분석할 녹취록 내용을 입력하거나 파일을 업로드해 주세요.', 'error');
            return;
        }

        setIsGenerating(true);
        setActiveTab('result');
        try {
            const generatedMinutes = await generateText('minutes', transcript);
            setResult(generatedMinutes);
            showToast('회의록 작성이 완료되었습니다.', 'success');
        } catch (error) {
            console.error('Minutes generation error:', safeErrorMetadata(error, 'minutes-generate'));
            showToast('회의록 생성 중 오류가 발생했습니다.', 'error');
            setActiveTab('input');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(result);
        showToast('회의록이 클립보드에 복사되었습니다.', 'success');
    };

    const handleDownload = async () => {
        try {
            const saved = await saveJjssText('minutes', '회의록.txt', result);
            showToast(savedLocationMessage(saved), saved.canceled ? 'info' : 'success', 5000);
        } catch (error: any) {
            showToast(error?.message || '회의록 파일을 저장하지 못했습니다.', 'error');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-7xl mx-auto pb-10"
        >
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            
            <div className="flex items-center justify-between mb-8">
                <button
                    onClick={onBack}
                    className="btn-ghost flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> 도구 목록
                </button>
                <div className="flex items-center gap-3">
                    {result && (
                        <>
                            <button 
                                onClick={handleCopy}
                                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors"
                                title="복사"
                            >
                                <ClipboardList className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold border border-emerald-400/30 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4" /> 내보내기 (.txt)
                            </button>
                        </>
                    )}
                </div>
            </div>

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

                        <div className="space-y-4 mb-8">
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

                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating || !transcript.trim()}
                            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 ${isGenerating ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-primary-500 text-white shadow-primary-500/20 hover:shadow-primary-500/30'}`}
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-white" />}
                            AI 회의록 생성 시작
                        </button>
                    </div>

                    <div className="glass-strong rounded-[2rem] p-6 border border-white/10">
                        <h4 className="text-xs font-bold text-white/30 mb-4 uppercase tracking-widest">파일 업로드</h4>
                        <input 
                            type="file" 
                            accept=".txt,.md"
                            className="hidden" 
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-6 rounded-2xl border-2 border-dashed border-white/10 hover:border-primary-500/50 hover:bg-white/5 transition-all flex flex-col items-center gap-3"
                        >
                            <FileUp className="w-8 h-8 text-white/20" />
                            <span className="text-xs font-bold text-white/40">녹취록 파일 업로드 (.txt 등)</span>
                        </button>
                    </div>
                </div>

                {/* Right Panel: Content Area */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    <div className="flex bg-white/5 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 w-fit">
                        <button
                            onClick={() => setActiveTab('input')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'input' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            녹취록 입력
                        </button>
                        <button
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
                                                onClick={() => setTranscript('')}
                                                className="text-white/20 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <textarea 
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
                                            </p>
                                        </div>
                                    ) : result ? (
                                        <div className="flex-1 flex flex-col overflow-hidden">
                                            <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                    분석 결과
                                                </h2>
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                                    Analysis Complete
                                                </div>
                                            </div>
                                            <textarea 
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
                                            <p className="text-lg font-bold text-white">생성된 결과가 없습니다. <br/>왼쪽의 '생성 시작' 버튼을 눌러주세요.</p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
