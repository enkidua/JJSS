/**
 * 검사 제한시간이 끝나면 "디리링" 알림음을 낸다.
 *
 * - 소리 파일 없이 Web Audio로 세 음(미-솔-도)을 합성한다. 외부 파일·네트워크가 필요 없다.
 * - 브라우저·Electron은 사용자가 누르기 전에는 소리를 막을 수 있어, "검사 시작"을 누를 때 미리 깨워 둔다(primeChime).
 * - 켜고 끄기는 이 PC에만 기억한다(평가실 사정에 따라 끌 수 있게). 저장소를 못 쓰면 켜진 상태로 동작한다.
 */

const STORAGE_KEY = 'jjss:ve-time-up-chime';

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    if (context) return context;
    const Constructor: AudioContextConstructor | undefined =
        typeof window === 'undefined'
            ? undefined
            : window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!Constructor) return null;
    try {
        context = new Constructor();
    } catch {
        context = null;
    }
    return context;
}

export function isChimeEnabled(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setChimeEnabled(enabled: boolean): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
        // 저장하지 못해도 이번 화면에서는 그대로 동작한다.
    }
}

/** 사용자 조작(검사 시작) 안에서 불러 오디오를 깨워 둔다. */
export function primeChime(): void {
    const ctx = audioContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** 디-리-링: 짧게 오르는 세 음, 마지막 음은 길게 울린다. */
export function playTimeUpChime(): void {
    if (!isChimeEnabled()) return;
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.02;
    const notes: Array<{ frequency: number; at: number; length: number }> = [
        { frequency: 1318.5, at: 0, length: 0.45 }, // 미(E6)
        { frequency: 1568.0, at: 0.12, length: 0.45 }, // 솔(G6)
        { frequency: 2093.0, at: 0.24, length: 1.1 }, // 도(C7)
    ];
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    for (const note of notes) {
        const t = start + note.at;
        // 기본음 + 옅은 배음으로 종소리처럼
        for (const [ratio, level] of [[1, 1], [2.01, 0.25]] as const) {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = note.frequency * ratio;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + note.length);
            oscillator.connect(gain);
            gain.connect(master);
            oscillator.start(t);
            oscillator.stop(t + note.length + 0.05);
        }
    }
}
