// ─── 고용지원(WorkMate) 화면의 AI 프롬프트 모음 ───
// 문구를 바꾸면 생성 결과가 달라지므로, 화면 코드와 분리해 이곳에서만 관리합니다.
import { withClientContextPrompt } from '../../services/clientContextService';
import type { CaseDocument } from '../../types/caseDocument';
import type { JobOpening, Seeker } from '../../types/matching';
import type { CaseDocumentAction, InterviewForm, JobAnalysisForm } from './types';

export const buildSeekerContext = (s: Seeker) => `
[이용자 정보]
이름: ${s.name} / 나이: ${s.age}
장애유형: ${s.disabilityType} (${s.severity})
희망직종: ${s.desiredJob1}${s.desiredJob2 ? ` / ${s.desiredJob2}` : ''}
희망지역: ${s.desiredLocation} / 희망임금: ${s.desiredSalary}
특이사항: ${s.notes || '없음'}`;

// ─── 고용지원 문서 ───

export const EMPLOYMENT_REFINE_INSTRUCTION = '현재 작성자가 수정한 표현과 의도를 유지하면서 직업재활 실무 문서 형식에 맞게 보완해 주세요. 관찰 사실과 판단을 구분하고, 가능한 경우 지도/교육보다 지원이라는 표현을 우선 사용해 주세요.';

export function buildInterviewPrompt(seeker: Seeker | null, interviewForm: InterviewForm, contextSummary: string) {
    const ctx = seeker ? buildSeekerContext(seeker) : '[이용자 정보]\n선택된 이용자 없음';
    return withClientContextPrompt(`${ctx}

[면접 기본 정보]
면접일: ${interviewForm.date || '확인 필요'}
사업체명: ${interviewForm.companyName || '확인 필요'}
직무: ${interviewForm.jobRole || '확인 필요'}
면접 참여자: ${interviewForm.participants || '확인 필요'}

[면접 내용]
${interviewForm.memo || '담당자 입력 없음'}

[당사자 반응]
${interviewForm.seekerResponse || '확인 필요'}

[사업체 의견]
${interviewForm.companyOpinion || '확인 필요'}

[후속 지원계획]
${interviewForm.supportPlan || '확인 필요'}

위 내용을 바탕으로 직업재활 고용지원 현장에서 바로 사용할 수 있는 [면접일지]를 작성해줘. 관찰 사실과 담당자 판단을 구분하고, 장애인을 존중하는 표현을 사용하며, 후속 지원계획을 구체적으로 정리해.`, contextSummary);
}

function buildSelectedJobContext(job: JobOpening | null, form: JobAnalysisForm) {
    return `[선택한 사업체/구인정보]
회사명: ${job?.companyName || form.companyName || '확인 필요'}
직무: ${job?.jobRole || form.jobRole || '확인 필요'}
근무지역: ${job?.location || '확인 필요'}
근무시간: ${job?.workHours || '확인 필요'}
급여: ${job?.salary || '확인 필요'}
모집장애유형: ${job?.reqDisabilityType || '확인 필요'}
모집 중경증: ${job?.reqSeverity || '확인 필요'}
모집인원: ${job?.openingsCount || '확인 필요'}
직무내용: ${job?.jobDescription || '확인 필요'}
요구조건: ${job?.requirements || '확인 필요'}
배려사항: ${job?.accommodations || '확인 필요'}
채용상태: ${job?.hiringStatus || '확인 필요'}
담당자: ${job?.contactPerson || '확인 필요'}
연락처: ${job?.contactPhone || '확인 필요'}`;
}

