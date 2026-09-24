import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

/**
 * 모든 일반 페이지의 공통 틀. 루트 레이아웃의 "본문으로 바로가기"(#main-content)가
 * 모든 페이지에서 동작하도록 main 요소를 여기서 한 번만 선언한다.
 * route group `(site)`는 URL에 영향을 주지 않는다. (404 화면은 app/not-found.tsx가 따로 그린다.)
 */
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}
