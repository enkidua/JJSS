import type { Metadata } from 'next';
import { Breadcrumbs, InstallerSecurityNotice, JsonLd, PageHero } from '@/components/SiteParts';
import { formatDateLabel, JJSS } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';
import { softwareSchema } from '@/src/lib/schema';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS 3.0 다운로드 | Windows용 직업재활 프로그램',
  description: 'JJSS v3.0.0 Windows x64 공식 설치 파일을 내려받으세요. 파일명, 버전, SHA-256, 설치 전 백업과 API Key 안내를 함께 확인할 수 있습니다.',
  path: '/download',
});

export default function DownloadPage() {
  return (
    <>
      <JsonLd data={softwareSchema()} />
      <PageHero eyebrow="DOWNLOAD" title={<>JJSS v3.0.0<br /><span className="gradient-text">for Windows</span></>} description="현재 공식 GitHub Release에서 제공하는 Windows x64 설치 파일입니다. GitHub가 익숙하지 않아도 아래 버튼으로 바로 내려받을 수 있습니다.">
        <a className="button button-primary" href={JJSS.downloadUrl}>Windows용 다운로드 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href={JJSS.releaseUrl} target="_blank" rel="noreferrer">GitHub Release <span aria-hidden="true">↗</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '다운로드', href: '/download' }]} /></div>

      <section className="section download-section">
        <div className="container download-grid">
          <div className="download-main-card reveal">
            <div className="download-card-top"><span className="windows-mark">▦</span><div><span>CURRENT RELEASE</span><h2>JJSS {JJSS.version}</h2><p>{JJSS.operatingSystem} · {JJSS.installerSize}</p></div><i>최신</i></div>
            <div className="download-file-row"><div><small>설치 파일</small><strong>{JJSS.installerName}</strong></div><div><small>릴리스 날짜</small><strong><time dateTime={JJSS.releaseDate}>{formatDateLabel(JJSS.releaseDate)}</time></strong></div><div><small>Release tag</small><strong>{JJSS.tag}</strong></div></div>
            <a className="button button-primary button-full" href={JJSS.downloadUrl}>JJSS {JJSS.version} 다운로드 <span aria-hidden="true">↓</span></a>
            <p className="download-source"><span aria-hidden="true">✓</span> 공식 GitHub Release 자산으로 연결됩니다.</p>
          </div>

          <aside className="download-aside reveal">
            <article><span className="card-icon">◇</span><h3>AI 기능 사용 시</h3><p>Gemini, OpenAI, Claude 중 사용하려는 AI 서비스의 개인 API Key가 필요합니다. 비AI 기능은 Key 없이 시작할 수 있습니다.</p><a href="/guide/api">API Key 가이드 →</a></article>
            <article><span className="card-icon">↻</span><h3>업데이트·재설치 전</h3><p>설정에서 JSON 백업 파일을 만들고 JJSS 설치 폴더와 다른 안전한 위치에 보관하세요.</p><a href="/guide#backup">백업 안내 →</a></article>
          </aside>
        </div>
      </section>

      <section className="section install-info-section">
        <div className="container">
          <div className="install-info-grid">
            <article className="reveal"><span>01</span><h3>다운로드</h3><p>공식 Release의 <strong>{JJSS.installerName}</strong>을 내려받습니다.</p></article>
            <article className="reveal"><span>02</span><h3>출처 확인</h3><p>주소가 <strong>github.com/enkidua/JJSS</strong>인지 확인합니다.</p></article>
            <article className="reveal"><span>03</span><h3>Windows 설치</h3><p>기관의 보안 정책에 따라 설치 화면의 안내를 따릅니다.</p></article>
            <article className="reveal"><span>04</span><h3>첫 설정</h3><p>필요하면 AI Key를 등록하거나 비AI 기능부터 시작합니다.</p></article>
          </div>
          <InstallerSecurityNotice variant="section" />
          <details className="hash-details reveal"><summary>SHA-256 파일 확인값 <span>＋</span></summary><code>{JJSS.installerSha256}</code><p>GitHub Release 자산에 표시된 공식 digest입니다. 설치 파일의 해시를 별도로 확인할 때 사용하세요.</p></details>
        </div>
      </section>

      <section className="section github-role-section">
        <div className="container role-grid reveal">
          <article><span className="section-kicker">OFFICIAL WEBSITE</span><h2>이 홈페이지에서는</h2><ul><li>처음 보는 사용자를 위한 제품 설명</li><li>API Key·비용·개인정보 가이드</li><li>빠른 시작과 자주 묻는 질문</li><li>Windows 설치 파일 바로가기</li></ul></article>
          <article><span className="section-kicker">GITHUB</span><h2>GitHub에서는</h2><ul><li>공식 Release와 설치 파일</li><li>전체 변경사항과 개발 정보</li><li>오류·기능 제안 Issues</li><li>파일 digest와 자산 정보</li></ul></article>
        </div>
        <div className="container issue-cta reveal"><div><span className="card-icon">?</span><div><h2>오류나 기능 제안이 있나요?</h2><p>GitHub 계정이 있다면 Issues에 상황과 재현 방법을 남길 수 있습니다. API Key, 이용자 개인정보와 기관 내부 문서는 첨부하지 마세요.</p></div></div><a className="button button-secondary" href={JJSS.issuesUrl} target="_blank" rel="noreferrer">GitHub Issues <span aria-hidden="true">↗</span></a></div>
      </section>

      <section className="section download-final-section">
        <div className="container download-final reveal"><span className="eyebrow">JJSS 3.0 · WINDOWS</span><h2>직업재활 업무를<br /><span className="gradient-text">하나의 시스템에서.</span></h2><p>다운로드 후 빠른 시작 가이드에서 설치와 첫 설정을 이어서 확인하세요.</p><div><a className="button button-primary" href={JJSS.downloadUrl}>Windows용 다운로드 ↓</a><a className="button button-secondary" href="/guide/start">빠른 시작 →</a></div></div>
      </section>
    </>
  );
}
