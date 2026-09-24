import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="not-found-page">
        <div className="hero-grid" aria-hidden="true" />
        <div className="not-found-inner">
          <span>404</span>
          <h1>페이지를 찾을 수 없습니다.</h1>
          <p>주소가 바뀌었거나 존재하지 않는 페이지입니다. JJSS 홈이나 사용가이드에서 다시 시작해 주세요.</p>
          <div><Link className="button button-primary" href="/">홈으로 돌아가기</Link><a className="button button-secondary" href="/guide">사용가이드</a></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
