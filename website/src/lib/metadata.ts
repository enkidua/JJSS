import type { Metadata } from 'next';
import { absoluteUrl } from '@/src/config/jjss';

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(path);
  const image = absoluteUrl('/og.png');

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: 'JJSS',
      title,
      description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: 'JJSS 직업재활 실무를 위한 AI 업무지원 시스템' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
