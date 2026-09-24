import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/src/config/jjss';

const routes = [
  { path: '/', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/features', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/guide', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/guide/start', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/guide/api', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/guide/api/gemini', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/guide/api/openai', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/guide/api/claude', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/download', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/updates', priority: 0.8, changeFrequency: 'weekly' as const },
  { path: '/faq', priority: 0.9, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-08-28T00:00:00+09:00');
  return routes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    alternates: { languages: { ko: absoluteUrl(route.path) } },
  }));
}
