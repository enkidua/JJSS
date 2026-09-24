import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSearch,
  FileText,
  UploadCloud,
  X,
  Loader2,
  Download,
  Image as ImageIcon,
  Sparkles,
  Save,
  RotateCcw,
  History,
  Trash2,
  Edit3,
  UserRound,
} from 'lucide-react';
import { analyzeTestResults, generateReport } from '../services/gemini';
import { regenerateDocumentFromCurrent } from '../services/documentRegenerationService';
import { downloadAsDocx } from '../utils/docxGenerator';
import { getAiDocumentValidationError, getFileFingerprint } from '../utils/fileValidation';
import * as localDB from '../config/localDB';
import type { CaseDocument } from '../types/caseDocument';
import { FileDropZone } from '../components/common/FileDropZone';
import { CopyButton } from '../components/common/CopyButton';
import { useConfirm } from '../components/common/ConfirmProvider';
import { useAppToast } from '../components/Toast';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useDataStore } from '../store/dataStore';
import type { Seeker } from '../types/matching';
import { getSeekerKey, isSameSeeker } from '../utils/seeker';

/** 예전 버전이 평문으로 쓰던 localStorage 키. 화면 진입 시 사례문서 저장소(암호화)로 옮긴 뒤 지웁니다. */
const LEGACY_HISTORY_KEY = 'jjss:vocational-evaluation-history';
const HISTORY_DOC_TYPE = 'vocational_evaluation' as const;
const ORGANIZATION = '직업재활기관';

type EvaluationKind = 'analysis' | 'report';
type EvaluationTab = 'analyzer' | 'report' | 'history';

interface EvaluationHistoryDoc {
  id: string;
  type: EvaluationKind;
  title: string;
  content: string;
  savedAt: string;
  updatedAt?: string;
  /** 연결한 이용자(없으면 빈 문자열 — 예전 문서와 같은 형식) */
  seekerId: string;
  seekerName: string;
}

/** 다른 화면(직업재활 현황판 등)에서 넘겨주는 이동 정보 */
interface EvaluationNavigationState {
  seekerId?: string;
  seekerName?: string;
  tab?: string;
  documentId?: string;
}

function isEvaluationTab(value: unknown): value is EvaluationTab {
  return value === 'analyzer' || value === 'report' || value === 'history';
}

function findSeekerByKey(seekers: Seeker[], key: string): Seeker | null {
  if (!key) return null;
  return seekers.find(seeker => isSameSeeker(seeker, { id: key, seekerId: key })) || null;
}

