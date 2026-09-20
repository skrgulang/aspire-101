import React from 'react';
import { ImageResponse } from 'next/og';
import { aspireLogo } from '../logo';

export const dynamic = 'force-static';

export async function GET() {
  return new ImageResponse(
    React.createElement(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0b0a'
        }
      },
      React.createElement('img', {
        src: aspireLogo,
        width: 512,
        height: 512,
        style: { width: '512px', height: '512px', objectFit: 'cover' }
      })
    ),
    { width: 512, height: 512 }
  );
}
