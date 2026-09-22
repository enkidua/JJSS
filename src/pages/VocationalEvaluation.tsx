import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSearch,
  FileText,
  UploadCloud,
  X,
  Loader2,
  Copy,
  Download,
  Check,
  Image as ImageIcon,
  Sparkles,
  Save,
  RotateCcw,
  History,
  Trash2,
  Edit3,
} from 'lucide-react';
import { analyzeTestResults, generateReport } from '../services/gemini';
import { regenerateDocumentFromCurrent } from '../services/documentRegenerationService';
import { downloadAsDocx } from '../utils/docxGenerator';
import { getAiDocumentValidationError, getFileFingerprint } from '../utils/fileValidation';

export default function VocationalEvaluation() {
  const [activeTab, setActiveTab] = useState<'analyzer' | 'report' | 'history'>('analyzer');

  // Analyzer State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [analyzerInput, setAnalyzerInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefiningAnalysis, setIsRefiningAnalysis] = useState(false);
  const [analyzerResult, setAnalyzerResult] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report State
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportInput, setReportInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefiningReport, setIsRefiningReport] = useState(false);
  const [reportResult, setReportResult] = useState('');
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [savedDocs, setSavedDocs] = useState<Array<{ id: string; type: 'analysis' | 'report'; title: string; content: string; savedAt: string; updatedAt?: string }>>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDraft, setHistoryDraft] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jjss:vocational-evaluation-history');
      if (saved) setSavedDocs(JSON.parse(saved));
    } catch {
      setSavedDocs([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('jjss:vocational-evaluation-history', JSON.stringify(savedDocs));
  }, [savedDocs]);

  const latestSavedAnalysis = savedDocs.find(doc => doc.type === 'analysis')?.content || '';
  const selectedHistoryAnalysis = savedDocs.find(doc => doc.id === selectedHistoryId && doc.type === 'analysis')?.content || '';
  const reportReferenceContent = [
    reportInput.trim() ? `[직접 입력 참고 내용]\n${reportInput.trim()}` : '',
    analyzerResult.trim() ? `[최근 결과분석기 내용]\n${analyzerResult.trim()}` : '',
    selectedHistoryAnalysis.trim() ? `[선택한 저장 결과분석 문서]\n${selectedHistoryAnalysis.trim()}` : '',
    !analyzerResult.trim() && !selectedHistoryAnalysis.trim() && latestSavedAnalysis.trim() ? `[저장된 최근 결과분석 문서]\n${latestSavedAnalysis.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  const canGenerateReport = !!reportReferenceContent.trim() || reportFiles.length > 0;

  const loadLatestAnalysisToReport = () => {
    const source = analyzerResult.trim() || selectedHistoryAnalysis.trim() || latestSavedAnalysis.trim();
    if (!source) {
      alert('불러올 결과분석 내용이 없습니다. 먼저 결과분석을 생성하거나 저장 문서에서 결과분석 문서를 선택해 주세요.');
      return;
    }
    setReportInput(source);
    setActiveTab('report');
  };

  // === Analyzer Handlers ===
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter((file) => !getAiDocumentValidationError(file));

      if (validFiles.length !== newFiles.length) {
        const rejected = newFiles.find(file => getAiDocumentValidationError(file));
        alert(rejected ? `${rejected.name}: ${getAiDocumentValidationError(rejected)}` : '이미지 또는 PDF 파일만 업로드할 수 있습니다.');
      }

      setSelectedFiles((prev) => {
        const existing = new Set(prev.map(getFileFingerprint));
        return [...prev, ...validFiles.filter(file => !existing.has(getFileFingerprint(file)))];
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (selectedFiles.length === 0 && !analyzerInput.trim()) {
      alert('파일을 업로드하거나 분석할 내용을 입력해 주세요.');
      return;
    }

    setIsAnalyzing(true);
    setDownloadError('');
    setCopied(false);

    try {
      const result = await analyzeTestResults(selectedFiles, analyzerInput);
      setAnalyzerResult(result);
      setReportInput(prev => prev.trim() ? prev : result);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // === Report Handlers ===
  const handleReportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter((file) => !getAiDocumentValidationError(file));

      if (validFiles.length !== newFiles.length) {
        const rejected = newFiles.find(file => getAiDocumentValidationError(file));
        alert(rejected ? `${rejected.name}: ${getAiDocumentValidationError(rejected)}` : '이미지 또는 PDF 파일만 업로드할 수 있습니다.');
      }

      setReportFiles((prev) => {
        const existing = new Set(prev.map(getFileFingerprint));
        return [...prev, ...validFiles.filter(file => !existing.has(getFileFingerprint(file)))];
      });
    }
  };

  const removeReportFile = (index: number) => {
    setReportFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateReport = async () => {
    if (!canGenerateReport) {
      alert('종합소견서 작성에 참고할 내용을 입력하거나 결과분석 내용을 먼저 생성해 주세요.');
      return;
    }

    setIsGenerating(true);
    setDownloadError('');
    setCopied(false);

    try {
      const result = await generateReport(reportReferenceContent, reportFiles);
      setReportResult(result);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsGenerating(false);
    }
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('복사에 실패했습니다.');
    }
  };

  const handleDownloadDocx = async () => {
    if (!reportResult) return;
    setDownloadError('');
    try {
      await downloadAsDocx(reportResult);
    } catch (error: any) {
      setDownloadError(error?.message || '문서 파일 생성 중 오류가 발생했습니다. 작성된 내용은 유지됩니다.');
    }
  };

  const saveEvaluationDoc = (type: 'analysis' | 'report') => {
    const content = type === 'analysis' ? analyzerResult : reportResult;
    if (!content.trim()) {
      alert('저장할 내용이 없습니다.');
      return;
    }
    const title = type === 'analysis' ? '직업평가 결과분석' : '직업평가 종합소견서';
    setSavedDocs(prev => [{
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type,
      title,
      content,
      savedAt: new Date().toISOString(),
    }, ...prev]);
    alert('저장 문서/이력에 저장했습니다.');
  };

  const selectHistoryDoc = (doc: { id: string; content: string }) => {
    setSelectedHistoryId(doc.id);
    setHistoryDraft(doc.content);
  };

  const saveHistoryDoc = () => {
    if (!selectedHistoryId) {
      alert('수정할 문서를 먼저 선택해 주세요.');
      return;
    }
    if (!historyDraft.trim()) {
      alert('저장할 내용이 없습니다.');
      return;
    }
    try {
      setSavedDocs(prev => prev.map(doc => doc.id === selectedHistoryId
        ? { ...doc, content: historyDraft, updatedAt: new Date().toISOString() }
        : doc
      ));
      alert('직업평가 저장 문서를 수정했습니다.');
    } catch {
      alert('수정 저장 중 오류가 발생했습니다. 기존 내용은 유지됩니다.');
    }
  };

  const deleteHistoryDoc = (docId: string) => {
    if (!confirm('이 직업평가 기록을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) return;
    try {
      setSavedDocs(prev => prev.filter(doc => doc.id !== docId));
      if (selectedHistoryId === docId) {
        setSelectedHistoryId(null);
        setHistoryDraft('');
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다. 기존 내용은 유지됩니다.');
    }
  };

  const clearAnalyzer = () => {
    if (!analyzerResult && !analyzerInput && selectedFiles.length === 0) return;
    if (!confirm('결과분석기 입력과 결과를 초기화할까요? 저장된 이력은 유지됩니다.')) return;
    setSelectedFiles([]);
    setAnalyzerInput('');
    setAnalyzerResult('');
    setDownloadError('');
  };

  const clearReport = () => {
    if (!reportResult && !reportInput && reportFiles.length === 0) return;
    if (!confirm('종합소견서 입력과 결과를 초기화할까요? 저장된 이력은 유지됩니다.')) return;
    setReportFiles([]);
    setReportInput('');
    setReportResult('');
    setDownloadError('');
  };

  const refineAnalysisResult = async () => {
    if (!analyzerResult.trim()) {
      alert('먼저 보완할 분석 결과가 필요합니다.');
      return;
    }
    if (!confirm('현재 분석 결과 내용을 기준으로 보완합니다. 실패해도 기존 내용은 유지됩니다. 진행할까요?')) return;
    const previous = analyzerResult;
    setIsRefiningAnalysis(true);
    try {
      const result = await regenerateDocumentFromCurrent('vocational_eval', {
        documentTitle: '직업평가 결과분석',
        currentContent: analyzerResult,
        userContext: analyzerInput ? `[담당자 직접 입력]\n${analyzerInput}` : '',
        additionalInstruction: '검사 결과 해석, 직업적 강점, 제한점, 추가 확인 필요사항, 지원 방향이 구분되도록 보완해 주세요.',
      });
      setAnalyzerResult(result);
      setReportInput(prev => prev.trim() ? prev : result);
    } catch (error: any) {
      setAnalyzerResult(previous);
      alert(error?.message || '분석 결과 보완 중 오류가 발생했습니다. 기존 내용은 유지됩니다.');
    } finally {
      setIsRefiningAnalysis(false);
    }
  };

  const refineReportResult = async () => {
    if (!reportResult.trim()) {
      alert('먼저 보완할 종합 소견서가 필요합니다.');
      return;
    }
    if (!confirm('현재 종합 소견서 내용을 기준으로 보완합니다. 실패해도 기존 내용은 유지됩니다. 진행할까요?')) return;
    const previous = reportResult;
    setIsRefiningReport(true);
    try {
      const result = await regenerateDocumentFromCurrent('vocational_eval', {
        documentTitle: '직업평가 종합소견서',
        currentContent: reportResult,
        userContext: reportInput,
        previousRecords: analyzerResult,
        additionalInstruction: '현재 작성된 종합소견서의 표현을 유지하면서 직업목표, 장단기 지원계획, 수행방법 중심으로 보완해 주세요.',
      });
      setReportResult(result);
    } catch (error: any) {
      setReportResult(previous);
      alert(error?.message || '종합 소견서 보완 중 오류가 발생했습니다. 기존 내용은 유지됩니다.');
    } finally {
      setIsRefiningReport(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20 pt-8" style={{ marginTop: '0' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black gradient-text">직업평가</h1>
          <p className="text-slate-400 mt-2">
            검사 결과를 분석하거나 종합 소견서를 자동으로 작성합니다.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div role="group" aria-label="직업평가 메뉴" className="flex space-x-2 bg-white/5 p-1 rounded-2xl glass-strong w-fit max-w-full overflow-x-auto border border-white/10 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          aria-pressed={activeTab === 'analyzer'}
          onClick={() => setActiveTab('analyzer')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'analyzer'
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileSearch className="w-5 h-5" />
          결과분석기
        </button>
        <button
          onClick={() => setActiveTab('report')}
          aria-pressed={activeTab === 'report'}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'report'
              ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileText className="w-5 h-5" />
          종합 소견서
        </button>
        <button
          onClick={() => setActiveTab('history')}
          aria-pressed={activeTab === 'history'}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-gradient-to-r from-slate-500 to-slate-700 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <History className="w-5 h-5" />
          저장 문서/이력
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* === Analyzer Tab === */}
        {activeTab === 'analyzer' && (
          <motion.div
            key="analyzer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid lg:grid-cols-2 gap-8"
          >
            {/* Left Box: Input */}
            <div className="glass-strong rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500 -mr-20 -mt-20 pointer-events-none" />
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-400" />
                검사 결과 업로드
              </h2>
              <p className="text-sm text-white/40 mb-6">PDF/이미지 파일과 직접 입력 텍스트를 함께 참고해서 분석할 수 있습니다.</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-white/70 mb-2">1. PDF/이미지 업로드</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 rounded-2xl p-8 hover:border-blue-400 hover:bg-blue-500/5 transition-all cursor-pointer text-center group/dropzone"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 group-hover/dropzone:scale-110 transition-transform">
                      <ImageIcon className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-white font-medium mb-1">
                      클릭하여 파일 선택 (또는 드래그)
                    </p>
                    <p className="text-sm text-slate-400">
                      지원 형식: JPG, PNG, GIF, WEBP, PDF
                    </p>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-slate-300">
                        선택된 파일 ({selectedFiles.length}개)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFiles.map((file, i) => (
                          <div
                            key={i}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-slate-200"
                          >
                            <span className="max-w-[150px] truncate">{file.name}</span>
                            <button
                              onClick={() => removeFile(i)}
                              className="text-white/40 hover:text-red-400 transition-colors p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-white/70 mb-2">2. 검사 결과 또는 관찰 메모 직접 입력</label>
                  <textarea
                    value={analyzerInput}
                    onChange={(e) => setAnalyzerInput(e.target.value)}
                    placeholder="파일 없이 텍스트만 입력해도 분석할 수 있습니다. 검사명, 점수, 관찰 내용, 행동 특성 등을 자유롭게 적어주세요."
                    className="textarea-field !bg-black/20 border-white/10 !min-h-[160px] text-sm leading-relaxed"
                  />
                  <p className="mt-2 text-xs text-slate-400 flex justify-between">
                    <span>직접 입력 텍스트는 자동 비식별화 후 AI에 전달됩니다.</span>
                    <span>{analyzerInput.length}자</span>
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (selectedFiles.length === 0 && !analyzerInput.trim())}
                    className="flex-1 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <FileSearch className="w-5 h-5" />
                        결과 분석하기
                      </>
                    )}
                  </button>
                  <button
                    onClick={clearAnalyzer}
                    type="button"
                    className="h-14 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-bold border border-white/10 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    초기화
                  </button>
                </div>
              </div>
            </div>

            {/* Right Box: Result */}
            <div className="glass-strong rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="p-6 md:p-8 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  분석 결과
                </h3>
                {analyzerResult && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEvaluationDoc('analysis')}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span className="hidden lg:inline">저장</span>
                    </button>
                    <button
                      onClick={refineAnalysisResult}
                      disabled={isRefiningAnalysis}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isRefiningAnalysis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      현재 내용 기반 보완
                    </button>
                    <button
                      onClick={clearAnalyzer}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-rose-200 text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden lg:inline">초기화</span>
                    </button>
                    <button
                      onClick={() => copyToClipboard(analyzerResult)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? '복사됨' : '복사하기'}
                    </button>
                  </div>
                )}
              </div>
              <div className="p-6 md:p-8 flex-1 overflow-auto">
                {!analyzerResult && !isAnalyzing && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <FileSearch className="w-16 h-16 mb-4 opacity-20" />
                    <p>분석 결과를 기다리고 있습니다.</p>
                  </div>
                )}
                {isAnalyzing && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                    <p className="text-white/70 font-medium">
                      사진 및 문서를 분석 중입니다...
                    </p>
                  </div>
                )}
                {analyzerResult && !isAnalyzing && (
                  <textarea
                    value={analyzerResult}
                    onChange={e => setAnalyzerResult(e.target.value)}
                    className="textarea-field !bg-black/25 border-white/10 !min-h-[560px] text-[15px] leading-relaxed resize-y"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* === Report Tab === */}
        {activeTab === 'report' && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid lg:grid-cols-2 gap-8"
          >
            {/* Left Box: Input */}
            <div className="glass-strong rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl group-hover:bg-teal-500/20 transition-all duration-500 -mr-20 -mt-20 pointer-events-none" />
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-400" />
                참고 내용 입력
              </h2>

              <div className="space-y-6">
                <div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    ref={reportFileInputRef}
                    onChange={handleReportFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => reportFileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 rounded-2xl p-4 hover:border-teal-400 hover:bg-teal-500/5 transition-all cursor-pointer text-center group/dropzone2 mb-4"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <ImageIcon className="w-6 h-6 text-teal-400 group-hover/dropzone2:scale-110 transition-transform" />
                      <p className="text-white font-medium text-sm">
                        평가결과지 또는 관련 문서 업로드 (선택사항, 이미지/PDF)
                      </p>
                    </div>
                  </div>

                  {reportFiles.length > 0 && (
                    <div className="mb-4 space-y-2">
                      <p className="text-sm font-medium text-slate-300">
                        선택된 파일 ({reportFiles.length}개)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {reportFiles.map((file, i) => (
                          <div
                            key={i}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-slate-200"
                          >
                            <span className="max-w-[150px] truncate">{file.name}</span>
                            <button
                              onClick={() => removeReportFile(i)}
                              className="text-white/40 hover:text-red-400 transition-colors p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="block text-sm font-medium text-slate-300 mb-2 mt-4">
                    관찰 기록 및 면담 내용 (직접 입력 또는 분석기 내용 복사)
                  </label>
                  <div className="mb-3 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-3 text-sm text-teal-100">
                    PDF 없이도 직접 입력 내용이나 결과분석기 내용을 바탕으로 작성할 수 있습니다.
                  </div>
                  <button
                    type="button"
                    onClick={loadLatestAnalysisToReport}
                    disabled={!analyzerResult.trim() && !selectedHistoryAnalysis.trim() && !latestSavedAnalysis.trim()}
                    className="mb-3 btn-ghost !bg-white/5 border border-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    최근 결과분석 내용 불러오기
                  </button>
                  <textarea
                    value={reportInput}
                    onChange={(e) => setReportInput(e.target.value)}
                    placeholder="직접 관찰한 내용, 면담 기록, 추가 전달사항 등을 적어주세요. PDF 없이도 결과분석기 내용이나 직접 입력 내용만으로 작성할 수 있습니다."
                    className="w-full h-48 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 resize-none transition-all"
                  />
                  <p className="mt-2 text-xs text-slate-400 flex justify-between">
                    <span>최대한 구체적으로 적을수록 더 좋은 소견서가 나옵니다.</span>
                    <span>{reportInput.length}자</span>
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGenerating || !canGenerateReport}
                    className="w-full h-14 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        작성 중...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        보고서 작성하기
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Box: Result */}
            <div className="glass-strong rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="p-6 md:p-8 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-emerald-400" />
                  종합 소견서 결과
                </h3>
                {reportResult && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEvaluationDoc('report')}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors"
                      title="저장 문서/이력에 저장"
                    >
                      <Save className="w-4 h-4" />
                      <span className="hidden lg:inline">저장</span>
                    </button>
                    <button
                      onClick={refineReportResult}
                      disabled={isRefiningReport}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-sm font-medium transition-colors disabled:opacity-50"
                      title="현재 내용 기반 보완"
                    >
                      {isRefiningReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                      <span className="hidden lg:inline">보완</span>
                    </button>
                    <button
                      onClick={clearReport}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-rose-200 text-sm font-medium transition-colors"
                      title="초기화"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden lg:inline">초기화</span>
                    </button>
                    <button
                      onClick={() => copyToClipboard(reportResult)}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                      title="텍스트 복사"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span className="hidden lg:inline">{copied ? '복사됨' : '복사'}</span>
                    </button>
                    <button
                      onClick={handleDownloadDocx}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-medium transition-all shadow-lg"
                      title="Word 파일 다운로드"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden lg:inline">다운로드</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="p-6 md:p-8 flex-1 overflow-auto">
                {downloadError && (
                  <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {downloadError}
                  </div>
                )}
                {!reportResult && !isGenerating && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>보고서 결과가 여기에 표시됩니다.</p>
                  </div>
                )}
                {isGenerating && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-teal-500 animate-spin mb-4" />
                    <p className="text-white/70 font-medium">
                      전문적인 종합 소견서를 작성 중입니다...
                    </p>
                  </div>
                )}
                {reportResult && !isGenerating && (
                  <textarea
                    value={reportResult}
                    onChange={e => setReportResult(e.target.value)}
                    className="textarea-field !bg-black/25 border-white/10 !min-h-[560px] text-[15px] leading-relaxed resize-y"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-strong rounded-3xl border border-white/10 shadow-2xl p-6 md:p-8"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-2xl font-black text-white">저장 문서/이력</h2>
                <p className="text-sm text-white/40 mt-1">결과분석과 종합소견서를 임시 이력으로 보관합니다. 기존 DB 구조는 변경하지 않았습니다.</p>
              </div>
              <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/60">총 {savedDocs.length}건</span>
            </div>
            {savedDocs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/40">
                아직 저장된 직업평가 문서가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {savedDocs.map(doc => {
                  const isSelected = selectedHistoryId === doc.id;
                  return (
                  <div key={doc.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs font-black text-blue-300 uppercase">{doc.type === 'analysis' ? '결과분석기' : '종합소견서'}</p>
                        <h3 className="text-lg font-black text-white">{doc.title}</h3>
                        <p className="text-xs text-white/35 mt-1">
                          저장: {new Date(doc.savedAt).toLocaleString()}
                          {doc.updatedAt ? ` / 수정: ${new Date(doc.updatedAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => selectHistoryDoc(doc)}
                          className="btn-ghost !bg-white/5 border border-white/10 text-sm flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4" /> 보기/수정
                        </button>
                        <button
                          onClick={() => copyToClipboard(isSelected ? historyDraft : doc.content)}
                          className="btn-ghost !bg-white/5 border border-white/10 text-sm flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" /> 복사
                        </button>
                        <button
                          onClick={saveHistoryDoc}
                          disabled={!isSelected}
                          className="btn-ghost !bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Save className="w-4 h-4" /> 저장
                        </button>
                        <button
                          onClick={() => {
                            if (doc.type === 'analysis') {
                              setAnalyzerResult(isSelected ? historyDraft : doc.content);
                              setActiveTab('analyzer');
                            } else {
                              setReportResult(isSelected ? historyDraft : doc.content);
                              setActiveTab('report');
                            }
                          }}
                          className="btn-primary text-sm flex items-center gap-2"
                        >
                          불러오기
                        </button>
                        <button
                          onClick={() => deleteHistoryDoc(doc.id)}
                          className="btn-ghost !bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> 삭제
                        </button>
                      </div>
                    </div>
                    <textarea
                      readOnly={!isSelected}
                      value={isSelected ? historyDraft : doc.content}
                      onFocus={() => selectHistoryDoc(doc)}
                      onChange={e => {
                        if (!isSelected) setSelectedHistoryId(doc.id);
                        setHistoryDraft(e.target.value);
                      }}
                      className={`textarea-field !bg-black/20 border-white/10 !min-h-[280px] !max-h-[560px] text-sm leading-relaxed resize-y overflow-y-auto ${isSelected ? 'ring-1 ring-blue-400/40' : ''}`}
                    />
                    <p className="mt-2 text-xs text-white/35 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5" />
                      {isSelected ? '이 문서를 수정 중입니다. 변경 후 저장 버튼을 눌러 주세요.' : '수정하려면 본문을 클릭하거나 보기/수정을 누르세요.'}
                    </p>
                  </div>
                );})}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
