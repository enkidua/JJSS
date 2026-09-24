import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JJSS 직업재활 업무지원 시스템',
    short_name: 'JJSS',
    description: '직업재활 실무를 위한 AI 업무지원 시스템',
    start_url: '/',
    display: 'standalone',
    background_color: '#080c18',
    theme_color: '#080c18',
    lang: 'ko-KR',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
