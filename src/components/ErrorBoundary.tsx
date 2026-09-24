import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { safeErrorMetadata } from '../utils/safeError';

interface Props {
    children: ReactNode;
}

/**
 * 앱 최상위 마지막 오류 경계.
 * 화면(라우트) 단위 오류는 RouteErrorFallback이 메뉴를 유지한 채 처리하므로,
 * 여기까지 오는 것은 라우터·공용 틀 자체가 실패한 경우뿐이다.
 */

interface State {
    hasError: boolean;
    errorName: string;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        errorName: ''
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorName: error?.name || 'Error' };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', {
            ...safeErrorMetadata(error, 'react-error-boundary'),
            componentStackAvailable: Boolean(errorInfo.componentStack),
        });
    }

    private handleReset = () => {
        window.location.reload();
    };

    private handleGoHome = () => {
        window.location.href = '#/';
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#05060f] flex items-center justify-center p-6 text-white font-sans">
                    <div className="max-w-xl w-full glass-strong rounded-[2.5rem] border border-red-500/20 p-12 text-center shadow-2xl relative overflow-hidden">
                        {/* Background Glow */}
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-red-600/10 blur-[100px] rounded-full" />
                        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full" />

                        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8 relative">
                            <AlertTriangle className="w-10 h-10 text-red-500" />
                            <div className="absolute inset-0 rounded-3xl border border-red-500/30 animate-ping opacity-20" />
                        </div>

                        <h1 className="text-3xl font-black mb-4 tracking-tight">시스템 오류가 발생했습니다</h1>
                        <p className="text-white/50 mb-8 leading-relaxed">
                            죄송합니다. 애플리케이션 실행 중 예기치 않은 오류가 발생하여 <br className="hidden sm:block" />
                            화면을 표시할 수 없습니다. 데이터를 보호하기 위해 앱을 다시 시작해 주세요.
                        </p>

                        <div className="bg-black/40 rounded-2xl p-4 mb-8 border border-white/5 text-left overflow-x-auto">
                            <p className="text-xs font-bold text-red-300/70 mb-2 whitespace-nowrap">오류 정보</p>
                            <code className="text-xs text-red-300 font-mono break-all line-clamp-3">
                                {this.state.errorName || 'Error'} — 자세한 오류 내용은 개인정보 보호를 위해 표시하지 않습니다.
                            </code>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="flex-1 btn-primary !bg-red-600 !hover:bg-red-500 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold shadow-xl shadow-red-900/20"
                            >
                                <RefreshCw className="w-5 h-5" /> 다시 불러오기
                            </button>
                            <button
                                type="button"
                                onClick={this.handleGoHome}
                                className="flex-1 btn-secondary flex items-center justify-center gap-2 py-4 rounded-2xl font-bold"
                            >
                                <Home className="w-5 h-5" /> 홈으로 이동
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
