import { useState, useRef } from 'react';
import { FileText, Loader2, Sparkles, Image as ImageIcon, Copy, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { performOCR } from '../services/ocr';
import { generateText } from '../services/gemini';
import { ToastContainer, useToast } from './Toast';

export function DocumentReviewTab() {
    const { toasts, showToast, removeToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [selectedOcrFile, setSelectedOcrFile] = useState<File | null>(null);
    const [ocrText, setOcrText] = useState('');
    const [counselText, setCounselText] = useState('');
    const [resultText, setResultText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const restoreReviewHeadings = (text: string) => text
        .replace(/^1\)\s*반영 기준 요약/gm, '### 1) 반영 기준 요약')
        .replace(/^2\)\s*상담일지 점검 결과/gm, '### 2) 상담일지 점검 결과')
        .replace(/^3\)\s*수정된 상담일지/gm, '### 3) 수정된 상담일지')
        .replace(/^4\)\s*반영 내용 확인/gm, '### 4) 반영 내용 확인')
        .replace(/^(\d{4}[./-]\d{1,2}[./-]\d{1,2})$/gm, '#### $1');

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedOcrFile(e.target.files?.[0] || null);
    };

    const handleRunOcr = async () => {
        if (!selectedOcrFile) {
            showToast('분석할 이미지/PDF 파일을 먼저 선택해 주세요.', 'error', 4000);
            return;
        }
        try {
            setIsOcrLoading(true);
            const text = await performOCR(selectedOcrFile);
            setOcrText(prev => prev + (prev ? '\n\n' : '') + text);
            showToast('문서 내용이 성공적으로 추출되었습니다.', 'success');
        } catch (error: any) {
            showToast(error.message, 'error', 5000);
        } finally {
            setIsOcrLoading(false);
        }
    };

    const handleGenerateReview = async () => {
        if (!ocrText.trim()) {
            showToast('기준이 되는 직업재활계획서 내용을 입력해주세요.', 'error', 4000);
            return;
        }
        if (!counselText.trim()) {
            showToast('점검할 상담일지를 입력해주세요. 여러 회기 상담일지를 한 번에 붙여넣어도 됩니다.', 'error', 4000);
            return;
        }

        try {
            setIsGenerating(true);
            const prompt = `당신은 직업재활 고용지원 사례기록을 점검하고 보완하는 전문가입니다.
이 기능의 목적은 사용자가 입력한 직업재활계획서의 수행방법을 확인한 뒤, 기존 상담일지, 현장지원일지, 이용자상담, 보호자상담, 기타 고용지원 사례기록에 해당 수행방법이 시간 흐름에 맞게 자연스럽게 반영되도록 점검·수정·보완하는 것입니다.

점검 대상:
- 직업재활계획서
- 상담일지
- 현장지원일지
- 이용자상담 기록
- 보호자상담 기록
- 기타 고용지원 사례기록

반드시 다음 순서로 확인하세요.

1. 직업재활계획서 확인
- 계획 수립일
- 직업목표
- 장기목표
- 단기목표
- 수행방법
- 목표와 관련된 핵심 지원 방향

2. 상담일지 및 사례기록 확인
- 상담일자
- 상담장소
- 상담내용
- 향후 지원계획 및 수퍼비전
- 담당자
- 기존 문맥과 상담 흐름
- 계획 수립일 전후의 시간적 위치

3. 상담일지 날짜별 구분
- 계획 수립 전 상담일지
- 계획 수립일 또는 수립 직후 상담일지
- 계획 수립 후 상담일지
- 변화 확인 또는 유지지원 상담일지

절대 수정 원칙:
- 기존 상담일자는 절대 변경하지 않습니다.
- 기존 상담장소는 사용자가 특별히 요청하지 않은 경우 변경하지 않습니다.
- 기존 상담일지의 기본 사건, 사실관계, 상담 흐름을 삭제하거나 왜곡하지 않습니다.
- 직업재활계획서의 수행방법이 상담 흐름에 자연스럽게 연결되도록 문장을 보완합니다.
- 계획 수립 전 상담일지에는 계획을 이미 수행한 것처럼 쓰지 않습니다.
- 계획 수립 전 → 계획 동의 → 수행 노력 → 변화 확인 → 유지 지원 흐름이 시간순으로 말이 되게 작성합니다.
- 기존 내용이 짧거나 불명확해도 상담일자의 위치에 맞게 자연스럽게 보완합니다.
- 수행방법과 관련 없는 상담일지는 억지로 연결하지 않고 최소한으로 보완합니다.
- 기록의 신뢰성을 해칠 정도의 과장이나 허위 달성 표현은 피합니다.
- 흐름상 필요한 연결 문장은 작성할 수 있으나, 명백히 확인되지 않은 사건은 실제 발생한 일처럼 단정하지 않습니다.
- 근거가 약한 내용은 “함께 확인함”, “필요성을 논의함”, “실천해보기로 함”, “추가 확인이 필요함”처럼 기록 안정성이 높은 표현으로 작성합니다.

날짜별 작성 방식:

1. 계획 수립 전 상담일지
- 아직 계획이 수립되지 않았으므로 목표를 수행했다고 쓰지 않습니다.
- 어려움 확인, 계획 수립 필요성, 목표로 삼을 내용, 지원 방향 논의 중심으로 작성합니다.
- 예: 직장예절과 관련하여 출근 시 인사, 근무 중 표현 사용, 동료와의 의사소통에서 어려움이 나타날 수 있음을 함께 확인함.
- 예: 향후 직업재활계획 수립 시 직장예절 향상을 목표로 반영할 필요성을 논의함.
- 예: 포스기 사용 중 주문 실수를 줄이기 위해 주문 내용을 다시 확인하는 습관이 필요함을 함께 확인함.

2. 계획 수립일 또는 수립 직후 상담일지
- 직업재활계획의 목표와 수행방법을 이용자에게 설명하고 동의를 확인한 흐름으로 작성합니다.
- 예: 직업재활계획에 포함된 직장예절 향상 목표와 수행방법을 이용자와 함께 확인함.
- 예: 출근 시 인사하기, 근무 중 적절한 표현 사용하기, 동료와의 의사소통 방법 연습이 직장생활 유지에 도움이 될 수 있음을 안내함.
- 예: 포스기 주문 입력 전 재확인하기, 메뉴 위치 익히기, 음료 베이스 제조 과정을 단계적으로 연습하는 수행방법을 함께 확인함.

3. 계획 수립 후 상담일지
- 수행방법에 따라 실제 실천한 내용, 노력한 과정, 지원 내용, 변화 가능성이 이어지도록 작성합니다.
- 예: 이용자는 출근 시 인사하기를 실천해보았으며, 근무 중 필요한 상황에서 짧은 표현으로 도움을 요청하는 연습을 진행함.
- 예: 포스기 사용 시 주문 내용을 입력한 뒤 결제 전 메뉴명과 수량을 다시 확인하는 방법을 함께 연습함.
- 예: 음료 베이스 제조 과정을 순서대로 확인하고, 동료 직원의 시연을 본 뒤 따라 해보는 방식으로 실습함.

4. 변화 확인 또는 유지지원 상담일지
- 수행방법을 통해 확인된 변화, 유지가 필요한 부분, 추가 지원 방향을 작성합니다.
- 성과를 과장하지 않습니다.
- 예: 이용자는 출근 시 인사하기를 이전보다 자연스럽게 시도하고 있으며, 근무 중 필요한 표현을 사용하려는 모습이 확인됨.
- 예: 주문 입력 전 재확인하는 습관을 유지하면서 포스기 사용 실수를 줄이기 위해 노력하고 있음.
- 예: 현재 변화가 시작되는 단계이므로, 이용자가 스스로 확인표를 활용하며 안정적으로 실천할 수 있도록 지원할 예정임.

결과 분량 기준:
- 상담일지 점검 결과와 수정 결과는 필요한 만큼 충분히 길고 자세하게 작성합니다.
- 단순 요약으로 끝내지 말고, 직업재활계획서 수행방법이 상담일지에 어떻게 반영되었는지 구체적으로 설명합니다.
- 상담일지가 여러 개인 경우 날짜별로 각각 수정 결과를 제시합니다.
- 각 상담일지별로 기존 상담 흐름 요약, 직업재활계획 수행방법과의 연결 지점, 시간적 위치에 따른 보완 방향, 수정된 상담내용, 향후 지원계획 및 수퍼비전 보완 내용을 포함합니다.
- 입력 내용이 충분하다면 상담일지별 수정 결과는 5~10문장 이상으로 자세히 작성합니다.
- 내용이 부족한 경우에도 “추가 확인 필요”를 표시하면서 기록 안정성이 높은 문장으로 보완합니다.
- 간단히 요약하지 말고, 실무 기록으로 바로 활용 가능한 수준으로 작성합니다.
- 허위 사실을 추가하지 않되, 상담 흐름상 필요한 연결 문장은 기록 안정성이 높은 표현으로 작성합니다.

출력 형식은 반드시 아래 구조를 그대로 사용하세요. 마크다운 표는 사용하지 마세요.

### 1) 반영 기준 요약
- 직업재활계획 수립일:
- 주요 목표:
- 주요 수행방법:
- 상담일지 반영 방향:

### 2) 상담일지 점검 결과
- 상담일지별 시간적 위치:
- 기존 기록에서 확인된 내용:
- 직업재활계획 수행방법과 연결되는 부분:
- 보완이 필요한 부분:
- 과장 또는 시간순서상 부자연스러운 표현 여부:
- 추가 확인이 필요한 내용:

### 3) 수정된 상담일지

#### YYYY/MM/DD
- 상담일시:
- 상담장소:
- 상담내용:
- 향후 지원계획 및 수퍼비전:
- 담당자:

### 4) 반영 내용 확인
- 계획 수립 전 상담일지에 반영한 내용:
- 계획 수립 직후 상담일지에 반영한 내용:
- 계획 수립 후 상담일지에 반영한 내용:
- 변화 확인 또는 유지지원 상담일지에 반영한 내용:
- 추가 확인이 필요한 내용:

--- 직업재활계획서(기준 문서) ---
${ocrText || '(입력 없음)'}

--- 점검 및 수정할 상담일지 전체 ---
${counselText || '(입력 없음)'}
`;

            const result = await generateText('summary', prompt, undefined, { featureKey: 'workmate', documentType: 'document-review' });
            setResultText(restoreReviewHeadings(result));
            showToast('상담일지 정합성 점검 및 수정이 완료되었습니다.', 'success');
        } catch (error: any) {
            showToast(error.message || 'AI 생성 중 오류가 발생했습니다.', 'error', 7000);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(resultText);
        showToast('결과가 복사되었습니다.', 'success');
    };

    return (
        <>
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-7xl mx-auto">
                {/* 좌측: 입력 영역 */}
                <div className="space-y-6">
                    <div className="glass-strong rounded-3xl p-6 border border-white/5 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-accent-400" />
                                직업재활계획서 (기준 문서)
                            </h3>
                            <div className="flex flex-wrap justify-end gap-2">
                                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,application/pdf" />
                                <button onClick={() => fileInputRef.current?.click()} disabled={isOcrLoading} className="px-4 py-2 text-xs font-bold text-white bg-white/10 hover:bg-white/15 rounded-xl flex items-center gap-2 transition-colors">
                                    <ImageIcon className="w-4 h-4" />
                                    {selectedOcrFile ? '파일 다시 선택' : '이미지/PDF 선택'}
                                </button>
                                <button onClick={handleRunOcr} disabled={isOcrLoading || !selectedOcrFile} className="px-4 py-2 text-xs font-bold text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-accent-500/20">
                                    {isOcrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isOcrLoading ? '문서 분석 중...' : '선택 파일 분석'}
                                </button>
                                {selectedOcrFile && <span className="w-full text-right text-[11px] text-white/40">선택됨: {selectedOcrFile.name}</span>}
                            </div>
                        </div>
                        <textarea
                            value={ocrText}
                            onChange={e => setOcrText(e.target.value)}
                            placeholder="직업재활계획서 내용을 입력하거나 이미지/PDF로 업로드하세요. 계획 수립일, 목표, 수행방법을 기준으로 상담일지와 현장지원일지 반영 여부를 점검합니다."
                            className="textarea-field !bg-black/40 border-white/5 !min-h-[260px] text-sm leading-relaxed"
                        />
                    </div>

                    <div className="glass-strong rounded-3xl p-6 border border-white/5 shadow-2xl">
                        <h3 className="font-bold text-white text-lg flex items-center gap-2 mb-4">
                            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
                            점검할 상담일지/현장지원일지 전체
                        </h3>
                        <textarea
                            value={counselText}
                            onChange={e => setCounselText(e.target.value)}
                            placeholder="작성해 둔 상담일지, 현장지원일지, 이용자상담, 보호자상담 기록을 붙여넣어 주세요. 상담일자와 장소는 유지하고, 계획 수립 전/직후/후/유지지원 흐름에 맞게 수행방법 반영 여부를 점검합니다."
                            className="textarea-field !bg-black/40 border-white/5 !min-h-[360px] text-sm leading-relaxed"
                        />
                    </div>

                    <button
                        onClick={handleGenerateReview}
                        disabled={isGenerating}
                        className="w-full btn-primary !py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-xl shadow-accent-500/20 text-lg"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        {isGenerating ? 'AI가 수행방법 반영 여부와 시간 흐름을 점검하고 있습니다...' : '수행방법 반영 점검'}
                    </button>
                </div>

                {/* 우측: 결과 영역 */}
                <div className="glass-strong rounded-3xl p-6 border border-white/5 shadow-2xl flex flex-col h-full min-h-[600px]">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white text-lg flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-accent-400" />
                            상담일지 보완 점검 결과
                        </h3>
                        {resultText && (
                            <button onClick={handleCopy} className="p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                                <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-1 relative overflow-hidden flex flex-col">
                        {!resultText && !isGenerating ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 p-8 text-center">
                                <CheckCircle2 className="w-12 h-12 mb-4 opacity-20" />
                                <p className="font-bold mb-2 text-white/40">아직 점검 결과가 없습니다</p>
                                <p className="text-sm">좌측에 직업재활계획서와 상담일지를 입력해 주세요.<br/>AI가 수행방법을 기준으로 시간 순서에 맞게 상담일지를 보완합니다.</p>
                            </div>
                        ) : (
                            <textarea
                                value={resultText}
                                onChange={e => setResultText(e.target.value)}
                                className="w-full h-full bg-transparent border-none text-white text-sm leading-relaxed p-4 resize-none focus:ring-0 custom-scrollbar flex-1"
                                placeholder="AI가 수행방법 반영 기준으로 점검하고 보완한 상담일지가 여기에 표시됩니다..."
                            />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
