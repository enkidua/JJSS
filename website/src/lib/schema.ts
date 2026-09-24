import { JJSS } from '@/src/config/jjss';

/** 홈·다운로드 페이지가 함께 쓰는 SoftwareApplication 구조화 데이터 */
export function softwareSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: JJSS.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Windows',
    softwareVersion: JJSS.version,
    datePublished: JJSS.releaseDate,
    description: '직업재활상담사와 장애인 고용·직업재활 실무자를 위한 AI 업무지원 프로그램',
    downloadUrl: JJSS.downloadUrl,
    releaseNotes: JJSS.releaseUrl,
  };
}
