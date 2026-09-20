import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/account/',
        '/activity',
        '/campus',
        '/connections',
        '/demo',
        '/discover',
        '/forgot-password',
        '/login',
        '/moderator',
        '/money',
        '/people/',
        '/post',
        '/profile',
        '/resolution',
        '/saved',
        '/settings',
        '/signup',
        '/transactions',
        '/ui-preview',
        '/update-password'
      ]
    },
    sitemap: 'https://aspires101.com/sitemap.xml',
    host: 'https://aspires101.com'
  };
}
