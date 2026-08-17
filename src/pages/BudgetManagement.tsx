import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Receipt, Plus, Trash2, Edit3, FileText, Loader2, X,
    DollarSign, Search, Download, Upload, Camera, Eye, EyeOff, ChevronDown
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { BudgetProject, BudgetProjectItem, Expense } from '../types/budget';
import ExpenseDocument from '../components/ExpenseDocument';
import { performOCR, parseReceiptFromOCR, smartParseItemizedReceiptWithAI, ItemizedReceiptParseResult, ReceiptItem, ReceiptParseResult } from '../services/ocr';
import { findExpensesLinkedToRemovedBudgetItems, getBudgetItemUnassignment, getExpenseBudgetItemDisplayName } from '../utils/budgetItemLinks';
import { safeErrorMetadata } from '../utils/safeError';
import { saveJjssBlob, savedLocationMessage } from '../utils/jjssFileService';

const CATEGORIES = ['사업비', '프로그램사업비', '운영비', '인건비', '대체인력임금', '교통비', '식비', '소모품비', '기타'];
const PAYMENT_METHODS = ['카드', '현금', '계좌이체', '기타'];
const BUDGET_PROJECTS_KEY = 'jjss:budget-projects';

function loadBudgetProjects(): BudgetProject[] {
    try {
        const raw = localStorage.getItem(BUDGET_PROJECTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveBudgetProjects(projects: BudgetProject[]) {
    localStorage.setItem(BUDGET_PROJECTS_KEY, JSON.stringify(projects));
}

function parseCurrencyInput(value: string) {
    return Number(value.replace(/[^\d]/g, '')) || 0;
}

function formatCurrencyInput(value: unknown) {
    const numericValue = typeof value === 'number' ? value : parseCurrencyInput(String(value || ''));
    return numericValue ? numericValue.toLocaleString('ko-KR') : '';
}

function normalizeBudgetItems(project?: Partial<BudgetProject> | null): BudgetProjectItem[] {
    return Array.isArray(project?.budgetItems) ? project.budgetItems : [];
}

export default function BudgetManagement() {
    const { expenses, fetchExpenses, addExpense, updateExpense, deleteExpense } = useDataStore();
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDocModal, setShowDocModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('전체');
    const [budgetProjects, setBudgetProjects] = useState<BudgetProject[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState('전체');
    const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
    const [projectForm, setProjectForm] = useState<Partial<BudgetProject>>({
        name: '',
        totalBudget: 0,
        period: String(new Date().getFullYear()),
        notes: '',
        budgetItems: [],
    });
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [confirmedRemovedBudgetItemIds, setConfirmedRemovedBudgetItemIds] = useState<string[]>([]);
    const [ocrFile, setOcrFile] = useState<File | null>(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrRawText, setOcrRawText] = useState('');
    const [ocrMessage, setOcrMessage] = useState('');
    const [ocrError, setOcrError] = useState('');
    const [showOcrRaw, setShowOcrRaw] = useState(false);
    const [ocrParsed, setOcrParsed] = useState<ItemizedReceiptParseResult | null>(null);

    const getLocalDate = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().split('T')[0];
    };

    // 폼 상태
    const [form, setForm] = useState<Partial<Expense>>({
        date: getLocalDate(),
        category: '사업비',
        budgetItem: '',
        budgetItemId: '',
        budgetItemName: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        supplyAmount: 0,
        vat: 0,
        amount: 0,
        vendor: '',
        vendorBizNo: '',
        paymentMethod: '카드',
        cardType: '',
        cardLastFour: '',
        approvalNo: '',
        notes: '',
    });

    // 지출품의서 폼
    const [docForm, setDocForm] = useState({
        centerName: '',
        title: '',
        purpose: '',
        approvers: [
            { title: '담당', name: '' },
            { title: '팀장', name: '' },
            { title: '과장', name: '' }
        ] as any[],
    });
    const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
    const [showDocPreview, setShowDocPreview] = useState(false);

    useEffect(() => {
        loadExpenses();
        setBudgetProjects(loadBudgetProjects());
    }, []);

    const loadExpenses = async () => {
        setLoading(true);
        try {
            await fetchExpenses();
        } catch (error: any) {
            alert(error?.message || '지출 내역을 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm({
            date: getLocalDate(),
            category: '사업비',
            budgetItem: '',
            projectId: selectedProjectId !== '전체' && selectedProjectId !== 'unassigned' ? selectedProjectId : '',
            projectName: selectedProjectId !== '전체' && selectedProjectId !== 'unassigned' ? budgetProjects.find(p => p.id === selectedProjectId)?.name || '' : '',
            budgetItemId: '',
            budgetItemName: '',
            description: '',
            quantity: 1,
            unitPrice: 0,
            supplyAmount: 0,
            vat: 0,
            amount: 0,
            vendor: '',
            vendorBizNo: '',
            paymentMethod: '카드',
            cardType: '',
            cardLastFour: '',
            approvalNo: '',
            notes: '',
        });
        setEditingExpense(null);
        setOcrFile(null);
        setOcrRawText('');
        setOcrMessage('');
        setOcrError('');
        setShowOcrRaw(false);
        setOcrParsed(null);
    };

    const resetProjectForm = () => {
        setProjectForm({
            name: '',
            totalBudget: 0,
            period: String(new Date().getFullYear()),
            notes: '',
            budgetItems: [],
        });
        setEditingProjectId(null);
        setConfirmedRemovedBudgetItemIds([]);
    };

    const handleSaveProject = async () => {
        const name = projectForm.name?.trim();
        if (!name) {
            alert('사업명을 입력해 주세요.');
            return;
        }
        const budgetItems = normalizeBudgetItems(projectForm)
            .filter(item => item.name.trim())
            .map(item => ({
                ...item,
                name: item.name.trim(),
                amount: Number(item.amount) || 0,
                updatedAt: new Date().toISOString(),
            }));
        const itemTotal = budgetItems.reduce((sum, item) => sum + (item.amount || 0), 0);
        const totalBudget = Number(projectForm.totalBudget) || 0;
        if (totalBudget > 0 && itemTotal > totalBudget) {
            const proceed = window.confirm(`세부 예산 항목 합계가 총예산을 ${(itemTotal - totalBudget).toLocaleString()}원 초과합니다. 그래도 저장하시겠습니까?`);
            if (!proceed) return;
        } else if (totalBudget > 0 && itemTotal > 0 && itemTotal !== totalBudget) {
            const proceed = window.confirm(`세부 예산 항목 합계(${itemTotal.toLocaleString()}원)가 총예산(${totalBudget.toLocaleString()}원)과 다릅니다. 그래도 저장하시겠습니까?`);
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
        if (needsSaveConfirmation && !window.confirm('삭제되는 예산 항목에 연결된 지출이 있습니다. 항목을 삭제하면 연결된 지출은 삭제되지 않고 ‘항목 미지정’으로 변경됩니다. 계속하시겠습니까?')) {
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
            if (removedBudgetItemIds.has(filterCategory)) setFilterCategory('전체');
            resetProjectForm();
        } catch {
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
            alert(rollbackFailed
                ? '예산 항목 저장에 실패했고 일부 연결 지출의 원복 여부를 확인해야 합니다. 지출 목록을 확인해 주세요.'
                : '예산 항목 저장에 실패했습니다. 기존 사업과 연결 지출은 유지됩니다.');
        }
    };

    const handleEditProject = (project: BudgetProject) => {
        setEditingProjectId(project.id);
        setProjectForm({ ...project, budgetItems: normalizeBudgetItems(project) });
        setConfirmedRemovedBudgetItemIds([]);
    };

    const handleRemoveBudgetItem = (item: BudgetProjectItem, index: number) => {
        const linkedExpenseCount = editingProjectId
            ? expenses.filter(expense => expense.projectId === editingProjectId && expense.budgetItemId === item.id).length
            : 0;
        if (linkedExpenseCount > 0) {
            const proceed = window.confirm('이 예산 항목에 연결된 지출이 있습니다. 항목을 삭제하면 연결된 지출은 삭제되지 않고 ‘항목 미지정’으로 변경됩니다. 계속하시겠습니까?');
            if (!proceed) return;
            setConfirmedRemovedBudgetItemIds(current => current.includes(item.id) ? current : [...current, item.id]);
        }
        setProjectForm(prev => ({
            ...prev,
            budgetItems: normalizeBudgetItems(prev).filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const handleDeleteProject = async (projectId: string) => {
        const linkedExpenses = expenses.filter(expense => expense.projectId === projectId && expense.id);
        const used = linkedExpenses.length > 0;
        const message = used
            ? `이 사업에 연결된 지출 ${linkedExpenses.length}건은 삭제하지 않고 사업 미지정으로 전환됩니다. 사업만 삭제할까요?`
            : '이 사업을 삭제할까요?';
        if (!window.confirm(message)) return;
        try {
            await Promise.all(linkedExpenses.map(expense => updateExpense(expense.id!, {
                projectId: '',
                projectName: '사업 미지정',
                budgetItemId: '',
                budgetItemName: '',
            })));
            const nextProjects = budgetProjects.filter(project => project.id !== projectId);
            setBudgetProjects(nextProjects);
            saveBudgetProjects(nextProjects);
            if (selectedProjectId === projectId) setSelectedProjectId('전체');
            await fetchExpenses();
        } catch (error: any) {
            console.error('Project delete error:', safeErrorMetadata(error, 'budget-project-delete'));
            alert('사업 삭제 중 연결 지출을 사업 미지정으로 전환하지 못했습니다.');
        }
    };

    const getProjectName = (expense: Partial<Expense>) => {
        if (expense.projectId) {
            return budgetProjects.find(project => project.id === expense.projectId)?.name || expense.projectName || '사업 미지정';
        }
        return expense.projectName || '사업 미지정';
    };

    const getProjectSpent = (projectId: string, excludeExpenseId?: string) => {
        return expenses
            .filter(expense => expense.projectId === projectId && expense.id !== excludeExpenseId)
            .reduce((sum, expense) => sum + (expense.amount || 0), 0);
    };

    const getBudgetStatus = (totalBudget: number, spent: number) => {
        if (!totalBudget || totalBudget <= 0) {
            return { usageRate: 0, label: '예산 미입력', className: 'text-white/45 bg-white/5 border-white/10' };
        }
        const usageRate = Math.round((spent / totalBudget) * 100);
        if (usageRate > 100) return { usageRate, label: '초과', className: 'text-red-200 bg-red-500/10 border-red-400/25' };
        if (usageRate >= 90) return { usageRate, label: '거의 소진', className: 'text-orange-200 bg-orange-500/10 border-orange-400/25' };
        if (usageRate >= 70) return { usageRate, label: '주의', className: 'text-amber-200 bg-amber-500/10 border-amber-400/25' };
        return { usageRate, label: '정상', className: 'text-emerald-200 bg-emerald-500/10 border-emerald-400/25' };
    };

    const getExpenseBudgetItemName = (expense: Partial<Expense>) => {
        return getExpenseBudgetItemDisplayName(expense, budgetProjects);
    };

    const getSelectedProjectItems = () => normalizeBudgetItems(budgetProjects.find(project => project.id === selectedProjectId));

    const handleSubmit = async () => {
        if (!form.date) {
            alert('지출일자를 입력해 주세요.');
            return;
        }
        if (!String(form.description || '').trim()) {
            alert('품명을 입력해 주세요.');
            return;
        }
        if (form.amount === undefined || form.amount === null || Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
            alert('올바른 금액을 입력해 주세요.');
            return;
        }
        try {
            const selectedFormProject = budgetProjects.find(project => project.id === form.projectId);
            const selectedBudgetItem = selectedFormProject
                ? normalizeBudgetItems(selectedFormProject).find(item => item.id === form.budgetItemId)
                : undefined;
            if (selectedFormProject) {
                const spentExcludingCurrent = getProjectSpent(selectedFormProject.id, editingExpense?.id);
                const projectedSpent = spentExcludingCurrent + Number(form.amount || 0);
                const overAmount = projectedSpent - selectedFormProject.totalBudget;
                if (selectedFormProject.totalBudget > 0 && overAmount > 0) {
                    const proceed = window.confirm(`이 지출을 등록하면 해당 사업 예산을 ${overAmount.toLocaleString()}원 초과합니다. 그래도 저장하시겠습니까?`);
                    if (!proceed) return;
                }
            }
            const payload = {
                ...form,
                projectName: selectedFormProject?.name || form.projectName || '',
                budgetItemId: selectedBudgetItem?.id || '',
                budgetItemName: selectedBudgetItem?.name || '',
            };
            if (editingExpense?.id) {
                await updateExpense(editingExpense.id, payload);
            } else {
                await addExpense(payload as Omit<Expense, 'id' | 'organization' | 'createdAt' | 'createdBy'>);
            }
            setShowAddModal(false);
            resetForm();
        } catch (error) {
            console.error('Submit Error:', safeErrorMetadata(error, 'expense-save'));
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 지출 내역을 삭제하시겠습니까?')) return;
        try {
            await deleteExpense(id);
        } catch (error: any) {
            console.error('Delete Error:', safeErrorMetadata(error, 'expense-delete'));
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const handleEdit = (expense: Expense) => {
        setEditingExpense(expense);
        setForm({
            date: expense.date,
            category: expense.category,
            budgetItem: expense.budgetItem || '',
            budgetItemId: expense.budgetItemId || '',
            budgetItemName: expense.budgetItemName || '',
            projectId: expense.projectId || '',
            projectName: expense.projectName || '',
            description: expense.description,
            quantity: expense.quantity || 1,
            unitPrice: expense.unitPrice || 0,
            supplyAmount: expense.supplyAmount || 0,
            vat: expense.vat || 0,
            amount: expense.amount,
            vendor: expense.vendor,
            vendorBizNo: expense.vendorBizNo || '',
            paymentMethod: expense.paymentMethod,
            cardType: expense.cardType || '',
            cardLastFour: expense.cardLastFour || '',
            approvalNo: expense.approvalNo || '',
            notes: expense.notes,
        });
        setShowAddModal(true);
    };

    const toNumber = (value: unknown): number | undefined => {
        if (value === undefined || value === null || value === '') return undefined;
        const parsed = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };

    const cleanLastFour = (value?: string) => {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        return digits.slice(-4);
    };

    const buildItemsSummary = (items: ReceiptItem[] = []) => {
        if (!items.length) return '';
        return items.map(item => `${item.description} ${toNumber(item.amount)?.toLocaleString() || 0}원`).join(', ');
    };

    const applyOCRToForm = (parsed: ReceiptParseResult & { items?: ReceiptItem[] }, mode: 'parsed' | 'firstItem' | 'allItems' = 'parsed') => {
        const items = parsed.items || [];
        let nextParsed: ReceiptParseResult = { ...parsed };
        let notesExtra = '';

        if (mode === 'firstItem' && items[0]) {
            const item = items[0];
            nextParsed = {
                ...parsed,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                supplyAmount: item.supplyAmount,
                vat: item.vat,
                amount: item.amount,
            };
            notesExtra = `OCR 품목 선택: 첫 번째 품목(${item.description})`;
        } else if (mode === 'allItems' && items.length) {
            const amount = items.reduce((sum, item) => sum + (toNumber(item.amount) || 0), 0);
            const allHaveSupply = items.every(item => toNumber(item.supplyAmount));
            const allHaveVat = items.every(item => toNumber(item.vat));
            nextParsed = {
                ...parsed,
                description: items.map(item => item.description).filter(Boolean).join(', '),
                quantity: items.length,
                amount: amount || parsed.amount,
                supplyAmount: allHaveSupply ? items.reduce((sum, item) => sum + (toNumber(item.supplyAmount) || 0), 0) : parsed.supplyAmount,
                vat: allHaveVat ? items.reduce((sum, item) => sum + (toNumber(item.vat) || 0), 0) : parsed.vat,
            };
            notesExtra = `OCR 전체 품목 합계 적용: ${buildItemsSummary(items)}`;
        } else if (items.length) {
            notesExtra = `OCR 품목 요약: ${buildItemsSummary(items)}`;
        }

        setForm(prev => {
            const next: Partial<Expense> = { ...prev };
            const setIfPresent = <K extends keyof Expense>(key: K, value: Expense[K] | undefined) => {
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                    (next as any)[key] = value;
                }
            };

            setIfPresent('date', nextParsed.date as any);
            setIfPresent('vendor', nextParsed.vendor as any);
            setIfPresent('vendorBizNo', nextParsed.vendorBizNo as any);
            setIfPresent('description', nextParsed.description as any);
            setIfPresent('paymentMethod', nextParsed.paymentMethod as any);
            setIfPresent('cardType', nextParsed.cardType as any);
            const lastFour = cleanLastFour(nextParsed.cardLastFour);
            if (lastFour) next.cardLastFour = lastFour;
            setIfPresent('approvalNo', nextParsed.approvalNo as any);

            const quantity = toNumber((nextParsed as any).quantity);
            const unitPrice = toNumber((nextParsed as any).unitPrice);
            const supplyAmount = toNumber(nextParsed.supplyAmount);
            const vat = toNumber(nextParsed.vat);
            let amount = toNumber(nextParsed.amount);
            if (!amount && quantity && unitPrice) amount = quantity * unitPrice;

            if (quantity) next.quantity = quantity;
            if (unitPrice) next.unitPrice = unitPrice;
            if (supplyAmount) next.supplyAmount = supplyAmount;
            if (vat) next.vat = vat;
            if (amount) next.amount = amount;

            const existingNotes = (prev.notes || '')
                .split('\n')
                .filter(line => line && !line.startsWith('OCR 파일명:') && !line.startsWith('OCR 품목') && !line.startsWith('OCR 전체') && !line.startsWith('OCR 원문 일부:'))
                .join('\n');
            const fileNote = ocrFile?.name ? `OCR 파일명: ${ocrFile.name}` : '';
            const rawNote = ocrRawText ? `OCR 원문 일부: ${ocrRawText.replace(/\s+/g, ' ').slice(0, 180)}` : '';
            const noteParts = [existingNotes, fileNote, notesExtra, rawNote].filter(Boolean);
            if (noteParts.length) next.notes = Array.from(new Set(noteParts)).join('\n');
            return next;
        });

        setOcrMessage('OCR 결과를 입력칸에 반영했습니다. 저장 전 내용을 확인해 주세요.');
    };

    const handleRunOCR = async () => {
        if (!ocrFile) {
            setOcrError('OCR을 실행할 JPG, PNG 또는 PDF 파일을 선택해 주세요.');
            return;
        }
        setOcrLoading(true);
        setOcrError('');
        setOcrMessage('');
        const previousForm = form;
        try {
            const rawText = await performOCR(ocrFile);
            setOcrRawText(rawText);
            if (!rawText.trim()) throw new Error('OCR 결과에서 텍스트를 찾지 못했습니다.');

            let parsed: ItemizedReceiptParseResult;
            try {
                parsed = await smartParseItemizedReceiptWithAI(rawText);
            } catch {
                parsed = { ...parseReceiptFromOCR(rawText), items: [] };
            }
            if (!parsed || Object.keys(parsed).length === 0) parsed = { ...parseReceiptFromOCR(rawText), items: [] };
            setOcrParsed(parsed);
            applyOCRToForm(parsed, parsed.items?.length ? 'allItems' : 'parsed');
        } catch (error: any) {
            setForm(previousForm);
            const message = error?.message || 'OCR 처리 중 오류가 발생했습니다.';
            setOcrError(message.includes('API 키') || message.includes('키가 필요')
                ? 'OCR 기능을 사용하려면 설정에서 Vision API 키 또는 Gemini API 키를 입력해 주세요.'
                : `${message} 작성 중인 지출 내용은 유지됩니다.`);
        } finally {
            setOcrLoading(false);
        }
    };

    // 지출품의서 생성
    const handleCreateDoc = () => {
        if (selectedExpenses.length === 0) {
            alert('지출품의서에 포함할 항목을 선택해주세요.');
            return;
        }
        setShowDocPreview(true);
    };

    const toggleExpenseSelection = (id: string) => {
        setSelectedExpenses(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // 필터링
    const filtered = expenses.filter(e => {
        const matchSearch = !searchTerm ||
            e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            getProjectName(e).toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = filterCategory === '전체' || e.budgetItemId === filterCategory || (!e.budgetItemId && filterCategory === 'unassigned-item');
        const matchProject = selectedProjectId === '전체'
            || (selectedProjectId === 'unassigned' ? !e.projectId : e.projectId === selectedProjectId);
        return matchSearch && matchCategory && matchProject;
    });

    const totalAmount = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);
    const linkedTotalAmount = filtered.filter(e => e.projectId).reduce((sum, e) => sum + (e.amount || 0), 0);
    const unassignedTotalAmount = filtered.filter(e => !e.projectId).reduce((sum, e) => sum + (e.amount || 0), 0);
    const selectedProject = budgetProjects.find(project => project.id === selectedProjectId) || null;
    const selectedProjectItems = getSelectedProjectItems();
    const projectSpent = selectedProject
        ? getProjectSpent(selectedProject.id)
        : totalAmount;
    const projectBalance = selectedProject ? selectedProject.totalBudget - projectSpent : 0;
    const selectedProjectStatus = selectedProject ? getBudgetStatus(selectedProject.totalBudget, projectSpent) : null;

    const csvEscape = (value: unknown) => {
        const text = String(value ?? '').replace(/\r?\n/g, ' ');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    useEffect(() => {
        setFilterCategory('전체');
    }, [selectedProjectId]);

    const handleExportCsv = async () => {
        if (filtered.length === 0) {
            alert('내보낼 지출 내역이 없습니다.');
            return;
        }
        const columns = ['사업명', '세부 예산 항목', '지출일자', '품명', '금액', '거래처', '결제수단 또는 결제정보', '비고', '등록일'];
        const rows = filtered.map(expense => {
            const paymentInfo = [expense.paymentMethod, expense.cardType, expense.cardLastFour ? `끝 ${expense.cardLastFour}` : '', expense.approvalNo ? `승인 ${expense.approvalNo}` : '']
                .filter(Boolean)
                .join(' / ');
            const createdAt = expense.createdAt?.seconds
                ? new Date(expense.createdAt.seconds * 1000).toISOString().slice(0, 10)
                : '';
            return [
                getProjectName(expense),
                getExpenseBudgetItemName(expense),
                expense.date || '',
                expense.description || '',
                Number(expense.amount || 0),
                expense.vendor || '',
                paymentInfo,
                expense.notes || '',
                createdAt,
            ];
        });
        const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        try {
            const saved = await saveJjssBlob('budget', `jjss-budget-expenses-${getLocalDate()}.csv`, blob);
            if (saved.canceled) alert(savedLocationMessage(saved));
        } catch (error: any) {
            alert(error?.message || '예산 CSV 파일을 저장하지 못했습니다.');
        }
    };

    const formatDate = (d: string) => {
        if (!d) return '-';
        const date = new Date(d);
        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
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
                </motion.div>

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
                                <p className="text-2xl font-bold text-white">{selectedExpenses.length}건</p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* 사업 등록/관리 */}
                <div className="glass-strong rounded-2xl p-5 border border-white/10 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-white mb-1">사업 등록/관리</h2>
                            <p className="text-white/40 text-sm mb-4">사업별 총예산을 등록하고 지출 연결 내역과 잔액을 확인합니다.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <input
                                    type="text"
                                    placeholder="사업명"
                                    value={projectForm.name || ''}
                                    onChange={e => setProjectForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="input-field"
                                />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="총예산"
                                    value={formatCurrencyInput(projectForm.totalBudget)}
                                    onChange={e => setProjectForm(prev => ({ ...prev, totalBudget: parseCurrencyInput(e.target.value) }))}
                                    className="input-field"
                                />
                                <input
                                    type="text"
                                    placeholder="사업기간 또는 연도"
                                    value={projectForm.period || ''}
                                    onChange={e => setProjectForm(prev => ({ ...prev, period: e.target.value }))}
                                    className="input-field"
                                />
                                <div className="flex gap-2">
                                    <button onClick={handleSaveProject} className="btn-primary flex-1 whitespace-nowrap">
                                        {editingProjectId ? '수정' : '사업 등록'}
                                    </button>
                                    {editingProjectId && (
                                        <button onClick={resetProjectForm} className="btn-secondary whitespace-nowrap">취소</button>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    placeholder="비고"
                                    value={projectForm.notes || ''}
                                    onChange={e => setProjectForm(prev => ({ ...prev, notes: e.target.value }))}
                                    className="input-field sm:col-span-4"
                                />
                                <div className="sm:col-span-4 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="text-white font-bold">세부 예산 항목</p>
                                            <p className="text-xs text-white/40">사업 안에서 사용할 예산 항목을 나누어 등록합니다. 예: 인건비, 사업비, 회의비, 여비</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const now = new Date().toISOString();
                                                setProjectForm(prev => ({
                                                    ...prev,
                                                    budgetItems: [
                                                        ...normalizeBudgetItems(prev),
                                                        { id: `budget-item-${Date.now()}`, name: '', amount: 0, memo: '', createdAt: now, updatedAt: now },
                                                    ],
                                                }));
                                            }}
                                            className="btn-secondary text-xs whitespace-nowrap"
                                        >
                                            항목 추가
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {normalizeBudgetItems(projectForm).length === 0 ? (
                                            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3">
                                                <p className="text-xs text-white/45">세부 항목 없이도 사업 등록이 가능합니다. 필요하면 항목 추가를 눌러 인건비, 사업비, 회의비처럼 사업 안의 예산 분류를 입력하세요.</p>
                                            </div>
                                        ) : normalizeBudgetItems(projectForm).map((item, idx) => (
                                            <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr_40px] gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="항목명 예: 인건비, 사업비, 회의비, 여비, 물품비, 강사비"
                                                    value={item.name}
                                                    onChange={e => {
                                                        setProjectForm(prev => ({
                                                            ...prev,
                                                            budgetItems: normalizeBudgetItems(prev).map((it, i) => i === idx ? { ...it, name: e.target.value } : it),
                                                        }));
                                                    }}
                                                    className="input-field"
                                                />
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="항목 예산금액"
                                                    value={formatCurrencyInput(item.amount)}
                                                    onChange={e => {
                                                        setProjectForm(prev => ({
                                                            ...prev,
                                                            budgetItems: normalizeBudgetItems(prev).map((it, i) => i === idx ? { ...it, amount: parseCurrencyInput(e.target.value) } : it),
                                                        }));
                                                    }}
                                                    className="input-field"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="메모(선택)"
                                                    value={item.memo || ''}
                                                    onChange={e => {
                                                        setProjectForm(prev => ({
                                                            ...prev,
                                                            budgetItems: normalizeBudgetItems(prev).map((it, i) => i === idx ? { ...it, memo: e.target.value } : it),
                                                        }));
                                                    }}
                                                    className="input-field"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveBudgetItem(item, idx)}
                                                    className="rounded-xl bg-red-500/10 text-red-200 hover:bg-red-500/20 flex items-center justify-center"
                                                    title="세부 예산 항목 삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {normalizeBudgetItems(projectForm).length > 0 && (
                                        <p className="text-xs text-white/40 mt-3">
                                            항목 합계 {normalizeBudgetItems(projectForm).reduce((sum, item) => sum + (item.amount || 0), 0).toLocaleString()}원 / 총예산 {(Number(projectForm.totalBudget) || 0).toLocaleString()}원
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="w-full lg:w-80 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                            <p className="text-white/40 text-sm">선택 사업 잔액</p>
                            <p className="text-lg font-bold text-white mt-1">{selectedProject?.name || '전체/사업 미지정'}</p>
                            {selectedProject ? (
                                <div className="mt-3 space-y-1 text-sm">
                                    <p className="text-white/50">총예산: <span className="text-white">{selectedProject.totalBudget.toLocaleString()}원</span></p>
                                    <p className="text-white/50">사용액: <span className="text-white">{projectSpent.toLocaleString()}원</span></p>
                                    <p className="text-white/50">잔액: <span className={projectBalance < 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>{projectBalance.toLocaleString()}원</span></p>
                                    {selectedProjectStatus && (
                                        <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full border text-xs font-bold ${selectedProjectStatus.className}`}>
                                            사용률 {selectedProjectStatus.usageRate}% · {projectBalance < 0 ? '초과' : selectedProjectStatus.label}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-white/35 text-sm mt-3">사업 필터를 선택하면 해당 사업 잔액이 표시됩니다.</p>
                            )}
                        </div>
                    </div>
                    {budgetProjects.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
                            {budgetProjects.map(project => {
                                const spent = getProjectSpent(project.id);
                                const balance = project.totalBudget - spent;
                                const status = getBudgetStatus(project.totalBudget, spent);
                                return (
                                    <div key={project.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-white">{project.name}</p>
                                                <p className="text-xs text-white/40 mt-1">{project.period || '기간 미지정'} · {project.notes || '비고 없음'}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => handleEditProject(project)} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-300">
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleDeleteProject(project.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-300">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                                            <div><p className="text-white/35">예산</p><p className="text-white font-bold">{project.totalBudget.toLocaleString()}</p></div>
                                            <div><p className="text-white/35">사용</p><p className="text-white font-bold">{spent.toLocaleString()}</p></div>
                                            <div><p className="text-white/35">잔액</p><p className={balance < 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>{balance.toLocaleString()}</p></div>
                                        </div>
                                        <div className="mt-3">
                                            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                                                <div
                                                    className={`h-full ${status.usageRate > 100 ? 'bg-red-400' : status.usageRate >= 90 ? 'bg-orange-400' : status.usageRate >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                    style={{ width: `${Math.min(status.usageRate, 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs text-white/45">사용률 {status.usageRate}%</span>
                                                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${balance < 0 ? 'text-red-200 bg-red-500/10 border-red-400/25' : status.className}`}>
                                                    {balance < 0 ? '초과' : status.label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-white/10">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedProjectIds(prev => ({ ...prev, [project.id]: !prev[project.id] }))}
                                                className="w-full flex items-center justify-between text-xs text-white/55 hover:text-white/80 transition-colors"
                                            >
                                                <span>세부 항목별 현황 {normalizeBudgetItems(project).length ? `(${normalizeBudgetItems(project).length}개)` : ''}</span>
                                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedProjectIds[project.id] ? 'rotate-180' : ''}`} />
                                            </button>
                                            {expandedProjectIds[project.id] && (
                                                <div className="mt-3 space-y-2">
                                                    {normalizeBudgetItems(project).length === 0 && (
                                                        <p className="text-xs text-white/35">등록된 세부 예산 항목이 없습니다. 사업 사용액은 전체 사업 사용액에만 반영됩니다.</p>
                                                    )}
                                                    {normalizeBudgetItems(project).map(item => {
                                                        const itemSpent = expenses
                                                            .filter(expense => expense.projectId === project.id && expense.budgetItemId === item.id)
                                                            .reduce((sum, expense) => sum + (expense.amount || 0), 0);
                                                        const itemBalance = (item.amount || 0) - itemSpent;
                                                        const itemStatus = getBudgetStatus(item.amount || 0, itemSpent);
                                                        return (
                                                            <div key={item.id} className="text-xs rounded-xl bg-white/[0.03] border border-white/10 p-2">
                                                                <div className="flex justify-between gap-2">
                                                                    <span className="text-white/75 truncate">{item.name || '이름 없는 항목'}</span>
                                                                    <span className={itemBalance < 0 ? 'text-red-300' : 'text-white/45'}>
                                                                        사용률 {itemStatus.usageRate}%
                                                                    </span>
                                                                </div>
                                                                <div className="mt-1 flex justify-between gap-2 text-white/40">
                                                                    <span>예산 {(item.amount || 0).toLocaleString()}원</span>
                                                                    <span>사용 {itemSpent.toLocaleString()}원</span>
                                                                    <span className={itemBalance < 0 ? 'text-red-300' : 'text-emerald-300'}>잔액 {itemBalance.toLocaleString()}원</span>
                                                                </div>
                                                                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-2">
                                                                    <div
                                                                        className={`h-full ${itemStatus.usageRate > 100 ? 'bg-red-400' : itemStatus.usageRate >= 90 ? 'bg-orange-400' : itemStatus.usageRate >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                                        style={{ width: `${Math.min(itemStatus.usageRate, 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {expenses.some(expense => expense.projectId === project.id && !expense.budgetItemId) && (
                                                        <p className="text-xs text-white/40 rounded-xl bg-white/[0.03] border border-white/10 p-2">
                                                            항목 미지정 사용액: {expenses.filter(expense => expense.projectId === project.id && !expense.budgetItemId).reduce((sum, expense) => sum + (expense.amount || 0), 0).toLocaleString()}원
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 툴바 */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            type="text"
                            placeholder="품명, 거래처 검색..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="input-field pl-10"
                        />
                    </div>
                    <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
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
                            onClick={() => { resetForm(); setShowAddModal(true); }}
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

                {/* 지출 목록 테이블 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="glass-strong rounded-2xl border border-white/10 overflow-hidden"
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                            <span className="ml-3 text-white/50">데이터를 불러오는 중...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-20">
                            <Receipt className="w-16 h-16 mx-auto text-white/10 mb-4" />
                            <p className="text-white/40 text-lg mb-2">등록된 지출 내역이 없습니다</p>
                            <p className="text-white/20 text-sm">위의 '지출 등록' 버튼을 눌러 시작하세요</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/10">
                                        <th className="px-4 py-3 text-left text-white/40 font-medium w-10">
                                            <input
                                                type="checkbox"
                                                checked={filtered.length > 0 && selectedExpenses.length === filtered.filter(e => e.id).length}
                                                onChange={e => {
                                                    if (e.target.checked) {
                                                        setSelectedExpenses(filtered.map(ex => ex.id!).filter(Boolean));
                                                    } else {
                                                        setSelectedExpenses([]);
                                                    }
                                                }}
                                                className="rounded"
                                            />
                                        </th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">날짜</th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">사업</th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">세부 항목</th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">구분</th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">품명/내용</th>
                                        <th className="px-4 py-3 text-left text-white/40 font-medium">거래처</th>
                                        <th className="px-4 py-3 text-right text-white/40 font-medium">금액</th>
                                        <th className="px-4 py-3 text-center text-white/40 font-medium">결제</th>
                                        <th className="px-4 py-3 text-center text-white/40 font-medium">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((e, i) => (
                                        <tr key={e.id || i} className="border-b border-white/5 hover:bg-white/5 transition">
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedExpenses.includes(e.id!)}
                                                    onChange={() => toggleExpenseSelection(e.id!)}
                                                    className="rounded"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-white/60 whitespace-nowrap">{formatDate(e.date)}</td>
                                            <td className="px-4 py-3 text-white/60">{getProjectName(e)}</td>
                                            <td className="px-4 py-3 text-white/50">{getExpenseBudgetItemName(e)}</td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-1 rounded-lg bg-primary-500/10 text-primary-300 text-xs">{e.category}</span>
                                            </td>
                                            <td className="px-4 py-3 text-white/80">{e.description}</td>
                                            <td className="px-4 py-3 text-white/50">{e.vendor || '-'}</td>
                                            <td className="px-4 py-3 text-right text-white font-semibold">{(e.amount || 0).toLocaleString()}원</td>
                                            <td className="px-4 py-3 text-center text-white/50 text-xs">{e.paymentMethod}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={() => handleEdit(e)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-blue-400 transition">
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDelete(e.id!)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-red-400 transition">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-white/5">
                                        <td colSpan={7} className="px-4 py-3 text-right text-white/60 font-semibold">합계</td>
                                        <td className="px-4 py-3 text-right text-white font-bold text-lg">{totalAmount.toLocaleString()}원</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* ─── 지출 등록/수정 모달 ─── */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                        onClick={() => { setShowAddModal(false); resetForm(); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f1129] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-white">
                                    {editingExpense ? '지출 내역 수정' : '새 지출 등록'}
                                </h3>
                                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-2 rounded-xl hover:bg-white/10 text-white/60">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* 영수증 OCR 보조 입력 */}
                            <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <p className="text-green-300 text-sm font-medium flex items-center gap-2">
                                        <Camera className="w-4 h-4" />
                                        영수증 OCR로 자동 입력
                                    </p>
                                    {ocrRawText && (
                                        <button
                                            type="button"
                                            onClick={() => setShowOcrRaw(prev => !prev)}
                                            className="text-xs text-white/45 hover:text-white flex items-center gap-1"
                                        >
                                            {showOcrRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            {showOcrRaw ? '원문 숨기기' : '원문 보기'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-white/35 mb-3">
                                    OCR은 입력칸을 채우는 보조 기능입니다. 자동 저장되지 않으며, 저장 전 내용을 확인해 주세요.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <label className="btn-secondary flex items-center justify-center gap-2 cursor-pointer text-sm">
                                        <Upload className="w-4 h-4" />
                                        파일 선택
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,application/pdf"
                                            className="hidden"
                                            onChange={e => {
                                                setOcrFile(e.target.files?.[0] || null);
                                                setOcrError('');
                                                setOcrMessage('');
                                            }}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleRunOCR}
                                        disabled={ocrLoading || !ocrFile}
                                        className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                    >
                                        {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                        OCR 실행
                                    </button>
                                    {ocrFile && <span className="text-xs text-white/45 self-center truncate">선택됨: {ocrFile.name}</span>}
                                </div>
                                {ocrError && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">{ocrError}</div>}
                                {ocrMessage && <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 text-xs">{ocrMessage}</div>}
                                {ocrParsed?.items?.length ? (
                                    <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                                        <p className="text-xs text-white/50 mb-2">감지된 품목 {ocrParsed.items.length}개</p>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => applyOCRToForm(ocrParsed, 'firstItem')} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs hover:bg-white/15">첫 번째 품목으로 채우기</button>
                                            <button type="button" onClick={() => applyOCRToForm(ocrParsed, 'allItems')} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-200 text-xs hover:bg-emerald-500/25">전체 품목 합계로 채우기</button>
                                        </div>
                                        <p className="text-[11px] text-white/30 mt-2 line-clamp-2">{buildItemsSummary(ocrParsed.items)}</p>
                                    </div>
                                ) : null}
                                {showOcrRaw && ocrRawText && (
                                    <pre className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10 text-white/55 text-xs max-h-44 overflow-y-auto whitespace-pre-wrap font-sans">
                                        {ocrRawText}
                                    </pre>
                                )}
                            </div>

                            {/* 폼 필드 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">연결 사업</label>
                                    <select
                                        value={form.projectId || ''}
                                        onChange={e => {
                                            const project = budgetProjects.find(p => p.id === e.target.value);
                                            setForm(prev => ({
                                                ...prev,
                                                projectId: project?.id || '',
                                                projectName: project?.name || '',
                                                budgetItemId: '',
                                                budgetItemName: '',
                                            }));
                                        }}
                                        className="input-field"
                                    >
                                        <option value="">사업 미지정</option>
                                        {budgetProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                                    </select>
                                    <p className="text-xs text-white/35 mt-1">영수증 OCR을 실행해도 선택한 사업은 덮어쓰지 않습니다.</p>
                                </div>
                                {form.projectId && (
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-white/70 mb-1.5">세부 예산 항목</label>
                                        <select
                                            value={form.budgetItemId || ''}
                                            onChange={e => {
                                                const project = budgetProjects.find(p => p.id === form.projectId);
                                                const item = normalizeBudgetItems(project).find(budgetItem => budgetItem.id === e.target.value);
                                                setForm(prev => ({
                                                    ...prev,
                                                    budgetItemId: item?.id || '',
                                                    budgetItemName: item?.name || '',
                                                }));
                                            }}
                                            className="input-field"
                                        >
                                            <option value="">항목 미지정</option>
                                            {normalizeBudgetItems(budgetProjects.find(p => p.id === form.projectId)).map(item => (
                                                <option key={item.id} value={item.id}>{item.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-white/35 mt-1">세부 항목 선택은 선택사항입니다. OCR 실행 시 이 값은 유지됩니다.</p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">지출일자 *</label>
                                    <input
                                        type="date"
                                        value={form.date || ''}
                                        onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">예산과목 *</label>
                                    <select
                                        value={form.category || '사업비'}
                                        onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                                        className="input-field"
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">세부항목 (세부사업명)</label>
                                    <input
                                        type="text"
                                        placeholder="예: 직업재활서비스, 장애인 취업지원"
                                        value={form.budgetItem || ''}
                                        onChange={e => setForm(prev => ({ ...prev, budgetItem: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">품명/내용 *</label>
                                    <input
                                        type="text"
                                        placeholder="예: 프로그램 사무용품 구입"
                                        value={form.description || ''}
                                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>

                                {/* 수량·단가·금액 */}
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">수량</label>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="1"
                                        value={form.quantity || ''}
                                        onChange={e => {
                                            const qty = parseInt(e.target.value) || 1;
                                            setForm(prev => ({ ...prev, quantity: qty, supplyAmount: qty * (prev.unitPrice || 0) }));
                                        }}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">단가(원)</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={form.unitPrice || ''}
                                        onChange={e => {
                                            const up = parseInt(e.target.value) || 0;
                                            setForm(prev => ({ ...prev, unitPrice: up, supplyAmount: (prev.quantity || 1) * up }));
                                        }}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">공급가액(원)</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={form.supplyAmount || ''}
                                        onChange={e => {
                                            const sa = parseInt(e.target.value) || 0;
                                            setForm(prev => ({ ...prev, supplyAmount: sa, amount: sa + (prev.vat || 0) }));
                                        }}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">부가세(원)</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={form.vat || ''}
                                        onChange={e => {
                                            const v = parseInt(e.target.value) || 0;
                                            setForm(prev => ({ ...prev, vat: v, amount: (prev.supplyAmount || 0) + v }));
                                        }}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">총 금액(원) *</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={form.amount || ''}
                                        onChange={e => setForm(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                                        className="input-field font-semibold"
                                    />
                                </div>

                                {/* 거래처 정보 */}
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">거래처</label>
                                    <input
                                        type="text"
                                        placeholder="거래처명"
                                        value={form.vendor || ''}
                                        onChange={e => setForm(prev => ({ ...prev, vendor: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">사업자등록번호</label>
                                    <input
                                        type="text"
                                        placeholder="000-00-00000"
                                        value={form.vendorBizNo || ''}
                                        onChange={e => setForm(prev => ({ ...prev, vendorBizNo: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>

                                {/* 결제 정보 */}
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">결제방법</label>
                                    <select
                                        value={form.paymentMethod || '카드'}
                                        onChange={e => setForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                        className="input-field"
                                    >
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">카드 종류</label>
                                    <input
                                        type="text"
                                        placeholder="예: 신한카드, BC카드"
                                        value={form.cardType || ''}
                                        onChange={e => setForm(prev => ({ ...prev, cardType: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">카드 끝 4자리</label>
                                    <input
                                        type="text"
                                        placeholder="1234"
                                        maxLength={4}
                                        value={form.cardLastFour || ''}
                                        onChange={e => setForm(prev => ({ ...prev, cardLastFour: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">승인번호</label>
                                    <input
                                        type="text"
                                        placeholder="승인번호"
                                        value={form.approvalNo || ''}
                                        onChange={e => setForm(prev => ({ ...prev, approvalNo: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">비고</label>
                                    <input
                                        type="text"
                                        placeholder="메모사항"
                                        value={form.notes || ''}
                                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={handleSubmit} className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    {editingExpense ? '수정 완료' : '지출 등록'}
                                </button>
                                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="btn-secondary">
                                    취소
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── 지출품의서 설정 모달 ─── */}
            <AnimatePresence>
                {showDocModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                        onClick={() => setShowDocModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f1129] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary-400" />
                                    지출품의서 생성
                                </h3>
                                <button onClick={() => setShowDocModal(false)} className="p-2 rounded-xl hover:bg-white/10 text-white/60">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">기관명 *</label>
                                    <input
                                        type="text"
                                        placeholder="예: ○○ 직업재활센터"
                                        value={docForm.centerName}
                                        onChange={e => setDocForm(prev => ({ ...prev, centerName: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">제목 *</label>
                                    <input
                                        type="text"
                                        placeholder="예: 20XX년 XX월 프로그램 운영비 지출"
                                        value={docForm.title}
                                        onChange={e => setDocForm(prev => ({ ...prev, title: e.target.value }))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">목적/용도</label>
                                    <textarea
                                        placeholder="지출 목적을 기재하세요"
                                        value={docForm.purpose}
                                        onChange={e => setDocForm(prev => ({ ...prev, purpose: e.target.value }))}
                                        className="input-field min-h-[80px] resize-y"
                                        rows={3}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-white/70">결제선 (최대 5명)</label>
                                        {docForm.approvers.length < 5 && (
                                            <button 
                                                onClick={() => setDocForm(prev => ({ ...prev, approvers: [...prev.approvers, { title: '직위', name: '' }] }))}
                                                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                            >
                                                <Plus className="w-3 h-3" /> 결제자 추가
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {docForm.approvers.map((app, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input
                                                    type="text"
                                                    placeholder="직위(예: 팀장)"
                                                    value={app.title}
                                                    onChange={e => {
                                                        setDocForm(prev => ({
                                                            ...prev,
                                                            approvers: prev.approvers.map((approver, index) => index === idx ? { ...approver, title: e.target.value } : approver),
                                                        }));
                                                    }}
                                                    className="input-field !py-2 text-xs w-24"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="성명"
                                                    value={app.name}
                                                    onChange={e => {
                                                        setDocForm(prev => ({
                                                            ...prev,
                                                            approvers: prev.approvers.map((approver, index) => index === idx ? { ...approver, name: e.target.value } : approver),
                                                        }));
                                                    }}
                                                    className="input-field !py-2 text-xs flex-1"
                                                />
                                                {docForm.approvers.length > 1 && (
                                                    <button 
                                                        onClick={() => setDocForm(prev => ({ ...prev, approvers: prev.approvers.filter((_, i) => i !== idx) }))}
                                                        className="p-1.5 text-white/30 hover:text-red-400 transition"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                                    <p className="text-white/50 text-sm">
                                        선택된 지출 항목: <span className="text-primary-300 font-bold">{selectedExpenses.length}건</span>
                                        {selectedExpenses.length > 0 && (
                                            <span className="ml-2">
                                                (합계: {expenses.filter(e => selectedExpenses.includes(e.id!)).reduce((s, e) => s + (e.amount || 0), 0).toLocaleString()}원)
                                            </span>
                                        )}
                                    </p>
                                    {selectedExpenses.length === 0 && (
                                        <p className="text-yellow-400/60 text-xs mt-1">목록에서 체크박스로 항목을 선택한 후 생성해주세요.</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleCreateDoc}
                                    disabled={selectedExpenses.length === 0 || !docForm.centerName || !docForm.title}
                                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    지출품의서 미리보기
                                </button>
                                <button onClick={() => setShowDocModal(false)} className="btn-secondary">
                                    취소
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── 지출품의서 미리보기/인쇄 ─── */}
            <AnimatePresence>
                {showDocPreview && (
                    <ExpenseDocument
                        data={{
                            ...docForm,
                            expenses: expenses.filter(e => selectedExpenses.includes(e.id!)),
                            totalAmount: expenses.filter(e => selectedExpenses.includes(e.id!)).reduce((s, e) => s + (e.amount || 0), 0),
                        }}
                        onClose={() => setShowDocPreview(false)}
                    />
                )}
            </AnimatePresence>

        </div>
    );
}
