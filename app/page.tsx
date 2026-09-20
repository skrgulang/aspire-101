import MarketingHome from './MarketingHome';
import GlobalJourney from './GlobalJourney';
import FAQ from './FAQ';

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What can I use Aspire for?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Everyday college needs: study help, classmates, rides, moving help, buying and selling, project teammates, local questions, campus life, and opportunities.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can I browse without an account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Public requests and campus activity can be browsed first. Posting, responding, connecting, private chat, and reviews require you to log in.'
      }
    },
    {
      '@type': 'Question',
      name: 'How does a connection actually happen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'There is no instant first-click claim. Someone responds to a request, the requester chooses whether they want to connect, and the responder confirms. Private chat opens from that accepted connection.'
      }
    },
    {
      '@type': 'Question',
      name: 'What changes when money is involved?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Aspire clearly labels paid help, split-cost requests, and buying or selling. Before the interaction is marked in progress, both sides confirm important details such as amount, scope, timing, and meetup expectations.'
      }
    },
    {
      '@type': 'Question',
      name: 'Does everyone get one star rating?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Aspire uses contextual trust information instead of one giant score, including completed connections, whether people would connect again, useful behavior tags, and the types of interactions that created that reputation.'
      }
    },
    {
      '@type': 'Question',
      name: 'What if something is unsafe or illegal?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Harassment, threats, scams, violence, illegal activity, or serious misconduct should go through reporting and moderation. Emergencies should be handled by campus or local emergency services.'
      }
    },
    {
      '@type': 'Question',
      name: 'Why does Aspire ask for my location?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Location is optional and helps make nearby requests more relevant. Students can deny it and choose a campus manually. Precise location is not exposed publicly just because someone browsed or posted.'
      }
    },
    {
      '@type': 'Question',
      name: 'How is Aspire different from a group chat or marketplace?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Aspire starts with context: what you need, where it matters, and what kind of exchange it is. One request can become an answer, paid help, a shared cost, an item exchange, a teammate, or a new connection without digging through unrelated chats.'
      }
    }
  ]
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="journeyWorld">
        <GlobalJourney />
        <MarketingHome />
      </div>
      <FAQ />
    </>
  );
}
