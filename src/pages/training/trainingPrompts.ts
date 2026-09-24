import { buildCurrentContentRegenerationPrompt } from '../../services/documentRegenerationService';
import { withClientContextPrompt } from '../../services/clientContextService';
import type { Seeker } from '../../types/matching';
import {
    programDefinitions,
    type AttendanceStats,
    type InsightMode,
    type ProgressEntry,
    type Trainee,
    type TrainingRecord,
    type TrainingRoom,
} from './trainingModel';

/** 담당자 이름이 비어 있으면 프롬프트에 담당자 줄을 넣지 않습니다. */
function managerLine(manager: string, format: (name: string) => string) {
    const name = manager.trim();
    return name ? `\n${format(name)}` : '';
}

export function buildSeekerContext(trainee: Trainee | null, seeker: Seeker | null, room: TrainingRoom) {
    if (!trainee) return '';
    return `
[이용자 기본 정보]
성명: ${trainee.name}
나이: ${seeker?.age || '확인 필요'}
장애유형: ${seeker?.disabilityType || trainee.memo || '확인 필요'}
중경증: ${seeker?.severity || '확인 필요'}
희망직무: ${seeker?.desiredJob1 || seeker?.desiredJob2 || '확인 필요'}
희망지역: ${seeker?.desiredLocation || '확인 필요'}
소속 훈련실: ${room.name}
훈련실 대표 프로그램: ${room.program || '확인 필요'}
보유능력/특이사항: ${seeker?.notes || trainee.memo || '확인 필요'}`;
}

interface TrainingPromptInput {
    seekerContext: string;
    record: TrainingRecord;
    manager: string;
    contextSummary: string;
}

export function buildPlanPrompt({ seekerContext, record, manager, contextSummary }: TrainingPromptInput) {
    const basePrompt = `다음 내용을 바탕으로 직업훈련에 특화된 훈련계획서를 작성해줘. 직업재활계획서 형식을 참고하되, 훈련목표, 세부 훈련프로그램, 수행방법, 평가방법, 담당자 지원계획이 중심이 되게 작성해.

${seekerContext}
[훈련기간] ${record.trainingPeriod}
[훈련실] ${record.planRoom}
[담당자 간략 입력]
${record.planMemo || '담당자 입력 없음'}

위 간략 입력${record.plan ? '과 수정된 훈련계획서' : ''}을 바탕으로 현재 수행수준, 훈련 필요도, 장기목표, 단기목표, 적용 프로그램, 지원계획, 평가계획을 자연스럽게 구분해서 작성해줘. 내용이 부족한 부분은 직업훈련 현장에서 일반적으로 필요한 항목을 보수적으로 추정하되, 확인이 필요한 부분은 '확인 필요'로 표시해.${managerLine(manager, name => `[담당자] ${name}`)}`;
    return record.plan
        ? buildCurrentContentRegenerationPrompt({
            documentTitle: '직업훈련계획서',
            currentContent: record.plan,
            userContext: seekerContext,
            contextSummary,
            draftInstruction: basePrompt,
            additionalInstruction: '현재 훈련계획서의 표현과 담당자 수정 의도를 유지하면서 부족한 근거, 평가방법, 지원계획만 보완해 주세요.',
        })
        : withClientContextPrompt(basePrompt, contextSummary);
}

export function buildCounselingPrompt({ seekerContext, record, manager, contextSummary }: TrainingPromptInput) {
    const historyContext = record.counselingHistory.length > 0
        ? record.counselingHistory.map((item, index) => `[이전 훈련 상담일지 ${index + 1}]\n${item}`).join('\n\n')
        : '이전 훈련 상담일지 없음';
    const basePrompt = `다음 내용을 바탕으로 직업훈련 상담일지를 작성해줘. 고용지원의 사례관리 문서 연속작성처럼 기존 훈련계획과 이전 상담일지 흐름을 이어서 작성해.

${seekerContext}

[기준 훈련계획서]
${record.plan || '아직 작성되지 않음'}

[이전 상담 기록]
${historyContext}

[이번 상담 입력]
상담일시: ${record.counselingDate}
상담장소: ${record.counselingPlace}
이번 상담 메모:
${record.counselingMemo || '담당자 입력 없음'}

위 메모${record.counselingDraft ? '와 수정된 상담일지' : ''}를 바탕으로 훈련 참여 및 수행상황, 상담 주요 이슈, 담당자 피드백, 향후 훈련계획이 드러나도록 상담일지 형식으로 정리해줘. 이전 기록이 있으면 반복하지 말고 다음 회기 흐름으로 이어줘.${managerLine(manager, name => `담당자: ${name}`)}`;
    return record.counselingDraft
        ? buildCurrentContentRegenerationPrompt({
            documentTitle: '직업훈련 상담일지',
            currentContent: record.counselingDraft,
            userContext: seekerContext,
            previousRecords: historyContext,
            contextSummary,
            draftInstruction: basePrompt,
            additionalInstruction: '현재 상담일지의 흐름과 담당자 표현을 유지하고, 반복을 줄이며 다음 회기 지원계획을 보완해 주세요.',
        })
        : withClientContextPrompt(basePrompt, contextSummary);
}

