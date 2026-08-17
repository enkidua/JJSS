export interface Seeker {
    id?: string;
    status: string; // '현재상황' - 예: 구직중, 취업, 대기중, 서비스 제한
    seekerId: string; // '구직자ID'
    name: string; // '이름'
    age: number | string; // '나이'
    birthDate?: string; // 생년월일 (기존 데이터 호환을 위한 선택 필드)
    address?: string; // 주소 (기존 데이터 호환을 위한 선택 필드)
    phone?: string; // 연락처 (기존 데이터 호환을 위한 선택 필드)
    disabilityType: string; // '장애유형'
    severity: string; // '중경증여부' - 예: 중증, 경증
    desiredJob1: string; // '희망직종1'
    desiredJob2: string; // '희망직종2'
    desiredSalary: string; // '희망임금'
    desiredWorkHours: string; // '희망근무시간'
    desiredLocation: string; // '희망지역'
    recommendingAgency: string; // '추천기관'
    notes: string; // '비고'
    organization: string; // 테넌트 격리용
    createdAt?: string;
    updatedAt?: string | { seconds: number };
}

export interface JobOpening {
    id?: string;
    counselDate: string; // '상담일자'
    companyName: string; // '회사명'
    location: string; // '근무지역'
    reqDisabilityType: string; // '모집장애유형'
    reqSeverity: string; // '모집 중경증'
    openingsCount: number | string; // '모집인원'
    jobRole: string; // '직무'
    salary: string; // '급여'
    workHours: string; // '근무시간'
    jobDescription?: string; // '직무내용'
    requirements?: string; // '요구조건'
    accommodations?: string; // '배려사항'
    hiringStatus?: '모집중' | '면접예정' | '채용완료' | '보류' | '마감' | string; // '채용상태'
    contactPerson?: string; // '담당자'
    contactPhone?: string; // '연락처'
    organization: string; // 테넌트 격리용
    createdAt?: string;
    updatedAt?: string | { seconds: number };
}

export interface MatchDetails {
    jobRole: { score: number; comment: string };
    severity: { score: number; comment: string };
    salary: { score: number; comment: string };
    location: { score: number; comment: string };
    disability: { score: number; comment: string };
    workHours: { score: number; comment: string };
}

export interface MatchResult {
    seeker: Seeker;
    job: JobOpening;
    totalScore: number;
    baseScore: number;
    synergyBonus: number;
    details: MatchDetails;
    combinedComment: string;
}
