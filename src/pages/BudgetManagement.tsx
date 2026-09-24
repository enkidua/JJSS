import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, Plus, FileText, DollarSign, Search, Download, ShieldCheck, List, BarChart3 } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import type { BudgetProject, Expense, ExpenseDocumentSettings } from '../types/budget';
import ExpenseDocument from '../components/ExpenseDocument';
import { getExpenseBudgetItemDisplayName } from '../utils/budgetItemLinks';
import { safeErrorMetadata } from '../utils/safeError';
import { saveJjssBlob, savedLocationMessage } from '../utils/jjssFileService';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useConfirm } from '../components/common/ConfirmProvider';
import { useAppToast } from '../components/Toast';
import { localDateKey } from '../utils/date';
import { buildCsv, buildSummaryCsvRows, expenseListTotal, expenseTotal, findBudgetIssues, getBudgetStatus, normalizeBudgetItems, projectBalance, projectSpent } from './budget/budgetUtils';
import { useBudgetProjects } from './budget/useBudgetProjects';
import ProjectEditor from './budget/ProjectEditor';
import ProjectCards from './budget/ProjectCards';
import ExpenseTable from './budget/ExpenseTable';
import ExpenseFormModal from './budget/ExpenseFormModal';
import ExpenseDocSetupModal from './budget/ExpenseDocSetupModal';
import BudgetIntegrityPanel from './budget/BudgetIntegrityPanel';
import BudgetSummaryView from './budget/BudgetSummaryView';

function createDefaultDocForm(): ExpenseDocumentSettings {
    return {
        centerName: '',
        title: '',
        purpose: '',
        approvers: [
            { title: '담당', name: '' },
            { title: '팀장', name: '' },
            { title: '과장', name: '' },
        ],
    };
}

