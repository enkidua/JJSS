import Link from 'next/link';
import type { ReactNode } from 'react';
import { absoluteUrl, JJSS } from '@/src/config/jjss';

export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export type BreadcrumbItem = { label: string; href: string };

/**
 * 화면용 이동 경로와 BreadcrumbList 구조화 데이터를 같은 항목으로 만든다.
 * 마지막 항목은 현재 페이지(링크 없이 표시)이며, href는 구조화 데이터의 URL로 쓰인다.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ label: '홈', href: '/' }, ...items].map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  };

  return (
    <>
      <JsonLd data={schema} />
      <nav className="breadcrumbs" aria-label="현재 위치">
        <Link href="/">홈</Link><span aria-hidden="true">/</span>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <span key={item.href} className="breadcrumb-item">
              {isCurrent ? <strong aria-current="page">{item.label}</strong> : <a href={item.href}>{item.label}</a>}
              {!isCurrent && <i aria-hidden="true">/</i>}
            </span>
          );
        })}
      </nav>
    </>
  );
}

const INSTALLER_SECURITY_TEXT = `현재 공식 ${JJSS.tag} 설치 파일은 디지털 서명되지 않아 SmartScreen 안내가 표시될 수 있습니다. 반드시 공식 GitHub Release에서 받은 파일인지 확인하고, 확신이 없으면 진행을 멈춘 뒤 기관 전산·보안 담당자에게 문의하세요.`;

/** 서명되지 않은 설치 파일(SmartScreen) 안내. 다운로드 페이지는 section, 가이드는 callout 형태로 쓴다. */
export function InstallerSecurityNotice({ variant }: { variant: 'section' | 'callout' }) {
  if (variant === 'callout') {
    return (
      <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>Windows 보안 경고가 보이면 출처를 먼저 확인하세요.</strong><p>{INSTALLER_SECURITY_TEXT}</p></div></div>
    );
  }
  return (
    <div className="security-notice reveal"><span aria-hidden="true">!</span><div><h2>Windows 보안 안내</h2><p>{INSTALLER_SECURITY_TEXT}</p></div></div>
  );
}

export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: ReactNode; description: string; children?: ReactNode }) {
  return (
    <section className="page-hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="page-hero-orb" aria-hidden="true" />
      <div className="container page-hero-inner">
        <span className="section-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children && <div className="page-hero-actions">{children}</div>}
      </div>
    </section>
  );
}

export function SectionHeading({ kicker, title, description, align = 'left' }: { kicker?: string; title: ReactNode; description?: string; align?: 'left' | 'center' }) {
  return (
    <div className={`section-heading${align === 'center' ? ' align-center' : ''}`}>
      {kicker && <span className="section-kicker">{kicker}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function CtaBand({ title = '직업재활 업무를 한곳에서 시작하세요.', description = '현재 공식 JJSS 3.0은 Windows x64 설치 파일로 제공됩니다.' }: { title?: string; description?: string }) {
  return (
    <section className="cta-band reveal">
      <div className="cta-glow" aria-hidden="true" />
      <div>
        <span className="section-kicker">JJSS 3.0</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="cta-actions">
        <a className="button button-primary" href="/download">Windows용 다운로드 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href="/guide/start">시작 가이드 <span aria-hidden="true">→</span></a>
      </div>
    </section>
  );
}

const guideLinks = [
  { href: '/guide/start', label: '시작하기' },
  { href: '/guide/start#install', label: 'Windows 설치' }, // guide/start STEP 02의 anchor
  { href: '/guide/api', label: 'API Key란?' },
  { href: '/guide/api/gemini', label: 'Gemini 설정' },
  { href: '/guide/api/openai', label: 'OpenAI 설정' },
  { href: '/guide/api/claude', label: 'Claude 설정' },
  { href: '/guide/start#first-client', label: '첫 이용자 등록' }, // guide/start STEP 05의 anchor
  { href: '/guide#consultation', label: '상담일지' },
  { href: '/guide#rehab-plan', label: '직업재활계획서' },
  { href: '/guide#file-save', label: '파일 저장' },
  { href: '/guide#backup', label: '백업' },
  { href: '/faq', label: 'FAQ' },
];

function GuideLinkList() {
  return <>{guideLinks.map((link) => <a key={link.href} href={link.href}>{link.label}<span aria-hidden="true">→</span></a>)}</>;
}

export function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container guide-layout">
      <aside className="guide-sidebar" aria-label="사용가이드 목차">
        <strong>사용가이드</strong>
        <nav><GuideLinkList /></nav>
        <a className="guide-download" href="/download"><small>{JJSS.versionLabel}</small>다운로드 <span aria-hidden="true">↓</span></a>
      </aside>
      <details className="guide-mobile-nav">
        <summary>사용가이드 목차 <span aria-hidden="true">＋</span></summary>
        <nav><GuideLinkList /></nav>
      </details>
      <article className="guide-content">{children}</article>
    </div>
  );
}
