import { useEffect, useState } from 'react';
import { MessageCircleHeart } from 'lucide-react';
import { caseDocumentDate, type ParticipantPlan } from '../../config/rehabWorkflow';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

const STATUS_LABELS: Record<ParticipantPlan['reviewStatus'], string> = {
    not_reviewed: '당사자 확인 전', discussed: '함께 논의함',
    agreed: '당사자 동의 확인', changes_requested: '당사자 수정 요청',
};

interface Props {
    record: RehabWorkflowRecord;
    onDirtyChange: (dirty: boolean) => void;
}

/** 당사자 참여형 계획 확인(이전 현황판에서 옮김). 현황 기록(RehabWorkflowData.participantPlan)에 저장합니다. */
export function ParticipantPlanSection({ record, onDirtyChange }: Props) {
    const { workflow, documents, save, unavailable } = record;
    const [participant, setParticipant] = useState<ParticipantPlan>(() => ({ ...workflow.participantPlan }));
    const [error, setError] = useState('');
    const latestPlan = documents.find(doc => doc.type === 'plan');

    useEffect(() => {
        onDirtyChange(JSON.stringify(participant) !== JSON.stringify(workflow.participantPlan));
    }, [participant, workflow.participantPlan, onDirtyChange]);

    // 내용을 고치면 이전 확인 상태가 더는 유효하지 않으므로 '확인 전'으로 되돌립니다.
    const setField = (key: keyof ParticipantPlan, value: string) => setParticipant(current => ({
        ...current, [key]: value,
        ...(value === 'not_reviewed' && key === 'reviewStatus' ? { reviewedAt: '', reviewMethod: '' } : {}),
        ...(key !== 'reviewStatus' && key !== 'reviewedAt' && key !== 'reviewMethod'
            ? { reviewStatus: 'not_reviewed' as const, reviewedAt: '', reviewMethod: '' } : {}),
    }));

    return <section aria-labelledby="participant-title">
        <h3 id="participant-title" className="text-lg font-bold text-white flex items-center gap-2"><MessageCircleHeart className="w-5 h-5 text-amber-300" aria-hidden="true" /> 당사자 참여형 계획 확인</h3>
        <p className="text-sm text-white/55 mt-1 mb-2">쉬운 말로 함께 읽고, 당사자가 말한 목표·도움 요청·수정 의견을 따로 남깁니다.</p>
        <p className="text-xs text-amber-200 mb-4">이 기록은 전자서명이 아닙니다. 직접 확인하지 않은 경우 ‘당사자 확인 전’으로 두세요. 내용을 고치면 확인 상태가 자동으로 초기화됩니다.</p>
        <p className="text-sm text-white/60 mb-3">최근 직업재활계획서: {latestPlan ? `작성 기록 있음 (${caseDocumentDate(latestPlan, 'created') || '날짜 미확인'})` : '작성 기록 없음'}</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async event => {
            event.preventDefault();
            if (!participant.plainSummary.trim() && !participant.desiredGoal.trim()) {
                setError('쉬운 말 요약 또는 당사자가 원하는 목표를 입력해 주세요.'); return;
            }
            if (participant.reviewStatus !== 'not_reviewed' && (!participant.reviewedAt || !participant.reviewMethod.trim())) {
                setError('당사자와 확인한 날짜와 방법을 입력해 주세요.'); return;
            }
            setError('');
            await save({ ...workflow, participantPlan: { ...participant } }, '당사자 참여 기록을 저장했습니다.');
        }}>
            <label className="text-sm text-white/75 sm:col-span-2">계획의 쉬운 말 요약<textarea className="textarea-field mt-1" rows={3} maxLength={1200} value={participant.plainSummary} onChange={e => setField('plainSummary', e.target.value)} placeholder="짧고 쉬운 문장으로, 실제 계획에 있는 내용만 적어 주세요" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">내가 원하는 목표<textarea className="textarea-field mt-1" rows={2} maxLength={700} value={participant.desiredGoal} onChange={e => setField('desiredGoal', e.target.value)} placeholder="당사자의 표현을 우선 기록" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">내가 해볼 일<textarea className="textarea-field mt-1" rows={2} maxLength={700} value={participant.ownAction} onChange={e => setField('ownAction', e.target.value)} disabled={unavailable} /></label>
            <label className="text-sm text-white/75">필요한 도움<textarea className="textarea-field mt-1" rows={2} maxLength={700} value={participant.supportRequest} onChange={e => setField('supportRequest', e.target.value)} disabled={unavailable} /></label>
            <label className="text-sm text-white/75">수정 의견<textarea className="textarea-field mt-1" rows={2} maxLength={700} value={participant.revisionRequest} onChange={e => setField('revisionRequest', e.target.value)} disabled={unavailable} /></label>
            <label className="text-sm text-white/75">확인 상태<select className="input-field mt-1" value={participant.reviewStatus} onChange={e => setField('reviewStatus', e.target.value)} disabled={unavailable}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="text-sm text-white/75">확인일<input type="date" className="input-field mt-1" value={participant.reviewedAt} onChange={e => setField('reviewedAt', e.target.value)} disabled={unavailable || participant.reviewStatus === 'not_reviewed'} /></label>
            <label className="text-sm text-white/75 sm:col-span-2">확인 방법·상황<input className="input-field mt-1" value={participant.reviewMethod} maxLength={300} onChange={e => setField('reviewMethod', e.target.value)} placeholder="예: 대면 상담에서 본인이 직접 확인" disabled={unavailable || participant.reviewStatus === 'not_reviewed'} /></label>
            <button type="submit" className="btn-primary !px-4 !py-2 justify-self-start" disabled={unavailable}>참여 기록 저장</button>
        </form>
        {(workflow.participantPlan.plainSummary || workflow.participantPlan.desiredGoal) &&
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-5 text-sm">
                <p className="font-semibold text-amber-200">함께 읽는 계획 · {STATUS_LABELS[workflow.participantPlan.reviewStatus]}</p>
                <p className="text-white/80 whitespace-pre-wrap break-words mt-2">{workflow.participantPlan.plainSummary}</p>
                <p className="text-white/75 whitespace-pre-wrap break-words mt-2">내가 원하는 목표: {workflow.participantPlan.desiredGoal || '미기록'}</p>
                {workflow.participantPlan.revisionRequest && <p className="text-white/75 whitespace-pre-wrap break-words mt-1">수정 의견: {workflow.participantPlan.revisionRequest}</p>}
                {workflow.participantPlan.reviewedAt && <p className="text-white/50 mt-2">확인: {workflow.participantPlan.reviewedAt} · {workflow.participantPlan.reviewMethod}</p>}
            </div>}
        {error && <p role="alert" className="text-sm text-red-300 mt-2">{error}</p>}
    </section>;
}
