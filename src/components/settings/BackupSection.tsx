import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Database, DownloadCloud, FolderInput, FolderOpen, Lock, UploadCloud } from 'lucide-react';
import {
    chooseLegacyImportFolder, getJjssPaths, importLegacyDocuments, openJjssFolder, savedLocationMessage,
} from '../../utils/jjssFileService';
import type { JjssFileCategory, JjssPaths, LegacyImportPreview, LegacyImportResult } from '../../types/jjssFiles';
import { useBackupActions } from '../../hooks/useBackupActions';
import { useConfirm } from '../common/ConfirmProvider';
import { errorText } from './settingsShared';

const importCategoryLabels: Record<JjssFileCategory, string> = {
    backup: '백업', 'rehab-plan': '직업재활계획서', 'vocational-evaluation': '직업평가',
    'case-management': '상담·사례관리', budget: '예산', minutes: '회의록', utility: '업무지원', image: '이미지', other: '기타 JJSS 파일',
};

/** 파일 저장 위치·기존 문서 가져오기·데이터 백업/복원 (설정 화면 "파일·백업" 섹션) */
export default function BackupSection() {
    const confirm = useConfirm();
    const [jjssPaths, setJjssPaths] = useState<JjssPaths | null>(null);
    const [legacyPreview, setLegacyPreview] = useState<LegacyImportPreview | null>(null);
    const [includeLegacySubfolders, setIncludeLegacySubfolders] = useState(true);
    const [fileOperationMessage, setFileOperationMessage] = useState('');
    const [fileOperationBusy, setFileOperationBusy] = useState(false);
    const [importResult, setImportResult] = useState<LegacyImportResult | null>(null);
    const { startExport, chooseRestoreFile, busy: backupBusy, backupDialog } = useBackupActions({
        onExportFinished: result => setFileOperationMessage(savedLocationMessage(result)),
    });

    useEffect(() => {
        let active = true;
        void getJjssPaths()
            .then(paths => { if (active) setJjssPaths(paths); })
            .catch(() => { if (active) setFileOperationMessage('JJSS 문서 폴더를 준비하지 못했습니다.'); });
        return () => { active = false; };
    }, []);

    const handleChooseLegacyFolder = async () => {
        setFileOperationBusy(true);
        setFileOperationMessage('');
        setImportResult(null);
        try {
            const preview = await chooseLegacyImportFolder(includeLegacySubfolders);
            if (preview.canceled) return;
            if (preview.error === 'source-inside-jjss-root') {
                setFileOperationMessage('이미 JJSS 문서 폴더 안에 있는 위치는 가져오기 대상으로 선택할 수 없습니다.');
                return;
            }
            setLegacyPreview(preview);
            setFileOperationMessage(preview.total ? `JJSS 생성파일 ${preview.total}개를 찾았습니다.` : '선택한 폴더에서 가져올 JJSS 생성파일을 찾지 못했습니다.');
        } catch (error) {
            setFileOperationMessage(errorText(error, '기존 JJSS 문서 폴더를 확인하지 못했습니다.'));
        } finally {
            setFileOperationBusy(false);
        }
    };

    const handleOpenFolder = async (folderKey: 'documents' | 'backup') => {
        setFileOperationMessage('');
        try {
            await openJjssFolder(folderKey);
        } catch {
            setFileOperationMessage('JJSS 폴더를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    };

    const handleLegacyImport = async (mode: 'copy' | 'move', retry = false) => {
        if (!legacyPreview?.token || !legacyPreview.total) return;
        if (mode === 'move' && !retry) {
            const confirmed = await confirm({
                title: '새 JJSS 문서 폴더로 이동할까요?',
                message: '복사 및 검증이 완료된 파일만 원본 폴더에서 삭제됩니다. 새 JJSS 문서 폴더로 이동하시겠습니까?',
                confirmLabel: '이동',
                tone: 'danger',
            });
            if (!confirmed) return;
        }
        setFileOperationBusy(true);
        try {
            const result = await importLegacyDocuments(legacyPreview.token, mode);
            const failed = result.failed ?? result.results.filter(item => item.failed).length;
            const actionLabel = mode === 'copy' ? '복사' : '이동';
            setImportResult(result);
            if (failed > 0) {
                setFileOperationMessage(
                    `${result.imported}개 파일을 ${actionLabel}했고, ${failed}개 파일은 가져오지 못했습니다.`
                    + (result.retryAvailable ? ' 아래에서 사유를 확인한 뒤 "실패한 파일 다시 시도"를 눌러 주세요. 이미 가져온 파일은 다시 복사하지 않습니다.' : ' 가져오지 못한 파일의 원본은 그대로 남아 있습니다.'),
                );
                // 같은 token으로 실패한 파일만 다시 시도할 수 있도록 미리보기를 유지한다.
                if (!result.retryAvailable) setLegacyPreview(null);
            } else {
                setFileOperationMessage(`${result.imported}개 파일을 ${actionLabel}했습니다.${mode === 'copy' ? ' 원본 파일은 유지됩니다.' : ''}`);
                setLegacyPreview(null);
            }
        } catch (error) {
            setFileOperationMessage(errorText(error, '기존 JJSS 문서를 가져오지 못했습니다. 원본 파일은 유지됩니다.'));
        } finally {
            setFileOperationBusy(false);
        }
    };

    return (
        <motion.section
            id="files-backup"
            tabIndex={-1}
            aria-labelledby="files-backup-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card !p-6 mt-8 mb-20 scroll-mt-40"
        >
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                    <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 id="files-backup-title" className="text-white font-bold">데이터 백업 및 마이그레이션</h3>
                    <p className="text-white/40 text-xs">컴퓨터에 저장된 모든 데이터를 파일로 저장하거나 불러옵니다.</p>
                </div>
            </div>

            <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100/80">
                <p className="font-bold text-amber-100 mb-2">백업 파일 보안 안내</p>
                <p>백업 파일에는 이용자명, 연락처, 상담 내용, 사례 문서, 직업훈련 기록 등 개인정보가 포함됩니다.</p>
                <p>백업할 때 비밀번호를 설정하면 파일이 암호화되어 비밀번호 없이는 내용을 볼 수 없습니다. 비밀번호를 잊으면 복원할 수 없으니 안전한 곳에 적어 두세요.</p>
                <p>API 키는 백업 파일에서 제외되며, 복원 후 필요한 API 키는 설정 화면에서 다시 확인해 주세요.</p>
                <p>백업 파일은 외부에 공유하지 말고 안전한 위치에 보관해 주세요.</p>
                <p>데이터 복원은 기존 데이터를 덮어쓸 수 있으므로 실행 전 현재 데이터 백업을 먼저 만들어 두는 것을 권장합니다.</p>
            </div>

            <div className="mb-4 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 text-xs leading-relaxed text-blue-100/80">
                <p className="font-bold text-blue-100 mb-2">데이터 저장 위치 및 업데이트 전 백업 안내</p>
                <p>JJSS 데이터는 기본적으로 현재 PC의 앱 저장소(IndexedDB/localStorage)에 저장됩니다. 개발/브라우저 모드에서는 브라우저 IndexedDB/localStorage에 저장됩니다.</p>
                <p className="mt-2">Windows: 기존 버전을 삭제하거나 새 버전으로 교체하기 전에는 반드시 데이터 백업을 먼저 실행해 주세요. 현재 Windows 설치 파일의 언인스톨 동작이 환경에 따라 완전하지 않을 수 있으므로, 백업 파일을 별도 폴더에 보관해 주세요.</p>
                <p className="mt-2">macOS: 앱 파일을 삭제하거나 새 dmg로 교체하기 전에도 데이터 백업을 권장합니다. 로컬 저장소가 유지될 수 있으나 사용 환경에 따라 데이터가 사라질 수 있으므로, Apple Silicon용 dmg 설치 전 데이터 내보내기를 실행해 주세요.</p>
                <p className="mt-2">다른 PC나 다른 Windows 사용자 계정으로 옮길 때는 데이터 폴더를 복사하지 말고 백업 파일로 옮겨 주세요. 암호화된 개인정보는 원래 PC의 보안 키로만 읽을 수 있습니다.</p>
                <p className="mt-2">파일이 실제로 저장되는 경로는 아래에 표시됩니다.</p>
            </div>

            <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-xs leading-relaxed text-emerald-100/80">
                <p className="font-bold text-emerald-100 mb-2">JJSS 파일 저장 위치</p>
                {jjssPaths ? (
                    <div className="space-y-1 break-all">
                        <p><span className="text-white/45">기본 폴더:</span> {jjssPaths.root}</p>
                        <p><span className="text-white/45">백업:</span> {jjssPaths.backup}</p>
                        <p><span className="text-white/45">문서:</span> {jjssPaths.documents}</p>
                    </div>
                ) : (
                    <p>브라우저 개발 모드에서는 기존 브라우저 다운로드 위치를 사용합니다.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={!jjssPaths} onClick={() => void handleOpenFolder('documents')} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                        <FolderOpen className="w-4 h-4" /> 문서 폴더 열기
                    </button>
                    <button type="button" disabled={!jjssPaths} onClick={() => void handleOpenFolder('backup')} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                        <FolderOpen className="w-4 h-4" /> 백업 폴더 열기
                    </button>
                    <button type="button" disabled={!jjssPaths || fileOperationBusy} onClick={() => void handleChooseLegacyFolder()} className="btn-secondary !px-3 !py-2 flex items-center gap-2 disabled:opacity-40">
                        <FolderInput className="w-4 h-4" /> 기존 JJSS 문서 가져오기
                    </button>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs text-white/65">
                    <input
                        type="checkbox"
                        checked={includeLegacySubfolders}
                        disabled={!jjssPaths || fileOperationBusy}
                        onChange={event => setIncludeLegacySubfolders(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                    />
                    <span>선택한 폴더의 하위 폴더도 확인 (기본 켜짐, 최대 5단계·5,000개)</span>
                </label>
                {fileOperationMessage && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-white/75 whitespace-pre-wrap">{fileOperationMessage}</p>}
                {legacyPreview && !legacyPreview.canceled && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4">
                        <p className="font-bold text-white">발견한 JJSS 파일: {legacyPreview.total || 0}개</p>
                        <p className="mt-1 break-all text-white/45">선택 폴더: {legacyPreview.sourceFolder}</p>
                        <p className="mt-1 text-white/45">하위 폴더 확인: {legacyPreview.includeSubfolders ? '포함' : '선택 폴더만'}</p>
                        {legacyPreview.truncated && (
                            <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                                파일이 많아 처음 {(legacyPreview.maxFiles ?? legacyPreview.total ?? 0).toLocaleString('ko-KR')}개까지만 찾았습니다. 가져오기가 끝난 뒤 나머지 폴더를 나누어 다시 선택해 주세요.
                            </p>
                        )}
                        {((legacyPreview.skippedDirectories ?? 0) > 0 || (legacyPreview.skippedFiles ?? 0) > 0) && (
                            <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                                읽을 수 없는 {[
                                    (legacyPreview.skippedDirectories ?? 0) > 0 ? `폴더 ${legacyPreview.skippedDirectories}개` : '',
                                    (legacyPreview.skippedFiles ?? 0) > 0 ? `파일 ${legacyPreview.skippedFiles}개` : '',
                                ].filter(Boolean).join(', ')}는 건너뛰었습니다. 권한이 없거나 다른 프로그램에서 사용 중일 수 있습니다.
                            </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                            {Object.entries(legacyPreview.summary || {}).map(([category, count]) => (
                                <span key={category}>{importCategoryLabels[category as JjssFileCategory]} {count}</span>
                            ))}
                        </div>
                        <p className="mt-3 text-white/45">일반 사진·개인 문서 등 JJSS 파일명 규칙과 맞지 않는 파일은 건드리지 않습니다.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {importResult?.retryAvailable ? (
                                <button type="button" disabled={fileOperationBusy} onClick={() => void handleLegacyImport(importResult.mode, true)} className="btn-primary !px-3 !py-2 disabled:opacity-40">
                                    {fileOperationBusy ? '다시 시도하는 중…' : '실패한 파일 다시 시도'}
                                </button>
                            ) : (
                                <>
                                    <button type="button" disabled={!legacyPreview.total || fileOperationBusy} onClick={() => void handleLegacyImport('copy')} className="btn-primary !px-3 !py-2 disabled:opacity-40">복사 후 원본 유지 (권장)</button>
                                    <button type="button" disabled={!legacyPreview.total || fileOperationBusy} onClick={() => void handleLegacyImport('move')} className="btn-secondary !px-3 !py-2 disabled:opacity-40">새 폴더로 이동</button>
                                </>
                            )}
                            <button type="button" disabled={fileOperationBusy} onClick={() => { setLegacyPreview(null); setImportResult(null); }} className="btn-ghost !px-3 !py-2 disabled:opacity-40">
                                {importResult?.retryAvailable ? '닫기' : '취소'}
                            </button>
                        </div>
                    </div>
                )}
                {importResult && importResult.results.some(item => item.failed || item.warning) && (
                    <div className="mt-4 rounded-xl border border-amber-400/30 bg-black/15 p-4">
                        <p className="font-bold text-amber-100">확인이 필요한 파일</p>
                        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto break-all text-white/70">
                            {importResult.results.filter(item => item.failed || item.warning).map((item, index) => (
                                <li key={`${item.relativePath || item.name}-${index}`}>
                                    <span className={item.failed ? 'text-red-200' : 'text-amber-100'}>{item.failed ? '실패' : '참고'}</span>
                                    {' · '}{item.relativePath || item.name}
                                    {(item.reason || item.warning) && <span className="text-white/50"> — {item.reason || item.warning}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    type="button"
                    onClick={startExport}
                    disabled={backupBusy}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-5 text-left transition-all group flex flex-col justify-between disabled:cursor-wait disabled:opacity-60"
                >
                    <div className="mb-4">
                        <DownloadCloud className="w-6 h-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                        <h4 className="text-white font-medium mb-1">모든 데이터 내보내기</h4>
                        <p className="text-white/40 text-xs leading-relaxed">
                            이용자, 사업체, 사례 문서, 지출, 직업훈련 기록을 백업합니다. API 키는 제외됩니다. (.json 형식)
                        </p>
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-300/80">
                            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> 비밀번호 암호화 권장
                        </p>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={chooseRestoreFile}
                    disabled={backupBusy}
                    className="bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-xl p-5 text-left transition-all group flex flex-col justify-between relative overflow-hidden disabled:cursor-wait disabled:opacity-60"
                >
                    <div className="mb-4">
                        <UploadCloud className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                        <h4 className="text-white font-medium mb-1">데이터 불러오기</h4>
                        <p className="text-white/40 text-xs leading-relaxed">
                            백업 파일 내용으로 현재 데이터를 복원합니다. 기존 데이터가 대체될 수 있으니 주의해 주세요. 암호화된 백업은 비밀번호를 입력하면 복원됩니다.
                        </p>
                    </div>
                </button>
            </div>
            {backupDialog}
        </motion.section>
    );
}
