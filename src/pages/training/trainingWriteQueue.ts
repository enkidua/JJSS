/**
 * 직업훈련 자료 쓰기 순서(11차). 직업훈련 화면 인스턴스끼리 하나의 직렬 큐를 공유하고,
 * 다른 화면(현황판·지원 일정·AI 참고 내용)도 읽기 전에 이미 예약된 쓰기가 끝나기를 기다린다.
 * 그래야 직업훈련 화면에서 막 고치고 이동했을 때, 저장이 끝나기 전의 낡은 자료를 보여 주지 않는다.
 * 같은 renderer 안에서만 보장한다(다른 창과 공유하는 잠금은 아니다).
 */
import * as localDB from '../../config/localDB';

const TRAINING_STATE_ID = 'work-training';

let trainingWriteQueue: Promise<unknown> = Promise.resolve();

/** 앞의 쓰기가 성공하든 실패하든 끝난 뒤 실행한다. 이 쓰기의 결과(또는 오류)를 그대로 돌려준다. */
export function enqueueTrainingWrite<T>(run: () => Promise<T>): Promise<T> {
    const next = trainingWriteQueue.then(run, run);
    trainingWriteQueue = next.catch(() => undefined);
    return next;
}

/** 지금까지 예약된 쓰기가 모두 끝날 때까지 기다린다(실패해도 거부하지 않는다). */
export function waitForTrainingWrites(): Promise<unknown> {
    return trainingWriteQueue;
}

/** 예약된 쓰기를 기다린 뒤 직업훈련 자료를 읽는다. */
export async function readTrainingStateAfterWrites<T>(): Promise<T | undefined> {
    await trainingWriteQueue;
    return localDB.getById<T>('trainingState', TRAINING_STATE_ID);
}
