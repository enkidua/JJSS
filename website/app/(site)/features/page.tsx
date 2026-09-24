import type { Metadata } from 'next';
import { Breadcrumbs, CtaBand, PageHero, SectionHeading } from '@/components/SiteParts';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'JJSS 기능 | 직업재활·사례관리·AI 문서작성',
  description: '이용자 사례관리, AI 문서작성, 직업재활계획서, 직업평가, 사업체·구인, 예산, 백업까지 JJSS의 실제 기능을 살펴보세요.',
  path: '/features',
});

const featureDetails = [
  {
    number: '01', title: '이용자 및 사례관리', subtitle: '상담에서 취업 후 지원까지 기록을 연결합니다.',
    body: '이용자 기본정보와 상담기록, 사례관리 문서, 취업 후 적응지원 기록을 한 프로그램 안에서 관리합니다. 업무 단계마다 흩어지기 쉬운 기록을 다음 단계와 연결해 확인할 수 있습니다.',
    items: ['이용자 정보와 상담기록', '사례회의 및 사례관리 문서', '취업 후 적응지원 기록', '직업훈련·상담 이력 연계'],
    visual: ['초기상담', '평가 의뢰', '서비스 계획', '훈련 기록', '취업 지원', '적응지원'],
    note: '업무 데이터는 사용자 PC의 로컬 데이터베이스를 중심으로 관리됩니다.',
  },
  {
    number: '02', title: 'AI 기반 문서작성', subtitle: '반복 문서의 초안과 문장 정리를 지원합니다.',
    body: '상담일지, 사례회의, 공문, 회의록, 보도자료, 블로그, 쉬운 글 등 실무 문서의 초안을 만들고 문장을 보완할 수 있습니다. 입력한 업무 내용은 선택한 AI 제공업체로 전송될 수 있습니다.',
    items: ['상담일지·사례회의 초안', '공문·보도자료·블로그', '회의록과 문서 Q&A', '쉬운 글과 문장 개선'],
    visual: ['업무 내용 입력', '문서 유형 선택', 'AI 초안 생성', '담당자 검토', '필요한 부분 수정', '파일 저장'],
    note: 'AI 결과는 반드시 담당자가 사실관계와 표현을 검토한 뒤 사용해야 합니다.',
  },
  {
    number: '03', title: '직업재활계획서', subtitle: '사례회의에서 계획서 출력까지 이어집니다.',
    body: '사례회의 내용을 바탕으로 직업목표, 장기·단기 목표, 수행방법과 담당자를 정리하고 기관 양식에 가까운 미리보기에서 수정합니다. 완성된 계획서는 PDF, PNG, Word(DOCX)로 저장할 수 있습니다.',
    items: ['직업목표 및 장·단기 목표', '수행방법·담당자 정리', '기관 양식 기반 미리보기', 'PDF·PNG·DOCX 출력'],
    visual: ['사례회의', '직업목표', '장기목표', '단기목표', '수행방법', '출력'],
    image: '/screenshots/export-actions.webp',
    imageAlt: 'JJSS 직업재활계획서 PDF, PNG, Word 출력 기능',
    note: '문서 저장과 출력 자체는 AI API를 호출하지 않습니다.',
  },
  {
    number: '04', title: '직업평가', subtitle: '평가 결과와 이력을 체계적으로 정리합니다.',
    body: '직업평가 결과와 평가 이력을 관리하고 종합소견서 작성을 지원합니다. AI 참고 의견은 담당자의 판단을 돕는 보조 자료이며 평가 결론을 대신하지 않습니다.',
    items: ['직업평가 결과·이력', 'PDF·이미지·텍스트 분석', '종합평가 문서 작성', 'AI 참고 의견'],
    visual: ['자료 등록', '평가 항목 확인', '결과 정리', '참고 의견', '종합소견', '담당자 검토'],
    note: '현재 결과 분석과 일부 첨부파일 기능은 Gemini가 필요할 수 있습니다.',
  },
  {
    number: '05', title: '사업체·구인 관리', subtitle: '구직 조건과 구인 정보를 함께 검토합니다.',
    body: '사업체, 구인정보와 직무정보를 관리하고 구직자 조건과 구인 조건을 비교합니다. 기본 매칭 계산은 로컬 규칙과 가중치로 수행되며, 사용자가 요청한 경우 AI가 의견을 보완합니다.',
    items: ['사업체·구인정보 관리', '직무정보 및 직무분석', '조건 기반 정밀 매칭', '선택적 AI 의견 보완'],
    visual: ['구직 조건', '구인 조건', '필수 조건 확인', '가중치 계산', '후보 검토', '의견 보완'],
    note: 'AI가 매칭 점수를 임의로 결정하는 구조가 아닙니다.',
  },
  {
    number: '06', title: '예산관리', subtitle: '사업별 예산과 지출 증빙을 관리합니다.',
    body: '사업별 예산, 세부 예산항목과 지출을 관리하고 영수증 OCR, CSV 내보내기와 지출품의서 작성 흐름을 지원합니다. OCR에 필요한 Key는 파일 형식과 사용 경로에 따라 다를 수 있습니다.',
    items: ['사업별·항목별 예산', '지출 등록과 집행 현황', '영수증 OCR', 'CSV·결재문서 출력'],
    visual: ['예산 편성', '지출 입력', '영수증 확인', '항목 분류', '집행 현황', '문서 출력'],
    note: '이미지 OCR은 Google Vision 또는 Gemini 경로를, PDF OCR은 Gemini를 사용할 수 있습니다.',
  },
  {
    number: '07', title: '데이터 백업·복원', subtitle: '업데이트 전 데이터를 파일로 보관합니다.',
    body: '이용자, 사업체, 사례 문서, 지출, 직업훈련 기록 등을 JSON 파일로 백업하고 복원할 수 있습니다. 백업에는 개인정보가 포함될 수 있으므로 기관의 보안 정책에 따라 안전한 위치에 보관해야 합니다.',
    items: ['전체 업무 데이터 백업', 'JSON 파일 복원', 'API Key 자동 제외', '업데이트 전 백업 안내'],
    visual: ['현재 데이터', '백업 실행', 'JSON 파일', '별도 보관', '복원 전 재백업', '데이터 복원'],
    note: '복원은 현재 데이터를 덮어쓸 수 있으므로 복원 전 다시 백업하세요.',
  },
];

