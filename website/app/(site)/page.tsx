import { ApiDemo } from '@/components/ApiDemo';
import { CountStrip } from '@/components/CountStrip';
import { CtaBand, JsonLd, SectionHeading } from '@/components/SiteParts';
import { FAQS } from '@/src/content/faq';
import { absoluteUrl, JJSS, PROVIDER_LIST } from '@/src/config/jjss';
import { softwareSchema } from '@/src/lib/schema';

const values = [
  { number: '01', title: '직업재활 업무 통합', text: '상담부터 취업 후 적응지원까지 이어지는 실무 흐름' },
  { number: '02', title: 'AI 문서작성 지원', text: '담당자의 검토와 판단을 돕는 문서 초안' },
  { number: '03', title: '로컬 중심 관리', text: '일반 업무 데이터는 사용자 PC에서 관리' },
  { number: '04', title: 'Windows 설치형', text: '현재 공식 v3.0은 Windows x64로 제공' },
];

const workflow = ['상담', '평가', '계획', '훈련', '취업', '적응지원'];

const features = [
  {
    number: '01',
    title: '이용자 및 사례관리',
    description: '이용자 정보, 상담기록, 사례관리 문서와 취업 후 적응지원 기록을 하나의 흐름으로 연결합니다.',
    tags: ['이용자 정보', '상담기록', '사례관리', '적응지원'],
    visualTitle: '사례관리 흐름',
    visualItems: ['초기상담', '직업평가', '서비스 계획', '취업 후 지원'],
    accent: 'violet',
  },
  {
    number: '02',
    title: 'AI 기반 문서작성',
    description: '상담일지, 사례회의, 공문, 회의록, 보도자료, 블로그, 쉬운 글 등 반복 문서의 초안과 문장 보완을 지원합니다.',
    tags: ['상담일지', '사례회의', '공문서', '쉬운 글'],
    visualTitle: 'AI 문서 초안',
    visualItems: ['핵심 내용 입력', '문서 유형 선택', '초안 생성', '담당자 검토'],
    accent: 'blue',
  },
  {
    number: '03',
    title: '직업재활계획서',
    description: '사례회의 내용을 바탕으로 직업목표, 장·단기 목표와 수행방법을 정리하고 기관 양식에 맞춰 확인합니다.',
    tags: ['직업목표', '장·단기 목표', '수행방법', 'PDF · PNG · DOCX'],
    visualTitle: '계획서 양식',
    visualItems: ['사례회의', '직업목표', '장기·단기목표', '수행방법'],
    accent: 'violet',
    screenshot: '/screenshots/export-actions.webp',
  },
  {
    number: '04',
    title: '직업평가',
    description: '직업평가 결과와 이력을 관리하고 종합소견서 작성과 AI 참고 의견을 지원합니다. 최종 판단은 담당자가 수행합니다.',
    tags: ['평가 결과', '평가 이력', '종합소견서', 'AI 참고 의견'],
    visualTitle: '직업평가 기록',
    visualItems: ['평가자료', '결과 정리', '참고 의견', '종합소견'],
    accent: 'blue',
  },
  {
    number: '05',
    title: '사업체·구인 관리',
    description: '사업체·구인·직무 정보를 관리하고 조건 기반 매칭 결과에 사용자가 원할 때 AI 의견을 보완할 수 있습니다.',
    tags: ['사업체', '구인정보', '직무정보', '조건 기반 매칭'],
    visualTitle: '매칭 검토',
    visualItems: ['구직 조건', '구인 조건', '로컬 계산', 'AI 의견 보완'],
    accent: 'violet',
  },
  {
    number: '06',
    title: '예산관리',
    description: '사업별 예산과 세부 항목, 지출을 관리하고 영수증 OCR, CSV와 지출품의서 작성 흐름을 지원합니다.',
    tags: ['사업별 예산', '세부 항목', '영수증 OCR', 'CSV'],
    visualTitle: '예산 집행 흐름',
    visualItems: ['예산 편성', '지출 등록', '증빙 확인', '문서 출력'],
    accent: 'blue',
  },
  {
    number: '07',
    title: '데이터 백업·복원',
    description: '업무 데이터를 JSON 파일로 백업하고 복원합니다. API Key는 백업 파일에서 제외되며, 백업 파일은 안전하게 보관해야 합니다.',
    tags: ['JSON 백업', '데이터 복원', 'API Key 제외', '로컬 보관'],
    visualTitle: '데이터 보호',
    visualItems: ['현재 데이터', '백업 파일 생성', '안전한 별도 보관', '필요 시 복원'],
    accent: 'violet',
  },
];

