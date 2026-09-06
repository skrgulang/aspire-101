'use client';

const photos = [
  'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=760',
  'https://images.pexels.com/photos/7972533/pexels-photo-7972533.jpeg?auto=compress&cs=tinysrgb&w=760',
  'https://images.pexels.com/photos/5965683/pexels-photo-5965683.jpeg?auto=compress&cs=tinysrgb&w=760',
  'https://images.pexels.com/photos/6147369/pexels-photo-6147369.jpeg?auto=compress&cs=tinysrgb&w=760'
];

export default function MarketingProductLife() {
  return (
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
          padding-bottom: 178px !important;
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
        .marketingProductGrid { margin-top: 42px !important; }
        .aspireProductLife {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          overflow: hidden;
        }
        .aspirePhotoCloud {
          position: absolute;
          top: 54px;
          right: max(34px, 4.6vw);
          width: min(570px, 38vw);
          height: 236px;
        }
        .aspireFloatPhoto {
          position: absolute;
          margin: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 18px;
          box-shadow: 0 24px 54px rgba(0,0,0,.48);
          background: #15120e;
          animation: aspireRealPhotoFloat 6.8s ease-in-out infinite;
        }
        .aspireFloatPhoto img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          filter: saturate(.95) contrast(1.05) brightness(.9);
        }
        .aspireFloatPhoto1 { width: 172px; height: 118px; left: 0; top: 78px; transform: rotate(-7deg); animation-delay: -1.2s; }
        .aspireFloatPhoto2 { width: 188px; height: 128px; left: 138px; top: 4px; transform: rotate(4deg); animation-delay: -3.2s; }
        .aspireFloatPhoto3 { width: 160px; height: 110px; left: 300px; top: 94px; transform: rotate(-3deg); animation-delay: -5s; }
        .aspireFloatPhoto4 { width: 144px; height: 100px; right: 0; top: 34px; transform: rotate(7deg); animation-delay: -2.1s; }
        .aspirePhotoNote {
          position: absolute;
          right: 18px;
          bottom: 2px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,194,28,.12);
          color: rgba(255,194,28,.82);
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: 12px;
          letter-spacing: .05em;
        }
        .aspireWalkTrack {
          position: absolute;
          left: max(28px, 4.6vw);
          right: max(28px, 4.6vw);
          bottom: 18px;
          height: 122px;
        }
        .aspireWalkLine {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 24px;
          height: 2px;
          opacity: .55;
          background: repeating-linear-gradient(90deg, rgba(255,194,28,.78) 0 7px, transparent 7px 16px);
          mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
        }
        .aspireWalker {
          position: absolute;
          left: -74px;
          bottom: 21px;
          width: 70px;
          height: 102px;
          color: #ffc21c;
          filter: drop-shadow(0 0 18px rgba(255,194,28,.35));
          animation: aspireRealCampusWalk 13s linear infinite;
        }
        .aspireWalker svg { width: 100%; height: 100%; display: block; }
        .aspireWalkCaption {
          position: absolute;
          right: 0;
          bottom: 0;
          color: rgba(255,194,28,.56);
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: .06em;
        }
        @keyframes aspireRealPhotoFloat {
          0%,100% { translate: 0 0; }
          45% { translate: 0 -8px; }
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
        @media (max-width: 1220px) {
          .aspirePhotoCloud { width: 410px; height: 190px; top: 66px; right: 28px; }
          .aspireFloatPhoto1 { width: 126px; height: 86px; top: 68px; }
          .aspireFloatPhoto2 { width: 138px; height: 94px; left: 104px; }
          .aspireFloatPhoto3 { width: 118px; height: 82px; left: 226px; top: 78px; }
          .aspireFloatPhoto4 { width: 106px; height: 76px; }
        }
        @media (max-width: 900px) {
          .marketingProducts { padding-bottom: 108px !important; }
          .marketingProductGrid { margin-top: 18px !important; }
          .aspirePhotoCloud {
            display: none;
          }
          .aspireWalkTrack { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aspireFloatPhoto,
          .aspireWalker { animation: none; }
        }
      `}</style>
    </>
  );
}
