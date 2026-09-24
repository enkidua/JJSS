import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileDown, Info, Package } from 'lucide-react';
import { validateCase, type SupportedEmploymentCase } from '../../../features/supportedEmployment/model';
import {
    buildDocumentFileName,
    SUPPORTED_EMPLOYMENT_DOCUMENTS,
    type DocumentOptions,
    type SupportedEmploymentDocumentKind,
} from '../../../features/supportedEmployment/docs/builders';
import { saveJjssBlob, saveJjssPdf } from '../../../utils/jjssFileService';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import type { CaseUpdater } from './BasicInfoSection';

interface Props {
    draft: SupportedEmploymentCase;
    update: CaseUpdater;
    dirty: boolean;
    onBusyChange: (busy: boolean) => void;
}

/** 결과보고 4종: 직무지도원 출근부를 뺀 앞의 4가지(기관 제출용). 전체 5종은 출근부 포함. */
const REPORT_KINDS: SupportedEmploymentDocumentKind[] = SUPPORTED_EMPLOYMENT_DOCUMENTS.filter(item => item.kind !== 'coachTimesheet').map(item => item.kind);
const ALL_KINDS: SupportedEmploymentDocumentKind[] = SUPPORTED_EMPLOYMENT_DOCUMENTS.map(item => item.kind);

const ISSUE_STYLE = {
    error: { icon: AlertTriangle, className: 'text-red-200', label: '고쳐야 함' },
    warning: { icon: AlertTriangle, className: 'text-amber-200', label: '확인 필요' },
    info: { icon: Info, className: 'text-white/65', label: '안내' },
} as const;

// 서류 모듈(docx)은 출력할 때만 불러옵니다(고용지원 화면을 가볍게 유지).
const loadDocs = () => import('../../../features/supportedEmployment/docs');

