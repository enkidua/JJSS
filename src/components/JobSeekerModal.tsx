import { forwardRef, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Building2, User, Camera, Loader2, Upload, FileCheck } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { performOCR, parseSeekerFromOCR } from '../services/ocr';
import { JobOpening, Seeker } from '../types/matching';
import { safeErrorMetadata } from '../utils/safeError';

interface JobSeekerModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'job' | 'seeker';
    onSuccess: () => void;
    editItem?: Seeker | JobOpening | null;
}

const emptyJobData = {
    counselDate: '', companyName: '', location: '', reqDisabilityType: '',
    reqSeverity: '', openingsCount: '', jobRole: '', salary: '', workHours: '',
    jobDescription: '', requirements: '', accommodations: '', hiringStatus: '모집중',
    contactPerson: '', contactPhone: ''
};

const emptySeekerData = {
    status: '구직중', seekerId: '', name: '', age: '', disabilityType: '',
    severity: '', desiredJob1: '', desiredJob2: '', desiredSalary: '',
    desiredWorkHours: '', desiredLocation: '', recommendingAgency: '', notes: ''
};

export default function JobSeekerModal({ isOpen, onClose, type, onSuccess, editItem = null }: JobSeekerModalProps) {
    const { addJob, addSeeker, updateJob, updateSeeker, loading, error } = useDataStore();
    const isEditMode = Boolean(editItem?.id);

    const [inputMode, setInputMode] = useState<'single' | 'bulk' | 'ocr'>('single');
    const [bulkData, setBulkData] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(0);

    // OCR 관련 상태
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrFile, setOcrFile] = useState<File | null>(null);
    const [ocrText, setOcrText] = useState('');
    const [ocrDone, setOcrDone] = useState(false);
    const ocrFileRef = useRef<HTMLInputElement>(null);
    const companyNameInputRef = useRef<HTMLInputElement>(null);
    const didFocusInitialInputRef = useRef(false);

    const [jobData, setJobData] = useState(emptyJobData);

    const [seekerData, setSeekerData] = useState(emptySeekerData);

    const trimStrings = <T extends Record<string, any>>(data: T): T => {
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
        ) as T;
    };

    const handleRunOcr = async () => {
        if (!ocrFile || ocrLoading) return;
        setOcrLoading(true);
        setOcrDone(false);
        try {
            const text = await performOCR(ocrFile);
            setOcrText(text);
            const parsed = parseSeekerFromOCR(text);
            setSeekerData(prev => ({
                ...prev,
                ...(parsed.name && { name: parsed.name }),
                ...(parsed.age && { age: parsed.age }),
                ...(parsed.disabilityType && { disabilityType: parsed.disabilityType }),
                ...(parsed.severity && { severity: parsed.severity }),
                ...(parsed.desiredJob1 && { desiredJob1: parsed.desiredJob1 }),
                ...(parsed.desiredJob2 && { desiredJob2: parsed.desiredJob2 }),
                ...(parsed.desiredSalary && { desiredSalary: parsed.desiredSalary }),
                ...(parsed.desiredWorkHours && { desiredWorkHours: parsed.desiredWorkHours }),
                ...(parsed.desiredLocation && { desiredLocation: parsed.desiredLocation }),
                ...(parsed.recommendingAgency && { recommendingAgency: parsed.recommendingAgency }),
                ...(parsed.seekerId && { seekerId: parsed.seekerId }),
                ...(parsed.status && { status: parsed.status }),
            }));
            setOcrDone(true);
        } catch (err: any) {
            alert(err.message || 'OCR 처리 실패');
        } finally {
            setOcrLoading(false);
        }
    };

    // 모달이 열리거나 닫힐 때, 혹은 타입이 바뀔 때 데이터 초기화
    useEffect(() => {
        if (!isOpen) return;

        if (editItem && type === 'job') {
            const item = editItem as JobOpening;
            setJobData({
                counselDate: String(item.counselDate || ''),
                companyName: String(item.companyName || ''),
                location: String(item.location || ''),
                reqDisabilityType: String(item.reqDisabilityType || ''),
                reqSeverity: String(item.reqSeverity || ''),
                openingsCount: String(item.openingsCount || ''),
                jobRole: String(item.jobRole || ''),
                salary: String(item.salary || ''),
                workHours: String(item.workHours || ''),
                jobDescription: String(item.jobDescription || ''),
                requirements: String(item.requirements || ''),
                accommodations: String(item.accommodations || ''),
                hiringStatus: String(item.hiringStatus || '모집중'),
                contactPerson: String(item.contactPerson || ''),
                contactPhone: String(item.contactPhone || ''),
            });
        } else if (editItem && type === 'seeker') {
            const item = editItem as Seeker;
            setSeekerData({
                status: String(item.status || '구직중'),
                seekerId: String(item.seekerId || ''),
                name: String(item.name || ''),
                age: String(item.age || ''),
                disabilityType: String(item.disabilityType || ''),
                severity: String(item.severity || ''),
                desiredJob1: String(item.desiredJob1 || ''),
                desiredJob2: String(item.desiredJob2 || ''),
                desiredSalary: String(item.desiredSalary || ''),
                desiredWorkHours: String(item.desiredWorkHours || ''),
                desiredLocation: String(item.desiredLocation || ''),
                recommendingAgency: String(item.recommendingAgency || ''),
                notes: String(item.notes || ''),
            });
        } else {
            setJobData(emptyJobData);
            setSeekerData(emptySeekerData);
        }

        setBulkData('');
        setOcrFile(null);
        setOcrText('');
        setOcrDone(false);
        setInputMode('single');
        setBulkProgress(0);
        didFocusInitialInputRef.current = false;
    }, [isOpen, type, editItem]);

    useEffect(() => {
        if (!isOpen || type !== 'job' || inputMode !== 'single' || didFocusInitialInputRef.current) return;
        didFocusInitialInputRef.current = true;
        const frame = requestAnimationFrame(() => {
            window.setTimeout(() => {
                companyNameInputRef.current?.focus();
            }, 80);
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, type, inputMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (type === 'job') {
                const cleanedJobData = trimStrings(jobData);
                if (!cleanedJobData.companyName) {
                    alert('회사명을 입력해 주세요.');
                    return;
                }
                if (isEditMode && editItem?.id) await updateJob(editItem.id, cleanedJobData as Partial<JobOpening>);
                else await addJob(cleanedJobData as any);
            } else {
                const cleanedSeekerData = trimStrings(seekerData);
                if (isEditMode && editItem?.id) await updateSeeker(editItem.id, cleanedSeekerData as Partial<Seeker>);
                else await addSeeker(cleanedSeekerData as any);
            }
            onSuccess();
        } catch (err: unknown) {
            console.error('Record save failed:', safeErrorMetadata(err, 'record-save'));
            alert('저장 중 오류가 발생했습니다. 입력한 내용은 유지됩니다.');
        }
    };

    const handleBulkSubmit = async () => {
        if (!bulkData.trim()) return;
        setBulkLoading(true);
        setBulkProgress(0);
        
        try {
            const rows = bulkData.trim().split('\n').filter(row => row.trim() !== '');
            const total = rows.length;
            const expectedColumns = type === 'job' ? 9 : 13;
            const parsedRows = rows.map((row, index) => {
                const columns = row.split('\t').map(column => column.trim());
                if (columns.length < expectedColumns) {
                    throw new Error(`${index + 1}행의 열 수가 부족합니다. ${expectedColumns}개 열 순서를 확인해 주세요.`);
                }
                const requiredValue = type === 'job' ? columns[0] : columns[2];
                if (!requiredValue) {
                    throw new Error(`${index + 1}행의 ${type === 'job' ? '회사명' : '이름'}이 비어 있습니다.`);
                }
                return columns;
            });

            for (let i = 0; i < total; i++) {
                const columns = parsedRows[i];

                if (type === 'job') {
                    const data = {
                        companyName: columns[0] || '',
                        location: columns[1] || '',
                        reqDisabilityType: columns[2] || '',
                        reqSeverity: columns[3] || '',
                        openingsCount: columns[4] || '',
                        jobRole: columns[5] || '',
                        salary: columns[6] || '',
                        workHours: columns[7] || '',
                        counselDate: columns[8] || ''
                    };
                    await addJob(data as any);
                } else {
                    const data = {
                        status: columns[0] || '구직중',
                        seekerId: columns[1] || '',
                        name: columns[2],
                        age: columns[3] || '',
                        disabilityType: columns[4] || '',
                        severity: columns[5] || '',
                        desiredJob1: columns[6] || '',
                        desiredJob2: columns[7] || '',
                        desiredSalary: columns[8] || '',
                        desiredWorkHours: columns[9] || '',
                        desiredLocation: columns[10] || '',
                        recommendingAgency: columns[11] || '',
                        notes: columns[12] || ''
                    };
                    await addSeeker(data as any);
                }
                setBulkProgress(Math.round(((i + 1) / total) * 100));
            }

            onSuccess();
            setBulkData('');
        } catch (err: unknown) {
            console.error('Bulk save failed:', safeErrorMetadata(err, 'bulk-save'));
            alert(err instanceof Error ? err.message : '일괄 등록 중 오류가 발생했습니다.');
        } finally {
            setBulkLoading(false);
            setBulkProgress(100);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="modal-overlay" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 glass-strong rounded-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-6 pb-4 bg-gradient-to-r from-primary-600/30 to-accent-600/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                {type === 'job' ? <Building2 className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-white" />}
                            </div>
                            <h2 className="text-xl font-bold text-white">
                                {type === 'job'
                                    ? (isEditMode ? '사업체/구인 정보 수정' : '새 구인공고(사업체) 등록')
                                    : (isEditMode ? '이용자 정보 수정' : '새 구직자 등록')}
                            </h2>
                        </div>
                        <button type="button" onClick={onClose} className="btn-ghost !p-2"><X className="w-5 h-5" /></button>
                    </div>

                    {!isEditMode && <div className="flex border-b border-white/10 px-6">
                        <button
                            type="button"
                            className={`py-3 px-4 font-medium text-sm border-b-2 transition-all ${inputMode === 'single' ? 'border-primary-500 text-primary-400' : 'border-transparent text-white/50 hover:text-white'}`}
                            onClick={() => setInputMode('single')}
                        >단건 직접 입력</button>
                        <button
                            type="button"
                            className={`py-3 px-4 font-medium text-sm border-b-2 transition-all ${inputMode === 'bulk' ? 'border-primary-500 text-primary-400' : 'border-transparent text-white/50 hover:text-white'}`}
                            onClick={() => setInputMode('bulk')}
                        >엑셀 일괄 등록</button>
                        {type === 'seeker' && (
                            <button
                                type="button"
                                className={`py-3 px-4 font-medium text-sm border-b-2 transition-all flex items-center gap-1.5 ${inputMode === 'ocr' ? 'border-green-500 text-green-400' : 'border-transparent text-white/50 hover:text-white'}`}
                                onClick={() => setInputMode('ocr')}
                            >
                                <Camera className="w-3.5 h-3.5" />
                                OCR 스캔 등록
                            </button>
                        )}
                    </div>}

                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500 text-red-300 rounded-lg text-sm">{error}</div>
                        )}

                        {inputMode === 'single' ? (
                            <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="space-y-4">
                                {type === 'job' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="상담일자" value={jobData.counselDate} onChange={(v: string) => setJobData(prev => ({ ...prev, counselDate: v }))} placeholder="2026-02-20" />
                                        <Input ref={companyNameInputRef} label="회사명" value={jobData.companyName} onChange={(v: string) => setJobData(prev => ({ ...prev, companyName: v }))} placeholder="ㅇㅇ복지센타" required />
                                        <Input label="근무지역" value={jobData.location} onChange={(v: string) => setJobData(prev => ({ ...prev, location: v }))} placeholder="서울시 강남구" />
                                        <Input label="직무" value={jobData.jobRole} onChange={(v: string) => setJobData(prev => ({ ...prev, jobRole: v }))} placeholder="사무보조" />
                                        <Input label="모집장애유형" value={jobData.reqDisabilityType} onChange={(v: string) => setJobData(prev => ({ ...prev, reqDisabilityType: v }))} placeholder="지체/시각/무관 등" />
                                        <Input label="모집 중경증" value={jobData.reqSeverity} onChange={(v: string) => setJobData(prev => ({ ...prev, reqSeverity: v }))} placeholder="경증/중증/무관" />
                                        <Input label="모집인원" value={jobData.openingsCount} onChange={(v: string) => setJobData(prev => ({ ...prev, openingsCount: v }))} type="number" placeholder="1" />
                                        <Input label="급여" value={jobData.salary} onChange={(v: string) => setJobData(prev => ({ ...prev, salary: v }))} placeholder="250만원 (또는 200~250)" />
                                        <Input label="근무시간" value={jobData.workHours} onChange={(v: string) => setJobData(prev => ({ ...prev, workHours: v }))} placeholder="40시간" />
                                        <Select label="채용상태" value={jobData.hiringStatus} onChange={(v: string) => setJobData(prev => ({ ...prev, hiringStatus: v }))} options={['모집중', '면접예정', '채용완료', '보류', '마감']} />
                                        <Input label="담당자" value={jobData.contactPerson} onChange={(v: string) => setJobData(prev => ({ ...prev, contactPerson: v }))} placeholder="담당자명 또는 직책" />
                                        <Input label="연락처" value={jobData.contactPhone} onChange={(v: string) => setJobData(prev => ({ ...prev, contactPhone: v }))} placeholder="연락 가능한 번호" />
                                        <div className="col-span-2 mt-2 pt-4 border-t border-white/10">
                                            <p className="text-sm font-bold text-white/80 mb-3">상세 직무정보</p>
                                            <div className="space-y-4">
                                                <TextArea label="직무내용" value={jobData.jobDescription} onChange={(v: string) => setJobData(prev => ({ ...prev, jobDescription: v }))} placeholder="주요 업무, 작업 순서, 사용하는 도구, 작업환경 등을 적어주세요." />
                                                <TextArea label="요구조건" value={jobData.requirements} onChange={(v: string) => setJobData(prev => ({ ...prev, requirements: v }))} placeholder="기본 지시 이해, 일정 시간 서기 가능, 손 사용 가능, 물품 구분 가능 등" />
                                                <TextArea label="배려사항" value={jobData.accommodations} onChange={(v: string) => setJobData(prev => ({ ...prev, accommodations: v }))} placeholder="반복 설명, 작업 순서표, 소음 적은 공간, 동료 지원, 근무시간 조정 등" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="구직자 이름" value={seekerData.name} onChange={(v: string) => setSeekerData(prev => ({ ...prev, name: v }))} placeholder="홍길동" required />
                                        <Input label="구직자 ID" value={seekerData.seekerId} onChange={(v: string) => setSeekerData(prev => ({ ...prev, seekerId: v }))} placeholder="S-001" />
                                        <Input label="현재 상황" value={seekerData.status} onChange={(v: string) => setSeekerData(prev => ({ ...prev, status: v }))} placeholder="구직중/취업/대기중" />
                                        <Input label="나이" value={seekerData.age} onChange={(v: string) => setSeekerData(prev => ({ ...prev, age: v }))} type="number" placeholder="30" />
                                        <Input label="장애유형" value={seekerData.disabilityType} onChange={(v: string) => setSeekerData(prev => ({ ...prev, disabilityType: v }))} placeholder="지적장애" />
                                        <Input label="중경증여부" value={seekerData.severity} onChange={(v: string) => setSeekerData(prev => ({ ...prev, severity: v }))} placeholder="중증 또는 경증" />
                                        <Input label="희망지역" value={seekerData.desiredLocation} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredLocation: v }))} placeholder="서울시" />
                                        <Input label="희망직종 1" value={seekerData.desiredJob1} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredJob1: v }))} placeholder="바리스타" />
                                        <Input label="희망직종 2 (선택)" value={seekerData.desiredJob2} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredJob2: v }))} />
                                        <Input label="희망임금" value={seekerData.desiredSalary} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredSalary: v }))} placeholder="200만원" />
                                        <Input label="추천기관" value={seekerData.recommendingAgency} onChange={(v: string) => setSeekerData(prev => ({ ...prev, recommendingAgency: v }))} placeholder="뫄뫄센터" />
                                        <Input label="희망 근무시간" value={seekerData.desiredWorkHours} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredWorkHours: v }))} placeholder="30시간" />
                                        <div className="col-span-2">
                                            <TextArea label="비고 (강점, 제한점 등)" value={seekerData.notes} onChange={(v: string) => setSeekerData(prev => ({ ...prev, notes: v }))} placeholder="엑셀 활용 가능, 대인관계 우수 등" />
                                        </div>
                                    </div>
                                )}

                                <button type="submit" disabled={loading} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
                                    <Save className="w-5 h-5" />
                                    {loading ? '저장 중...' : (isEditMode ? '변경사항 저장' : '저장하기')}
                                </button>
                                {isEditMode && (
                                    <button type="button" onClick={onClose} className="btn-ghost w-full flex items-center justify-center gap-2">
                                        수정 취소
                                    </button>
                                )}
                            </form>
                        ) : inputMode === 'bulk' ? (
                            <div className="space-y-4">
                                <div className="bg-primary-500/10 border border-primary-500/30 p-4 rounded-xl text-sm text-primary-100 leading-relaxed">
                                    <p className="font-bold mb-2 text-primary-300">💡 엑셀에서 데이터를 복사(Ctrl+C)하여 아래 칸에 붙여넣기(Ctrl+V) 하세요.</p>
                                    <p>반드시 아래 열 순서대로 나열되어 있어야 합니다 (헤더 행은 제외하고 데이터만 붙여넣으세요).</p>
                                    {type === 'job'
                                        ? <p className="mt-2 text-xs opacity-70">열 순서: [회사명] [근무지역] [모집장애유형] [모집중경증] [모집인원] [직무] [급여] [근무시간] [상담일자]</p>
                                        : <p className="mt-2 text-xs opacity-70">열 순서: [현재상황] [구직자ID] [이름] [나이] [장애유형] [중경증여부] [희망직종1] [희망직종2] [희망임금] [희망근무시간] [희망지역] [추천기관] [비고]</p>
                                    }
                                </div>

                                <textarea
                                    className="textarea-field font-mono text-xs whitespace-pre"
                                    rows={10}
                                    placeholder="여기에 엑셀 데이터를 붙여넣으세요..."
                                    value={bulkData}
                                    onChange={(e) => setBulkData(e.target.value)}
                                />

                                {bulkLoading && (
                                    <div className="w-full bg-white/10 rounded-full h-2.5 mt-2">
                                        <div className="bg-primary-500 h-2.5 rounded-full transition-all" style={{ width: `${bulkProgress}%` }}></div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleBulkSubmit}
                                    disabled={bulkLoading || !bulkData.trim()}
                                    className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-5 h-5" />
                                    {bulkLoading ? `저장 중... (${bulkProgress}%)` : `총 ${bulkData.trim() ? bulkData.trim().split('\n').length : 0}건 일괄 저장하기`}
                                </button>
                            </div>
                        ) : (
                            /* ─── OCR 스캔 등록 탭 ─── */
                            <div className="space-y-4">
                                <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl text-sm text-green-100 leading-relaxed">
                                    <p className="font-bold mb-2 text-green-300 flex items-center gap-2">
                                        <Camera className="w-4 h-4" />
                                        상담기록지 OCR 자동 인식
                                    </p>
                                    <p className="text-green-200/70">상담기록지나 접수서류를 스캔/촬영하여 업로드하면 Google Vision AI가 텍스트를 자동 인식하여 이용자 정보를 채워줍니다.</p>
                                </div>

                                {/* 파일 업로드 영역 */}
                                <div
                                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${ocrDone ? 'border-green-500/50 bg-green-500/5' : 'border-white/20 hover:border-primary-500/50 hover:bg-white/5'}`}
                                    onClick={() => ocrFileRef.current?.click()}
                                >
                                    <input
                                        ref={ocrFileRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            setOcrFile(file);
                                            setOcrDone(false);
                                            setOcrText('');
                                        }}
                                    />
                                    {ocrLoading ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-12 h-12 text-primary-400 animate-spin" />
                                            <p className="text-white/60">Google Vision AI로 텍스트 추출 중...</p>
                                        </div>
                                    ) : ocrDone ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <FileCheck className="w-12 h-12 text-green-400" />
                                            <p className="text-green-300 font-medium">OCR 완료! 아래 폼을 확인하세요</p>
                                            <p className="text-white/30 text-xs">다시 업로드하려면 클릭하세요</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3">
                                            <Upload className="w-12 h-12 text-white/20" />
                                            <p className="text-white/50">클릭하여 상담기록지 이미지를 선택하세요</p>
                                            <p className="text-white/20 text-xs">JPG, PNG 등 이미지 파일 지원</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRunOcr}
                                    disabled={!ocrFile || ocrLoading}
                                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {ocrLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                    {ocrLoading ? '문서 분석 중...' : '선택한 파일 OCR 분석'}
                                </button>
                                {ocrFile && !ocrDone && <p className="text-center text-xs text-white/40">선택됨: {ocrFile.name} · 분석 버튼을 눌러야 API를 호출합니다.</p>}

                                {/* OCR 원문 텍스트 */}
                                {ocrText && (
                                    <details className="text-sm">
                                        <summary className="text-white/40 cursor-pointer hover:text-white/60 transition">OCR 인식 원문 보기</summary>
                                        <pre className="mt-2 p-3 rounded-xl bg-white/5 text-white/50 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">{ocrText}</pre>
                                    </details>
                                )}

                                {/* OCR로 채워진 폼 (수정 가능) */}
                                {ocrDone && (
                                    <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="space-y-4 border-t border-white/10 pt-4">
                                        <p className="text-white/60 text-sm">자동 인식 결과를 확인하고 필요한 부분을 수정하세요</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input label="구직자 이름" value={seekerData.name} onChange={(v: string) => setSeekerData(prev => ({ ...prev, name: v }))} placeholder="홍길동" required />
                                            <Input label="구직자 ID" value={seekerData.seekerId} onChange={(v: string) => setSeekerData(prev => ({ ...prev, seekerId: v }))} placeholder="S-001" />
                                            <Input label="현재 상황" value={seekerData.status} onChange={(v: string) => setSeekerData(prev => ({ ...prev, status: v }))} placeholder="구직중" />
                                            <Input label="나이" value={seekerData.age} onChange={(v: string) => setSeekerData(prev => ({ ...prev, age: v }))} placeholder="30" />
                                            <Input label="장애유형" value={seekerData.disabilityType} onChange={(v: string) => setSeekerData(prev => ({ ...prev, disabilityType: v }))} placeholder="지적장애" />
                                            <Input label="중경증여부" value={seekerData.severity} onChange={(v: string) => setSeekerData(prev => ({ ...prev, severity: v }))} placeholder="중증" />
                                            <Input label="희망지역" value={seekerData.desiredLocation} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredLocation: v }))} placeholder="서울시" />
                                            <Input label="희망직종 1" value={seekerData.desiredJob1} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredJob1: v }))} placeholder="바리스타" />
                                            <Input label="희망직종 2" value={seekerData.desiredJob2} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredJob2: v }))} />
                                            <Input label="희망임금" value={seekerData.desiredSalary} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredSalary: v }))} placeholder="200만원" />
                                            <Input label="추천기관" value={seekerData.recommendingAgency} onChange={(v: string) => setSeekerData(prev => ({ ...prev, recommendingAgency: v }))} />
                                            <Input label="희망 근무시간" value={seekerData.desiredWorkHours} onChange={(v: string) => setSeekerData(prev => ({ ...prev, desiredWorkHours: v }))} placeholder="30시간" />
                                            <div className="col-span-2">
                                                <TextArea label="비고" value={seekerData.notes} onChange={(v: string) => setSeekerData(prev => ({ ...prev, notes: v }))} placeholder="추가 참고사항" />
                                            </div>
                                        </div>
                                        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                                            <Save className="w-5 h-5" />
                                            {loading ? '저장 중...' : 'OCR 결과로 이용자 등록'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

const Input = forwardRef<HTMLInputElement, any>(function Input(
    { label, value, onChange, placeholder, type = 'text', required = false },
    ref
) {
    const [draftValue, setDraftValue] = useState(String(value ?? ''));
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        if (!isComposing) {
            setDraftValue(String(value ?? ''));
        }
    }, [value, isComposing]);

    return (
        <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">{label} {required && <span className="text-red-400">*</span>}</label>
            <input
                ref={ref}
                type={type}
                placeholder={placeholder}
                value={draftValue}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                    const nextValue = e.currentTarget.value;
                    setIsComposing(false);
                    setDraftValue(nextValue);
                    onChange(nextValue);
                }}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraftValue(nextValue);
                    if (!isComposing) {
                        onChange(nextValue);
                    }
                }}
                required={required}
                className="input-field"
            />
        </div>
    );
});

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
    return (
        <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
                {options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
        </div>
    );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
    const [draftValue, setDraftValue] = useState(String(value ?? ''));
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        if (!isComposing) {
            setDraftValue(String(value ?? ''));
        }
    }, [value, isComposing]);

    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <textarea
                value={draftValue}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                    const nextValue = e.currentTarget.value;
                    setIsComposing(false);
                    setDraftValue(nextValue);
                    onChange(nextValue);
                }}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraftValue(nextValue);
                    if (!isComposing) {
                        onChange(nextValue);
                    }
                }}
                className="textarea-field text-sm leading-relaxed"
                rows={3}
                placeholder={placeholder}
            />
        </label>
    );
}
