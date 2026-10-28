/**
 * 공유 저장소 동기화 제어(앱 전체에 하나).
 *
 * - 꺼져 있으면(기본값) 아무것도 하지 않는다: 구글 요청 0건, 로컬 변경 구독 없음.
 * - 켜져 있으면: 시작 때·하루 한 번 보안 점검 → 이 PC 저장소 변경을 올릴 목록에 넣고 몇 초 뒤 올린다 →
 *   45초마다(창이 보일 때) 바뀐 것만 받는다.
 * - 복원 뒤에는 멈추고 "복원본 기준 / 드라이브 기준"을 사용자가 고를 때까지 기다린다.
 * - 보안 점검에 "차단"이 있으면 동기화하지 않는다.
 */
import { create } from 'zustand';
import { onLocalMutation, SHARED_DRIVE_RESTORE_PAUSE_KEY, type LocalMutation } from '../../config/localDB';
import { base64ToBytes, createDriveClient, getDriveBridge, SharedDriveError, unwrap } from './driveClient';
import { SyncEngine, type EditingInfo, type InitialSyncResult, type SyncProgress } from './engine';
import { deriveOrgKey } from './orgKey';
import { evaluateDriveSecurity, securityCheckDue, type SecurityReport } from './security';
import { conflictCodec, localDbAdapter } from './localAdapter';
import { IndexedDbSyncState } from './syncState';
import { isSyncedStore, type LocalAdapter, type SyncedStore, type SyncStateStore } from './types';

export type SharedDrivePhase =
    | 'unavailable' // 데스크톱 앱이 아님
    | 'off'
    | 'starting'
    | 'idle'
    | 'syncing'
    | 'paused-restore'
    | 'needs-key'
    | 'blocked'
    | 'error';

export interface SharedDriveViewState {
    phase: SharedDrivePhase;
    message: string;
    status: JjssDriveStatus | null;
    lastSyncAt: string;
    pending: number;
    conflicts: number;
    quarantined: number;
    keyCheckTampered: boolean;
    progress: SyncProgress | null;
    security: SecurityReport | null;
    offline: boolean;
}

export const useSharedDriveStore = create<SharedDriveViewState>(() => ({
    phase: getDriveBridge() ? 'off' : 'unavailable',
    message: '',
    status: null,
    lastSyncAt: '',
    pending: 0,
    conflicts: 0,
    quarantined: 0,
    keyCheckTampered: false,
    progress: null,
    security: null,
    offline: false,
}));

const PUSH_DEBOUNCE_MS = 3000;
const POLL_INTERVAL_MS = 45_000;
export const SHARED_DRIVE_APPLIED_EVENT = 'jjss:shared-drive-applied';

export interface ControllerDeps {
    bridge: JjssDriveBridge;
    local: LocalAdapter;
    createState: () => SyncStateStore;
    subscribe: (listener: (mutation: LocalMutation) => void) => () => void;
    storage: Pick<Storage, 'getItem' | 'removeItem'>;
    onApplied: (count: number) => void;
    setTimer: (run: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
    setRepeat: (run: () => void, ms: number) => unknown;
    clearRepeat: (handle: unknown) => void;
    isVisible: () => boolean;
}

function messageOf(error: unknown): string {
    if (error instanceof SharedDriveError) return error.message;
    return String((error as Error)?.message || '공유 저장소 동기화 중 문제가 생겼습니다.');
}

function isOffline(error: unknown): boolean {
    return /인터넷에 연결하지 못했|잠시 응답하지 않|DRIVE_BUSY/.test(`${(error as Error)?.message} ${(error as SharedDriveError)?.code}`);
}

export class SharedDriveController {
    private engine: SyncEngine | null = null;
    private state: SyncStateStore | null = null;
    private unsubscribe: (() => void) | null = null;
    private pushTimer: unknown = null;
    private pollHandle: unknown = null;
    private running = false;
    private domain = '';

    constructor(private readonly deps: ControllerDeps) {}

    private set(patch: Partial<SharedDriveViewState>) {
        useSharedDriveStore.setState(patch);
    }

    async refreshStatus(): Promise<JjssDriveStatus> {
        const status = await unwrap(this.deps.bridge.getStatus());
        this.domain = status.domain;
        this.set({ status });
        return status;
    }

