import type { Metadata } from 'next';
import { ProviderGuide } from '@/components/ProviderGuide';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'OpenAI API Key 발급·설정 | JJSS 가이드',
  description: 'OpenAI Platform 공식 사이트에서 API Key를 발급하고 JJSS에 입력한 뒤 기본 AI 모델을 OpenAI로 선택하는 7단계 가이드입니다.',
  path: '/guide/api/openai',
});

export default function OpenAIGuidePage() {
  return <ProviderGuide
    providerKey="openai"
    eyebrow="OPENAI API GUIDE"
    headline="OpenAI API Key"
    introduction="OpenAI API의 GPT 모델로 JJSS의 일반 텍스트 문서작성 기능을 사용하려는 경우 선택합니다. ChatGPT Plus 같은 ChatGPT 구독과 OpenAI API는 별도 서비스·과금 체계입니다."
    keyMask="sk-••••••••••••••••••••••"
    recommendedFor={['OpenAI API 모델로 문서를 작성하려는 경우', '이미 OpenAI Platform API 계정을 사용하는 경우', '일반 텍스트 AI 기능이 필요한 경우']}
    cautions={['ChatGPT 구독만으로는 JJSS OpenAI API 기능을 사용할 수 없습니다.', 'OpenAI Platform에서 API 결제·사용량 상태를 별도로 확인해야 합니다.', 'Gemini 전용 기능에는 대신 사용할 수 없을 수 있습니다.']}
    selectModelNote="설정의 기본 AI 모델 카드에서 OpenAI 모델을 직접 선택합니다."
  />;
}
