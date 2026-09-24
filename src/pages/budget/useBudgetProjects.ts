import { useRef, useState } from 'react';
import type { BudgetProject, BudgetProjectItem, Expense } from '../../types/budget';
import { findExpensesLinkedToRemovedBudgetItems, getBudgetItemUnassignment } from '../../utils/budgetItemLinks';
import { safeErrorMetadata } from '../../utils/safeError';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { useAppToast } from '../../components/Toast';
import { budgetItemsTotal, isStorageQuotaError, loadBudgetProjects, normalizeBudgetItems, saveBudgetProjects, toWon } from './budgetUtils';

/** 사업 목록 저장 실패 시 안내 문구. 용량 초과면 백업을 먼저 권합니다(저장 구조 변경은 결정 전). */
const STORAGE_QUOTA_MESSAGE = '브라우저 저장 공간이 가득 차서 사업 정보를 저장하지 못했습니다. 설정 화면의 데이터 백업으로 먼저 백업한 뒤 오래된 자료나 영수증 이미지를 정리해 주세요.';

function createEmptyProjectForm(): Partial<BudgetProject> {
    return {
        name: '',
        totalBudget: 0,
        period: String(new Date().getFullYear()),
        notes: '',
        budgetItems: [],
    };
}

function getProjectFormSignature(value: Partial<BudgetProject>) {
    return JSON.stringify({
        name: value.name || '',
        totalBudget: Number(value.totalBudget) || 0,
        period: value.period || '',
        notes: value.notes || '',
        budgetItems: normalizeBudgetItems(value).map(item => ({
            id: item.id,
            name: item.name || '',
            amount: Number(item.amount) || 0,
            memo: item.memo || '',
        })),
    });
}

interface UseBudgetProjectsOptions {
    expenses: Expense[];
    updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
    fetchExpenses: () => Promise<unknown>;
    /** 사업 수정으로 세부 예산 항목이 삭제되었을 때(필터 초기화 등). */
    onBudgetItemsRemoved?: (removedItemIds: ReadonlySet<string>) => void;
    /** 사업이 삭제되었을 때(선택 사업 필터 초기화 등). */
    onProjectDeleted?: (projectId: string) => void;
}

