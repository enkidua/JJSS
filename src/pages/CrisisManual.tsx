import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldCheck, HeartPulse, Briefcase, Users, FileText, ChevronRight, CheckCircle2, XCircle, ArrowLeft, BookOpen, Search, Loader2, Sparkles, Layers } from 'lucide-react';
import { crisisScenarios, CrisisScenario } from '../data/crisisScenarios';
import { generateText } from '../services/gemini';
import { CopyButton } from '../components/common/CopyButton';
import { AiTransmissionNotice } from '../components/tools/AiTransmissionNotice';
import { useReportDirty } from '../components/tools/useReportDirty';

type ViewMode = 'dashboard' | 'simulator' | 'manual';

interface CustomGuideState {
  situation: string;
  guide: string;
  error: string;
  loading: boolean;
}

const INITIAL_CUSTOM_GUIDE: CustomGuideState = { situation: '', guide: '', error: '', loading: false };
const TOTAL_CATEGORIES = new Set(crisisScenarios.map(scenario => scenario.category)).size;

interface CrisisManualProps {
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function CrisisManual({ onBack, onDirtyChange }: CrisisManualProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedScenario, setSelectedScenario] = useState<CrisisScenario | null>(null);
  // 직접 입력 안내는 시나리오 화면을 오가도 사라지지 않도록 이 컴포넌트에서 보관합니다.
  const [customGuide, setCustomGuide] = useState<CustomGuideState>(INITIAL_CUSTOM_GUIDE);

  useReportDirty(customGuide.loading || Boolean(customGuide.situation.trim() || customGuide.guide), onDirtyChange);

  // 브라우저 뒤로가기 기록을 쌓지 않고 화면 안에서만 전환합니다.
  const handleSelectScenario = (scenario: CrisisScenario, mode: 'simulator' | 'manual') => {
    setSelectedScenario(scenario);
    setViewMode(mode);
  };

