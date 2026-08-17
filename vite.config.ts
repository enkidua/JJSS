import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    base: './',  // Electron file:// 프로토콜 지원
    server: {
        port: 5173,
        open: true,
    },
    build: {
        minify: 'esbuild',
        sourcemap: false,
    },
    esbuild: {
        drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
}));
