import { useRef } from 'react';
import type React from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, FileText, Loader2, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import type { CaseDocument } from '../../types/caseDocument';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { CopyButton } from '../../components/common/CopyButton';
import type { CaseDocumentAction, FollowUpMode } from './types';

// ──────────────────────────────────────────────
// 통합 사후관리(상담/평가 타임라인) 컴포넌트
// ──────────────────────────────────────────────
export interface FollowUpStageProps {
    isActive: boolean;
    onActivate: () => void;
    history: CaseDocument[];
    setHistory: React.Dispatch<React.SetStateAction<CaseDocument[]>>;
    onDeleteHistory: (id: string, type: FollowUpMode) => void;
    onSaveHistory: (h: CaseDocument, content: string, type: FollowUpMode) => void;
    writeMode: FollowUpMode;
    setWriteMode: (mode: FollowUpMode) => void;
    /** 어느 문서든 AI 생성이 진행 중(버튼 잠금용) */
    isBusy: boolean;

    counselInput: string;
    setCounselInput: (v: string) => void;
    counselText: string;
    setCounselText: (v: string) => void;
    onGenerateCounsel: () => void;
    onRefineCounsel?: () => void;
    isGeneratingCounsel: boolean;
    onSaveCounsel: () => Promise<boolean>;

    evalInput: string;
    setEvalInput: (v: string) => void;
    evalText: string;
    setEvalText: (v: string) => void;
    onGenerateEval: () => void;
    onRefineEval?: () => void;
    isGeneratingEval: boolean;
    onSaveEval: () => Promise<boolean>;
    savingDocumentType: CaseDocumentAction | null;

    planText: string;
}

