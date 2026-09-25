import { createElement, useCallback, useRef, useState, type ReactElement } from 'react';
import BackupPasswordDialog from '../components/BackupPasswordDialog';
import { useConfirm } from '../components/common/ConfirmProvider';
import { useAppToast } from '../components/Toast';
import {
    decryptBackupPayload,
    encryptBackupPayload,
    parseEncryptedBackupEnvelope,
    type EncryptedBackupEnvelope,
} from '../config/crypto';
import { createBackupJson, importAllData, parseBackupJson, type ParsedBackupData } from '../config/localDB';
import { runLegacyMigration } from '../services/legacyMigration';
import type { JjssSaveResult } from '../types/jjssFiles';
import { localDateKey } from '../utils/date';
import { saveJjssText } from '../utils/jjssFileService';

type BackupDialogState =
    | { mode: 'export' }
    | { mode: 'restore'; fileName: string; envelope: EncryptedBackupEnvelope; busy: boolean; error?: string };

interface UseBackupActionsOptions {
    /** 백업 파일 저장이 끝났을 때(취소 포함) 결과를 받는다. */
    onExportFinished?: (result: JjssSaveResult) => void;
}

const RESTORE_CONFIRM_MESSAGE = '경고: 데이터 복원은 현재 저장된 이용자, 사업체, 사례 문서, 직업훈련 기록 등을 백업 파일 내용으로 덮어쓸 수 있습니다.\n\n'
    + '복원 전에 현재 데이터 백업을 먼저 만들어 두는 것을 권장합니다.\n\n'
    + '계속 진행하시겠습니까?';

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 데이터 백업(내보내기)·복원(불러오기) 공용 동작. 상단 메뉴와 설정 화면이 함께 사용한다.
 * - 내보내기: 기본은 비밀번호 암호화 백업. 암호화 없이 저장은 고급 옵션에서 평문 경고를 확인받은 경우에만 한다.
 *   비밀번호는 저장하지 않으며, API 키(평문·암호문)는 createBackupJson에서 제외된다.
 * - 복원: 암호화된 백업이면 비밀번호를 묻고, 예전(평문) 백업도 그대로 복원한다.
 * 반환된 backupDialog를 컴포넌트 안 아무 곳에나 렌더링하면 된다(document.body에 그려짐).
 */
