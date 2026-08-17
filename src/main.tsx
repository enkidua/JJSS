import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { safeErrorMetadata } from './utils/safeError'
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
