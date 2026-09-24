import { JJSS } from '@/src/config/jjss';

export const FAQ_CATEGORIES = [
  { id: 'general', title: 'JJSS 시작하기', description: '프로그램 대상과 설치, 기본 사용' },
  { id: 'api', title: 'API Key와 Provider', description: 'Gemini, OpenAI, Claude 선택과 연결' },
  { id: 'cost', title: '비용과 호출 보호', description: 'API 요금, 결제와 반복 호출' },
  { id: 'privacy', title: '개인정보와 데이터', description: 'AI 전송, 로컬 저장과 Key 보관' },
  { id: 'install', title: '설치·백업·업데이트', description: 'Windows, 백업, 복원과 파일 출력' },
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]['id'];

export type FaqItem = {
  id: string;
  category: FaqCategory;
  /** 홈 FAQ 미리보기에 노출 */
  featured?: boolean;
  question: string;
  answer: string;
  link?: { href: string; label: string };
};

export const FAQS: FaqItem[] = [
  {
    id: 'what-is-jjss',
    category: 'general',
    featured: true,
    question: 'JJSS는 무엇인가요?',
    answer:
      'JJSS는 직업재활상담사와 장애인 고용·직업재활 실무자의 상담, 사례관리, 직업재활계획, 직업평가, 사업체·예산 관리와 문서작성을 지원하는 Windows 설치형 프로그램입니다. AI는 기록과 문서 초안을 보조하며 담당자의 판단을 대신하지 않습니다.',
    link: { href: '/features', label: '주요 기능 보기' },
  },
  {
    id: 'who-uses',
    category: 'general',
    featured: true,
    question: '누가 사용할 수 있나요?',
    answer:
      '직업재활상담사, 장애인복지관 고용지원 담당자, 직업재활기관 실무자 등 직업재활 관련 업무를 수행하는 사용자를 중심으로 설계되었습니다.',
  },
  {
    id: 'is-free',
    category: 'general',
    featured: true,
    question: 'JJSS는 무료인가요?',
    answer:
      '현재 JJSS v3.0.0 Windows 설치 파일은 공식 GitHub Release에서 별도 결제 없이 내려받을 수 있습니다. AI 기능을 사용할 때 발생할 수 있는 각 AI 회사의 API 이용료는 JJSS와 별개입니다.',
    link: { href: '/download', label: '공식 다운로드' },
  },
  {
    id: 'api-required',
    category: 'general',
    featured: true,
    question: 'API Key가 꼭 필요한가요?',
    answer:
      '아닙니다. 이용자·사업체·예산 관리, 일반 기록, 문서 저장, 백업·복원 등 비AI 기능은 API Key 없이 사용할 수 있습니다. AI 문서작성·분석 기능을 실행할 때는 사용하려는 AI 서비스의 Key가 필요합니다.',
    link: { href: '/guide/api', label: 'API Key 쉽게 이해하기' },
  },
  {
    id: 'all-providers',
    category: 'api',
    featured: true,
    question: 'Gemini, OpenAI, Claude Key를 모두 등록해야 하나요?',
    answer:
      '아닙니다. 일반 AI 문서 기능은 사용하려는 서비스 하나의 Key만 등록해 시작할 수 있습니다. 다만 일부 첨부파일·이미지·직업평가 기능은 Gemini가 필요할 수 있습니다.',
  },
  {
    id: 'gemini-only',
    category: 'api',
    featured: true,
    question: 'Gemini API Key만 있어도 되나요?',
    answer:
      '네. JJSS의 기본 AI 제공업체는 Gemini이며 일반 AI 기능을 시작할 수 있습니다. 일부 첨부파일 분석·이미지·직업평가 기능도 Gemini를 기준으로 동작합니다. 이미지 OCR 일부는 별도 Google Vision Key 경로를 사용할 수 있습니다.',
    link: { href: '/guide/api/gemini', label: 'Gemini 설정 가이드' },
  },
  {
    id: 'openai-claude-only',
    category: 'api',
    question: 'OpenAI 또는 Claude Key만 있어도 되나요?',
    answer:
      '일반 텍스트 문서작성 기능은 선택한 제공업체로 사용할 수 있습니다. Key를 입력한 뒤 설정의 기본 AI 모델도 같은 제공업체로 선택하세요. Gemini 전용 첨부파일 분석·이미지·직업평가 기능은 사용할 수 없을 수 있습니다.',
  },
  {
    id: 'chatgpt-plus',
    category: 'api',
    question: 'ChatGPT Plus를 사용하는데 OpenAI API Key를 별도로 발급해야 하나요?',
    answer:
      '네. ChatGPT 구독과 OpenAI API는 별도 서비스·과금 체계입니다. JJSS에서 OpenAI 기능을 사용하려면 OpenAI Platform에서 API Key를 만들고 API 사용 가능 상태를 확인해야 합니다.',
    link: { href: '/guide/api/openai', label: 'OpenAI 설정 가이드' },
  },
  {
    id: 'gemini-free',
    category: 'api',
    question: 'Gemini API는 무료인가요?',
    answer:
      '조건에 따른 무료 등급이 제공될 수 있지만 모든 모델과 사용량이 항상 무료인 것은 아닙니다. 지역, 모델, 한도, 데이터 처리 정책이 달라질 수 있으므로 실행 전 Google의 공식 가격 페이지와 계정 상태를 확인하세요.',
  },
  {
    id: 'api-cost',
    category: 'cost',
    question: 'API 비용은 얼마나 나오나요?',
    answer:
      '선택한 AI 제공업체, 모델, 입력·출력 길이와 사용 횟수에 따라 달라집니다. 가격은 수시로 바뀔 수 있어 이 사이트에 숫자를 고정하지 않습니다. 각 회사의 공식 가격 페이지에서 현재 요금을 확인하세요.',
    link: { href: '/guide/api#cost', label: '비용 안내 보기' },
  },
  {
    id: 'automatic-payment',
    category: 'cost',
    question: 'JJSS가 자동으로 결제하거나 충전하나요?',
    answer:
      '아닙니다. JJSS는 결제수단 등록, 자동충전, 구독 변경을 수행하지 않습니다. 다만 JJSS에서 AI 요청을 실행하면 해당 제공업체 계정의 정책과 사용량에 따라 비용이 청구될 수 있습니다.',
  },
  {
    id: 'repeat-calls',
    category: 'cost',
    question: '버튼을 한 번 눌렀는데 API가 계속 호출되나요?',
    answer:
      'JJSS 3.0은 자동 재시도 기본 0회, 동일 제공업체 재방문 방지, 더블클릭 중복 차단, 화면 재렌더링 재호출 차단 등의 장치를 갖추고 있습니다. 자동 전환을 켠 경우에도 한 작업에서 최대 3개 제공업체를 각 1회 시도합니다. 이는 불필요한 반복 가능성을 줄이는 장치이며 비용이 발생하지 않는다는 보장은 아닙니다.',
  },
  {
    id: 'export-cost',
    category: 'cost',
    question: '문서를 PDF나 Word로 저장할 때도 API 비용이 발생하나요?',
    answer:
      '저장·복사·백업과 PDF·PNG·DOCX·CSV 출력 자체는 AI API를 호출하지 않습니다. 다만 저장하기 전에 새 AI 문서를 생성하거나 분석하는 단계에서는 API가 호출될 수 있습니다.',
  },
  {
    id: 'privacy-ai',
    category: 'privacy',
    question: '개인정보가 AI 회사로 전송되나요?',
    answer:
      'AI 기능을 실행하면 해당 작업에 필요한 입력 내용이나 첨부파일이 선택한 AI 제공업체로 전송될 수 있습니다. 민감정보는 기관 정책에 따라 필요한 범위로 최소화·비식별화하고, 기관의 개인정보보호 정책과 생성형 AI 이용지침을 확인한 뒤 사용하세요.',
    link: { href: '/guide/api#privacy', label: '개인정보 안내 보기' },
  },
  {
    id: 'local-data',
    category: 'privacy',
    question: '일반 업무 데이터는 어디에 저장되나요?',
    answer:
      '현재 앱은 IndexedDB 기반 로컬 데이터베이스를 사용해 사용자 PC에 업무 데이터를 저장합니다. 다만 AI 기능을 실행한 입력은 선택한 제공업체로 전송될 수 있으므로 모든 데이터가 항상 PC 안에만 머문다고 볼 수는 없습니다.',
  },
  {
    id: 'key-storage',
    category: 'privacy',
    question: 'API Key는 어디에 저장되나요?',
    answer:
      'JJSS 3.0 소스 기준 API Key는 AES-GCM 방식으로 암호화되어 사용자 PC의 IndexedDB에 저장됩니다. 백업 파일에서는 API Key가 제외됩니다. Key를 다른 사람에게 보내거나 화면 캡처에 노출하지 마세요.',
  },
  {
    id: 'website-key',
    category: 'privacy',
    question: '이 홈페이지에 API Key를 입력해야 하나요?',
    answer:
      '아닙니다. 이 홈페이지는 API Key 발급과 설정 방법만 설명하며 Key를 입력받거나 저장하지 않습니다. Key는 JJSS 데스크톱 프로그램의 설정 화면에만 입력하세요.',
  },
  {
    id: 'failover',
    category: 'privacy',
    question: 'AI 자동 전환은 무엇인가요?',
    answer:
      '선택한 AI 서비스가 일시적으로 사용할 수 없을 때 사용자가 미리 허용한 다른 서비스를 시도하는 기능입니다. 다른 회사로 같은 입력이 전송될 수 있으므로 다른 제공업체로의 자동 전환은 기본 OFF이며 직접 허용해야 켤 수 있습니다.',
  },
  {
    id: 'windows',
    category: 'install',
    question: 'Windows에서만 사용할 수 있나요?',
    answer:
      '현재 공식 JJSS v3.0 Release는 Windows x64 설치 파일만 제공합니다. macOS나 Linux용 공식 v3.0 설치 파일은 현재 Release에 포함되어 있지 않습니다.',
  },
  {
    id: 'internet',
    category: 'install',
    question: '인터넷 연결이 꼭 필요한가요?',
    answer:
      'AI 문서작성·분석과 외부 API 기능에는 인터넷 연결이 필요합니다. 로컬 데이터 관리나 기존 문서 확인처럼 외부 통신이 필요하지 않은 기능은 인터넷 없이 작동할 수 있지만 기능별 차이가 있을 수 있습니다.',
  },
  {
    id: 'update-data',
    category: 'install',
    question: '기존 JJSS 데이터는 업데이트 후 유지되나요?',
    answer:
      '업데이트 과정에서 기존 설정을 가능한 범위에서 유지하도록 구현되어 있지만, 설치 교체나 환경 변경에 따른 데이터 손실 가능성을 배제할 수는 없습니다. 업데이트 또는 재설치 전에 설정 화면에서 백업 파일을 만들고 별도 폴더에 보관하세요.',
    link: { href: '/guide#backup', label: '백업 안내 보기' },
  },
  {
    id: 'backup-contents',
    category: 'install',
    question: '백업 파일에는 무엇이 들어 있나요?',
    answer:
      '이용자, 사업체, 사례 문서, 지출, 직업훈련 기록 등이 포함될 수 있으며 개인정보도 들어갈 수 있습니다. API Key는 제외됩니다. 백업 파일은 외부에 공유하지 말고 안전하게 보관하세요.',
  },
  {
    id: 'restore',
    category: 'install',
    question: '복원하면 현재 데이터가 어떻게 되나요?',
    answer:
      '복원은 현재 데이터를 백업 파일 내용으로 덮어쓸 수 있습니다. 복원 전에 현재 상태를 다시 백업하고, 올바른 JJSS 백업 파일인지 확인하세요.',
  },
  {
    id: 'formats',
    category: 'install',
    question: 'PDF와 Word로 저장할 수 있나요?',
    answer:
      '직업재활계획서는 PDF, PNG, Word(DOCX)로 저장할 수 있습니다. 다른 기능의 출력 형식은 각 화면에 따라 다를 수 있습니다.',
  },
  {
    id: 'updates',
    category: 'install',
    question: '프로그램 업데이트는 어떻게 하나요?',
    answer:
      '업데이트 페이지 또는 공식 GitHub Release에서 새 버전을 확인하세요. 설치 전에 데이터를 백업하고 해당 릴리스의 설치 안내를 따르는 것을 권장합니다.',
    link: { href: '/updates', label: '업데이트 확인' },
  },
  {
    id: 'support',
    category: 'install',
    question: '오류가 나거나 기능을 제안하고 싶어요.',
    answer:
      'GitHub 계정이 있다면 JJSS Issues에 오류 상황과 재현 방법 또는 기능 제안을 남길 수 있습니다. API Key, 이용자 개인정보, 기관 내부 문서를 첨부하지 마세요.',
    link: { href: JJSS.issuesUrl, label: 'GitHub Issues 열기' },
  },
];
