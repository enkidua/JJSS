import type { Metadata } from 'next';
import { Breadcrumbs, GuideLayout, PageHero } from '@/components/SiteParts';
import { FAQS } from '@/src/content/faq';
import { PROVIDERS } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS 사용가이드 | 설치부터 업무 시작까지',
  description: 'JJSS Windows 설치, API Key 설정, 첫 이용자 등록, 상담일지, 직업재활계획서, 파일 저장과 백업 방법을 초보자 눈높이로 안내합니다.',
  path: '/guide',
});

const guideCards = [
  { icon: '↓', title: '처음 시작하기', text: '다운로드부터 첫 이용자 등록과 AI 상담일지 테스트까지 순서대로 진행합니다.', href: '/guide/start', meta: '빠르면 5분 · 초보자' },
  { icon: '◇', title: 'API Key 이해하기', text: 'API Key가 무엇인지, 왜 필요한지, 비용과 개인정보는 어떻게 확인해야 하는지 알아봅니다.', href: '/guide/api', meta: '가장 먼저 읽기' },
  { icon: PROVIDERS.gemini.initial, title: 'Gemini 설정', text: 'Google AI Studio의 공식 발급 페이지에서 Key를 만들고 JJSS에 입력합니다.', href: PROVIDERS.gemini.guidePath, meta: 'JJSS 기본 Provider' },
  { icon: PROVIDERS.openai.initial, title: 'OpenAI 설정', text: 'ChatGPT 구독과 별개인 OpenAI API Key를 발급하고 기본 AI 모델을 선택합니다.', href: PROVIDERS.openai.guidePath, meta: PROVIDERS.openai.badge },
  { icon: PROVIDERS.claude.initial, title: 'Claude 설정', text: 'Anthropic Claude Platform에서 Key를 발급하고 JJSS 기본 AI 모델을 선택합니다.', href: PROVIDERS.claude.guidePath, meta: PROVIDERS.claude.badge },
  { icon: '?', title: '자주 묻는 질문', text: '설치, 비용, API Key, 개인정보, 업데이트와 백업에 관한 답변을 확인합니다.', href: '/faq', meta: `${FAQS.length}개 질문` },
];