export const buildJobAnalysisPrompt = (job: JobOpening | null, form: JobAnalysisForm, photoNames: string[]) => `${buildSelectedJobContext(job, form)}

[직무분석 기본 정보]
사업체명: ${job?.companyName || form.companyName || '확인 필요'}
직무명: ${job?.jobRole || form.jobRole || '확인 필요'}
사진 참고: ${photoNames.length ? `${photoNames.length}장 첨부됨 (${photoNames.join(', ')})` : '첨부 사진 없음'}

[간략 사업체/직무 특성]
${form.traits || form.tasks || form.environment || '담당자 입력 없음'}

[사업주 면담 내용]
${form.interviewNotes || '확인 필요'}

[추가 참고 메모]
주요 과업: ${form.tasks || '확인 필요'}
작업환경: ${form.environment || '확인 필요'}
필요한 신체/인지/의사소통 능력: ${form.abilities || '확인 필요'}
위험요소: ${form.risks || '확인 필요'}
필요한 지원: ${form.supports || '확인 필요'}
적합 이용자 특성: ${form.suitableSeeker || '확인 필요'}

[사진 분석 지시]
첨부 사진이 있으면 작업환경, 동선, 도구, 사람의 움직임, 위험요소, 협력 필요성, 물품 이동 여부, 외부인 출입 가능성, 소음/조명/공간 제약을 관찰해 직무분석지에 반영해줘.
사진으로 확인하기 어려운 내용은 '확인 필요' 또는 '사업주 면담 필요'로 작성해.

[분량 및 누락 방지 지침]
- 아래 1~7번 항목은 절대 생략하지 말고 모두 작성
- 각 항목은 담당자가 현장에서 바로 확인하고 사용할 수 있을 정도로 충분한 분량으로 작성
- 특히 4. 세부과제는 작업 위치, 작업 순서, 사용 도구, 우세손/비우세손 사용, 속도, 주의사항, 위험요소, 확인 필요사항을 가능한 한 빠짐없이 단계별로 매우 자세히 작성
- 정보가 부족한 항목은 삭제하지 말고 '확인 필요' 또는 '사업주 면담 필요'로 남김
- 전체 직무분석지는 길어져도 중간 생략하지 말고, 짧은 요약으로 끝내지 않음

[문체 지침]
- 모든 응답은 한글로 작성
- 장애인을 존중하는 표현 사용
- 모든 문장은 음슴체, 개조식으로 작성
- '지도'나 '교육' 대신 가능한 경우 '지원' 표현 사용
- 전문성 있는 공공기관 문서로 작성
- 내용 축약하지 않음
- 어려운 용어, 차가운 문체, 외래어를 피하고 현장 실무자가 이해하기 쉽게 작성
- 능동태 사용
- '쌤' 표현은 '선생님'으로 변경
- '상태' 표현은 피하고 필요한 경우 '상황', '특성', '지원 필요사항'으로 작성

[반드시 포함할 출력 양식]
1. 물품입출고
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

2. 외부인출입
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

3. 협력작업
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

4. 세부과제
- 직무 수행 방법을 모르는 사람이 보아도 수행 가능할 정도로 아주 상세하게 작성
- 우세손과 비우세손 사용 구분
- 작업 위치, 작업 순서, 사용 도구, 우세손/비우세손 사용, 속도, 주의사항, 위험요소, 확인 필요사항 작성
- 각 세부과제는 번호 목록으로 나누고, 필요한 경우 준비 단계, 수행 단계, 확인 단계, 정리 단계로 세분화
- 확인되지 않은 작업조건은 생략하지 말고 '확인 필요' 또는 '사업주 면담 필요'로 표시

5. 지식/기능
- 배근력, 허리굽히기, 의자 앉기, 쪼그려 앉기, 서기, 계단 오르기, 보행, 손가락 기민성, 눈손협응, 양손협응, 청력, 시력, 지시 이해, 쓰기, 읽기, 수세기, 수리능력, 금전관리, 시간개념, 크기변별, 형태변별, 색변별 등 필요한 기능을 가능한 많이 제시

6. 제공가능한 지원수준
- 발달장애인이 직무 수행 중 제한될 수 있는 부분 고려
- 사진, 표식, 순서카드, 반복 확인, 동료 지원, 작업 순서 단순화 등 현실적인 지원방식 포함

7. 사업주 면담
- 사업체 면담 내용 필수 포함
- 직무조정 관련 내용 포함
- 향후 고용계획 관련 내용 포함
- 수행이 어려울 경우 대체 직무 또는 다른 팀 이동 가능성 등 사업주 의견 포함

위 기준으로 직업재활 고용지원 담당자가 바로 활용할 수 있는 [직무분석지]를 작성해줘.`;

