/**
 * 나만의 AI 도구: 자주 쓰는 지시문(예: "행사 안내 문자를 3가지 말투로")을 이름 붙여 저장해 두고 내용만 바꿔 실행한다.
 * - 이 PC의 화면 설정으로 둔다(localStorage). 백업 파일에는 들어가지 않으므로 내보내기/가져오기로 옮긴다.
 * - 지시문은 그대로 AI에 전달되므로 이름·연락처 같은 개인정보를 넣지 않는다(실행 때 넣는 내용은 평소처럼 가려서 보낸다).
 */
export const CUSTOM_TOOLS_STORAGE_KEY = 'jjss:custom-ai-tools:v1';
export const MAX_CUSTOM_TOOLS = 30;
export const MAX_INSTRUCTION_LENGTH = 4000;
const EXPORT_FORMAT = 'jjss-custom-ai-tools-v1';

export interface CustomTool {
    id: string;
    title: string;
    /** 목록에 보이는 한 줄 설명(선택) */
    description: string;
    /** AI에게 주는 지시문 */
    instruction: string;
    /** 입력칸 안내 글(선택) */
    inputHint: string;
    updatedAt: string;
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/** 저장·가져오기 전에 형식을 맞춘다. 이름이나 지시문이 없으면 null. */
export function normalizeCustomTool(value: unknown, fallbackId = ''): CustomTool | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const title = clean(raw.title, 40);
    const instruction = clean(raw.instruction, MAX_INSTRUCTION_LENGTH);
    if (!title || !instruction) return null;
    const id = /^[A-Za-z0-9_-]{6,64}$/.test(String(raw.id ?? '')) ? String(raw.id) : fallbackId;
    if (!id) return null;
    const updatedAt = Number.isFinite(Date.parse(String(raw.updatedAt ?? ''))) ? String(raw.updatedAt) : new Date().toISOString();
    return { id, title, description: clean(raw.description, 120), instruction, inputHint: clean(raw.inputHint, 200), updatedAt };
}

export function newCustomToolId(random: () => number = Math.random): string {
    return `ct_${Date.now().toString(36)}${Math.floor(random() * 0xffffff).toString(36).padStart(4, '0')}`;
}

export function readCustomTools(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): CustomTool[] {
    try {
        const parsed = JSON.parse(storage?.getItem(CUSTOM_TOOLS_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        const tools: CustomTool[] = [];
        for (const item of parsed) {
            const tool = normalizeCustomTool(item);
            if (!tool || seen.has(tool.id)) continue;
            seen.add(tool.id);
            tools.push(tool);
        }
        return tools.slice(0, MAX_CUSTOM_TOOLS);
    } catch {
        return [];
    }
}

/** 저장한다. 저장하지 못하면(용량 등) false — 화면이 알릴 수 있게. */
export function writeCustomTools(tools: readonly CustomTool[], storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
    try {
        if (!storage) return false;
        storage.setItem(CUSTOM_TOOLS_STORAGE_KEY, JSON.stringify(tools.slice(0, MAX_CUSTOM_TOOLS)));
        return true;
    } catch {
        return false;
    }
}

/** 새로 넣거나 같은 id를 바꾼 목록(최근에 고친 것이 앞) */
export function upsertCustomTool(tools: readonly CustomTool[], tool: CustomTool): CustomTool[] {
    return [tool, ...tools.filter(item => item.id !== tool.id)].slice(0, MAX_CUSTOM_TOOLS);
}

/** 동료에게 건넬 글(JSON). 지시문만 담긴다. */
export function exportCustomTools(tools: readonly CustomTool[]): string {
    return JSON.stringify({
        format: EXPORT_FORMAT,
        tools: tools.map(({ title, description, instruction, inputHint }) => ({ title, description, instruction, inputHint })),
    }, null, 2);
}

/**
 * 붙여 넣은 글에서 도구를 읽는다. 형식이 아니면 오류. 같은 이름·같은 지시문은 건너뛴다.
 * 돌려주는 값: 합친 목록과 새로 들어온 개수.
 */
export function importCustomTools(text: string, current: readonly CustomTool[], createId: () => string = newCustomToolId): { tools: CustomTool[]; added: number } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(text ?? '').trim());
    } catch {
        throw new Error('가져올 글을 읽지 못했습니다. "내보내기"로 복사한 글 전체를 붙여 넣어 주세요.');
    }
    const list = (parsed as { format?: unknown; tools?: unknown })?.format === EXPORT_FORMAT ? (parsed as { tools?: unknown }).tools : null;
    if (!Array.isArray(list)) throw new Error('JJSS 나만의 AI 도구 형식이 아닙니다. "내보내기"로 복사한 글인지 확인해 주세요.');
    let tools = [...current];
    let added = 0;
    for (const item of list.slice(0, MAX_CUSTOM_TOOLS)) {
        const tool = normalizeCustomTool({ ...(item as object), id: createId(), updatedAt: new Date().toISOString() });
        if (!tool) continue;
        if (tools.some(existing => existing.title === tool.title && existing.instruction === tool.instruction)) continue;
        if (tools.length >= MAX_CUSTOM_TOOLS) break;
        tools = [...tools, tool];
        added += 1;
    }
    return { tools, added };
}