const quickSteps = [
  ['01', 'JJSS 다운로드', '공식 Windows 설치 파일을 내려받습니다.'],
  ['02', 'Windows 설치', '공식 Release 파일인지 확인하고 설치합니다.'],
  ['03', '첫 실행', 'API 안내를 확인하거나 비AI 기능부터 시작합니다.'],
  ['04', 'API Key 설정', '원하는 AI 서비스 하나를 선택해 Key를 등록합니다.'],
  ['05', '이용자 등록', '첫 이용자와 필요한 업무 정보를 등록합니다.'],
  ['06', 'AI 기능 테스트', '민감정보 없는 예시로 상담일지 초안을 확인합니다.'],
];

function ProductPreview() {
  return (
    <div className="product-stage" aria-label="JJSS 기능 흐름을 표현한 화면 예시">
      <div className="stage-glow" aria-hidden="true" />
      <div className="dashboard-card">
        <div className="window-bar">
          <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
          <span>JJSS · 업무 대시보드</span>
          <span className="window-status"><i /> 화면 예시</span>
        </div>
        <div className="dashboard-body">
          <aside className="dashboard-nav" aria-hidden="true">
            <b>JJSS</b>
            <span className="active">⌂ <i>홈</i></span>
            <span>◫ <i>이용자 관리</i></span>
            <span>◇ <i>직업재활계획</i></span>
            <span>◎ <i>직업평가</i></span>
            <span>▣ <i>사업체 관리</i></span>
            <span>✦ <i>AI 업무지원</i></span>
          </aside>
          <div className="dashboard-main">
            <div className="dashboard-heading">
              <div><small>업무 흐름 한눈에 보기</small><h2>직업재활 실무 대시보드</h2></div>
              <span className="date-pill">로컬 중심 관리</span>
            </div>
            <div className="module-row">
              <article><span>01</span><strong>상담·사례관리</strong><small>기록을 흐름으로 연결</small></article>
              <article><span>02</span><strong>직업평가·계획</strong><small>평가에서 계획 수립까지</small></article>
              <article><span>03</span><strong>사업체·구인</strong><small>직무와 매칭 정보 관리</small></article>
            </div>
            <div className="work-row">
              <article className="progress-card">
                <div className="card-title"><strong>직업재활 과정</strong><small>단계별 기록 연결</small></div>
                <div className="progress-track"><i /><i /><i /><i /><i /><i /></div>
                <div className="progress-labels">{workflow.map((item) => <span key={item}>{item}</span>)}</div>
              </article>
              <article className="ai-card"><span className="spark">✦</span><div><small>AI 업무지원</small><strong>초안은 빠르게,<br />판단은 전문가가</strong></div><span className="mini-arrow">→</span></article>
            </div>
          </div>
        </div>
      </div>
      <div className="floating-chip chip-plan"><span>◇</span><div><small>계획서</small><strong>직업재활계획</strong></div></div>
      <div className="floating-chip chip-ai"><span>✦</span><div><small>AI 문서작성</small><strong>상담일지 초안</strong></div></div>
      <div className="floating-chip chip-eval"><span>◎</span><div><small>평가</small><strong>직업평가 기록</strong></div></div>
    </div>
  );
}

