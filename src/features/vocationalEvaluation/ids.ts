/** 도메인 전용 ID 생성기. localDB를 import하지 않아 Node 테스트에서도 그대로 쓸 수 있다. */
export function createId(prefix: string): string {
    const random =
        typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
}
