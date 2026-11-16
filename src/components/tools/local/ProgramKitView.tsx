import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Maximize2, Minimize2, Pause, Play, RotateCcw, Timer, Users, Volume2, VolumeX } from 'lucide-react';
import { ToolPageShell } from '../ToolPageShell';
import { useReportDirty } from '../useReportDirty';
import { CopyButton } from '../../common/CopyButton';
import { playChime, primeChime } from '../../../pages/evaluation/timeUpChime';
import { formatClock, formatGroups, labelDuplicates, makeGroups, parseNames, pickNames } from '../../../features/tools/groupMaker';
import { useTrainingRoster } from './useRoster';

interface LocalToolProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

type Tab = 'timer' | 'pick' | 'groups';

const TABS: Array<{ id: Tab; label: string; icon: typeof Timer }> = [
    { id: 'timer', label: '타이머', icon: Timer },
    { id: 'pick', label: '이름 뽑기', icon: Dices },
    { id: 'groups', label: '조 편성', icon: Users },
];

const PRESET_MINUTES = [1, 3, 5, 10, 15, 30];
const CHIME_KEY = 'jjss:program-timer-chime';

function readChimePreference(): boolean {
    try {
        return window.localStorage.getItem(CHIME_KEY) !== 'off';
    } catch {
        return true;
    }
}