/** 결과보고 출력(D-2 #6, D-5 묶음 출력) */
export function OutputPanel({ draft, update, dirty, onBusyChange }: Props) {
    const confirm = useConfirm();
    const showToast = useAppToast();
    const [documentDate, setDocumentDate] = useState('');
    const [busy, setBusy] = useState(false);
    const [previewKind, setPreviewKind] = useState<SupportedEmploymentDocumentKind | null>(null);
    const [previewHtml, setPreviewHtml] = useState('');
    const issues = useMemo(() => validateCase(draft), [draft]);
    const errors = issues.filter(issue => issue.level === 'error');
    const warnings = issues.filter(issue => issue.level === 'warning');
    const options = draft.documentOptions || { organizationName: '', staffName: '', coachDaysBasis: 'scheduled' as const };
    const docOptions: DocumentOptions = {
        organizationName: options.organizationName.trim() || undefined,
        staffName: options.staffName.trim() || undefined,
        documentDate: documentDate || undefined,
        coachDaysBasis: options.coachDaysBasis,
    };
    const blocked = errors.length > 0;

    const setOption = (patch: Partial<typeof options>) => update(c => ({
        ...c, documentOptions: { ...(c.documentOptions || { organizationName: '', staffName: '', coachDaysBasis: 'scheduled' }), ...patch },
    }));

    const run = async (task: () => Promise<void>) => {
        if (busy) return;
        if (blocked) { showToast('먼저 "고쳐야 함" 항목을 고쳐 주세요.', 'error'); return; }
        if (warnings.length && !(await confirm({
            title: '확인 필요 항목',
            message: `확인 필요 항목이 ${warnings.length}건 있습니다. 그대로 출력할까요?`,
            confirmLabel: '계속 출력', cancelLabel: '돌아가서 확인',
        }))) return;
        setBusy(true);
        onBusyChange(true);
        try {
            await task();
        } catch (error) {
            showToast(error instanceof Error ? error.message : '서류를 저장하지 못했습니다.', 'error');
        } finally {
            setBusy(false);
            onBusyChange(false);
        }
    };

    const saveDocx = async (kind: SupportedEmploymentDocumentKind, numbered = false) => {
        const docs = await loadDocs();
        const blob = await docs.packDocument(docs.buildDocument(kind, draft, docOptions));
        return saveJjssBlob('case-management', buildDocumentFileName(kind, draft, { numbered, date: documentDate || undefined }), blob);
    };

    const handleDocx = (kind: SupportedEmploymentDocumentKind) => run(async () => {
        const result = await saveDocx(kind);
        if (result.canceled) showToast('저장을 취소했습니다.', 'info');
        else showToast('DOCX 파일을 저장했습니다.', 'success');
    });

    const handlePdf = (kind: SupportedEmploymentDocumentKind) => run(async () => {
        const docs = await loadDocs();
        const html = docs.buildHtmlPreview(draft, kind, docOptions);
        const result = await saveJjssPdf('case-management', buildDocumentFileName(kind, draft, { extension: 'pdf', date: documentDate || undefined }), html);
        if (!result) {
            setPreviewKind(kind);
            setPreviewHtml(html);
            showToast('PDF 저장은 Windows 설치형 JJSS에서 사용할 수 있습니다. 아래 미리보기를 확인해 주세요.', 'info');
            return;
        }
        if (result.canceled) showToast('저장을 취소했습니다.', 'info');
        else showToast('PDF 파일을 저장했습니다.', 'success');
    });

    // 묶음은 번호 붙은 DOCX들을 ZIP 한 파일로 만들어 저장 위치를 한 번만 묻습니다.
    const handleBundle = (kinds: SupportedEmploymentDocumentKind[], label: string) => run(async () => {
        const [docs, { default: JSZip }] = await Promise.all([loadDocs(), import('jszip')]);
        const zip = new JSZip();
        for (const kind of kinds) {
            const blob = await docs.packDocument(docs.buildDocument(kind, draft, docOptions));
            zip.file(buildDocumentFileName(kind, draft, { numbered: true, date: documentDate || undefined }), blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const baseName = buildDocumentFileName(kinds[0], draft, { date: documentDate || undefined }).replace(/\.docx$/, '');
        const zipName = baseName.replace(/^지원고용_[^_]+/, `지원고용_${label.replace(/\s+/g, '')}`) + '.zip';
        const result = await saveJjssBlob('case-management', zipName, zipBlob);
        if (result.canceled) showToast('저장을 취소했습니다.', 'info');
        else showToast(`${label} ${kinds.length}건을 ZIP 파일 하나로 저장했습니다.`, 'success');
    });

    const handlePreview = async (kind: SupportedEmploymentDocumentKind) => {
        if (previewKind === kind) { setPreviewKind(null); setPreviewHtml(''); return; }
        try {
            const docs = await loadDocs();
            setPreviewHtml(docs.buildHtmlPreview(draft, kind, docOptions));
            setPreviewKind(kind);
        } catch {
            showToast('미리보기를 만들지 못했습니다.', 'error');
        }
    };

    return <section className="glass-card !p-5" aria-labelledby="se-output-title">
        <h3 id="se-output-title" className="text-lg font-bold text-white">결과보고 출력</h3>
        <p className="text-xs text-white/55 mt-1">파일 이름에는 이용자 이름을 넣지 않습니다(예: 지원고용_결과보고_14차_2026-08-19.docx). 서명·직인 칸은 비워 두니 출력 후 직접 서명해 주세요.</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
            <label className="text-sm text-white/75" htmlFor="se-org-name">기관명
                <input id="se-org-name" className="input-field mt-1" value={options.organizationName} maxLength={60}
                    onChange={e => setOption({ organizationName: e.target.value })} />
            </label>
            <label className="text-sm text-white/75" htmlFor="se-staff-name">담당자
                <input id="se-staff-name" className="input-field mt-1" value={options.staffName} maxLength={30}
                    onChange={e => setOption({ staffName: e.target.value })} />
            </label>
            <label className="text-sm text-white/75" htmlFor="se-doc-date">작성일(비우면 훈련 종료일)
                <input id="se-doc-date" type="date" className="input-field mt-1" value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
            </label>
            <label className="text-sm text-white/75" htmlFor="se-coach-basis">직무지도원수당 기준
                <select id="se-coach-basis" className="input-field mt-1" value={options.coachDaysBasis}
                    onChange={e => setOption({ coachDaysBasis: e.target.value === 'attended' ? 'attended' : 'scheduled' })}>
                    <option value="scheduled">편성된 훈련일 전체(기본)</option>
                    <option value="attended">훈련생 출석일만</option>
                </select>
            </label>
        </div>
        <p className="text-xs text-white/45 mt-1">기관명·담당자는 이 회차에 함께 저장되고, 다음 회차로 복사할 때도 이어집니다.</p>

        <div className="mt-4" aria-live="polite">
            <h4 className="text-base font-bold text-white">출력 전 확인</h4>
            {errors.length === 0 && warnings.length === 0 && <p className="text-sm text-emerald-200 mt-1 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> 필수 항목이 모두 입력되었습니다.</p>}
            <ul className="mt-2 space-y-1">
                {issues.map((issue, index) => {
                    const style = ISSUE_STYLE[issue.level];
                    const Icon = style.icon;
                    return <li key={index} className={`text-sm flex items-start gap-2 ${style.className}`}>
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <span><span className="font-bold">{style.label}</span> · {issue.message}</span>
                    </li>;
                })}
            </ul>
            {blocked && <p role="alert" className="text-sm text-red-200 mt-2">
                "고쳐야 함" {errors.length}건이 있어 출력할 수 없습니다. 서류에 꼭 들어가야 하는 이용자·사업체·기간·계좌·지도원 정보가 빠지면 제출 서류로 쓸 수 없기 때문입니다.
            </p>}
            {dirty && <p className="text-xs text-amber-200 mt-2">저장하지 않은 변경이 있습니다. 출력은 지금 화면의 내용으로 만들어집니다.</p>}
        </div>

        <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10">
            {SUPPORTED_EMPLOYMENT_DOCUMENTS.map(item => <li key={item.kind} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-white/85">{item.label}</span>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs flex items-center gap-1" disabled={busy || blocked}
                            aria-label={`${item.label} DOCX 저장`} onClick={() => void handleDocx(item.kind)}>
                            <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> DOCX 저장
                        </button>
                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs flex items-center gap-1" disabled={busy || blocked}
                            aria-label={`${item.label} PDF 저장`} onClick={() => void handlePdf(item.kind)}>
                            <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> PDF 저장
                        </button>
                        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs flex items-center gap-1" aria-expanded={previewKind === item.kind}
                            aria-label={`${item.label} 미리보기`} onClick={() => void handlePreview(item.kind)}>
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" /> 미리보기
                        </button>
                    </div>
                </div>
                {previewKind === item.kind && previewHtml && <iframe title={`${item.label} 미리보기`} sandbox="" srcDoc={previewHtml}
                    className="w-full h-[600px] mt-2 rounded-lg bg-white" />}
            </li>)}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !px-4 !py-2 text-sm flex items-center gap-2" disabled={busy || blocked}
                onClick={() => void handleBundle(REPORT_KINDS, '결과보고 4종')}>
                <Package className="w-4 h-4" aria-hidden="true" /> 결과보고 4종 묶음
            </button>
            <button type="button" className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-2" disabled={busy || blocked}
                onClick={() => void handleBundle(ALL_KINDS, '전체 5종')}>
                <Package className="w-4 h-4" aria-hidden="true" /> 전체 5종 묶음
            </button>
            {busy && <span role="status" className="text-sm text-white/60 self-center">서류를 만드는 중...</span>}
        </div>
        <p className="text-xs text-white/45 mt-2">묶음은 ZIP 파일 하나로 저장됩니다. 압축을 풀면 파일 이름 앞 번호(01_~05_) 순서로 정리되어 있습니다.</p>
    </section>;
}
