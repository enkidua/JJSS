import type { Metadata, Viewport } from 'next';
import { absoluteUrl, SITE } from '@/src/config/jjss';
import './globals.css';

const verificationOther = SITE.naverVerification
  ? { 'naver-site-verification': SITE.naverVerification }
  : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  applicationName: 'JJSS',
  authors: [{ name: 'JJSS' }],
  creator: 'JJSS',
  category: '직업재활 업무지원 소프트웨어',
  alternates: { canonical: absoluteUrl('/') },
  // 아이콘은 파일 규칙(app/icon.png, app/apple-icon.png)이 자동으로 선언한다. metadata.icons를 쓰면 파일 규칙이 무시된다.
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'JJSS',
    title: SITE.title,
    description: SITE.description,
    url: absoluteUrl('/'),
    images: [{ url: absoluteUrl('/og.png'), width: 1200, height: 630, alt: 'JJSS 직업재활 실무를 위한 AI 업무지원 시스템' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
    images: [absoluteUrl('/og.png')],
  },
  verification: {
    google: SITE.googleVerification,
    other: verificationOther,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#080c18',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main-content">본문으로 바로가기</a>
        {children}
      </body>
    </html>
  );
}
