import type { MetadataRoute } from 'next';

const baseUrl = 'https://aspires101.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/',
    '/ambassadors',
    '/guidelines',
    '/how-it-works',
    '/marketplace',
    '/marketplace-rules',
    '/privacy',
    '/resolution-policy',
    '/safety',
    '/terms',
    '/updates'
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.7
  }));
}
