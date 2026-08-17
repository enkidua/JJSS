import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, Users2, Briefcase, MapPin, DollarSign, Clock, 
    ChevronRight, Sparkles, ArrowLeft, Loader2, X, CheckCircle2,
    BarChart3, UserCheck, Trash2, Plus
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { matchCandidates } from '../services/matching';
import { Seeker, JobOpening, MatchResult } from '../types/matching';
import { generateText } from '../services/gemini';
import { buildCurrentContentRegenerationPrompt } from '../services/documentRegenerationService';
import { safeErrorMetadata } from '../utils/safeError';

interface MatchingViewProps {
    onBack: () => void;
}

export function MatchingView({ onBack }: MatchingViewProps) {
    const { seekers, jobs, fetchData, loading } = useDataStore();
    const [matchSelJob, setMatchSelJob] = useState<JobOpening | null>(null);
    const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
    const [isMatching, setIsMatching] = useState(false);
    const matchingTimerRef = useRef<number | null>(null);
    const [jobSearch, setJobSearch] = useState('');

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => () => {
        if (matchingTimerRef.current !== null) window.clearTimeout(matchingTimerRef.current);
    }, []);

    const filteredJobs = (jobs || []).filter(j => {
        if (!j) return false;
        const search = jobSearch.toLowerCase();
        const companyMatched = j.companyName?.toLowerCase().includes(search);
        const roleMatched = j.jobRole?.toLowerCase().includes(search);
        return companyMatched || roleMatched;
    });

    const handleRunMatch = (job: JobOpening) => {
        if (!job || !seekers) return;
        setMatchSelJob(job);
        setIsMatching(true);
        // 인위적인 딜レイ로 'AI 분석 중' 느낌 부여
        matchingTimerRef.current = window.setTimeout(() => {
            try {
                const results = matchCandidates(job, seekers);
                setMatchResults(results || []);
            } catch (error) {
                console.error('Matching Error:', safeErrorMetadata(error, 'matching-analysis'));
                alert('매칭 분석 중 오류가 발생했습니다.');
                setMatchResults([]);
            } finally {
                setIsMatching(false);
                matchingTimerRef.current = null;
            }
        }, 800);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-6xl mx-auto pb-20"
        >
            <button
                onClick={onBack}
                className="btn-ghost flex items-center gap-2 mb-6 text-sm text-white/50 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* 구인처 선택 (Job Openings) */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Briefcase className="w-32 h-32" />
                        </div>
                        
                        <div className="flex justify-between items-center mb-6 relative">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-emerald-400" />
                                구인처(공고) 선택
                            </h3>
                            <span className="text-xs font-black px-2 py-1 rounded-md bg-white/5 text-white/50 border border-white/10">{jobs.length}건</span>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input 
                                className="input-field !pl-10 !py-2.5 text-sm !bg-white/5 border-white/10 focus:border-emerald-500/50" 
                                placeholder="국내 사업체 명칭 검색..."
                                value={jobSearch}
                                onChange={e => setJobSearch(e.target.value)}
                            />
                        </div>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                            {loading ? (
                                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="text-center py-12 text-white/20 text-sm">등록된 구인 정보가 없습니다.</div>
                            ) : (
                                filteredJobs.map(job => (
                                    <motion.div 
                                        key={job.id} 
                                        whileHover={{ x: 4 }}
                                        onClick={() => handleRunMatch(job)}
                                        className={`p-5 rounded-2xl border cursor-pointer transition-all ${matchSelJob?.id === job.id 
                                            ? 'bg-emerald-500/20 border-emerald-500 shadow-xl shadow-emerald-500/10' 
                                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="text-white font-bold leading-tight">{job.companyName}</h4>
                                                <p className="text-xs text-white/40 mt-1">{job.jobRole}</p>
                                            </div>
                                            {matchSelJob?.id === job.id && <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/60">{job.location}</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 font-bold">{job.salary}</span>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 매칭 결과 (Match Results) */}
                <div className="lg:col-span-8">
                    {!matchSelJob ? (
                        <div className="glass-strong rounded-[2.5rem] h-[600px] flex flex-col items-center justify-center border border-white/5 text-center p-12">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 relative">
                                <Users2 className="w-10 h-10 text-white/10" />
                                <div className="absolute inset-0 rounded-full border border-white/5 animate-ping opacity-40" />
                            </div>
                            <h4 className="text-2xl font-bold text-white mb-4">매칭을 시작할 구인처를 선택하세요</h4>
                            <p className="text-white/30 max-w-md mx-auto leading-relaxed">
                                왼쪽 리스트에서 사업체를 선택하면 알고리즘이 자동으로 구직자 DB를 분석하여 가장 적합한 10명의 후보자를 정밀 매칭합니다.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* 선택된 공고 요약 */}
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }} 
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-strong rounded-3xl p-8 border border-emerald-500/30 bg-emerald-500/5 relative overflow-hidden"
                            >
                                <div className="flex items-center gap-6 relative z-10">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-2xl shadow-inner">
                                        {matchSelJob.companyName.charAt(0)}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white mb-1">{matchSelJob.companyName}</h2>
                                        <div className="flex gap-4 items-center">
                                            <span className="text-sm font-bold text-white/70 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{matchSelJob.location}</span>
                                            <span className="text-sm font-bold text-white/70 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />{matchSelJob.salary}</span>
                                            <span className="text-sm font-bold text-emerald-400"># {matchSelJob.jobRole}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            <div className="flex items-center justify-between px-2">
                                <h4 className="text-lg font-black text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-yellow-400" />
                                    AI 정밀 매칭 결과
                                    {isMatching && <Loader2 className="w-4 h-4 animate-spin ml-2 text-white/40" />}
                                </h4>
                                <span className="text-xs text-white/30">Total Candidates: {seekers.length}</span>
                            </div>

                            {isMatching ? (
                                <div className="h-96 flex flex-col items-center justify-center gap-4">
                                    <div className="w-16 h-1 w-40 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-emerald-500" 
                                            initial={{ x: "-100%" }} 
                                            animate={{ x: "100%" }} 
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-white/40 animate-pulse">알고리즘 가중치 계산 중...</span>
                                </div>
                            ) : matchResults.length === 0 ? (
                                <div className="p-20 text-center glass-strong rounded-3xl border border-white/5">
                                    <p className="text-white/20">조건에 부합하는 구직자가 없습니다.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 pb-12">
                                    <AnimatePresence mode="popLayout">
                                        {matchResults.map((res, idx) => (
                                            <MatchItem key={res.seeker.id || idx} result={res} rank={idx + 1} />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function MatchItem({ result, rank }: { result: MatchResult; rank: number }) {
    const { fetchCaseDocuments, saveMatchingOpinion } = useDataStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [profileText, setProfileText] = useState(() => buildMatchingProfile(result, rank));
    const [isRefining, setIsRefining] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savedAt, setSavedAt] = useState('');
    const [savedSource, setSavedSource] = useState<'db' | 'local' | ''>('');
    const scoreColor = result.totalScore >= 1.5 ? 'text-emerald-400' : result.totalScore >= 1.0 ? 'text-yellow-400' : 'text-orange-400';
    const scoreBg = result.totalScore >= 1.5 ? 'bg-emerald-500/10' : result.totalScore >= 1.0 ? 'bg-yellow-500/10' : 'bg-orange-500/10';
    const seekerKey = result.seeker.id || result.seeker.seekerId || result.seeker.name;
    const jobKey = result.job.id || [result.job.companyName, result.job.jobRole, result.job.location].filter(Boolean).join('|');
    const storageKey = `jjss-matching-profile:${seekerKey}:${jobKey}`;

    useEffect(() => {
        let cancelled = false;
        const loadSavedProfile = async () => {
            const fallback = buildMatchingProfile(result, rank);
            try {
                const docs = await fetchCaseDocuments(result.seeker);
                const dbDoc = docs.find(doc =>
                    doc.source === 'matching'
                    && doc.type === 'matching_opinion'
                    && doc.jobId === jobKey
                );
                if (cancelled) return;
                if (dbDoc) {
                    setProfileText(dbDoc.content || fallback);
                    setSavedAt(readTimestamp(dbDoc.updatedAt || dbDoc.createdAt));
                    setSavedSource('db');
                    return;
                }
            } catch (error) {
                console.warn('[MatchingView] 저장된 매칭 의견 DB 조회 실패:', safeErrorMetadata(error, 'matching-opinion-load'));
            }

            if (cancelled) return;
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setProfileText(parsed.content || fallback);
                    setSavedAt(parsed.updatedAt || '');
                    setSavedSource('local');
                    return;
                }
            } catch {
                // localStorage 호환 값이 깨져 있어도 기본 추천 문구로 계속 표시한다.
            }
            setProfileText(fallback);
            setSavedAt('');
            setSavedSource('');
        };
        loadSavedProfile();
        return () => {
            cancelled = true;
        };
    }, [storageKey, result, rank, fetchCaseDocuments, jobKey]);

    const saveProfile = async () => {
        if (!profileText.trim()) {
            alert('저장할 매칭 의견을 작성해 주세요.');
            return;
        }
        setIsSaving(true);
        try {
            const updatedAt = new Date().toISOString();
            const saved = await saveMatchingOpinion({
                seekerId: seekerKey,
                seekerName: result.seeker.name,
                jobId: jobKey,
                companyName: result.job.companyName,
                jobRole: result.job.jobRole,
                content: profileText,
            });
            try {
                localStorage.setItem(storageKey, JSON.stringify({ content: profileText, updatedAt }));
            } catch {
                // DB 저장이 성공했다면 localStorage 실패는 치명적이지 않다.
            }
            setSavedAt(readTimestamp(saved.updatedAt || saved.createdAt) || updatedAt);
            setSavedSource('db');
            alert('매칭 의견이 저장되었습니다.');
        } catch (error: any) {
            alert(error?.message || '매칭 의견 저장에 실패했습니다. 작성 내용은 유지됩니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const refineProfile = async () => {
        if (!profileText.trim()) {
            alert('먼저 보완할 매칭 의견을 작성해 주세요.');
            return;
        }
        if (!confirm('현재 매칭 의견을 기준으로 보완본을 생성합니다. 실패해도 기존 내용은 유지됩니다. 진행할까요?')) return;
        setIsRefining(true);
        const previous = profileText;
        try {
            const prompt = buildCurrentContentRegenerationPrompt({
                documentTitle: '고용지원 매칭 의견',
                currentContent: profileText,
                userContext: buildMatchingContext(result, rank),
                additionalInstruction: '추천 요약, 추천 사유, 직무 적합성, 이용자 강점, 우려 지점, 사업체 배려사항, 초기 적응 지원계획, 담당자 확인 체크포인트, 최종 추천 등급을 모두 포함해 주세요.',
            });
            const refined = await generateText('summary', prompt);
            setProfileText(refined);
        } catch (error: any) {
            setProfileText(previous);
            alert(error?.message || '매칭 의견 보완 중 오류가 발생했습니다. 기존 내용은 유지됩니다.');
        } finally {
            setIsRefining(false);
        }
    };

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`glass-strong rounded-3xl border transition-all overflow-hidden ${isExpanded ? 'border-white/20 ring-1 ring-white/10 bg-white/10' : 'border-white/5 hover:border-white/10'}`}
        >
            <div className="p-6 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className={`w-10 h-10 rounded-xl ${scoreBg} flex items-center justify-center font-black text-sm ${scoreColor} border border-white/5`}>
                            {rank}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="text-xl font-black text-white">{result.seeker.name}</span>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/50">{result.seeker.disabilityType} {result.seeker.severity}</span>
                            </div>
                            <div className="mt-1 flex gap-4 text-xs text-white/30">
                                <span>{result.seeker.desiredJob1}</span>
                                <span>{result.seeker.desiredLocation}</span>
                                <span className="text-emerald-400/60">{result.seeker.desiredSalary}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <div className={`text-2xl font-black ${scoreColor}`}>{(result.totalScore * 50).toFixed(1)}점</div>
                            <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Match Score</div>
                        </div>
                        <ChevronRight className={`w-5 h-5 text-white/20 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10 bg-black/20"
                    >
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <h5 className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">Detailed Analysis</h5>
                                <div className="space-y-4">
                                    <ScoreRow label="직무 적합성" score={result.details.jobRole.score} comment={result.details.jobRole.comment} />
                                    <ScoreRow label="장애 유형/정도" score={(result.details.disability.score + result.details.severity.score) / 2} comment={`${result.details.disability.comment} / ${result.details.severity.comment}`} />
                                    <ScoreRow label="전근 지역" score={result.details.location.score} comment={result.details.location.comment} />
                                    <ScoreRow label="임금 조건" score={result.details.salary.score} comment={result.details.salary.comment} />
                                    <ScoreRow label="근무 시간" score={result.details.workHours.score} comment={result.details.workHours.comment} />
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h5 className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">AI Recommendation & Profile</h5>
                                <textarea
                                    value={profileText}
                                    onChange={e => setProfileText(e.target.value)}
                                    className="textarea-field !bg-white/5 border-white/10 !min-h-[260px] text-sm leading-relaxed text-white/75 font-sans resize-y"
                                />
                                <div className="flex gap-2 justify-end">
                                    {savedAt && <span className="mr-auto text-[11px] text-white/25 self-center">{savedSource === 'db' ? 'DB 저장됨' : '이전 임시저장'}: {new Date(savedAt).toLocaleString('ko-KR')}</span>}
                                    <button onClick={refineProfile} disabled={isRefining} className="btn-ghost !text-xs !bg-amber-500/10 !text-amber-300 border border-amber-500/20 font-bold px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                                        {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        현재 내용 기반 보완
                                    </button>
                                    <button onClick={saveProfile} disabled={isSaving} className="btn-ghost !text-xs !bg-emerald-500/10 !text-emerald-400 border border-emerald-500/20 font-bold px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                                        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function readTimestamp(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (value.seconds) return new Date(value.seconds * 1000).toISOString();
    return '';
}

function buildMatchingContext(result: MatchResult, rank: number) {
    return `
[매칭 기본 정보]
순위: ${rank}
이용자: ${result.seeker.name}
장애유형/정도: ${result.seeker.disabilityType} ${result.seeker.severity}
희망직무: ${result.seeker.desiredJob1 || '확인 필요'}
희망지역: ${result.seeker.desiredLocation || '확인 필요'}
희망임금: ${result.seeker.desiredSalary || '확인 필요'}
사업체: ${result.job.companyName}
모집직무: ${result.job.jobRole}
근무지역: ${result.job.location}
임금조건: ${result.job.salary}
근무시간: ${result.job.workHours || '확인 필요'}
종합 점수: ${(result.totalScore * 50).toFixed(1)}점
알고리즘 의견: ${result.combinedComment}
직무 적합성: ${result.details.jobRole.comment}
장애 관련 적합성: ${result.details.disability.comment} / ${result.details.severity.comment}
지역 적합성: ${result.details.location.comment}
임금 적합성: ${result.details.salary.comment}
근무시간 적합성: ${result.details.workHours.comment}
`.trim();
}

function getRecommendationGrade(score: number) {
    if (score >= 1.6) return 'A - 우선 추천';
    if (score >= 1.2) return 'B - 조건 확인 후 추천';
    if (score >= 0.8) return 'C - 추가 상담 후 검토';
    return 'D - 신중 검토';
}

function buildMatchingProfile(result: MatchResult, rank: number) {
    const grade = getRecommendationGrade(result.totalScore);
    return `1. 추천 요약
${rank}순위 후보로 검토할 수 있습니다. ${result.combinedComment}

2. 추천 사유
- 직무: ${result.details.jobRole.comment}
- 지역: ${result.details.location.comment}
- 임금: ${result.details.salary.comment}
- 근무시간: ${result.details.workHours.comment}

3. 직무 적합성
${result.seeker.desiredJob1 || '희망직무 확인 필요'}와 ${result.job.jobRole}의 연결 가능성을 중심으로 검토합니다. 실제 직무 내용, 작업강도, 반복성, 대인업무 비중은 사업체와 추가 확인이 필요합니다.

4. 이용자 강점
희망직무와 근무조건을 기준으로 초기 적응 가능성이 있는 부분을 우선 확인합니다. 기존 상담기록의 강점, 선호 업무, 지속 가능한 근무조건을 면담에서 보완 확인합니다.

5. 우려 지점
${result.details.disability.comment} / ${result.details.severity.comment}
업무 속도, 피로도, 이동, 의사소통, 환경 변화 적응 여부는 초기 배치 전 확인이 필요합니다.

6. 사업체 배려사항
업무 지시를 구체적으로 제시하고, 초기에는 담당자 피드백 시간을 짧게라도 정기적으로 마련하는 것이 좋습니다. 필요한 경우 작업 순서표, 휴식 조정, 동료 안내를 지원합니다.

7. 초기 적응 지원계획
초기 1~2주는 출퇴근, 업무이해, 작업속도, 대인관계, 피로도를 관찰하고 이용자와 사업체 의견을 함께 확인합니다. 필요 시 직무분석과 현장지원 계획을 조정합니다.

8. 담당자 확인 체크포인트
- 실제 직무 내용과 필수 수행수준
- 근무시간, 휴게시간, 통근 가능성
- 장애 특성상 필요한 합리적 배려
- 이용자의 근무 의사와 보호자/지원자 의견
- 초기 적응 중 위험요인과 지원 담당자

9. 최종 추천 등급
${grade}`;
}

function ScoreRow({ label, score, comment }: { label: string; score: number; comment: string }) {
    const pct = (score / 2) * 100;
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-white/60">{label}</span>
                <span className="text-[10px] text-white/30">{comment}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    className={`h-full ${pct > 70 ? 'bg-emerald-500' : pct > 40 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                />
            </div>
        </div>
    );
}
