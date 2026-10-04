/**
 * 평가 회차 화면의 상태 갱신 형식.
 *
 * AI 응답처럼 기다렸다가 반영하는 값은 "기다리기 시작할 때의 회차"가 아니라 "반영하는 순간의 최신 회차" 위에
 * 얹어야 한다. 그렇지 않으면 기다리는 동안 다른 단계에서 고친 내용(평가목적·이력·채택한 해석 등)이
 * 응답이 도착하는 순간 통째로 되돌아간다. 그래서 갱신은 값 또는 "최신 값 → 다음 값" 함수로 받는다.
 */
export type StateUpdate<T> = T | ((current: T) => T);

export function resolveUpdate<T>(update: StateUpdate<T>, current: T): T {
    return typeof update === 'function' ? (update as (current: T) => T)(current) : update;
}
