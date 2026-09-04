const faqs = [
  ['What can I use Aspire for?', 'Everyday college needs: study help, classmates, rides, moving help, buying and selling, project teammates, local questions, campus life, and opportunities.'],
  ['Can I browse without an account?', 'Yes. The front page can show public requests and campus activity first. Posting, replying, claiming a request, and messaging require you to log in.'],
  ['Why does Aspire ask for my location?', 'Location is optional and is used to make nearby requests more relevant. You can skip it and choose a campus manually instead.'],
  ['What happened to Find a Match, My Claims, Quick Post, and chat?', 'Those ideas are still part of Aspire. The new front page introduces them more naturally: browse nearby, open a request, claim or reply, chat, and keep track of what you posted or accepted.'],
  ['Is Aspire only for new students?', 'No. Feeling at home is the mission, but Aspire should stay useful from move-in week through finals — and for upperclassmen who need help, people, projects, rides, or campus knowledge too.'],
  ['How is Aspire different from a group chat or marketplace?', 'Aspire starts with what you need. Instead of searching through scattered chats or separate apps, one request can reach the right part of your campus network and turn into a useful connection.']
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
