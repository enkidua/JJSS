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
    | 'document_review';
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
}
