import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 앱이 직접 호출하는 외부 API만 허용한다(src/ 전체에서 확인한 주소).
//  - Gemini(@google/genai SDK 포함, 파일 업로드 /upload/v1beta/files 포함): generativelanguage.googleapis.com
//  - Google Cloud Vision OCR: vision.googleapis.com
//  - OpenAI: api.openai.com / Anthropic Claude: api.anthropic.com
// 새 외부 API를 추가하면 이 목록에도 추가해야 한다(개발 모드 `npm run dev`에는 적용되지 않음).
const CONNECT_SOURCES = [
    "'self'",
    'data:',
    'blob:',
    'https://generativelanguage.googleapis.com',
    'https://vision.googleapis.com',
    'https://api.openai.com',
    'https://api.anthropic.com',
];

const PRODUCTION_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    // framer-motion·React 인라인 style 속성
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src ${CONNECT_SOURCES.join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
].join('; ');

// 배포 빌드(dist/index.html)에만 CSP 메타 태그를 넣는다. 개발 서버(HMR)는 영향 없음.
function productionContentSecurityPolicy(): Plugin {
    return {
        name: 'jjss-production-csp',
        apply: 'build',
        transformIndexHtml() {
            return [{
                tag: 'meta',
                attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP },
                injectTo: 'head-prepend',
            }];
        },
    };
}

function vendorChunk(id: string): string | undefined {
    const normalized = id.replace(/\\/g, '/');
    if (!normalized.includes('/node_modules/')) return undefined;
    if (/\/node_modules\/(docx|jszip)\//.test(normalized)) return 'vendor-docx';
    if (normalized.includes('/node_modules/@google/genai/')) return 'vendor-genai';
    if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(normalized)) return 'vendor-motion';
    if (/\/node_modules\/(html2canvas|css-line-break|text-segmentation|base64-arraybuffer)\//.test(normalized)) return 'vendor-html2canvas';
    if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router)\//.test(normalized)) return 'vendor-react';
    return undefined;
}

export default defineConfig(({ mode }) => ({
    plugins: [react(), productionContentSecurityPolicy()],
    base: './',  // Electron file:// 프로토콜 지원
    server: {
        port: 5173,
        open: true,
    },
    build: {
        minify: 'esbuild',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: vendorChunk,
            },
        },
    },
    esbuild: {
        drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
}));
