import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { getSharedDriveController, useSharedDriveStore } from '../features/sharedDrive/controller';
import type { EditingInfo } from '../features/sharedDrive/engine';
import type { SyncedStore } from '../features/sharedDrive/types';

/**
 * 공유 저장소가 켜져 있을 때: 이 기록을 열어 두는 동안 다른 PC에 "편집 중"을 알리고(30분 지나면 무시됨),
 * 다른 직원이 같은 기록을 편집 중이면 알려 준다. 강제 잠금은 아니다(나중에 저장한 쪽이 충돌로 남는다).
 */
export function useSharedDriveEditing(store: SyncedStore, id: string | undefined): EditingInfo | null {
    const phase = useSharedDriveStore(state => state.phase);
    const lastSyncAt = useSharedDriveStore(state => state.lastSyncAt);
    const [info, setInfo] = useState<EditingInfo | null>(null);

    useEffect(() => {
        const controller = getSharedDriveController();
        if (!controller || !id || phase !== 'idle') return;
        void controller.setEditing(store, id, true);
        // 30분 표시가 끊기지 않게 20분마다 다시 찍는다.
        const refresh = window.setInterval(() => void controller.setEditing(store, id, true), 20 * 60 * 1000);
        return () => {
            window.clearInterval(refresh);
            void controller.setEditing(store, id, false);
        };
        // phase가 idle↔syncing으로 바뀔 때마다 다시 찍지 않도록 켜짐 여부만 본다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, id, phase === 'off' || phase === 'unavailable']);

    useEffect(() => {
        const controller = getSharedDriveController();
        setInfo(controller && id ? controller.editingInfo(store, id) : null);
    }, [store, id, lastSyncAt, phase]);

    return info;
}

export default function SharedDriveEditingBanner({ store, id }: { store: SyncedStore; id: string | undefined }) {
    const info = useSharedDriveEditing(store, id);
    if (!info) return null;
    const since = new Date(info.since);
    return (
        <div role="status" data-testid="shared-drive-editing" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <Users className="h-4 w-4 shrink-0" />
            {info.by} 님이 다른 PC에서 이 기록을 편집 중입니다({Number.isNaN(since.getTime()) ? '' : `${since.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}부터`}). 같이 고치면 나중에 저장한 쪽이 충돌로 남습니다.
        </div>
    );
}
