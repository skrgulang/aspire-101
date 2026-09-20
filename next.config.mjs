const development = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com https://q.stripe.com https://api2.amplitude.com https://browser-intake-datadoghq.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  development ? '' : 'upgrade-insecure-requests'
].filter(Boolean).join('; ');

const noIndexRoutes = [
  '/account/:path*',
  '/activity/:path*',
  '/admin/:path*',
  '/connections/:path*',
  '/delivery/:path*',
  '/forgot-password',
  '/intelligence/:path*',
  '/login',
  '/marketplace/sell',
  '/moderator/:path*',
  '/money/:path*',
  '/post/:path*',
  '/resolution/:path*',
  '/saved/:path*',
  '/settings/:path*',
  '/signup',
  '/transactions/:path*',
  '/ui-preview/:path*',
  '/update-password'
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/signin',
        has: [{ type: 'host', value: 'www.aspires101.com' }],
        destination: 'https://aspires101.com/login',
        permanent: true
      },
      {
        source: '/signin.html',
        has: [{ type: 'host', value: 'www.aspires101.com' }],
        destination: 'https://aspires101.com/login',
        permanent: true
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.aspires101.com' }],
        destination: 'https://aspires101.com/:path*',
        permanent: true
      },
      {
        source: '/signin',
        destination: '/login',
        permanent: true
      },
      {
        source: '/signin.html',
        destination: '/login',
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), browsing-topics=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
        ]
      },
      ...noIndexRoutes.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
      }))
    ];
  }
};

export default nextConfig;
