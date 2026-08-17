import JSZip from 'jszip';
import type { RehabPlanFormData, RehabPlanGoal } from '../types/rehabPlan';
import { saveJjssBlob } from './jjssFileService';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function encodeWordText(value: string) {
    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(escapeXml)
        .join('</w:t><w:br/><w:t xml:space="preserve">');
}

function formatGoalColumn(goals: RehabPlanGoal[], field: keyof Pick<RehabPlanGoal, 'longTermGoal' | 'shortTermGoal' | 'servicePeriod' | 'methodsAndStaff'>) {
    if (goals.length <= 1) return goals[0]?.[field] || '';
    return goals.map((goal, index) => `${index + 1}. ${goal[field] || ''}`.trimEnd()).join('\n');
}

function formatAchievement(goals: RehabPlanGoal[], expected: boolean) {
    if (goals.length <= 1) return goals[0]?.achieved === expected ? '●' : '';
    return goals
        .map((goal, index) => `${index + 1}. ${goal.achieved === expected ? '●' : ''}`.trimEnd())
        .join('\n');
}

function buildTemplateValues(data: RehabPlanFormData): Record<string, string> {
    return {
        approval_team_lead: data.approval.teamLead,
        approval_department_head: data.approval.departmentHead,
        approval_director: data.approval.director,
        client_name: data.client.name,
        client_disability_type: data.client.disabilityType,
        client_birth_date: data.client.birthDate,
        client_address: data.client.address,
        client_phone: data.client.phone,
        background_education: data.background.education,
        background_training: data.background.training,
        background_disability_history: data.background.disabilityHistory,
        background_employment_history: data.background.employmentHistory,
        background_important_work_value: data.background.importantWorkValue,
        background_employment_needs: data.background.employmentNeeds,
        background_family_environment: data.background.familyEnvironment,
        background_other_info: data.background.otherInfo,
        client_guardian_opinion: data.opinions.clientAndGuardian,
        case_meeting_date_time: data.caseMeeting.dateTime,
        case_meeting_place: data.caseMeeting.place,
        case_meeting_purpose: data.caseMeeting.purpose,
        case_meeting_content: data.caseMeeting.content,
        strengths: data.strengths,
        considerations: data.considerations,
        support_direction: data.supportDirection,
        note: data.note,
        vocational_goal: data.vocationalGoal,
        goals_long_term: formatGoalColumn(data.goals, 'longTermGoal'),
        goals_short_term: formatGoalColumn(data.goals, 'shortTermGoal'),
        goals_service_period: formatGoalColumn(data.goals, 'servicePeriod'),
        goals_methods_and_staff: formatGoalColumn(data.goals, 'methodsAndStaff'),
        goals_achieved_yes: formatAchievement(data.goals, true),
        goals_achieved_no: formatAchievement(data.goals, false),
        footer_staff: data.footer.staff,
        footer_written_date: data.footer.writtenDate,
        footer_participants: data.footer.participants,
        footer_client_name: data.footer.clientName,
    };
}

function loadTemplateWithXhr(url: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = () => {
            const response = request.response as ArrayBuffer | null;
            if (response?.byteLength) resolve(response);
            else reject(new Error('직업재활계획서 Word 양식이 비어 있습니다.'));
        };
        request.onerror = () => reject(new Error('직업재활계획서 Word 양식을 불러오지 못했습니다.'));
        request.send();
    });
}

async function loadBundledTemplate() {
    const baseUrl = import.meta.env.BASE_URL || './';
    const templateUrl = new URL(`${baseUrl}templates/rehab-plan-template.docx`, window.location.href).toString();
    try {
        const response = await fetch(templateUrl);
        if (!response.ok) throw new Error('template-fetch-failed');
        const template = await response.arrayBuffer();
        if (!template.byteLength) throw new Error('template-empty');
        return template;
    } catch {
        return loadTemplateWithXhr(templateUrl);
    }
}

export async function createRehabPlanDocxBlob(data: RehabPlanFormData, templateInput?: ArrayBuffer | Uint8Array): Promise<Blob> {
    const template = templateInput || await loadBundledTemplate();
    const zip = await JSZip.loadAsync(template);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('Word 양식의 본문을 찾지 못했습니다.');

    let documentXml = await documentFile.async('string');
    const values = buildTemplateValues(data);
    for (const [key, value] of Object.entries(values)) {
        const token = `{{${key}}}`;
        const occurrences = documentXml.split(token).length - 1;
        if (occurrences !== 1) throw new Error('Word 양식의 필드 구성이 예상과 다릅니다.');
        documentXml = documentXml.replace(token, encodeWordText(value || ''));
    }
    if (/\{\{[a-z0-9_]+\}\}/i.test(documentXml)) {
        throw new Error('Word 양식에 치환되지 않은 필드가 남아 있습니다.');
    }

    zip.file('word/document.xml', documentXml, { createFolders: false });
    return zip.generateAsync({
        type: 'blob',
        mimeType: DOCX_MIME,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
}

export async function downloadRehabPlanAsDocx(data: RehabPlanFormData, fileName: string) {
    const blob = await createRehabPlanDocxBlob(data);
    if (!blob.size) throw new Error('생성된 Word 문서가 비어 있습니다.');

    return saveJjssBlob('rehab-plan', fileName, blob);
}
