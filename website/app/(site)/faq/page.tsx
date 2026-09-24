import type { Metadata } from 'next';
import { Breadcrumbs, CtaBand, JsonLd, PageHero, SectionHeading } from '@/components/SiteParts';
import { FAQ_CATEGORIES, FAQS } from '@/src/content/faq';
import { JJSS } from '@/src/config/jjss';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS FAQ | 설치·API Key·비용·개인정보',
  description: 'JJSS 직업재활 프로그램의 설치, Gemini·OpenAI·Claude API Key, 비용, 개인정보, Windows, 백업, 출력과 업데이트에 관한 자주 묻는 질문입니다.',
  path: '/faq',
});

const groups = FAQ_CATEGORIES.map((category) => ({
  ...category,
  items: FAQS.filter((faq) => faq.category === category.id),
}));

export default function FaqPage() {
  const schema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
  };

  return (
    <>
      <JsonLd data={schema} />
      <PageHero eyebrow="FREQUENTLY ASKED QUESTIONS" title={<>처음 시작할 때<br /><span className="gradient-text">궁금한 모든 것.</span></>} description="JJSS 설치와 사용, API Key, AI 비용, 개인정보, 백업과 업데이트까지. 실제 JJSS 3.0 동작을 기준으로 답합니다.">
        <a className="button button-primary" href="/guide/start">빠른 시작 <span aria-hidden="true">→</span></a>
        <a className="button button-secondary" href="/guide/api">API 설정 가이드 <span aria-hidden="true">◇</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: 'FAQ', href: '/faq' }]} /></div>

      <section className="section faq-page-section">
        <div className="container">
          <SectionHeading kicker={`${FAQS.length} ANSWERS`} title="주제별로 바로 찾아보세요." description="질문을 선택하면 답변이 열립니다. 키보드 Tab과 Enter로도 모든 항목을 이용할 수 있습니다." align="center" />
          <nav className="faq-category-nav" aria-label="FAQ 주제 바로가기">{groups.map((group) => <a key={group.id} href={`#${group.id}`}><strong>{group.title}</strong><small>{group.description}</small><span aria-hidden="true">↓</span></a>)}</nav>
          <div className="faq-groups">
            {groups.map((group, groupIndex) => (
              <section className="faq-group" id={group.id} key={group.id}>
                <div className="faq-group-title"><span>{String(groupIndex + 1).padStart(2, '0')}</span><div><h2>{group.title}</h2><p>{group.description}</p></div></div>
                <div className="faq-list">
                  {group.items.map((faq) => (
                    <details key={faq.id} id={faq.id}>
                      <summary>{faq.question}<span aria-hidden="true">＋</span></summary>
                      <div className="faq-answer"><p>{faq.answer}</p>{faq.link && <a href={faq.link.href} target={faq.link.href.startsWith('http') ? '_blank' : undefined} rel={faq.link.href.startsWith('http') ? 'noreferrer' : undefined}>{faq.link.label} <span aria-hidden="true">{faq.link.href.startsWith('http') ? '↗' : '→'}</span></a>}</div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="faq-contact reveal"><span className="card-icon">?</span><div><h2>답을 찾지 못했나요?</h2><p>GitHub 계정이 있다면 JJSS Issues에 오류 상황과 재현 방법 또는 기능 제안을 남길 수 있습니다. API Key와 개인정보는 첨부하지 마세요.</p></div><a className="button button-secondary" href={JJSS.issuesUrl} target="_blank" rel="noreferrer">GitHub Issues <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>
      <div className="container"><CtaBand title="이제 JJSS를 시작해 보세요." description="Windows 설치부터 API Key 설정, 첫 AI 상담일지 테스트까지 단계별로 안내합니다." /></div>
    </>
  );
}
