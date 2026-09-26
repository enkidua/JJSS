/**
 * 검사 중 오류·진행 기록 단축키 규칙.
 *
 * 조합키 하나를 정해 F1~F12 전부에 똑같이 적용한다 — 키마다 조합이 다르면 외울 수 없다.
 *  - Windows·Linux: Ctrl + F1~F12. OS가 전역으로 예약한 Ctrl+F키 조합이 없어 어떤 PC에서도 안전하다.
 *  - macOS: ⌘(Cmd) + F1~F12. 맥은 Ctrl+F2~F8을 시스템 키보드 탐색이 쓰므로 Ctrl 대신 ⌘를 쓴다.
 *  - 조합키 없이 맨 F키가 앱까지 도달한 경우에도 기록한다(시스템이 가로채지 않았다면 뜻은 같다).
 *  - Alt(Alt+F4=창 닫기)·Shift(Shift+F10=컨텍스트 메뉴)·그 밖의 겹친 조합은 기록하지 않는다.
 */

export interface ShortcutKeyboardEvent {
    key: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
}

/** 실행 중인 화면이 macOS인지. 판별할 수 없으면 Windows 규칙을 쓴다. */
export function isMacKeyboard(): boolean {
    if (typeof navigator === 'undefined') return false;
    const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
    return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** 화면 표시용 조합키 이름: 'F3' → 'Ctrl+F3' (맥은 '⌘F3') */
export function shortcutDisplay(shortcut: string, mac = isMacKeyboard()): string {
    return mac ? `⌘${shortcut}` : `Ctrl+${shortcut}`;
}

/** 이 키 입력이 해당 단축키(F1~F12)로 인정되는지 */
export function matchesEventShortcut(
    shortcut: string | undefined,
    event: ShortcutKeyboardEvent,
    mac = isMacKeyboard(),
): boolean {
    if (!shortcut || event.key !== shortcut) return false;
    // Alt(창 닫기)·Shift(컨텍스트 메뉴) 조합은 다른 뜻이므로 기록하지 않는다.
    if (event.altKey || event.shiftKey) return false;
    const combo = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const bare = !event.ctrlKey && !event.metaKey;
    return combo || bare;
}
