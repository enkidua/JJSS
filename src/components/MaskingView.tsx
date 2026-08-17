import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, ShieldAlert, KeyRound, Copy, Unlock, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { generateText } from '../services/gemini';
import { anonymizeText } from '../utils/anonymizer';

interface MaskingViewProps {
    onBack: () => void;
}

interface MaskingMapping {
    original: string;
    category: string;
    masked: string;
}

export function MaskingView({ onBack }: MaskingViewProps) {
    const [input, setInput] = useState('');
    const [result, setResult] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mapping, setMapping] = useState<MaskingMapping[]>([]);
    const [isMasked, setIsMasked] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [copied, setCopied] = useState(false);

    const handleRun = async () => {
        if (!input.trim()) return;
        setIsLoading(true);
        setErrorMsg('');
        setResult('');
        try {
            const prompt = `다음 텍스트에 포함된 모든 개인정보(이름, 주소, 장애명, 주민번호, 생년월일, 전화번호 등)를 빠짐없이 찾아내어 비식별화 매핑 데이터를 JSON 배열 포맷으로 제공해줘. \n` +
            `응답은 순수 JSON 배열만 출력해야 하며 다른 말은 덧붙이지 마.\n` + 
            `[{"original": "원본문자열", "category": "정보유형(이름/주소등)", "masked": "대체된문자열"}]\n\n` +
            `[텍스트 시작]\n${input}`;
            
            const raw = await generateText('masking' as any, prompt); 
            const jsonStrMatch = raw.match(/\[[\s\S]*\]/);
            
            if (jsonStrMatch) {
                const arr = JSON.parse(jsonStrMatch[0]) as MaskingMapping[];
                
                // 적용 (긴 문자열부터 치환하여 부분 치환 오류 방지)
                let tempMasked = input;
                const sortedMap = [...arr].sort((a,b) => b.original.length - a.original.length);
                sortedMap.forEach((item) => {
                    tempMasked = tempMasked.split(item.original).join(item.masked);
                });
                
                setMapping(sortedMap);
                setResult(tempMasked);
                setIsMasked(true);
            } else {
                throw new Error("비식별화 데이터를 추출하지 못했습니다. 형식이 올바르지 않습니다.");
            }
        } catch (e: any) {
            const fallback = anonymizeText(input);
            const fallbackMapping = Object.entries(fallback.mapping).map(([masked, original]) => ({
                original,
                category: '로컬 규칙',
                masked,
            }));
            setMapping(fallbackMapping);
            setResult(fallback.maskedText);
            setIsMasked(true);
            setErrorMsg(`AI 비식별화에 실패하여 기본 로컬 마스킹을 적용했습니다. 전화번호, 주민번호, 이메일, 일부 이름/주소 중심으로 처리되었습니다. (${e.message || 'API 호출 실패'})`);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleMasking = () => {
        if (!result || mapping.length === 0) return;
        
        if (isMasked) {
            // 복호화
            let decoded = result;
            const sortedMap = [...mapping].sort((a,b) => b.masked.length - a.masked.length);
            sortedMap.forEach((item) => {
                decoded = decoded.split(item.masked).join(item.original);
            });
            setResult(decoded);
            setIsMasked(false);
        } else {
            // 다시 마스킹
            let masked = result;
            const sortedMap = [...mapping].sort((a,b) => b.original.length - a.original.length);
            sortedMap.forEach((item) => {
                masked = masked.split(item.original).join(item.masked);
            });
            setResult(masked);
            setIsMasked(true);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-6xl mx-auto"
        >
            <button
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
                        <p className="text-white/50 mt-1">AI가 원문 내 개인정보를 정확히 식별하고 안전하게 변환하며, 복원 기능을 지원합니다.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Input */}
                    <div className="flex flex-col h-full">
                        <label className="text-sm font-bold text-rose-400 mb-3 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4" /> 원본 텍스트 입력
                        </label>
                        <textarea
                            className="w-full flex-1 min-h-[300px] bg-black/30 border border-white/10 rounded-2xl p-5 text-white placeholder-white/30 focus:outline-none focus:border-rose-500/50 resize-none transition-colors shadow-inner text-[15px] leading-relaxed custom-scrollbar"
                            placeholder="개인정보(이름, 주민번호, 주소, 장애명 등)가 포함된 원문을 붙여넣으세요..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button
                            onClick={handleRun}
                            disabled={isLoading || !input.trim()}
                            className="btn-primary w-full mt-4 flex items-center justify-center gap-2 !py-4 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]"
                        >
                            {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> 분석 중...</> : <><Sparkles className="w-5 h-5" /> 스마트 마스킹 실행</>}
                        </button>
                    </div>

                    {/* Right: Result & Mapping Table */}
                    <div className="flex flex-col h-full bg-[#1e293b]/50 border border-white/5 rounded-2xl p-5 relative">
                        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-3">
                            <label className="text-sm font-bold text-white mb-0 flex items-center gap-2">
                                {isMasked ? <KeyRound className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-amber-400" />} 
                                처리 결과 {isMasked ? '(비식별화 상태)' : '(복호화 상태)'}
                            </label>
                            
                            <div className="flex gap-2">
                                {result && (
                                    <>
                                        <button 
                                            onClick={toggleMasking}
                                            className="btn-ghost !px-3 !py-1.5 text-xs text-white/70 hover:text-white flex items-center gap-1.5 border border-white/10 rounded-lg"
                                        >
                                            {isMasked ? <Unlock className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                                            {isMasked ? '원본 복원' : '다시 가리기'}
                                        </button>
                                        <button 
                                            onClick={handleCopy}
                                            className="btn-ghost !px-3 !py-1.5 text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1.5 border border-blue-500/20 bg-blue-500/10 rounded-lg"
                                        >
                                            <Copy className="w-3.5 h-3.5" /> {copied ? '복사됨' : '복사'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm leading-relaxed">
                                {errorMsg}
                            </div>
                        )}

                        {result ? (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
                                    <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-white/90">
                                        {result}
                                    </pre>
                                </div>
                                
                                {/* Mapping Table */}
                                {mapping.length > 0 && (
                                    <div className="bg-black/40 rounded-xl p-4 border border-white/10 max-h-48 flex flex-col">
                                        <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            식별된 데이터 매핑
                                        </h4>
                                        <div className="overflow-y-auto custom-scrollbar flex-1 pr-2">
                                            <div className="space-y-2">
                                                {mapping.map((m, idx) => (
                                                    <div key={idx} className="flex items-center gap-3 text-sm">
                                                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/40 text-[10px] w-16 text-center">{m.category}</span>
                                                        <span className="text-rose-300 flex-1 truncate">{m.original}</span>
                                                        <ArrowRight className="w-3 h-3 text-white/20 flex-shrink-0" />
                                                        <span className="text-emerald-300 flex-1 truncate font-mono">{m.masked}</span>
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
                                <p className="text-sm">텍스트를 입력하고 분석을 실행하세요</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
