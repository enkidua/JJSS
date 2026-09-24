import type { Metadata } from 'next';
import { ApiDemo } from '@/components/ApiDemo';
import { Breadcrumbs, GuideLayout, PageHero } from '@/components/SiteParts';
import { PROVIDER_LIST, type ProviderKey } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS API Key 설정 가이드 | Gemini·OpenAI·Claude',
  description: 'API Key가 무엇인지부터 Gemini, OpenAI, Claude 선택, 발급, 비용, 개인정보, 자동 전환과 JJSS 입력 방법까지 쉽게 설명합니다.',
  path: '/guide/api',
});

const providerPoints: Record<ProviderKey, string[]> = {
  gemini: ['기본 Provider', '일반 텍스트 AI', '일부 파일·이미지 기능'],
  openai: ['일반 텍스트 AI', 'ChatGPT 구독과 별도', '기본 모델 선택 필요'],
  claude: ['일반 텍스트 AI', 'Claude Platform 사용', '기본 모델 선택 필요'],
};

export default function ApiGuidePage() {
  return (
    <>
      <PageHero eyebrow="API KEY GUIDE" title={<>AI 기능,<br /><span className="gradient-text">어렵지 않습니다.</span></>} description="API Key는 JJSS가 선택한 AI 서비스에 요청을 보낼 수 있도록 해당 회사가 발급하는 개인 이용키입니다. 모든 Key를 만들 필요 없이 필요한 서비스 하나부터 시작할 수 있습니다.">
        <a className="button button-primary" href="#providers">AI 서비스 선택하기 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href="/guide/start">빠른 시작으로 돌아가기 <span aria-hidden="true">→</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '사용가이드', href: '/guide' }, { label: 'API Key 설정', href: '/guide/api' }]} /></div>

      <GuideLayout>
        <section className="guide-section api-definition">
          <span className="section-kicker">API KEY란?</span><h2>온라인 서비스의 이용권 또는 출입키와 비슷합니다.</h2>
          <p>JJSS가 Gemini, OpenAI, Claude 같은 AI 서비스에 문서 생성이나 분석을 요청할 때 “이 계정에서 보낸 요청”임을 확인하기 위한 키입니다. 각 AI 회사의 공식 사이트에서 발급받아 JJSS 설정에 입력합니다.</p>
          <div className="definition-cards"><article><span>×</span><strong>JJSS 비밀번호가 아닙니다.</strong><p>JJSS 로그인이나 기관 계정 비밀번호와는 다른 정보입니다.</p></article><article><span>1</span><strong>하나만 있어도 시작할 수 있습니다.</strong><p>세 회사의 Key를 모두 등록할 필요는 없습니다.</p></article><article><span>○</span><strong>AI를 안 쓰면 없어도 됩니다.</strong><p>비AI 기능은 API Key 없이 사용할 수 있습니다.</p></article><article><span>₩</span><strong>비용은 Provider 정책에 따릅니다.</strong><p>JJSS가 자동 결제하거나 충전하지 않습니다.</p></article></div>
          <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>API Key를 다른 사람에게 보내거나 공개하지 마세요.</strong><p>Key는 해당 AI 계정의 사용 권한과 연결됩니다. 화면 공유, 캡처, 메신저와 문서에서 전체 값이 보이지 않도록 주의하세요.</p></div></div>
        </section>

        <section className="guide-section api-three-steps">
          <span className="section-kicker">3 STEPS</span><h2>세 단계로 연결합니다.</h2>
          <div className="vertical-steps"><article><span>01</span><div><small>AI 서비스 선택</small><h3>Gemini · OpenAI · Claude</h3><p>처음이라면 JJSS 기본 제공업체인 Gemini부터 확인할 수 있습니다.</p></div></article><article><span>02</span><div><small>공식 사이트</small><h3>API Key 발급</h3><p>선택한 AI 회사의 공식 콘솔에 로그인해 개인 Key를 만듭니다.</p></div></article><article><span>03</span><div><small>JJSS 데스크톱 앱</small><h3>설정 → AI 설정 → Key 입력</h3><p>Key를 붙여넣은 뒤 기본 AI 모델이 같은 제공업체인지 확인합니다.</p></div></article></div>
          <p className="timeline-note">빠르면 몇 분 안에 설정할 수 있습니다. 가입·결제 확인 시간은 서비스별로 다를 수 있습니다.</p>
        </section>

        <section className="guide-section" id="providers">
          <span className="section-kicker">PROVIDER 선택</span><h2>어떤 AI 서비스를 선택할까요?</h2><p>성능 순위를 매기는 비교가 아니라 JJSS에서 필요한 기능과 이미 사용하는 서비스를 기준으로 선택하세요.</p>
          <div className="provider-guide-cards">{PROVIDER_LIST.map((provider) => <article key={provider.key} className={provider.recommended ? 'recommended' : ''}><span className="provider-guide-badge">{provider.badge}</span><i>{provider.initial}</i><h3>{provider.shortName}</h3><p>{provider.summary}</p><ul>{providerPoints[provider.key].map((point) => <li key={point}>✓ {point}</li>)}</ul><a href={provider.guidePath}>발급·설정 가이드 <span aria-hidden="true">→</span></a></article>)}</div>
          <div className="provider-screenshots">{PROVIDER_LIST.map((provider) => <figure key={provider.key}><img src={provider.screenshot.src} width={provider.screenshot.width} height={provider.screenshot.height} loading="lazy" alt={`JJSS ${provider.name} API Key와 모델 설정 화면`} /><figcaption>{provider.shortName} 설정</figcaption></figure>)}</div>
        </section>

        <section className="guide-section demo-guide-section">
          <span className="section-kicker">설명용 DEMO</span><h2>JJSS에서는 이렇게 입력합니다.</h2><p>아래 화면은 설정 과정을 이해하기 위한 예시입니다. 실제 입력란이 아니며 어떤 값도 저장하거나 전송하지 않습니다.</p><ApiDemo />
          <div className="guide-callout"><span aria-hidden="true">ⓘ</span><div><strong>OpenAI 또는 Claude만 등록했다면 한 단계 더 확인하세요.</strong><p>JJSS의 기본 Provider는 Gemini입니다. OpenAI·Claude Key만 등록한 경우 설정의 <strong>기본 AI 모델</strong>도 같은 Provider로 직접 선택해야 일반 텍스트 AI 기능이 동작합니다.</p></div></div>
        </section>

        <section className="guide-section api-comparison">
          <span className="section-kicker">기능 구분</span><h2>API Key 없이 / Key가 필요한 기능</h2>
          <div className="guide-table-wrap"><table><thead><tr><th>API Key 없이</th><th>API Key 필요</th></tr></thead><tbody><tr><td>이용자·사업체 정보 관리</td><td>AI 문서 생성·문장 보완</td></tr><tr><td>일반 기록·예산 관리</td><td>AI 분석·참고 의견</td></tr><tr><td>기본 후보 매칭의 로컬 계산</td><td>AI 의견을 포함한 매칭 보완</td></tr><tr><td>기존 문서 저장·출력</td><td>PDF·이미지 분석과 OCR 일부</td></tr><tr><td>데이터 백업·복원</td><td>직업평가 결과 AI 분석</td></tr></tbody></table></div>
          <p className="table-note">세부 기능에 필요한 Key는 다를 수 있습니다. PDF OCR과 일부 직업평가 기능은 Gemini, 이미지 OCR은 Google Vision 또는 Gemini 경로를 사용할 수 있습니다.</p>
        </section>

        <section className="guide-section" id="cost">
          <span className="section-kicker">비용 안내</span><h2>API 사용료가 걱정되나요?</h2>
          <div className="cost-explainer"><div><strong>JJSS 프로그램</strong><span aria-hidden="true">≠</span><strong>AI 회사 API 이용료</strong></div><p>서로 별개입니다. JJSS는 결제수단 등록, 자동충전 또는 구독 변경을 하지 않습니다. AI 요청을 실행하면 선택한 회사의 정책과 사용량에 따라 해당 계정에 비용이 발생할 수 있습니다.</p></div>
          <div className="official-link-list">{PROVIDER_LIST.map((provider) => <a key={provider.key} href={provider.pricingUrl} target="_blank" rel="noreferrer"><span>{provider.initial}</span><div><strong>{provider.shortName} 현재 요금 확인</strong><small>{provider.vendor} 공식 사이트</small></div><i>↗</i></a>)}</div>
          <h3 className="subheading">JJSS 3.0의 반복 호출 보호</h3><div className="protection-grid"><span><i>0</i>자동 Retry 기본 0회</span><span><i>1×</i>Provider당 최대 1회</span><span><i>3</i>작업당 최대 3 Provider</span><span><i>⌁</i>더블클릭 중복 차단</span><span><i>↻</i>재렌더링 재호출 차단</span><span><i>↓</i>저장·출력 시 호출 없음</span></div>
          <p className="table-note">불필요한 반복 호출 가능성을 줄이도록 설계했습니다. 실제 비용 발생 여부는 Provider 계정과 사용량을 확인해 주세요.</p>
        </section>

        <section className="guide-section" id="privacy">
          <span className="section-kicker">개인정보와 자동 전환</span><h2>AI에 어떤 정보가 전달되나요?</h2>
          <p>AI 기능을 실행하면 해당 작업에 필요한 입력 내용이나 첨부파일이 선택한 AI 제공업체로 전송될 수 있습니다. 모든 요청에서 모든 개인정보가 자동 비식별화된다고 가정하면 안 됩니다.</p>
          <div className="privacy-do-grid"><article><span>01</span><h3>기관 정책 확인</h3><p>개인정보보호 정책과 생성형 AI 이용지침을 먼저 확인합니다.</p></article><article><span>02</span><h3>필요한 범위만</h3><p>업무에 불필요한 이름, 연락처, 식별정보를 입력하지 않습니다.</p></article><article><span>03</span><h3>결과 직접 검토</h3><p>사실관계와 표현, 민감정보 포함 여부를 담당자가 확인합니다.</p></article></div>
          <div className="failover-guide"><div><span>Gemini</span><i>일시적 사용 불가</i><span>OpenAI</span><i>필요 시</i><span>Claude</span></div><article><span>기본 OFF</span><h3>다른 AI 서비스로 자동 전환</h3><p>동일한 입력이 다른 회사로 전송될 수 있기 때문에 사용자가 직접 허용한 경우에만 활성화됩니다.</p></article></div>
          <div className="guide-screenshot"><img src="/screenshots/failover-settings.webp" width="777" height="611" loading="lazy" alt="JJSS AI 자동 전환과 비용 보호 설정 화면" /><small>공식 JJSS v3.0 Release 화면</small></div>
        </section>

        <section className="guide-section key-storage-section">
          <span className="section-kicker">KEY 보관</span><h2>API Key와 업무 데이터는 다른 정보입니다.</h2>
          <div className="key-storage-grid"><article><span>◇</span><h3>API Key</h3><p>JJSS 3.0 소스 기준 AES-GCM 방식으로 암호화되어 사용자 PC의 IndexedDB에 저장되며 데이터 백업 파일에서는 제외됩니다.</p></article><article><span>▤</span><h3>업무 데이터</h3><p>일반 데이터는 PC에 저장되지만 AI 기능을 실행하면 필요한 입력이나 첨부파일이 선택한 Provider로 전송될 수 있습니다.</p></article></div>
        </section>

        <section className="guide-next"><span>Provider를 선택하셨나요?</span><h2>공식 발급 페이지부터 차근차근 안내합니다.</h2><div className="next-provider-links">{PROVIDER_LIST.map((provider) => <a key={provider.key} href={provider.guidePath}>{provider.shortName} 가이드 →</a>)}</div></section>
      </GuideLayout>
    </>
  );
}