/** 프로그램 진행 도구: 큰 화면 타이머, 이름 뽑기, 조 편성. 명단은 저장하지 않는다(화면을 닫으면 사라진다). */
export function ProgramKitView({ onBack, onDirtyChange }: LocalToolProps) {
    const [tab, setTab] = useState<Tab>('timer');

    // ── 명단(이름 뽑기·조 편성이 함께 쓴다)
    const [rosterText, setRosterText] = useState('');
    const { rooms } = useTrainingRoster();
    const names = useMemo(() => labelDuplicates(parseNames(rosterText)), [rosterText]);

    // ── 타이머: 끝나는 시각을 기준으로 계산한다(화면이 잠깐 멈춰도 시간이 밀리지 않게).
    const [durationSeconds, setDurationSeconds] = useState(5 * 60);
    const [remaining, setRemaining] = useState(5 * 60);
    const [running, setRunning] = useState(false);
    const [finished, setFinished] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [chimeOn, setChimeOn] = useState(readChimePreference);
    const [customMinutes, setCustomMinutes] = useState('');
    const endAtRef = useRef(0);
    const chimeOnRef = useRef(chimeOn);
    chimeOnRef.current = chimeOn;

    useEffect(() => {
        if (!running) return;
        const tick = () => {
            const left = (endAtRef.current - Date.now()) / 1000;
            if (left <= 0) {
                setRemaining(0);
                setRunning(false);
                setFinished(true);
                if (chimeOnRef.current) playChime();
                return;
            }
            setRemaining(left);
        };
        tick();
        const handle = window.setInterval(tick, 200);
        return () => window.clearInterval(handle);
    }, [running]);

    // 크게 보기는 Esc로 닫는다.
    useEffect(() => {
        if (!expanded) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setExpanded(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);

    const setTimer = (seconds: number) => {
        const safe = Math.max(1, Math.min(6 * 3600, Math.round(seconds)));
        setRunning(false);
        setFinished(false);
        setDurationSeconds(safe);
        setRemaining(safe);
    };
    const startTimer = () => {
        if (running) return;
        primeChime();
        const from = finished || remaining <= 0 ? durationSeconds : remaining;
        endAtRef.current = Date.now() + from * 1000;
        setFinished(false);
        setRemaining(from);
        setRunning(true);
    };
    const pauseTimer = () => {
        if (!running) return;
        setRemaining(Math.max(0, (endAtRef.current - Date.now()) / 1000));
        setRunning(false);
    };
    const resetTimer = () => {
        setRunning(false);
        setFinished(false);
        setRemaining(durationSeconds);
    };
    const toggleChime = () => {
        setChimeOn(current => {
            const next = !current;
            try { window.localStorage.setItem(CHIME_KEY, next ? 'on' : 'off'); } catch { /* 이번 화면에서는 그대로 동작한다 */ }
            return next;
        });
    };
    const applyCustom = () => {
        const minutes = Number(customMinutes.replace(',', '.'));
        if (Number.isFinite(minutes) && minutes > 0) setTimer(minutes * 60);
    };

    // ── 이름 뽑기
    const [pickCount, setPickCount] = useState(1);
    const [excludePicked, setExcludePicked] = useState(true);
    const [pickedHistory, setPickedHistory] = useState<string[]>([]);
    const [lastPicked, setLastPicked] = useState<string[]>([]);
    const remainingToPick = excludePicked ? names.filter(name => !pickedHistory.includes(name)).length : names.length;
    const pick = () => {
        const result = pickNames(names, excludePicked ? pickedHistory : [], pickCount);
        if (!result.length) return;
        setLastPicked(result);
        setPickedHistory(current => [...current, ...result]);
    };
    const resetPicks = () => {
        setPickedHistory([]);
        setLastPicked([]);
    };

    // ── 조 편성
    const [groupMode, setGroupMode] = useState<'count' | 'size'>('count');
    const [groupValue, setGroupValue] = useState(3);
    const [groups, setGroups] = useState<string[][]>([]);
    const buildGroups = () => {
        setGroups(makeGroups(names, groupMode === 'count' ? { groupCount: groupValue } : { groupSize: groupValue }));
    };

    // 명단이 바뀌면 이전 결과는 맞지 않으므로 비운다.
    useEffect(() => {
        setGroups([]);
        setPickedHistory([]);
        setLastPicked([]);
    }, [rosterText]);

    useReportDirty(Boolean(rosterText.trim()) || running, onDirtyChange);

    const progress = durationSeconds > 0 ? Math.min(100, Math.max(0, (1 - remaining / durationSeconds) * 100)) : 0;
    const clock = formatClock(remaining);
    const warning = !finished && remaining <= Math.min(60, durationSeconds * 0.2);

    const timerFace = (large: boolean) => (
        <div className={`text-center ${large ? '' : 'rounded-2xl border border-white/10 bg-black/20 p-6'}`}>
            <p
                role="timer"
                aria-live={finished ? 'assertive' : 'off'}
                aria-label={finished ? '시간이 끝났습니다' : `남은 시간 ${clock}`}
                data-testid="program-timer-clock"
                className={`font-black tabular-nums tracking-tight ${large ? 'text-[22vw] leading-none' : 'text-7xl sm:text-8xl'} ${finished ? 'text-rose-300 animate-pulse' : warning ? 'text-amber-300' : 'text-white'}`}
            >
                {clock}
            </p>
            <p className={`mt-2 font-semibold ${large ? 'text-3xl' : 'text-sm'} ${finished ? 'text-rose-200' : 'text-white/50'}`}>
                {finished ? '시간이 끝났습니다' : running ? '진행 중' : remaining < durationSeconds ? '일시정지' : '준비'}
            </p>
            <div className={`mx-auto mt-4 h-2 overflow-hidden rounded-full bg-white/10 ${large ? 'w-3/4' : 'w-full'}`} aria-hidden="true">
                <div className={`h-full rounded-full transition-all ${finished ? 'bg-rose-400' : warning ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {running
                    ? <button type="button" onClick={pauseTimer} className="btn-secondary inline-flex items-center gap-2 px-5! py-2.5!"><Pause className="h-4 w-4" /> 일시정지</button>
                    : <button type="button" onClick={startTimer} className="btn-primary inline-flex items-center gap-2 px-5! py-2.5!"><Play className="h-4 w-4" /> {finished ? '다시 시작' : remaining < durationSeconds ? '이어서' : '시작'}</button>}
                <button type="button" onClick={resetTimer} className="btn-secondary inline-flex items-center gap-2 px-4! py-2.5!"><RotateCcw className="h-4 w-4" /> 처음으로</button>
                <button type="button" onClick={toggleChime} aria-pressed={chimeOn} className="btn-ghost inline-flex items-center gap-2 px-3! py-2.5! text-sm">
                    {chimeOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} 끝 알림음 {chimeOn ? '켜짐' : '꺼짐'}
                </button>
                <button type="button" onClick={() => setExpanded(value => !value)} className="btn-ghost inline-flex items-center gap-2 px-3! py-2.5! text-sm">
                    {large ? <><Minimize2 className="h-4 w-4" /> 작게 보기</> : <><Maximize2 className="h-4 w-4" /> 크게 보기</>}
                </button>
            </div>
        </div>
    );

    const rosterBox = (
        <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <label htmlFor="program-roster" className="text-sm font-medium text-white/70">명단 <span className="text-white/40">({names.length}명)</span></label>
                {rooms.length > 0 && (
                    <label className="text-xs text-white/50">
                        <span className="sr-only">훈련실 명단 불러오기</span>
                        <select
                            className="input-field py-1.5! text-xs"
                            value=""
                            onChange={event => {
                                const room = rooms.find(item => item.id === event.target.value);
                                if (room) setRosterText(room.trainees.join('\n'));
                            }}
                        >
                            <option value="" className="bg-slate-900">직업훈련 훈련실에서 불러오기…</option>
                            {rooms.map(room => <option key={room.id} value={room.id} className="bg-slate-900">{room.name} ({room.trainees.length}명)</option>)}
                        </select>
                    </label>
                )}
            </div>
            <textarea
                id="program-roster"
                className="input-field min-h-[120px]"
                rows={5}
                placeholder={'한 줄에 한 명씩(또는 쉼표로) 적어 주세요.\n예: 가온, 나래, 다솜'}
                value={rosterText}
                onChange={event => setRosterText(event.target.value)}
            />
            <p className="text-xs text-white/40">명단은 저장하지 않습니다. 이 화면을 닫으면 사라집니다.</p>
        </div>
    );

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
            title="프로그램 진행 도구"
            description="집단 프로그램·교육 시간에 쓰는 타이머, 이름 뽑기, 조 편성"
            icon={Timer}
            iconGradient="from-violet-500 to-fuchsia-600"
        >
            <div className="glass-strong rounded-2xl p-6 border border-white/10 space-y-5">
                <div role="tablist" aria-label="진행 도구 종류" className="flex flex-wrap gap-2">
                    {TABS.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === item.id}
                                onClick={() => setTab(item.id)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${tab === item.id ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}
                            >
                                <Icon className="h-4 w-4" /> {item.label}
                                {item.id === 'timer' && running && <span className="ml-1 rounded-full bg-emerald-500/30 px-2 text-[11px] tabular-nums text-emerald-100">{clock}</span>}
                            </button>
                        );
                    })}
                </div>

                {tab === 'timer' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            {PRESET_MINUTES.map(minutes => (
                                <button
                                    key={minutes}
                                    type="button"
                                    disabled={running}
                                    onClick={() => setTimer(minutes * 60)}
                                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${durationSeconds === minutes * 60 ? 'border-violet-400/50 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}
                                >
                                    {minutes}분
                                </button>
                            ))}
                            <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); applyCustom(); }}>
                                <label htmlFor="program-timer-custom" className="sr-only">직접 입력(분)</label>
                                <input id="program-timer-custom" className="input-field w-24 py-1.5! text-sm" inputMode="decimal" placeholder="직접(분)" value={customMinutes} onChange={event => setCustomMinutes(event.target.value)} disabled={running} />
                                <button type="submit" disabled={running || !customMinutes.trim()} className="btn-secondary px-3! py-1.5! text-sm disabled:opacity-40">맞추기</button>
                            </form>
                        </div>
                        {timerFace(false)}
                        <p className="text-xs text-white/40">다른 탭(이름 뽑기·조 편성)으로 가도 타이머는 계속 갑니다. 도구 목록으로 돌아가면 멈춥니다.</p>
                    </div>
                )}

                {tab === 'pick' && (
                    <div className="space-y-4">
                        {rosterBox}
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm text-white/70">
                                한 번에
                                <select className="input-field ml-2 inline-block w-20 py-1.5!" value={pickCount} onChange={event => setPickCount(Number(event.target.value))}>
                                    {[1, 2, 3, 4, 5].map(count => <option key={count} value={count} className="bg-slate-900">{count}명</option>)}
                                </select>
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-white/70">
                                <input type="checkbox" checked={excludePicked} onChange={event => setExcludePicked(event.target.checked)} /> 뽑힌 사람은 다시 뽑지 않기
                            </label>
                            <button type="button" onClick={pick} disabled={!remainingToPick} className="btn-primary inline-flex items-center gap-2 px-5! py-2.5! disabled:opacity-50"><Dices className="h-4 w-4" /> 뽑기</button>
                            <button type="button" onClick={resetPicks} disabled={!pickedHistory.length} className="btn-ghost px-3! py-2.5! text-sm disabled:opacity-40">처음부터</button>
                        </div>
                        <div aria-live="polite" data-testid="program-pick-result" className="min-h-[120px] rounded-2xl border border-white/10 bg-black/20 p-6 text-center">
                            {lastPicked.length
                                ? <p className="text-4xl sm:text-5xl font-black text-white break-keep">{lastPicked.join(' · ')}</p>
                                : <p className="text-sm text-white/40">{names.length ? '"뽑기"를 누르면 여기에 크게 나옵니다.' : '먼저 명단을 넣어 주세요.'}</p>}
                        </div>
                        {names.length > 0 && <p className="text-xs text-white/45">남은 사람 {remainingToPick}명{pickedHistory.length ? ` · 지금까지: ${pickedHistory.join(', ')}` : ''}</p>}
                    </div>
                )}

                {tab === 'groups' && (
                    <div className="space-y-4">
                        {rosterBox}
                        <div className="flex flex-wrap items-center gap-3">
                            <select className="input-field w-44 py-1.5!" aria-label="나누는 기준" value={groupMode} onChange={event => setGroupMode(event.target.value as 'count' | 'size')}>
                                <option value="count" className="bg-slate-900">조 수로 나누기</option>
                                <option value="size" className="bg-slate-900">한 조 인원으로 나누기</option>
                            </select>
                            <label className="text-sm text-white/70">
                                <span className="sr-only">{groupMode === 'count' ? '조 수' : '한 조 인원'}</span>
                                <input className="input-field inline-block w-20 py-1.5!" type="number" min={1} max={50} value={groupValue} onChange={event => setGroupValue(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
                                <span className="ml-2">{groupMode === 'count' ? '개 조' : '명씩'}</span>
                            </label>
                            <button type="button" onClick={buildGroups} disabled={!names.length} className="btn-primary inline-flex items-center gap-2 px-5! py-2.5! disabled:opacity-50"><Users className="h-4 w-4" /> {groups.length ? '다시 섞기' : '조 편성'}</button>
                            {groups.length > 0 && <CopyButton text={formatGroups(groups)} label="결과 복사" />}
                        </div>
                        {groups.length > 0 ? (
                            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="program-groups">
                                {groups.map((group, index) => (
                                    <li key={index} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                        <p className="mb-2 text-sm font-bold text-violet-200">{index + 1}조 <span className="font-normal text-white/40">({group.length}명)</span></p>
                                        <p className="text-sm leading-relaxed text-white/85 break-keep">{group.join(', ')}</p>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="text-sm text-white/40">{names.length ? '무작위로 섞어 인원이 고르게(1명 넘게 차이 나지 않게) 나눕니다.' : '먼저 명단을 넣어 주세요.'}</p>
                        )}
                    </div>
                )}
            </div>

            {expanded && (
                <div role="dialog" aria-modal="true" aria-label="타이머 크게 보기" className="fixed inset-0 z-110 flex items-center justify-center bg-slate-950 p-6">
                    <div className="w-full">{timerFace(true)}</div>
                </div>
            )}
        </ToolPageShell>
    );
}

export default ProgramKitView;
