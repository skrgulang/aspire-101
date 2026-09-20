import type { Metadata } from 'next';
import { aspireLogo } from '../logo';

const pageDescription =
  'Learn what Aspire 101 is, why it exists, how it helps college students connect around campus needs, and how it relates to Cloudora Labs, Inc.';

export const metadata: Metadata = {
  title: 'About Aspire 101 — A Campus Request & Connection Network',
  description: pageDescription,
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'website',
    url: 'https://aspires101.com/about',
    title: 'About Aspire 101',
    description: pageDescription,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Aspire 101' }]
  }
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': 'https://aspires101.com/about#webpage',
  url: 'https://aspires101.com/about',
  name: 'About Aspire 101',
  description: pageDescription,
  isPartOf: { '@id': 'https://aspires101.com/#website' },
  about: { '@id': 'https://aspires101.com/#organization' }
};

const logoStyle = { width: 42, height: 42, borderRadius: 12, objectFit: 'cover' as const };

export default function AboutPage() {
  return (
    <main className="legalPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="legalShell">
        <a className="legalBack" href="/" aria-label="Back to Aspire 101 home">← Aspire 101</a>

        <p className="eyebrow">ABOUT ASPIRE 101</p>
        <h1>Campus life works better<br />when the right people can find each other.</h1>
        <p className="legalLead">
          Aspire 101 is a campus request and connection network for college students. It brings everyday
          campus needs, responses, mutual connections, and coordination into one place.
        </p>

        <section>
          <h2>What Aspire 101 is</h2>
          <p>
            Aspire helps students post what they need, discover relevant campus activity, respond when they
            can help, and choose whether to connect. A request can lead to a study partner, a ride, a project
            teammate, an item exchange, local help, a campus answer, or another practical connection.
          </p>
        </section>

        <section>
          <h2>Why it exists</h2>
          <p>
            Everyday campus needs are often scattered across group chats, marketplaces, social feeds, and
            word of mouth. Aspire is designed around the request itself: what someone needs, where it matters,
            what kind of exchange it is, and who both sides actually choose to connect with.
          </p>
        </section>

        <section>
          <h2>How the connection model works</h2>
          <p>
            A response is interest, not an automatic match. The requester can choose whether to connect, and
            the responder can confirm. This mutual flow is intended to make private coordination more deliberate
            than an unsolicited message or a first-click claim.
          </p>
          <p style={{ marginTop: 12 }}>
            See the full flow on <a href="/how-it-works">How Aspire Works</a>.
          </p>
        </section>

        <section>
          <h2>More than a marketplace</h2>
          <p>
            Buying and selling is one part of Aspire, but the network is broader. Students can use it for study,
            rides, projects, gaming, campus questions, community help, paid help, shared-cost requests, and other
            everyday coordination. The common layer is a structured request and a mutual connection.
          </p>
        </section>

        <section>
          <h2>Campus identity, trust, and safety</h2>
          <p>
            Aspire can use school, account, or identity signals to add context around participation. Reporting,
            blocking, moderation, transaction context, and interaction-specific safety guidance are designed to
            give students more control. Verification is a signal, not a guarantee that a person is safe, qualified,
            licensed, or trustworthy.
          </p>
          <p style={{ marginTop: 12 }}>
            Learn more in the <a href="/safety">Safety Center</a> and <a href="/guidelines">Community Guidelines</a>.
          </p>
        </section>

        <section>
          <h2>A product of Cloudora Labs</h2>
          <p>
            Aspire 101 is a product of Cloudora Labs, Inc. Aspire’s product, community, safety, marketplace,
            and payment systems are developed as part of that company’s work on the platform.
          </p>
          <p style={{ marginTop: 12 }}>
            Business inquiries can be sent to <a href="mailto:business@aspires101.com">business@aspires101.com</a>.
          </p>
        </section>

        <section>
          <h2>Official Aspire 101 profiles</h2>
          <p>
            Follow Aspire 101 on <a href="https://www.instagram.com/aspire.101/" target="_blank" rel="noreferrer">Instagram</a>
            {' '}and <a href="https://www.linkedin.com/company/108901932/" target="_blank" rel="noreferrer">LinkedIn</a>.
            You can also join the <a href="https://discord.com/invite/sfKv7k9Sbt" target="_blank" rel="noreferrer">Aspire 101 Discord</a>.
          </p>
        </section>

        <section>
          <h2>Explore the product</h2>
          <p>
            Start with <a href="/how-it-works">How Aspire Works</a>, browse <a href="/discover">campus requests</a>,
            or return to the <a href="/">Aspire 101 homepage</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
