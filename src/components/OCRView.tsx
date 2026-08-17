import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ScanText, Paperclip, Loader2, Copy, Sparkles, ImageIcon, X, AlertCircle } from 'lucide-react';
import { performOCR } from '../services/ocr';

interface OCRViewProps {
    onBack: () => void;
}

export function OCRView({ onBack }: OCRViewProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setFile(selected);
        setError('');
        setResult('');

        if (selected.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(selected);
        } else {
            setPreview(null);
        }
    };

    const runOCR = async () => {
        if (isLoading) return;
        if (!file) {
            setError('텍스트를 추출할 이미지 또는 PDF 파일을 먼저 선택해 주세요.');
            return;
        }
        setIsLoading(true);
        setError('');

        try {
            const text = await performOCR(file);
            setResult(text);
        } catch (err: any) {
            setError(err.message || 'OCR 처리 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
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
            className="w-full max-w-4xl mx-auto"
        >
            <button onClick={onBack} className="btn-ghost flex items-center gap-2 mb-6 text-sm">
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="glass-strong rounded-2xl p-8 border border-white/10 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <ScanText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white">문서/이미지 OCR 변환</h2>
                        <p className="text-white/40 text-sm">업무 문서의 텍스트를 추출합니다. 예산 영수증 자동 입력은 예산 관리 화면의 OCR을 사용해 주세요.</p>
                    </div>
                </div>
                <div className="mb-6 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-xs leading-relaxed text-blue-100/80">
                    OCR 호출 순서: 이미지 파일은 Vision API를 먼저 시도하고 실패하면 Gemini API 키가 있을 때 Gemini fallback을 1회 시도합니다. PDF OCR은 Gemini API를 사용합니다. 같은 파일을 연속 실행하면 중복 호출을 막습니다.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Upload Section */}
                    <div className="space-y-6">
                        <label className="block text-sm font-bold text-white/70 mb-2 uppercase tracking-wider">파일 업로드</label>
                        <div 
                            className={`relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center gap-4 group hover:bg-white/5 cursor-pointer ${
                                file ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10'
                            }`}
                            onClick={() => document.getElementById('ocr-upload')?.click()}
                        >
                            <input 
                                id="ocr-upload"
                                type="file" 
                                className="hidden" 
                                onChange={handleFileChange}
                                accept="image/*,.pdf"
                            />
                            
                            {preview ? (
                                <img src={preview} alt="Preview" className="max-h-48 rounded-lg shadow-lg" />
                            ) : file ? (
                                <div className="text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                                        <Paperclip className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <p className="text-white font-medium truncate max-w-[200px]">{file.name}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                        <ImageIcon className="w-8 h-8 text-white/20 group-hover:text-white/40" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white font-bold">이미지 또는 PDF 선택</p>
                                        <p className="text-white/30 text-xs mt-1">드래그하거나 클릭하여 업로드</p>
                                    </div>
                                </>
                            )}
                            
                            {file && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <button 
                            onClick={runOCR} 
                            disabled={!file || isLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2 !py-4 text-lg"
                        >
                            {isLoading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> 문자 추출 중...</>
                            ) : (
                                <><Sparkles className="w-5 h-5" /> 텍스트 추출 시작</>
                            )}
                        </button>

                        {error && (
                            <div className="flex gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Result Section */}
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-bold text-white/70 uppercase tracking-wider">추출 결과</label>
                            {result && (
                                <button onClick={handleCopy} className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5" /> {copied ? '복사됨!' : '전체 복사'}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-h-[300px] relative">
                            <textarea 
                                readOnly
                                value={result}
                                placeholder="텍스트가 여기 표시됩니다..."
                                className="w-full h-full bg-white/5 border border-white/10 rounded-2xl p-6 text-white/80 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/30 whitespace-pre-wrap"
                            />
                            {!result && !isLoading && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                    <ScanText className="w-12 h-12" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
