import type { Metadata } from 'next';
import { Breadcrumbs, CtaBand, PageHero } from '@/components/SiteParts';
import { formatDateLabel, JJSS } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS 업데이트 | v3.0.0 릴리즈 노트',
  description: 'JJSS v3.0.0의 AI Provider, API 온보딩, 자동 전환, 비용 보호, 직업재활계획서 출력, 파일 저장, 예산·백업과 Windows 안정성 개선 내용을 확인하세요.',
  path: '/updates',
});

const updates = [
  { number: '01', icon: '✦', title: 'AI Provider 선택 확대', text: 'Google Gemini, OpenAI와 Anthropic Claude 중 필요한 서비스를 선택할 수 있도록 개선했습니다.', tags: ['Gemini', 'OpenAI', 'Claude'] },
  { number: '02', icon: '◇', title: '처음 실행 API 온보딩', text: 'API Key가 없을 때 설정 방법을 안내하고 필요한 서비스만 등록할 수 있습니다.', tags: ['Key 표시·숨김', '비AI 기능 계속 사용'] },
  { number: '03', icon: '↻', title: 'AI 자동 전환', text: '한 서비스가 일시적으로 사용할 수 없을 때 사용자가 허용한 다른 서비스를 시도할 수 있습니다. Provider 간 자동 전환은 기본 OFF입니다.', tags: ['기본 OFF', '사용자 동의'] },
  { number: '04', icon: '⌁', title: 'API 비용 보호', text: '자동 Retry 기본 0회, Provider 재방문 방지, 중복 요청 차단과 저장·출력 시 무호출 원칙을 적용했습니다.', tags: ['Retry 0회', '중복 방지', '최대 3 Provider'] },
  { number: '05', icon: '▤', title: '직업재활계획서', text: '기관 양식에 가까운 미리보기와 자동 매핑을 개선하고 PDF, PNG, Word(DOCX) 출력을 지원합니다.', tags: ['미리보기', 'PDF', 'PNG', 'DOCX'] },
  { number: '06', icon: '↓', title: '파일 저장 방식', text: '바탕화면, 다운로드, OneDrive와 다른 드라이브 등 원하는 위치를 선택하고 저장 폴더를 바로 열 수 있도록 개선했습니다.', tags: ['저장 위치 선택', '폴더 열기'] },
  { number: '07', icon: '▦', title: '예산·백업·안정성', text: '예산관리, 백업·복원, 개인정보 보호와 Windows 사용 안정성을 전반적으로 개선했습니다.', tags: ['예산관리', '백업·복원', 'Windows'] },
];

export default function UpdatesPage() {
  return (
    <>
      <PageHero eyebrow="RELEASE NOTES" title={<>JJSS v3.0.0<br /><span className="gradient-text">더 안정적인 실무를 위해.</span></>} description="AI 기능, 직업재활계획서 작성·출력, 파일 저장, 예산관리, 백업·복원, 개인정보 보호와 Windows 사용 안정성을 전반적으로 개선한 대규모 업데이트입니다.">
        <a className="button button-primary" href="/download">v3.0.0 다운로드 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href={JJSS.releaseUrl} target="_blank" rel="noreferrer">GitHub 전체 변경사항 <span aria-hidden="true">↗</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '업데이트', href: '/updates' }]} /></div>

      <section className="section release-summary-section">
        <div className="container release-summary reveal">
          <div><span className="release-version">3.0</span><div><small>RELEASED</small><strong><time dateTime={JJSS.releaseDate}>{formatDateLabel(JJSS.releaseDate)}</time></strong></div></div>
          <p>기존 기능을 유지하면서 실제 업무 중 발생할 수 있는 오류와 불편을 줄이고, AI 서비스를 사용자가 상황에 맞게 선택할 수 있도록 개선했습니다.</p>
          <a href={JJSS.releaseUrl} target="_blank" rel="noreferrer">원문 보기 ↗</a>
        </div>
      </section>

      <section className="section updates-list-section">
        <div className="container updates-layout">
          <aside><span className="section-kicker">WHAT’S NEW</span><h2>JJSS 3.0<br />주요 변화</h2><p>공식 Release와 현재 앱 동작에서 확인되는 핵심 내용을 사용자가 이해하기 쉬운 순서로 정리했습니다.</p></aside>
          <div className="updates-list">{updates.map((update) => <article className="reveal" key={update.number}><span className="update-number">{update.number}</span><i>{update.icon}</i><div><h3>{update.title}</h3><p>{update.text}</p><div>{update.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></article>)}</div>
        </div>
      </section>

      <section className="section update-highlight-section">
        <div className="container update-highlights">
          <article className="reveal"><div><span className="section-kicker">AI FAILOVER</span><h2>자동 전환은<br />기본적으로 꺼져 있습니다.</h2><p>동일한 입력이 다른 AI 제공업체로 전송될 수 있기 때문에 사용자가 직접 허용한 경우에만 Provider 간 전환을 사용합니다.</p><a href="/guide/api#privacy">개인정보와 자동 전환 알아보기 →</a></div><img src="/screenshots/failover-settings.webp" width="777" height="611" loading="lazy" alt="JJSS 3.0 AI 자동 전환과 비용 보호 설정 화면" /></article>
          <article className="reveal"><div><span className="section-kicker">DOCUMENT EXPORT</span><h2>계획서를 세 가지 형식으로.</h2><p>직업재활계획서 미리보기에서 내용을 수정하고 PDF, PNG 이미지, Word(DOCX) 파일로 저장할 수 있습니다.</p><a href="/features">직업재활계획서 기능 보기 →</a></div><div className="export-showcase"><img src="/screenshots/export-actions.webp" width="578" height="55" loading="lazy" alt="JJSS 3.0 직업재활계획서 PDF, PNG, Word 출력 버튼" /><span><i>PDF</i><i>PNG</i><i>DOCX</i></span></div></article>
        </div>
      </section>

      <section className="section update-notes-section">
        <div className="container update-note-card reveal">
          <span className="card-icon">!</span><div><h2>업데이트 전에 데이터를 백업하세요.</h2><p>설치 교체나 환경 변경 시 데이터 손실 가능성을 배제할 수 없습니다. 설정에서 JSON 백업 파일을 만들고 별도 안전한 위치에 보관한 뒤 업데이트하세요. API Key는 백업 파일에서 제외됩니다.</p></div><a className="button button-secondary" href="/guide#backup">백업 안내 <span aria-hidden="true">→</span></a>
        </div>
      </section>
      <div className="container"><CtaBand title="JJSS 3.0을 시작해 보세요." description="공식 Windows 설치 파일을 내려받고 API 설정부터 첫 업무 기록까지 안내받을 수 있습니다." /></div>
    </>
  );
}