function DetailVisual({ feature }: { feature: (typeof featureDetails)[number] }) {
  return (
    <div className="detail-visual" aria-label={`${feature.title} 화면 예시`}>
      <div className="detail-window-bar"><span><i /><i /><i /></span><strong>{feature.title}</strong><small>화면 예시</small></div>
      <div className="detail-flow">
        {feature.visual.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong>{index < feature.visual.length - 1 && <i aria-hidden="true">→</i>}</div>)}
      </div>
      {feature.image && <img src={feature.image} alt={feature.imageAlt} width="578" height="55" loading="lazy" />}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="JJSS FEATURES" title={<>직업재활 실무의 흐름을<br /><span className="gradient-text">연결하는 기능</span></>} description="상담과 사례관리부터 직업평가, 계획, 사업체·예산 관리와 AI 문서작성까지. 각 기능이 어디에서 AI를 사용하고 어디에서 로컬로 처리되는지 함께 안내합니다.">
        <a className="button button-primary" href="/download">JJSS 3.0 시작하기 <span aria-hidden="true">↓</span></a>
        <a className="button button-secondary" href="/guide">사용가이드 <span aria-hidden="true">→</span></a>
      </PageHero>
      <div className="container"><Breadcrumbs items={[{ label: '기능', href: '/features' }]} /></div>

      <section className="section details-section">
        <div className="container">
          <SectionHeading kicker="7 CORE WORKFLOWS" title="기능보다 중요한 것은 업무의 연결입니다." description="JJSS는 직업재활 현장의 여러 기록을 각각 분리된 도구로 보지 않고 다음 단계로 이어지는 업무 흐름으로 다룹니다." align="center" />
          <div className="details-list">
            {featureDetails.map((feature, index) => (
              <article className={`detail-row reveal${index % 2 ? ' reverse' : ''}`} key={feature.number}>
                <div className="detail-copy">
                  <span className="feature-number">FEATURE {feature.number}</span>
                  <h2>{feature.title}</h2><h3>{feature.subtitle}</h3><p>{feature.body}</p>
                  <ul>{feature.items.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
                  <div className="detail-note"><span aria-hidden="true">ⓘ</span>{feature.note}</div>
                </div>
                <DetailVisual feature={feature} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section judgment-section">
        <div className="container judgment-card reveal">
          <span className="card-icon">◎</span>
          <div><span className="section-kicker">HUMAN IN THE LOOP</span><h2>AI는 전문가의 판단을 대신하지 않습니다.</h2><p>직업평가, 사례관리와 직업재활계획은 이용자의 삶과 서비스 방향에 직접 영향을 줍니다. JJSS의 AI 기능은 입력 내용을 정리하고 초안을 제안하는 도구이며, 사실 확인과 최종 판단은 담당자가 수행해야 합니다.</p></div>
        </div>
      </section>
      <div className="container"><CtaBand title="필요한 기능을 확인하셨나요?" description="Windows용 JJSS 3.0을 내려받고 빠른 시작 가이드에서 첫 설정을 이어가세요." /></div>
    </>
  );
}
