import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/moderator/', '/ui-preview/']
    },
    sitemap: 'https://aspires101.com/sitemap.xml',
    host: 'https://aspires101.com'
  };
}
