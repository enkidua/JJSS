/**
 * 프로그램 진행 도구의 계산(이름 뽑기·조 편성). 화면과 분리해 두어 시험할 수 있다.
 * random은 0 이상 1 미만의 수를 돌려주는 함수(기본 Math.random).
 */
export type RandomFn = () => number;

/** 붙여 넣은 명단(줄바꿈·쉼표·탭 구분)을 이름 목록으로. 빈 줄과 앞의 번호("1.", "2)")는 뺀다. */
export function parseNames(text: string): string[] {
    return String(text ?? '')
        .split(/[\n\r,\t;]+/)
        .map(item => item.replace(/^\s*\d+\s*[.)]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 500);
}

/** 같은 이름이 여러 번 있으면 "김합성(2)"처럼 구분해 준다(뽑기·조 편성 결과에서 헷갈리지 않게). */
export function labelDuplicates(names: readonly string[]): string[] {
    const seen = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const name of names) totals.set(name, (totals.get(name) ?? 0) + 1);
    return names.map(name => {
        if ((totals.get(name) ?? 0) < 2) return name;
        const order = (seen.get(name) ?? 0) + 1;
        seen.set(name, order);
        return `${name}(${order})`;
    });
}

/** 순서 섞기(Fisher–Yates). 원본은 바꾸지 않는다. */
export function shuffle<T>(items: readonly T[], random: RandomFn = Math.random): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const pick = Math.floor(random() * (index + 1));
        [result[index], result[pick]] = [result[pick], result[index]];
    }
    return result;
}

/** 아직 뽑히지 않은 사람 가운데 count명을 뽑는다. 남은 사람이 모자라면 남은 만큼만. */
export function pickNames(names: readonly string[], alreadyPicked: readonly string[], count: number, random: RandomFn = Math.random): string[] {
    const picked = new Set(alreadyPicked);
    const remaining = names.filter(name => !picked.has(name));
    return shuffle(remaining, random).slice(0, Math.max(0, Math.floor(count)));
}

export interface GroupOptions {
    /** 조 수로 나누기(우선) */
    groupCount?: number;
    /** 한 조 인원으로 나누기 */
    groupSize?: number;
}

/**
 * 조 편성. 인원이 조마다 1명 넘게 차이 나지 않게 고르게 나눈다.
 * groupSize로 나누면 조 수 = 올림(인원 ÷ 조 인원).
 */
export function makeGroups(names: readonly string[], options: GroupOptions, random: RandomFn = Math.random): string[][] {
    const people = shuffle(names, random);
    if (!people.length) return [];
    const requested = options.groupCount
        ? Math.floor(options.groupCount)
        : Math.ceil(people.length / Math.max(1, Math.floor(options.groupSize ?? 1)));
    const groupCount = Math.min(people.length, Math.max(1, requested));
    const groups: string[][] = Array.from({ length: groupCount }, () => []);
    people.forEach((name, index) => groups[index % groupCount].push(name));
    return groups;
}

/** 조 편성 결과를 붙여 넣기 좋은 글로 */
export function formatGroups(groups: readonly string[][]): string {
    return groups.map((group, index) => `${index + 1}조 (${group.length}명): ${group.join(', ')}`).join('\n');
}

/** 초 → "mm:ss"(1시간 이상이면 "h:mm:ss") */
export function formatClock(totalSeconds: number): string {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const two = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${two(minutes)}:${two(rest)}`;
}