    /** 앱 시작 때·설정에서 켠 뒤 부른다. 꺼져 있으면 아무 요청도 하지 않는다. */
    async start(): Promise<void> {
        this.stop();
        const status = await this.refreshStatus();
        if (!status.enabled) {
            this.set({ phase: 'off', message: '' });
            return;
        }
        this.set({ phase: 'starting', message: '공유 저장소에 연결하는 중…' });
        try {
            const keyBase64 = await unwrap(this.deps.bridge.getOrgKey());
            if (!keyBase64) {
                this.set({ phase: 'needs-key', message: '기관 키 코드를 넣어 주세요.' });
                return;
            }
            const key = await deriveOrgKey(base64ToBytes(keyBase64));
            this.state = this.deps.createState();
            this.engine = new SyncEngine({
                drive: createDriveClient(this.deps.bridge),
                local: this.deps.local,
                state: this.state,
                key,
                accountEmail: status.accountEmail,
                onProgress: progress => this.set({ progress }),
            });
            this.unsubscribe = this.deps.subscribe(mutation => this.onMutation(mutation));
            if (this.deps.storage.getItem(SHARED_DRIVE_RESTORE_PAUSE_KEY)) {
                this.set({ phase: 'paused-restore', message: '백업을 복원했습니다. 어느 쪽을 기준으로 맞출지 골라 주세요.' });
                await this.refreshCounts();
                return;
            }
            if (!(await this.checkSecurity(false))) return;
            const keyStatus = await this.engine.keyStatus();
            if (keyStatus === 'rotated') {
                this.set({ phase: 'needs-key', message: '기관 키가 바뀌었습니다. 관리자에게 새 기관 키 코드를 받아 넣어 주세요.' });
                return;
            }
            this.set({ phase: 'idle', message: '', keyCheckTampered: keyStatus === 'tampered' });
            this.pollHandle = this.deps.setRepeat(() => {
                if (this.deps.isVisible()) void this.syncNow();
            }, POLL_INTERVAL_MS);
            await this.syncNow();
        } catch (error) {
            this.set({ phase: 'error', message: messageOf(error), offline: isOffline(error) });
        }
    }

    stop(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.pushTimer) this.deps.clearTimer(this.pushTimer);
        if (this.pollHandle) this.deps.clearRepeat(this.pollHandle);
        this.pushTimer = null;
        this.pollHandle = null;
        this.engine = null;
        this.state = null;
    }

    get syncEngine(): SyncEngine | null {
        return this.engine;
    }

    /** 보안 점검(하루 한 번 또는 force). 차단이 있으면 false. */
    async checkSecurity(force: boolean): Promise<boolean> {
        if (!this.state) return false;
        const meta = await this.state.getMeta();
        if (!force && !securityCheckDue(meta.lastSecurityCheckAt) && useSharedDriveStore.getState().phase !== 'blocked') return true;
        const facts = await unwrap(this.deps.bridge.securityFacts());
        const report = evaluateDriveSecurity(facts, this.domain);
        this.set({ security: report });
        if (report.blocked) {
            this.set({ phase: 'blocked', message: '공유 드라이브 보안 점검에서 막힌 항목이 있어 동기화를 멈췄습니다. 설정에서 확인해 주세요.' });
            return false;
        }
        await this.state.setMeta({ lastSecurityCheckAt: new Date().toISOString() });
        return true;
    }

    private onMutation(mutation: LocalMutation) {
        if (mutation.origin !== 'app' || !isSyncedStore(mutation.store) || !this.engine) return;
        const engine = this.engine;
        void engine.noteLocalChange(mutation.store as SyncedStore, mutation.ids).then(() => {
            void this.refreshCounts();
            this.schedulePush();
        });
    }

    private schedulePush() {
        if (this.pushTimer) this.deps.clearTimer(this.pushTimer);
        this.pushTimer = this.deps.setTimer(() => {
            this.pushTimer = null;
            void this.syncNow();
        }, PUSH_DEBOUNCE_MS);
    }

    async refreshCounts(): Promise<void> {
        if (!this.state) return;
        const [outbox, conflicts, meta] = await Promise.all([this.state.outbox(), this.state.conflicts().catch(() => []), this.state.getMeta()]);
        this.set({ pending: outbox.length, conflicts: conflicts.length, quarantined: meta.quarantined?.length ?? 0, lastSyncAt: meta.lastPullAt || '' });
    }