export default function GuidePage() {
  return (
    <>
      <PageHero eyebrow="JJSS GUIDE" title={<>처음이어도 헤매지 않도록,<br /><span className="gradient-text">순서대로 안내합니다.</span></>} description="Windows 설치부터 AI 서비스 선택, 첫 업무 기록, 파일 저장과 백업까지. 개발자 용어 대신 실제 화면에서 해야 할 일을 중심으로 설명합니다.">
        <a className="button button-primary" href="/guide/start">빠른 시작 <span aria-hidden="true">→</span></a>
        <a className="button button-secondary" href="/guide/api">API Key부터 보기 <span aria-hidden="true">◇</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '사용가이드', href: '/guide' }]} /></div>

      <GuideLayout>
        <section className="guide-section guide-welcome">
          <span className="section-kicker">START HERE</span>
          <h2>어디서 시작하면 될까요?</h2>
          <p>JJSS를 아직 설치하지 않았다면 <a href="/guide/start">빠른 시작 가이드</a>를 먼저 보세요. 이미 설치했다면 필요한 AI 서비스 하나의 Key만 연결하거나, API 설정을 건너뛰고 이용자·사업체·예산 관리 같은 비AI 기능부터 사용할 수 있습니다.</p>
          <div className="guide-callout"><span aria-hidden="true">ⓘ</span><div><strong>이 홈페이지에는 API Key를 입력하지 않습니다.</strong><p>Key는 JJSS 데스크톱 프로그램의 설정 화면에만 입력하세요. 다른 사람에게 보내거나 공개된 화면에 표시하지 마세요.</p></div></div>
        </section>

        <section className="guide-section">
          <h2>주제별 가이드</h2>
          <div className="guide-card-grid">
            {guideCards.map((card) => <a className="guide-card" href={card.href} key={card.href}><span className="guide-card-icon">{card.icon}</span><small>{card.meta}</small><h3>{card.title}</h3><p>{card.text}</p><i>가이드 보기 →</i></a>)}
          </div>
        </section>

        <section className="guide-section" id="consultation">
          <span className="guide-step-label">업무 가이드 01</span><h2>AI 상담일지 시작하기</h2>
          <ol className="guide-steps-list">
            <li><span>01</span><div><strong>필요한 상담 내용만 정리합니다.</strong><p>기관 정책을 확인하고 민감정보는 필요한 범위로 최소화하거나 비식별화하세요.</p></div></li>
            <li><span>02</span><div><strong>상담일지 또는 원하는 문서 유형을 선택합니다.</strong><p>선택한 기능에 따라 입력 내용이 기본 AI 제공업체로 전송될 수 있습니다.</p></div></li>
            <li><span>03</span><div><strong>생성 버튼을 한 번 눌러 초안을 만듭니다.</strong><p>화면을 열거나 파일을 선택하는 것만으로 자동 생성 요청이 시작되지는 않습니다.</p></div></li>
            <li><span>04</span><div><strong>사실관계와 표현을 직접 검토합니다.</strong><p>AI 초안을 그대로 사용하지 말고 이용자 상황과 기관 문서 기준에 맞게 수정하세요.</p></div></li>
          </ol>
        </section>

        <section className="guide-section" id="rehab-plan">
          <span className="guide-step-label">업무 가이드 02</span><h2>직업재활계획서 작성과 출력</h2>
          <p>사례회의 내용을 바탕으로 직업목표, 장·단기 목표와 수행방법을 정리한 뒤 양식 미리보기에서 직접 수정할 수 있습니다. 출력 단계는 AI 호출 없이 기기 안에서 처리됩니다.</p>
          <div className="guide-screenshot compact"><img src="/screenshots/export-actions.webp" width="578" height="55" loading="lazy" alt="JJSS 직업재활계획서 PDF, PNG, Word 출력 버튼" /><small>공식 JJSS v3.0 Release 화면</small></div>
          <div className="format-row"><span><strong>PDF</strong>공유·인쇄용</span><span><strong>PNG</strong>이미지 확인용</span><span><strong>DOCX</strong>Word 편집용</span></div>
          <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>계획서의 최종 내용은 담당자가 확인하세요.</strong><p>목표와 서비스 방향은 AI가 결정할 수 없습니다. 이용자 의견과 사례회의 결과, 기관 기준을 반영해 최종 확정하세요.</p></div></div>
        </section>

        <section className="guide-section" id="file-save">
          <span className="guide-step-label">업무 가이드 03</span><h2>파일 저장 위치 확인하기</h2>
          <p>JJSS는 Windows에서 전용 폴더를 제안하며 바탕화면, 다운로드, OneDrive 또는 다른 드라이브 등 원하는 위치를 직접 선택할 수 있습니다. 저장 후 폴더 열기로 실제 파일 위치를 확인하세요.</p>
          <div className="mini-check-grid"><span><i>✓</i> 저장 전 파일 이름 확인</span><span><i>✓</i> 개인정보 포함 여부 확인</span><span><i>✓</i> 기관 승인 위치에 저장</span><span><i>✓</i> 외부 공유 전 재검토</span></div>
        </section>

        <section className="guide-section" id="backup">
          <span className="guide-step-label">업무 가이드 04</span><h2>업데이트 전에 백업하기</h2>
          <p>설정의 데이터 백업 기능으로 JSON 파일을 만들고 JJSS 설치 폴더와 다른 안전한 위치에 보관하세요. API Key는 백업 파일에 포함되지 않지만 이용자와 사례 문서 등 개인정보가 포함될 수 있습니다.</p>
          <div className="backup-flow"><span>현재 데이터</span><i>→</i><span>JSON 백업</span><i>→</i><span>안전한 별도 보관</span><i>→</i><span>필요 시 복원</span></div>
          <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>복원 전 현재 데이터를 다시 백업하세요.</strong><p>복원은 현재 데이터를 백업 파일 내용으로 덮어쓸 수 있습니다. 올바른 백업 파일인지 확인한 뒤 진행하세요.</p></div></div>
        </section>

        <section className="guide-next"><span>다음 단계</span><h2>설치부터 함께 시작할까요?</h2><p>6단계 빠른 시작 가이드에서 다운로드, 설치, API 설정과 첫 테스트까지 이어서 확인하세요.</p><a className="button button-primary" href="/guide/start">빠른 시작 가이드 <span aria-hidden="true">→</span></a></section>
      </GuideLayout>
    </>
  );
}
