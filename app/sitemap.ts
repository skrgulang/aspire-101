import type { MetadataRoute } from 'next';

const baseUrl = 'https://aspires101.com';

const publicRoutes: Array<{
  path: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/ambassadors', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/intelligence', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/updates', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/safety', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/guidelines', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/marketplace-rules', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/resolution-policy', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.4 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency,
    priority
  }));
}
