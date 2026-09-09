import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aspire 101',
    short_name: 'Aspire 101',
    description: 'A verified campus request network for students.',
    start_url: '/post',
    display: 'standalone',
    background_color: '#090907',
    theme_color: '#090907',
    icons: [
      {
        src: '/aspire-app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml'
      }
    ]
  };
}
