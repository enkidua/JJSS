const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: { primary: colors.violet, accent: colors.blue },
            backgroundImage: {
                'gradient-dark': 'linear-gradient(135deg, #0a0a1a 0%, #11162b 50%, #0a0a1a 100%)',
            },
            boxShadow: { glow: '0 0 24px rgba(124, 58, 237, 0.25)' },
        },
    },
    plugins: [],
};
