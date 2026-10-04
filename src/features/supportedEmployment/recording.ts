import type { SupportedEmploymentDailyLog } from './model';

/** 작성 안내일 뿐, 관찰 결과나 출결을 자동으로 생성하지 않는다. */
export const RECORDING_OUTLINE = '[관찰한 행동·수행 결과]\n\n[실시한 지도·지원]\n\n[지도 후 반응·변화]\n\n[다음 지원·확인할 사항]';

/** 작성 틀의 제목 줄. 틀만 넣고 아무것도 적지 않은 기록은 "작성됨"이 아니다. */
export const RECORDING_OUTLINE_HEADINGS = RECORDING_OUTLINE.split('\n').filter(line => line.trim());

function isOutlineHeading(line: string): boolean {
    return RECORDING_OUTLINE_HEADINGS.includes(line.trim());
}

function splitLines(note: string): string[] {
    return String(note || '').replace(/\r\n?/g, '\n').split('\n');
}

/** 틀 제목 줄과 빈 줄을 뺀 실제 기록 내용. 틀만 있으면 빈 문자열. */
export function recordingNoteBody(note: string): string {
    return splitLines(note)
        .filter(line => line.trim() && !isOutlineHeading(line))
        .join('\n')
        .trim();
}

/** 지도사항에 실제로 적은 내용이 있는가(틀 제목만 있거나 틀이 두 번 들어간 경우는 없음). */
export function hasRecordingContent(note: string): boolean {
    return Boolean(recordingNoteBody(note));
}

/**
 * 서류·AI에 넣을 지도사항. 내용이 없는 틀 제목은 빼고(제목만 인쇄되지 않게), 내용이 있는 제목은 남긴다.
 * 이어진 빈 줄은 하나로 줄인다. 내용이 하나도 없으면 빈 문자열.
 */
export function printableRecordingNote(note: string): string {
    if (!hasRecordingContent(note)) return '';
    const lines = splitLines(note);
    const kept: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (isOutlineHeading(line)) {
            let next = index + 1;
            while (next < lines.length && !isOutlineHeading(lines[next]) && !lines[next].trim()) next += 1;
            if (next >= lines.length || isOutlineHeading(lines[next])) continue;
        }
        if (!line.trim() && (!kept.length || !kept[kept.length - 1].trim())) continue;
        kept.push(line);
    }
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
    return kept.join('\n');
}

export function missingRecordFields(log: SupportedEmploymentDailyLog): string[] {
    const hasNote = hasRecordingContent(log.note);
    if (log.attendance === '결석') return hasNote ? [] : ['결석 사유·확인사항'];
    const missing: string[] = [];
    if (!log.start || !log.end) missing.push('훈련시간');
    if (!log.task.trim()) missing.push('수행과제');
    if (!log.performanceHours.trim()) missing.push('측정시간별 수행정도');
    if (!hasNote) missing.push('평가 및 지도사항');
    return missing;
}

/** 기존 기록 보존. 길이 제한 때문에 일부 내용만 잘라서 넣지 않는다. 틀 제목이 이미 모두 있으면 다시 넣지 않는다. */
export function appendRecordingOutline(note: string): string | null {
    const lines = new Set(splitLines(note).map(line => line.trim()));
    if (RECORDING_OUTLINE_HEADINGS.every(heading => lines.has(heading))) return note;
    const result = note ? `${note}\n\n${RECORDING_OUTLINE}` : RECORDING_OUTLINE;
    return result.length <= 1000 ? result : null;
}