  const goBack = () => {
    setViewMode('dashboard');
    setSelectedScenario(null);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-3xl font-black gradient-text tracking-tight flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
            직업재활 위기대응 시뮬레이터
          </h1>
          <p className="text-white/60 mt-2 font-medium">현장에서 발생할 수 있는 위기 상황을 미리 체험하고 대처 능력을 기릅니다.</p>
        </div>

        {viewMode !== 'dashboard' ? (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium border border-white/10 shadow-lg backdrop-blur-md"
          >
            <ArrowLeft className="w-4 h-4" />
            시뮬레이터 홈으로
          </button>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium border border-white/10 shadow-lg backdrop-blur-md"
          >
            <ArrowLeft className="w-4 h-4" />
            도구 목록으로
          </button>
        ) : null}
      </motion.div>

      <AnimatePresence mode="wait">
        {viewMode === 'dashboard' && (
          <DashboardView key="dashboard" onSelect={handleSelectScenario} customGuide={customGuide} setCustomGuide={setCustomGuide} />
        )}
        {viewMode === 'simulator' && selectedScenario && (
          <SimulatorView key="simulator" scenario={selectedScenario} />
        )}
        {viewMode === 'manual' && selectedScenario && (
          <ManualDetailView key="manual" scenario={selectedScenario} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------
// Dashboard (Bento Grid)
// ------------------------------
interface DashboardViewProps {
  onSelect: (scenario: CrisisScenario, mode: 'simulator' | 'manual') => void;
  customGuide: CustomGuideState;
  setCustomGuide: React.Dispatch<React.SetStateAction<CustomGuideState>>;
}

function DashboardView({ onSelect, customGuide, setCustomGuide }: DashboardViewProps) {
  const { situation: customSituation, guide: customGuideText, error: customError, loading: customLoading } = customGuide;

  const fallbackGuide = (situation: string) => `1. 상황 요약
${situation || '현장 위기 상황이 접수되었습니다.'}

2. 즉시 확인할 위험 요소
- 본인 또는 타인의 신체 안전 위험이 있는지 확인합니다.
- 자해, 타해, 실종, 응급질환, 폭력, 학대 의심, 재산 피해 가능성을 확인합니다.
- 현장에 혼자 대응하지 말고 기관 내 담당자와 공유합니다.

3. 초기 대응
- 자극적인 표현이나 단정적 판단을 피하고, 안전한 거리와 차분한 어조를 유지합니다.
- 가능한 경우 당사자를 안전한 공간으로 안내하고 주변 위험 물품을 치웁니다.
- 사실 확인 전 책임 소재를 단정하지 않습니다.

4. 보호자/기관/응급 연락 판단
- 급박한 위험 또는 의료적 응급 가능성이 있으면 119 및 기관 지침에 따릅니다.
- 보호자 연락은 개인정보와 당사자 권리를 고려하되, 안전 확보가 필요한 경우 기관 절차에 따라 진행합니다.
- 법적 판단은 단정하지 말고 기관 책임자와 관련 지침에 따라 확인합니다.

5. 기록해야 할 내용
- 일시, 장소, 관련자, 관찰된 사실, 담당자 조치, 연락 내역, 당사자 반응을 기록합니다.
- 추측과 평가보다 관찰된 말과 행동 중심으로 남깁니다.

6. 사후 지원계획
- 당사자 안정 확인, 재발 방지 환경 조정, 보호자/유관기관 협의, 직원 공유 범위를 정리합니다.
- 필요 시 사례회의 또는 개별지원계획 수정으로 연결합니다.`;

  const handleCustomGuide = async () => {
    if (customLoading) return;
    if (!customSituation.trim()) {
      setCustomGuide(prev => ({ ...prev, error: '위기 상황 내용을 먼저 입력해 주세요.' }));
      return;
    }
    // 새 안내가 나올 때까지 기존 안내는 그대로 둡니다.
    setCustomGuide(prev => ({ ...prev, loading: true, error: '' }));
    const fallback = fallbackGuide(customSituation);
    try {
      const prompt = `다음 직업재활 현장 위기 상황에 대해 대응 안내를 작성해 주세요.

[상황]
${customSituation}

[작성 조건]
- 상황 요약
- 즉시 확인할 위험 요소
- 초기 대응
- 보호자/기관/응급 연락 판단
- 기록해야 할 내용
- 사후 지원계획
- 의료적/법적 판단을 단정하지 말 것
- 긴급 상황은 119, 보호자, 기관 지침에 따르도록 안내할 것`;
      const result = await generateText('utilities', prompt);
      setCustomGuide(prev => ({ ...prev, guide: result || fallback, loading: false }));
    } catch (error: unknown) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      setCustomGuide(prev => ({ ...prev, guide: fallback, error: `AI 안내 생성에 실패하여 기본 템플릿을 표시합니다.${detail}`, loading: false }));
    }
  };

  const containerVars = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVars = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  const getCategoryIcon = (cat: string) => {
    if (cat.includes('인권')) return <ShieldCheck className="w-6 h-6 text-emerald-400" />;
    if (cat.includes('안전')) return <HeartPulse className="w-6 h-6 text-rose-400" />;
    if (cat.includes('고용')) return <Briefcase className="w-6 h-6 text-blue-400" />;
    if (cat.includes('행정')) return <FileText className="w-6 h-6 text-amber-400" />;
    return <Users className="w-6 h-6 text-purple-400" />;
  };

  return (
    <motion.div
      variants={containerVars} initial="hidden" animate="show"
      className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6"
    >
      {/* Bento Main Hero */}
      <motion.div variants={itemVars} className="md:col-span-2 lg:col-span-2 row-span-2 relative overflow-hidden rounded-3xl p-8 glass-strong border border-white/10 group hover:border-primary-500/50 transition-all duration-500 flex flex-col justify-between">
        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 group-hover:scale-110 transition-all duration-700">
          <AlertTriangle className="w-48 h-48 text-rose-500 blur-sm" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold text-xs mb-4 border border-rose-500/20">
            필수 이수 권장
          </div>
          <h2 className="text-4xl font-black text-white mb-4 leading-tight">위기 상황,<br/>당신은 어떻게<br/>대처하시겠습니까?</h2>
          <p className="text-white/70 max-w-sm">실제 현장에서 수집된 {crisisScenarios.length}개의 리얼 시나리오. 지금 바로 시뮬레이션을 통해 대응 역량을 확인하세요.</p>
        </div>
        <div className="relative z-10 mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => onSelect(crisisScenarios[0], 'simulator')}
            className="flex-1 px-6 py-4 bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl text-white font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(244,63,94,0.4)] transition-all hover:-translate-y-1"
          >
            <AlertTriangle className="w-5 h-5" />
            시뮬레이션 시작하기
          </button>
        </div>
      </motion.div>

      <motion.div variants={itemVars} className="md:col-span-3 lg:col-span-4 rounded-3xl p-6 glass-strong border border-rose-500/20">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-300" />
              직접 입력 위기대응 안내
            </h3>
            <p className="text-white/45 text-sm mt-1">현장 상황을 적으면 대응 흐름을 정리합니다. 긴급 상황은 즉시 119, 보호자, 기관 지침을 우선하세요.</p>
          </div>
        </div>
        <textarea
          aria-label="위기 상황 내용"
          value={customSituation}
          onChange={e => setCustomGuide(prev => ({ ...prev, situation: e.target.value }))}
          className="textarea-field !bg-black/30 border-white/10 !min-h-[110px] text-sm"
          placeholder="예: 훈련 중 이용자가 갑자기 크게 소리를 지르고 물건을 던지려 하며 다른 이용자들이 불안해함."
        />
        <AiTransmissionNotice className="mt-3" message="입력한 상황은 안내 작성을 위해 외부 AI 서비스로 전송됩니다. 이용자 이름 등 개인정보는 빼고 상황만 적어 주세요." />
        <div className="flex justify-end mt-3">
          <button type="button" onClick={() => void handleCustomGuide()} disabled={customLoading} className="btn-primary flex items-center gap-2">
            {customLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {customGuideText ? '대응 흐름 다시 생성하기' : '대응 흐름 생성하기'}
          </button>
        </div>
        {customError && <div role="alert" className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm">{customError}</div>}
        {customGuideText && (
          <div className="mt-4 p-5 rounded-2xl bg-black/25 border border-white/10">
            <div className="flex justify-end mb-2">
              <CopyButton text={customGuideText} />
            </div>
            <pre className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed font-sans">{customGuideText}</pre>
          </div>
        )}
      </motion.div>

      {/* Stats Bento */}
      <motion.div variants={itemVars} className="rounded-3xl p-6 glass border border-white/10 flex flex-col justify-center items-center text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <BookOpen className="w-8 h-8 text-blue-400 mb-3" />
        <h3 className="text-white/60 text-sm font-semibold mb-1">총 시나리오</h3>
        <p className="text-4xl font-black text-white">{crisisScenarios.length}<span className="text-lg text-white/50 ml-1">개</span></p>
      </motion.div>

      {/* Category Bento */}
      <motion.div variants={itemVars} className="rounded-3xl p-6 glass border border-white/10 flex flex-col justify-center items-center text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <Layers className="w-8 h-8 text-emerald-400 mb-3" />
        <h3 className="text-white/60 text-sm font-semibold mb-1">상황 분야</h3>
        <p className="text-4xl font-black text-white">{TOTAL_CATEGORIES}<span className="text-lg text-white/50 ml-1">개</span></p>
      </motion.div>

      {/* Scenario List */}
      <motion.div variants={itemVars} className="md:col-span-3 lg:col-span-4 mt-4">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Search className="w-5 h-5 text-primary-400" />
          상황별 시나리오 라이브러리
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crisisScenarios.map((scenario) => (
            <motion.div
              key={scenario.id}
              whileHover={{ scale: 1.02, y: -2 }}
              className="p-5 glass border border-white/5 rounded-2xl hover:bg-white/5 transition-all group flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white/5 rounded-xl text-white/80">
                  {getCategoryIcon(scenario.category)}
                </div>
                <div className="text-xs font-bold px-2 py-1 bg-white/5 rounded-md text-white/50 border border-white/5">
                  {scenario.part}
                </div>
              </div>
              <h4 className="text-white font-bold text-lg mb-2 break-words whitespace-normal leading-snug">{scenario.title}</h4>
              <p className="text-white/50 text-sm mb-6 flex-1 break-words whitespace-normal line-clamp-4">{scenario.background}</p>
              <div className="flex gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => onSelect(scenario, 'simulator')}
                  className="flex-1 py-2 bg-primary-500/20 hover:bg-primary-500/40 border border-primary-500/30 text-primary-300 rounded-xl text-sm font-bold transition-colors flex justify-center items-center gap-1"
                >
                  <AlertTriangle className="w-4 h-4" /> 시뮬레이션
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(scenario, 'manual')}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 hover:text-white rounded-xl text-sm font-bold transition-colors flex justify-center items-center gap-1"
                >
                  <BookOpen className="w-4 h-4" /> 매뉴얼 보기
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------
// Simulator View
// ------------------------------
function SimulatorView({ scenario }: { scenario: CrisisScenario }) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleSelect = (id: number) => {
    if (isRevealed) return;
    setSelectedOption(id);
    // Add a slight delay for dramatic effect
    setTimeout(() => {
      setIsRevealed(true);
    }, 600);
  };

  const optionListVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.3 } }
  };

  const optionItemVariants = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 }
  };

  const selectedOptData = scenario.options.find(o => o.id === selectedOption);
  const isSuccess = selectedOptData?.isCorrect;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong border border-white/10 rounded-3xl p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-1 h-full bg-primary-500" />
        <div className="flex items-center gap-3 mb-6">
          <span className="px-3 py-1 bg-white/10 text-white/70 rounded-full text-xs font-bold">{scenario.part}</span>
          <span className="px-3 py-1 bg-primary-500/20 text-primary-300 rounded-full text-xs font-bold border border-primary-500/20">{scenario.category}</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-white mb-6 leading-relaxed">
          {scenario.title}
        </h2>
        <div className="p-6 bg-black/30 rounded-2xl border border-white/5 shadow-inner">
          <p className="text-lg text-white/90 leading-loose">
            {scenario.background}
          </p>
        </div>
      </motion.div>

      <motion.div 
        variants={optionListVariants} initial="hidden" animate="show"
        className="space-y-3 relative"
      >
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <ChevronRight className="text-primary-400" /> 당신의 선택은?
        </h3>
        
        {scenario.options.map((opt, idx) => {
          const isSelected = selectedOption === opt.id;
          const isCorrectAndRevealed = isRevealed && opt.isCorrect;
          const isWrongAndRevealed = isRevealed && isSelected && !opt.isCorrect;
          
          let btnClass = "w-full text-left p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group ";
          
          if (!isRevealed) {
            btnClass += isSelected 
              ? "bg-primary-500/20 border-primary-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]" 
              : "glass border-white/10 hover:bg-white/10 hover:border-white/20";
          } else {
            if (isCorrectAndRevealed) {
              btnClass += "bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]";
            } else if (isWrongAndRevealed) {
              btnClass += "bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]";
            } else {
              btnClass += "glass border-white/5 opacity-40 grayscale";
            }
          }

          return (
            <motion.button
              key={opt.id}
              variants={optionItemVariants}
              onClick={() => handleSelect(opt.id)}
              disabled={isRevealed}
              className={btnClass}
              whileHover={!isRevealed ? { scale: 1.01 } : {}}
              whileTap={!isRevealed ? { scale: 0.98 } : {}}
            >
              {isSelected && !isRevealed && (
                <motion.div 
                  layoutId="outline"
                  className="absolute inset-0 border-2 border-primary-400 rounded-2xl"
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              )}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 transition-colors ${
                  isRevealed && isCorrectAndRevealed ? 'bg-emerald-500 text-white' :
                  isRevealed && isWrongAndRevealed ? 'bg-rose-500 text-white' :
                  isSelected ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/50'
                }`}>
                  {idx + 1}
                </div>
                <div className="pt-1 flex-1">
                  <p className={`text-[15px] sm:text-base md:text-lg font-medium transition-colors break-words whitespace-normal leading-relaxed ${
                    isRevealed && isCorrectAndRevealed ? 'text-emerald-100' :
                    isRevealed && isWrongAndRevealed ? 'text-rose-100' :
                    isSelected ? 'text-white' : 'text-white/80'
                  }`}>
                    {opt.text}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}

        {/* Loading overlay for dramatic reveal */}
        {selectedOption && !isRevealed && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-3xl z-20"
          >
            <div className="w-12 h-12 border-4 border-white/20 border-t-primary-500 rounded-full animate-spin mb-4" />
            <p className="text-white font-bold tracking-widest animate-pulse">결과 분석 중...</p>
          </motion.div>
        )}
      </motion.div>

      {/* Result Section */}
      <AnimatePresence>
        {isRevealed && selectedOptData && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
            className={`mt-8 p-8 rounded-3xl border relative overflow-hidden ${
              isSuccess 
                ? 'bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border-emerald-500/30' 
                : 'bg-gradient-to-br from-rose-900/40 to-red-900/40 border-rose-500/30'
            }`}
          >
            <div className="flex items-start gap-4 md:gap-6">
              <div className={`p-4 rounded-2xl shrink-0 shadow-lg ${
                isSuccess ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-rose-500 shadow-rose-500/30'
              }`}>
                {isSuccess ? <CheckCircle2 className="w-8 h-8 text-white" /> : <XCircle className="w-8 h-8 text-white" />}
              </div>
              <div className="flex-1">
                <h3 className={`text-2xl font-black mb-2 ${isSuccess ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isSuccess ? '적절한 대응입니다!' : '주의가 필요한 대응입니다.'}
                </h3>
                <p className="text-white/80 text-lg leading-relaxed mb-6">
                  {selectedOptData.feedback}
                </p>
                
                {/* Expert Solution Panel */}
                <div className="bg-black/40 rounded-2xl p-6 border border-white/10 shadow-inner">
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase className="w-5 h-5 text-blue-400" />
                    <h4 className="text-blue-400 font-bold text-lg">전문가 솔루션</h4>
                  </div>
                  <h5 className="text-white font-bold text-xl mb-3 break-words whitespace-normal">{scenario.solution.summary}</h5>
                  <p className="text-white/70 leading-relaxed mb-6 break-words whitespace-normal">
                    {scenario.solution.detail}
                  </p>
                  
                  <h6 className="text-white/90 font-bold mb-3 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                    표준 대응 절차 (Action Plan)
                  </h6>
                  <div className="space-y-2">
                    {scenario.solution.action.split('\n').map((line, i) => (
                      <div key={i} className="flex gap-3 text-white/80 bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="font-bold text-emerald-400 shrink-0">{line.split('.')[0]}.</span>
                        <span>{line.substring(line.indexOf('.') + 1).trim()}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={() => {
                      setSelectedOption(null);
                      setIsRevealed(false);
                    }}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all border border-white/10"
                  >
                    다시 시뮬레이션 하기
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------
// Manual Detail View (Static Reading)
// ------------------------------
function ManualDetailView({ scenario }: { scenario: CrisisScenario }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="glass-strong border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-8 md:p-10 border-b border-white/10 bg-gradient-to-br from-blue-900/20 to-transparent relative">
          <BookOpen className="absolute -bottom-10 -right-10 w-48 h-48 text-blue-500/10 rotate-12 blur-sm" />
          <div className="relative z-10">
             <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-white/10 text-white/70 rounded-full text-xs font-bold">{scenario.part}</span>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-bold border border-blue-500/20">{scenario.category}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight">
              {scenario.title}
            </h2>
          </div>
        </div>

        <div className="p-8 md:p-10 space-y-8">
          {/* Background */}
          <section>
            <h3 className="text-lg font-bold text-blue-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> 상황 개요
            </h3>
            <p className="text-white/80 leading-relaxed text-lg bg-white/5 p-6 rounded-2xl border border-white/5">
              {scenario.background}
            </p>
          </section>

          {/* Expert Solution */}
          <section>
            <h3 className="text-lg font-bold text-emerald-400 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> 대응 요약
            </h3>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl">
              <h4 className="text-2xl font-black text-white mb-4">{scenario.solution.summary}</h4>
              <p className="text-emerald-100/70 leading-relaxed text-lg">
                {scenario.solution.detail}
              </p>
            </div>
          </section>

          {/* Action Plan */}
          <section>
            <h3 className="text-lg font-bold text-primary-400 mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5" /> 세부 행동 지침 (Action Plan)
            </h3>
            <div className="space-y-3">
              {scenario.solution.action.split('\n').map((line, i) => {
                const stepNum = line.split('.')[0];
                const text = line.substring(line.indexOf('.') + 1).trim();
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center shrink-0 border border-primary-500/30">
                      <span className="font-black text-primary-300">{stepNum}</span>
                    </div>
                    <p className="text-white/90 text-lg pt-1 leading-relaxed">
                      {text}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