/**
 * AI에 보낼 글. 지시문은 지시로, 사용자가 넣은 내용은 자료 블록으로 감싼다
 * (자료 안의 문장이 지시처럼 읽혀도 따르지 않게 — wrap은 gemini.ts의 wrapAsData).
 */
export function buildCustomToolInput(tool: Pick<CustomTool, 'instruction'>, input: string, wrap: (content: string) => string): string {
    return `[지시]\n${tool.instruction}\n\n[내용]\n${wrap(input)}`;
}

/** 처음 쓰는 사람을 위한 예시 */
export const CUSTOM_TOOL_EXAMPLES: Array<Pick<CustomTool, 'title' | 'description' | 'instruction' | 'inputHint'>> = [
    {
        title: '행사 안내 문자 만들기',
        description: '행사 정보를 넣으면 보호자·이용자용 안내 문자를 세 가지 말투로 만듭니다.',
        instruction: '아래 내용으로 행사 안내 문자를 작성해 줘. 한 통은 90자 안팎으로 짧게, 한 통은 정중하게, 한 통은 발달장애인 당사자가 이해하기 쉬운 말로 써 줘. 일시·장소·준비물·문의처는 빠뜨리지 말고, 내용에 없는 정보는 지어내지 말 것.',
        inputHint: '행사명, 일시, 장소, 대상, 준비물, 문의처를 적어 주세요.',
    },
    {
        title: '회의 안건 정리',
        description: '두서없이 적은 메모를 회의 안건표(안건·배경·결정할 것)로 정리합니다.',
        instruction: '아래 메모를 회의 안건으로 정리해 줘. 안건마다 "안건 / 배경 / 결정할 것 / 담당"으로 나누고, 메모에 없는 내용은 "확인 필요"라고만 적어 줘. 중요한 순서대로 번호를 붙여 줘.',
        inputHint: '회의에서 다룰 내용을 생각나는 대로 적어 주세요.',
    },
    {
        title: '프로그램 계획서 초안',
        description: '프로그램 개요를 넣으면 목적·대상·세부 일정·기대 효과·평가 방법 초안을 씁니다.',
        instruction: '아래 개요로 직업재활 프로그램 계획서 초안을 작성해 줘. "1. 목적 2. 대상 및 인원 3. 기간·장소 4. 세부 내용(회기별) 5. 기대 효과 6. 평가 방법 7. 소요 예산(항목만)" 순서로 쓰고, 개요에 없는 수치는 지어내지 말고 빈칸으로 둬.',
        inputHint: '프로그램 이름, 대상, 기간, 하고 싶은 활동을 적어 주세요.',
    },
];
