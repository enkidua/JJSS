import { useDataStore } from '../store/dataStore';
import { useSettingsStore } from '../store/settingsStore';

/**
 * 외부 AI로 보내기 전에 가려야 할 "이미 알고 있는 이름" 사전.
 *
 * 모으는 곳(앱이 실제로 알고 있는 실명만 쓴다. 자유 문장에서 이름을 추측하지 않는다):
 *  - 이용자 이름
 *  - 사업체·구인처 담당자 이름
 *  - 직업훈련 훈련생·담당자 이름
 *  - 지원고용 훈련생·직무지도원·담당자 이름
 *  - 설정에 등록한 우리 기관 담당자 이름
 *  - 호출하는 쪽이 더해 주는 이름(보호자·회의 참석자 등)
 *
 * 규칙 기반 비식별화(`anonymizer`)는 "이름:", "○○ 님" 같은 문맥 단서로도 가리지만,
 * 자유 문장 한가운데 나오는 제3자 이름은 이 사전에 없으면 놓칠 수 있다. 그래서 사전을 최대한 넓힌다.
 */

/** 이름으로 볼 수 있는 길이. 너무 짧거나 긴 값은 사람 이름이 아닐 가능성이 커서 뺀다. */
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;

/** 사람 이름이 아닌데 이름 칸에 자주 들어가는 값. 이런 값까지 가리면 문장이 망가진다. */
const NOT_A_NAME = new Set(['미정', '없음', '해당없음', '본인', '담당자', '기타', '-', '—']);

function normalize(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.replace(/\s+/g, ' ').trim();
    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) return null;
    if (NOT_A_NAME.has(name)) return null;
    return name;
}

/** 직업훈련 상태에서 훈련생·담당자 이름을 모은다. 구조가 달라도 깨지지 않게 방어적으로 읽는다. */
function collectTrainingNames(add: (value: unknown) => void): void {
    try {
        const state = useDataStore.getState() as { trainingState?: unknown };
        const training = state.trainingState as
            | { rooms?: Array<{ trainees?: Array<{ name?: unknown }>; manager?: unknown }> }
            | undefined;
        for (const room of training?.rooms ?? []) {
            add(room?.manager);
            for (const trainee of room?.trainees ?? []) add(trainee?.name);
        }
    } catch {
        // 훈련 자료를 읽지 못해도 나머지 사전은 그대로 쓴다.
    }
}

/** 지원고용 회차에서 훈련생·직무지도원·담당자 이름을 모은다. */
function collectSupportedEmploymentNames(add: (value: unknown) => void, documents: unknown[]): void {
    for (const document of documents) {
        const doc = document as { type?: unknown; content?: unknown; seekerName?: unknown };
        add(doc?.seekerName);
        if (doc?.type !== 'supported_employment' || typeof doc.content !== 'string') continue;
        try {
            const parsed = JSON.parse(doc.content) as {
                seekerName?: unknown;
                coach?: { name?: unknown };
                staffName?: unknown;
                documentOptions?: { staffName?: unknown };
            };
            add(parsed?.seekerName);
            add(parsed?.coach?.name);
            add(parsed?.staffName);
            add(parsed?.documentOptions?.staffName);
        } catch {
            // 읽지 못한 회차는 건너뛴다(내용은 로그에 남기지 않는다).
        }
    }
}

export function collectKnownNames(extraNames: Array<string | null | undefined> = []): string[] {
    const names = new Set<string>();
    const add = (value: unknown) => {
        const name = normalize(value);
        if (name) names.add(name);
    };
    try {
        const { seekers = [], jobs = [], caseDocuments = [] } = useDataStore.getState();
        seekers.forEach(seeker => add(seeker?.name));
        jobs.forEach(job => {
            add(job?.contactPerson);
            add((job as { managerName?: unknown })?.managerName);
        });
        collectSupportedEmploymentNames(add, caseDocuments);
        collectTrainingNames(add);
    } catch {
        // 이름 사전을 만들지 못해도 규칙 기반 비식별화는 계속 적용된다.
    }
    try {
        const settings = useSettingsStore.getState().settings as { staffName?: unknown; organizationName?: unknown };
        add(settings?.staffName);
    } catch {
        // 설정을 읽지 못해도 넘어간다.
    }
    extraNames.forEach(add);
    return [...names];
}

/**
 * 이름 사전을 쓸 준비가 되었는지.
 *
 * 앱을 켜자마자(이용자 목록을 불러오기 전에) AI 기능을 실행하면 사전이 비어 있어
 * 이름이 그대로 나갈 수 있다. 개인정보가 섞일 수 있는 요청은 이 값이 false면 막는다(fail-closed).
 */
export function isKnownNamesReady(): boolean {
    try {
        return useDataStore.getState().initialized === true;
    } catch {
        return false;
    }
}

/** 개인정보가 섞일 수 있는 요청인데 사전이 아직 준비되지 않았을 때 보여 줄 문구. */
export const KNOWN_NAMES_NOT_READY_MESSAGE =
    '이용자 정보를 아직 불러오지 못해 개인정보를 가릴 준비가 되지 않았습니다. 잠시 후 다시 시도해 주세요.';
