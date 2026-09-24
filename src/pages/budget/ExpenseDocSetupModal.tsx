import type { Dispatch, SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, Plus, Trash2, X } from 'lucide-react';
import type { ExpenseDocumentSettings } from '../../types/budget';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface ExpenseDocSetupModalProps {
    docForm: ExpenseDocumentSettings;
    onDocFormChange: Dispatch<SetStateAction<ExpenseDocumentSettings>>;
    selectedCount: number;
    visibleSelectedCount: number;
    hiddenSelectedCount: number;
    selectedTotal: number;
    onClearSelection: () => void;
    onPreview: () => void;
    onClose: () => void;
    /** 미리보기가 위에 열려 있으면 이 창의 키보드 처리(Esc·Tab)를 잠시 멈춥니다. */
    previewOpen: boolean;
}

/** 지출품의서 기관명·제목·결재선 설정. */
export default function ExpenseDocSetupModal({
    docForm,
    onDocFormChange,
    selectedCount,
    visibleSelectedCount,
    hiddenSelectedCount,
    selectedTotal,
    onClearSelection,
    onPreview,
    onClose,
    previewOpen,
}: ExpenseDocSetupModalProps) {
    const dialogRef = useDialogFocus(!previewOpen, onClose);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="expense-doc-setup-title"
                tabIndex={-1}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0f1129] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 id="expense-doc-setup-title" className="text-xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary-400" />
                        지출품의서 생성
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60" aria-label="지출품의서 설정 닫기">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="expense-doc-center" className="block text-sm font-medium text-white/70 mb-1.5">기관명 *</label>
                        <input
                            id="expense-doc-center"
                            type="text"
                            placeholder="예: ○○ 직업재활센터"
                            value={docForm.centerName}
                            onChange={e => onDocFormChange(prev => ({ ...prev, centerName: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor="expense-doc-title" className="block text-sm font-medium text-white/70 mb-1.5">제목 *</label>
                        <input
                            id="expense-doc-title"
                            type="text"
                            placeholder="예: 20XX년 XX월 프로그램 운영비 지출"
                            value={docForm.title}
                            onChange={e => onDocFormChange(prev => ({ ...prev, title: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor="expense-doc-purpose" className="block text-sm font-medium text-white/70 mb-1.5">목적/용도</label>
                        <textarea
                            id="expense-doc-purpose"
                            placeholder="지출 목적을 기재하세요"
                            value={docForm.purpose}
                            onChange={e => onDocFormChange(prev => ({ ...prev, purpose: e.target.value }))}
                            className="input-field min-h-[80px] resize-y"
                            rows={3}
                        />
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-1">
                            <p className="block text-sm font-medium text-white/70">결재선 (최대 5명)</p>
                            {docForm.approvers.length < 5 && (
                                <button
                                    onClick={() => onDocFormChange(prev => ({ ...prev, approvers: [...prev.approvers, { title: '직위', name: '' }] }))}
                                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> 결재자 추가
                                </button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {docForm.approvers.map((app, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="직위(예: 팀장)"
                                        aria-label={`결재자 ${idx + 1} 직위`}
                                        value={app.title}
                                        onChange={e => {
                                            onDocFormChange(prev => ({
                                                ...prev,
                                                approvers: prev.approvers.map((approver, index) => index === idx ? { ...approver, title: e.target.value } : approver),
                                            }));
                                        }}
                                        className="input-field !py-2 text-xs w-24"
                                    />
                                    <input
                                        type="text"
                                        placeholder="성명"
                                        aria-label={`결재자 ${idx + 1} 성명`}
                                        value={app.name}
                                        onChange={e => {
                                            onDocFormChange(prev => ({
                                                ...prev,
                                                approvers: prev.approvers.map((approver, index) => index === idx ? { ...approver, name: e.target.value } : approver),
                                            }));
                                        }}
                                        className="input-field !py-2 text-xs flex-1"
                                    />
                                    {docForm.approvers.length > 1 && (
                                        <button
                                            onClick={() => onDocFormChange(prev => ({ ...prev, approvers: prev.approvers.filter((_, i) => i !== idx) }))}
                                            className="p-1.5 text-white/30 hover:text-red-400 transition"
                                            aria-label={`결재자 ${idx + 1} 삭제`}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-white/50 text-sm">
                                선택된 지출 항목: <span className="text-primary-300 font-bold">{selectedCount}건</span>
                                {selectedCount > 0 && (
                                    <span className="ml-2">
                                        (합계: {selectedTotal.toLocaleString()}원)
                                    </span>
                                )}
                            </p>
                            {selectedCount > 0 && (
                                <button
                                    type="button"
                                    onClick={onClearSelection}
                                    className="shrink-0 text-xs text-white/50 underline decoration-white/25 underline-offset-4 hover:text-white"
                                >
                                    전체 선택 해제
                                </button>
                            )}
                        </div>
                        {selectedCount > 0 && (
                            <p className="mt-1 text-xs text-white/45">
                                현재 화면 {visibleSelectedCount}건 · 다른 필터 {hiddenSelectedCount}건 · 전체 {selectedCount}건
                            </p>
                        )}
                        {hiddenSelectedCount > 0 && (
                            <p className="mt-1 text-xs text-amber-200/80">
                                다른 필터에서 선택한 {hiddenSelectedCount}건도 이 지출품의서에 포함됩니다.
                            </p>
                        )}
                        {selectedCount === 0 && (
                            <p className="text-yellow-400/60 text-xs mt-1">목록에서 체크박스로 항목을 선택한 후 생성해주세요.</p>
                        )}
                    </div>
                    {(!docForm.centerName.trim() || !docForm.title.trim()) && (
                        <p className="text-xs text-white/45">기관명과 제목을 입력하면 미리보기를 볼 수 있습니다.</p>
                    )}
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onPreview}
                        disabled={selectedCount === 0 || !docForm.centerName.trim() || !docForm.title.trim()}
                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        지출품의서 미리보기
                    </button>
                    <button onClick={onClose} className="btn-secondary">
                        취소
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