export function buildEvaluationPrompt({ seekerContext, record, manager, contextSummary }: TrainingPromptInput) {
    const basePrompt = `다음 내용을 바탕으로 직업훈련 정기평가서를 작성해줘. 훈련계획 달성도, 상담일지 흐름, 현재 수행 변화, 향후 재수립 방향이 드러나게 작성해.

${seekerContext}

[훈련계획서]
${record.plan || '아직 작성되지 않음'}

[누적 상담일지]
${record.counselingHistory.length ? record.counselingHistory.join('\n\n') : '아직 누적 상담일지 없음'}

[담당자 평가 입력]
${record.evaluationMemo || '추가 입력 없음'}${managerLine(manager, name => `\n[담당자] ${name}`)}`;
    return record.evaluation
        ? buildCurrentContentRegenerationPrompt({
            documentTitle: '직업훈련 정기평가서',
            currentContent: record.evaluation,
            userContext: seekerContext,
            previousRecords: record.counselingHistory.join('\n\n'),
            contextSummary,
            draftInstruction: basePrompt,
            additionalInstruction: '현재 평가서의 판단과 담당자 수정 의도를 유지하면서 목표 달성 근거와 향후 재수립 방향만 보완해 주세요.',
        })
        : withClientContextPrompt(basePrompt, contextSummary);
}

interface InsightPromptInput {
    seekerContext: string;
    record: TrainingRecord;
    contextSummary: string;
    attendanceStats: AttendanceStats;
    progressYear: string;
    progressEntry: ProgressEntry;
}

export function buildInsightPrompt(mode: InsightMode, { seekerContext, record, contextSummary, attendanceStats, progressYear, progressEntry }: InsightPromptInput) {
    const donePrograms = programDefinitions.filter(program => progressEntry[program.key].checked);
    const progressContext = donePrograms.length
        ? donePrograms.map(program => `- ${program.label}: ${progressEntry[program.key].note || '세부 기록 없음'}`).join('\n')
        : '체크된 훈련 프로그램 없음';
    const historyContext = record.counselingHistory.length
        ? record.counselingHistory.slice(-4).map((item, index) => `[최근 훈련 상담 ${index + 1}]\n${item}`).join('\n\n')
        : '최근 상담 기록 없음';
    const attendanceContext = attendanceStats.total
        ? `기록일수: ${attendanceStats.total}일 / 출석률: ${attendanceStats.attendanceRate}% / 출석 ${attendanceStats.counts.출석}회, 지각 ${attendanceStats.counts.지각}회, 조퇴 ${attendanceStats.counts.조퇴}회, 결석 ${attendanceStats.counts.결석}회`
        : '아직 체크된 출석 기록 없음(출석률 판단 불가, 확인 필요)';
    let prompt = `${seekerContext}

[현행 훈련계획서]
${record.plan || '아직 작성되지 않음'}

[최근 훈련 상담/평가 흐름]
${historyContext}

[정기평가]
${record.evaluation || '아직 작성되지 않음'}

[출석 통계]
${attendanceContext}

[${progressYear}년 훈련 프로그램 진행]
${progressContext}

[담당자 보충 메모]
${record.insightMemo || '담당자 입력 없음'}

`;
    if (mode === 'checklist') {
        prompt += `위 정보를 바탕으로 [작업수행 체크리스트 및 개인별 목표 달성률 점검표]를 작성해 줘. 고용지원 사례관리 문서처럼 담당자 입력을 빠뜨리지 말고 반영하되, 직업훈련에 맞게 1. 출석/참여, 2. 작업태도, 3. 지시이해, 4. 작업속도, 5. 정확도, 6. 대인관계, 7. 안전수칙, 8. 목표 달성률, 9. 다음 훈련과제를 포함해. 각 항목은 달성/부분달성/미달성/확인필요 중 하나로 판정하고 근거를 함께 적어줘.`;
    } else if (mode === 'field') {
        prompt += `위 정보를 바탕으로 [현장중심 직업훈련 연계 기록]을 작성해 줘. 사업체 현장훈련 또는 실습 전환을 준비하는 문서로, 훈련생 강점, 현장 배치 시 고려사항, 사업체 요청사항, 담당자 지원계획, 위험요인과 예방조치, 다음 연계 일정을 포함해. 정보가 부족하면 확인 필요로 표시해.`;
    } else {
        prompt += `위 정보를 바탕으로 보호자, 유관기관, 내부회의에서 공유할 수 있는 [훈련 경과 공유용 요약]을 작성해 줘. 개인정보 노출을 최소화하고, 1. 현재 훈련 경과, 2. 주요 변화, 3. 지원이 필요한 부분, 4. 다음 계획, 5. 공유 시 유의사항 순서로 간결하되 신뢰성 있게 작성해.`;
    }
    return withClientContextPrompt(prompt, contextSummary);
}
