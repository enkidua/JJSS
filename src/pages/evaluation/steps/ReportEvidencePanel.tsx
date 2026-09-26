/**
 * 보고서 근거 모음. 외부에서 불러온 결과지 값, 앱이 기록한 검사 결과, 행동관찰, 채택한 AI 해석 문장을
 * 한 곳에 모아 두고 "넣기" 한 번으로 소견서(요약·평가 상세)의 원하는 칸에 문장을 붙인다.
 *
 * 목적: 평가사가 결과지·기록을 오가며 옮겨 적지 않고, 필요한 문장을 골라 소견서를 빠르게 쓰는 것.
 * 문장은 붙인 뒤 자유롭게 고칠 수 있다 — 여기 있는 것은 초안 재료일 뿐 판단이 아니다.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import {
    REPORT_SECTIONS,
    adoptedClaims,
    analysisTitle,
    buildObservationNarrative,
    buildResultNarrative,
    claimText,
    getTestPlugin,
    selectCurrentRun,
    type AnalysisDocumentRecord,
    type EvaluationEpisode,
    type EvaluationReport,
    type InterpretationRun,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { selectActiveSourceDocument } from '../../../features/vocationalEvaluation/sourceDocument/record';

interface EvidenceItem {
    id: string;
    text: string;
    /** 어디서 온 문장인지(결과지·앱 기록·행동관찰·AI 해석) */
    source: string;
}

interface EvidenceGroup {
    id: string;
    title: string;
    items: EvidenceItem[];
}

/** 넣을 수 있는 칸: 요약 4칸 + 평가 상세 7칸(평가사 직접 서술) */
const SUMMARY_TARGETS = [
    ['summary:vocationalLevel', '요약 · 직업수준'],
    ['summary:strengths', '요약 · 직업적 강점'],
    ['summary:limitations', '요약 · 제한점·고려사항'],
    ['summary:recommendation', '요약 · 추천(적합 직무 및 사유)'],
] as const;

