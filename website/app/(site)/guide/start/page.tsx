import type { Metadata } from 'next';
import { Breadcrumbs, GuideLayout, InstallerSecurityNotice, PageHero } from '@/components/SiteParts';
import { JJSS, PROVIDERS } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS 시작 가이드 | Windows 설치와 첫 설정',
  description: 'JJSS 3.0 다운로드와 Windows 설치, 첫 실행, Gemini API Key 설정, 이용자 등록과 AI 상담일지 테스트를 6단계로 안내합니다.',
  path: '/guide/start',
});

// anchor는 섹션 id이자 목차·다른 페이지 링크의 해시다.
// 'install'·'first-client'는 사용가이드 사이드바(components/SiteParts.tsx), 'step-06'은 ProviderGuide가 링크한다.
const steps = [
  { number: '01', anchor: 'step-01', title: '공식 Windows 설치 파일 다운로드', description: `현재 공식 버전은 JJSS v${JJSS.version}이며 파일명은 ${JJSS.installerName}입니다.` },
  { number: '02', anchor: 'install', title: 'Windows에 JJSS 설치', description: '설치 파일의 출처와 파일명을 확인하고 기관의 보안 정책에 따라 설치합니다.' },
  { number: '03', anchor: 'step-03', title: 'JJSS 첫 실행', description: 'API Key 안내가 표시되면 필요한 서비스만 설정하거나 비AI 기능부터 시작합니다.' },
  { number: '04', anchor: 'step-04', title: '원하는 AI 서비스 연결', description: '처음이라면 기본 제공업체인 Gemini 설정부터 확인할 수 있습니다.' },
  { number: '05', anchor: 'first-client', title: '첫 이용자 등록', description: '이용자 관리에서 업무에 필요한 최소 정보부터 등록합니다.' },
  { number: '06', anchor: 'step-06', title: 'AI 상담일지 테스트', description: '실제 개인정보가 아닌 예시 내용으로 생성과 검토 흐름을 연습합니다.' },
];

