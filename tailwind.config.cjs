const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            // font-sans 클래스도 앱에 포함된 한글 글꼴을 먼저 쓰도록 body와 같은 순서로 맞춘다.
            fontFamily: {
                sans: ['"Noto Sans KR Variable"', '"Noto Sans KR"', '"Malgun Gothic"', '"Apple SD Gothic Neo"', 'Pretendard', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            colors: { primary: colors.violet, accent: colors.blue },
            backgroundImage: {
                'gradient-dark': 'linear-gradient(135deg, #0a0a1a 0%, #11162b 50%, #0a0a1a 100%)',
            },
            boxShadow: { glow: '0 0 24px rgba(124, 58, 237, 0.25)' },
        },
    },
    plugins: [],
};