export default function BudgetManagement() {
    const { expenses, fetchExpenses, updateExpense, deleteExpense } = useDataStore();
    const showToast = useAppToast();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [expenseFormDirty, setExpenseFormDirty] = useState(false);
    // 열 때마다 새 key로 마운트해, 닫히는 애니메이션 중에 다시 열어도 이전 입력이 남지 않게 합니다.
    const [expenseModalSession, setExpenseModalSession] = useState(0);
    const expenseModalSessionRef = useRef(0);
    const [showDocModal, setShowDocModal] = useState(false);
    const [showDocPreview, setShowDocPreview] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('전체');
    const [selectedProjectId, setSelectedProjectId] = useState('전체');
    const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
    const [showIntegrity, setShowIntegrity] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'summary'>('list');
    const projectEditorRef = useRef<HTMLDivElement>(null);
    // 지출품의서 폼(설정 창을 닫아도 유지)
    const [docForm, setDocForm] = useState<ExpenseDocumentSettings>(createDefaultDocForm);

    const projects = useBudgetProjects({
        expenses,
        updateExpense,
        fetchExpenses,
        onBudgetItemsRemoved: removedItemIds => setFilterCategory(current => removedItemIds.has(current) ? '전체' : current),
        onProjectDeleted: projectId => setSelectedProjectId(current => current === projectId ? '전체' : current),
    });
    const { budgetProjects } = projects;

    // 작성 중인 지출 입력이나 사업 등록/수정 내용이 있으면 다른 메뉴로 이동할 때 확인합니다.
    useUnsavedGuard((showAddModal && expenseFormDirty) || projects.projectDirty);

    useEffect(() => {
        loadExpenses();
    }, []);

    useEffect(() => {
        setFilterCategory('전체');
    }, [selectedProjectId]);

    const loadExpenses = async () => {
        setLoading(true);
        try {
            await fetchExpenses();
        } catch (error: any) {
            showToast(error?.message || '지출 내역을 불러오는 중 오류가 발생했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const openExpenseModal = (expense: Expense | null) => {
        expenseModalSessionRef.current += 1;
        setExpenseModalSession(expenseModalSessionRef.current);
        setExpenseFormDirty(false);
        setEditingExpense(expense);
        setShowAddModal(true);
    };

    const openNewExpense = () => openExpenseModal(null);

    const handleEdit = (expense: Expense) => openExpenseModal(expense);

    const closeExpenseModal = () => {
        setShowAddModal(false);
        setExpenseFormDirty(false);
        setEditingExpense(null);
    };

    const handleDelete = async (id: string) => {
        if (!(await confirm({ title: '지출 삭제', message: '이 지출 내역을 삭제하시겠습니까?', confirmLabel: '삭제', cancelLabel: '취소', tone: 'danger' }))) return;
        try {
            await deleteExpense(id);
            setSelectedExpenses(previous => previous.filter(selectedId => selectedId !== id));
            showToast('지출 내역을 삭제했습니다.', 'success');
        } catch (error: any) {
            console.error('Delete Error:', safeErrorMetadata(error, 'expense-delete'));
            showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
    };

    const getProjectName = (expense: Partial<Expense>) => {
        if (expense.projectId) {
            return budgetProjects.find(project => project.id === expense.projectId)?.name || expense.projectName || '사업 미지정';
        }
        return expense.projectName || '사업 미지정';
    };

    const getExpenseBudgetItemName = (expense: Partial<Expense>) => getExpenseBudgetItemDisplayName(expense, budgetProjects);

    // 지출품의서 생성
    // 합계 비교: 미리보기에 넘기는 totalAmount(목록 선택 합계)와 문서 행에서 다시 계산한 합계가 다르면
    // ExpenseDocument가 미리보기 상단 경고와 인쇄 전 확인창을 띄웁니다.
    const handleCreateDoc = () => {
        if (selectedExpenseList.length === 0) {
            showToast('지출품의서에 포함할 항목을 목록에서 선택해 주세요.', 'info');
            return;
        }
        // 삭제 등으로 목록에서 사라진 지출이 선택에 남아 있으면 정리합니다.
        const existingIds = new Set(selectedExpenseList.map(expense => expense.id!));
        if (selectedExpenses.some(id => !existingIds.has(id))) {
            setSelectedExpenses(previous => previous.filter(id => existingIds.has(id)));
        }
        setShowDocPreview(true);
    };

    const openProjectEditor = (project: BudgetProject) => {
        projects.editProject(project);
        projectEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => projects.projectNameInputRef.current?.focus(), 300);
    };

    const toggleExpenseSelection = (id: string) => {
        setSelectedExpenses(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // 필터링. '사업 미지정'은 사업이 비었거나 삭제된 사업을 가리키는 지출(집계의 미지정 행·unassignedProjectSpent와 같은 규칙)
    const knownProjectIds = new Set(budgetProjects.map(project => project.id));
    const isUnassignedProject = (e: Expense) => !e.projectId || !knownProjectIds.has(e.projectId);
    const filtered = expenses.filter(e => {
        const matchSearch = !searchTerm ||
            e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            getProjectName(e).toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = filterCategory === '전체' || e.budgetItemId === filterCategory || (!e.budgetItemId && filterCategory === 'unassigned-item');
        const matchProject = selectedProjectId === '전체'
            || (selectedProjectId === 'unassigned' ? isUnassignedProject(e) : e.projectId === selectedProjectId);
        return matchSearch && matchCategory && matchProject;
    });

    const selectedExpenseIdSet = new Set(selectedExpenses);
    const filteredExpenseIds = filtered.flatMap(expense => expense.id ? [expense.id] : []);
    const visibleSelectedExpenseCount = filteredExpenseIds.filter(id => selectedExpenseIdSet.has(id)).length;
    const selectedExpenseList = expenses.filter(expense => expense.id && selectedExpenseIdSet.has(expense.id));
    const selectedExpenseCount = selectedExpenseList.length;
    const selectedExpenseTotal = expenseListTotal(selectedExpenseList);
    const hiddenSelectedExpenseCount = Math.max(0, selectedExpenseCount - visibleSelectedExpenseCount);
    const allVisibleExpensesSelected = filteredExpenseIds.length > 0
        && filteredExpenseIds.every(id => selectedExpenseIdSet.has(id));

    const handleVisibleExpenseSelection = (checked: boolean) => {
        const visibleIdSet = new Set(filteredExpenseIds);
        setSelectedExpenses(previous => checked
            ? Array.from(new Set([...previous, ...filteredExpenseIds]))
            : previous.filter(id => !visibleIdSet.has(id)));
    };

    const totalAmount = expenseListTotal(filtered);
    const linkedTotalAmount = expenseListTotal(filtered.filter(e => !isUnassignedProject(e)));
    const unassignedTotalAmount = expenseListTotal(filtered.filter(isUnassignedProject));
    const selectedProject = budgetProjects.find(project => project.id === selectedProjectId) || null;
    const selectedProjectItems = normalizeBudgetItems(selectedProject);
    const selectedProjectSpent = selectedProject ? projectSpent(selectedProject.id, expenses) : totalAmount;
    const selectedProjectBalance = selectedProject ? projectBalance(selectedProject, expenses) : 0;
    const selectedProjectStatus = selectedProject ? getBudgetStatus(selectedProject.totalBudget, selectedProjectSpent) : null;
    const summaryProjects = selectedProject ? [selectedProject] : selectedProjectId === 'unassigned' ? [] : budgetProjects;
    const integrityIssueCount = findBudgetIssues(budgetProjects, expenses).length;
    const hasActiveFilters = Boolean(searchTerm) || filterCategory !== '전체' || selectedProjectId !== '전체';
    // 집계: 건수·사용액은 필터 기준, 총예산·잔액·사용률은 전체 지출 기준
    const summaryOptions = {
        allExpenses: expenses,
        allProjects: budgetProjects,
        includeUnassigned: selectedProjectId === '전체' || selectedProjectId === 'unassigned',
    };
    const defaultProjectForNewExpense = selectedProject ? { id: selectedProject.id, name: selectedProject.name } : null;

    const handleExportCsv = async () => {
        if (filtered.length === 0) {
            showToast('내보낼 지출 내역이 없습니다.', 'info');
            return;
        }
        const columns = ['사업명', '세부 예산 항목', '지출일자', '품명', '금액', '거래처', '결제수단 또는 결제정보', '비고', '등록일'];
        const rows = filtered.map(expense => {
            const paymentInfo = [expense.paymentMethod, expense.cardType, expense.cardLastFour ? `끝 ${expense.cardLastFour}` : '', expense.approvalNo ? `승인 ${expense.approvalNo}` : '']
                .filter(Boolean)
                .join(' / ');
            const createdAt = expense.createdAt?.seconds
                ? localDateKey(new Date(expense.createdAt.seconds * 1000))
                : '';
            return [
                getProjectName(expense),
                getExpenseBudgetItemName(expense),
                expense.date || '',
                expense.description || '',
                expenseTotal(expense),
                expense.vendor || '',
                paymentInfo,
                expense.notes || '',
                createdAt,
            ];
        });
        const csv = buildCsv([columns, ...rows]);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        try {
            const saved = await saveJjssBlob('budget', `jjss-budget-expenses-${localDateKey()}.csv`, blob);
            if (saved.canceled) showToast(savedLocationMessage(saved), 'info');
        } catch (error: any) {
            showToast(error?.message || '예산 CSV 파일을 저장하지 못했습니다.', 'error');
        }
    };

    // 집계 CSV는 지출 목록 CSV와 열 구성이 달라 별도 파일로 저장합니다(지출 목록 CSV 열은 그대로).
    const handleExportSummaryCsv = async () => {
        if (filtered.length === 0 && summaryProjects.length === 0) {
            showToast('집계할 지출이나 사업이 없습니다.', 'info');
            return;
        }
        const blob = new Blob([buildCsv(buildSummaryCsvRows(summaryProjects, filtered, { ...summaryOptions, filtered: hasActiveFilters }))], { type: 'text/csv;charset=utf-8;' });
        try {
            const saved = await saveJjssBlob('budget', `jjss-budget-summary-${localDateKey()}.csv`, blob);
            if (saved.canceled) showToast(savedLocationMessage(saved), 'info');
        } catch (error: any) {
            showToast(error?.message || '집계 CSV 파일을 저장하지 못했습니다.', 'error');
        }
    };

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* 헤더 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
                        <DollarSign className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-300 font-medium">예산 관리</span>
                    </div>
                    <h1 className="section-title mb-3">예산 관리 시스템</h1>
                    <p className="text-white/50 text-lg">지출 등록 · 지출 목록 관리 · 선택 항목 기반 지출품의서 생성</p>
                    <button
                        type="button"
                        onClick={() => setShowIntegrity(open => !open)}
                        aria-expanded={showIntegrity}
                        className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${integrityIssueCount > 0 ? 'border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                        title="사업 없는 지출, 항목 없는 지출, 총예산보다 큰 항목 합계, 사업기간 밖 지출, 중복 승인번호를 찾습니다."
                    >
                        <ShieldCheck className="w-4 h-4" />
                        정합성 점검{integrityIssueCount > 0 ? ` (확인 필요 ${integrityIssueCount}건)` : ''}
                    </button>
                </motion.div>

                <AnimatePresence>
                    {showIntegrity && (
                        <BudgetIntegrityPanel
                            projects={budgetProjects}
                            expenses={expenses}
                            onEditExpense={handleEdit}
                            onEditProject={openProjectEditor}
                            onClose={() => setShowIntegrity(false)}
                        />
                    )}
                </AnimatePresence>

                {/* 요약 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="glass-strong rounded-2xl p-5 border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                                <Receipt className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-white/40 text-sm">총 지출 건수</p>
                                <p className="text-2xl font-bold text-white">{filtered.length}건</p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                        className="glass-strong rounded-2xl p-5 border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-white/40 text-sm">총 지출 금액</p>
                                <p className="text-2xl font-bold text-white">{totalAmount.toLocaleString()}원</p>
                                <p className="text-[11px] text-white/35 mt-1">
                                    사업 연결 {linkedTotalAmount.toLocaleString()}원 · 미지정 {unassignedTotalAmount.toLocaleString()}원
                                </p>
                            </div>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="glass-strong rounded-2xl p-5 border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-white/40 text-sm">선택된 항목</p>
                                <p className="text-2xl font-bold text-white">{selectedExpenseCount}건</p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* 사업 등록/관리 */}
                <div ref={projectEditorRef} className="glass-strong rounded-2xl p-5 border border-white/10 mb-6 scroll-mt-4">
                    <ProjectEditor
                        projectForm={projects.projectForm}
                        editingProjectId={projects.editingProjectId}
                        projectNameError={projects.projectNameError}
                        projectNameInputRef={projects.projectNameInputRef}
                        onFormChange={projects.updateProjectForm}
                        onAddItem={projects.addBudgetItem}
                        onItemChange={projects.updateBudgetItem}
                        onRemoveItem={projects.removeBudgetItem}
                        onSave={projects.saveProject}
                        onCancel={projects.resetProjectForm}
                        selectedProject={selectedProject}
                        projectSpent={selectedProjectSpent}
                        projectBalance={selectedProjectBalance}
                        selectedProjectStatus={selectedProjectStatus}
                    />
                    <ProjectCards
                        budgetProjects={budgetProjects}
                        expenses={expenses}
                        onEdit={openProjectEditor}
                        onDelete={projects.deleteProject}
                    />
                </div>

                {/* 툴바 */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            type="text"
                            placeholder="품명, 거래처 검색..."
                            aria-label="지출 검색"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="input-field pl-10"
                        />
                    </div>
                    <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        aria-label="사업 필터"
                        className="input-field w-auto min-w-[180px]"
                    >
                        <option value="전체">전체 사업</option>
                        <option value="unassigned">사업 미지정</option>
                        {budgetProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <select
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        disabled={selectedProjectId === 'unassigned'}
                        aria-label="세부 항목 필터"
                        className="input-field w-auto min-w-[180px] disabled:opacity-40"
                    >
                        <option value="전체">{selectedProjectId === '전체' ? '전체 세부 항목' : '전체 항목'}</option>
                        {selectedProjectId !== '전체' && selectedProjectItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        {selectedProjectId !== '전체' && <option value="unassigned-item">항목 미지정</option>}
                    </select>
                    <div className="flex gap-2">
                        <button
                            onClick={handleExportCsv}
                            className="btn-secondary flex items-center gap-2 whitespace-nowrap"
                            title="현재 필터링된 지출 목록을 보고용 CSV로 내보냅니다. 외부 공유 전 개인정보를 확인해 주세요."
                        >
                            <Download className="w-4 h-4" />
                            CSV 내보내기
                        </button>
                        <button
                            onClick={openNewExpense}
                            className="btn-primary flex items-center gap-2 whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" />
                            지출 등록
                        </button>
                        <button
                            onClick={() => setShowDocModal(true)}
                            className="btn-secondary flex items-center gap-2 whitespace-nowrap"
                        >
                            <FileText className="w-4 h-4" />
                            지출품의서
                        </button>
                    </div>
                </div>
                <p className="text-xs text-white/35 mb-4 -mt-3">
                    CSV 내보내기는 현재 필터링된 지출 목록을 보고용 파일로 저장합니다. 전체 앱 데이터 백업은 설정 화면의 데이터 백업 기능을 사용해 주세요. 외부 공유 전 개인정보를 확인해 주세요.
                </p>

                {selectedExpenseCount > 0 && (
                    <div
                        className="mb-4 flex flex-col gap-2 rounded-xl border border-primary-400/20 bg-primary-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        role="status"
                        aria-live="polite"
                    >
                        <div>
                            <p className="text-sm text-white/75">
                                현재 화면 선택 <span className="font-bold text-primary-200">{visibleSelectedExpenseCount}건</span>
                                <span className="mx-2 text-white/25">·</span>
                                다른 필터 선택 <span className="font-bold text-amber-200">{hiddenSelectedExpenseCount}건</span>
                                <span className="mx-2 text-white/25">·</span>
                                전체 <span className="font-bold text-white">{selectedExpenseCount}건</span>
                            </p>
                            {hiddenSelectedExpenseCount > 0 && (
                                <p className="mt-1 text-xs text-amber-200/80">
                                    다른 필터에서 선택한 항목도 지출품의서에 함께 포함됩니다.
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedExpenses([])}
                            className="self-start whitespace-nowrap text-xs font-medium text-white/60 underline decoration-white/25 underline-offset-4 hover:text-white sm:self-auto"
                        >
                            전체 선택 해제
                        </button>
                    </div>
                )}

                {/* 목록 / 집계 전환 */}
                <div className="flex gap-2 mb-3" role="tablist" aria-label="지출 보기 방식">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${viewMode === 'list' ? 'bg-primary-500/20 text-primary-100 border-primary-400/30' : 'text-white/55 hover:bg-white/5 border-transparent'}`}
                    >
                        <List className="w-4 h-4" />
                        지출 목록
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'summary'}
                        onClick={() => setViewMode('summary')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${viewMode === 'summary' ? 'bg-primary-500/20 text-primary-100 border-primary-400/30' : 'text-white/55 hover:bg-white/5 border-transparent'}`}
                    >
                        <BarChart3 className="w-4 h-4" />
                        집계
                    </button>
                </div>

                {viewMode === 'summary' ? (
                    <BudgetSummaryView
                        projects={summaryProjects}
                        expenses={filtered}
                        totalsOptions={summaryOptions}
                        hasActiveFilters={hasActiveFilters}
                        onExportCsv={handleExportSummaryCsv}
                    />
                ) : (
                    <ExpenseTable
                    loading={loading}
                    expenses={filtered}
                    totalAmount={totalAmount}
                    hasActiveFilters={hasActiveFilters}
                    onResetFilters={() => { setSearchTerm(''); setFilterCategory('전체'); setSelectedProjectId('전체'); }}
                    selectedIds={selectedExpenseIdSet}
                    allVisibleSelected={allVisibleExpensesSelected}
                    onToggleAllVisible={handleVisibleExpenseSelection}
                    onToggle={toggleExpenseSelection}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    getProjectName={getProjectName}
                    getBudgetItemName={getExpenseBudgetItemName}
                    />
                )}
            </div>

            {/* ─── 지출 등록/수정 모달 ─── */}
            <AnimatePresence>
                {showAddModal && (
                    <ExpenseFormModal
                        key={expenseModalSession}
                        editingExpense={editingExpense}
                        defaultProject={defaultProjectForNewExpense}
                        budgetProjects={budgetProjects}
                        onClose={closeExpenseModal}
                        onDirtyChange={dirty => {
                            // 닫히는 중인 이전 창의 알림은 무시합니다.
                            if (expenseModalSessionRef.current === expenseModalSession) setExpenseFormDirty(dirty);
                        }}
                    />
                )}
            </AnimatePresence>

            {/* ─── 지출품의서 설정 모달 ─── */}
            <AnimatePresence>
                {showDocModal && (
                    <ExpenseDocSetupModal
                        docForm={docForm}
                        onDocFormChange={setDocForm}
                        selectedCount={selectedExpenseCount}
                        visibleSelectedCount={visibleSelectedExpenseCount}
                        hiddenSelectedCount={hiddenSelectedExpenseCount}
                        selectedTotal={selectedExpenseTotal}
                        onClearSelection={() => setSelectedExpenses([])}
                        onPreview={handleCreateDoc}
                        onClose={() => setShowDocModal(false)}
                        previewOpen={showDocPreview}
                    />
                )}
            </AnimatePresence>

            {/* ─── 지출품의서 미리보기/인쇄 ─── */}
            <AnimatePresence>
                {showDocPreview && (
                    <ExpenseDocument
                        data={{
                            ...docForm,
                            expenses: selectedExpenseList,
                            totalAmount: selectedExpenseTotal,
                        }}
                        onClose={() => setShowDocPreview(false)}
                    />
                )}
            </AnimatePresence>

        </div>
    );
}
