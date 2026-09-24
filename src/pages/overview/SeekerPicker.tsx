import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Seeker } from '../../types/matching';

interface Props {
    seekers: Seeker[];
    ready: boolean;
    selectedId: string;
    selectedFound: boolean;
    onSelect: (seekerId: string) => void;
}

/** 현황판 이용자 찾기·선택. 빈 값을 고르면 전체 일정판으로 돌아갑니다. */
export function SeekerPicker({ seekers, ready, selectedId, selectedFound, onSelect }: Props) {
    const [search, setSearch] = useState('');
    const keyword = search.trim().toLocaleLowerCase();
    const matching = seekers.filter(seeker => seeker.id && (seeker.id === selectedId
        || `${seeker.name} ${seeker.seekerId || ''}`.toLocaleLowerCase().includes(keyword)));
    const select = (id: string) => { setSearch(''); onSelect(id); };

    return <div className="glass-card !p-5">
        <div className="grid gap-3 sm:grid-cols-2">
            <div>
                <label htmlFor="workflow-seeker-search" className="block text-sm font-semibold text-white/80 mb-1">이용자 찾기</label>
                <input id="workflow-seeker-search" className="input-field" value={search} onChange={event => setSearch(event.target.value)} placeholder="이름 또는 이용자 ID로 검색" />
            </div>
            <div>
                <label htmlFor="workflow-seeker" className="block text-sm font-semibold text-white/80 mb-1">이용자 선택</label>
                <select id="workflow-seeker" className="input-field" value={selectedId} onChange={event => select(event.target.value)}>
                    <option value="">전체 일정 보기(이용자 선택 안 함)</option>
                    {matching.map(seeker => <option key={seeker.id} value={seeker.id}>{seeker.name} · {seeker.seekerId || 'ID 없음'}</option>)}
                </select>
            </div>
        </div>
        {search && matching.length === 0 && <p className="text-sm text-white/50 mt-2">검색 결과가 없습니다.</p>}
        {ready && seekers.length === 0 && <p className="text-sm text-white/60 mt-3">등록된 이용자가 없습니다. <Link to="/manage" className="text-accent-300 underline">이용자 관리로 이동</Link></p>}
        {ready && selectedId && !selectedFound && <p className="text-sm text-amber-300 mt-3">선택한 이용자를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.</p>}
    </div>;
}