/** 연결할 이용자 선택(선택사항). 값은 getSeekerKey(이용자), 빈 값은 "연결 안 함". */
function LinkedSeekerSelect({ id, label, value, seekers, storedName, onChange, disabled, className }: {
  id: string;
  label: string;
  value: string;
  seekers: Seeker[];
  /** 목록에 없는(삭제된) 이용자에 연결된 문서의 저장된 이름 */
  storedName?: string;
  onChange: (seekerKey: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const missing = !!value && !findSeekerByKey(seekers, value);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-bold text-white/70 mb-2">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="input-field disabled:opacity-60">
        <option value="">연결 안 함</option>
        {missing && <option value={value}>{storedName || '이름 없음'} (목록에 없는 이용자)</option>}
        {seekers.map(seeker => {
          const key = getSeekerKey(seeker);
          if (!key) return null;
          return (
            <option key={key} value={key}>
              {seeker.name}{seeker.disabilityType ? ` / ${seeker.disabilityType}` : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}

const KIND_TITLES: Record<EvaluationKind, string> = {
  analysis: '직업평가 결과분석',
  report: '직업평가 종합소견서',
};

// ─── 저장 이력(사례문서 저장소) 도우미 ───

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function secondsFromDateText(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

function timestampToIso(value: unknown): string | undefined {
  if (value && typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '날짜 미확인';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '날짜 미확인' : date.toLocaleString();
}

function toHistoryDoc(doc: CaseDocument): EvaluationHistoryDoc | null {
  if (!doc.id) return null;
  const type: EvaluationKind = doc.evaluationKind === 'report' ? 'report' : 'analysis';
  return {
    id: doc.id,
    type,
    title: doc.title || KIND_TITLES[type],
    content: typeof doc.content === 'string' ? doc.content : '',
    savedAt: timestampToIso(doc.createdAt) || '',
    updatedAt: timestampToIso(doc.updatedAt),
    seekerId: doc.seekerId ? String(doc.seekerId) : '',
    seekerName: typeof doc.seekerName === 'string' ? doc.seekerName : '',
  };
}

async function loadHistoryDocs(): Promise<EvaluationHistoryDoc[]> {
  const docs = await localDB.query<CaseDocument>('caseDocuments', doc => doc.type === HISTORY_DOC_TYPE);
  return docs
    .map(toHistoryDoc)
    .filter((doc): doc is EvaluationHistoryDoc => !!doc)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

interface LegacyHistoryItem {
  legacyId: string;
  type: EvaluationKind;
  title: string;
  content: string;
  savedAt?: string;
  updatedAt?: string;
}

type LegacyReadResult =
  | { status: 'absent' }
  | { status: 'unreadable' }
  | { status: 'ok'; raw: string; items: LegacyHistoryItem[]; skipped: number };

function readLegacyHistory(): LegacyReadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_HISTORY_KEY);
  } catch {
    return { status: 'absent' };
  }
  if (raw === null) return { status: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unreadable' };
  }
  if (!Array.isArray(parsed)) return { status: 'unreadable' };

  const items: LegacyHistoryItem[] = [];
  let skipped = 0;
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { content?: unknown }).content !== 'string') {
      skipped += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const content = record.content as string;
    const type: EvaluationKind = record.type === 'report' ? 'report' : 'analysis';
    const savedAt = typeof record.savedAt === 'string' ? record.savedAt : undefined;
    const rawId = typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id).trim() : '';
    items.push({
      legacyId: rawId || `h${hashText(`${savedAt || ''}\u0000${content}`)}`,
      type,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : KIND_TITLES[type],
      content,
      savedAt,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
    });
  }
  return { status: 'ok', raw, items, skipped };
}

interface MigrationResult {
  migrated: number;
  failed: number;
  /** 원본 localStorage 키를 남겨 두었는지(실패·읽을 수 없는 항목이 있을 때) */
  keptLegacy: boolean;
  reason?: 'unreadable' | 'failed' | 'partial';
}

/**
 * localStorage 평가 이력을 사례문서 저장소로 옮깁니다.
 * - 항목마다 고정 ID(`vocational-eval-<원래 ID>`)를 써서 다시 시도해도 중복으로 들어가지 않습니다.
 * - 같은 ID가 이미 있는데 내용이 다르면(부분 백업 복원 등) 내용 해시를 붙인 ID로 따로 보관합니다.
 * - 모든 항목을 옮긴 경우에만 원본 키를 지웁니다. 하나라도 실패하면 원본을 그대로 둡니다.
 */
async function migrateLegacyHistory(): Promise<MigrationResult> {
  const legacy = readLegacyHistory();
  if (legacy.status === 'absent') return { migrated: 0, failed: 0, keptLegacy: false };
  if (legacy.status === 'unreadable') return { migrated: 0, failed: 0, keptLegacy: true, reason: 'unreadable' };

  const existing = await localDB.query<CaseDocument>('caseDocuments', doc => doc.type === HISTORY_DOC_TYPE);
  const contentById = new Map<string, string>();
  existing.forEach(doc => { if (doc.id) contentById.set(doc.id, doc.content); });

  let migrated = 0;
  let failed = 0;
  for (const item of legacy.items) {
    const baseId = `vocational-eval-${item.legacyId}`;
    let targetId = baseId;
    if (contentById.has(baseId)) {
      if (contentById.get(baseId) === item.content) continue;
      targetId = `${baseId}-${hashText(item.content)}`;
      if (contentById.has(targetId)) continue;
    }
    const createdSeconds = secondsFromDateText(item.savedAt) ?? Math.floor(Date.now() / 1000);
    const updatedSeconds = secondsFromDateText(item.updatedAt);
    try {
      await localDB.addDoc<CaseDocument>('caseDocuments', {
        id: targetId,
        seekerId: '',
        seekerName: '',
        type: HISTORY_DOC_TYPE,
        tab: 'docs',
        source: 'evaluation',
        organization: ORGANIZATION,
        content: item.content,
        title: item.title,
        evaluationKind: item.type,
        legacyHistoryId: item.legacyId,
        createdAt: { seconds: createdSeconds },
        ...(updatedSeconds !== null ? { updatedAt: { seconds: updatedSeconds } } : {}),
      });
      contentById.set(targetId, item.content);
      migrated += 1;
    } catch {
      failed += 1;
    }
  }

  if (failed > 0) return { migrated, failed, keptLegacy: true, reason: 'failed' };
  if (legacy.skipped > 0) return { migrated, failed, keptLegacy: true, reason: 'partial' };

  try {
    // 옮기는 동안 백업 복원 등으로 값이 바뀌었다면 지우지 않고 다음 진입 때 다시 옮깁니다.
    if (localStorage.getItem(LEGACY_HISTORY_KEY) === legacy.raw) localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    // 원본을 지우지 못해도 다음 진입 때 고정 ID로 중복 없이 다시 확인합니다.
  }
  return { migrated, failed: 0, keptLegacy: false };
}

let migrationInFlight: Promise<MigrationResult> | null = null;

/** 개발 모드(StrictMode)처럼 화면이 두 번 마운트되어도 이관은 한 번만 실행합니다. */
function runLegacyMigration(): Promise<MigrationResult> {
  if (!migrationInFlight) {
    migrationInFlight = migrateLegacyHistory().finally(() => { migrationInFlight = null; });
  }
  return migrationInFlight;
}

function SelectedFileList({ files, onRemove, className }: { files: File[]; onRemove: (index: number) => void; className: string }) {
  if (files.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-sm font-medium text-slate-300">
        선택된 파일 ({files.length}개)
      </p>
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <div
            key={`${getFileFingerprint(file)}-${index}`}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-slate-200"
          >
            <span className="max-w-[150px] truncate" title={file.name}>{file.name}</span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`${file.name} 파일 빼기`}
              title="목록에서 빼기"
              className="text-white/40 hover:text-red-400 transition-colors p-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VocationalEvaluation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { seekers, initialized } = useDataStore();
  const confirm = useConfirm();
  const showToast = useAppToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [activeTab, setActiveTab] = useState<EvaluationTab>('analyzer');
  // 결과분석·종합소견서를 저장할 때 연결할 이용자(선택). 두 탭이 함께 씁니다.
  const [linkedSeekerKey, setLinkedSeekerKey] = useState('');
  const [linkingDocId, setLinkingDocId] = useState<string | null>(null);
  // 현황판에서 특정 문서를 열어 달라고 넘겨받은 경우, 이력을 다 불러온 뒤 엽니다.
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null);

  // Analyzer State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [analyzerInput, setAnalyzerInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefiningAnalysis, setIsRefiningAnalysis] = useState(false);
  const [analyzerResult, setAnalyzerResult] = useState('');
  const [savedAnalysisContent, setSavedAnalysisContent] = useState('');

  // Report State
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportInput, setReportInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefiningReport, setIsRefiningReport] = useState(false);
  const [reportResult, setReportResult] = useState('');
  const [savedReportContent, setSavedReportContent] = useState('');

  const [downloadError, setDownloadError] = useState('');

  // History State (사례문서 저장소의 'vocational_evaluation' 문서)
  const [savedDocs, setSavedDocs] = useState<EvaluationHistoryDoc[]>([]);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDraft, setHistoryDraft] = useState('');
  const [savingKind, setSavingKind] = useState<EvaluationKind | null>(null);
  const [savingHistory, setSavingHistory] = useState(false);
  const savingDocRef = useRef(false);
  const savingHistoryRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setHistoryStatus('loading');
    void (async () => {
      try {
        const result = await runLegacyMigration();
        if (!cancelled && result.keptLegacy) {
          if (result.reason === 'unreadable') {
            showToastRef.current('이전 직업평가 이력의 형식을 읽지 못해 옮기지 못했습니다. 원본은 지우지 않고 보관했습니다.', 'error');
          } else if (result.reason === 'failed') {
            showToastRef.current(`이전 직업평가 이력 중 ${result.failed}건을 옮기지 못했습니다. 원본은 지우지 않았고, 다음에 이 화면을 열 때 다시 시도합니다.`, 'error');
          } else {
            showToastRef.current('이전 직업평가 이력 중 형식이 올바르지 않은 항목이 있어 원본을 지우지 않고 보관했습니다.', 'info');
          }
        }
      } catch {
        if (!cancelled) {
          showToastRef.current('이전 직업평가 이력을 옮기지 못했습니다. 원본은 지우지 않았고, 다음에 이 화면을 열 때 다시 시도합니다.', 'error');
        }
      }
      try {
        const docs = await loadHistoryDocs();
        if (!cancelled) {
          setSavedDocs(docs);
          setHistoryStatus('ready');
        }
      } catch {
        if (!cancelled) setHistoryStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [historyReloadKey]);

  // 다른 화면에서 넘겨받은 state는 한 번만 쓰고 기록에서 지웁니다.
  const consumedNavigationKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const state = location.state as EvaluationNavigationState | null;
    if (!state || consumedNavigationKeyRef.current === location.key) return;
    const wantsSeeker = Boolean(state.seekerId);
    if (wantsSeeker && !initialized && seekers.length === 0) return; // 이용자 목록을 불러올 때까지 기다립니다.
    consumedNavigationKeyRef.current = location.key;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });

    if (state.documentId) {
      setPendingDocumentId(String(state.documentId));
      setActiveTab('history');
    } else if (isEvaluationTab(state.tab)) {
      setActiveTab(state.tab);
    }
    if (!wantsSeeker) return;
    const target = findSeekerByKey(seekers, String(state.seekerId));
    if (target) {
      setLinkedSeekerKey(getSeekerKey(target));
    } else {
      showToast('넘겨받은 이용자를 찾지 못했습니다. 저장할 때 연결할 이용자를 직접 선택해 주세요.', 'info');
    }
  }, [location.key, location.state, initialized, seekers]);

  useEffect(() => {
    if (!pendingDocumentId || historyStatus !== 'ready') return;
    setPendingDocumentId(null);
    const doc = savedDocs.find(item => item.id === pendingDocumentId);
    if (!doc) {
      showToast('요청한 평가 문서를 찾지 못했습니다. 삭제되었을 수 있습니다.', 'info');
      return;
    }
    if (!selectedHistoryId) {
      setSelectedHistoryId(doc.id);
      setHistoryDraft(doc.content);
    }
    window.setTimeout(() => {
      document.getElementById(`evaluation-history-${doc.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }, [pendingDocumentId, historyStatus, savedDocs]);

  const selectedHistoryDoc = savedDocs.find(doc => doc.id === selectedHistoryId) || null;
  const historyDraftDirty = !!selectedHistoryDoc && historyDraft !== selectedHistoryDoc.content;
  const analysisDirty = !!analyzerResult.trim() && analyzerResult !== savedAnalysisContent;
  const reportDirty = !!reportResult.trim() && reportResult !== savedReportContent;
  useUnsavedGuard(
    analysisDirty || reportDirty || historyDraftDirty,
    '저장하지 않은 직업평가 내용이 있습니다.\n이 화면을 떠나면 저장하지 않은 분석 결과·종합소견서·수정 내용이 사라집니다. 계속할까요?',
  );

  const latestSavedAnalysis = savedDocs.find(doc => doc.type === 'analysis')?.content || '';
  const selectedHistoryAnalysis = selectedHistoryDoc?.type === 'analysis' ? selectedHistoryDoc.content : '';
  const reportReferenceContent = [
    reportInput.trim() ? `[직접 입력 참고 내용]\n${reportInput.trim()}` : '',
    analyzerResult.trim() ? `[최근 결과분석기 내용]\n${analyzerResult.trim()}` : '',
    selectedHistoryAnalysis.trim() ? `[선택한 저장 결과분석 문서]\n${selectedHistoryAnalysis.trim()}` : '',
    !analyzerResult.trim() && !selectedHistoryAnalysis.trim() && latestSavedAnalysis.trim() ? `[저장된 최근 결과분석 문서]\n${latestSavedAnalysis.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  const canGenerateReport = !!reportReferenceContent.trim() || reportFiles.length > 0;

  const loadLatestAnalysisToReport = async () => {
    const source = analyzerResult.trim() || selectedHistoryAnalysis.trim() || latestSavedAnalysis.trim();
    if (!source) {
      showToast('불러올 결과분석 내용이 없습니다. 먼저 결과분석을 생성하거나 저장 문서에서 결과분석 문서를 선택해 주세요.', 'error');
      return;
    }
    if (reportInput.trim() && reportInput.trim() !== source) {
      const ok = await confirm({
        title: '참고 내용을 바꿀까요?',
        message: '지금 입력된 관찰 기록·면담 내용이 결과분석 내용으로 바뀝니다. 계속할까요?',
        confirmLabel: '바꾸기',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setReportInput(source);
    setActiveTab('report');
  };

  // === 파일 선택 (결과분석기·종합소견서 공통) ===
  const addFiles = (incoming: File[], setFiles: Dispatch<SetStateAction<File[]>>) => {
    const rejected = incoming
      .map(file => ({ file, error: getAiDocumentValidationError(file) }))
      .filter((item): item is { file: File; error: string } => !!item.error);
    if (rejected.length > 0) {
      const first = rejected[0];
      const more = rejected.length > 1 ? ` (그 외 ${rejected.length - 1}개 파일도 추가하지 못했습니다)` : '';
      showToast(`${first.file.name}: ${first.error}${more}`, 'error');
    }
    const valid = incoming.filter(file => !getAiDocumentValidationError(file));
    if (valid.length === 0) return;
    setFiles(prev => {
      const existing = new Set(prev.map(getFileFingerprint));
      return [...prev, ...valid.filter(file => !existing.has(getFileFingerprint(file)))];
    });
  };

  const removeFileAt = (setFiles: Dispatch<SetStateAction<File[]>>, index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    if (selectedFiles.length === 0 && !analyzerInput.trim()) {
      showToast('파일을 업로드하거나 분석할 내용을 입력해 주세요.', 'error');
      return;
    }

    setIsAnalyzing(true);
    setDownloadError('');

    try {
      const result = await analyzeTestResults(selectedFiles, analyzerInput);
      setAnalyzerResult(result);
      setReportInput(prev => prev.trim() ? prev : result);
    } catch (error: any) {
      showToast(error?.message || '결과 분석 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateReport = async () => {
    if (isGenerating) return;
    if (!canGenerateReport) {
      showToast('종합소견서 작성에 참고할 내용을 입력하거나 결과분석 내용을 먼저 생성해 주세요.', 'error');
      return;
    }

    setIsGenerating(true);
    setDownloadError('');

    try {
      const result = await generateReport(reportReferenceContent, reportFiles);
      setReportResult(result);
    } catch (error: any) {
      showToast(error?.message || '종합소견서 작성 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!reportResult) return;
    setDownloadError('');
    try {
      await downloadAsDocx(reportResult);
    } catch (error: any) {
      setDownloadError(error?.message || '문서 파일 생성 중 오류가 발생했습니다. 작성된 내용은 유지됩니다.');
    }
  };

  const saveEvaluationDoc = async (type: EvaluationKind) => {
    if (savingDocRef.current) return;
    const content = type === 'analysis' ? analyzerResult : reportResult;
    if (!content.trim()) {
      showToast('저장할 내용이 없습니다.', 'error');
      return;
    }
    const linkedSeeker = findSeekerByKey(seekers, linkedSeekerKey);
    savingDocRef.current = true;
    setSavingKind(type);
    try {
      const saved = await localDB.addDoc<CaseDocument>('caseDocuments', {
        seekerId: linkedSeeker ? getSeekerKey(linkedSeeker) : '',
        seekerName: linkedSeeker?.name || '',
        type: HISTORY_DOC_TYPE,
        tab: 'docs',
        source: 'evaluation',
        organization: ORGANIZATION,
        content,
        title: KIND_TITLES[type],
        evaluationKind: type,
        createdAt: localDB.localTimestamp(),
      });
      const doc = toHistoryDoc(saved);
      if (doc) setSavedDocs(prev => [doc, ...prev.filter(item => item.id !== doc.id)]);
      if (type === 'analysis') setSavedAnalysisContent(content);
      else setSavedReportContent(content);
      showToast(linkedSeeker ? `${linkedSeeker.name} 님과 연결해 저장 문서/이력에 저장했습니다.` : '저장 문서/이력에 저장했습니다.', 'success');
    } catch {
      showToast('저장하지 못했습니다. 작성한 내용은 화면에 그대로 있습니다.', 'error');
    } finally {
      savingDocRef.current = false;
      setSavingKind(null);
    }
  };

  const selectHistoryDoc = async (doc: EvaluationHistoryDoc) => {
    if (doc.id === selectedHistoryId) return;
    if (historyDraftDirty) {
      const ok = await confirm({
        title: '저장하지 않은 수정 내용',
        message: '수정 중인 문서에 저장하지 않은 내용이 있습니다. 다른 문서를 열면 수정한 내용이 사라집니다. 계속할까요?',
        confirmLabel: '버리고 열기',
        cancelLabel: '계속 수정',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSelectedHistoryId(doc.id);
    setHistoryDraft(doc.content);
  };

  const cancelHistoryEdit = async () => {
    if (historyDraftDirty) {
      const ok = await confirm({
        title: '수정 취소',
        message: '저장하지 않은 수정 내용을 버릴까요?',
        confirmLabel: '버리기',
        cancelLabel: '계속 수정',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSelectedHistoryId(null);
    setHistoryDraft('');
  };

  const saveHistoryDoc = async () => {
    if (savingHistoryRef.current) return;
    if (!selectedHistoryDoc) {
      showToast('수정할 문서를 먼저 선택해 주세요.', 'error');
      return;
    }
    if (!historyDraft.trim()) {
      showToast('저장할 내용이 없습니다.', 'error');
      return;
    }
    const docId = selectedHistoryDoc.id;
    const content = historyDraft;
    savingHistoryRef.current = true;
    setSavingHistory(true);
    try {
      const updatedAt = localDB.localTimestamp();
      await localDB.updateDoc<CaseDocument>('caseDocuments', docId, { content, updatedAt });
      const updatedIso = new Date(updatedAt.seconds * 1000).toISOString();
      setSavedDocs(prev => prev.map(doc => doc.id === docId ? { ...doc, content, updatedAt: updatedIso } : doc));
      showToast('직업평가 저장 문서를 수정했습니다.', 'success');
    } catch {
      showToast('수정 내용을 저장하지 못했습니다. 기존 내용은 유지됩니다.', 'error');
    } finally {
      savingHistoryRef.current = false;
      setSavingHistory(false);
    }
  };

  const changeHistoryLink = async (doc: EvaluationHistoryDoc, seekerKey: string) => {
    if (linkingDocId || seekerKey === doc.seekerId) return;
    const seeker = findSeekerByKey(seekers, seekerKey);
    if (seekerKey && !seeker) {
      showToast('선택한 이용자를 찾지 못했습니다. 이용자 목록을 확인해 주세요.', 'error');
      return;
    }
    // 연결을 풀 때는 이름도 비웁니다(이름만 남으면 같은 이름의 이용자 문서로 잘못 보일 수 있음).
    const seekerId = seeker ? getSeekerKey(seeker) : '';
    const seekerName = seeker?.name || '';
    setLinkingDocId(doc.id);
    try {
      await localDB.updateDoc<CaseDocument>('caseDocuments', doc.id, { seekerId, seekerName });
      setSavedDocs(prev => prev.map(item => item.id === doc.id ? { ...item, seekerId, seekerName } : item));
      showToast(seeker ? `${seeker.name} 님과 연결했습니다.` : '이용자 연결을 해제했습니다.', 'success');
    } catch {
      showToast('이용자 연결을 바꾸지 못했습니다. 기존 연결은 그대로 있습니다.', 'error');
    } finally {
      setLinkingDocId(null);
    }
  };

  const linkedNameOf = (doc: EvaluationHistoryDoc): string => {
    if (!doc.seekerId) return '';
    return findSeekerByKey(seekers, doc.seekerId)?.name || doc.seekerName || '이름 없음';
  };

  const deleteHistoryDoc = async (doc: EvaluationHistoryDoc) => {
    const ok = await confirm({
      title: '직업평가 기록 삭제',
      message: `"${doc.title}" 기록(${formatDateTime(doc.savedAt)} 저장)을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await localDB.deleteDoc('caseDocuments', doc.id);
      setSavedDocs(prev => prev.filter(item => item.id !== doc.id));
      if (selectedHistoryId === doc.id) {
        setSelectedHistoryId(null);
        setHistoryDraft('');
      }
      showToast('기록을 삭제했습니다.', 'success');
    } catch {
      showToast('삭제하지 못했습니다. 기존 기록은 그대로 있습니다.', 'error');
    }
  };

  const loadHistoryIntoEditor = async (doc: EvaluationHistoryDoc) => {
    const isSelected = doc.id === selectedHistoryId;
    const content = isSelected ? historyDraft : doc.content;
    const isAnalysis = doc.type === 'analysis';
    const current = isAnalysis ? analyzerResult : reportResult;
    if (current.trim() && current !== content) {
      const unsaved = isAnalysis ? analysisDirty : reportDirty;
      const ok = await confirm({
        title: '작성 중인 결과를 바꿀까요?',
        message: `${isAnalysis ? '결과분석기' : '종합 소견서'} 화면에 이미 결과가 있습니다.${unsaved ? ' 저장하지 않은 내용도 포함되어 있습니다.' : ''}\n불러온 문서로 바꾸면 지금 화면의 결과는 사라집니다. 계속할까요?`,
        confirmLabel: '바꾸기',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const alreadySaved = content === doc.content ? content : '';
    // 연결된 문서를 불러오면 다시 저장할 때도 같은 이용자와 연결되도록 맞춥니다.
    if (doc.seekerId) {
      const docSeeker = findSeekerByKey(seekers, doc.seekerId);
      setLinkedSeekerKey(docSeeker ? getSeekerKey(docSeeker) : '');
    }
    if (isAnalysis) {
      setAnalyzerResult(content);
      setSavedAnalysisContent(alreadySaved);
      setActiveTab('analyzer');
    } else {
      setReportResult(content);
      setSavedReportContent(alreadySaved);
      setActiveTab('report');
    }
  };

  const clearAnalyzer = async () => {
    if (!analyzerResult && !analyzerInput && selectedFiles.length === 0) return;
    const ok = await confirm({
      title: '결과분석기 초기화',
      message: `결과분석기 입력과 결과를 초기화할까요?${analysisDirty ? ' 저장하지 않은 분석 결과도 사라집니다.' : ''} 저장된 이력은 유지됩니다.`,
      confirmLabel: '초기화',
      tone: 'danger',
    });
    if (!ok) return;
    setSelectedFiles([]);
    setAnalyzerInput('');
    setAnalyzerResult('');
    setSavedAnalysisContent('');
    setDownloadError('');
  };

  const clearReport = async () => {
    if (!reportResult && !reportInput && reportFiles.length === 0) return;
    const ok = await confirm({
      title: '종합 소견서 초기화',
      message: `종합소견서 입력과 결과를 초기화할까요?${reportDirty ? ' 저장하지 않은 소견서도 사라집니다.' : ''} 저장된 이력은 유지됩니다.`,
      confirmLabel: '초기화',
      tone: 'danger',
    });
    if (!ok) return;
    setReportFiles([]);
    setReportInput('');
    setReportResult('');
    setSavedReportContent('');
    setDownloadError('');
  };

  const refineAnalysisResult = async () => {
    if (isRefiningAnalysis) return;
    if (!analyzerResult.trim()) {
      showToast('먼저 보완할 분석 결과가 필요합니다.', 'error');
      return;
    }
    const ok = await confirm({
      title: '분석 결과 보완',
      message: '현재 분석 결과 내용을 기준으로 보완합니다. 실패해도 기존 내용은 유지됩니다. 진행할까요?',
      confirmLabel: '보완하기',
    });
    if (!ok) return;
    const previous = analyzerResult;
    setIsRefiningAnalysis(true);
    try {
      const result = await regenerateDocumentFromCurrent('vocational_eval', {
        documentTitle: '직업평가 결과분석',
        currentContent: analyzerResult,
        userContext: analyzerInput ? `[담당자 직접 입력]\n${analyzerInput}` : '',
        additionalInstruction: '검사 결과 해석, 직업적 강점, 제한점, 추가 확인 필요사항, 지원 방향이 구분되도록 보완해 주세요.',
      });
      setAnalyzerResult(result);
      setReportInput(prev => prev.trim() ? prev : result);
    } catch (error: any) {
      setAnalyzerResult(previous);
      showToast(error?.message || '분석 결과 보완 중 오류가 발생했습니다. 기존 내용은 유지됩니다.', 'error');
    } finally {
      setIsRefiningAnalysis(false);
    }
  };

  const refineReportResult = async () => {
    if (isRefiningReport) return;
    if (!reportResult.trim()) {
      showToast('먼저 보완할 종합 소견서가 필요합니다.', 'error');
      return;
    }
    const ok = await confirm({
      title: '종합 소견서 보완',
      message: '현재 종합 소견서 내용을 기준으로 보완합니다. 실패해도 기존 내용은 유지됩니다. 진행할까요?',
      confirmLabel: '보완하기',
    });
    if (!ok) return;
    const previous = reportResult;
    setIsRefiningReport(true);
    try {
      const result = await regenerateDocumentFromCurrent('vocational_eval', {
        documentTitle: '직업평가 종합소견서',
        currentContent: reportResult,
        userContext: reportInput,
        previousRecords: analyzerResult,
        additionalInstruction: '현재 작성된 종합소견서의 표현을 유지하면서 직업목표, 장단기 지원계획, 수행방법 중심으로 보완해 주세요.',
      });
      setReportResult(result);
    } catch (error: any) {
      setReportResult(previous);
      showToast(error?.message || '종합 소견서 보완 중 오류가 발생했습니다. 기존 내용은 유지됩니다.', 'error');
    } finally {
      setIsRefiningReport(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20 pt-8" style={{ marginTop: '0' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black gradient-text">직업평가</h1>
          <p className="text-slate-400 mt-2">
            검사 결과를 분석하거나 종합 소견서를 자동으로 작성합니다.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div role="group" aria-label="직업평가 메뉴" className="flex space-x-2 bg-white/5 p-1 rounded-2xl glass-strong w-fit max-w-full overflow-x-auto border border-white/10 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          aria-pressed={activeTab === 'analyzer'}
          onClick={() => setActiveTab('analyzer')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'analyzer'
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileSearch className="w-5 h-5" />
          결과분석기
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          aria-pressed={activeTab === 'report'}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'report'
              ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileText className="w-5 h-5" />
          종합 소견서
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          aria-pressed={activeTab === 'history'}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-gradient-to-r from-slate-500 to-slate-700 text-white shadow-lg'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <History className="w-5 h-5" />
          저장 문서/이력
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {/* === Analyzer Tab === */}
        {activeTab === 'analyzer' && (
          <motion.div
            key="analyzer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid lg:grid-cols-2 gap-8"
          >
            {/* Left Box: Input */}
            <div className="glass-strong rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500 -mr-20 -mt-20 pointer-events-none" />
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-400" />
                검사 결과 업로드
              </h2>
              <p className="text-sm text-white/40 mb-6">PDF/이미지 파일과 직접 입력 텍스트를 함께 참고해서 분석할 수 있습니다.</p>

              <div className="space-y-6">
                <div>
                  <p className="block text-sm font-bold text-white/70 mb-2">1. PDF/이미지 업로드</p>
                  <FileDropZone
                    accept="image/*,.pdf"
                    multiple
                    onFiles={files => addFiles(files, setSelectedFiles)}
                    ariaLabel="검사 결과 파일 선택 (PDF 또는 이미지, 끌어다 놓기 가능)"
                    className="border-2 border-dashed border-white/20 rounded-2xl p-8 hover:border-blue-400 hover:bg-blue-500/5 transition-all cursor-pointer text-center group/dropzone focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    activeClassName="!border-blue-400 bg-blue-500/10"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 group-hover/dropzone:scale-110 transition-transform">
                      <ImageIcon className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-white font-medium mb-1">
                      클릭하여 파일 선택 (또는 여기에 끌어다 놓기)
                    </p>
                    <p className="text-sm text-slate-400">
                      지원 형식: JPG, PNG, GIF, WEBP, PDF
                    </p>
                  </FileDropZone>

                  <SelectedFileList
                    files={selectedFiles}
                    onRemove={index => removeFileAt(setSelectedFiles, index)}
                    className="mt-4 space-y-2"
                  />
                </div>

                <div>
                  <label htmlFor="evaluation-analyzer-input" className="block text-sm font-bold text-white/70 mb-2">2. 검사 결과 또는 관찰 메모 직접 입력</label>
                  <textarea
                    id="evaluation-analyzer-input"
                    value={analyzerInput}
                    onChange={(e) => setAnalyzerInput(e.target.value)}
                    placeholder="파일 없이 텍스트만 입력해도 분석할 수 있습니다. 검사명, 점수, 관찰 내용, 행동 특성 등을 자유롭게 적어주세요."
                    className="textarea-field !bg-black/20 border-white/10 !min-h-[160px] text-sm leading-relaxed"
                  />
                  <p className="mt-2 text-xs text-slate-400 flex justify-between">
                    <span>직접 입력 텍스트는 자동 비식별화 후 AI에 전달됩니다.</span>
                    <span>{analyzerInput.length}자</span>
                  </p>
                </div>

                <div>
                  <LinkedSeekerSelect
                    id="evaluation-analyzer-seeker"
                    label="3. 연결할 이용자 (선택)"
                    value={linkedSeekerKey}
                    seekers={seekers}
                    onChange={setLinkedSeekerKey}
                  />
                  <p className="mt-2 text-xs text-slate-400">이용자를 고르면 저장할 때 그 이용자의 직업평가 기록으로 연결되어 직업재활 현황판에 표시됩니다.</p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (selectedFiles.length === 0 && !analyzerInput.trim())}
                    className="flex-1 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <FileSearch className="w-5 h-5" />
                        결과 분석하기
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { void clearAnalyzer(); }}
                    type="button"
                    className="h-14 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-bold border border-white/10 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    초기화
                  </button>
                </div>
              </div>
            </div>

            {/* Right Box: Result */}
            <div className="glass-strong rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="p-6 md:p-8 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  분석 결과
                </h3>
                {analyzerResult && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void saveEvaluationDoc('analysis'); }}
                      disabled={savingKind !== null || !analysisDirty}
                      title={analysisDirty ? '저장 문서/이력에 저장' : '이미 저장한 내용입니다'}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingKind === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="hidden lg:inline">{analysisDirty ? '저장' : '저장됨'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void refineAnalysisResult(); }}
                      disabled={isRefiningAnalysis}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isRefiningAnalysis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      현재 내용 기반 보완
                    </button>
                    <button
                      type="button"
                      onClick={() => { void clearAnalyzer(); }}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-rose-200 text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden lg:inline">초기화</span>
                    </button>
                    <CopyButton
                      text={analyzerResult}
                      label="복사하기"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-40"
                    />
                  </div>
                )}
              </div>
              <div className="p-6 md:p-8 flex-1 overflow-auto">
                {!analyzerResult && !isAnalyzing && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <FileSearch className="w-16 h-16 mb-4 opacity-20" />
                    <p>분석 결과를 기다리고 있습니다.</p>
                  </div>
                )}
                {isAnalyzing && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                    <p className="text-white/70 font-medium">
                      사진 및 문서를 분석 중입니다...
                    </p>
                  </div>
                )}
                {analyzerResult && !isAnalyzing && (
                  <textarea
                    aria-label="분석 결과"
                    value={analyzerResult}
                    onChange={e => setAnalyzerResult(e.target.value)}
                    className="textarea-field !bg-black/25 border-white/10 !min-h-[560px] text-[15px] leading-relaxed resize-y"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* === Report Tab === */}
        {activeTab === 'report' && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid lg:grid-cols-2 gap-8"
          >
            {/* Left Box: Input */}
            <div className="glass-strong rounded-3xl p-6 md:p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl group-hover:bg-teal-500/20 transition-all duration-500 -mr-20 -mt-20 pointer-events-none" />
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-400" />
                참고 내용 입력
              </h2>

              <div className="space-y-6">
                <div>
                  <FileDropZone
                    accept="image/*,.pdf"
                    multiple
                    onFiles={files => addFiles(files, setReportFiles)}
                    ariaLabel="평가결과지 또는 관련 문서 선택 (선택사항, 이미지 또는 PDF, 끌어다 놓기 가능)"
                    className="border-2 border-dashed border-white/20 rounded-2xl p-4 hover:border-teal-400 hover:bg-teal-500/5 transition-all cursor-pointer text-center group/dropzone2 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    activeClassName="!border-teal-400 bg-teal-500/10"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <ImageIcon className="w-6 h-6 text-teal-400 group-hover/dropzone2:scale-110 transition-transform" />
                      <p className="text-white font-medium text-sm">
                        평가결과지 또는 관련 문서 업로드 (선택사항, 이미지/PDF, 끌어다 놓기 가능)
                      </p>
                    </div>
                  </FileDropZone>

                  <SelectedFileList
                    files={reportFiles}
                    onRemove={index => removeFileAt(setReportFiles, index)}
                    className="mb-4 space-y-2"
                  />

                  <label htmlFor="evaluation-report-input" className="block text-sm font-medium text-slate-300 mb-2 mt-4">
                    관찰 기록 및 면담 내용 (직접 입력 또는 분석기 내용 복사)
                  </label>
                  <div className="mb-3 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-3 text-sm text-teal-100">
                    PDF 없이도 직접 입력 내용이나 결과분석기 내용을 바탕으로 작성할 수 있습니다.
                  </div>
                  <button
                    type="button"
                    onClick={() => { void loadLatestAnalysisToReport(); }}
                    disabled={!analyzerResult.trim() && !selectedHistoryAnalysis.trim() && !latestSavedAnalysis.trim()}
                    className="mb-3 btn-ghost !bg-white/5 border border-white/10 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    최근 결과분석 내용 불러오기
                  </button>
                  <textarea
                    id="evaluation-report-input"
                    value={reportInput}
                    onChange={(e) => setReportInput(e.target.value)}
                    placeholder="직접 관찰한 내용, 면담 기록, 추가 전달사항 등을 적어주세요. PDF 없이도 결과분석기 내용이나 직접 입력 내용만으로 작성할 수 있습니다."
                    className="w-full h-48 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 resize-none transition-all"
                  />
                  <p className="mt-2 text-xs text-slate-400 flex justify-between">
                    <span>최대한 구체적으로 적을수록 더 좋은 소견서가 나옵니다.</span>
                    <span>{reportInput.length}자</span>
                  </p>
                </div>

                <div>
                  <LinkedSeekerSelect
                    id="evaluation-report-seeker"
                    label="연결할 이용자 (선택)"
                    value={linkedSeekerKey}
                    seekers={seekers}
                    onChange={setLinkedSeekerKey}
                  />
                  <p className="mt-2 text-xs text-slate-400">이용자를 고르면 저장할 때 그 이용자의 직업평가 기록으로 연결되어 직업재활 현황판에 표시됩니다.</p>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGenerating || !canGenerateReport}
                    className="w-full h-14 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        작성 중...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        보고서 작성하기
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Box: Result */}
            <div className="glass-strong rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              <div className="p-6 md:p-8 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-emerald-400" />
                  종합 소견서 결과
                </h3>
                {reportResult && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void saveEvaluationDoc('report'); }}
                      disabled={savingKind !== null || !reportDirty}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={reportDirty ? '저장 문서/이력에 저장' : '이미 저장한 내용입니다'}
                    >
                      {savingKind === 'report' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="hidden lg:inline">{reportDirty ? '저장' : '저장됨'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void refineReportResult(); }}
                      disabled={isRefiningReport}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-sm font-medium transition-colors disabled:opacity-50"
                      title="현재 내용 기반 보완"
                    >
                      {isRefiningReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                      <span className="hidden lg:inline">보완</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void clearReport(); }}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-rose-200 text-sm font-medium transition-colors"
                      title="초기화"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden lg:inline">초기화</span>
                    </button>
                    <CopyButton
                      text={reportResult}
                      label="복사"
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={handleDownloadDocx}
                      className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-medium transition-all shadow-lg"
                      title="Word 파일 다운로드"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden lg:inline">다운로드</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="p-6 md:p-8 flex-1 overflow-auto">
                {downloadError && (
                  <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {downloadError}
                  </div>
                )}
                {!reportResult && !isGenerating && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>보고서 결과가 여기에 표시됩니다.</p>
                  </div>
                )}
                {isGenerating && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-teal-500 animate-spin mb-4" />
                    <p className="text-white/70 font-medium">
                      전문적인 종합 소견서를 작성 중입니다...
                    </p>
                  </div>
                )}
                {reportResult && !isGenerating && (
                  <textarea
                    aria-label="종합 소견서 결과"
                    value={reportResult}
                    onChange={e => setReportResult(e.target.value)}
                    className="textarea-field !bg-black/25 border-white/10 !min-h-[560px] text-[15px] leading-relaxed resize-y"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-strong rounded-3xl border border-white/10 shadow-2xl p-6 md:p-8"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-2xl font-black text-white">저장 문서/이력</h2>
                <p className="text-sm text-white/40 mt-1">저장한 결과분석과 종합소견서를 이 PC에 보관합니다. 보기/수정으로 내용을 고치거나, 불러오기로 작성 화면에 다시 가져올 수 있습니다.</p>
              </div>
              {historyStatus === 'ready' && (
                <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/60">총 {savedDocs.length}건</span>
              )}
            </div>
            {historyStatus === 'loading' ? (
              <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/50 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> 저장 문서를 불러오는 중입니다.
              </div>
            ) : historyStatus === 'error' ? (
              <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-200">
                <p>저장 문서를 불러오지 못했습니다. 기존 기록은 지우지 않았습니다.</p>
                <button type="button" onClick={() => setHistoryReloadKey(key => key + 1)} className="btn-secondary !px-4 !py-2 text-sm mt-4">
                  다시 불러오기
                </button>
              </div>
            ) : savedDocs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/40">
                아직 저장된 직업평가 문서가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {savedDocs.map(doc => {
                  const isSelected = selectedHistoryId === doc.id;
                  return (
                  <div key={doc.id} id={`evaluation-history-${doc.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 scroll-mt-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs font-black text-blue-300 uppercase">{doc.type === 'analysis' ? '결과분석기' : '종합소견서'}</p>
                        <h3 className="text-lg font-black text-white">{doc.title}</h3>
                        <p className="text-xs text-white/35 mt-1">
                          저장: {formatDateTime(doc.savedAt)}
                          {doc.updatedAt ? ` / 수정: ${formatDateTime(doc.updatedAt)}` : ''}
                        </p>
                        <p className={`text-sm mt-1 flex items-center gap-1.5 ${doc.seekerId ? 'text-sky-200' : 'text-white/40'}`}>
                          <UserRound className="w-4 h-4" aria-hidden="true" />
                          {doc.seekerId ? `연결된 이용자: ${linkedNameOf(doc)}` : '연결된 이용자 없음'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isSelected ? (
                          <button
                            type="button"
                            onClick={() => { void cancelHistoryEdit(); }}
                            className="btn-ghost !bg-white/5 border border-white/10 text-sm flex items-center gap-2"
                          >
                            <X className="w-4 h-4" /> 수정 닫기
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { void selectHistoryDoc(doc); }}
                            className="btn-ghost !bg-white/5 border border-white/10 text-sm flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" /> 보기/수정
                          </button>
                        )}
                        <CopyButton
                          text={isSelected ? historyDraft : doc.content}
                          label="복사"
                          className="btn-ghost !bg-white/5 border border-white/10 text-sm flex items-center gap-2 disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={() => { void saveHistoryDoc(); }}
                          disabled={!isSelected || !historyDraftDirty || savingHistory}
                          className="btn-ghost !bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isSelected && savingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 저장
                        </button>
                        <button
                          type="button"
                          onClick={() => { void loadHistoryIntoEditor(doc); }}
                          className="btn-primary text-sm flex items-center gap-2"
                          title={doc.type === 'analysis' ? '결과분석기 화면으로 불러오기' : '종합 소견서 화면으로 불러오기'}
                        >
                          불러오기
                        </button>
                        <button
                          type="button"
                          onClick={() => { void deleteHistoryDoc(doc); }}
                          className="btn-ghost !bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> 삭제
                        </button>
                      </div>
                    </div>
                    <LinkedSeekerSelect
                      id={`evaluation-history-seeker-${doc.id}`}
                      label="이용자 연결 바꾸기 (고르면 바로 저장됩니다)"
                      value={doc.seekerId}
                      seekers={seekers}
                      storedName={doc.seekerName}
                      onChange={seekerKey => { void changeHistoryLink(doc, seekerKey); }}
                      disabled={linkingDocId !== null}
                      className="mb-3 max-w-md"
                    />
                    <textarea
                      aria-label={`${doc.title} 내용`}
                      readOnly={!isSelected}
                      value={isSelected ? historyDraft : doc.content}
                      onChange={e => { if (isSelected) setHistoryDraft(e.target.value); }}
                      className={`textarea-field !bg-black/20 border-white/10 !min-h-[280px] !max-h-[560px] text-sm leading-relaxed resize-y overflow-y-auto ${isSelected ? 'ring-1 ring-blue-400/40' : ''}`}
                    />
                    <p className="mt-2 text-xs text-white/35 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5" />
                      {isSelected
                        ? (historyDraftDirty ? '저장하지 않은 수정 내용이 있습니다. 저장 버튼을 눌러 주세요.' : '이 문서를 수정 중입니다. 변경 후 저장 버튼을 눌러 주세요.')
                        : '수정하려면 보기/수정 버튼을 누르세요.'}
                    </p>
                  </div>
                );})}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
