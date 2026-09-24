import type { Metadata } from 'next';
import { ProviderGuide } from '@/components/ProviderGuide';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Claude API Key 발급·설정 | JJSS 가이드',
  description: 'Anthropic Claude Platform 공식 사이트에서 API Key를 발급하고 JJSS에 입력한 뒤 기본 AI 모델을 Claude로 선택하는 7단계 가이드입니다.',
  path: '/guide/api/claude',
});

export default function ClaudeGuidePage() {
  return <ProviderGuide
    providerKey="claude"
    eyebrow="CLAUDE API GUIDE"
    headline="Anthropic Claude API Key"
    introduction="Anthropic Claude 모델을 선호하며 JJSS의 일반 텍스트 문서작성 기능을 사용하려는 경우 선택합니다. Key 발급과 사용량 관리는 Claude Platform에서 진행합니다."
    keyMask="sk-ant-••••••••••••••••••"
    recommendedFor={['Claude 모델로 문서를 작성하려는 경우', '이미 Claude Platform API를 사용하는 경우', '일반 텍스트 AI 기능이 필요한 경우']}
    cautions={['요금과 사용 한도는 Claude Platform에서 확인해야 합니다.', 'Key 입력 후 기본 AI 모델도 Claude로 직접 선택합니다.', 'Gemini 전용 기능에는 대신 사용할 수 없을 수 있습니다.']}
    selectModelNote="설정의 기본 AI 모델 카드에서 Claude 모델을 직접 선택합니다."
  />;
}
