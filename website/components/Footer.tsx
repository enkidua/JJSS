import { Brand } from '@/components/Brand';
import { JJSS } from '@/src/config/jjss';

const groups = [
  {
    title: '제품',
    links: [
      { href: '/features', label: '주요 기능' },
      { href: '/download', label: 'Windows 다운로드' },
      { href: '/updates', label: '업데이트' },
    ],
  },
  {
    title: '가이드',
    links: [
      { href: '/guide/start', label: '빠른 시작' },
      { href: '/guide/api', label: 'API Key 설정' },
      { href: '/faq', label: '자주 묻는 질문' },
    ],
  },
  {
    title: '프로젝트',
    links: [
      { href: JJSS.githubUrl, label: 'GitHub' },
      { href: JJSS.releaseUrl, label: 'Release' },
      { href: JJSS.issuesUrl, label: '오류·기능 제안' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-shell">
        <div className="footer-brand">
          <Brand />
          <p>직업재활 실무의 기록과 판단을 돕기 위해 독립적으로 개발되는 업무지원 프로젝트입니다.</p>
        </div>
        <div className="footer-links">
          {groups.map((group) => (
            <div key={group.title}>
              <strong>{group.title}</strong>
              {group.links.map((link) => (
                <a key={link.href} href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noreferrer' : undefined}>{link.label}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="footer-bottom">
        <p>JJSS의 AI 기능은 업무를 보조합니다. 생성 결과는 담당자가 검토한 후 사용해야 하며 전문가 판단을 대신하지 않습니다.</p>
        <p>Gemini는 Google, OpenAI와 ChatGPT는 OpenAI, Claude는 Anthropic이 제공하는 별도 서비스입니다.</p>
      </div>
    </footer>
  );
}
