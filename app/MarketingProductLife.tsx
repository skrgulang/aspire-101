'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const photos = [
  'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=640',
  'https://images.pexels.com/photos/7972533/pexels-photo-7972533.jpeg?auto=compress&cs=tinysrgb&w=640',
  'https://images.pexels.com/photos/5965683/pexels-photo-5965683.jpeg?auto=compress&cs=tinysrgb&w=640',
  'https://images.pexels.com/photos/6147369/pexels-photo-6147369.jpeg?auto=compress&cs=tinysrgb&w=640'
];

export default function MarketingProductLife() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.querySelector<HTMLElement>('.marketingProducts'));
  }, []);

  if (!target) return null;

  return createPortal(
    <>
      <div className="aspireProductLife" aria-hidden="true">
        <div className="aspirePhotoCloud">
          {photos.map((src, index) => (
            <figure className={`aspireFloatPhoto aspireFloatPhoto${index + 1}`} key={src}>
              <img src={src} alt="" />
            </figure>
          ))}
          <span className="aspirePhotoNote">REAL CAMPUS MOMENTS ♡</span>
        </div>

        <div className="aspireWalkTrack">
          <span className="aspireWalkLine" />
          <span className="aspireWalker">
            <svg viewBox="0 0 72 104" fill="none" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="40" cy="14" r="8" />
                <path d="M38 24c-5 12-7 24-4 36l5 16" />
                <path d="M35 38 19 53" />
                <path d="M36 38 54 48" />
                <path d="m39 76-15 21" />
                <path d="m40 76 17 19" />
                <path d="M28 31c-6 7-7 18-2 29" opacity=".72" />
                <rect x="16" y="35" width="12" height="26" rx="4" opacity=".55" />
              </g>
            </svg>
          </span>
          <span className="aspireWalkCaption">CAMPUS, IN MOTION →</span>
        </div>
      </div>

      <style>{`
        .marketingProducts {
          position: relative !important;
          isolation: isolate;
          overflow: hidden !important;
          padding-bottom: 170px !important;
        }
        .marketingProducts::before,
        .marketingProducts::after,
        .marketingProductGrid::before,
        .marketingProductGrid::after {
          content: none !important;
          display: none !important;
        }
        .marketingProducts > .marketingExpandHead,
        .marketingProducts > .marketingProductGrid {
          position: relative;
          z-index: 3;
        }
        .marketingProductGrid { margin-top: 38px !important; }
        .aspireProductLife {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          overflow: hidden;
        }
        .aspirePhotoCloud {
          position: absolute;
          top: 58px;
          right: max(30px, 4.6vw);
          width: min(560px, 37vw);
          height: 220px;
        }
        .aspireFloatPhoto {
          position: absolute;
          margin: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 18px;
          box-shadow: 0 22px 46px rgba(0,0,0,.42);
          background: #15120e;
          animation: aspireRealPhotoFloat 7s ease-in-out infinite;
        }
        .aspireFloatPhoto img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          filter: saturate(.92) contrast(1.03) brightness(.86);
        }
        .aspireFloatPhoto1 { width: 150px; height: 104px; left: 4px; top: 62px; transform: rotate(-7deg); animation-delay: -1.2s; }
        .aspireFloatPhoto2 { width: 166px; height: 114px; left: 128px; top: 12px; transform: rotate(4deg); animation-delay: -3.2s; }
        .aspireFloatPhoto3 { width: 142px; height: 98px; left: 272px; top: 78px; transform: rotate(-3deg); animation-delay: -5s; }
        .aspireFloatPhoto4 { width: 132px; height: 92px; right: 0; top: 26px; transform: rotate(7deg); animation-delay: -2.1s; }
        .aspirePhotoNote {
          position: absolute;
          right: 16px;
          bottom: 4px;
          color: rgba(255,194,28,.55);
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: 11px;
          letter-spacing: .06em;
        }
        .aspireWalkTrack {
          position: absolute;
          left: max(28px, 4.6vw);
          right: max(28px, 4.6vw);
          bottom: 24px;
          height: 118px;
        }
        .aspireWalkLine {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 24px;
          height: 2px;
          opacity: .48;
          background: repeating-linear-gradient(90deg, rgba(255,194,28,.75) 0 6px, transparent 6px 15px);
          mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent);
        }
        .aspireWalker {
          position: absolute;
          left: -70px;
          bottom: 22px;
          width: 64px;
          height: 94px;
          color: #ffc21c;
          filter: drop-shadow(0 0 14px rgba(255,194,28,.28));
          animation: aspireRealCampusWalk 13s linear infinite;
        }
        .aspireWalker svg { width: 100%; height: 100%; display: block; }
        .aspireWalkCaption {
          position: absolute;
          right: 0;
          bottom: 0;
          color: rgba(255,194,28,.46);
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: .06em;
        }
        @keyframes aspireRealPhotoFloat {
          0%,100% { translate: 0 0; }
          45% { translate: 0 -7px; }
          72% { translate: -2px -2px; }
        }
        @keyframes aspireRealCampusWalk {
          0% { transform: translate3d(0,0,0) rotate(-1deg); }
          12% { transform: translate3d(14vw,-3px,0) rotate(1deg); }
          24% { transform: translate3d(28vw,1px,0) rotate(-1deg); }
          36% { transform: translate3d(42vw,-3px,0) rotate(1deg); }
          48% { transform: translate3d(56vw,1px,0) rotate(-1deg); }
          60% { transform: translate3d(70vw,-3px,0) rotate(1deg); }
          72% { transform: translate3d(84vw,1px,0) rotate(-1deg); }
          84% { transform: translate3d(98vw,-3px,0) rotate(1deg); }
          100% { transform: translate3d(118vw,0,0) rotate(-1deg); }
        }
        @media (max-width: 1050px) {
          .aspirePhotoCloud { width: 370px; height: 180px; top: 72px; right: 26px; opacity: .86; }
          .aspireFloatPhoto1 { width: 112px; height: 78px; }
          .aspireFloatPhoto2 { width: 124px; height: 86px; left: 98px; }
          .aspireFloatPhoto3 { width: 108px; height: 74px; left: 205px; }
          .aspireFloatPhoto4 { width: 98px; height: 70px; }
        }
        @media (max-width: 820px) {
          .marketingProducts { padding-bottom: 98px !important; }
          .marketingProductGrid { margin-top: 18px !important; }
          .aspirePhotoCloud {
            position: relative;
            top: auto;
            right: auto;
            width: min(100% - 32px, 430px);
            height: 160px;
            margin: 150px 16px 0 auto;
          }
          .aspireWalkTrack { display: none; }
          .aspireFloatPhoto4 { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aspireFloatPhoto,
          .aspireWalker { animation: none; }
        }
      `}</style>
    </>,
    target
  );
}
