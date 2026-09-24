import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { lazyPage, preloadAllPagesWhenIdle } from './pagePreload';
import { createHashRouter, RouterProvider, Link } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import RouteErrorFallback from './components/RouteErrorFallback';
import { ConfirmProvider } from './components/common/ConfirmProvider';
import { GlobalToastProvider } from './components/Toast';

// 첫 화면(Home)만 바로 불러오고, 나머지 화면은 메뉴를 열 때 불러옵니다.
// 앱 실행 직후 유휴 시간에 모두 미리 받아 두므로, 평소에는 로딩 문구가 보이지 않습니다(pagePreload.ts).
const UserManagement = lazyPage('/manage', () => import('./pages/UserManagement'));
const RehabWorkflow = lazyPage('/overview', () => import('./pages/RehabWorkflow'));
const VocationalEvaluation = lazyPage('/evaluation', () => import('./pages/VocationalEvaluation'));
const WorkTraining = lazyPage('/training', () => import('./pages/WorkTraining'));
const WorkMate = lazyPage('/workmate', () => import('./pages/WorkMate'));
const BudgetManagement = lazyPage('/budget', () => import('./pages/BudgetManagement'));
const AITools = lazyPage('/tools', () => import('./pages/AITools'));
const InfoMate = lazyPage('/infomate', () => import('./pages/InfoMate'));
const Settings = lazyPage('/settings', () => import('./pages/Settings'));

/** 200ms 안에 화면이 오면 아무것도 그리지 않고, 그보다 오래 걸릴 때만 본문 크기의 스켈레톤을 보여 줍니다. */
function DelayedSkeleton() {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 200);
        return () => window.clearTimeout(timer);
    }, []);
    if (!visible) return <div aria-hidden="true" className="min-h-[60vh]" />;
    return (
        <div role="status" aria-label="화면을 불러오는 중입니다" className="mx-auto max-w-7xl px-6 py-8 min-h-[60vh] animate-pulse">
            <div className="h-8 w-56 rounded-lg bg-white/10" />
            <div className="mt-3 h-4 w-80 rounded bg-white/5" />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="h-36 rounded-2xl bg-white/5" />
                <div className="h-36 rounded-2xl bg-white/5" />
                <div className="h-36 rounded-2xl bg-white/5" />
            </div>
        </div>
    );
}

function PageLoader({ children }: { children: ReactNode }) {
    return <Suspense fallback={<DelayedSkeleton />}>{children}</Suspense>;
}

function NotFound() {
    return (
        <div className="mx-auto max-w-xl px-6 py-20 text-center">
            <h1 className="section-title mb-4">페이지를 찾을 수 없습니다</h1>
            <p className="mb-6 text-white/70">주소가 바뀌었거나 잘못된 주소입니다. 상단 메뉴에서 업무를 선택해 주세요.</p>
            <Link to="/" className="btn-primary inline-flex">홈으로 이동</Link>
        </div>
    );
}

// Data router(createHashRouter)를 써야 useBlocker 기반 "저장하지 않은 내용" 확인이 동작합니다.
const router = createHashRouter([
    {
        element: <Layout />,
        children: [
            {
                // 페이지 단위 오류 경계: 한 화면이 실패해도 Layout(메뉴)은 유지됩니다.
                errorElement: <RouteErrorFallback />,
                children: [
                    { path: '/', element: <Home /> },
                    { path: '/manage', element: <PageLoader><UserManagement /></PageLoader> },
                    { path: '/overview', element: <PageLoader><RehabWorkflow /></PageLoader> },
                    { path: '/evaluation', element: <PageLoader><VocationalEvaluation /></PageLoader> },
                    { path: '/training', element: <PageLoader><WorkTraining /></PageLoader> },
                    { path: '/workmate', element: <PageLoader><WorkMate /></PageLoader> },
                    { path: '/budget', element: <PageLoader><BudgetManagement /></PageLoader> },
                    { path: '/tools', element: <PageLoader><AITools /></PageLoader> },
                    { path: '/infomate', element: <PageLoader><InfoMate /></PageLoader> },
                    { path: '/settings', element: <PageLoader><Settings /></PageLoader> },
                    { path: '*', element: <NotFound /> },
                ],
            },
        ],
    },
]);

export default function App() {
    useEffect(() => { preloadAllPagesWhenIdle(); }, []);
    return (
        <GlobalToastProvider>
            <ConfirmProvider>
                <RouterProvider router={router} future={{ v7_startTransition: true }} />
            </ConfirmProvider>
        </GlobalToastProvider>
    );
}
