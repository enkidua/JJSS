import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, MapPin, Search, UserCheck } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { getSeekerKey, isSameSeeker } from '../../utils/seeker';

interface CaseSeekerPickerProps {
    seekers: Seeker[];
    loading: boolean;
    selectedSeeker: Seeker | null;
    onSelect: (seeker: Seeker) => void;
}

/** 사례관리 문서 연속작성 — 왼쪽 이용자 선택 패널 */
export function CaseSeekerPicker({ seekers, loading, selectedSeeker, onSelect }: CaseSeekerPickerProps) {
    const [seekerSearch, setSeekerSearch] = useState('');
    const [showAllCaseSeekers, setShowAllCaseSeekers] = useState(false);

    const filteredSeekers = seekers.filter(s =>
        s.name?.includes(seekerSearch) || s.disabilityType?.includes(seekerSearch)
    );
    const displayCaseSeekers = (showAllCaseSeekers || seekerSearch) ? filteredSeekers : filteredSeekers.slice(0, 3);

    return (
        <div className="lg:col-span-3 glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-accent-400" />
                    이용자 선택
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10 tracking-widest">등록 {seekers.length}명</span>
            </div>

            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input className="input-field !pl-10 !py-3 text-sm border-white/5 focus:border-accent-500/50" placeholder="성함 또는 장애유형 검색"
                    aria-label="이용자 검색"
                    value={seekerSearch} onChange={e => setSeekerSearch(e.target.value)} />
            </div>

            <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
                ) : displayCaseSeekers.length === 0 ? (
                    <div className="text-center py-12 text-white/65 text-sm">
                        <p>{seekerSearch.trim() ? '검색 조건에 맞는 이용자가 없습니다.' : '등록된 이용자가 없습니다.'}</p>
                        {seekerSearch.trim() && <button type="button" onClick={() => setSeekerSearch('')} className="btn-secondary mt-3 !px-3 !py-2">검색 초기화</button>}
                    </div>
                ) : (
                    displayCaseSeekers.map((s, index) => {
                        const selected = isSameSeeker(selectedSeeker, s);
                        return (
                            <motion.div
                                key={getSeekerKey(s) || `seeker-${index}`}
                                role="button"
                                tabIndex={0}
                                aria-label={`${s.name} 선택`}
                                aria-pressed={selected}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(s); }
                                }}
                                whileHover={{ x: 4 }}
                                onClick={() => onSelect(s)}
                                className={`p-4 rounded-2xl border cursor-pointer transition-all ${selected
                                    ? 'bg-accent-500/20 border-accent-500 shadow-xl shadow-accent-500/10'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-white font-bold">{s.name}</span>
                                    {selected && <div className="w-2.5 h-2.5 rounded-full bg-accent-400 animate-pulse" />}
                                </div>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${s.status === '구직중' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'}`}>{s.status}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/50">{s.disabilityType}</span>
                                </div>
                                <div className="text-white/30 text-[11px] font-medium flex items-center gap-2">
                                    <MapPin className="w-3 h-3" /> {s.desiredLocation}
                                </div>
                            </motion.div>
                        );
                    })
                )}
                {seekers.length > 3 && !showAllCaseSeekers && !seekerSearch && (
                    <button
                        type="button"
                        onClick={() => setShowAllCaseSeekers(true)}
                        className="w-full py-3 text-xs text-accent-400 hover:text-white font-bold transition-colors border-t border-white/5 mt-2"
                    >
                        전체 이용자 보기
                    </button>
                )}
            </div>
        </div>
    );
}
