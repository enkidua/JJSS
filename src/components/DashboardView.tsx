import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart3, PieChart, Activity, TrendingUp, Save, Edit3, X,
    Settings, Grid, FileUp, Palette
} from 'lucide-react';
import { getTextFileValidationError } from '../utils/fileValidation';
import { CopyButton } from './common/CopyButton';
import { FileDropZone } from './common/FileDropZone';
import { ToolPageShell } from './tools/ToolPageShell';
import { useReportDirty } from './tools/useReportDirty';

interface DashboardViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

interface Widget {
    id: string;
    type: 'kpi' | 'progress';
    title: string;
    value: string | number;
    subValue?: string;
    trend?: 'up' | 'down' | 'neutral';
    color: string;
    /** 처음 보여 주는 예시 수치인지. 값을 직접 고치면 false가 됩니다. */
    sample?: boolean;
}

const DEFAULT_WIDGETS: Widget[] = [
    { id: '1', type: 'kpi', title: '총 훈련생', value: '124', subValue: '전월 대비 +12%', trend: 'up', color: 'bg-blue-500', sample: true },
    { id: '2', type: 'kpi', title: '취업 성공', value: '42', subValue: '전월 대비 +5%', trend: 'up', color: 'bg-emerald-500', sample: true },
    { id: '3', type: 'kpi', title: '중도 탈락', value: '3', subValue: '전월 대비 -2%', trend: 'down', color: 'bg-rose-500', sample: true },
    { id: '4', type: 'progress', title: '목표 달성률', value: 75, subValue: '올해 목표 100명 중 75명', color: 'bg-amber-500', sample: true },
];

