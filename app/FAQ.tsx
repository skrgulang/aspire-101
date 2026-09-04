const faqs = [
  ['What can I use Aspire for?', 'Everyday college needs: study help, classmates, rides, moving help, buying and selling, project teammates, local questions, campus life, and opportunities.'],
  ['Can I browse without an account?', 'Yes. Public requests and campus activity can be browsed first. Posting, responding, connecting, private chat, and reviews require you to log in.'],
  ['How does a connection actually happen?', 'There is no instant first-click claim. Someone responds to a request, the requester chooses whether they want to connect, and the responder confirms. Private chat opens from that accepted connection.'],
  ['What changes when money is involved?', 'Aspire should clearly label paid help, split-cost requests, and buying or selling. Before the interaction is marked in progress, both sides should confirm the important details such as amount, scope, timing, and meetup expectations.'],
  ['Does everyone get one star rating?', 'No. We are moving toward a contextual Trust Passport instead of one giant score. It can show completed connections, whether people would connect again, useful behavior tags, and the types of interactions that created that reputation. New members simply show New to Aspire.'],
  ['What if something is unsafe or illegal?', 'That is a safety issue, not a rating issue. Harassment, threats, scams, violence, illegal activity, or serious misconduct should go through reporting and moderation. Emergencies should be handled by campus or local emergency services.'],
  ['Why does Aspire ask for my location?', 'Location is optional and helps make nearby requests more relevant. You can deny it and choose a campus manually. Precise location should not be exposed publicly just because you browsed or posted.'],
  ['How is Aspire different from a group chat or marketplace?', 'Aspire starts with context: what you need, where it matters, and what kind of exchange it is. One request can become an answer, paid help, a shared cost, an item exchange, a teammate, or a new connection without digging through unrelated chats.']
];

export default function FAQ() {
  return (
    <section id="faq" className="faqSection shell">
      <div className="faqIntro">
        <p className="eyebrow">QUESTIONS BEFORE YOU START?</p>
        <h2>The last stop before your own request.</h2>
        <p>By here, you’ve seen the journey. These are the product rules students should understand before jumping in.</p>
      </div>
      <div className="faqList">
        {faqs.map(([question, answer], index) => (
          <details key={question} open={index === 0}>
            <summary><span>{String(index + 1).padStart(2, '0')}</span>{question}<b>+</b></summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