// ─── 사례관리 문서 ───

export function buildCaseMeetingPrompt(seeker: Seeker, meetingInput: string, contextSummary: string) {
    const ctx = buildSeekerContext(seeker);
    return withClientContextPrompt(`${ctx}\n\n--- 담당자가 입력한 사례회의 내용 ---\n${meetingInput || '(담당자 입력 없음)'}\n\n` +
        `위 이용자 정보와 담당자가 입력한 모든 내용을 **단 하나도 누락하지 말고** 상세히 반영하여 전문적인 [사례회의록]을 작성해 줘. \n` +
        `기존 틀(욕구 분석, 현재 상황, 논의 내용(발언자별), 결론)은 유지하되, **담당자가 입력한 모든 키워드와 논의 포인트가 문서에 빠짐없이 기록**되어야 해. \n` +
        `각 항목은 매우 상세하고 논리적인 보고서 형식으로 서술하고, 전체적으로 정보의 밀도가 높고 풍부한 분량이 나오도록 구성해 주길 바라.`, contextSummary);
}

export function buildRehabPlanPrompt(seeker: Seeker, meetingText: string, planInput: string, contextSummary: string) {
    const ctx = buildSeekerContext(seeker);
    const prev = meetingText ? `\n\n[사례회의 핵심 내용]\n${meetingText.substring(0, 800)}` : '';
    return withClientContextPrompt(`${ctx}${prev}\n\n--- 담당자가 입력한 재활계획 내용 ---\n${planInput || '(담당자 입력 없음)'}\n\n위 이용자 정보, 사례회의 내용, 담당자 입력을 모두 참고하여 [직업재활계획서]를 작성해 줘. 강점, 제한점, 종합소견, 직업목표, 장기목표, 단기목표, 수행방법을 포함해.`, contextSummary);
}

export function buildCounselingPrompt(params: {
    seeker: Seeker;
    planText: string;
    meetingText: string;
    history: CaseDocument[];
    counselInput: string;
    contextSummary: string;
}) {
    const { seeker, planText, meetingText, history, counselInput, contextSummary } = params;
    const ctx = buildSeekerContext(seeker);
    // ─── 직업재활계획서 참고 (사례관리 연속성의 핵심) ───
    let planContext = '';
    if (planText) {
        planContext = `\n\n[직업재활계획서 - 사례관리 기준 문서]\n${planText.substring(0, 1200)}`;
    }

    // ─── 사례회의 요약 참고 ───
    let meetingContext = '';
    if (meetingText) {
        meetingContext = `\n\n[사례회의 핵심 요약]\n${meetingText.substring(0, 400)}`;
    }

    // ─── 이전 상담일지/정기평가 참조 (토큰 최적화) ───
    let historyContext = '';
    const historyCount = history.length;
    if (historyCount > 0) {
        const HISTORY_THRESHOLD = 10;
        const recentCount = historyCount > HISTORY_THRESHOLD ? 3 : historyCount;
        const recentHistory = history.slice(-recentCount);

        historyContext = `\n\n--- 이전 사후관리 기록 (총 ${historyCount}건 중 최근 ${recentCount}건) ---\n`;
        historyContext += recentHistory.map(h =>
            `[${h.type === 'counseling' ? '상담' : '정기평가'}]\n${h.content}`
        ).join('\n\n');

        if (historyCount > HISTORY_THRESHOLD) {
            historyContext += `\n\n※ 참고: 이전 ${historyCount - recentCount}건의 상담 기록이 더 있습니다. 위 최근 기록의 맥락을 이어서 작성해 주세요.`;
        }
    }

    let prompt = `${ctx}${planContext}${meetingContext}${historyContext}\n\n--- 담당자가 입력한 상담 내용 ---\n${counselInput || '(담당자 입력 없음)'}\n\n`;
    prompt += '위 이용자 정보, 직업재활계획서의 목표와 수행방법, ';
    if (historyCount > 0) prompt += '이전 진행 경과, ';
    prompt += '담당자 입력을 모두 참고하여 사례관리의 연속성을 유지하는 [상담일지]를 작성해 줘.\n';
    prompt += `상담일시, 장소, 상담내용(재활계획 목표 대비 진전사항 포함), 향후 지원계획, 담당자를 포함해.`;
    return withClientContextPrompt(prompt, contextSummary);
}

