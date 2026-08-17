import type { BudgetProject, Expense } from '../types/budget';

export function findExpensesLinkedToRemovedBudgetItems(
    expenses: Expense[],
    projectId: string,
    removedBudgetItemIds: ReadonlySet<string>,
): Expense[] {
    return expenses.filter(expense =>
        !!expense.id
        && expense.projectId === projectId
        && !!expense.budgetItemId
        && removedBudgetItemIds.has(expense.budgetItemId)
    );
}

export function getBudgetItemUnassignment(): Pick<Expense, 'budgetItemId' | 'budgetItemName'> {
    return { budgetItemId: '', budgetItemName: '' };
}

export function getExpenseBudgetItemDisplayName(expense: Partial<Expense>, projects: BudgetProject[]): string {
    if (expense.projectId) {
        if (!expense.budgetItemId) return '항목 미지정';
        const project = projects.find(item => item.id === expense.projectId);
        const item = project?.budgetItems?.find(budgetItem => budgetItem.id === expense.budgetItemId);
        return item?.name || expense.budgetItemName || '항목 미지정';
    }
    return expense.budgetItemName || expense.budgetItem || expense.category || '항목 미지정';
}
