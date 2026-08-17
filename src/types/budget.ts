export interface Approver {
    title: string;
    name: string;
}

export interface Expense {
    id?: string;
    date: string;               // 지출일자
    category: string;           // 예산과목 (사업비, 프로그램사업비 등)
    budgetItem: string;         // 세부항목 (세부사업명)
    budgetItemId?: string;      // 사업별 세부 예산 항목 ID (선택)
    budgetItemName?: string;    // 사업별 세부 예산 항목명 스냅샷 (선택)
    projectId?: string;         // 사업별 예산 관리용 프로젝트 ID (선택)
    projectName?: string;       // 사업명 스냅샷 (선택)
    description: string;        // 품명/내용
    quantity: number;           // 수량
    unitPrice: number;          // 단가
    supplyAmount: number;       // 공급가액
    vat: number;                // 부가세
    amount: number;             // 총 금액 (공급가액 + 부가세)
    vendor: string;             // 거래처
    vendorBizNo: string;        // 거래처 사업자등록번호
    paymentMethod: string;      // 결제방법 (카드, 현금, 계좌이체 등)
    cardType: string;           // 카드 종류 (법인카드, 개인카드 등)
    cardLastFour: string;       // 카드 끝 4자리
    approvalNo: string;         // 승인번호
    receiptUrl?: string;        // 영수증 이미지 URL (Firebase Storage)
    notes?: string;             // 비고
    organization: string;       // 테넌트 격리용
    createdAt?: any;            // serverTimestamp
    createdBy?: string;         // 작성자 UID
}

export interface BudgetProjectItem {
    id: string;
    name: string;
    amount: number;
    memo?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface BudgetProject {
    id: string;
    name: string;               // 사업명
    totalBudget: number;        // 총예산
    period: string;             // 사업기간 또는 연도
    notes?: string;             // 비고
    budgetItems?: BudgetProjectItem[]; // 세부 예산 항목
    createdAt: string;
    updatedAt: string;
}

export interface ExpenseDocumentData {
    centerName: string;         // 센터명
    title: string;              // 제목
    purpose: string;            // 목적/용도
    expenses: Expense[];        // 지출 내역 목록
    totalAmount: number;        // 합계
    approvers: Approver[];      // 결제선 (최대 5명)
}
