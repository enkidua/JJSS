export const JJSS = {
  name: 'JJSS',
  fullName: 'JJSS 직업재활 업무지원 시스템',
  version: '3.0.0',
  versionLabel: 'JJSS 3.0',
  tag: 'v3.0',
  releaseDate: '2026-08-17',
  operatingSystem: 'Windows x64',
  installerName: 'JJSS.Setup.3.0.0.exe',
  installerSize: '약 143 MB',
  installerSha256: '5baf52fa4234d2d793859fbef37be53fdebb6bea0d9d9302dfc43bb5a3a51816',
  githubUrl: 'https://github.com/enkidua/JJSS',
  releaseUrl: 'https://github.com/enkidua/JJSS/releases/tag/v3.0',
  downloadUrl: 'https://github.com/enkidua/JJSS/releases/download/v3.0/JJSS.Setup.3.0.0.exe',
  issuesUrl: 'https://github.com/enkidua/JJSS/issues',
} as const;

/** 'YYYY-MM-DD' → 'YYYY. MM. DD.' (시간대 영향을 받지 않도록 문자열로 처리) */
export function formatDateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  return `${year}. ${month}. ${day}.`;
}

export const PROVIDER_KEYS = ['gemini', 'openai', 'claude'] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    shortName: 'Gemini',
    initial: 'G',
    vendor: 'Google',
    badge: '처음 시작할 때 안내',
    recommended: true,
    summary: 'JJSS 기본 제공업체입니다. 일부 첨부파일 분석·이미지·직업평가 AI 기능에 필요할 수 있습니다.',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    guidePath: '/guide/api/gemini',
    screenshot: { src: '/screenshots/gemini-settings.webp', width: 771, height: 342 },
  },
  openai: {
    name: 'OpenAI',
    shortName: 'OpenAI',
    initial: 'O',
    vendor: 'OpenAI',
    badge: '텍스트 문서작성',
    recommended: false,
    summary: 'OpenAI API의 GPT 모델로 일반 텍스트 문서작성 기능을 사용하려는 경우 선택합니다.',
    keyUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/api/pricing',
    guidePath: '/guide/api/openai',
    screenshot: { src: '/screenshots/openai-settings.webp', width: 768, height: 328 },
  },
  claude: {
    name: 'Anthropic Claude',
    shortName: 'Claude',
    initial: 'C',
    vendor: 'Anthropic',
    badge: '텍스트 문서작성',
    recommended: false,
    summary: 'Anthropic Claude 모델을 선호하며 일반 텍스트 문서작성 기능을 사용하려는 경우 선택합니다.',
    keyUrl: 'https://platform.claude.com/settings/keys',
    pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
    guidePath: '/guide/api/claude',
    screenshot: { src: '/screenshots/claude-settings.webp', width: 771, height: 332 },
  },
} as const;

export const PROVIDER_LIST = PROVIDER_KEYS.map((key) => ({ key, ...PROVIDERS[key] }));

const DEV_SITE_URL = 'http://localhost:3000';

/**
 * 공개 사이트 주소. canonical·OG·sitemap·robots에 그대로 쓰이므로 배포 빌드에서는
 * NEXT_PUBLIC_SITE_URL이 반드시 필요하다. (빌드 단계 검사는 vite.config.ts에서 한 번 더 한다.)
 * 개발 서버에서만 localhost로 대체한다.
 */
function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[JJSS website] NEXT_PUBLIC_SITE_URL이 설정되지 않았습니다. 배포 도메인(예: https://example.com)을 환경변수로 지정한 뒤 다시 빌드하세요. ' +
        '설정하지 않으면 canonical·Open Graph·sitemap·robots 주소가 localhost로 배포됩니다.',
    );
  }
  return DEV_SITE_URL;
}

export const SITE = {
  title: 'JJSS | 직업재활 실무를 위한 AI 업무지원 시스템',
  description:
    'JJSS는 직업재활상담사와 장애인 고용·직업재활 실무자를 위한 업무지원 프로그램입니다. 상담, 사례관리, 직업재활계획서, 직업평가, 사업체 관리, 예산 및 AI 문서작성을 하나의 프로그램에서 지원합니다.',
  url: resolveSiteUrl(),
  googleVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  naverVerification: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION,
} as const;

export function absoluteUrl(path = '/') {
  return new URL(path, `${SITE.url}/`).toString();
}
