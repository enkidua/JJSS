/**
 * 백업 복원 뒤 다시 불러온 첫 실행에서, 구형 백업의 평문 이력을 암호화 저장소로 옮기는 일까지 확인하고 결과를 알린다.
 *
 * 복원 직후(다시 불러오기 전)에는 저장소가 봉인되어 이관도 쓸 수 없다. 그래서 복원 화면은 표지만 남기고
 * 여기서 이관을 기다린 뒤에만 "복원 완료"를 알린다. 이관을 끝내지 못했는데 완료라고 알리면
 * 평문으로 남은 민감정보를 사용자가 모르고 넘어가게 된다.
 */
import { useEffect } from 'react';
import { POST_RESTORE_CHECK_KEY } from '../config/localDB';
import { runLegacyMigration } from '../services/legacyMigration';
import { useAppToast } from './Toast';

export function PostRestoreNotice() {
    const showToast = useAppToast();
    useEffect(() => {
        let marker: string | null = null;
        try {
            marker = localStorage.getItem(POST_RESTORE_CHECK_KEY);
        } catch {
            marker = null;
        }
        if (!marker) return;
        let cancelled = false;
        void (async () => {
            // 같은 실행의 앱 시작 이관과 겹쳐도 runLegacyMigration은 한 번만 돈다(진행 중 요청을 공유).
            const migration = await runLegacyMigration().catch(() => ({ migrated: 0, failed: 1, keptLegacy: true }));
            if (cancelled) return;
            try {
                localStorage.removeItem(POST_RESTORE_CHECK_KEY);
            } catch {
                // 표지를 지우지 못하면 다음 실행에서 한 번 더 확인할 뿐이다.
            }
            if (migration.keptLegacy || migration.failed > 0) {
                showToast(
                    '백업은 읽었으나 일부 민감정보의 암호화 이전을 완료하지 못했습니다. 기존 데이터는 지우지 않았으며 다음 실행에서 다시 시도합니다.',
                    'error',
                    10000,
                );
            } else {
                showToast('데이터 복원이 완료되었습니다.', 'success');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [showToast]);
    return null;
}
