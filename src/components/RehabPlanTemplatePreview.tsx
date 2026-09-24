import { useEffect, useRef, useState } from 'react';
import {
    Eye, FileDown, FileText, ImageDown, Loader2, Plus, RotateCcw,
    ShieldAlert, Trash2, X,
} from 'lucide-react';
import type { Seeker } from '../types/matching';
import type { RehabPlanFormData, RehabPlanGoal } from '../types/rehabPlan';
import { createEmptyRehabPlanGoal, mapRehabPlanFormData } from '../utils/rehabPlanMapper';
import { downloadRehabPlanAsDocx } from '../utils/rehabPlanDocx';
import { getRehabPlanExportWarnings } from '../utils/rehabPlanReview';
import { downloadElementAsPng, printElementAsPdf } from '../utils/localDocumentExport';
import { savedLocationMessage } from '../utils/jjssFileService';
import { localDateKey } from '../utils/date';
import { useConfirm } from './common/ConfirmProvider';
import './RehabPlanTemplatePreview.css';

interface RehabPlanTemplatePreviewProps {
    seeker: Seeker;
    planText: string;
    meetingText: string;
}

type NestedSection = 'approval' | 'client' | 'background' | 'opinions' | 'caseMeeting' | 'footer';
type ExportFormat = 'pdf' | 'png' | 'docx';

function PreviewValue({ value }: { value: string }) {
    return <div className={value.trim() ? 'rehab-plan-value' : 'rehab-plan-value is-missing'}>{value.trim() || '추가 입력 필요'}</div>;
}

function EditField({
    label,
    value,
    onChange,
    multiline = false,
    placeholder = '추가 입력 필요',
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="block text-xs font-bold text-white/60 mb-1.5">{label}</span>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={event => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="textarea-field !min-h-[88px] !resize-y text-sm leading-relaxed"
                />
            ) : (
                <input
                    value={value}
                    onChange={event => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="input-field text-sm"
                />
            )}
        </label>
    );
}