/** 사업(총예산·세부 예산 항목) 목록과 사업 등록/수정 폼 상태. localStorage `jjss:budget-projects`에 저장합니다. */
export function useBudgetProjects({ expenses, updateExpense, fetchExpenses, onBudgetItemsRemoved, onProjectDeleted }: UseBudgetProjectsOptions) {
    const confirm = useConfirm();
    const showToast = useAppToast();
    const [budgetProjects, setBudgetProjects] = useState<BudgetProject[]>(loadBudgetProjects);
    const [projectForm, setProjectForm] = useState<Partial<BudgetProject>>(createEmptyProjectForm);
    const projectFormBaselineRef = useRef(getProjectFormSignature(createEmptyProjectForm()));
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [confirmedRemovedBudgetItemIds, setConfirmedRemovedBudgetItemIds] = useState<string[]>([]);
    const [projectNameError, setProjectNameError] = useState('');
    const projectNameInputRef = useRef<HTMLInputElement>(null);
    const projectActionInFlightRef = useRef(false);

    const projectDirty = getProjectFormSignature(projectForm) !== projectFormBaselineRef.current;

    const resetProjectForm = () => {
        const nextForm = createEmptyProjectForm();
        setProjectForm(nextForm);
        projectFormBaselineRef.current = getProjectFormSignature(nextForm);
        setEditingProjectId(null);
        setConfirmedRemovedBudgetItemIds([]);
        setProjectNameError('');
    };

    const updateProjectForm = (patch: Partial<BudgetProject>) => {
        setProjectForm(prev => ({ ...prev, ...patch }));
        if ('name' in patch) setProjectNameError('');
    };

    const addBudgetItem = () => {
        const now = new Date().toISOString();
        setProjectForm(prev => ({
            ...prev,
            budgetItems: [
                ...normalizeBudgetItems(prev),
                { id: `budget-item-${Date.now()}`, name: '', amount: 0, memo: '', createdAt: now, updatedAt: now },
            ],
        }));
    };

    const updateBudgetItem = (index: number, patch: Partial<BudgetProjectItem>) => {
        setProjectForm(prev => ({
            ...prev,
            budgetItems: normalizeBudgetItems(prev).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        }));
    };

    const runProjectAction = async (action: () => Promise<void>) => {
        if (projectActionInFlightRef.current) return;
        projectActionInFlightRef.current = true;
        try {
            await action();
        } finally {
            projectActionInFlightRef.current = false;
        }
    };

    const saveProject = async () => {
        const name = projectForm.name?.trim();
        if (!name) {
            setProjectNameError('사업명을 입력해 주세요.');
            projectNameInputRef.current?.focus();
            return;
        }
        setProjectNameError('');
        const budgetItems = normalizeBudgetItems(projectForm)
            .filter(item => item.name.trim())
            .map(item => ({
                ...item,
                name: item.name.trim(),
                amount: Number(item.amount) || 0,
                updatedAt: new Date().toISOString(),
            }));
        const itemTotal = budgetItemsTotal(budgetItems);
        const totalBudget = toWon(projectForm.totalBudget);
        if (totalBudget > 0 && itemTotal > totalBudget) {
            const proceed = await confirm({
                title: '세부 예산 합계 확인',
                message: `세부 예산 항목 합계가 총예산을 ${(itemTotal - totalBudget).toLocaleString()}원 초과합니다. 그래도 저장하시겠습니까?`,
                confirmLabel: '저장',
                cancelLabel: '취소',
            });
            if (!proceed) return;
        } else if (totalBudget > 0 && itemTotal > 0 && itemTotal !== totalBudget) {
            const proceed = await confirm({
                title: '세부 예산 합계 확인',
                message: `세부 예산 항목 합계(${itemTotal.toLocaleString()}원)가 총예산(${totalBudget.toLocaleString()}원)과 다릅니다. 그래도 저장하시겠습니까?`,
                confirmLabel: '저장',
                cancelLabel: '취소',
            });
            if (!proceed) return;
        }
        const existingProject = editingProjectId
            ? budgetProjects.find(project => project.id === editingProjectId)
            : undefined;
        const remainingItemIds = new Set(budgetItems.map(item => item.id));
        const removedBudgetItemIds = new Set(
            normalizeBudgetItems(existingProject)
                .filter(item => !remainingItemIds.has(item.id))
                .map(item => item.id)
        );
        const linkedExpensesToUnassign = editingProjectId
            ? findExpensesLinkedToRemovedBudgetItems(expenses, editingProjectId, removedBudgetItemIds)
            : [];
        const needsSaveConfirmation = linkedExpensesToUnassign.some(expense =>
            !confirmedRemovedBudgetItemIds.includes(expense.budgetItemId || '')
        );
        if (needsSaveConfirmation && !(await confirm({
            title: '연결된 지출 확인',
            message: '삭제되는 예산 항목에 연결된 지출이 있습니다. 항목을 삭제하면 연결된 지출은 삭제되지 않고 ‘항목 미지정’으로 변경됩니다. 계속하시겠습니까?',
            confirmLabel: '계속',
            cancelLabel: '취소',
        }))) {
            return;
        }
        const now = new Date().toISOString();
        const nextProjects = editingProjectId
            ? budgetProjects.map(project => project.id === editingProjectId
                ? {
                    ...project,
                    name,
                    totalBudget,
                    period: projectForm.period || String(new Date().getFullYear()),
                    notes: projectForm.notes || '',
                    budgetItems,
                    updatedAt: now,
                }
                : project)
            : [
                ...budgetProjects,
                {
                    id: `budget-project-${Date.now()}`,
                    name,
                    totalBudget,
                    period: projectForm.period || String(new Date().getFullYear()),
                    notes: projectForm.notes || '',
                    budgetItems: budgetItems.map(item => ({ ...item, createdAt: item.createdAt || now, updatedAt: now })),
                    createdAt: now,
                    updatedAt: now,
                },
            ];
        const updatedExpenseSnapshots: Expense[] = [];
        try {
            for (const expense of linkedExpensesToUnassign) {
                await updateExpense(expense.id!, getBudgetItemUnassignment());
                updatedExpenseSnapshots.push(expense);
            }
            saveBudgetProjects(nextProjects);
            setBudgetProjects(nextProjects);
            if (removedBudgetItemIds.size > 0) onBudgetItemsRemoved?.(removedBudgetItemIds);
            resetProjectForm();
            showToast(editingProjectId ? '사업 정보를 수정했습니다.' : '사업을 등록했습니다.', 'success');
        } catch (error) {
            const quotaExceeded = isStorageQuotaError(error);
            let rollbackFailed = false;
            for (const expense of [...updatedExpenseSnapshots].reverse()) {
                try {
                    await updateExpense(expense.id!, {
                        budgetItemId: expense.budgetItemId || '',
                        budgetItemName: expense.budgetItemName || '',
                    });
                } catch {
                    rollbackFailed = true;
                }
            }
            if (rollbackFailed) await fetchExpenses().catch(() => undefined);
            if (quotaExceeded) showToast(STORAGE_QUOTA_MESSAGE, 'error');
            else showToast(rollbackFailed
                ? '예산 항목 저장에 실패했고 일부 연결 지출의 원복 여부를 확인해야 합니다. 지출 목록을 확인해 주세요.'
                : '예산 항목 저장에 실패했습니다. 기존 사업과 연결 지출은 유지됩니다.', 'error');
        }
    };

    const editProject = (project: BudgetProject) => {
        const nextForm = { ...project, budgetItems: normalizeBudgetItems(project) };
        setEditingProjectId(project.id);
        setProjectForm(nextForm);
        projectFormBaselineRef.current = getProjectFormSignature(nextForm);
        setConfirmedRemovedBudgetItemIds([]);
        setProjectNameError('');
    };

    const removeBudgetItem = async (item: BudgetProjectItem, index: number) => {
        const linkedExpenseCount = editingProjectId
            ? expenses.filter(expense => expense.projectId === editingProjectId && expense.budgetItemId === item.id).length
            : 0;
        if (linkedExpenseCount > 0) {
            const proceed = await confirm({
                title: '연결된 지출 확인',
                message: '이 예산 항목에 연결된 지출이 있습니다. 항목을 삭제하면 연결된 지출은 삭제되지 않고 ‘항목 미지정’으로 변경됩니다. 계속하시겠습니까?',
                confirmLabel: '계속',
                cancelLabel: '취소',
            });
            if (!proceed) return;
            setConfirmedRemovedBudgetItemIds(current => current.includes(item.id) ? current : [...current, item.id]);
        }
        setProjectForm(prev => ({
            ...prev,
            budgetItems: normalizeBudgetItems(prev).filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const deleteProject = async (projectId: string) => {
        const linkedExpenses = expenses.filter(expense => expense.projectId === projectId && expense.id);
        const used = linkedExpenses.length > 0;
        const message = used
            ? `이 사업에 연결된 지출 ${linkedExpenses.length}건은 삭제하지 않고 사업 미지정으로 전환됩니다. 사업만 삭제할까요?`
            : '이 사업을 삭제할까요?';
        if (!(await confirm({ title: '사업 삭제', message, confirmLabel: '삭제', cancelLabel: '취소', tone: 'danger' }))) return;
        const updatedExpenseSnapshots: Expense[] = [];
        try {
            // 하나씩 전환하고, 중간에 실패하면 이미 바꾼 지출을 원래 사업으로 되돌립니다(사업 저장과 같은 방식).
            for (const expense of linkedExpenses) {
                await updateExpense(expense.id!, {
                    projectId: '',
                    projectName: '사업 미지정',
                    budgetItemId: '',
                    budgetItemName: '',
                });
                updatedExpenseSnapshots.push(expense);
            }
            const nextProjects = budgetProjects.filter(project => project.id !== projectId);
            saveBudgetProjects(nextProjects);
            setBudgetProjects(nextProjects);
            onProjectDeleted?.(projectId);
            if (editingProjectId === projectId) resetProjectForm();
            showToast('사업을 삭제했습니다.', 'success');
        } catch (error: any) {
            console.error('Project delete error:', safeErrorMetadata(error, 'budget-project-delete'));
            let rollbackFailed = false;
            for (const expense of [...updatedExpenseSnapshots].reverse()) {
                try {
                    await updateExpense(expense.id!, {
                        projectId: expense.projectId || '',
                        projectName: expense.projectName || '',
                        budgetItemId: expense.budgetItemId || '',
                        budgetItemName: expense.budgetItemName || '',
                    });
                } catch {
                    rollbackFailed = true;
                }
            }
            if (rollbackFailed) await fetchExpenses().catch(() => undefined);
            if (isStorageQuotaError(error)) showToast(STORAGE_QUOTA_MESSAGE, 'error');
            else showToast(rollbackFailed
                ? '사업 삭제에 실패했고 일부 연결 지출의 원복 여부를 확인해야 합니다. 지출 목록을 확인해 주세요.'
                : '사업 삭제에 실패했습니다. 사업과 연결 지출은 그대로 유지됩니다.', 'error');
        }
    };

    return {
        budgetProjects,
        projectForm,
        editingProjectId,
        projectNameError,
        projectNameInputRef,
        projectDirty,
        updateProjectForm,
        addBudgetItem,
        updateBudgetItem,
        removeBudgetItem,
        resetProjectForm,
        editProject,
        saveProject: () => runProjectAction(saveProject),
        deleteProject: (projectId: string) => runProjectAction(() => deleteProject(projectId)),
    };
}
