import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { safeErrorMetadata } from './utils/safeError'
// 오프라인에서도 같은 글꼴이 보이도록 Noto Sans KR(가변 굵기 100~900)을 앱에 포함한다.
// CSS @import가 아니라 JS import로 넣는다: Tailwind 4의 @import 처리는 글꼴 파일 상대 경로(./files/*.woff2)를
// 번들 자산으로 바꾸지 못해 배포본에서 글꼴이 빠졌다. Vite가 JS import한 CSS의 url()은 자산으로 묶는다.
import '@fontsource-variable/noto-sans-kr'
import './index.css'

// 글로벌 에러 핸들링
window.onerror = (_message, _source, _lineno, _colno, error) => {
    console.error('Global Error Detected:', safeErrorMetadata(error, 'global-error'));
};

window.onunhandledrejection = (event) => {
    console.error('Unhandled Promise Rejection:', safeErrorMetadata(event.reason, 'unhandled-rejection'));
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