export function buildEvaluationPrompt(params: {
    seeker: Seeker;
    planText: string;
    history: CaseDocument[];
    evalInput: string;
    contextSummary: string;
}) {
    const { seeker, planText, history, evalInput, contextSummary } = params;
    // ─── 정기평가: 직업재활계획 평가 + 재수립 ───
    let evalPrompt = `${buildSeekerContext(seeker)}`;

    // 직업재활계획서 전문 참조 (평가 대상)
    if (planText) {
        evalPrompt += `\n\n[현행 직업재활계획서 - 평가 대상 문서]\n${planText}`;
    }

    // 사후관리 기록 (상담 및 평가) 참조
    const followUpCount = history.length;
    if (followUpCount > 0) {
        const recentLogs = followUpCount > 5 ? history.slice(-5) : history;
        evalPrompt += `\n\n--- 최근 사후관리 히스토리 (최근 ${recentLogs.length}건) ---\n`;
        evalPrompt += recentLogs.map(h => `[${h.type === 'counseling' ? '상담' : '정기평가'} 기록]\n${h.content}`).join('\n\n');
    }

    evalPrompt += `\n\n--- 담당자가 입력한 평가 내용 ---\n${evalInput || '(담당자 입력 없음)'}\n\n`;
    evalPrompt += `위 이용자 정보, 직업재활계획서, 상담일지 기록, 담당자 입력을 참고하여 [정기평가서]를 작성해 줘.\n`;
    evalPrompt += `다음 구성을 포함해:\n`;
    evalPrompt += `1. 평가 개요 (평가일, 평가 기간, 평가자)\n`;
    evalPrompt += `2. 직업재활계획 달성도 평가\n`;
    evalPrompt += `   - 장기목표 달성 여부 및 근거\n`;
    evalPrompt += `   - 단기목표별 달성 여부 (달성/부분달성/미달성) 및 구체적 근거\n`;
    evalPrompt += `   - 수행방법 이행 여부\n`;
    evalPrompt += `3. 종합 평가 의견\n`;
    evalPrompt += `4. 수정 직업재활계획서\n`;
    evalPrompt += `   - 수정 사유\n`;
    evalPrompt += `   - 새로운 직업목표 / 장기목표 / 단기목표 / 수행방법\n`;
    evalPrompt += `   - 향후 지원 방향\n`;

    return withClientContextPrompt(evalPrompt, contextSummary);
}

export const CASE_DOCUMENT_TITLES: Record<CaseDocumentAction, string> = {
    meeting: '사례회의록',
    plan: '직업재활계획서',
    counseling: '상담일지',
    evaluation: '정기평가서',
};

export const CASE_REFINE_INSTRUCTION = '사례관리의 연속성이 보이도록 하고, 담당자가 직접 수정한 표현은 우선 보존해 주세요.';

/** "현재 내용 기반 보완" 시 함께 보낼 이전 기록(보완 대상 문서 자신은 제외) */
export function buildCasePreviousRecords(type: CaseDocumentAction, meetingText: string, planText: string, history: CaseDocument[]) {
    return [
        meetingText && type !== 'meeting' ? `[사례회의록]\n${meetingText}` : '',
        planText && type !== 'plan' ? `[직업재활계획서]\n${planText}` : '',
        history.length ? history.slice(-5).map((doc, index) => `[최근 ${doc.type === 'counseling' ? '상담일지' : '정기평가'} ${index + 1}]\n${doc.content}`).join('\n\n') : '',
    ].filter(Boolean).join('\n\n');
}

export const getCasePromptType = (type: CaseDocumentAction) =>
    type === 'meeting' ? 'case_meeting' : type === 'plan' ? 'rehab_plan' : type;