function FeatureVisual({ feature }: { feature: (typeof features)[number] }) {
  return (
    <div className={`feature-visual accent-${feature.accent}`} aria-label={`${feature.title} 화면 예시`}>
      <div className="visual-top"><span><i /> JJSS</span><small>화면 예시</small></div>
      <div className="visual-body">
        <div className="visual-sidebar" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="visual-content">
          <div className="visual-title"><div><small>{feature.number}</small><strong>{feature.visualTitle}</strong></div><span>＋ 새 기록</span></div>
          <div className="visual-list">
            {feature.visualItems.map((item, index) => (
              <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><i className={index < 2 ? 'done' : ''}>{index < 2 ? '완료' : '다음'}</i></div>
            ))}
          </div>
          {feature.screenshot && <img className="export-screenshot" src={feature.screenshot} width="578" height="55" loading="lazy" alt="JJSS 직업재활계획서 PDF, PNG, Word 출력 버튼" />}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: JJSS.fullName,
    url: absoluteUrl('/'),
    inLanguage: 'ko-KR',
  };

  return (
    <>
      <JsonLd data={[softwareSchema(), websiteSchema]} />
      <section className="hero" id="top">
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-shell">
          <div className="hero-copy">
            <div className="eyebrow-row"><span className="eyebrow">JJSS 3.0</span><span className="eyebrow eyebrow-muted">Windows</span></div>
            <h1>직업재활 업무,<br /><span>하나의 시스템에서.</span></h1>
            <p className="hero-lead">상담부터 사례관리, 직업재활계획서, 직업평가, 사업체 관리, 예산과 문서작성까지. JJSS는 직업재활 실무 전반을 한곳에서 지원합니다.</p>
            <div className="hero-actions">
              <a className="button button-primary" href={JJSS.downloadUrl}>Windows용 다운로드 <span aria-hidden="true">↓</span></a>
              <a className="button button-secondary" href="/guide/start">5분 사용법 보기 <span aria-hidden="true">→</span></a>
            </div>
            <p className="api-note"><span aria-hidden="true">●</span> AI 기능 사용 시 선택한 서비스의 개인 API Key가 필요합니다.</p>
          </div>
          <ProductPreview />
        </div>
        <div className="value-strip" aria-label="JJSS 핵심 가치">
          {values.map((value) => <article key={value.number}><i>{value.number}</i><div><strong>{value.title}</strong><small>{value.text}</small></div></article>)}
        </div>
      </section>

      <section className="section about-section" id="about">
        <div className="container">
          <div className="about-grid reveal">
            <SectionHeading kicker="WHAT IS JJSS" title={<>직업재활 업무에 필요한 도구를 <span className="gradient-text">한곳에</span></>} description="JJSS는 직업재활상담사, 장애인복지관 고용지원 담당자, 직업재활기관 실무자가 반복적으로 수행하는 업무를 하나의 프로그램 안에서 관리하고 지원하기 위해 만든 직업재활 업무지원 시스템입니다." />
            <div className="about-principle"><span>JJSS PRINCIPLE</span><blockquote>“AI 자체가 목적이 아니라,<br />직업재활 전문가의 판단과 기록을<br />보조하는 도구입니다.”</blockquote><p>직업평가·사례관리·직업재활계획의 최종 판단은 언제나 담당자가 수행합니다.</p></div>
          </div>
          <div className="workflow reveal" aria-label="직업재활 업무 흐름">
            {workflow.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < workflow.length - 1 && <i aria-hidden="true">→</i>}</div>)}
          </div>
          <CountStrip />
        </div>
      </section>

      <section className="section feature-section" id="features">
        <div className="container">
          <SectionHeading kicker="FEATURES" title={<>흩어진 실무를<br /><span className="gradient-text">하나의 흐름으로.</span></>} description="단순한 기능 목록이 아니라 상담과 평가, 계획, 훈련과 취업 지원으로 이어지는 실제 업무 흐름에 맞췄습니다." />
          <div className="feature-showcase">
            {features.map((feature, index) => (
              <article className={`feature-row reveal${index % 2 ? ' reverse' : ''}`} key={feature.number}>
                <div className="feature-copy">
                  <span className="feature-number">FEATURE {feature.number}</span>
                  <h3>{feature.title}</h3><p>{feature.description}</p>
                  <div className="tag-list">{feature.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  {feature.number === '02' || feature.number === '04' ? <small className="review-note">AI 생성·분석 결과는 담당자가 검토한 후 사용합니다.</small> : null}
                </div>
                <FeatureVisual feature={feature} />
              </article>
            ))}
          </div>
          <div className="center-link"><a className="button button-secondary" href="/features">전체 기능 자세히 보기 <span aria-hidden="true">→</span></a></div>
        </div>
      </section>

      <section className="section api-section" id="api">
        <div className="container">
          <div className="api-intro reveal">
            <SectionHeading kicker="AI SETUP" title={<>API Key 하나만 연결하면<br /><span className="gradient-text">AI 기능을 시작할 수 있습니다.</span></>} description="API Key는 JJSS가 Gemini, OpenAI, Claude 같은 AI 서비스에 요청을 보낼 수 있도록 해당 회사가 발급하는 개인 이용키입니다. 온라인 서비스의 이용권 또는 출입키와 비슷합니다." />
            <div className="key-facts">
              <span><i>✓</i> JJSS 계정 비밀번호가 아닙니다.</span>
              <span><i>✓</i> 세 회사의 Key가 모두 필요하지 않습니다.</span>
              <span><i>✓</i> AI를 쓰지 않으면 Key 없이도 사용할 수 있습니다.</span>
              <span><i>✓</i> 제공업체 정책에 따라 비용이 발생할 수 있습니다.</span>
              <span><i>✓</i> JJSS는 자동 결제·충전을 하지 않습니다.</span>
            </div>
          </div>

          <div className="setup-steps reveal">
            <article><span>STEP 01</span><i>01</i><h3>AI 서비스 선택</h3><p>Gemini, OpenAI, Claude 중 필요한 서비스 하나를 선택합니다.</p></article>
            <article><span>STEP 02</span><i>02</i><h3>공식 사이트에서 발급</h3><p>해당 AI 회사의 공식 콘솔에서 개인 API Key를 만듭니다.</p></article>
            <article><span>STEP 03</span><i>03</i><h3>JJSS 설정에 입력</h3><p>설정 → AI 설정에서 Key를 넣고 기본 AI 모델을 확인합니다.</p></article>
          </div>

          <div className="provider-demo-grid reveal">
            <div>
              <span className="section-kicker">CHOOSE A PROVIDER</span>
              <h3>처음이라면 Gemini부터<br />확인해 보세요.</h3>
              <p>Gemini는 JJSS의 기본 제공업체이며 일부 첨부파일 분석·이미지·직업평가 기능에 필요할 수 있습니다. 일반 텍스트 문서는 OpenAI 또는 Claude를 선택할 수도 있습니다.</p>
              <a className="inline-link" href="/guide/api">Provider 비교와 설정 가이드 <span aria-hidden="true">→</span></a>
            </div>
            <ApiDemo />
          </div>

          <div className="provider-cards reveal">
            {PROVIDER_LIST.map((provider) => (
              <article key={provider.key} className={provider.recommended ? 'recommended' : undefined}>{provider.recommended && <span className="provider-badge">{provider.badge}</span>}<i>{provider.initial}</i><h3>{provider.shortName}</h3><p>{provider.summary}</p><a href={provider.guidePath}>설정 가이드 <span aria-hidden="true">→</span></a></article>
            ))}
          </div>

          <div className="comparison reveal">
            <SectionHeading kicker="WHAT WORKS WITHOUT A KEY" title="API Key가 없어도 시작할 수 있습니다." description="AI가 필요한 지점과 로컬에서 처리되는 기능을 구분해 두었습니다. 세부 기능에 필요한 Key는 다를 수 있습니다." />
            <div className="comparison-grid">
              <article><div className="comparison-head local"><span>⌁</span><div><small>API KEY 없이</small><strong>로컬·일반 업무 기능</strong></div></div><ul><li>이용자·사업체 정보 관리</li><li>일반 기록·예산 관리</li><li>기본 후보 매칭의 로컬 계산</li><li>기존 문서 저장·출력</li><li>데이터 백업·복원</li></ul></article>
              <article><div className="comparison-head ai"><span>✦</span><div><small>API KEY 필요</small><strong>AI 생성·분석 기능</strong></div></div><ul><li>AI 문서 생성·문장 보완</li><li>AI 분석·참고 의견</li><li>AI 의견을 포함한 매칭 보완</li><li>PDF·이미지 분석과 OCR 일부</li><li>직업평가 결과 AI 분석</li></ul></article>
            </div>
            <p className="table-note">PDF OCR과 일부 직업평가 기능은 Gemini, 이미지 OCR은 Google Vision 또는 Gemini 경로를 사용할 수 있습니다.</p>
          </div>

          <div className="safety-grid reveal" id="cost">
            <article className="cost-card"><span className="card-icon">₩</span><h3>API 사용료가 걱정되나요?</h3><p>JJSS 프로그램 이용과 AI 회사의 API 이용료는 서로 별개입니다. JJSS는 결제수단 등록, 자동충전 또는 구독 변경을 하지 않습니다.</p><div className="pricing-links">{PROVIDER_LIST.map((provider) => <a key={provider.key} href={provider.pricingUrl} target="_blank" rel="noreferrer">{provider.shortName} 현재 요금 ↗</a>)}</div></article>
            <article className="protection-card"><span className="card-icon">⌁</span><h3>불필요한 반복 호출을 줄였습니다.</h3><ul><li>자동 Retry 기본 0회</li><li>동일 Provider 반복·재방문 방지</li><li>더블클릭 중복 요청 차단</li><li>화면 재렌더링 재호출 차단</li><li>저장·출력·백업 시 AI 호출 없음</li><li>실행 버튼을 누를 때 생성 요청</li></ul><small>실제 비용은 Provider 계정과 사용량을 확인해 주세요.</small></article>
          </div>

          <div className="failover-privacy reveal" id="privacy">
            <article className="failover-card">
              <div className="card-label"><span>AI FAILOVER</span><i>기본 OFF</i></div>
              <h3>다른 AI 서비스로의<br />자동 전환은 사용자가 허용할 때만.</h3>
              <div className="provider-flow"><span>Gemini</span><i>일시적 사용 불가 ↓</i><span>OpenAI</span><i>필요 시 ↓</i><span>Claude</span></div>
              <p>동일한 입력이 다른 회사로 전송될 수 있기 때문에 다른 Provider로의 자동 전환은 기본적으로 꺼져 있습니다.</p>
              <img src="/screenshots/failover-settings.webp" width="777" height="611" loading="lazy" alt="JJSS AI 자동 전환과 비용 보호 설정 화면" />
            </article>
            <article className="privacy-card"><span className="card-icon">◉</span><h3>AI에 어떤 정보가 전달되나요?</h3><p>AI 기능을 실행하면 해당 작업에 필요한 입력 내용이나 첨부파일이 선택한 AI 제공업체로 전송될 수 있습니다.</p><div><strong>사용 전 꼭 확인하세요.</strong><ul><li>기관의 개인정보보호 정책</li><li>기관의 생성형 AI 이용지침</li><li>민감정보 최소화·비식별화</li><li>업무에 필요한 범위만 입력</li></ul></div><small>API Key와 업무 데이터는 서로 다른 정보입니다. 이 홈페이지는 둘 다 입력받지 않습니다.</small></article>
          </div>
        </div>
      </section>

      <section className="section quick-section">
        <div className="container">
          <SectionHeading kicker="QUICK START" title={<>처음 설치하셨나요?<br /><span className="gradient-text">빠르면 5분 안에 시작할 수 있습니다.</span></>} description="가입·결제 확인 시간은 AI 서비스에 따라 다를 수 있습니다. API 설정을 건너뛰고 비AI 기능부터 시작해도 됩니다." align="center" />
          <div className="quick-grid reveal">{quickSteps.map(([number, title, text]) => <article key={number}><span>{number}</span><div className="quick-icon" aria-hidden="true">{number === '01' ? '↓' : number === '02' ? '▣' : number === '03' ? '◎' : number === '04' ? '◇' : number === '05' ? '＋' : '✦'}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
          <div className="center-link"><a className="button button-primary" href="/guide/start">빠른 시작 가이드 보기 <span aria-hidden="true">→</span></a></div>
        </div>
      </section>

      <section className="section faq-preview-section">
        <div className="container narrow">
          <SectionHeading kicker="FAQ" title="처음 시작할 때 가장 많이 묻는 질문" description="API Key, 비용, 개인정보와 설치에 관한 핵심 답변을 먼저 확인하세요." align="center" />
          <div className="faq-list reveal">{FAQS.filter((faq) => faq.featured).map((faq) => <details key={faq.id}><summary>{faq.question}<span aria-hidden="true">＋</span></summary><div className="faq-answer"><p>{faq.answer}</p>{faq.link && <a href={faq.link.href}>{faq.link.label} <span aria-hidden="true">→</span></a>}</div></details>)}</div>
          <div className="center-link"><a className="button button-secondary" href="/faq">FAQ 전체 보기 <span aria-hidden="true">→</span></a></div>
        </div>
      </section>

      <div className="container"><CtaBand /></div>
    </>
  );
}
