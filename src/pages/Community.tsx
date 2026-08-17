import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, Plus, ArrowLeft, Send, Trash2, Edit3, X,
    Clock, User, Sparkles, Loader2, ChevronRight
} from 'lucide-react';
import * as localDB from '../config/localDB';
import { useAuthStore } from '../store/authStore';
import { safeErrorMetadata } from '../utils/safeError';

interface Post {
    id: string;
    title: string;
    content: string;
    authorUid: string;
    authorName: string;
    organization: string;
    createdAt: { seconds: number } | null;
}

interface Comment {
    id: string;
    postId: string;
    content: string;
    authorUid: string;
    authorName: string;
    createdAt: { seconds: number } | null;
}

type View = 'list' | 'detail' | 'write';

export default function Community() {
    const { profile } = useAuthStore();
    const [view, setView] = useState<View>('list');
    const [posts, setPosts] = useState<Post[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [error, setError] = useState('');

    // Load posts
    const fetchPosts = async () => {
        setLoading(true);
        setError('');
        try {
            const items = await localDB.getAll<Post>('posts');
            items.sort((a, b) => {
                const ta = a.createdAt?.seconds || 0;
                const tb = b.createdAt?.seconds || 0;
                return tb - ta;
            });
            setPosts(items);
        } catch (err: any) {
            console.error('Posts fetch error:', safeErrorMetadata(err, 'community-post-fetch'));
            setError('게시글을 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // Load comments for selected post
    const fetchComments = async (postId: string) => {
        try {
            const items = await localDB.query<Comment>(
                'comments',
                (c) => c.postId === postId
            );
            items.sort((a, b) => {
                const ta = a.createdAt?.seconds || 0;
                const tb = b.createdAt?.seconds || 0;
                return ta - tb;
            });
            setComments(items);
        } catch (err) {
            console.error('Comments fetch error:', safeErrorMetadata(err, 'community-comment-fetch'));
        }
    };

    useEffect(() => {
        fetchPosts();
    }, [profile?.uid]);

    const handleCreatePost = async () => {
        if (!profile || !newTitle.trim() || !newContent.trim()) return;
        await localDB.addDoc<Post>('posts', {
            title: newTitle,
            content: newContent,
            authorUid: profile.uid,
            authorName: profile.displayName,
            organization: profile.organization,
            createdAt: localDB.localTimestamp(),
        } as Post);
        setNewTitle('');
        setNewContent('');
        setView('list');
        fetchPosts();
    };

    const handleUpdatePost = async () => {
        if (!editingPost) return;
        await localDB.updateDoc<Post>('posts', editingPost.id, {
            title: newTitle,
            content: newContent,
        } as Partial<Post>);
        setEditingPost(null);
        setNewTitle('');
        setNewContent('');
        setView('list');
        fetchPosts();
    };

    const handleDeletePost = async (postId: string) => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return;
        await localDB.deleteDoc('posts', postId);
        // 해당 게시글의 댓글도 삭제
        const relatedComments = await localDB.query<Comment>('comments', (c) => c.postId === postId);
        for (const c of relatedComments) {
            await localDB.deleteDoc('comments', c.id);
        }
        setView('list');
        setSelectedPost(null);
        fetchPosts();
    };

    const handleAddComment = async () => {
        if (!profile || !selectedPost || !newComment.trim()) return;
        await localDB.addDoc<Comment>('comments', {
            postId: selectedPost.id,
            content: newComment,
            authorUid: profile.uid,
            authorName: profile.displayName,
            createdAt: localDB.localTimestamp(),
        } as Comment);
        setNewComment('');
        fetchComments(selectedPost.id);
    };

    const handleDeleteComment = async (commentId: string) => {
        await localDB.deleteDoc('comments', commentId);
        if (selectedPost) fetchComments(selectedPost.id);
    };

    const openDetail = (post: Post) => {
        setSelectedPost(post);
        setView('detail');
        fetchComments(post.id);
    };

    const openWrite = () => {
        setEditingPost(null);
        setNewTitle('');
        setNewContent('');
        setView('write');
    };

    const openEdit = (post: Post) => {
        setEditingPost(post);
        setNewTitle(post.title);
        setNewContent(post.content);
        setView('write');
    };

    const formatDate = (ts: any) => {
        if (!ts || !ts.seconds) return '';
        const d = new Date(ts.seconds * 1000);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                        <Sparkles className="w-4 h-4 text-primary-400" />
                        <span className="text-sm text-primary-300 font-medium">커뮤니티</span>
                    </div>
                    <h1 className="section-title mb-3">소통 공간</h1>
                    <p className="text-white/50 text-lg">메모와 정보를 기록하고 체계적으로 관리하세요</p>
                </motion.div>

                {/* Error */}
                {error && (
                    <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                        {error}
                    </div>
                )}

                {/* List View */}
                {view === 'list' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="flex justify-end mb-6">
                            <button onClick={openWrite} className="btn-primary flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                글쓰기
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                            </div>
                        ) : posts.length === 0 ? (
                            <div className="text-center py-20">
                                <MessageSquare className="w-16 h-16 text-white/10 mx-auto mb-4" />
                                <p className="text-white/40 text-lg mb-2">아직 게시글이 없습니다</p>
                                <p className="text-white/25 text-sm">첫 번째 글을 작성해 보세요!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {posts.map((post) => (
                                    <motion.button
                                        key={post.id}
                                        layout
                                        onClick={() => openDetail(post)}
                                        className="glass-card w-full text-left group flex items-center justify-between"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-white truncate">{post.title}</h3>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="flex items-center gap-1 text-xs text-white/40">
                                                    <User className="w-3 h-3" />
                                                    {post.authorName}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-white/30">
                                                    <Clock className="w-3 h-3" />
                                                    {post.createdAt && formatDate(post.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                                    </motion.button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Detail View */}
                {view === 'detail' && selectedPost && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <button onClick={() => setView('list')} className="btn-ghost flex items-center gap-1.5 mb-6">
                            <ArrowLeft className="w-4 h-4" />
                            목록으로
                        </button>

                        <div className="glass-card mb-6">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <h2 className="text-2xl font-bold text-white">{selectedPost.title}</h2>
                                {selectedPost.authorUid === profile?.uid && (
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => openEdit(selectedPost)} className="btn-ghost !p-2">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDeletePost(selectedPost.id)} className="btn-ghost !p-2 hover:!text-red-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
                                <span className="flex items-center gap-1 text-sm text-white/50">
                                    <User className="w-3.5 h-3.5" />
                                    {selectedPost.authorName}
                                </span>
                                <span className="flex items-center gap-1 text-sm text-white/40">
                                    <Clock className="w-3.5 h-3.5" />
                                    {selectedPost.createdAt && formatDate(selectedPost.createdAt)}
                                </span>
                            </div>
                            <div className="text-white/80 leading-relaxed whitespace-pre-wrap">
                                {selectedPost.content}
                            </div>
                        </div>

                        {/* Comments */}
                        <div className="glass-card">
                            <h3 className="font-semibold text-white mb-4">댓글 ({comments.length})</h3>
                            <div className="space-y-3 mb-4">
                                {comments.map((comment) => (
                                    <div key={comment.id} className="p-3 rounded-xl bg-white/5 group">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white/70">{comment.authorName}</span>
                                                <span className="text-xs text-white/30">
                                                    {comment.createdAt && formatDate(comment.createdAt)}
                                                </span>
                                            </div>
                                            {comment.authorUid === profile?.uid && (
                                                <button
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                    className="btn-ghost !p-1 opacity-0 group-hover:opacity-100"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-white/60 text-sm">{comment.content}</p>
                                    </div>
                                ))}
                                {comments.length === 0 && (
                                    <p className="text-white/30 text-sm text-center py-4">아직 댓글이 없습니다.</p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="댓글을 입력하세요..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                    className="input-field flex-1"
                                />
                                <button
                                    onClick={handleAddComment}
                                    disabled={!newComment.trim()}
                                    className="btn-primary !px-4"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Write View */}
                {view === 'write' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <button onClick={() => setView('list')} className="btn-ghost flex items-center gap-1.5 mb-6">
                            <ArrowLeft className="w-4 h-4" />
                            목록으로
                        </button>

                        <div className="glass-card">
                            <h2 className="text-xl font-bold text-white mb-6">
                                {editingPost ? '글 수정' : '새 글 작성'}
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">제목</label>
                                    <input
                                        type="text"
                                        placeholder="제목을 입력하세요"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/70 mb-1.5">내용</label>
                                    <textarea
                                        rows={12}
                                        placeholder="내용을 입력하세요"
                                        value={newContent}
                                        onChange={(e) => setNewContent(e.target.value)}
                                        className="textarea-field"
                                    />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setView('list')} className="btn-secondary">
                                        취소
                                    </button>
                                    <button
                                        onClick={editingPost ? handleUpdatePost : handleCreatePost}
                                        disabled={!newTitle.trim() || !newContent.trim()}
                                        className="btn-primary"
                                    >
                                        {editingPost ? '수정 완료' : '게시하기'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
