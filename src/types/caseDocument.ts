export type CaseDocumentType =
    | 'workflow'
    | 'meeting'
    | 'plan'
    | 'counseling'
    | 'evaluation'
    | 'matching_opinion'
    | 'employment_matching'
    | 'interview_note'
    | 'employment_interview_note'
    | 'job_analysis'
    | 'document_review'
    /** 직업평가 화면의 결과분석·종합소견서 이력(이용자 연결은 선택. 연결하지 않으면 seekerId·seekerName은 빈 문자열) */
    | 'vocational_evaluation'
    /** 지원고용 회차 전체(JSON). src/features/supportedEmployment/storage.ts */
    | 'supported_employment'
    /** 직업평가 워크벤치 — 평가 회차(JSON). src/features/vocationalEvaluation/storage.ts */
    | 've_episode'
    /** 직업평가 워크벤치 — 검사 세션(JSON) */
    | 've_session'
    /** 직업평가 워크벤치 — 공단 공식 결과지에서 확인한 값(JSON). PDF 원본은 저장하지 않는다 */
    | 've_source_document'
    /** 직업평가 워크벤치 — 직업평가보고서 한 버전(JSON) */
    | 've_report';
export type CaseDocumentTab = 'case' | 'docs' | 'employment';

export interface CaseDocument {
    id?: string;
    seekerId: string;       // 이용자 ID
    seekerName: string;     // 이용자 이름 (검색/표시용)
    type: CaseDocumentType;  // 문서 종류
    content: string;        // 문서 내용
    tab: CaseDocumentTab;   // 어떤 탭에서 작성했는지
    organization: string;   // 테넌트 격리용
    createdAt?: any;        // serverTimestamp
    updatedAt?: any;
    source?: 'case' | 'matching' | 'training' | 'evaluation' | string;
    jobId?: string;
    companyName?: string;
    jobRole?: string;
    location?: string;
    photoFileNames?: string[];
    photoCount?: number;
    /** 'vocational_evaluation' 문서의 제목과 종류(결과분석/종합소견서) */
    title?: string;
    evaluationKind?: 'analysis' | 'report';
    /** localStorage 평가 이력에서 옮겨 온 경우 원래 항목 ID(중복 이관 방지용) */
    legacyHistoryId?: string;
}
