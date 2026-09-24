import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, ShieldAlert, KeyRound, Unlock, Sparkles, Loader2, ArrowRight, EyeOff } from 'lucide-react';
import { generateText, wrapAsData } from '../services/gemini';
import { collectKnownNames } from '../services/knownNames';
import { anonymizeText } from '../utils/anonymizer';
import { CopyButton } from './common/CopyButton';
import { useAppToast } from './Toast';

interface MaskingViewProps {
    onBack: () => void;
    /** 입력·결과가 있어 화면을 벗어나면 내용이 사라지는지 부모 페이지에 알린다. */
    onDirtyChange?: (dirty: boolean) => void;
}

interface MaskingRow {
    category: string;
    original: string;
    masked: string;
    /** false면 일반화(예: 32세 → 30대, 상세주소 → 구)만 한 항목 */
    restorable: boolean;
    source: 'local' | 'ai';
}

interface AiFinding {
    original: string;
    category: string;
}

const TOKEN_SPLIT_PATTERN = /(⟦[^⟦⟧]*⟧)/;
const TOKEN_PATTERN = /⟦[^⟦⟧]*⟧/g;
const AI_CATEGORY_LABELS: Record<string, string> = {
    이름: '이름', 성명: '이름', 주소: '주소', 전화: '전화', 전화번호: '전화', 연락처: '전화',
    주민번호: '주민번호', 주민등록번호: '주민번호', 외국인등록번호: '주민번호', 생년월일: '생년월일',
    이메일: '이메일', 차량번호: '차량번호', 계좌번호: '계좌번호',
};
const MAX_AI_FINDINGS = 100;

/** 이미 가린 토큰(⟦…⟧)은 건드리지 않고 나머지 부분에서만 치환한다. */
function replaceOutsideTokens(text: string, target: string, replacement: string): string {
    return text
        .split(TOKEN_SPLIT_PATTERN)
        .map((part, index) => (index % 2 === 1 ? part : part.split(target).join(replacement)))
        .join('');
}

/** AI 응답(JSON 배열)을 검증한다. 빈 값·한 글자·이미 가린 토큰·글에 없는 문자열은 버린다. */
function parseAiFindings(raw: string, maskedText: string): AiFinding[] {
    const jsonText = raw.match(/\[[\s\S]*\]/)?.[0];
    if (!jsonText) throw new Error('AI 응답 형식이 올바르지 않습니다.');
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error('AI 응답 형식이 올바르지 않습니다.');
    }
    if (!Array.isArray(parsed)) throw new Error('AI 응답 형식이 올바르지 않습니다.');

    const visibleText = maskedText.replace(TOKEN_PATTERN, ' ');
    const seen = new Set<string>();
    const findings: AiFinding[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const { original, category } = item as { original?: unknown; category?: unknown };
        if (typeof original !== 'string') continue;
        const value = original.trim();
        if (value.length < 2 || value.length > 100) continue;
        if (/[⟦⟧]/.test(value) || !/[\p{L}\p{N}]/u.test(value)) continue;
        if (!visibleText.includes(value) || seen.has(value)) continue;
        seen.add(value);
        const label = typeof category === 'string' ? AI_CATEGORY_LABELS[category.trim()] : undefined;
        findings.push({ original: value, category: label || '기타' });
        if (findings.length >= MAX_AI_FINDINGS) break;
    }
    return findings;
}

/** AI가 찾은 항목에 로컬 고유 토큰(⟦이름3⟧ 등)을 새로 붙여 치환한다. 번호가 겹치지 않으므로 복원이 모호하지 않다. */
function applyAiFindings(maskedText: string, findings: AiFinding[]) {
    const usedTokens = new Set(maskedText.match(TOKEN_PATTERN) || []);
    const counters: Record<string, number> = {};
    const rows: MaskingRow[] = [];
    let text = maskedText;
    for (const finding of [...findings].sort((a, b) => b.original.length - a.original.length)) {
        if (!text.split(TOKEN_SPLIT_PATTERN).some((part, index) => index % 2 === 0 && part.includes(finding.original))) continue;
        let token = '';
        do {
            counters[finding.category] = (counters[finding.category] || 0) + 1;
            token = `⟦${finding.category}${counters[finding.category]}⟧`;
        } while (usedTokens.has(token));
        usedTokens.add(token);
        text = replaceOutsideTokens(text, finding.original, token);
        rows.push({ category: finding.category, original: finding.original, masked: token, restorable: true, source: 'ai' });
    }
    return { text, rows };
}