function EditGroup({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
    return (
        <details open={open} className="rounded-2xl border border-white/10 bg-white/[0.025] overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black text-white/80 bg-white/[0.035] select-none">
                {title}
            </summary>
            <div className="p-4 space-y-3">{children}</div>
        </details>
    );
}

function RehabPlanDocument({ data, documentRef }: { data: RehabPlanFormData; documentRef: React.RefObject<HTMLDivElement> }) {
    return (
        <div ref={documentRef} className="rehab-plan-document rehab-plan-print-root" lang="ko">
            <div className="rehab-plan-title-row">
                <h1>직업재활계획수립 및 사례회의</h1>
                <table className="rehab-plan-approval-table" aria-label="결재란">
                    <tbody>
                        <tr>
                            <th rowSpan={2}>결<br />재</th>
                            <th>팀장</th>
                            <th>부서장</th>
                            <th>국장</th>
                        </tr>
                        <tr>
                            <td><PreviewValue value={data.approval.teamLead} /></td>
                            <td><PreviewValue value={data.approval.departmentHead} /></td>
                            <td><PreviewValue value={data.approval.director} /></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <table className="rehab-plan-form-table" aria-label="직업재활계획서 양식">
                <colgroup>
                    <col className="rehab-plan-col-section" />
                    <col className="rehab-plan-col-label" />
                    <col />
                    <col className="rehab-plan-col-label" />
                    <col />
                    <col className="rehab-plan-col-label" />
                    <col />
                </colgroup>
                <tbody>
                    <tr>
                        <th colSpan={2}>성 명</th>
                        <td><PreviewValue value={data.client.name} /></td>
                        <th>장애유형(중/경증)</th>
                        <td><PreviewValue value={data.client.disabilityType} /></td>
                        <th>생년월일</th>
                        <td><PreviewValue value={data.client.birthDate} /></td>
                    </tr>
                    <tr>
                        <th colSpan={2}>주 소</th>
                        <td colSpan={3}><PreviewValue value={data.client.address} /></td>
                        <th>연락처</th>
                        <td><PreviewValue value={data.client.phone} /></td>
                    </tr>

                    <tr>
                        <th rowSpan={8} className="rehab-plan-vertical-label">배 경 정 보</th>
                        <th>교육</th>
                        <td colSpan={5}><PreviewValue value={data.background.education} /></td>
                    </tr>
                    <tr><th>훈련</th><td colSpan={5}><PreviewValue value={data.background.training} /></td></tr>
                    <tr><th>장애력</th><td colSpan={5}><PreviewValue value={data.background.disabilityHistory} /></td></tr>
                    <tr><th>취업 / 경력</th><td colSpan={5}><PreviewValue value={data.background.employmentHistory} /></td></tr>
                    <tr><th>직업에 있어 당사자에게 중요한 점</th><td colSpan={5}><PreviewValue value={data.background.importantWorkValue} /></td></tr>
                    <tr><th>취업 / 욕구</th><td colSpan={5}><PreviewValue value={data.background.employmentNeeds} /></td></tr>
                    <tr><th>가정 / 환경</th><td colSpan={5}><PreviewValue value={data.background.familyEnvironment} /></td></tr>
                    <tr><th>기타 / 정보</th><td colSpan={5}><PreviewValue value={data.background.otherInfo} /></td></tr>

                    <tr>
                        <th colSpan={2}>당사자 및<br />보호자 의견</th>
                        <td colSpan={5}><PreviewValue value={data.opinions.clientAndGuardian} /></td>
                    </tr>

                    <tr>
                        <th rowSpan={8} className="rehab-plan-vertical-label">사 례 회 의</th>
                        <th>일시</th>
                        <td colSpan={2}><PreviewValue value={data.caseMeeting.dateTime} /></td>
                        <th>장소</th>
                        <td colSpan={2}><PreviewValue value={data.caseMeeting.place} /></td>
                    </tr>
                    <tr><th>목적</th><td colSpan={5}><PreviewValue value={data.caseMeeting.purpose} /></td></tr>
                    <tr className="rehab-plan-breakable-row"><th>내용</th><td colSpan={5}><PreviewValue value={data.caseMeeting.content} /></td></tr>
                    <tr className="rehab-plan-breakable-row"><th>결론</th><td colSpan={5}><PreviewValue value={data.caseMeeting.conclusion} /></td></tr>
                    <tr className="rehab-plan-breakable-row"><th>강점</th><td colSpan={5}><PreviewValue value={data.strengths} /></td></tr>
                    <tr className="rehab-plan-breakable-row"><th>고려사항</th><td colSpan={5}><PreviewValue value={data.considerations} /></td></tr>
                    <tr className="rehab-plan-breakable-row"><th>결과 및<br />지원방향</th><td colSpan={5}><PreviewValue value={data.supportDirection} /></td></tr>
                    <tr><th>비고</th><td colSpan={5}><PreviewValue value={data.note} /></td></tr>

                    <tr>
                        <th colSpan={2}>직업목표</th>
                        <td colSpan={5}><PreviewValue value={data.vocationalGoal} /></td>
                    </tr>
                </tbody>
            </table>

            <table className="rehab-plan-goal-table" aria-label="직업재활 목표">
                <colgroup>
                    <col className="rehab-plan-goal-col-long" />
                    <col className="rehab-plan-goal-col-short" />
                    <col className="rehab-plan-goal-col-period" />
                    <col className="rehab-plan-goal-col-method" />
                    <col className="rehab-plan-goal-col-status" />
                </colgroup>
                <thead>
                    <tr>
                        <th>장기목표</th>
                        <th>단기목표</th>
                        <th>서비스 기간</th>
                        <th>수행방법/담당자</th>
                        <th>목표달성여부</th>
                    </tr>
                </thead>
                <tbody>
                    {data.goals.map((goal, index) => (
                        <tr key={`goal-preview-${index}`} className="rehab-plan-breakable-row">
                            <td><PreviewValue value={goal.longTermGoal} /></td>
                            <td><PreviewValue value={goal.shortTermGoal} /></td>
                            <td><PreviewValue value={goal.servicePeriod} /></td>
                            <td><PreviewValue value={goal.methodsAndStaff} /></td>
                            <td className="rehab-plan-achievement">
                                <span className={goal.achieved === true ? 'is-selected' : ''}>예</span>
                                <span className={goal.achieved === false ? 'is-selected' : ''}>아니오</span>
                                <span className={goal.achieved === null ? 'is-selected' : ''}>미확인</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <table className="rehab-plan-footer-table" aria-label="작성 정보">
                <tbody>
                    <tr>
                        <th>담당자</th><td><PreviewValue value={data.footer.staff} /></td>
                        <th>작성일자</th><td><PreviewValue value={data.footer.writtenDate} /></td>
                        <th>참석자</th><td><PreviewValue value={data.footer.participants} /></td>
                        <th>이용자</th><td><PreviewValue value={data.footer.clientName} /></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export function RehabPlanTemplatePreview({ seeker, planText, meetingText }: RehabPlanTemplatePreviewProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [formData, setFormData] = useState<RehabPlanFormData>(() => mapRehabPlanFormData(seeker, planText, meetingText));
    const [exporting, setExporting] = useState<ExportFormat | null>(null);
    const [pendingExport, setPendingExport] = useState<ExportFormat | null>(null);
    const [exportError, setExportError] = useState('');
    const [exportNotice, setExportNotice] = useState('');
    const previewRef = useRef<HTMLDivElement>(null);
    const mappedSourceRef = useRef('');
    const confirm = useConfirm();
    const sourceSignature = `${seeker.id || seeker.seekerId || seeker.name}\u0000${planText}\u0000${meetingText}`;

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            // 확인창이 먼저 Escape를 처리(preventDefault)한 경우 미리보기까지 닫지 않습니다.
            if (event.key !== 'Escape' || exporting || event.defaultPrevented) return;
            if (pendingExport) setPendingExport(null);
            else setIsOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen, exporting, pendingExport]);

    const openPreview = () => {
        if (mappedSourceRef.current !== sourceSignature) {
            setFormData(mapRehabPlanFormData(seeker, planText, meetingText));
            mappedSourceRef.current = sourceSignature;
        }
        setExportError('');
        setExportNotice('');
        setPendingExport(null);
        setIsOpen(true);
    };

    const remap = async () => {
        const ok = await confirm({
            title: '자동 매핑 다시 적용',
            message: '현재 편집한 매핑값을 지우고 이용자 정보와 작성 본문에서 다시 자동 매핑할까요?',
            confirmLabel: '다시 매핑', tone: 'danger',
        });
        if (!ok) return;
        setFormData(mapRehabPlanFormData(seeker, planText, meetingText));
        mappedSourceRef.current = sourceSignature;
        setExportError('');
        setExportNotice('자동 매핑을 다시 적용했습니다.');
    };

    const updateNested = (section: NestedSection, field: string, value: string) => {
        setFormData(previous => ({
            ...previous,
            [section]: { ...previous[section], [field]: value },
        } as RehabPlanFormData));
    };

    const updateTopLevel = (field: 'strengths' | 'considerations' | 'supportDirection' | 'note' | 'vocationalGoal', value: string) => {
        setFormData(previous => ({ ...previous, [field]: value }));
    };

    const updateGoal = <K extends keyof RehabPlanGoal>(index: number, field: K, value: RehabPlanGoal[K]) => {
        setFormData(previous => ({
            ...previous,
            goals: previous.goals.map((goal, goalIndex) => goalIndex === index ? { ...goal, [field]: value } : goal),
        }));
    };

    const addGoal = () => setFormData(previous => ({ ...previous, goals: [...previous.goals, createEmptyRehabPlanGoal()] }));
    const removeGoal = (index: number) => {
        setFormData(previous => ({
            ...previous,
            goals: previous.goals.length > 1 ? previous.goals.filter((_, goalIndex) => goalIndex !== index) : previous.goals,
        }));
    };

    const handlePdf = async () => {
        if (!previewRef.current || exporting) return;
        setExporting('pdf');
        setExportError('');
        setExportNotice('');
        try {
            const result = await printElementAsPdf(previewRef.current, `직업재활계획서_${localDateKey()}`);
            if (result?.canceled) return;
            setExportNotice(result ? savedLocationMessage(result) : '인쇄 창에서 프린터를 “PDF로 저장”으로 선택해 주세요.');
        } catch (error: any) {
            setExportError(error?.message || 'PDF 출력 준비에 실패했습니다. 기존 작성 내용은 유지됩니다.');
        } finally {
            setExporting(null);
        }
    };

    const handlePng = async () => {
        if (!previewRef.current || exporting) return;
        setExporting('png');
        setExportError('');
        setExportNotice('');
        try {
            const result = await downloadElementAsPng(previewRef.current, `직업재활계획서_${localDateKey()}.png`);
            if (result.canceled) return;
            setExportNotice(savedLocationMessage(result, '현재 미리보기 전체 PNG 다운로드를 시작했습니다.'));
        } catch (error: any) {
            setExportError(error?.message || 'PNG 생성에 실패했습니다. 기존 작성 내용은 유지됩니다.');
        } finally {
            setExporting(null);
        }
    };

    const handleDocx = async () => {
        if (exporting) return;
        setExporting('docx');
        setExportError('');
        setExportNotice('');
        try {
            const result = await downloadRehabPlanAsDocx(formData, `직업재활계획서_${localDateKey()}.docx`);
            if (result.canceled) return;
            setExportNotice(savedLocationMessage(result, '현재 입력값의 Word 문서 다운로드를 시작했습니다.'));
        } catch (error: any) {
            setExportError(error?.message || 'Word 문서 생성에 실패했습니다. 기존 작성 내용은 유지됩니다. PDF 또는 이미지 저장 기능은 계속 사용할 수 있습니다.');
        } finally {
            setExporting(null);
        }
    };

    const runExport = (format: ExportFormat) => {
        if (format === 'pdf') void handlePdf();
        else if (format === 'png') void handlePng();
        else void handleDocx();
    };

    const requestExport = (format: ExportFormat) => {
        if (exporting) return;
        const warnings = getRehabPlanExportWarnings(formData);
        if (warnings.length) {
            setPendingExport(format);
            return;
        }
        runExport(format);
    };

    const reviewWarnings = pendingExport ? getRehabPlanExportWarnings(formData) : [];

    return (
        <>
            <section className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.07] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h5 className="font-black text-sky-100 flex items-center gap-2">
                            <Eye className="w-4 h-4" /> 직업재활계획서 양식 출력
                        </h5>
                        <p className="text-xs text-white/45 mt-1 leading-relaxed">
                            작성 결과와 이용자 정보를 첨부 양식에 자동 매핑한 뒤 직접 수정하고 출력할 수 있습니다.
                        </p>
                    </div>
                    <button type="button" onClick={openPreview} className="btn-secondary !py-2.5 !px-4 flex items-center justify-center gap-2 text-sm shrink-0">
                        <Eye className="w-4 h-4" /> 양식 미리보기
                    </button>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-amber-200/75 flex items-start gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    직업재활계획서에는 개인정보와 민감한 상담 내용이 포함될 수 있습니다. PDF, 이미지 또는 Word 문서 공유 전 수신자와 포함 내용을 반드시 확인해 주세요.
                </p>
            </section>

            {isOpen && (
                <div className="rehab-plan-modal-overlay" role="dialog" aria-modal="true" aria-label="직업재활계획서 양식 미리보기">
                    <div className="rehab-plan-modal-shell">
                        <header className="rehab-plan-modal-header">
                            <div>
                                <h2 className="text-xl font-black text-white">직업재활계획서 양식 미리보기</h2>
                                <p className="text-xs text-white/40 mt-1">왼쪽 매핑값을 수정하면 오른쪽 출력 양식에 즉시 반영됩니다.</p>
                            </div>
                            <button type="button" onClick={() => !exporting && setIsOpen(false)} disabled={!!exporting} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-40" title="닫기">
                                <X className="w-5 h-5" />
                            </button>
                        </header>

                        <div className="rehab-plan-toolbar">
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => { void remap(); }} disabled={!!exporting} className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-2">
                                    <RotateCcw className="w-3.5 h-3.5" /> 자동 매핑 다시 적용
                                </button>
                                <button type="button" onClick={() => requestExport('pdf')} disabled={!!exporting} className="btn-primary !py-2 !px-3 text-xs flex items-center gap-2">
                                    {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                                    PDF 다운로드
                                </button>
                                <button type="button" onClick={() => requestExport('png')} disabled={!!exporting} className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-2">
                                    {exporting === 'png' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                                    이미지 다운로드
                                </button>
                                <button type="button" onClick={() => requestExport('docx')} disabled={!!exporting} className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-2">
                                    {exporting === 'docx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                    Word(DOCX) 저장
                                </button>
                            </div>
                            <p className="text-[11px] text-amber-200/70 flex items-start gap-1.5 max-w-xl">
                                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> 출력은 현재 기기에서만 처리됩니다. 외부 공유 전 개인정보와 상담 내용을 확인해 주세요.
                            </p>
                        </div>

                        {pendingExport && (
                            <div className="rehab-plan-review-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="rehab-plan-review-title">
                                <div className="rehab-plan-review-dialog">
                                    <div>
                                        <h3 id="rehab-plan-review-title" className="text-lg font-black text-white">출력 전 확인</h3>
                                        <p className="mt-1 text-xs leading-relaxed text-white/50">누락된 항목을 확인해 주세요. 내용은 자동으로 변경되지 않습니다.</p>
                                    </div>
                                    <ul className="rehab-plan-review-list">
                                        {reviewWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                                    </ul>
                                    <p className="text-xs leading-relaxed text-amber-200/80 flex items-start gap-2">
                                        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                                        직업재활계획서에는 개인정보와 민감한 상담 내용이 포함될 수 있습니다. 외부 공유 전 수신자와 포함 내용을 반드시 확인해 주세요.
                                    </p>
                                    <p className="text-sm font-bold text-white/80">그래도 출력하시겠습니까?</p>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button type="button" onClick={() => setPendingExport(null)} className="btn-secondary !py-2 !px-4 text-xs">돌아가서 수정</button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const format = pendingExport;
                                                setPendingExport(null);
                                                runExport(format);
                                            }}
                                            className="btn-primary !py-2 !px-4 text-xs"
                                        >
                                            계속 출력
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(exportError || exportNotice) && (
                            <div className={`mx-4 mt-3 rounded-xl border px-4 py-2.5 text-xs ${exportError ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}>
                                {exportError || exportNotice}
                            </div>
                        )}

                        <div className="rehab-plan-modal-content">
                            <aside className="rehab-plan-editor-pane">
                                <EditGroup title="이용자 기본정보" open>
                                    <EditField label="성명" value={formData.client.name} onChange={value => updateNested('client', 'name', value)} />
                                    <EditField label="장애유형(중/경증)" value={formData.client.disabilityType} onChange={value => updateNested('client', 'disabilityType', value)} />
                                    <EditField label="생년월일" value={formData.client.birthDate} onChange={value => updateNested('client', 'birthDate', value)} />
                                    <EditField label="주소" value={formData.client.address} onChange={value => updateNested('client', 'address', value)} />
                                    <EditField label="연락처" value={formData.client.phone} onChange={value => updateNested('client', 'phone', value)} />
                                </EditGroup>

                                <EditGroup title="배경정보">
                                    <EditField label="교육" value={formData.background.education} onChange={value => updateNested('background', 'education', value)} multiline />
                                    <EditField label="훈련" value={formData.background.training} onChange={value => updateNested('background', 'training', value)} multiline />
                                    <EditField label="장애력" value={formData.background.disabilityHistory} onChange={value => updateNested('background', 'disabilityHistory', value)} multiline />
                                    <EditField label="취업경력" value={formData.background.employmentHistory} onChange={value => updateNested('background', 'employmentHistory', value)} multiline />
                                    <EditField label="직업에 있어 당사자에게 중요한 점" value={formData.background.importantWorkValue} onChange={value => updateNested('background', 'importantWorkValue', value)} multiline />
                                    <EditField label="취업욕구" value={formData.background.employmentNeeds} onChange={value => updateNested('background', 'employmentNeeds', value)} multiline />
                                    <EditField label="가정환경" value={formData.background.familyEnvironment} onChange={value => updateNested('background', 'familyEnvironment', value)} multiline />
                                    <EditField label="기타정보" value={formData.background.otherInfo} onChange={value => updateNested('background', 'otherInfo', value)} multiline />
                                </EditGroup>

                                <EditGroup title="당사자 의견 및 사례회의">
                                    <EditField label="당사자 및 보호자 의견" value={formData.opinions.clientAndGuardian} onChange={value => updateNested('opinions', 'clientAndGuardian', value)} multiline />
                                    <EditField label="사례회의 일시" value={formData.caseMeeting.dateTime} onChange={value => updateNested('caseMeeting', 'dateTime', value)} />
                                    <EditField label="사례회의 장소" value={formData.caseMeeting.place} onChange={value => updateNested('caseMeeting', 'place', value)} />
                                    <EditField label="사례회의 목적" value={formData.caseMeeting.purpose} onChange={value => updateNested('caseMeeting', 'purpose', value)} multiline />
                                    <EditField label="사례회의 내용" value={formData.caseMeeting.content} onChange={value => updateNested('caseMeeting', 'content', value)} multiline />
                                    <EditField label="사례회의 결론" value={formData.caseMeeting.conclusion} onChange={value => updateNested('caseMeeting', 'conclusion', value)} multiline />
                                </EditGroup>

                                <EditGroup title="계획 핵심내용">
                                    <EditField label="강점" value={formData.strengths} onChange={value => updateTopLevel('strengths', value)} multiline />
                                    <EditField label="고려사항" value={formData.considerations} onChange={value => updateTopLevel('considerations', value)} multiline />
                                    <EditField label="결과 및 지원방향" value={formData.supportDirection} onChange={value => updateTopLevel('supportDirection', value)} multiline />
                                    <EditField label="비고" value={formData.note} onChange={value => updateTopLevel('note', value)} multiline />
                                    <EditField label="직업목표" value={formData.vocationalGoal} onChange={value => updateTopLevel('vocationalGoal', value)} multiline />
                                </EditGroup>

                                <EditGroup title={`목표 및 수행방법 (${formData.goals.length}개)`}>
                                    {formData.goals.map((goal, index) => (
                                        <div key={`goal-editor-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-white/70">목표 {index + 1}</span>
                                                <button type="button" onClick={() => removeGoal(index)} disabled={formData.goals.length === 1} className="p-1.5 rounded-lg text-red-300/70 hover:bg-red-400/10 disabled:opacity-30" title="목표 삭제">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <EditField label="장기목표" value={goal.longTermGoal} onChange={value => updateGoal(index, 'longTermGoal', value)} multiline />
                                            <EditField label="단기목표" value={goal.shortTermGoal} onChange={value => updateGoal(index, 'shortTermGoal', value)} multiline />
                                            <EditField label="서비스 기간" value={goal.servicePeriod} onChange={value => updateGoal(index, 'servicePeriod', value)} />
                                            <EditField label="수행방법/담당자" value={goal.methodsAndStaff} onChange={value => updateGoal(index, 'methodsAndStaff', value)} multiline />
                                            <label className="block">
                                                <span className="block text-xs font-bold text-white/60 mb-1.5">목표달성여부</span>
                                                <select
                                                    value={goal.achieved === true ? 'yes' : goal.achieved === false ? 'no' : 'unknown'}
                                                    onChange={event => updateGoal(index, 'achieved', event.target.value === 'yes' ? true : event.target.value === 'no' ? false : null)}
                                                    className="input-field text-sm"
                                                >
                                                    <option value="unknown">미확인</option>
                                                    <option value="yes">예</option>
                                                    <option value="no">아니오</option>
                                                </select>
                                            </label>
                                        </div>
                                    ))}
                                    <button type="button" onClick={addGoal} className="w-full py-2.5 rounded-xl border border-dashed border-white/15 text-xs font-bold text-white/50 hover:bg-white/5 hover:text-white/80 flex items-center justify-center gap-2">
                                        <Plus className="w-3.5 h-3.5" /> 목표 추가
                                    </button>
                                </EditGroup>

                                <EditGroup title="결재 및 작성정보">
                                    <EditField label="팀장" value={formData.approval.teamLead} onChange={value => updateNested('approval', 'teamLead', value)} />
                                    <EditField label="부서장" value={formData.approval.departmentHead} onChange={value => updateNested('approval', 'departmentHead', value)} />
                                    <EditField label="국장" value={formData.approval.director} onChange={value => updateNested('approval', 'director', value)} />
                                    <EditField label="담당자" value={formData.footer.staff} onChange={value => updateNested('footer', 'staff', value)} />
                                    <EditField label="작성일자" value={formData.footer.writtenDate} onChange={value => updateNested('footer', 'writtenDate', value)} />
                                    <EditField label="참석자" value={formData.footer.participants} onChange={value => updateNested('footer', 'participants', value)} multiline />
                                    <EditField label="이용자" value={formData.footer.clientName} onChange={value => updateNested('footer', 'clientName', value)} />
                                </EditGroup>
                            </aside>

                            <main className="rehab-plan-preview-pane">
                                <div className="rehab-plan-preview-scroll">
                                    <RehabPlanDocument data={formData} documentRef={previewRef} />
                                </div>
                            </main>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
