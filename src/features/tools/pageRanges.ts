/**
 * 쪽 범위 글("1-3, 5, 8-")을 쪽 번호 목록(0부터)으로 바꾼다.
 * - "8-"은 8쪽부터 끝까지, "-3"은 처음부터 3쪽까지.
 * - 적은 순서를 그대로 지킨다(쪽 순서를 바꿔 뽑을 수 있게). 같은 쪽을 두 번 적으면 두 번 들어간다.
 */
export function parsePageRanges(text: string, totalPages: number): number[] {
    if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('쪽수를 알 수 없는 PDF입니다.');
    // 기호 앞뒤의 빈칸은 붙인다("1 - 3", "8 ~"). 빈칸으로 나누기 전에 해야 "-"가 따로 떨어지지 않는다.
    const cleaned = String(text ?? '').replace(/[~–—]/g, '-').replace(/쪽|페이지|p\.?/gi, '').replace(/\s*-\s*/g, '-').trim();
    if (!cleaned) throw new Error('뽑을 쪽을 적어 주세요. 예: 1-3, 5, 8-');
    const pages: number[] = [];
    for (const part of cleaned.split(/[,\s;]+/).filter(Boolean)) {
        const match = /^(\d*)(-?)(\d*)$/.exec(part);
        if (!match || (!match[1] && !match[3])) throw new Error(`"${part}"은(는) 쪽 범위로 읽을 수 없습니다. 예: 1-3, 5, 8-`);
        const isRange = match[2] === '-';
        const start = match[1] ? Number(match[1]) : 1;
        const end = isRange ? (match[3] ? Number(match[3]) : totalPages) : start;
        if (start < 1 || end < 1) throw new Error('쪽 번호는 1부터 시작합니다.');
        if (start > totalPages || end > totalPages) throw new Error(`이 PDF는 ${totalPages}쪽까지 있습니다("${part}").`);
        if (start <= end) for (let page = start; page <= end; page += 1) pages.push(page - 1);
        else for (let page = start; page >= end; page -= 1) pages.push(page - 1);
        if (pages.length > 5000) throw new Error('한 번에 뽑을 수 있는 쪽이 너무 많습니다.');
    }
    return pages;
}

/** 쪽 번호 목록(0부터)을 사람이 읽는 범위 글로("1-3, 5"). */
export function describePages(pages: readonly number[]): string {
    const parts: string[] = [];
    let index = 0;
    while (index < pages.length) {
        let end = index;
        while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) end += 1;
        parts.push(end > index ? `${pages[index] + 1}-${pages[end] + 1}` : String(pages[index] + 1));
        index = end + 1;
    }
    return parts.join(', ');
}
