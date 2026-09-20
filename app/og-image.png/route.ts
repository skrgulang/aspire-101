import React from 'react';
import { ImageResponse } from 'next/og';
import { aspireLogo } from '../logo';

export const dynamic = 'force-static';

export async function GET() {
  const brand = React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center' } },
    React.createElement('img', {
      src: aspireLogo,
      width: 76,
      height: 76,
      style: { width: '76px', height: '76px', borderRadius: '20px' }
    }),
    React.createElement(
      'div',
      { style: { marginLeft: '22px', fontSize: '36px', fontWeight: 800, color: '#f5efe5' } },
      'Aspire 101'
    )
  );

  const content = React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '66px 76px',
        background: '#0b0b0a',
        color: '#f5efe5',
        fontFamily: 'Arial, Helvetica, sans-serif'
      }
    },
    brand,
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', maxWidth: '980px' } },
      React.createElement(
        'div',
        { style: { fontSize: '72px', lineHeight: 1.02, fontWeight: 800, letterSpacing: '-3px' } },
        'Ask campus. Feel at home.'
      ),
      React.createElement(
        'div',
        { style: { marginTop: '28px', fontSize: '30px', lineHeight: 1.35, color: '#bfb7aa' } },
        'Campus requests, mutual connections, marketplace exchanges, study, rides, projects, and everyday help.'
      )
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', fontSize: '23px', color: '#d2a71c' } },
      'aspires101.com'
    )
  );

  return new ImageResponse(content, { width: 1200, height: 630 });
}
