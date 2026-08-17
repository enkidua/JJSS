import type { Seeker } from '../types/matching';
import type { RehabPlanFormData, RehabPlanGoal } from '../types/rehabPlan';

const SECTION_HEADINGS = [
    '성명', '장애유형', '생년월일', '주소', '연락처',
    '교육', '훈련', '장애력', '취업경력', '취업 경력',
    '직업에 있어 당사자에게 중요한 점', '취업욕구', '취업 욕구', '가정환경', '가정 환경', '기타정보', '기타 정보',
    '당사자 및 보호자 의견', '이용자 및 보호자 의견', '욕구', '상황',
    '사례회의 일시', '일시', '장소', '목적', '논의 내용', '회의 내용', '내용', '결론',
    '강점', '제한점', '고려사항', '종합소견', '결과 및 지원방향', '지원방향', '비고',
    '직업목표', '장기목표', '단기목표', '서비스 기간', '수행방법', '수행방법/담당자', '목표달성여부',
    '담당자', '작성일자', '참석자', '이용자',
];

function normalizeHeading(value: string) {
    return value
        .replace(/^\s*(?:[■▶●○◆◇□▪·*-]|\d+[.)]|[가-힣][.)])\s*/u, '')
        .replace(/^\s*#{1,6}\s*/u, '')
        .replace(/[\s*_`#[\]]+/g, '')
        .replace(/[\s/]+/g, '')
        .replace(/[:：]\s*$/, '')
        .trim();
}

function splitHeadingAndValue(line: string): { heading: string; value: string } {
    const cleaned = line
        .replace(/^\s*(?:[■▶●○◆◇□▪·*-]|\d+[.)]|[가-힣][.)])\s*/u, '')
        .replace(/^\s*#{1,6}\s*/u, '')
        .trim();
    const separatorIndex = cleaned.search(/[:：]/);
    if (separatorIndex < 0) return { heading: cleaned, value: '' };
    return {
        heading: cleaned.slice(0, separatorIndex).trim(),
        value: cleaned.slice(separatorIndex + 1).trim(),
    };
}

function isKnownHeading(line: string) {
    const { heading } = splitHeadingAndValue(line);
    const normalized = normalizeHeading(heading);
    return SECTION_HEADINGS.some(item => normalizeHeading(item) === normalized);
}

function extractSection(text: string, aliases: string[]): string {
    if (!text.trim()) return '';
    const lines = text.replace(/\r/g, '').split('\n');
    const aliasSet = new Set(aliases.map(normalizeHeading));

    for (let index = 0; index < lines.length; index += 1) {
        const { heading, value } = splitHeadingAndValue(lines[index]);
        if (!aliasSet.has(normalizeHeading(heading))) continue;

        const collected = value ? [value] : [];
        for (let next = index + 1; next < lines.length; next += 1) {
            const line = lines[next].trim();
            if (!line) {
                if (collected.length) collected.push('');
                continue;
            }
            if (isKnownHeading(line)) break;
            collected.push(line);
        }
        return collected.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    return '';
}

function extractLabeledValue(text: string, aliases: string[]): string {
    if (!text.trim()) return '';
    const aliasSet = new Set(aliases.map(normalizeHeading));
    for (const line of text.replace(/\r/g, '').split('\n')) {
        const { heading, value } = splitHeadingAndValue(line);
        if (value && aliasSet.has(normalizeHeading(heading))) return value;
    }
    return '';
}

function splitListItems(value: string): string[] {
    if (!value.trim()) return [];
    const lines = value.replace(/\r/g, '').split('\n');
    const items: string[] = [];
    let current = '';

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const looksLikeDate = /^\d{4}[./-]\d{1,2}(?:[./-]\d{1,2})?/u.test(line);
        const marker = looksLikeDate ? null : line.match(/^(?:[■▶●○◆◇□▪·*-]|\d+[.)])\s*(.+)$/u);
        if (marker) {
            if (current) items.push(current.trim());
            current = marker[1].trim();
        } else if (current) {
            current += `\n${line}`;
        } else {
            current = line;
        }
    }
    if (current) items.push(current.trim());
    return items.filter(Boolean);
}

function currentLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

function buildEmploymentNeeds(seeker: Seeker) {
    const jobs = [seeker.desiredJob1, seeker.desiredJob2].filter(Boolean).join(', ');
    return [
        jobs ? `희망직종: ${jobs}` : '',
        seeker.desiredLocation ? `희망지역: ${seeker.desiredLocation}` : '',
        seeker.desiredSalary ? `희망임금: ${seeker.desiredSalary}` : '',
        seeker.desiredWorkHours ? `희망근무시간: ${seeker.desiredWorkHours}` : '',
    ].filter(Boolean).join(' / ');
}

function buildGoals(planText: string): RehabPlanGoal[] {
    const longTermGoals = splitListItems(extractSection(planText, ['장기목표']));
    const shortTermGoals = splitListItems(extractSection(planText, ['단기목표']));
    const methods = splitListItems(extractSection(planText, ['수행방법/담당자', '수행방법']));
    const servicePeriods = splitListItems(extractSection(planText, ['서비스 기간']));
    const count = Math.max(1, longTermGoals.length, shortTermGoals.length, methods.length, servicePeriods.length);

    return Array.from({ length: count }, (_, index) => ({
        longTermGoal: longTermGoals[index] || '',
        shortTermGoal: shortTermGoals[index] || '',
        servicePeriod: servicePeriods[index] || '',
        methodsAndStaff: methods[index] || '',
        achieved: null,
    }));
}

export function createEmptyRehabPlanGoal(): RehabPlanGoal {
    return {
        longTermGoal: '',
        shortTermGoal: '',
        servicePeriod: '',
        methodsAndStaff: '',
        achieved: null,
    };
}

export function mapRehabPlanFormData(seeker: Seeker, planText: string, meetingText: string): RehabPlanFormData {
    const sourceText = [planText, meetingText, seeker.notes || ''].filter(Boolean).join('\n\n');
    const disability = [seeker.disabilityType, seeker.severity ? `(${seeker.severity})` : ''].filter(Boolean).join(' ');
    const meetingContent = extractSection(meetingText, ['논의 내용', '회의 내용', '내용']);

    return {
        approval: { teamLead: '', departmentHead: '', director: '' },
        client: {
            name: seeker.name || extractLabeledValue(sourceText, ['성명', '이름']),
            disabilityType: disability || extractLabeledValue(sourceText, ['장애유형']),
            birthDate: seeker.birthDate || extractLabeledValue(sourceText, ['생년월일']),
            address: seeker.address || extractLabeledValue(sourceText, ['주소']),
            phone: seeker.phone || extractLabeledValue(sourceText, ['연락처', '전화번호']),
        },
        background: {
            education: extractSection(sourceText, ['교육']),
            training: extractSection(sourceText, ['훈련']),
            disabilityHistory: extractSection(sourceText, ['장애력']),
            employmentHistory: extractSection(sourceText, ['취업경력', '취업 경력']),
            importantWorkValue: extractSection(sourceText, ['직업에 있어 당사자에게 중요한 점']),
            employmentNeeds: extractSection(sourceText, ['취업욕구', '취업 욕구']) || buildEmploymentNeeds(seeker),
            familyEnvironment: extractSection(sourceText, ['가정환경', '가정 환경']),
            otherInfo: extractSection(sourceText, ['기타정보', '기타 정보']) || seeker.notes || '',
        },
        opinions: {
            clientAndGuardian: extractSection(meetingText, ['당사자 및 보호자 의견', '이용자 및 보호자 의견', '욕구']),
        },
        caseMeeting: {
            dateTime: extractLabeledValue(meetingText, ['사례회의 일시', '일시']),
            place: extractLabeledValue(meetingText, ['장소']),
            purpose: extractLabeledValue(meetingText, ['목적']),
            content: meetingContent || meetingText.trim(),
            conclusion: extractSection(meetingText, ['결론']),
        },
        strengths: extractSection(planText, ['강점']),
        considerations: extractSection(planText, ['고려사항', '제한점']),
        supportDirection: extractSection(planText, ['결과 및 지원방향', '지원방향', '종합소견']),
        note: extractSection(planText, ['비고']),
        vocationalGoal: extractSection(planText, ['직업목표']),
        goals: buildGoals(planText),
        footer: {
            staff: extractLabeledValue(sourceText, ['담당자']),
            writtenDate: extractLabeledValue(sourceText, ['작성일자']) || currentLocalDate(),
            participants: extractLabeledValue(meetingText, ['참석자']),
            clientName: seeker.name || '',
        },
    };
}
