import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Users } from 'lucide-react';
import { getSharedDriveController, useSharedDriveStore } from '../features/sharedDrive/controller';
import type { EditingInfo } from '../features/sharedDrive/engine';
import type { SyncedStore } from '../features/sharedDrive/types';

export interface EditingState {
    /** 다른 직원이 같은 기록을 편집 중 */
    other: EditingInfo | null;
    /** 이 기록을 열어 둔 사이에 다른 PC가 고쳐 충돌로 남았다 */
    conflicted: boolean;
}

/**
 * 공유 저장소가 켜져 있을 때: 이 기록을 열어 두는 동안 다른 PC에 "편집 중"을 알리고(30분 지나면 무시됨),
 * 다른 직원이 같은 기록을 편집 중이면 알려 준다. 열어 둔 기록은 받기에서 덮어쓰지 않고 충돌로 남긴다.
 */
export function useSharedDriveEditing(store: SyncedStore, id: string | undefined): EditingState {
    const phase = useSharedDriveStore(state => state.phase);
    const lastSyncAt = useSharedDriveStore(state => state.lastSyncAt);
    const conflicts = useSharedDriveStore(state => state.conflicts);
    // 켜져 있고 연결된 상태(동기화 중이어도). 멈춘 상태로 바뀌었다 돌아오면 다시 표시한다.
    const active = phase === 'idle' || phase === 'syncing';
    const [state, setState] = useState<EditingState>({ other: null, conflicted: false });

    useEffect(() => {
        const controller = getSharedDriveController();
        if (!controller || !id || !active) return;
        void controller.setEditing(store, id, true);
        // 30분 표시가 끊기지 않게 20분마다 다시 찍는다.
        const refresh = window.setInterval(() => void controller.setEditing(store, id, true), 20 * 60 * 1000);
        return () => {
            window.clearInterval(refresh);
            void controller.setEditing(store, id, false);
        };
    }, [store, id, active]);

    useEffect(() => {
        const controller = getSharedDriveController();
        if (!controller || !id) {
            setState({ other: null, conflicted: false });
            return;
        }
        let alive = true;
        const other = controller.editingInfo(store, id);
        void controller.hasConflict(store, id).then(conflicted => { if (alive) setState({ other, conflicted }); });
        return () => { alive = false; };
    }, [store, id, lastSyncAt, phase, conflicts]);

    return state;
}

export default function SharedDriveEditingBanner({ store, id }: { store: SyncedStore; id: string | undefined }) {
    const { other, conflicted } = useSharedDriveEditing(store, id);
    if (!other && !conflicted) return null;
    const since = other ? new Date(other.since) : null;
    return (
        <div className="mb-3 space-y-2">
            {conflicted && (
                <div role="alert" data-testid="shared-drive-conflicted" className="flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>이 기록을 열어 둔 사이에 다른 PC에서 고친 내용이 도착해 충돌로 남겼습니다. 지금 저장해도 드라이브에는 올라가지 않습니다. <Link to="/settings#shared-drive" state={{ focusSection: 'shared-drive' }} className="underline">설정 → 공유 저장소</Link>에서 어느 쪽을 쓸지 고른 뒤 이어서 작성하세요.</span>
                </div>
            )}
            {other && (
                <div role="status" data-testid="shared-drive-editing" className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <Users className="h-4 w-4 shrink-0" />
                    {other.by} 님이 다른 PC에서 이 기록을 편집 중입니다({since && !Number.isNaN(since.getTime()) ? `${since.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}부터` : ''}). 같이 고치면 나중에 도착한 쪽이 충돌로 남아 직접 고르게 됩니다.
                </div>
            )}
        </div>
    );
}