const THEMES = {
    dark: { bg: 'bg-[#1e293b]', border: 'border-white/10' },
    gradient: { bg: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900', border: 'border-white/20' },
    glass: { bg: 'bg-white/10 backdrop-blur-3xl', border: 'border-white/30 shadow-[0_8px_32px_rgba(255,255,255,0.1)]' }
};

const WIDGET_COLORS = [
    { value: 'bg-blue-500', label: '파랑' },
    { value: 'bg-emerald-500', label: '초록' },
    { value: 'bg-rose-500', label: '빨강' },
    { value: 'bg-amber-500', label: '주황' },
    { value: 'bg-purple-500', label: '보라' },
    { value: 'bg-pink-500', label: '분홍' },
    { value: 'bg-indigo-500', label: '남색' },
    { value: 'bg-slate-500', label: '회색' },
];

const toPercent = (value: string | number) => Math.min(100, Math.max(0, Number(value) || 0));

export function DashboardView({ onBack, onDirtyChange }: DashboardViewProps) {
    const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
    // 편집 중인 위젯은 id만 보관하고 목록에서 파생합니다(스냅샷을 두면 한 글자 이상 입력되지 않음).
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(true);
    const [theme, setTheme] = useState<'dark' | 'gradient' | 'glass'>('dark');
    const [statusMessage, setStatusMessage] = useState('');
    const [touched, setTouched] = useState(false);
    const editingWidget = widgets.find(w => w.id === editingId) ?? null;
    const hasSample = widgets.some(w => w.sample);

    useReportDirty(touched, onDirtyChange);

    const addWidget = (type: Widget['type']) => {
        const newWidget: Widget = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            title: '새 항목',
            value: type === 'progress' ? 50 : '0',
            subValue: '',
            color: 'bg-blue-500'
        };
        setWidgets(prev => [...prev, newWidget]);
        setEditingId(newWidget.id);
        setTouched(true);
    };

    const deleteWidget = (id: string) => {
        setWidgets(prev => prev.filter(w => w.id !== id));
        setEditingId(current => (current === id ? null : current));
        setTouched(true);
    };

    const updateWidget = (id: string, updates: Partial<Widget>) => {
        setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
        setTouched(true);
    };

    const handleFiles = (files: File[]) => {
        const file = files[0];
        if (!file) return;

        const validationError = getTextFileValidationError(file);
        if (validationError) {
            setStatusMessage(validationError);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = String(reader.result || '').trim();
                if (!text) throw new Error('파일에 읽을 수 있는 텍스트 데이터가 없습니다.');
                let headers: string[] = [];
                let body: string[][] = [];
                let numericValues: number[] = [];

                if (text.startsWith('{') || text.startsWith('[')) {
                    const parsed = JSON.parse(text);
                    const items: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
                    headers = Object.keys(items[0] || {});
                    body = items.map(item => headers.map(header => String(item?.[header] ?? '')));
                    numericValues = items.flatMap(item => Object.values(item ?? {}).map(value => Number(String(value).replace(/[^0-9.-]/g, ''))).filter(n => Number.isFinite(n)));
                } else {
                    const rows = text.split(/\r?\n/).map(row => row.split(',').map(cell => cell.trim())).filter(row => row.some(Boolean));
                    headers = rows[0] || [];
                    body = rows.slice(1);
                    numericValues = body.flatMap(row => row.map(cell => Number(String(cell).replace(/[^0-9.-]/g, ''))).filter(n => Number.isFinite(n)));
                }

                const sum = numericValues.reduce((acc, n) => acc + n, 0);
                const avg = numericValues.length ? Math.round(sum / numericValues.length) : 0;
                const baseId = Date.now();
                const newWidgets: Widget[] = [
                    { id: `${baseId}`, type: 'kpi', title: '데이터 행 수', value: body.length || 1, subValue: `파일: ${file.name}`, trend: 'neutral', color: 'bg-indigo-500' },
                    { id: `${baseId + 1}`, type: 'kpi', title: '숫자 합계', value: sum.toLocaleString(), subValue: `${numericValues.length}개 숫자 필드 기준`, trend: 'up', color: 'bg-emerald-500' },
                    { id: `${baseId + 2}`, type: 'progress', title: '평균값 지표', value: toPercent(avg), subValue: headers.length ? `열: ${headers.join(', ')}` : '헤더 없음', color: 'bg-amber-500' },
                ];
                setWidgets(newWidgets);
                setEditingId(null);
                setTouched(true);
                setStatusMessage('데이터 파일을 읽어 대시보드 위젯에 반영했습니다. 필요하면 위젯을 클릭해 수치를 수정하세요.');
            } catch (error: unknown) {
                setStatusMessage(error instanceof Error && error.message ? error.message : '데이터 파일을 읽지 못했습니다. CSV 형식의 텍스트 데이터를 사용해 주세요.');
            }
        };
        reader.onerror = () => {
            setStatusMessage('파일을 읽는 중 오류가 발생했습니다.');
        };
        reader.readAsText(file);
    };

    const reportText = `[대시보드 데이터 리포트]${hasSample ? '\n※ (예시) 표시 항목은 실제 값이 아닌 예시 수치입니다.' : ''}\n\n${widgets.map(w =>
        `■ ${w.title}${w.sample ? ' (예시)' : ''}\n - 수치: ${w.value}${w.type === 'progress' ? '%' : ''}\n - 내용: ${w.subValue || '-'}`
    ).join('\n\n')}`;

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-7xl mx-auto pb-20"
            actions={(
                <>
                    <FileDropZone
                        accept=".csv,.txt,.json"
                        onFiles={handleFiles}
                        ariaLabel="데이터 파일 불러오기"
                        className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-dashed border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-all font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        activeClassName="border-emerald-400 bg-emerald-500/10"
                    >
                        <FileUp className="w-4 h-4" aria-hidden="true" /> 데이터 파일 불러오기
                    </FileDropZone>

                    <button
                        type="button"
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-lg ${isEditMode ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                    >
                        {isEditMode ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                        {isEditMode ? '편집 완료' : '대시보드 수정'}
                    </button>
                    <CopyButton
                        text={reportText}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-40"
                    />
                </>
            )}
        >
            {statusMessage && (
                <div role="status" className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100">
                    {statusMessage}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* ─── 대시보드 캔버스 ─── */}
                <div className="lg:col-span-3 space-y-8">
                    <div className={`${THEMES[theme].bg} ${THEMES[theme].border} rounded-[2.5rem] p-8 min-h-[70vh] border relative overflow-hidden transition-all duration-500`}>
                        {/* Grid Pattern Background */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-10">
                                <div>
                                    <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                                        통계 현황 대시보드
                                        {hasSample && (
                                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30">예시 데이터</span>
                                        )}
                                    </h2>
                                    <p className="text-white/40 text-sm">
                                        {hasSample
                                            ? '"예시" 표시가 있는 수치는 실제 값이 아닙니다. 위젯을 눌러 실제 값으로 바꾸거나 데이터 파일을 불러오세요.'
                                            : '직접 입력하거나 불러온 수치로 만든 대시보드입니다.'}
                                    </p>
                                </div>
                                {isEditMode && (
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => addWidget('kpi')} className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all" title="KPI 추가" aria-label="KPI 위젯 추가">
                                            <Activity className="w-5 h-5" />
                                        </button>
                                        <button type="button" onClick={() => addWidget('progress')} className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all" title="진척도 추가" aria-label="진척도 위젯 추가">
                                            <TrendingUp className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                <AnimatePresence mode="popLayout">
                                    {widgets.map((w) => (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            key={w.id}
                                            className={`relative group rounded-3xl p-6 border border-white/10 bg-white/5 hover:border-white/20 transition-all ${editingId === w.id ? 'ring-2 ring-emerald-500/50' : ''} ${isEditMode ? 'cursor-pointer' : ''}`}
                                            onClick={() => isEditMode && setEditingId(w.id)}
                                        >
                                            {isEditMode && (
                                                <button
                                                    type="button"
                                                    aria-label={`${w.title} 위젯 삭제`}
                                                    onClick={(e) => { e.stopPropagation(); deleteWidget(w.id); }}
                                                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-20 shadow-lg"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}

                                            <div className="flex items-center justify-between mb-4">
                                                <span className="text-white/50 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                    {w.title}
                                                    {w.sample && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200 normal-case">예시</span>}
                                                </span>
                                                <div className={`w-8 h-8 rounded-lg ${w.color} flex items-center justify-center text-white`}>
                                                    {w.type === 'kpi' ? <PieChart className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
                                                </div>
                                            </div>

                                            {w.type === 'progress' ? (
                                                <div className="space-y-4">
                                                    <div className="flex items-end justify-between">
                                                        <span className="text-3xl font-black text-white">{toPercent(w.value)}%</span>
                                                        <span className="text-white/40 text-xs">{w.subValue}</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${toPercent(w.value)}%` }}
                                                            className={`h-full ${w.color}`}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <h3 className="text-3xl font-black text-white">{w.value}</h3>
                                                        {w.trend && (
                                                            <span className={`text-xs font-bold ${w.trend === 'up' ? 'text-emerald-400' : w.trend === 'down' ? 'text-rose-400' : 'text-white/35'}`}>
                                                                {w.trend === 'up' ? '▲' : w.trend === 'down' ? '▼' : '―'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-white/40 text-xs">{w.subValue}</p>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── 사이드바: 편집 도구 ─── */}
                <div className="lg:col-span-1">
                    <div className="sticky top-8 space-y-6">
                        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 h-fit">
                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <Palette className="w-5 h-5 text-purple-400" />
                                테마 설정
                            </h3>
                            <div className="flex gap-2 mb-8">
                                <button type="button" onClick={() => setTheme('dark')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme === 'dark' ? 'bg-white/20 border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>다크</button>
                                <button type="button" onClick={() => setTheme('gradient')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme === 'gradient' ? 'bg-white/20 border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>그라디언트</button>
                                <button type="button" onClick={() => setTheme('glass')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme === 'glass' ? 'bg-white/20 border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>글래스</button>
                            </div>

                            <hr className="border-white/10 mb-6" />

                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <Settings className="w-5 h-5 text-emerald-400" />
                                위젯 편집기
                            </h3>

                            {editingWidget ? (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="widget-title" className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5 block">타이틀</label>
                                        <input
                                            id="widget-title"
                                            type="text"
                                            value={editingWidget.title}
                                            onChange={(e) => updateWidget(editingWidget.id, { title: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-emerald-500/50"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="widget-value" className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5 block">
                                            값 (수치){editingWidget.type === 'progress' ? ' · 0~100' : ''}
                                        </label>
                                        <input
                                            id="widget-value"
                                            type={editingWidget.type === 'progress' ? 'number' : 'text'}
                                            min={editingWidget.type === 'progress' ? 0 : undefined}
                                            max={editingWidget.type === 'progress' ? 100 : undefined}
                                            value={editingWidget.value}
                                            onChange={(e) => updateWidget(editingWidget.id, { value: e.target.value, sample: false })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-emerald-500/50"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="widget-sub" className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5 block">서브 텍스트</label>
                                        <input
                                            id="widget-sub"
                                            type="text"
                                            value={editingWidget.subValue ?? ''}
                                            onChange={(e) => updateWidget(editingWidget.id, { subValue: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-emerald-500/50"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5 block">포인트 테마</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {WIDGET_COLORS.map(c => (
                                                <button
                                                    type="button"
                                                    key={c.value}
                                                    aria-label={`${c.label} 색상`}
                                                    title={c.label}
                                                    aria-pressed={editingWidget.color === c.value}
                                                    onClick={() => updateWidget(editingWidget.id, { color: c.value })}
                                                    className={`w-full aspect-square rounded-lg ${c.value} border-2 ${editingWidget.color === c.value ? 'border-white' : 'border-transparent'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="w-full py-3 mt-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl font-bold hover:bg-emerald-500/20 transition-all"
                                    >
                                        편집 완료
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-10">
                                    <Grid className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                    <p className="text-sm text-white/30">수정하고 싶은 위젯을<br/>클릭하여 편집하세요.</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-[2rem] p-6 border border-white/10">
                            <h4 className="text-white font-bold mb-2">사용 팁</h4>
                            <p className="text-xs text-white/50 leading-relaxed">
                                KPI 카드와 진척도 게이지를 조합하여 나만의 데이터 리포트를 만드세요. 편집 모드에서 위젯의 수치와 색상을 자유롭게 변경할 수 있습니다. 이 화면의 내용은 저장되지 않으니 "복사"로 옮겨 두세요.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </ToolPageShell>
    );
}