function appendLine(current: string, line: string): string {
    const trimmed = current.replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n${line}` : line;
}

export function buildEvidenceGroups(
    episode: EvaluationEpisode,
    sessions: TestSession[],
    documents: SourceDocumentRecord[],
    analyses: AnalysisDocumentRecord[] = [],
): EvidenceGroup[] {
    const groups: EvidenceGroup[] = [];
    for (const record of analyses) {
        const items = record.findings
            .filter(finding => finding.text.trim() && !finding.blocked)
            .map(finding => ({ id: `analysis:${record.id}:${finding.id}`, text: finding.text, source: `분석지 · ${analysisTitle(record)}` }));
        if (items.length) groups.push({ id: `analysis:${record.id}`, title: `분석지 · ${analysisTitle(record)}`, items });
    }
    for (const session of sessions) {
        const plugin = getTestPlugin(session.testPluginId);
        const document = selectActiveSourceDocument(documents, session.id);
        const narrative = buildResultNarrative(session, document);
        const source = narrative.fromOfficialDocument ? '공식 결과지 값' : '앱 기록 값';
        const items: EvidenceItem[] = [
            ...narrative.paragraphs.map(item => ({ id: `result:${session.id}:${item.key}`, text: item.text, source })),
            ...narrative.strengths.map((text, index) => ({ id: `strength:${session.id}:${index}`, text, source: `${source} · 강점 초안` })),
            ...narrative.limitations.map((text, index) => ({ id: `limit:${session.id}:${index}`, text, source: `${source} · 제한점 초안` })),
        ];
        const observations = session.observations
            .map(observation => ({ observation, narrative: buildObservationNarrative(observation) }))
            .filter((entry): entry is typeof entry & { narrative: { text: string } } => Boolean(entry.narrative))
            .map((entry, index) => ({ id: `obs:${session.id}:${index}`, text: entry.narrative.text, source: '행동관찰' }));
        const run = selectCurrentRun(episode.interpretations as InterpretationRun[], session.id);
        const claims = adoptedClaims(run).map(claim => ({
            id: `claim:${claim.id}`,
            text: claimText(claim),
            source: '채택한 AI 해석',
        }));
        const all = [...items, ...observations, ...claims];
        if (all.length) groups.push({ id: session.id, title: plugin.manifest.shortName, items: all });
    }
    return groups;
}

export function ReportEvidencePanel({
    episode,
    sessions,
    documents,
    analyses,
    report,
    locked,
    onUpdate,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    analyses: AnalysisDocumentRecord[];
    report: EvaluationReport;
    locked: boolean;
    onUpdate: (next: EvaluationReport) => void;
}) {
    const [open, setOpen] = useState(true);
    const [target, setTarget] = useState<string>('summary:strengths');
    const groups = useMemo(() => buildEvidenceGroups(episode, sessions, documents, analyses), [episode, sessions, documents, analyses]);

    if (!groups.length) return null;

    const targetLabel = [...SUMMARY_TARGETS, ...REPORT_SECTIONS.map(section => [`section:${section.id}`, `평가 상세 · ${section.title}`] as const)]
        .find(([value]) => value === target)?.[1];

    const insert = (text: string) => {
        if (locked) return;
        if (target.startsWith('summary:')) {
            const key = target.slice('summary:'.length) as keyof EvaluationReport['summary'];
            onUpdate({ ...report, summary: { ...report.summary, [key]: appendLine(report.summary[key], text) } });
            return;
        }
        const sectionId = target.slice('section:'.length);
        onUpdate({
            ...report,
            sections: report.sections.map(section =>
                section.id === sectionId ? { ...section, evaluatorText: appendLine(section.evaluatorText, text) } : section,
            ),
        });
    };

    return (
        <section className="glass-card !p-5 space-y-3">
            <button
                type="button"
                className="flex items-center gap-2 text-left w-full"
                aria-expanded={open}
                onClick={() => setOpen(current => !current)}
            >
                {open ? <ChevronDown size={16} className="text-white/50" /> : <ChevronRight size={16} className="text-white/50" />}
                <span className="font-semibold text-white">근거 모음 — 검사 결과·관찰에서 소견으로</span>
                <span className="text-xs text-white/40 ml-auto">
                    {groups.reduce((total, group) => total + group.items.length, 0)}건
                </span>
            </button>
            {open && (
                <>
                    <p className="text-xs text-white/45">
                        결과지·검사 기록에서 나온 문장입니다. 넣을 칸을 고르고 문장 옆 <strong>넣기</strong>를 누르면 그 칸 끝에
                        붙습니다. 붙인 뒤 자유롭게 고치세요.
                    </p>
                    <label htmlFor="ve-evidence-target" className="text-sm text-white/60 block">
                        넣을 칸
                        <select
                            id="ve-evidence-target"
                            className="input-field mt-1"
                            value={target}
                            disabled={locked}
                            onChange={event => setTarget(event.target.value)}
                        >
                            <optgroup label="종합소견 및 직업재활방향">
                                {SUMMARY_TARGETS.map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </optgroup>
                            <optgroup label="평가 상세(평가사 직접 서술)">
                                {REPORT_SECTIONS.map(section => (
                                    <option key={section.id} value={`section:${section.id}`}>
                                        {section.title}
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                    </label>
                    {groups.map(group => (
                        <div key={group.id}>
                            <p className="text-sm text-white/70 mb-1">{group.title}</p>
                            <ul className="space-y-1.5">
                                {group.items.map(item => (
                                    <li key={item.id} className="flex items-start gap-2 glass rounded-lg px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white/75">{item.text}</p>
                                            <p className="text-[11px] text-white/35 mt-0.5">{item.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-secondary !px-2.5 !py-1 text-xs shrink-0"
                                            disabled={locked}
                                            aria-label={`"${item.text.slice(0, 16)}…" ${targetLabel ?? ''}에 넣기`}
                                            onClick={() => insert(item.text)}
                                        >
                                            <CornerDownRight size={12} className="inline mr-1" />
                                            넣기
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </>
            )}
        </section>
    );
}