export default function StartGuidePage() {
  return (
    <>
      <PageHero eyebrow="QUICK START" title={<>처음 설치하셨나요?<br /><span className="gradient-text">빠르면 5분 안에 시작할 수 있습니다.</span></>} description="공식 다운로드부터 첫 AI 상담일지 테스트까지 6단계로 안내합니다. 가입과 결제 확인 시간은 선택한 AI 서비스에 따라 달라질 수 있습니다.">
        <a className="button button-primary" href={JJSS.downloadUrl}>설치 파일 다운로드 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href="/guide/api">API Key 먼저 이해하기 <span aria-hidden="true">→</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '사용가이드', href: '/guide' }, { label: '빠른 시작', href: '/guide/start' }]} /></div>

      <GuideLayout>
        <section className="guide-section start-overview">
          <h2>시작 전 준비</h2>
          <div className="prepare-grid"><span><i>▣</i><strong>Windows x64 PC</strong><small>현재 공식 v3.0 지원</small></span><span><i>⌁</i><strong>인터넷 연결</strong><small>다운로드·AI 기능 사용 시</small></span><span><i>◇</i><strong>AI 계정 선택</strong><small>AI를 쓸 때만 필요</small></span></div>
          <div className="guide-callout"><span aria-hidden="true">ⓘ</span><div><strong>API Key 없이도 시작할 수 있습니다.</strong><p>이용자·사업체·예산 관리, 일반 기록, 기존 문서 저장과 데이터 백업·복원 등 비AI 기능은 Key 없이 사용할 수 있습니다.</p></div></div>
        </section>

        <nav className="start-index" aria-label="빠른 시작 단계">
          {steps.map((step) => <a key={step.number} href={`#${step.anchor}`}><span>{step.number}</span>{step.title}</a>)}
        </nav>

        <section className="guide-section start-step" id={steps[0].anchor}>
          <div className="start-step-head"><span>STEP 01</span><div><h2>{steps[0].title}</h2><p>{steps[0].description}</p></div></div>
          <div className="download-file-card"><span className="file-icon">EXE</span><div><small>OFFICIAL RELEASE · WINDOWS X64</small><strong>{JJSS.installerName}</strong><p>{JJSS.installerSize} · Release {JJSS.tag}</p></div><a className="button button-primary" href={JJSS.downloadUrl}>다운로드 ↓</a></div>
          <ul className="plain-checks"><li>주소가 <strong>github.com/enkidua/JJSS</strong>인지 확인합니다.</li><li>파일명이 <strong>{JJSS.installerName}</strong>인지 확인합니다.</li><li>다운로드가 끝난 뒤 파일을 실행합니다.</li></ul>
        </section>

        <section className="guide-section start-step" id={steps[1].anchor}>
          <div className="start-step-head"><span>STEP 02</span><div><h2>{steps[1].title}</h2><p>{steps[1].description}</p></div></div>
          <ol className="numbered-instructions"><li><span>1</span><p>내려받은 <strong>{JJSS.installerName}</strong>을 실행합니다.</p></li><li><span>2</span><p>설치 위치를 확인하고 설치 화면의 안내를 따릅니다.</p></li><li><span>3</span><p>설치가 끝나면 JJSS를 실행합니다.</p></li></ol>
          <InstallerSecurityNotice variant="callout" />
          <details className="hash-details"><summary>설치 파일 SHA-256 확인값 <span>＋</span></summary><code>{JJSS.installerSha256}</code><p>고급 확인용 값입니다. Release 자산에 표시된 공식 digest와 동일해야 합니다.</p></details>
        </section>

        <section className="guide-section start-step" id={steps[2].anchor}>
          <div className="start-step-head"><span>STEP 03</span><div><h2>{steps[2].title}</h2><p>{steps[2].description}</p></div></div>
          <div className="choice-grid"><article><span>AI 기능도 사용</span><h3>API Key 설정하기</h3><p>Gemini, OpenAI, Claude 중 필요한 서비스 하나를 선택합니다.</p><a href="/guide/api">API Key 가이드 →</a></article><article><span>나중에 설정</span><h3>비AI 기능부터 시작</h3><p>안내를 건너뛰고 이용자·사업체·예산 관리 등부터 사용할 수 있습니다.</p><a href="/features">기능 구분 보기 →</a></article></div>
        </section>

        <section className="guide-section start-step" id={steps[3].anchor}>
          <div className="start-step-head"><span>STEP 04</span><div><h2>{steps[3].title}</h2><p>{steps[3].description}</p></div></div>
          <div className="guide-screenshot"><img src={PROVIDERS.gemini.screenshot.src} width={PROVIDERS.gemini.screenshot.width} height={PROVIDERS.gemini.screenshot.height} loading="lazy" alt="JJSS Google Gemini API Key와 기본 모델 설정 화면" /><small>공식 JJSS v3.0 Release 화면 · Key가 마스킹되어 있습니다.</small></div>
          <ol className="numbered-instructions"><li><span>1</span><p>JJSS에서 <strong>설정 → AI 설정</strong>을 엽니다.</p></li><li><span>2</span><p>발급받은 Key를 해당 서비스의 <strong>API 키</strong> 입력란에 붙여넣습니다. 입력 내용은 자동 저장됩니다.</p></li><li><span>3</span><p>Gemini Key는 연결 확인을 사용할 수 있습니다. OpenAI·Claude만 등록했다면 <strong>기본 AI 모델</strong>도 같은 제공업체로 선택합니다.</p></li></ol>
          <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>API Key를 다른 사람에게 보내거나 공개하지 마세요.</strong><p>화면 공유, 캡처, 상담 메신저와 문서에 Key 전체가 보이지 않는지 확인하세요.</p></div></div>
        </section>

        <section className="guide-section start-step" id={steps[4].anchor}>
          <div className="start-step-head"><span>STEP 05</span><div><h2>{steps[4].title}</h2><p>{steps[4].description}</p></div></div>
          <ol className="numbered-instructions"><li><span>1</span><p>왼쪽 메뉴에서 <strong>이용자 관리</strong>를 엽니다.</p></li><li><span>2</span><p>새 이용자 등록을 선택하고 업무에 필요한 정보만 입력합니다.</p></li><li><span>3</span><p>저장 후 상담·평가·계획 기록을 이어서 관리합니다.</p></li></ol>
          <p className="privacy-inline"><span aria-hidden="true">◉</span> 실제 개인정보를 다룰 때는 기관의 개인정보 처리 기준과 접근 권한 정책을 따르세요.</p>
        </section>

        <section className="guide-section start-step" id={steps[5].anchor}>
          <div className="start-step-head"><span>STEP 06</span><div><h2>{steps[5].title}</h2><p>{steps[5].description}</p></div></div>
          <div className="safe-example"><span>연습용 입력 예시</span><p>“오늘 직업 탐색 활동에 참여했고, 관심 직무의 근무환경과 필요한 기술을 함께 확인했습니다. 다음 상담에서는 현장 방문 일정을 논의하기로 했습니다.”</p><small>이름, 연락처, 주민등록번호, 주소와 기관 내부 식별정보가 없는 예시입니다.</small></div>
          <ol className="numbered-instructions"><li><span>1</span><p>AI 업무지원에서 상담일지 유형을 선택합니다.</p></li><li><span>2</span><p>위와 같은 비식별 예시 내용을 넣고 생성 버튼을 한 번 누릅니다.</p></li><li><span>3</span><p>초안의 사실관계와 표현을 검토하고 필요한 부분을 직접 수정합니다.</p></li></ol>
        </section>

        <section className="guide-next"><span>설정 완료</span><h2>이제 실제 업무 흐름을 살펴보세요.</h2><p>상담·평가·계획·훈련·취업·적응지원이 JJSS에서 어떻게 연결되는지 기능 페이지에서 확인할 수 있습니다.</p><a className="button button-primary" href="/features">JJSS 기능 보기 <span aria-hidden="true">→</span></a></section>
      </GuideLayout>
    </>
  );
}