export function useBackupActions(options: UseBackupActionsOptions = {}) {
    const showToast = useAppToast();
    const confirm = useConfirm();
    const [dialog, setDialog] = useState<BackupDialogState | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const restoreAttemptRef = useRef(0);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const beginBusy = () => {
        if (busyRef.current) return false;
        busyRef.current = true;
        setBusy(true);
        return true;
    };
    const endBusy = () => {
        busyRef.current = false;
        setBusy(false);
    };

    const startExport = useCallback(() => {
        if (busyRef.current) return;
        setDialog({ mode: 'export' });
    }, []);

    const runExport = useCallback(async (password: string | null) => {
        setDialog(null);
        if (!beginBusy()) return;
        try {
            const { json, warnings } = await createBackupJson();
            const content = password ? await encryptBackupPayload(json, password) : json;
            const fileName = `JJSS_backup_${localDateKey()}${password ? '_암호화' : ''}.json`;
            const result = await saveJjssText('backup', fileName, content, 'application/json');
            optionsRef.current.onExportFinished?.(result);
            if (result.canceled) {
                showToast('백업 저장이 취소되었습니다.', 'info');
                return;
            }
            showToast(
                password
                    ? '비밀번호로 암호화한 백업 파일을 저장했습니다. 비밀번호를 잊지 않도록 보관해 주세요.'
                    : '암호화하지 않은 백업 파일을 저장했습니다. 이 파일에는 개인정보가 평문으로 포함됩니다. 보안이 확보된 저장장소에서만 사용하세요.',
                'success',
                5000,
            );
            for (const warning of warnings) showToast(warning, 'info', 8000);
        } catch (error) {
            showToast(`백업 파일을 만들지 못했습니다. ${errorMessage(error, '잠시 후 다시 시도해 주세요.')}`, 'error');
        } finally {
            endBusy();
        }
    }, [showToast]);

    const confirmAndRestore = useCallback(async (json: string) => {
        let data: ParsedBackupData;
        try {
            data = parseBackupJson(json);
        } catch (error) {
            showToast(`백업 파일을 복원할 수 없습니다. 올바른 JJSS 백업 파일인지 확인해 주세요. (${errorMessage(error, '형식 오류')})`, 'error');
            return;
        }
        const confirmed = await confirm({
            title: '데이터를 복원할까요?',
            message: RESTORE_CONFIRM_MESSAGE,
            confirmLabel: '복원',
            cancelLabel: '취소',
            tone: 'danger',
        });
        if (!confirmed) return;
        if (!beginBusy()) return;
        try {
            await importAllData(data);
            // 구형 백업에는 평문 직업평가 이력이 들어 있을 수 있다.
            // 암호화 저장소로 옮기는 것까지 끝낸 뒤에 "완료"를 알린다.
            await runLegacyMigration().catch(() => {
                // 옮기지 못하면 원본을 남긴다. 다음 실행에서 다시 시도한다.
            });
            showToast('데이터 복원이 완료되었습니다. 화면을 다시 불러옵니다.', 'success');
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast(`데이터 복원에 실패했습니다. ${errorMessage(error, '올바른 백업 파일인지 확인해 주세요.')}`, 'error');
            endBusy();
        }
    }, [confirm, showToast]);

    const restoreFromFile = useCallback(async (file: File) => {
        if (busyRef.current) return;
        let text: string;
        try {
            text = await file.text();
        } catch {
            showToast('백업 파일을 읽지 못했습니다. 파일이 열려 있거나 이동되었는지 확인해 주세요.', 'error');
            return;
        }
        let envelope: EncryptedBackupEnvelope | null;
        try {
            envelope = parseEncryptedBackupEnvelope(text);
        } catch (error) {
            showToast(errorMessage(error, '암호화된 백업 파일의 형식이 올바르지 않습니다.'), 'error');
            return;
        }
        if (envelope) {
            setDialog({ mode: 'restore', fileName: file.name, envelope, busy: false });
            return;
        }
        await confirmAndRestore(text);
    }, [confirmAndRestore, showToast]);

    const chooseRestoreFile = useCallback(() => {
        if (busyRef.current) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (file) void restoreFromFile(file);
        };
        input.click();
    }, [restoreFromFile]);

    const submitRestorePassword = useCallback(async (envelope: EncryptedBackupEnvelope, password: string) => {
        const attempt = ++restoreAttemptRef.current;
        setDialog(current => current?.mode === 'restore' ? { ...current, busy: true, error: undefined } : current);
        let json: string;
        try {
            json = await decryptBackupPayload(envelope, password);
        } catch (error) {
            if (attempt !== restoreAttemptRef.current) return;
            setDialog(current => current?.mode === 'restore'
                ? { ...current, busy: false, error: errorMessage(error, '비밀번호가 맞지 않습니다.') }
                : current);
            return;
        }
        // 확인 중에 창을 닫았다면 복원을 진행하지 않는다.
        if (attempt !== restoreAttemptRef.current) return;
        setDialog(null);
        await confirmAndRestore(json);
    }, [confirmAndRestore]);

    const cancelDialog = useCallback(() => {
        restoreAttemptRef.current += 1;
        setDialog(null);
    }, []);

    let backupDialog: ReactElement | null = null;
    if (dialog?.mode === 'export') {
        backupDialog = createElement(BackupPasswordDialog, {
            key: 'backup-export',
            mode: 'export',
            onSubmitPassword: password => void runExport(password),
            onSkipPassword: () => void runExport(null),
            onCancel: cancelDialog,
        });
    } else if (dialog?.mode === 'restore') {
        const { envelope } = dialog;
        backupDialog = createElement(BackupPasswordDialog, {
            key: `backup-restore-${dialog.fileName}`,
            mode: 'restore',
            fileName: dialog.fileName,
            busy: dialog.busy,
            error: dialog.error,
            onSubmitPassword: password => void submitRestorePassword(envelope, password),
            onCancel: cancelDialog,
        });
    }

    return {
        /** 백업 내보내기 시작(비밀번호 설정 창 표시) */
        startExport,
        /** 복원할 백업 파일 선택 창 열기 */
        chooseRestoreFile,
        /** 이미 고른 파일로 복원 시작 */
        restoreFromFile,
        busy,
        backupDialog,
    };
}
