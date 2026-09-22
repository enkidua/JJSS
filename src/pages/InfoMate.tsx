import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Globe, BookOpen, Youtube, Pen, Plus, Edit3, Trash2, X,
    ExternalLink, Search, Sparkles, Loader2
} from 'lucide-react';
import * as localDB from '../config/localDB';
import { useAuthStore } from '../store/authStore';
import { safeErrorMetadata } from '../utils/safeError';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface Resource {
    id: string;
    title: string;
    link: string;
    memo: string;
    category: string;
    organization: string;
    authorUid: string;
    createdAt: { seconds: number } | null;
}

const categories = [
    { id: 'homepage', label: '기관 홈페이지', icon: Globe, color: 'from-blue-500 to-cyan-600' },
    { id: 'book', label: '서적', icon: BookOpen, color: 'from-emerald-500 to-teal-600' },
    { id: 'youtube', label: '유튜브', icon: Youtube, color: 'from-red-500 to-rose-600' },
    { id: 'blog', label: '블로그', icon: Pen, color: 'from-amber-500 to-orange-600' },
];

function getAllowedResourceUrl(value: string): string | null {
    if (!value.trim()) return null;
    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch {
        return null;
    }
}

export default function InfoMate() {
    const { profile } = useAuthStore();
    const currentProfile = profile || { uid: 'local-user', organization: 'local' };
    const [activeCategory, setActiveCategory] = useState('homepage');
    const [resources, setResources] = useState<Resource[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formLink, setFormLink] = useState('');
    const [formMemo, setFormMemo] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const saveInFlightRef = useRef(false);
    const fetchRequestRef = useRef(0);

    const fetchResources = async () => {
        const requestId = ++fetchRequestRef.current;
        setLoading(true);
        setError('');
        try {
            const allItems = await localDB.query<Resource>(
                'resources',
                (item) => item.category === activeCategory,
            );
            // 최신순 정렬
            allItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            if (requestId === fetchRequestRef.current) setResources(allItems);
        } catch (err: unknown) {
            console.error('Resources fetch error:', safeErrorMetadata(err, 'resource-fetch'));
            if (requestId === fetchRequestRef.current) setError('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            if (requestId === fetchRequestRef.current) setLoading(false);
        }
    };


    useEffect(() => {
        fetchResources();
        return () => { fetchRequestRef.current += 1; };
    }, [profile?.uid, activeCategory]);

    const openCreateModal = () => {
        setEditingResource(null);
        setFormTitle('');
        setFormLink('');
        setFormMemo('');
        setModalOpen(true);
    };

    const openEditModal = (res: Resource) => {
        setEditingResource(res);
        setFormTitle(res.title);
        setFormLink(res.link);
        setFormMemo(res.memo);
        setModalOpen(true);
    };

    const isFormDirty = () => editingResource
        ? formTitle !== editingResource.title || formLink !== editingResource.link || formMemo !== editingResource.memo
        : Boolean(formTitle.trim() || formLink.trim() || formMemo.trim());

    const closeModal = (force = false) => {
        if (!force && saveInFlightRef.current) return;
        if (!force && isFormDirty() && !window.confirm('작성 중인 내용이 있습니다. 저장하지 않고 닫으시겠습니까?')) return;
        setModalOpen(false);
    };
    const dialogRef = useDialogFocus(modalOpen, () => closeModal());

    const handleSave = async () => {
        if (saveInFlightRef.current) return;
        if (!formTitle.trim()) { alert('자료 제목을 입력해 주세요.'); return; }
        const safeLink = formLink.trim() ? getAllowedResourceUrl(formLink) : '';
        if (formLink.trim() && !safeLink) {
            alert('링크는 http:// 또는 https:// 주소만 입력할 수 있습니다.');
            return;
        }
        const data: Omit<Resource, 'id'> = {
            title: formTitle,
            link: safeLink || '',
            memo: formMemo,
            category: activeCategory,
            organization: currentProfile.organization,
            authorUid: currentProfile.uid,
            createdAt: localDB.localTimestamp(),
        };

        saveInFlightRef.current = true;
        setSaving(true);
        try {
            if (editingResource) {
                await localDB.updateDoc<Resource>('resources', editingResource.id, data as Partial<Resource>);
            } else {
                await localDB.addDoc<Resource>('resources', data as Resource);
            }
            closeModal(true);
            fetchResources();
        } catch (err: unknown) {
            console.error('Resource save error:', safeErrorMetadata(err, 'resource-save'));
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            saveInFlightRef.current = false;
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            try {
                await localDB.deleteDoc('resources', id);
                await fetchResources();
            } catch { setError('자료를 삭제하지 못했습니다. 다시 시도해 주세요.'); }
        }
    };

    const filtered = resources.filter(
        (r) => String(r.title || '').toLowerCase().includes(searchTerm.trim().toLowerCase()) || String(r.memo || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
    );

    const activeCat = categories.find((c) => c.id === activeCategory)!;
    const ActiveCategoryIcon = activeCat.icon;

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                        <Sparkles className="w-4 h-4 text-primary-400" />
                        <span className="text-sm text-primary-300 font-medium">리소스 아카이브</span>
                    </div>
                    <h1 className="section-title mb-3">자료수집</h1>
                    <p className="text-white/50 text-lg">취업 및 직업재활 관련 홈페이지, 서적, 영상, 블로그 자료를 모아 관리하세요</p>
                </motion.div>

                {/* Categories */}
                <div role="group" aria-label="자료 유형" className="flex flex-wrap justify-center gap-3 mb-8">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = activeCategory === cat.id;
                        return (
                            <button
                                type="button"
                                aria-pressed={isActive}
                                key={cat.id}
                                onClick={() => { setActiveCategory(cat.id); }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-white/10 text-white border border-white/20'
                                    : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Search + Add */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            aria-label="자료 검색"
                            type="text"
                            placeholder="검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input-field !pl-10"
                        />
                    </div>
                    <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                        <Plus className="w-4 h-4" />
                        새 리소스 추가
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div role="alert" className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        {error}
                    </div>
                )}

                {/* Resource List */}
                {loading ? (
                    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-20 text-white/60">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                        <span>자료를 불러오는 중입니다.</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20">
                        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${activeCat.color} flex items-center justify-center mx-auto mb-4 opacity-30`}>
                            <ActiveCategoryIcon className="w-8 h-8 text-white" />
                        </div>
                        <p className="text-white/70 text-lg mb-2">{searchTerm.trim() ? `“${searchTerm.trim()}”에 맞는 자료가 없습니다` : '등록된 리소스가 없습니다'}</p>
                        <p className="text-white/55 text-sm">{searchTerm.trim() ? '검색어를 바꾸거나 검색을 초기화해 보세요.' : '위 버튼을 눌러 새 리소스를 추가해 보세요.'}</p>
                        {searchTerm.trim() && <button type="button" onClick={() => setSearchTerm('')} className="btn-secondary mt-4 !px-4 !py-2 text-sm">검색 초기화</button>}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filtered.map((res) => (
                            <motion.div
                                key={res.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card group"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-white truncate">{res.title}</h3>
                                        {getAllowedResourceUrl(res.link) && (
                                            <a
                                                href={getAllowedResourceUrl(res.link) || undefined}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 mt-1 truncate max-w-full"
                                            >
                                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">{res.link}</span>
                                            </a>
                                        )}
                                        {res.memo && <p className="text-white/50 text-sm mt-2 line-clamp-2">{res.memo}</p>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button type="button" aria-label={`${res.title} 수정`} onClick={() => openEditModal(res)} className="btn-ghost !p-2">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button type="button" aria-label={`${res.title} 삭제`} onClick={() => handleDelete(res.id)} className="btn-ghost !p-2 hover:!text-red-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {modalOpen && (
                    <div className="modal-overlay" onClick={() => closeModal()}>
                        <motion.div
                            ref={dialogRef}
                            tabIndex={-1}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="resource-modal-title"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 glass-strong rounded-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 pb-4 flex items-center justify-between border-b border-white/10">
                                <h2 id="resource-modal-title" className="text-xl font-bold text-white">
                                    {editingResource ? '리소스 수정' : '새 리소스 추가'}
                                </h2>
                                <button type="button" aria-label="자료 편집 창 닫기" onClick={() => closeModal()} className="btn-ghost !p-2">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label htmlFor="resource-title" className="block text-sm font-medium text-white/70 mb-1.5">제목</label>
                                    <input
                                        id="resource-title"
                                        disabled={saving}
                                        type="text"
                                        placeholder="리소스 제목"
                                        value={formTitle}
                                        onChange={(e) => setFormTitle(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="resource-link" className="block text-sm font-medium text-white/70 mb-1.5">링크</label>
                                    <input
                                        id="resource-link"
                                        disabled={saving}
                                        type="url"
                                        placeholder="https://..."
                                        value={formLink}
                                        onChange={(e) => setFormLink(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="resource-memo" className="block text-sm font-medium text-white/70 mb-1.5">메모</label>
                                    <textarea
                                        id="resource-memo"
                                        disabled={saving}
                                        rows={3}
                                        placeholder="메모를 입력하세요"
                                        value={formMemo}
                                        onChange={(e) => setFormMemo(e.target.value)}
                                        className="textarea-field"
                                    />
                                </div>
                                <button type="button" disabled={saving} onClick={handleSave} className="btn-primary w-full !py-3 disabled:opacity-50">
                                    {saving ? '저장 중…' : editingResource ? '수정 완료' : '추가하기'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
