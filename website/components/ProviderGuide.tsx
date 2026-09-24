import { Breadcrumbs, GuideLayout, JsonLd, PageHero } from '@/components/SiteParts';
import { PROVIDERS, type ProviderKey } from '@/src/config/jjss';

type ProviderGuideProps = {
  providerKey: ProviderKey;
  eyebrow: string;
  headline: string;
  introduction: string;
  keyMask: string;
  recommendedFor: string[];
  cautions: string[];
  selectModelNote: string;
};

export function ProviderGuide({ providerKey, eyebrow, headline, introduction, keyMask, recommendedFor, cautions, selectModelNote }: ProviderGuideProps) {
  const provider = PROVIDERS[providerKey];
  const isGemini = providerKey === 'gemini';
  const steps = [
    { title: `${provider.shortName} 공식 사이트 이동`, text: `아래 “${provider.shortName} API Key 발급” 버튼으로 공식 사이트를 엽니다.` },
    { title: '계정으로 로그인', text: `${provider.name} API를 사용할 계정으로 로그인합니다.` },
    { title: 'API Key 생성', text: '공식 콘솔의 API Key 메뉴에서 새 Key를 만듭니다. 화면과 메뉴 이름은 바뀔 수 있습니다.' },
    { title: 'Key 복사', text: `생성된 Key를 복사합니다. 예: ${keyMask}` },
    { title: 'JJSS 설정 열기', text: 'JJSS 데스크톱 앱에서 설정 → AI 설정을 엽니다.' },
    { title: `${provider.shortName} Key 붙여넣기`, text: `해당 Provider의 API 키 입력란에 붙여넣습니다. Key는 입력 시 자동 저장됩니다.` },
    { title: isGemini ? '연결 확인' : '기본 AI 모델 확인', text: isGemini ? 'Gemini 카드의 연결 확인 기능으로 설정을 확인합니다.' : selectModelNote },
  ];

  const howToSchema = {
    '@context': 'https://schema.org', '@type': 'HowTo',
    name: `JJSS ${provider.shortName} API Key 설정 방법`,
    description: introduction,
    inLanguage: 'ko-KR',
    step: steps.map((step, index) => ({ '@type': 'HowToStep', position: index + 1, name: step.title, text: step.text })),
  };

  return (
    <>
      <JsonLd data={howToSchema} />
      <PageHero eyebrow={eyebrow} title={<>{headline}<br /><span className="gradient-text">발급부터 연결까지.</span></>} description={introduction}>
        <a className="button button-primary" href={provider.keyUrl} target="_blank" rel="noreferrer">공식 발급 사이트 <span aria-hidden="true">↗</span></a>
        <a className="button button-secondary" href="/guide/api">Provider 비교 <span aria-hidden="true">→</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '사용가이드', href: '/guide' }, { label: 'API Key 설정', href: '/guide/api' }, { label: `${provider.shortName} 설정`, href: provider.guidePath }]} /></div>

      <GuideLayout>
        <section className="guide-section provider-summary">
          <div className="provider-summary-head"><span>{provider.initial}</span><div><small>AI PROVIDER</small><h2>{provider.name}</h2></div><i>공식 사이트 연결</i></div>
          <p>{introduction}</p>
          <div className="provider-fit-grid"><article><strong>이런 경우 확인하세요.</strong><ul>{recommendedFor.map((item) => <li key={item}>✓ {item}</li>)}</ul></article><article><strong>미리 알아둘 점</strong><ul>{cautions.map((item) => <li key={item}>• {item}</li>)}</ul></article></div>
          <div className="guide-callout"><span aria-hidden="true">ⓘ</span><div><strong>서비스 화면과 메뉴 이름은 변경될 수 있습니다.</strong><p>버튼 위치가 다르더라도 반드시 이 페이지의 공식 링크를 통해 현재 API Key 메뉴와 요금 정책을 확인하세요.</p></div></div>
        </section>

        <section className="guide-section provider-steps-section">
          <span className="section-kicker">STEP BY STEP</span><h2>7단계 설정 방법</h2>
          <ol className="provider-step-list">
            {steps.map((step, index) => <li key={step.title} id={`step-${index + 1}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.text}</p>{index === 0 && <a href={provider.keyUrl} target="_blank" rel="noreferrer">{provider.shortName} API Key 발급 · 공식 사이트 ↗</a>}{index === 3 && <code>{keyMask}</code>}</div></li>)}
          </ol>
        </section>

        <section className="guide-section provider-screen-section">
          <span className="section-kicker">JJSS 설정 화면</span><h2>Key를 입력하고 모델을 확인합니다.</h2>
          <div className="guide-screenshot"><img src={provider.screenshot.src} width={provider.screenshot.width} height={provider.screenshot.height} loading="lazy" alt={`JJSS ${provider.name} API Key와 모델 설정 화면`} /><small>공식 JJSS v3.0 Release 화면 · 실제 Key는 표시하지 않습니다.</small></div>
          <div className="guide-callout warning"><span aria-hidden="true">!</span><div><strong>API Key를 다른 사람에게 보내거나 공개하지 마세요.</strong><p>예시처럼 마스킹된 상태인지 확인하고, Key 전체가 보이는 화면을 캡처하거나 공유하지 마세요.</p></div></div>
        </section>

        <section className="guide-section provider-cost-section">
          <span className="section-kicker">비용 확인</span><h2>실행 전에 현재 요금을 확인하세요.</h2>
          <p>API 이용료는 모델, 입력·출력 길이, 사용량과 계정 상태에 따라 달라집니다. JJSS 사이트는 바뀔 수 있는 가격 숫자를 고정해서 표시하지 않습니다.</p>
          <div className="official-actions"><a href={provider.pricingUrl} target="_blank" rel="noreferrer"><span>₩</span><div><strong>{provider.shortName} 현재 요금 확인</strong><small>{provider.name} 공식 사이트</small></div><i>↗</i></a><a href={provider.keyUrl} target="_blank" rel="noreferrer"><span>◇</span><div><strong>API Key 관리</strong><small>{provider.name} 공식 콘솔</small></div><i>↗</i></a></div>
          <div className="guide-callout"><span aria-hidden="true">ⓘ</span><div><strong>JJSS는 결제·충전·구독 변경을 하지 않습니다.</strong><p>AI 요청을 실행하면 Provider 계정의 정책과 사용량에 따라 비용이 발생할 수 있습니다. 사용량과 한도는 공식 콘솔에서 확인하세요.</p></div></div>
        </section>

        <section className="guide-section provider-security">
          <span className="section-kicker">KEY 보안</span><h2>발급 후에도 안전하게 관리하세요.</h2>
          <div className="security-checks"><span><i>✓</i>공개 문서·메신저에 붙여넣지 않기</span><span><i>✓</i>화면 공유 전 Key 숨김 확인</span><span><i>✓</i>노출이 의심되면 공식 콘솔에서 폐기</span><span><i>✓</i>새 Key 발급 후 JJSS 설정 교체</span></div>
          <p className="table-note">이 홈페이지는 API Key를 입력받거나 저장하지 않습니다. Key는 JJSS 데스크톱 앱의 설정 화면에만 입력하세요.</p>
        </section>

        <section className="guide-next"><span>설정 후 다음 단계</span><h2>민감정보 없는 예시로 먼저 테스트하세요.</h2><p>첫 AI 상담일지 테스트와 담당자 검토 흐름을 빠른 시작 가이드에서 이어서 확인할 수 있습니다.</p><a className="button button-primary" href="/guide/start#step-06">AI 상담일지 테스트 <span aria-hidden="true">→</span></a></section>
      </GuideLayout>
    </>
  );
}