export function MaskingView({ onBack, onDirtyChange }: MaskingViewProps) {
    const showToast = useAppToast();
    const [input, setInput] = useState('');
    const [sourceText, setSourceText] = useState('');
    const [maskedText, setMaskedText] = useState('');
    const [rows, setRows] = useState<MaskingRow[]>([]);
    const [showOriginal, setShowOriginal] = useState(false);
    const [aiConsent, setAiConsent] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiChecked, setAiChecked] = useState(false);
    const [notice, setNotice] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const isDirty = input.trim().length > 0 || maskedText.length > 0;
    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;

    useEffect(() => {
        onDirtyChangeRef.current?.(isDirty);
    }, [isDirty]);

    useEffect(() => () => onDirtyChangeRef.current?.(false), []);

    const inputChangedAfterMasking = Boolean(maskedText) && input !== sourceText;
    const displayedText = showOriginal ? sourceText : maskedText;

    const handleLocalMask = () => {
        if (!input.trim() || aiLoading) return;
        const result = anonymizeText(input, { knownNames: collectKnownNames() });
        setSourceText(input);
        setMaskedText(result.maskedText);
        setRows(result.items.map(item => ({ ...item, source: 'local' as const })));
        setShowOriginal(false);
        setAiChecked(false);
        setErrorMsg('');
        setNotice(result.items.length
            ? '이 컴퓨터 안에서만 처리했습니다. 외부로 보낸 내용은 없습니다. 자동 규칙이 놓친 이름이나 주소가 없는지 꼭 직접 확인해 주세요.'
            : '자동 규칙으로 찾은 개인정보가 없습니다. 이름·주소 등이 남아 있는지 직접 확인해 주세요.');
    };

    const handleAiCheck = async () => {
        if (!maskedText || !aiConsent || aiLoading || inputChangedAfterMasking) return;
        setAiLoading(true);
        setErrorMsg('');
        try {
            // 1차로 가린 글만 보낸다. 원문은 외부로 보내지 않으며, 다른 AI 제공업체로 자동 전환하지 않는다.
            const raw = await generateText(
                'masking',
                `아래 자료에서 아직 남아 있는 개인정보를 찾아 주세요.\n${wrapAsData(maskedText)}`,
                undefined,
                { featureKey: 'tools', documentType: 'masking-ai-check', disableCrossProviderFailover: true },
            );
            const findings = parseAiFindings(raw, maskedText);
            const applied = applyAiFindings(maskedText, findings);
            setMaskedText(applied.text);
            setRows(prev => [...prev, ...applied.rows]);
            setShowOriginal(false);
            setAiChecked(true);
            setNotice(applied.rows.length
                ? `AI 추가 점검에서 ${applied.rows.length}건을 더 찾아 가렸습니다. 결과를 한 번 더 확인해 주세요.`
                : 'AI 추가 점검에서 더 찾은 개인정보가 없습니다.');
            showToast(applied.rows.length ? `AI 추가 점검: ${applied.rows.length}건 더 가림` : 'AI 추가 점검 완료: 더 찾은 항목 없음', 'success');
        } catch (e: any) {
            setErrorMsg(`AI 추가 점검에 실패했습니다. 이 컴퓨터에서 가린 결과는 그대로 유지됩니다. (${e?.message || 'AI 호출 실패'})`);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-6xl mx-auto"
        >
            <button
                type="button"
                onClick={onBack}
                className="btn-ghost flex items-center gap-2 mb-6 text-sm text-white/70 hover:text-white"
            >
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="glass-strong rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 relative p-6 md:p-10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white">개인정보 비식별화 (스마트 마스킹)</h2>
                        <p className="text-white/50 mt-1">이름·연락처·주민번호·주소 등을 이 컴퓨터 안에서 먼저 가립니다. 원문은 외부로 보내지 않습니다.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Input */}
                    <div className="flex flex-col h-full">
                        <label htmlFor="masking-input" className="text-sm font-bold text-rose-400 mb-3 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4" /> 원본 텍스트 입력
                        </label>
                        <textarea
                            id="masking-input"
                            className="w-full flex-1 min-h-[300px] bg-black/30 border border-white/10 rounded-2xl p-5 text-white placeholder-white/30 focus:outline-none focus:border-rose-500/50 resize-none transition-colors shadow-inner text-[15px] leading-relaxed custom-scrollbar"
                            placeholder="개인정보(이름, 주민번호, 주소, 연락처 등)가 포함된 원문을 붙여넣으세요..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={handleLocalMask}
                            disabled={aiLoading || !input.trim()}
                            className="btn-primary w-full mt-4 flex items-center justify-center gap-2 !py-4 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]"
                        >
                            <EyeOff className="w-5 h-5" /> 개인정보 가리기 (이 컴퓨터에서 처리)
                        </button>

                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                            <label className="flex items-start gap-3 text-sm text-white/80 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 accent-rose-500"
                                    checked={aiConsent}
                                    onChange={(e) => setAiConsent(e.target.checked)}
                                    disabled={aiLoading}
                                />
                                <span>
                                    AI로 추가 점검하는 데 동의합니다.
                                    <span className="block text-xs text-white/50 mt-1">
                                        이미 가린 결과 글만 설정에서 선택한 AI 한 곳으로 보냅니다. 원문은 보내지 않으며, 다른 AI로 자동 전환하지 않습니다.
                                    </span>
                                </span>
                            </label>
                            <button
                                type="button"
                                onClick={() => void handleAiCheck()}
                                disabled={!aiConsent || !maskedText || aiLoading || inputChangedAfterMasking}
                                className="btn-ghost w-full flex items-center justify-center gap-2 border border-white/15 rounded-xl !py-3 text-sm text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {aiLoading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> AI로 추가 점검 중...</>
                                    : <><Sparkles className="w-4 h-4" /> AI로 추가 점검{aiChecked ? ' (완료)' : ''}</>}
                            </button>
                            {!maskedText && <p className="text-xs text-white/40">먼저 "개인정보 가리기"를 실행해 주세요.</p>}
                            {inputChangedAfterMasking && <p className="text-xs text-amber-300">원문이 바뀌었습니다. "개인정보 가리기"를 다시 실행한 뒤 점검해 주세요.</p>}
                        </div>
                    </div>

                    {/* Right: Result & Mapping Table */}
                    <div className="flex flex-col h-full bg-[#1e293b]/50 border border-white/5 rounded-2xl p-5 relative">
                        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-3">
                            <span className="text-sm font-bold text-white mb-0 flex items-center gap-2">
                                {showOriginal ? <Unlock className="w-4 h-4 text-amber-400" /> : <KeyRound className="w-4 h-4 text-emerald-400" />}
                                처리 결과 {maskedText ? (showOriginal ? '(원문 보기)' : '(가린 글)') : ''}
                            </span>

                            <div className="flex gap-2">
                                {maskedText && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowOriginal(prev => !prev)}
                                            className="btn-ghost !px-3 !py-1.5 text-xs text-white/70 hover:text-white flex items-center gap-1.5 border border-white/10 rounded-lg"
                                        >
                                            {showOriginal ? <KeyRound className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                            {showOriginal ? '가린 글 보기' : '원문 보기'}
                                        </button>
                                        <CopyButton
                                            text={displayedText}
                                            label={showOriginal ? '원문 복사' : '가린 글 복사'}
                                            className="btn-ghost !px-3 !py-1.5 text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1.5 border border-blue-500/20 bg-blue-500/10 rounded-lg"
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        {errorMsg && (
                            <div role="alert" className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm leading-relaxed">
                                {errorMsg}
                            </div>
                        )}
                        {notice && !errorMsg && (
                            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 text-sm leading-relaxed">
                                {notice}
                            </div>
                        )}

                        {maskedText ? (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
                                    <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-white/90">
                                        {displayedText}
                                    </pre>
                                </div>

                                {/* Mapping Table */}
                                {rows.length > 0 && (
                                    <div className="bg-black/40 rounded-xl p-4 border border-white/10 max-h-48 flex flex-col">
                                        <h4 className="text-xs font-bold text-white/50 tracking-widest mb-3 flex items-center gap-2">
                                            가린 항목 ({rows.length}건)
                                        </h4>
                                        <div className="overflow-y-auto custom-scrollbar flex-1 pr-2">
                                            <div className="space-y-2">
                                                {rows.map((row, idx) => (
                                                    <div key={`${row.masked}-${idx}`} className="flex items-center gap-3 text-sm">
                                                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/40 text-[10px] w-20 text-center shrink-0">
                                                            {row.source === 'ai' ? `AI·${row.category}` : row.category}
                                                        </span>
                                                        <span className="text-rose-300 flex-1 truncate">{row.original}</span>
                                                        <ArrowRight className="w-3 h-3 text-white/20 flex-shrink-0" />
                                                        <span className="text-emerald-300 flex-1 truncate font-mono">
                                                            {row.masked}{row.restorable ? '' : ' (일반화)'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center flex-col text-white/20 select-none opacity-50">
                                <ShieldCheck className="w-16 h-16 mb-4" />
                                <p className="text-sm">텍스트를 입력하고 "개인정보 가리기"를 눌러 주세요</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
