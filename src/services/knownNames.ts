import { useDataStore } from '../store/dataStore';

/**
 * 외부 AI로 보내기 전에 가려야 할 "이미 알고 있는 이름" 목록을 모은다.
 * 이용자 이름과 구인처 담당자 이름을 사용하고, 호출하는 쪽에서 보호자·직원 이름 등을 더할 수 있다.
 * 저장소가 아직 준비되지 않았거나 오류가 나도 AI 기능을 막지 않도록 빈 목록을 돌려준다.
 */
export function collectKnownNames(extraNames: Array<string | null | undefined> = []): string[] {
    const names = new Set<string>();
    const add = (value: unknown) => {
        if (typeof value !== 'string') return;
        const name = value.replace(/\s+/g, ' ').trim();
        if (name.length >= 2 && name.length <= 30) names.add(name);
    };
    try {
        const { seekers = [], jobs = [] } = useDataStore.getState();
        seekers.forEach(seeker => add(seeker?.name));
        jobs.forEach(job => add(job?.contactPerson));
    } catch {
        // 이름 사전을 만들지 못해도 규칙 기반 비식별화는 계속 적용된다.
    }
    extraNames.forEach(add);
    return [...names];
}
