import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff, RefreshCw, Cloud, AlertTriangle } from 'lucide-react';
import { getSharedDriveController, SHARED_DRIVE_APPLIED_EVENT, useSharedDriveStore } from '../features/sharedDrive/controller';
import { useDataStore } from '../store/dataStore';
import { useAppToast } from './Toast';

/**
 * 공유 저장소 실행부: 앱 시작 때 한 번 start(꺼져 있으면 상태 확인만), 다른 PC 변경을 받으면 화면의 목록을 다시 읽는다.
 * 켜져 있을 때만 오른쪽 아래 알림 묶음 안에 작은 상태 표시를 보인다(Layout의 알림 묶음 안에 둔다).
 */
export default function SharedDriveRuntime() {
    const phase = useSharedDriveStore(state => state.phase);
    const pending = useSharedDriveStore(state => state.pending);
    const conflicts = useSharedDriveStore(state => state.conflicts);
    const offline = useSharedDriveStore(state => state.offline);

    const showToast = useAppToast();
    useEffect(() => {
        const controller = getSharedDriveController();
        if (!controller) return;
        void controller.start().catch(() => undefined);
        const onApplied = (event: Event) => {
            void useDataStore.getState().refreshAfterSync();
            // 다른 PC의 삭제가 이 PC에 반영되면 알린다(열어 둔 화면에서 기록이 사라진 이유를 알 수 있게).
            const deleted = Number((event as CustomEvent<{ deleted?: number }>).detail?.deleted) || 0;
            if (deleted > 0) showToast(`다른 PC에서 지운 기록 ${deleted}건을 이 PC에서도 지웠습니다. 열어 둔 화면에서 그 기록은 더 이상 보이지 않습니다.`, 'info');
        };
        window.addEventListener(SHARED_DRIVE_APPLIED_EVENT, onApplied);
        return () => {
            window.removeEventListener(SHARED_DRIVE_APPLIED_EVENT, onApplied);
            controller.stop();
        };
    }, [showToast]);

    if (phase === 'off' || phase === 'unavailable') return null;
    const attention = phase === 'blocked' || phase === 'needs-key' || phase === 'paused-restore' || phase === 'error' || conflicts > 0;
    const label = phase === 'syncing' || phase === 'starting'
        ? '공유 저장소 동기화 중'
        : offline
            ? `오프라인 · 올릴 변경 ${pending}건`
            : phase === 'blocked'
                ? '공유 저장소 멈춤(보안 점검)'
                : phase === 'needs-key'
                    ? '공유 저장소 기관 키 필요'
                    : phase === 'paused-restore'
                        ? '공유 저장소 멈춤(복원 뒤)'
                        : phase === 'error'
                            ? '공유 저장소 오류'
                            : conflicts > 0
                                ? `충돌 ${conflicts}건 확인 필요`
                                : pending > 0 ? `올릴 변경 ${pending}건` : '공유 저장소 최신';
    const Icon = phase === 'syncing' || phase === 'starting' ? RefreshCw : offline ? CloudOff : attention ? AlertTriangle : Cloud;
    return (
        <Link
            to="/settings#shared-drive"
            state={{ focusSection: 'shared-drive' }}
            data-testid="shared-drive-chip"
            data-phase={phase}
            aria-live="polite"
            className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur ${attention ? 'border-amber-300/40 bg-amber-500/20 text-amber-100' : 'border-white/15 bg-slate-900/80 text-white/75'}`}
        >
            <Icon className={`h-3.5 w-3.5 ${phase === 'syncing' ? 'animate-spin' : ''}`} />
            {label}
        </Link>
    );
}
