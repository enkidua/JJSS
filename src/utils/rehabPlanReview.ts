import type { RehabPlanFormData } from '../types/rehabPlan';

function isBlank(value: string | undefined | null) {
    return !value?.trim();
}

export function getRehabPlanExportWarnings(data: RehabPlanFormData): string[] {
    const warnings: string[] = [];
    const addIfBlank = (value: string, label: string) => {
        if (isBlank(value)) warnings.push(`${label} 항목이 입력되지 않았습니다.`);
    };

    addIfBlank(data.client.name, '성명');
    addIfBlank(data.client.disabilityType, '장애유형');
    addIfBlank(data.client.birthDate, '생년월일');
    addIfBlank(data.client.address, '주소');
    addIfBlank(data.client.phone, '연락처');
    addIfBlank(data.vocationalGoal, '직업목표');

    if (!data.goals.length) {
        warnings.push('장기목표, 단기목표, 서비스 기간, 수행방법/담당자가 입력되지 않았습니다.');
    } else {
        data.goals.forEach((goal, index) => {
            const suffix = data.goals.length > 1 ? ` ${index + 1}` : '';
            addIfBlank(goal.longTermGoal, `장기목표${suffix}`);
            addIfBlank(goal.shortTermGoal, `단기목표${suffix}`);
            addIfBlank(goal.servicePeriod, `서비스 기간${suffix}`);
            addIfBlank(goal.methodsAndStaff, `수행방법/담당자${suffix}`);
        });
        if (data.goals.some(goal => goal.achieved === null)) {
            warnings.push('목표달성여부가 미확인 상태입니다.');
        }
    }

    addIfBlank(data.caseMeeting.dateTime, '사례회의 일시');
    addIfBlank(data.caseMeeting.place, '사례회의 장소');
    addIfBlank(data.caseMeeting.purpose, '사례회의 목적');
    addIfBlank(data.caseMeeting.content, '사례회의 내용');
    addIfBlank(data.caseMeeting.conclusion, '사례회의 결론');
    addIfBlank(data.strengths, '강점');
    addIfBlank(data.considerations, '고려사항');
    addIfBlank(data.supportDirection, '결과 및 지원방향');
    addIfBlank(data.footer.staff, '담당자');
    addIfBlank(data.footer.writtenDate, '작성일자');

    return warnings;
}
