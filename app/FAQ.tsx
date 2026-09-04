const faqs = [
  ['What can I use Aspire for?', 'Everyday college needs: study help, classmates, rides, moving help, buying and selling, project teammates, local questions, campus life, and opportunities.'],
  ['Can I browse without an account?', 'Yes. Public requests and campus activity can be browsed first. Posting, responding, accepting a connection, and private messaging require you to log in.'],
  ['How does matching work?', 'Someone responds to a request instead of instantly claiming it. The requester chooses who they want to connect with, and either person can step away before confirming. Private chat starts from that accepted connection.'],
  ['Can anyone message me?', 'Not by default. Aspire is designed around context-first conversations. A private chat should begin from a real request or connection instead of random unsolicited DMs.'],
  ['Does everyone get a rating?', 'Every registered account can build one reputation because the same student may ask for help one day and help someone else the next. New accounts start as “New to Aspire,” and reputation appears only after real completed connections.'],
  ['How do reviews work?', 'Reviews are two-way. Both students can review the experience after a completed connection. The product direction is to use blind or delayed reviews so one person cannot easily retaliate after seeing the other person’s review.'],
  ['What if someone is unsafe or breaks the rules?', 'Ratings are for normal experience quality. Harassment, threats, scams, violence, illegal activity, or serious safety issues should be reported to Aspire for moderation. For emergencies or imminent danger, contact local authorities or campus emergency services.'],
  ['Why does Aspire ask for my location?', 'Location is optional and is used to make nearby requests more relevant. You can skip it and choose a campus manually instead. Precise addresses should not be exposed publicly just because location is enabled.'],
  ['Is Aspire only for new students?', 'No. Feeling at home is the mission, but Aspire should stay useful from move-in week through finals — and for upperclassmen who need help, people, projects, rides, or campus knowledge too.'],
  ['How is Aspire different from a group chat or marketplace?', 'Aspire starts with what you need. Instead of searching through scattered chats or separate apps, one request can reach the right part of your campus network and turn into a useful connection with accountability on both sides.']
];

export default function FAQ() {
  return (
    <section id="faq" className="faqSection shell">
      <div className="faqIntro">
        <p className="eyebrow">QUESTIONS BEFORE YOU START?</p>
        <h2>The last stop before your own request.</h2>
        <p>By here, you’ve seen the journey. These are the things students usually want to know before jumping in.</p>
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
