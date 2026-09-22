import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Users, ClipboardList, Calendar, ChevronDown, ChevronUp, Edit3, Trash2, Loader2, X, Plus, Briefcase } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { CaseDocument } from '../types/caseDocument';
import { Seeker } from '../types/matching';
import { safeErrorMetadata } from '../utils/safeError';

interface CaseHistoryPanelProps {
    seeker: Seeker;
    onClose: () => void;
    onContinueWrite: (type: 'meeting' | 'plan' | 'counseling', existingDoc?: CaseDocument) => void;
}

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
    meeting: { label: '사례회의', icon: Users, color: 'from-blue-500 to-cyan-500' },
    plan: { label: '직업재활계획', icon: ClipboardList, color: 'from-purple-500 to-violet-500' },
    counseling: { label: '상담일지', icon: FileText, color: 'from-emerald-500 to-green-500' },
    evaluation: { label: '정기평가', icon: ClipboardList, color: 'from-amber-500 to-orange-500' },
    matching_opinion: { label: '매칭의견', icon: Briefcase, color: 'from-teal-500 to-emerald-500' },
    employment_matching: { label: '매칭의견', icon: Briefcase, color: 'from-teal-500 to-emerald-500' },
};

export default function CaseHistoryPanel({ seeker, onClose, onContinueWrite }: CaseHistoryPanelProps) {
    const { fetchCaseDocuments, deleteCaseDocument } = useDataStore();
    const [docs, setDocs] = useState<CaseDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'meeting' | 'plan' | 'counseling' | 'evaluation' | 'matching_opinion'>('all');

    useEffect(() => {
        loadDocuments();
    }, [seeker.id, seeker.seekerId, seeker.name]);

    const loadDocuments = async () => {
        if (!seeker.id && !seeker.seekerId && !seeker.name) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const fetched = await fetchCaseDocuments(seeker);
            // 현황판의 구조화된 상태 문서는 문서 이력이 아니므로 원문 JSON을 노출하지 않습니다.
            setDocs(fetched.filter(doc => doc.type !== 'workflow'));
        } catch (error) {
            console.error('Error loading documents:', safeErrorMetadata(error, 'case-document-load'));
            setErrorMessage('기록을 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (docId: string) => {
        if (!window.confirm('이 기록을 삭제하시겠습니까?')) return;
        try {
            await deleteCaseDocument(docId);
            setDocs(prev => prev.filter(d => d.id !== docId));
        } catch (error) {
            console.error('Delete error:', safeErrorMetadata(error, 'case-document-delete'));
            setErrorMessage('기록 삭제 중 오류가 발생했습니다.');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '날짜 없음';
        const date = timestamp.seconds
            ? new Date(timestamp.seconds * 1000)
            : new Date(timestamp);
        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const filtered = activeFilter === 'all'
        ? docs
        : activeFilter === 'matching_opinion'
            ? docs.filter(d => d.type === 'matching_opinion' || d.type === 'employment_matching')
        : docs.filter(d => d.type === activeFilter);

    const meetingCount = docs.filter(d => d.type === 'meeting').length;
    const planCount = docs.filter(d => d.type === 'plan').length;
    const counselingCount = docs.filter(d => d.type === 'counseling').length;
    const evaluationCount = docs.filter(d => d.type === 'evaluation').length;
    const matchingCount = docs.filter(d => d.type === 'matching_opinion' || d.type === 'employment_matching').length;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0f1129] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold">
                                    {seeker.name?.charAt(0)}
                                </div>
                                {seeker.name}님의 사례관리 기록
                            </h2>
                            <p className="text-white/40 text-sm mt-1">
                                총 {docs.length}건의 기록 • 
                                사례회의 {meetingCount}건 / 직업재활계획 {planCount}건 / 상담일지 {counselingCount}건 / 매칭의견 {matchingCount}건
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition text-white/60 hover:text-white">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* 필터 탭 */}
                    <div className="flex gap-2 mt-4">
                        {[
                            { key: 'all' as const, label: '전체', count: docs.length },
                            { key: 'meeting' as const, label: '사례회의', count: meetingCount },
                            { key: 'plan' as const, label: '직업재활계획', count: planCount },
                            { key: 'counseling' as const, label: '상담일지', count: counselingCount },
                            { key: 'evaluation' as const, label: '정기평가', count: evaluationCount },
                            { key: 'matching_opinion' as const, label: '매칭의견', count: matchingCount },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                    activeFilter === tab.key
                                        ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                }`}
                            >
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>
                </div>

                {/* 새 기록 작성 버튼 */}
                <div className="px-6 py-3 border-b border-white/5 flex gap-2">
                    {(['meeting', 'plan', 'counseling'] as const).map(type => {
                        const info = TYPE_LABELS[type];
                        const Icon = info.icon;
                        return (
                            <button
                                key={type}
                                onClick={() => onContinueWrite(type)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r ${info.color} text-white/90 hover:brightness-110 transition-all`}
                            >
                                <Plus className="w-4 h-4" />
                                {info.label} 새 작성
                            </button>
                        );
                    })}
                </div>

                {/* 문서 목록 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                            <span className="ml-3 text-white/50">기록을 불러오는 중...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-20">
                            <FileText className="w-16 h-16 mx-auto text-white/10 mb-4" />
                            <p className="text-white/40 text-lg mb-2">
                                {errorMessage || (activeFilter === 'all' ? '작성된 기록이 없습니다' : `${TYPE_LABELS[activeFilter]?.label} 기록이 없습니다`)}
                            </p>
                            <p className="text-white/20 text-sm">{errorMessage ? '기존 데이터는 삭제하지 않았습니다. 앱을 다시 실행한 뒤 확인해 주세요.' : '위의 버튼을 눌러 새 기록을 작성해보세요'}</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {filtered.map((d, i) => {
                                const typeInfo = TYPE_LABELS[d.type] || TYPE_LABELS.counseling;
                                const Icon = typeInfo.icon;
                                const isExpanded = expandedDoc === d.id;

                                return (
                                    <motion.div
                                        key={d.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all min-h-[112px]"
                                    >
                                        <div
                                            className="flex items-center gap-4 p-5 sm:p-6 cursor-pointer"
                                            onClick={() => setExpandedDoc(isExpanded ? null : d.id!)}
                                        >
                                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${typeInfo.color} flex items-center justify-center flex-shrink-0`}>
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-bold text-base sm:text-lg">{typeInfo.label}</span>
                                                    {d.tab && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/40">
                                                            {d.tab === 'case' ? '사례관리' : '서류생성'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-white/55 text-sm mt-2 truncate leading-relaxed">
                                                    {d.content?.substring(0, 100)}...
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="text-white/30 text-xs flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(d.createdAt)}
                                                </span>
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                                            </div>
                                        </div>

                                        {/* 확장된 내용 */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="border-t border-white/5"
                                                >
                                                    <div className="p-5 sm:p-6 bg-white/[0.02]">
                                                        <pre className="text-white/85 text-sm sm:text-[15px] whitespace-pre-wrap leading-7 font-sans min-h-[260px] sm:min-h-[300px] max-h-[520px] overflow-y-auto rounded-2xl bg-black/20 border border-white/10 p-5 custom-scrollbar">
                                                            {d.content}
                                                        </pre>
                                                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/5">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onContinueWrite(d.type as any, d); }}
                                                                disabled={d.type === 'matching_opinion' || d.type === 'employment_matching'}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500/20 text-primary-200 text-sm hover:bg-primary-500/30 focus:outline-none focus:ring-2 focus:ring-primary-300/40 transition disabled:opacity-60"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                                {d.type === 'matching_opinion' || d.type === 'employment_matching' ? '매칭 화면에서 수정' : '이어서 작성'}
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(d.id!); }}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-500/10 text-red-300 text-sm hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-300/40 transition"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                삭제
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
