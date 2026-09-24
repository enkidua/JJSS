import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Send, Paperclip, X, Loader2, FileText,
    User, Sparkles, Trash2, FileUp, MessageSquare
} from 'lucide-react';
import { generateText, ChatMessage } from '../services/gemini';
import { getAiDocumentValidationError, getFileFingerprint } from '../utils/fileValidation';
import { fileToBase64 } from '../utils/file';
import { CopyButton } from './common/CopyButton';
import { FileDropZone } from './common/FileDropZone';
import { useConfirm } from './common/ConfirmProvider';
import { ToolPageShell } from './tools/ToolPageShell';
import { useReportDirty } from './tools/useReportDirty';

interface DocumentChatViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

interface UploadedFile {
    name: string;
    mimeType: string;
    data: string;
    size: number;
    fingerprint: string;
}

interface Message extends ChatMessage {
    id: string;
    timestamp: Date;
}

const MAX_HISTORY_MESSAGES_FOR_API = 10;
const MAX_HISTORY_CHARS_FOR_API = 10_000;
const LARGE_DOCUMENT_BYTES = 5 * 1024 * 1024;

function buildLimitedApiHistory(messages: Message[]): ChatMessage[] {
    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES_FOR_API);
    const limited: ChatMessage[] = [];
    let usedChars = 0;

    for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
        const msg = recentMessages[i];
        const remaining = MAX_HISTORY_CHARS_FOR_API - usedChars;
        if (remaining <= 0) break;

        const content = msg.content.length > remaining
            ? msg.content.slice(msg.content.length - remaining)
            : msg.content;

        limited.unshift({ role: msg.role, content });
        usedChars += content.length;
    }

    return limited;
}

