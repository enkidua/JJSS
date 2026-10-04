/**
 * 직업훈련 훈련생·담당자 이름 사전(외부 AI로 보내기 전 비식별화용).
 *
 * 직업훈련 자료는 공용 데이터 저장소(dataStore)에 올라오지 않고 직업훈련 화면이 직접 읽는다.
 * 그래서 이름 사전이 이 자료를 보지 못해, 훈련실의 다른 훈련생이나 이용자로 등록하지 않은 훈련생 이름이
 * 가려지지 않은 채 AI로 나갈 수 있었다. 이 모듈이 그 이름을 따로 들고 있고,
 *  - 앱 데이터를 처음 불러올 때(dataStore.fetchData) 저장된 직업훈련 자료에서 채우고,
 *  - 직업훈련 화면이 자료를 불러오거나 고칠 때마다 갱신한다.
 * 이름 문자열만 메모리에 둔다(저장하지 않는다).
 */
export const TRAINING_STATE_ID = 'work-training';

let trainingNames: string[] = [];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 저장된 직업훈련 자료(구조가 달라도 깨지지 않게 방어적으로)에서 사람 이름을 뽑는다. */
export function extractTrainingNames(state: unknown): string[] {
    const names = new Set<string>();
    const add = (value: unknown) => {
        const name = text(value);
        if (name) names.add(name);
    };
    if (!state || typeof state !== 'object') return [];
    const raw = state as { rooms?: unknown; manager?: unknown };
    add(raw.manager);
    for (const room of Array.isArray(raw.rooms) ? raw.rooms : []) {
        if (!room || typeof room !== 'object') continue;
        const item = room as { teacher?: unknown; manager?: unknown; trainees?: unknown };
        add(item.teacher);
        add(item.manager);
        for (const trainee of Array.isArray(item.trainees) ? item.trainees : []) {
            if (trainee && typeof trainee === 'object') add((trainee as { name?: unknown }).name);
        }
    }
    return [...names];
}

/** 직업훈련 자료로 이름 사전을 바꾼다. */
export function setTrainingNamesFromState(state: unknown): void {
    trainingNames = extractTrainingNames(state);
}

export function getTrainingNames(): string[] {
    return trainingNames;
}
