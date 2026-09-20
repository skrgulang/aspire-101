import type { Metadata } from 'next';
import { aspireLogo } from '../logo';

const pageDescription =
  'Learn how Aspire 101 helps college students post campus needs, find people who can help, mutually connect, coordinate safely, and handle marketplace or paid interactions.';

export const metadata: Metadata = {
  title: 'How Aspire 101 Works — Campus Requests, Matching & Connections',
  description: pageDescription,
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    type: 'website',
    url: 'https://aspires101.com/how-it-works',
    title: 'How Aspire 101 Works',
    description: pageDescription
  }
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': 'https://aspires101.com/how-it-works#webpage',
  url: 'https://aspires101.com/how-it-works',
  name: 'How Aspire 101 Works',
  description: pageDescription,
  isPartOf: { '@id': 'https://aspires101.com/#website' },
  about: { '@id': 'https://aspires101.com/#organization' }
};

const logoStyle = { width: 38, height: 38, borderRadius: 11, objectFit: 'cover' as const };

export default function HowItWorksPage() {
  return (
    <main className="legalPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="legalShell">
        <a className="legalBack" href="/" aria-label="Back to Aspire 101 home">
          ← Aspire 101
        </a>

        <p className="eyebrow">HOW ASPIRE 101 WORKS</p>
        <h1>Ask campus.<br />Choose who fits.<br />Connect.</h1>
        <p className="legalLead">
          Aspire 101 is a campus request and connection network for college students. It helps students
          post everyday needs, discover people who can help, choose who they want to connect with, and
          coordinate the interaction in one place.
        </p>

        <section>
          <h2>What is Aspire 101?</h2>
          <p>
            Aspire 101 is built around a simple idea: campus life creates hundreds of small needs that
            are easier to solve when the right students can find each other. A student can post what
            they need, browse relevant campus activity, respond to someone else, and turn that request
            into a real connection.
          </p>
          <p style={{ marginTop: 12 }}>
            Aspire is not limited to one kind of interaction. The same network can support study partners,
            rides, project teammates, local questions, moving help, buying and selling, gaming, community
            help, and other practical campus coordination.
          </p>
        </section>

        <section>
          <h2>1. Post what you need</h2>
          <p>
            A request starts with context: what you need, where it matters, and what kind of exchange it is.
            For example, a student might ask for a ride to the airport, look for a Math study partner, sell
            an item, find a teammate, or ask for help with a campus question.
          </p>
        </section>

        <section>
          <h2>2. See who fits</h2>
          <p>
            Other students can discover relevant requests and respond when they are interested. A response
            shows interest; it does not automatically create a commitment. This keeps the requester in control
            of who they want to continue with.
          </p>
        </section>

        <section>
          <h2>3. Choose each other</h2>
          <p>
            Aspire is designed around mutual choice. The requester can decide whether to connect with a
            responder, and the responder can confirm. Private coordination can then open from that accepted
            connection instead of beginning with an unsolicited message.
          </p>
        </section>

        <section>
          <h2>4. Coordinate and get it done</h2>
          <p>
            Once connected, students can use the request context to coordinate details such as time, place,
            scope, price, transportation, or meetup expectations. When money or an item exchange is involved,
            the important transaction details should be clear before the interaction moves forward.
          </p>
        </section>

        <section>
          <h2>What can students use Aspire for?</h2>
          <ul>
            <li><strong>Study:</strong> find classmates, study partners, and people working on similar courses or projects.</li>
            <li><strong>Rides:</strong> coordinate airport rides, pickups, and other transportation needs.</li>
            <li><strong>Marketplace:</strong> buy and sell items within a campus-oriented network.</li>
            <li><strong>Projects:</strong> find collaborators, teammates, and people with complementary skills.</li>
            <li><strong>Campus life:</strong> find people for activities, gaming, events, questions, and everyday help.</li>
            <li><strong>Paid or shared-cost help:</strong> coordinate clearly labeled interactions when money is part of the request.</li>
          </ul>
        </section>

        <section>
          <h2>How is Aspire different from a group chat?</h2>
          <p>
            Group chats are organized around conversations. Aspire is organized around requests and context.
            Instead of searching through unrelated messages, students can see what someone needs, the type of
            interaction, and whether they actually want to connect before a private conversation begins.
          </p>
        </section>

        <section>
          <h2>How is Aspire different from a marketplace?</h2>
          <p>
            Buying and selling is one use case, not the whole product. Aspire can also support rides, study,
            projects, community help, campus questions, paid help, shared costs, and social connections. The
            common layer is the request-and-match flow rather than a catalog of products alone.
          </p>
        </section>

        <section>
          <h2>Campus identity and verification</h2>
          <p>
            Aspire can use school, account, or identity signals to add context around who is participating.
            Those signals can make campus interactions easier to understand, but verification is a signal,
            not a guarantee that a person is safe, qualified, licensed, or trustworthy.
          </p>
        </section>

        <section>
          <h2>Safety and control</h2>
          <p>
            Students decide whom to respond to and whom to connect with. Aspire also provides reporting,
            blocking, moderation, and interaction-specific safety guidance. Serious safety issues are handled
            separately from ordinary reviews or reputation signals.
          </p>
          <p style={{ marginTop: 12 }}>
            Read the <a href="/safety">Safety Center</a> and <a href="/guidelines">Community Guidelines</a> for more detail.
          </p>
        </section>

        <section>
          <h2>When money is involved</h2>
          <p>
            Aspire distinguishes community help from paid help, split-cost requests, and marketplace exchanges.
            Where in-product payments are available, transaction status, completion, cancellation, refunds, and
            seller or provider payouts follow the rules shown for that flow.
          </p>
          <p style={{ marginTop: 12 }}>
            See the <a href="/marketplace-rules">Marketplace Rules</a>, <a href="/resolution-policy">Resolution Policy</a>,
            and <a href="/terms">Terms of Service</a>.
          </p>
        </section>

        <section>
          <h2>The short version</h2>
          <p>
            Aspire 101 helps college students turn a campus need into a clear request, find relevant people,
            mutually choose a connection, and coordinate what happens next. The goal is to make everyday campus
            help easier to discover without turning every interaction into an open group chat or a generic marketplace.
          </p>
        </section>

        <section>
          <h2>Start exploring Aspire 101</h2>
          <p>
            You can <a href="/discover">browse requests</a>, <a href="/signup">join Aspire</a>, or return to the
            <a href="/"> Aspire 101 homepage</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
