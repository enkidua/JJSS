import type { Metadata } from 'next';
import { ProviderGuide } from '@/components/ProviderGuide';
import { pageMetadata } from '@/src/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Gemini API Key 발급·설정 | JJSS 가이드',
  description: 'Google AI Studio 공식 사이트에서 Gemini API Key를 발급하고 JJSS 설정에 입력해 연결을 확인하는 7단계 가이드입니다.',
  path: '/guide/api/gemini',
});

export default function GeminiGuidePage() {
  return <ProviderGuide
    providerKey="gemini"
    eyebrow="GEMINI API GUIDE"
    headline="Google Gemini API Key"
    introduction="Gemini는 JJSS의 기본 AI 제공업체입니다. 일반 텍스트 문서작성뿐 아니라 일부 첨부파일 분석, 이미지와 직업평가 AI 기능에 필요할 수 있어 처음 시작할 때 먼저 안내하는 선택지입니다."
    keyMask="AIza••••••••••••••••••••••"
    recommendedFor={['JJSS를 처음 설정하는 경우', '첨부파일·이미지 기능도 확인하려는 경우', '직업평가 AI 분석을 사용하려는 경우']}
    cautions={['무료 등급과 한도는 모델·지역·정책에 따라 달라질 수 있습니다.', '일부 이미지 OCR은 별도 Google Vision Key 경로를 사용할 수 있습니다.', '업무 내용은 Gemini API로 전송될 수 있습니다.']}
    selectModelNote="JJSS 기본 Provider가 Gemini인지 확인합니다."
  />;
}