function formatSize(bytes: number) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function DocumentChatView({ onBack, onDirtyChange }: DocumentChatViewProps) {
    const confirm = useConfirm();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragDepth = useRef(0);

    // 이탈 확인은 부모 페이지(AITools)의 useUnsavedGuard가 담당합니다.
    useReportDirty(Boolean(messages.length || files.length || input.trim() || isLoading), onDirtyChange);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const addUploadedFiles = (selectedFiles: File[]) => {
        setError('');
        selectedFiles.forEach(file => {
            const validationError = getAiDocumentValidationError(file);
            if (validationError) {
                setError(`${file.name}: ${validationError}`);
                return;
            }

            const fingerprint = getFileFingerprint(file);
            void fileToBase64(file).then(base64 => {
                if (!base64) {
                    setError(`${file.name}: 파일을 읽지 못했습니다.`);
                    return;
                }
                setFiles(prev => prev.some(item => item.fingerprint === fingerprint) ? prev : [...prev, {
                    name: file.name,
                    mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
                    data: base64,
                    size: file.size,
                    fingerprint,
                }]);
            }, () => setError(`${file.name}: 파일을 읽지 못했습니다.`));
        });
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files || []);
        if (droppedFiles.length === 0) return;
        addUploadedFiles(droppedFiles);
    };

    const handleSend = async () => {
        if (isLoading) return;
        if (!input.trim()) {
            setError('문서에 대해 물어볼 질문을 입력해 주세요.');
            return;
        }
        if (files.length === 0 && messages.length === 0) {
            setError('먼저 문서를 업로드한 뒤 질문해 주세요. 문서 없이 일반 질문을 처리하는 도구는 아닙니다.');
            return;
        }

        const question = input;
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: question,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setError('');
        setIsLoading(true);

        try {
            // 화면의 전체 대화는 유지하되, API에는 최근 5턴 또는 10,000자 이내만 전송합니다.
            const history = buildLimitedApiHistory(messages);

            // 첨부 파일은 질문할 때마다 함께 다시 전송됩니다(화면에 안내).
            const fileData = files.map(f => ({ mimeType: f.mimeType, data: f.data }));

            const response = await generateText(
                'summary',
                question,
                fileData.length > 0 ? fileData : undefined,
                { history, featureKey: 'tools', documentType: 'document-chat' }
            );

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: response,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, aiMessage]);
        } catch (error: unknown) {
            const detail = error instanceof Error && error.message ? error.message : 'API 키, 모델 권한 또는 네트워크 상태를 확인해 주세요.';
            setError(`답변 생성에 실패했습니다. ${detail} 질문은 입력란에 유지됩니다. 확인 후 전송 버튼으로 다시 시도해 주세요.`);
            setInput(current => current || userMessage.content);
            setMessages(prev => prev.filter(message => message.id !== userMessage.id));
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = async () => {
        if (!(await confirm({
            title: '대화 지우기',
            message: '대화 내용과 첨부한 파일을 모두 지웁니다. 계속할까요?',
            confirmLabel: '지우기',
            tone: 'danger',
        }))) return;
        setMessages([]);
        setFiles([]);
    };

    const totalFileBytes = files.reduce((sum, file) => sum + file.size, 0);

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-5xl mx-auto flex flex-col h-[calc(100vh-180px)]"
            actions={(
                <>
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 tracking-widest uppercase">Beta</span>
                    <button
                        type="button"
                        onClick={() => void clearChat()}
                        disabled={isLoading || (!messages.length && !files.length)}
                        aria-label="대화 지우기"
                        title="대화 지우기"
                        className="p-2 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 disabled:opacity-30"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </>
            )}
        >
            <div className="flex-1 min-h-0 flex flex-col glass-strong rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden mb-4">
                {/* Chat Header */}
                <div className="px-8 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0 gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold leading-none">AI 문서 멀티 질의응답</h3>
                            <p className="text-[11px] text-white/40 mt-1 font-bold">업로드한 문서를 바탕으로 답합니다</p>
                        </div>
                    </div>
                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-end">
                            {files.map((f, i) => (
                                <div key={f.fingerprint} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/50 text-xs text-white font-bold shadow-md shadow-violet-900/20">
                                    <FileText className="w-3.5 h-3.5 text-violet-300" />
                                    <span className="max-w-[120px] truncate tracking-wide">{f.name}</span>
                                    <button type="button" aria-label={`${f.name} 첨부 빼기`} onClick={() => removeFile(i)} className="ml-1 hover:text-rose-400 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {error && (
                    <div role="alert" className="mx-6 mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        {error}
                    </div>
                )}
                <div className="mx-6 mt-4 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-xs leading-relaxed text-violet-100/80">
                    <strong className="text-violet-50">사용량 안내:</strong> 질문할 때마다 첨부한 파일 전체가 AI로 다시 전송됩니다. 파일이 크거나 많을수록 질문 한 번마다 사용량(비용)이 늘어나니, 필요한 파일만 남겨 두세요.
                    {files.length > 0 && <span className="block mt-1">현재 첨부: {files.length}개, 약 {formatSize(totalFileBytes)} (질문마다 함께 전송)</span>}
                    <span className="block mt-1 text-violet-100/60">대화 기록은 화면에 모두 남지만, AI에는 최근 5턴 또는 10,000자 이내의 대화만 함께 보냅니다. 문서 내용은 외부 AI 서비스(Gemini)로 전송됩니다.</span>
                    {files.some(file => file.size > LARGE_DOCUMENT_BYTES) && (
                        <span className="block mt-1 text-amber-100">큰 파일이 첨부되어 있습니다. 부담되면 필요한 페이지만 이미지/PDF로 나누어 질문해 주세요.</span>
                    )}
                </div>

                {/* Messages Area */}
                <div
                    ref={scrollRef}
                    onDragEnter={handleDragEnter}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth custom-scrollbar relative ${
                        isDragging ? 'bg-violet-500/10' : 'bg-black/5'
                    }`}
                >
                    {isDragging && (
                        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[#1e293b]/80 backdrop-blur-sm border-2 border-dashed border-violet-500 rounded-2xl m-4">
                            <div className="text-center">
                                <FileUp className="w-16 h-16 text-violet-400 mx-auto mb-4 animate-bounce" />
                                <p className="text-xl font-bold text-white">여기에 파일을 놓아주세요</p>
                            </div>
                        </div>
                    )}
                    {messages.length === 0 ? (
                        <FileDropZone
                            accept="image/*,.pdf"
                            multiple
                            onFiles={addUploadedFiles}
                            ariaLabel="질문할 문서 파일 선택"
                            className="h-full flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                            activeClassName="opacity-100"
                        >
                            <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mb-6 group-hover:border-violet-400/50 group-hover:bg-violet-500/10 transition-all">
                                <FileUp className="w-10 h-10 text-white/50 group-hover:text-violet-400 transition-colors" />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">문서를 업로드하고 대화를 시작하세요</h4>
                            <p className="text-sm max-w-sm mx-auto text-white/50">
                                이곳을 클릭하거나 파일을 끌어다 놓아주세요.<br/>
                                여러 개의 파일(이미지, PDF)을 지원하며,<br/>문서의 내용을 바탕으로 연속적인 질문이 가능합니다.
                            </p>
                        </FileDropZone>
                    ) : (
                        messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                                    msg.role === 'user'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                        : 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                }`}>
                                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                                </div>
                                <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-none'
                                            : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none font-sans'
                                    }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                        {msg.role === 'model' && (
                                            <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                                                <CopyButton
                                                    text={msg.content}
                                                    iconOnly
                                                    label="답변 복사"
                                                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/30 hover:text-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-white/20 mt-1 font-bold">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </motion.div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex gap-4">
                            <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center justify-center animate-pulse">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                                <span className="text-sm text-white/40 font-bold">생각 중...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-6 border-t border-white/10 bg-white/5">
                    <div className="flex items-end gap-3 glass-strong p-2 rounded-2xl border border-white/10 bg-black/40">
                        <FileDropZone
                            accept="image/*,.pdf"
                            multiple
                            onFiles={addUploadedFiles}
                            ariaLabel="문서 파일 첨부"
                            className="p-3 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                            activeClassName="bg-violet-500/20 text-white"
                        >
                            <Paperclip className="w-5 h-5" aria-hidden="true" />
                        </FileDropZone>
                        <textarea
                            aria-label="문서에 대한 질문"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                // 한글 조합 중 Enter는 글자 확정용이므로 전송하지 않습니다.
                                if (e.nativeEvent.isComposing || e.key === 'Process') return;
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleSend();
                                }
                            }}
                            placeholder="업로드한 문서에 대해 질문하세요... (Shift+Enter: 줄바꿈)"
                            className="flex-1 bg-transparent border-none focus:ring-0 text-white p-3 min-h-[48px] max-h-32 resize-none text-sm placeholder:text-white/20"
                            rows={1}
                        />
                        <button
                            type="button"
                            aria-label="질문 보내기"
                            onClick={() => void handleSend()}
                            disabled={isLoading || !input.trim()}
                            className={`p-3 rounded-xl transition-all shadow-lg ${
                                !input.trim()
                                    ? 'bg-white/5 text-white/10'
                                    : 'bg-violet-600 text-white hover:bg-violet-500 hover:scale-105 active:scale-95 shadow-violet-600/20'
                            }`}
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <p className="text-[11px] text-center text-white/30 font-bold mt-2 px-12 leading-relaxed">
                AI 답변은 틀릴 수 있습니다. 중요한 내용은 원문과 대조해 확인하고, 민감한 개인정보가 담긴 문서는 올리기 전에 한 번 더 살펴 주세요.
            </p>
        </ToolPageShell>
    );
}
