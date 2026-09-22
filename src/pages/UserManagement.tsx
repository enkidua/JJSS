import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Briefcase, Plus, Search, Trash2, ChevronDown, ChevronUp,
    User, MapPin, Clock, DollarSign, Sparkles, FileText, Wand2, ClipboardCheck, Pencil, LayoutDashboard
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '../store/dataStore';
import { Seeker, JobOpening } from '../types/matching';
import JobSeekerModal from '../components/JobSeekerModal';

type ViewMode = 'seekers' | 'jobs';

export default function UserManagement() {
    const { fetchData, seekers, jobs, loading, deleteSeeker, deleteJob } = useDataStore();
    const [viewMode, setViewMode] = useState<ViewMode>('seekers');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'job' | 'seeker'>('seeker');
    const [editItem, setEditItem] = useState<Seeker | JobOpening | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const navigate = useNavigate();


    // ─── 필터링 (useMemo로 최적화) ───
    const filteredSeekers = React.useMemo(() => seekers.filter(s =>
        s.name?.includes(searchTerm) ||
        s.disabilityType?.includes(searchTerm) ||
        s.desiredJob1?.includes(searchTerm) ||
        s.desiredLocation?.includes(searchTerm) ||
        s.status?.includes(searchTerm)
    ), [seekers, searchTerm]);

    const filteredJobs = React.useMemo(() => jobs.filter(j =>
        j.companyName?.includes(searchTerm) ||
        j.jobRole?.includes(searchTerm) ||
        j.location?.includes(searchTerm) ||
        j.reqDisabilityType?.includes(searchTerm) ||
        j.jobDescription?.includes(searchTerm) ||
        j.requirements?.includes(searchTerm) ||
        j.accommodations?.includes(searchTerm) ||
        j.hiringStatus?.includes(searchTerm) ||
        j.contactPerson?.includes(searchTerm)
    ), [jobs, searchTerm]);

    const handleDelete = async (type: 'seeker' | 'job', id: string, name: string) => {
        if (window.confirm(`"${name}" 정보를 삭제하시겠습니까? 되돌릴 수 없습니다.`)) {
            try {
                if (type === 'seeker') await deleteSeeker(id);
                else await deleteJob(id);
                if (expandedId === id) setExpandedId(null);
            } catch (error: any) {
                alert(error?.message || '삭제 중 오류가 발생했습니다.');
            }
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const openCreateModal = (type: 'seeker' | 'job') => {
        setEditItem(null);
        setModalType(type);
        setIsModalOpen(true);
    };

    const openEditModal = (type: 'seeker' | 'job', item: Seeker | JobOpening) => {
        setEditItem(item);
        setModalType(type);
        setIsModalOpen(true);
    };

    const handleModalSuccess = () => {
        const message = editItem
            ? (modalType === 'seeker' ? '이용자 정보가 수정되었습니다.' : '사업체/구인 정보가 수정되었습니다.')
            : (modalType === 'seeker' ? '이용자가 등록되었습니다.' : '사업체/구인 정보가 등록되었습니다.');
        setIsModalOpen(false);
        setEditItem(null);
        fetchData(true);
        window.alert(message);
    };

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 mb-4">
                        <Users className="w-4 h-4 text-accent-400" />
                        <span className="text-sm text-accent-300 font-medium">데이터 관리</span>
                    </div>
                    <h1 className="section-title mb-3">이용자 및 사업체 관리</h1>
                    <p className="text-white/50 text-lg">이용자와 사업체 정보를 한눈에 관리하고, 문서를 바로 작성하세요</p>
                </motion.div>

                {/* 탭 전환 + 액션 버튼 */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <div role="group" aria-label="관리 대상 선택" className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
                        <button
                            type="button"
                            aria-pressed={viewMode === 'seekers'}
                            onClick={() => { setViewMode('seekers'); setSearchTerm(''); setExpandedId(null); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${viewMode === 'seekers' ? 'bg-accent-500 text-white shadow-lg' : 'text-white/50 hover:text-white'
                                }`}
                        >
                            <User className="w-4 h-4" /> 이용자 <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{seekers.length}</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={viewMode === 'jobs'}
                            onClick={() => { setViewMode('jobs'); setSearchTerm(''); setExpandedId(null); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${viewMode === 'jobs' ? 'bg-primary-500 text-white shadow-lg' : 'text-white/50 hover:text-white'
                                }`}
                        >
                            <Briefcase className="w-4 h-4" /> 사업체 <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{jobs.length}</span>
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/overview')}
                            className="btn-secondary !py-2.5 !px-4 text-sm font-bold flex items-center gap-2"
                        >
                            <LayoutDashboard className="w-4 h-4" /> 현황판
                        </button>
                        <button
                            onClick={() => openCreateModal('seeker')}
                            className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-accent-500/20"
                        >
                            <Plus className="w-4 h-4" /> 이용자 등록
                        </button>
                        <button
                            onClick={() => openCreateModal('job')}
                            className="btn-primary !py-2.5 !px-4 text-sm font-bold flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> 사업체 등록
                        </button>
                    </div>
                </div>

                {/* 검색 */}
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                        aria-label={viewMode === 'seekers' ? '이용자 검색' : '사업체 검색'}
                        className="input-field !pl-12 !py-3 text-base"
                        placeholder={viewMode === 'seekers' ? '이름, 장애유형, 희망직종, 지역으로 검색...' : '기업명, 직무, 지역, 장애유형으로 검색...'}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* 리스트 */}
                {loading ? (
                    <div className="text-center py-12 text-white/30">로딩 중...</div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {viewMode === 'seekers' ? (
                                filteredSeekers.length === 0 ? (
                                    <div className="text-center py-12 text-white/60">
                                        <p>{searchTerm.trim() ? `“${searchTerm.trim()}”에 맞는 이용자가 없습니다.` : '등록된 이용자가 없습니다.'}</p>
                                        {searchTerm.trim() && (
                                            <button type="button" onClick={() => setSearchTerm('')} className="btn-secondary mt-4 !px-4 !py-2 text-sm">검색 초기화</button>
                                        )}
                                    </div>
                                ) : (
                                    filteredSeekers.map((s, i) => (
                                        <motion.div
                                            key={s.id || `seeker-${i}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ delay: i * 0.02 }}
                                            className="glass-strong rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-all"
                                        >
                                            {/* 요약 행 */}
                                            <div
                                                className="p-4 flex items-center gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/80 focus-visible:ring-inset"
                                                onClick={() => s.id && toggleExpand(s.id)}
                                            >
                                                {/* 상태 뱃지 */}
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.status === '구직중' ? 'bg-green-500/20' :
                                                    s.status === '취업' ? 'bg-blue-500/20' :
                                                        'bg-white/10'
                                                    }`}>
                                                    <User className={`w-5 h-5 ${s.status === '구직중' ? 'text-green-400' :
                                                        s.status === '취업' ? 'text-blue-400' :
                                                            'text-white/40'
                                                        }`} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button type="button" aria-expanded={Boolean(s.id && expandedId === s.id)} aria-label={`${s.name || '이용자'} 상세 정보`} onClick={event => { event.stopPropagation(); if (s.id) toggleExpand(s.id); }} className="text-white font-bold text-base text-left">{String(s.name || '이름 없음')}</button>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === '구직중' ? 'bg-green-500/20 text-green-300' :
                                                            s.status === '취업' ? 'bg-blue-500/20 text-blue-300' :
                                                                'bg-white/10 text-white/50'
                                                            }`}>{String(s.status || '상태 미정')}</span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 font-medium">{String(s.severity || '-')}</span>
                                                    </div>
                                                    <div className="text-white/50 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                                        <span>{String(s.disabilityType || '-')}</span>
                                                        <span>{String(s.age || '0')}세</span>
                                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{String(s.desiredLocation || '-')}</span>
                                                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{String(s.desiredJob1 || '-')}{s.desiredJob2 ? ` · ${String(s.desiredJob2)}` : ''}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        aria-label={`${s.name || '이용자'} 정보 수정`}
                                                        onClick={(e) => { e.stopPropagation(); openEditModal('seeker', s); }}
                                                        className="p-2 rounded-lg text-white/40 hover:bg-accent-500/20 hover:text-accent-300 transition-all"
                                                        title="이용자 정보 수정"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`${s.name || '이용자'} 정보 삭제`}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete('seeker', s.id!, s.name); }}
                                                        className="p-2 rounded-lg text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    {expandedId === s.id ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                                                </div>
                                            </div>

                                            {/* 상세 정보 */}
                                            <AnimatePresence>
                                                {expandedId === s.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="border-t border-white/10"
                                                    >
                                                        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                                                            <InfoItem icon={FileText} label="구직자 ID" value={s.seekerId} />
                                                            <InfoItem icon={User} label="이름" value={s.name} />
                                                            <InfoItem icon={Clock} label="나이" value={`${s.age}세`} />
                                                            <InfoItem icon={Sparkles} label="장애유형" value={s.disabilityType} />
                                                            <InfoItem icon={Sparkles} label="중경증" value={s.severity} />
                                                            <InfoItem icon={Briefcase} label="희망직종1" value={s.desiredJob1} />
                                                            <InfoItem icon={Briefcase} label="희망직종2" value={s.desiredJob2 || '-'} />
                                                            <InfoItem icon={DollarSign} label="희망임금" value={s.desiredSalary} />
                                                            <InfoItem icon={Clock} label="희망근무시간" value={s.desiredWorkHours} />
                                                            <InfoItem icon={MapPin} label="희망지역" value={s.desiredLocation} />
                                                            <InfoItem icon={Users} label="추천기관" value={s.recommendingAgency} />
                                                            <InfoItem icon={FileText} label="비고" value={s.notes || '-'} />
                                                        </div>
                                                        {/* 문서 작성 바로가기 */}
                                                        <div className="px-5 pb-4 pt-2 border-t border-white/5">
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/overview?seekerId=${encodeURIComponent(s.id || '')}`)}
                                                                className="text-xs px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-200 hover:bg-teal-500/30 transition-all inline-flex items-center gap-1 font-medium mb-3"
                                                            >
                                                                <LayoutDashboard className="w-3 h-3" /> 후속 일정·목표 현황
                                                            </button>
                                                            <p className="text-xs text-white/40 mb-2 font-medium">이 이용자 대상 AI 문서 작성</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    onClick={() => navigate('/workmate', { state: { tab: 'pipeline', seekerName: s.name, step: 'meeting' } })}
                                                                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all flex items-center gap-1 font-medium"
                                                                >
                                                                    <Wand2 className="w-3 h-3" /> 사례회의록
                                                                </button>
                                                                <button
                                                                    onClick={() => navigate('/workmate', { state: { tab: 'pipeline', seekerName: s.name, step: 'plan' } })}
                                                                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all flex items-center gap-1 font-medium"
                                                                >
                                                                    <FileText className="w-3 h-3" /> 직업재활계획서
                                                                </button>
                                                                <button
                                                                    onClick={() => navigate('/workmate', { state: { tab: 'pipeline', seekerName: s.name, step: 'counseling' } })}
                                                                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-all flex items-center gap-1 font-medium"
                                                                >
                                                                    <FileText className="w-3 h-3" /> 상담일지
                                                                </button>
                                                                <button
                                                                    onClick={() => navigate('/workmate', { state: { tab: 'pipeline', seekerName: s.name, step: 'evaluation' } })}
                                                                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all flex items-center gap-1 font-medium"
                                                                >
                                                                    <ClipboardCheck className="w-3 h-3" /> 정기평가
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    ))
                                )
                            ) : (
                                filteredJobs.length === 0 ? (
                                    <div className="text-center py-12 text-white/60">
                                        <p>{searchTerm.trim() ? `“${searchTerm.trim()}”에 맞는 사업체가 없습니다.` : '등록된 사업체가 없습니다.'}</p>
                                        {searchTerm.trim() && (
                                            <button type="button" onClick={() => setSearchTerm('')} className="btn-secondary mt-4 !px-4 !py-2 text-sm">검색 초기화</button>
                                        )}
                                    </div>
                                ) : (
                                    filteredJobs.map((j, i) => (
                                        <motion.div
                                            key={j.id || `job-${i}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ delay: i * 0.02 }}
                                            className="glass-strong rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-all"
                                        >
                                            {/* 요약 행 */}
                                            <div
                                                className="p-4 flex items-center gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/80 focus-visible:ring-inset"
                                                onClick={() => j.id && toggleExpand(j.id)}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0">
                                                    <Briefcase className="w-5 h-5 text-primary-400" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button type="button" aria-expanded={Boolean(j.id && expandedId === j.id)} aria-label={`${j.companyName || '사업체'} 상세 정보`} onClick={event => { event.stopPropagation(); if (j.id) toggleExpand(j.id); }} className="text-white font-bold text-base text-left">{String(j.companyName || '사업체명 없음')}</button>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 font-medium">{String(j.jobRole || '-')}</span>
                                                        {j.hiringStatus && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">{String(j.hiringStatus)}</span>}
                                                    </div>
                                                    <div className="text-white/50 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{String(j.location || '-')}</span>
                                                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{String(j.salary || '-')}</span>
                                                        <span>{String(j.reqDisabilityType || '-')} · {String(j.reqSeverity || '-')}</span>
                                                        <span>{String(j.openingsCount || '0')}명 모집</span>
                                                        {j.contactPerson && <span>담당: {String(j.contactPerson)}</span>}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        aria-label={`${j.companyName || '사업체'} 정보 수정`}
                                                        onClick={(e) => { e.stopPropagation(); openEditModal('job', j); }}
                                                        className="p-2 rounded-lg text-white/40 hover:bg-primary-500/20 hover:text-primary-300 transition-all"
                                                        title="사업체/구인 정보 수정"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`${j.companyName || '사업체'} 정보 삭제`}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete('job', j.id!, j.companyName); }}
                                                        className="p-2 rounded-lg text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    {expandedId === j.id ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                                                </div>
                                            </div>

                                            {/* 상세 정보 */}
                                            <AnimatePresence>
                                                {expandedId === j.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="border-t border-white/10"
                                                    >
                                                        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                                                            <InfoItem icon={Briefcase} label="회사명" value={j.companyName} />
                                                            <InfoItem icon={FileText} label="직무" value={j.jobRole} />
                                                            <InfoItem icon={MapPin} label="근무지역" value={j.location} />
                                                            <InfoItem icon={DollarSign} label="급여" value={j.salary} />
                                                            <InfoItem icon={Clock} label="근무시간" value={j.workHours} />
                                                            <InfoItem icon={Users} label="모집인원" value={`${j.openingsCount}명`} />
                                                            <InfoItem icon={Sparkles} label="모집장애유형" value={j.reqDisabilityType} />
                                                            <InfoItem icon={Sparkles} label="모집 중경증" value={j.reqSeverity} />
                                                            <InfoItem icon={Clock} label="상담일자" value={j.counselDate} />
                                                            <InfoItem icon={ClipboardCheck} label="채용상태" value={j.hiringStatus || '-'} />
                                                            <InfoItem icon={User} label="담당자" value={j.contactPerson || '-'} />
                                                            <InfoItem icon={FileText} label="연락처" value={j.contactPhone || '-'} />
                                                        </div>
                                                        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                            <InfoBlock label="직무내용" value={j.jobDescription || '-'} />
                                                            <InfoBlock label="요구조건" value={j.requirements || '-'} />
                                                            <InfoBlock label="배려사항" value={j.accommodations || '-'} />
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    ))
                                )
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* 등록 모달 */}
            <JobSeekerModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditItem(null); }}
                type={modalType}
                editItem={editItem}
                onSuccess={handleModalSuccess}
            />
        </div>
    );
}

// ─── 상세 정보 아이템 컴포넌트 ───
function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
            <div>
                <div className="text-white/40 text-xs">{label}</div>
                <div className="text-white/90 font-medium">{value !== undefined && value !== null ? String(value) : '-'}</div>
            </div>
        </div>
    );
}

function InfoBlock({ label, value }: { label: string; value: any }) {
    return (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 min-h-[110px]">
            <div className="text-white/40 text-xs mb-2">{label}</div>
            <div className="text-white/85 text-sm leading-relaxed whitespace-pre-wrap">{value !== undefined && value !== null && String(value).trim() ? String(value) : '-'}</div>
        </div>
    );
}