export function FollowUpStage({
    isActive, onActivate, history, setHistory, onDeleteHistory, onSaveHistory, writeMode, setWriteMode, isBusy,
    counselInput, setCounselInput, counselText, setCounselText, onGenerateCounsel, isGeneratingCounsel, onSaveCounsel,
    onRefineCounsel,
    evalInput, setEvalInput, evalText, setEvalText, onGenerateEval, isGeneratingEval, onSaveEval,
    onRefineEval,
    planText, savingDocumentType
}: FollowUpStageProps) {
    const confirm = useConfirm();
    const hasHistory = history.length > 0;
    const savingRef = useRef(false);
    const isSaving = savingDocumentType !== null;
    const locked = isSaving || isBusy;
    const saveDraft = async () => {
        if (savingRef.current || locked) return;
        savingRef.current = true;
        try {
            const counseling = Boolean(counselText);
            const saved = await (counseling ? onSaveCounsel() : onSaveEval());
            if (saved) {
                if (counseling) { setCounselText(''); setCounselInput(''); }
                else { setEvalText(''); setEvalInput(''); }
            }
        } finally { savingRef.current = false; }
    };
    const closeDraft = async () => {
        const ok = await confirm({
            title: '초안 닫기',
            message: '저장하지 않은 초안을 닫을까요? 닫은 초안은 되돌릴 수 없습니다.',
            confirmLabel: '닫기',
            cancelLabel: '취소',
            tone: 'danger',
        });
        if (!ok) return;
        if (counselText) setCounselText('');
        else setEvalText('');
    };

    return (
        <motion.div
            layout
            onClick={() => !isActive && onActivate()}
            className={`glass-strong rounded-[2rem] border transition-all overflow-hidden ${isActive
                    ? 'border-accent-500/50 ring-1 ring-accent-500/20 shadow-2xl shadow-accent-500/5'
                    : hasHistory
                        ? 'border-emerald-500/30 bg-emerald-500/5 cursor-pointer opacity-80 hover:opacity-100'
                        : 'border-white/5 opacity-60 hover:opacity-100 cursor-pointer'
                }`}
        >
            <div className="p-8">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${isActive ? 'bg-accent-500 text-white' : hasHistory ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/30'
                            }`}>
                            {hasHistory ? '✓' : '3'}
                        </div>
                        <div>
                            <h4 className="text-xl font-bold text-white">STEP 3. 사후관리 (타임라인)</h4>
                            <p className="text-xs text-white/40 font-medium">
                                상담일지와 정기평가를 연속적으로 작성하고 전체 과정의 흐름을 파악합니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── 타임라인 히스토리 영역 ─── */}
                {hasHistory && (
                    <div className="space-y-4 mb-8">
                        <h5 className="text-[11px] font-black text-white/30 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Clock className="w-3 h-3" /> 진행 경과 요약 ({history.length}건)
                        </h5>
                        <div className="space-y-6 max-h-[720px] overflow-y-auto pr-3 custom-scrollbar border-l-2 border-white/5 pl-4 ml-2 relative">
                            {history.map((h, i) => {
                                const isCounsel = h.type === 'counseling';
                                const historyType: FollowUpMode = isCounsel ? 'counseling' : 'evaluation';
                                return (
                                    <div key={h.id || i} className="relative">
                                        {/* 타임라인 점 */}
                                        <div className={`absolute -left-[23px] top-4 w-3 h-3 rounded-full border-4 border-[#12121a] ${isCounsel ? 'bg-emerald-400' : 'bg-amber-400'}`} />

                                        <div className={`p-5 sm:p-6 rounded-2xl border ${isCounsel ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
                                                <span className={`text-sm font-bold flex items-center gap-2 ${isCounsel ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {isCounsel ? <FileText className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                                                    {isCounsel ? '상담일지' : '정기평가'}
                                                    {h.createdAt && <span className="text-white/35 font-normal ml-1 text-xs">{new Date(typeof h.createdAt === 'object' && 'seconds' in h.createdAt ? h.createdAt.seconds * 1000 : h.createdAt).toLocaleDateString('ko-KR')}</span>}
                                                </span>
                                                <div className="flex gap-1.5">
                                                    <button type="button" disabled={locked} onClick={() => onSaveHistory(h, h.content, historyType)} className="p-2 rounded-lg text-emerald-300/70 hover:text-emerald-200 hover:bg-emerald-400/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 transition-colors disabled:opacity-40" title="저장" aria-label="저장"><Save className="w-4 h-4" /></button>
                                                    <CopyButton text={h.content} label="복사" iconOnly className="p-2 rounded-lg text-blue-300/70 hover:text-blue-200 hover:bg-blue-400/10 focus:outline-none focus:ring-2 focus:ring-blue-300/40 transition-colors disabled:opacity-40" />
                                                    {h.id && <button type="button" disabled={locked} onClick={() => onDeleteHistory(h.id!, historyType)} className="p-2 rounded-lg text-red-300/70 hover:text-red-200 hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-300/40 transition-colors disabled:opacity-40" title="삭제" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>}
                                                </div>
                                            </div>
                                            <textarea
                                                value={h.content}
                                                readOnly={isSaving}
                                                onChange={e => {
                                                    const newContent = e.target.value;
                                                    setHistory(prev => prev.map(p => (p.id === h.id || (!p.id && p === h)) ? { ...p, content: newContent } : p));
                                                }}
                                                className="textarea-field !bg-black/20 !border-white/10 !p-5 rounded-2xl !min-h-[260px] sm:!min-h-[300px] !max-h-[520px] text-sm sm:text-[15px] leading-7 text-white/85 focus:ring-1 focus:ring-accent-500/50 resize-y custom-scrollbar"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── 결과/작성 상태 표시 (방금 생성한 내용) ─── */}
                {(counselText || evalText) && (
                    <div className="mb-6 p-5 rounded-2xl bg-accent-500/10 border border-accent-500/30 shadow-lg shadow-accent-500/5">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-accent-300 flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5" /> {counselText ? '새 상담일지 생성결과' : '새 정기평가 생성결과'}
                            </span>
                            <div className="flex gap-1">
                                {counselText && onRefineCounsel && (
                                    <button type="button" onClick={onRefineCounsel} disabled={locked} className="px-3 py-1 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50" title="현재 상담일지 내용을 기준으로 보완합니다.">
                                        {isGeneratingCounsel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                )}
                                {evalText && onRefineEval && (
                                    <button type="button" onClick={onRefineEval} disabled={locked} className="px-3 py-1 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50" title="현재 정기평가 내용을 기준으로 보완합니다.">
                                        {isGeneratingEval ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                )}
                                <button type="button" onClick={() => void saveDraft()} disabled={locked} className="px-3 py-1 bg-accent-500 text-white font-bold text-xs rounded-lg hover:bg-accent-600 transition-colors shadow-md disabled:opacity-50">{isSaving ? '저장 중…' : '작성 완료(저장)'}</button>
                                <button type="button" disabled={locked} onClick={() => void closeDraft()} className="p-1.5 text-white/60 hover:text-red-400 transition-colors disabled:opacity-50" aria-label="초안 닫기" title="닫기"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                        <textarea
                            value={counselText || evalText}
                            readOnly={locked}
                            onChange={e => counselText ? setCounselText(e.target.value) : setEvalText(e.target.value)}
                            className="textarea-field !bg-black/30 border-accent-500/20 !min-h-[160px] !max-h-[400px] text-sm leading-relaxed font-sans resize-y"
                        />
                    </div>
                )}

                {/* ─── 단일화된 입력 영역 (활성 시에만 혹은 버튼 클릭 후 표시) ─── */}
                {isActive ? (!counselText && !evalText) && (
                    <div className="rounded-2xl border bg-black/20 border-white/10 overflow-hidden mt-6">
                        <div className="flex border-b border-white/5">
                            <button
                                type="button"
                                onClick={() => setWriteMode('counseling')}
                                aria-pressed={writeMode === 'counseling'}
                                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${writeMode === 'counseling' ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500' : 'text-white/40 hover:bg-white/5'}`}
                            >
                                <FileText className="w-4 h-4" /> 상담일지 추가
                            </button>
                            <button
                                type="button"
                                onClick={() => setWriteMode('evaluation')}
                                aria-pressed={writeMode === 'evaluation'}
                                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${writeMode === 'evaluation' ? 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500' : 'text-white/40 hover:bg-white/5'}`}
                            >
                                <ClipboardCheck className="w-4 h-4" /> 정기평가 추가
                            </button>
                        </div>

                        <div className="p-5">
                            {writeMode === 'evaluation' && !planText && (
                                <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs flex items-start gap-2">
                                    <ClipboardCheck className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>직업재활계획서가 아직 완성되지 않았습니다.<br/>정기평가는 계획서 연동이 중요하므로, STEP 2를 먼저 채워주시는 것을 권장합니다.</span>
                                </div>
                            )}

                            <textarea
                                value={writeMode === 'counseling' ? counselInput : evalInput}
                                onChange={e => writeMode === 'counseling' ? setCounselInput(e.target.value) : setEvalInput(e.target.value)}
                                readOnly={isGeneratingCounsel || isGeneratingEval}
                                className="textarea-field !bg-black/40 border-white/5 !min-h-[120px] text-sm leading-relaxed mb-4"
                                placeholder={writeMode === 'counseling'
                                    ? "상담 일시, 장소, 주요 대화 내용 및 진전 피드백을 입력하세요. (이전 타임라인 흐름이 기록됩니다)"
                                    : "평가 관점, 단기목표 달성에 대한 소견, 앞으로 변경이 필요한 계획 등을 자유롭게 입력하세요."}
                            />

                            <div className="flex items-center justify-between">
                                <p className="text-[11px] text-white/20 font-medium flex items-center flex-1 pr-4 gap-1.5 leading-snug">
                                    <Sparkles className="w-3 h-3 shrink-0" />
                                    {writeMode === 'counseling' ? '이전 상담/평가 기록을 참조하여 자연스럽게 연속되는 문서로 정리됩니다.' : '기존 계획서와 상담 내역을 자동 분석하여 전문 평가 소견서를 도출합니다.'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => writeMode === 'counseling' ? onGenerateCounsel() : onGenerateEval()}
                                    disabled={locked}
                                    className={`btn-primary !px-5 !py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-xl shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${writeMode === 'counseling' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'}`}
                                >
                                    {(writeMode === 'counseling' ? isGeneratingCounsel : isGeneratingEval)
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Sparkles className="w-4 h-4" />}
                                    새 초안 생성
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onActivate(); }}
                        className="w-full mt-4 py-4 border border-dashed border-white/10 rounded-2xl text-white/30 text-xs font-bold hover:bg-white/5 hover:text-white/60 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> 새로운 사후관리 기록 (상담 / 평가) 추가하기
                    </button>
                )}
            </div>
        </motion.div>
    );
}
