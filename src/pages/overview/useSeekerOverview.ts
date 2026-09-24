import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '../../store/dataStore';
import * as localDB from '../../config/localDB';
import {
    buildSituationSummaryPrompt, buildTimeline, deriveStage, getEmploymentSummary, getEvaluationSummary,
    getNextActions, getTrainingOverview, type TrainingState,
} from '../../config/rehabOverview';
import { useRehabWorkflowRecord } from '../workmate/useRehabWorkflowRecord';
import { buildSupportedEmploymentOverview } from '../workmate/supportedEmployment/caseEditing';
import { useLocalToday } from './useLocalToday';

/** 직업훈련 화면이 저장하는 훈련 상태 문서 ID(src/pages/training/useTrainingState.ts와 같은 값) */
const TRAINING_STATE_ID = 'work-training';

/**
 * 현황판에서 한 이용자의 평가·훈련·고용지원 기록을 한 번에 모읍니다.
 * - 사례문서와 현황 기록은 useRehabWorkflowRecord(요청 순번으로 늦은 응답 폐기)로 읽습니다.
 * - 훈련 상태도 요청 순번으로 이전 이용자의 늦은 응답을 버립니다.
 * - 화면은 읽기 전용이며, 저장은 후속 일정 완료 표시와 "현재 상황 정리" 메모뿐입니다.
 */
export function useSeekerOverview(seekerId: string) {
    const seekers = useDataStore(state => state.seekers);
    const seeker = useMemo(() => (seekerId ? seekers.find(item => item.id === seekerId) ?? null : null), [seekers, seekerId]);
    const record = useRehabWorkflowRecord(seeker);
    const [trainingState, setTrainingState] = useState<TrainingState | undefined>(undefined);
    const [trainingLoading, setTrainingLoading] = useState(false);
    const [trainingFailed, setTrainingFailed] = useState(false);
    const [trainingReloadKey, setTrainingReloadKey] = useState(0);
    const trainingSequence = useRef(0);
    const today = useLocalToday();

    useEffect(() => {
        const request = ++trainingSequence.current;
        setTrainingState(undefined);
        setTrainingFailed(false);
        if (!seeker) { setTrainingLoading(false); return; }
        setTrainingLoading(true);
        localDB.getById<TrainingState>('trainingState', TRAINING_STATE_ID).then(state => {
            if (request === trainingSequence.current) setTrainingState(state);
        }).catch(() => {
            if (request === trainingSequence.current) setTrainingFailed(true);
        }).finally(() => {
            if (request === trainingSequence.current) setTrainingLoading(false);
        });
        return () => { trainingSequence.current++; };
    }, [seeker?.id, trainingReloadKey]);

    const { workflow, documents } = record;
    const training = useMemo(() => (seeker ? getTrainingOverview(seeker, trainingState) : null), [seeker, trainingState]);
    const evaluation = useMemo(() => getEvaluationSummary(documents), [documents]);
    // 지원고용 회차(사례문서 type 'supported_employment')의 가장 최근 회차 요약
    const supportedEmployment = useMemo(() => buildSupportedEmploymentOverview(documents, today), [documents, today]);
    const employment = useMemo(() => getEmploymentSummary(documents, workflow, supportedEmployment), [documents, workflow, supportedEmployment]);
    const nextActions = useMemo(() => getNextActions(workflow.tasks, today), [workflow.tasks, today]);
    const stage = useMemo(() => deriveStage({ seekerStatus: seeker?.status, documents, workflow, training, supportedEmployment }),
        [seeker?.status, documents, workflow, training, supportedEmployment]);
    const timeline = useMemo(() => (seeker ? buildTimeline(documents, workflow, training, seeker) : []),
        [documents, workflow, training, seeker]);

    const { save, reload: reloadRecord } = record;
    const reload = useCallback(() => {
        reloadRecord();
        setTrainingReloadKey(current => current + 1);
    }, [reloadRecord]);

    const completeTask = useCallback((taskId: string) => save({
        ...workflow, tasks: workflow.tasks.map(task => (task.id === taskId ? { ...task, done: true } : task)),
    }, '완료로 표시했습니다. 완료한 일정은 고용지원 화면에서 다시 열 수 있습니다.'), [save, workflow]);

    const saveSituationNote = useCallback((text: string) => save({
        ...workflow, situationNote: { text, updatedAt: new Date().toISOString() },
    }, '현재 상황 정리를 저장했습니다.'), [save, workflow]);

    const buildSummaryPrompt = useCallback(() => buildSituationSummaryPrompt({
        stage, disabilityType: seeker?.disabilityType, evaluation, training, employment, nextActions, goals: workflow.goals,
    }), [stage, seeker?.disabilityType, evaluation, training, employment, nextActions, workflow.goals]);

    return {
        seeker, record, today, training, evaluation, employment, nextActions, stage, timeline,
        loading: record.loading || trainingLoading,
        /** 사례문서 또는 훈련 기록을 읽지 못함. 화면은 "다시 불러오기"만 보여 줍니다. */
        loadFailed: record.loadFailed || trainingFailed,
        reload, completeTask, saveSituationNote, buildSummaryPrompt,
    };
}

export type SeekerOverview = ReturnType<typeof useSeekerOverview>;
