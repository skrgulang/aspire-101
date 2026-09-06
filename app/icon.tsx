import { ImageResponse } from 'next/og';
import { aspireLogo } from './logo';

export const size = {
  width: 64,
  height: 64
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d0c09',
          borderRadius: 14,
          overflow: 'hidden'
        }}
      >
        <img
          src={aspireLogo}
          alt=""
          width="64"
          height="64"
          style={{ objectFit: 'cover' }}
        />
      </div>
    ),
    size
  );
}
