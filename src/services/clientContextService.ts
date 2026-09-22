import * as localDB from '../config/localDB';
import { CaseDocument } from '../types/caseDocument';
import { Seeker } from '../types/matching';

interface TrainingRecord {
  plan?: string;
  counselingDraft?: string;
  counselingHistory?: string[];
  evaluation?: string;
  checklist?: string;
  fieldNote?: string;
  shareSummary?: string;
}

interface TrainingRoom {
  id: string;
  name: string;
  program?: string;
  trainees?: Array<{ id: string; seekerId?: string; name: string; memo?: string }>;
}

interface TrainingState {
  rooms?: TrainingRoom[];
  trainingRecords?: Record<string, TrainingRecord>;
}

function seekerKeys(seeker: Pick<Seeker, 'id' | 'seekerId' | 'name'>) {
  return [seeker.id, seeker.seekerId].filter(Boolean).map(String);
}

function sameSeeker(doc: CaseDocument, seeker: Seeker, allSeekers: Seeker[] = []) {
  const keys = seekerKeys(seeker);
  if (keys.length && keys.includes(String(doc.seekerId))) return true;

  const sameNameSeekers = allSeekers.filter(item => item.name && item.name === seeker.name);
  const canUseNameFallback = keys.length === 0 && sameNameSeekers.length === 1;
  return canUseNameFallback && doc.seekerName === seeker.name;
}

