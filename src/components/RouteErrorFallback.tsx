import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { safeErrorMetadata } from '../utils/safeError';

/** 페이지 한 곳에서 오류가 나도 상단 메뉴는 유지되도록 라우트 단위로 표시하는 오류 화면. */
export default function RouteErrorFallback() {
    const error = useRouteError();
    const isChunkError = error instanceof Error && /dynamically imported module|Failed to fetch|Loading chunk/i.test(error.message);

    useEffect(() => {
        console.error('Route Error:', safeErrorMetadata(error, 'route-error'));
    }, [error]);

    return (
        <div className="mx-auto max-w-xl px-6 py-20 text-center" role="alert">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-400" aria-hidden="true" />
            <h1 className="section-title mb-3">이 화면을 표시하지 못했습니다</h1>
            <p className="mb-2 text-white/75">
                {isChunkError
                    ? '화면 파일을 불러오지 못했습니다. 프로그램을 다시 불러오면 대부분 해결됩니다.'
                    : '일시적인 오류가 발생했습니다. 저장된 데이터는 그대로 남아 있습니다.'}
            </p>
            <p className="mb-8 text-sm text-white/55">다른 메뉴는 상단에서 계속 사용할 수 있습니다.</p>
            <div className="flex flex-wrap justify-center gap-3">
                <Link to="/" className="btn-primary inline-flex">홈으로 이동</Link>
                <button type="button" onClick={() => window.location.reload()} className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-white/85 hover:bg-white/10">
                    다시 불러오기
                </button>
            </div>
        </div>
    );
}
