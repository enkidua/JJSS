import { useEffect, useState } from 'react';
import { ScanText, Paperclip, Loader2, Sparkles, ImageIcon, X, AlertCircle } from 'lucide-react';
import { performOCR } from '../services/ocr';
import { getAiDocumentValidationError } from '../utils/fileValidation';
import { CopyButton } from './common/CopyButton';
import { FileDropZone } from './common/FileDropZone';
import { ToolPageShell } from './tools/ToolPageShell';
import { useReportDirty } from './tools/useReportDirty';

interface OCRViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

export function OCRView({ onBack, onDirtyChange }: OCRViewProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState('');
    const [resultFileName, setResultFileName] = useState('');
    const [error, setError] = useState('');

    useReportDirty(Boolean(file || result || isLoading), onDirtyChange);

    // 미리보기용 object URL은 파일이 바뀌거나 화면을 떠날 때 해제합니다.
    useEffect(() => {
        if (!file || !file.type.startsWith('image/')) {
            setPreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const handleFiles = (files: File[]) => {
        const selected = files[0];
        if (!selected) return;
        const validationError = getAiDocumentValidationError(selected);
        if (validationError) {
            setError(validationError);
            return;
        }
        // 이전 추출 결과는 새 결과가 나올 때까지 그대로 둡니다.
        setFile(selected);
        setError('');
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
            setResultFileName(file.name);
        } catch (err: unknown) {
            setError(err instanceof Error && err.message ? err.message : 'OCR 처리 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
        >
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
                    글자가 들어 있는 PDF는 이 컴퓨터 안에서 바로 글자를 읽고 외부로 보내지 않습니다. 스캔한 PDF나 이미지는 원본을 외부 AI 서비스(이미지는 Google Cloud Vision 또는 Google Gemini, 스캔 PDF는 Google Gemini)로 보내야 하므로, 보내기 전에 따로 확인을 받습니다. Vision에서 읽지 못하면 Gemini로 다시 보낼지 한 번 더 묻습니다. 같은 파일을 연속 실행하면 중복 호출을 막습니다.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Upload Section */}
                    <div className="space-y-6">
                        <p className="block text-sm font-bold text-white/70 mb-2 uppercase tracking-wider">파일 업로드</p>
                        <FileDropZone
                            accept="image/*,.pdf"
                            onFiles={handleFiles}
                            disabled={isLoading}
                            ariaLabel="텍스트를 추출할 이미지 또는 PDF 파일 선택"
                            className={`relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center gap-4 group hover:bg-white/5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                                file ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10'
                            }`}
                            activeClassName="border-blue-400 bg-blue-500/10"
                        >
                            {preview ? (
                                <img src={preview} alt="선택한 이미지 미리보기" className="max-h-48 rounded-lg shadow-lg" />
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
                                        <p className="text-white/30 text-xs mt-1">파일을 끌어다 놓거나 클릭해서 고르세요</p>
                                    </div>
                                </>
                            )}
                            {file && <p className="text-white/30 text-xs">다른 파일로 바꾸려면 다시 클릭하거나 끌어다 놓으세요</p>}
                        </FileDropZone>
                        {file && (
                            <button
                                type="button"
                                onClick={() => setFile(null)}
                                disabled={isLoading}
                                className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1.5"
                            >
                                <X className="w-3.5 h-3.5" /> 선택한 파일 지우기
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={runOCR}
                            disabled={!file || isLoading}
                            className="btn-primary w-full flex items-center justify-center gap-2 !py-4 text-lg"
                        >
                            {isLoading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> 문자 추출 중...</>
                            ) : (
                                <><Sparkles className="w-5 h-5" /> 텍스트 추출하기</>
                            )}
                        </button>

                        {error && (
                            <div role="alert" className="flex gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Result Section */}
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between mb-4 gap-2">
                            <label htmlFor="ocr-result" className="text-sm font-bold text-white/70 uppercase tracking-wider">추출 결과</label>
                            {result && <CopyButton text={result} />}
                        </div>
                        {result && resultFileName && <p className="-mt-2 mb-2 text-[11px] text-white/35 truncate">원본 파일: {resultFileName}</p>}
                        <div className="flex-1 min-h-[300px] relative">
                            <textarea
                                id="ocr-result"
                                readOnly
                                value={result}
                                placeholder="텍스트가 여기 표시됩니다..."
                                className="w-full h-full min-h-[300px] bg-white/5 border border-white/10 rounded-2xl p-6 text-white/80 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-500/30 whitespace-pre-wrap"
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
        </ToolPageShell>
    );
}
