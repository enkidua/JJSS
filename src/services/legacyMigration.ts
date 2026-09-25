/**
 * 예전 버전이 평문 localStorage에 남긴 직업평가 이력을 암호화 저장소(caseDocuments)로 옮긴다.
 *
 * 화면을 열 때만 옮기면 그 화면에 들어가지 않은 사용자의 PC에는 평문이 계속 남는다.
 * 그래서 **앱 시작 직후와 백업 복원 직후**에 이 모듈을 호출한다.
 *
 * 안전 규칙
 *  - 쓰기 → 다시 읽어 확인 → 그다음에만 평문 원본 삭제. 저장에 실패하면 원본을 남긴다.
 *  - 고정 ID를 써서 여러 번 실행해도 중복되지 않는다(idempotent).
 *  - 옮기는 동안 원본이 바뀌었으면(복원 등) 지우지 않고 다음에 다시 옮긴다.
 */
import * as localDB from '../config/localDB';
import type { CaseDocument } from '../types/caseDocument';

/** 예전 버전이 평문으로 쓰던 localStorage 키 */
export const LEGACY_HISTORY_KEY = 'jjss:vocational-evaluation-history';
const HISTORY_DOC_TYPE = 'vocational_evaluation' as const;
const ORGANIZATION = '직업재활기관';

type EvaluationKind = 'analysis' | 'report';

const KIND_TITLES: Record<EvaluationKind, string> = {
    analysis: '직업평가 결과분석',
    report: '직업평가 종합소견서',
};

/** 내용이 같은 항목을 같은 ID로 옮기기 위한 짧은 지문(FNV-1a). 개인정보를 담지 않는다. */
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

export interface MigrationResult {
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
  // 원본을 지우기 전에 다시 읽어 확인할 대상(문서 ID → 원래 내용)
  const toVerify = new Map<string, string>();
  for (const item of legacy.items) {
    const baseId = `vocational-eval-${item.legacyId}`;
    let targetId = baseId;
    if (contentById.has(baseId)) {
      if (contentById.get(baseId) === item.content) { toVerify.set(baseId, item.content); continue; }
      targetId = `${baseId}-${hashText(item.content)}`;
      if (contentById.has(targetId)) { toVerify.set(targetId, item.content); continue; }
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
      toVerify.set(targetId, item.content);
      migrated += 1;
    } catch {
      failed += 1;
    }
  }

  if (failed > 0) return { migrated, failed, keptLegacy: true, reason: 'failed' };
  if (legacy.skipped > 0) return { migrated, failed, keptLegacy: true, reason: 'partial' };

  // 암호화되어 저장되었고 다시 읽은 내용이 원본과 같은 것을 모두 확인한 뒤에만 평문 원본을 지웁니다.
  for (const [docId, content] of toVerify) {
    if (!(await localDB.verifyEncryptedField('caseDocuments', docId, 'content', content))) {
      return { migrated, failed: 1, keptLegacy: true, reason: 'failed' };
    }
  }

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
export function runLegacyMigration(): Promise<MigrationResult> {
  if (!migrationInFlight) {
    migrationInFlight = migrateLegacyHistory().finally(() => { migrationInFlight = null; });
  }
  return migrationInFlight;
}