    /** 받고 올린다. 이미 도는 중이면 건너뛴다. */
    async syncNow(): Promise<void> {
        const phase = useSharedDriveStore.getState().phase;
        if (!this.engine || this.running || phase === 'paused-restore' || phase === 'needs-key' || phase === 'blocked') return;
        this.running = true;
        this.set({ phase: 'syncing' });
        try {
            if (!(await this.checkSecurity(false))) return;
            const { pull } = await this.engine.syncOnce();
            if (pull.applied > 0) this.deps.onApplied(pull.applied);
            await this.refreshCounts();
            if (pull.needsNewKey) {
                this.set({ phase: 'needs-key', message: '기관 키가 바뀌었습니다. 관리자에게 새 기관 키 코드를 받아 넣어 주세요.' });
                return;
            }
            this.set({ phase: 'idle', message: '', offline: false, progress: null, keyCheckTampered: Boolean(pull.keyCheckTampered) || useSharedDriveStore.getState().keyCheckTampered });
        } catch (error) {
            this.set({ phase: isOffline(error) ? 'idle' : 'error', message: messageOf(error), offline: isOffline(error), progress: null });
            await this.refreshCounts().catch(() => undefined);
        } finally {
            this.running = false;
        }
    }

    /** 첫 맞추기(설정 마법사): 이 PC의 기존 자료 올리기 + 드라이브 자료 받기 */
    async initialSync(): Promise<InitialSyncResult> {
        if (!this.engine) throw new Error('공유 저장소가 준비되지 않았습니다.');
        this.running = true;
        try {
            const result = await this.engine.initialSync();
            if (result.downloaded > 0) this.deps.onApplied(result.downloaded);
            await this.refreshCounts();
            return result;
        } finally {
            this.running = false;
            this.set({ progress: null });
        }
    }

    /**
     * 복원 뒤 기준 고르기. 동기화 상태를 비우고 처음 맞추기를 다시 한 뒤, 내용이 다른 기록은 고른 쪽으로 정리한다.
     * - local: 이 PC 복원본으로 드라이브를 덮는다.
     * - drive: 드라이브 것으로 이 PC를 덮는다. (드라이브에 없는 복원본 기록은 올라간다 — 지우지 않는다)
     */
    async resolveRestore(choice: 'local' | 'drive'): Promise<InitialSyncResult> {
        if (!this.engine || !this.state) throw new Error('공유 저장소가 준비되지 않았습니다.');
        await unwrap(this.deps.bridge.backupLocalData());
        await this.state.clearAll();
        const result = await this.initialSync();
        for (const conflict of await this.engine.conflicts()) {
            await this.engine.resolveConflict(conflict.rid, choice === 'local' ? 'keep-local' : 'take-remote');
        }
        if (choice === 'local') await this.engine.push();
        if (choice === 'drive') this.deps.onApplied(1);
        this.deps.storage.removeItem(SHARED_DRIVE_RESTORE_PAUSE_KEY);
        this.set({ phase: 'idle', message: '' });
        await this.refreshCounts();
        if (!this.pollHandle) {
            this.pollHandle = this.deps.setRepeat(() => {
                if (this.deps.isVisible()) void this.syncNow();
            }, POLL_INTERVAL_MS);
        }
        return result;
    }

    editingInfo(store: SyncedStore, id: string): EditingInfo | null {
        return this.engine?.editingInfo(store, id) ?? null;
    }

    async setEditing(store: SyncedStore, id: string, editing: boolean): Promise<void> {
        if (!this.engine || useSharedDriveStore.getState().phase !== 'idle') return;
        await this.engine.setEditing(store, id, editing).catch(() => undefined);
    }
}

let singleton: SharedDriveController | null = null;

/** 앱의 컨트롤러(데스크톱 앱이 아니면 null) */
export function getSharedDriveController(): SharedDriveController | null {
    if (singleton) return singleton;
    const bridge = getDriveBridge();
    if (!bridge) return null;
    singleton = new SharedDriveController({
        bridge,
        local: localDbAdapter,
        createState: () => new IndexedDbSyncState(conflictCodec),
        subscribe: onLocalMutation,
        storage: window.localStorage,
        onApplied: count => window.dispatchEvent(new CustomEvent(SHARED_DRIVE_APPLIED_EVENT, { detail: { count } })),
        setTimer: (run, ms) => window.setTimeout(run, ms),
        clearTimer: handle => window.clearTimeout(handle as number),
        setRepeat: (run, ms) => window.setInterval(run, ms),
        clearRepeat: handle => window.clearInterval(handle as number),
        isVisible: () => document.visibilityState !== 'hidden',
    });
    return singleton;
}