function dateValue(item: { updatedAt?: any; createdAt?: any }) {
  const value = item.updatedAt || item.createdAt;
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function clean(text = '', limit = 900) {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function bulletDocuments(title: string, docs: CaseDocument[]) {
  if (!docs.length) return `${title}: 확인된 최근 기록 없음`;
  return [
    `${title}:`,
    ...docs.slice(0, 5).map(doc => `- ${labelCaseType(doc.type)}: ${clean(doc.content, 700)}`),
  ].join('\n');
}

function labelCaseType(type: string) {
  const labels: Record<string, string> = {
    meeting: '사례회의록',
    plan: '직업재활계획서',
    counseling: '상담일지',
    evaluation: '정기평가',
    matching_opinion: '매칭 의견',
    employment_matching: '매칭 의견',
    interview_note: '면접일지',
    employment_interview_note: '면접일지',
    job_analysis: '직무분석지',
  };
  return labels[type] || type;
}

function summarizeTraining(seeker: Seeker, trainingState?: TrainingState) {
  const keys = new Set(seekerKeys(seeker));
  const rooms = trainingState?.rooms || [];
  const matchedTrainees = rooms.flatMap(room =>
    (room.trainees || [])
      .filter(trainee => !!trainee.seekerId && keys.has(trainee.seekerId))
      .map(trainee => ({ ...trainee, roomName: room.name, program: room.program || '' }))
  );

  if (!matchedTrainees.length) return '최근 직업훈련 요약: 확인된 훈련 기록 없음';

  const records = trainingState?.trainingRecords || {};
  const parts = matchedTrainees.slice(0, 3).map(trainee => {
    const record = records[trainee.id] || {};
    const recentCounseling = (record.counselingHistory || []).slice(-2).map(item => `상담: ${clean(item, 500)}`).join('\n');
    return [
      `- 훈련실: ${trainee.roomName}${trainee.program ? ` / ${trainee.program}` : ''}`,
      record.plan ? `훈련계획: ${clean(record.plan, 700)}` : '',
      recentCounseling,
      record.evaluation ? `훈련평가: ${clean(record.evaluation, 700)}` : '',
      record.shareSummary ? `공유요약: ${clean(record.shareSummary, 500)}` : '',
    ].filter(Boolean).join('\n');
  });

  return ['최근 직업훈련 요약:', ...parts].join('\n');
}

function buildSynthesis(seeker: Seeker, caseDocs: CaseDocument[], trainingText: string) {
  const combined = [
    ...caseDocs.slice(0, 8).map(doc => doc.content),
    trainingText,
    seeker.notes || '',
  ].join('\n');

  const strengthHints = ['강점', '가능', '안정', '선호', '흥미', '적극', '성실', '반복'];
  const needHints = ['어려움', '지원', '필요', '확인 필요', '불안', '속도', '주의', '안전'];
  const planHints = ['향후', '계획', '연계', '지원계획', '다음', '후속'];

  const pick = (hints: string[]) => combined
    .split(/[.\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 12 && hints.some(hint => item.includes(hint)))
    .slice(0, 4)
    .map(item => `- ${clean(item, 180)}`)
    .join('\n') || '- 확인된 반복 내용 없음';

  return [
    '반복적으로 나타난 강점:',
    pick(strengthHints),
    '',
    '반복적으로 나타난 어려움 또는 지원 필요사항:',
    pick(needHints),
    '',
    '최근 후속 지원계획:',
    pick(planHints),
    '',
    '문서 생성 시 참고할 주의사항:',
    '- 아래 참고자료는 원본 문서가 아니며, 현재 문서 작성 목적에 맞게 필요한 내용만 반영해야 합니다.',
    '- 참고자료와 현재 작성 내용이 충돌하면 확인 필요로 표시합니다.',
    '- 동명이인 혼합 방지를 위해 정확한 식별자로 연결된 기록을 우선 사용했습니다.',
  ].join('\n');
}

export async function buildClientContextSummary(seeker: Seeker, allSeekers: Seeker[] = []) {
  const caseDocs = (await localDB.getAll<CaseDocument>('caseDocuments'))
    .filter(doc => doc.type !== 'workflow' && sameSeeker(doc, seeker, allSeekers))
    .sort((a, b) => dateValue(b) - dateValue(a));

  const trainingState = await localDB.getById<TrainingState>('trainingState', 'work-training').catch(() => undefined);
  const trainingSummary = summarizeTraining(seeker, trainingState);

  const trainingDocs = caseDocs.filter(doc => doc.source === 'training');
  const caseAreaDocs = caseDocs.filter(doc => doc.tab === 'case');
  const employmentDocs = caseDocs.filter(doc => doc.tab === 'employment' || doc.source === 'matching');

  const summary = [
    '[통합 참고자료]',
    '아래 내용은 같은 이용자의 최근 직업훈련 및 고용지원 기록에서 가져온 참고자료입니다.',
    '원본 문서를 수정하거나 그대로 복사하지 말고, 현재 작성하려는 문서의 목적에 맞게 필요한 내용만 반영해 주세요.',
    '현재 작성 중인 내용이 있다면 그 내용을 최우선으로 유지하고, 참고자료와 충돌하는 내용은 확인 필요로 표시해 주세요.',
    '',
    '[이용자 기본정보]',
    `이름: ${seeker.name || '확인 필요'}`,
    `나이: ${seeker.age || '확인 필요'}`,
    `장애유형: ${seeker.disabilityType || '확인 필요'} / ${seeker.severity || '확인 필요'}`,
    `희망직무: ${[seeker.desiredJob1, seeker.desiredJob2].filter(Boolean).join(' / ') || '확인 필요'}`,
    `희망지역: ${seeker.desiredLocation || '확인 필요'}`,
    seeker.notes ? `특이사항: ${clean(seeker.notes, 300)}` : '특이사항: 확인 필요',
    '',
    trainingSummary,
    '',
    bulletDocuments('최근 고용지원 요약', [...caseAreaDocs, ...employmentDocs, ...trainingDocs]),
    '',
    buildSynthesis(seeker, caseDocs, trainingSummary),
  ].join('\n');

  return {
    summary: summary.slice(0, 9000),
    hasRecords: caseDocs.length > 0 || !trainingSummary.includes('확인된 훈련 기록 없음'),
    recordCount: caseDocs.length,
    note: caseDocs.length === 0 ? '불러올 최근 직업훈련·고용지원 기록이 없습니다.' : '',
  };
}

export function withClientContextPrompt(prompt: string, contextSummary?: string) {
  if (!contextSummary?.trim()) return prompt;
  return `${prompt}

[같은 이용자 최근 직업훈련 및 고용지원 기록 참고자료]
${contextSummary}

위 참고자료는 보조 자료입니다. 현재 작성 중인 문서 목적과 담당자 입력을 우선하고, 참고자료를 그대로 복사하지 말고 필요한 내용만 반영해 주세요.`;
}
