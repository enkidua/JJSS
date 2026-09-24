'use client';

import { useEffect, useState } from 'react';
import { Brand } from '@/components/Brand';
import { JJSS } from '@/src/config/jjss';

const links = [
  { href: '/#about', label: '소개' },
  { href: '/features', label: '기능' },
  { href: '/guide/api', label: 'AI 설정' },
  { href: '/guide', label: '사용방법' },
  { href: '/faq', label: 'FAQ' },
  { href: '/updates', label: '업데이트' },
];

export function Header() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`site-header${compact ? ' is-compact' : ''}`}>
      <nav className="nav-shell" aria-label="주요 메뉴">
        <Brand />

        <div className="nav-links" aria-label="사이트 메뉴">
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </div>

        <div className="nav-actions">
          <a className="text-link" href={JJSS.githubUrl} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
          <a className="button button-small" href="/download">다운로드</a>
          <button
            className="menu-button"
            type="button"
            aria-label={open ? '모바일 메뉴 닫기' : '모바일 메뉴 열기'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span /><span />
          </button>
        </div>

        <div className={`mobile-menu${open ? ' is-open' : ''}`} id="mobile-menu">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<span aria-hidden="true">→</span></a>
          ))}
          <a href={JJSS.githubUrl} target="_blank" rel="noreferrer">GitHub<span aria-hidden="true">↗</span></a>
        </div>
      </nav>
    </header>
  );
}
