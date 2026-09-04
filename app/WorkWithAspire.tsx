const campuses = [
  {
    school: 'UC Berkeley',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sather%20gate%20berkeley.jpg?width=900',
    credit: 'Mizzlbrd · CC BY-SA 4.0'
  },
  {
    school: 'UCLA',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Royce%20Hall.jpg?width=900',
    credit: 'Eric Chan · CC BY 2.0'
  },
  {
    school: 'UC Davis',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/UC%20Davis%20campus%20buildings%20and%20scenes%20%2816188061937%29.jpg?width=900',
    credit: 'UC Davis Arboretum · CC BY 2.0'
  },
  {
    school: 'UC Irvine',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Uc%20Irvine%20Campus%20%28108521889%29.jpeg?width=900',
    credit: 'Claudia Caro Sullivan · CC BY-SA 3.0'
  },
  {
    school: 'UC San Diego',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/UC%20San%20Diego%20Geisel%20Library.jpg?width=900',
    credit: 'Westxtk · CC BY-SA 4.0'
  },
  {
    school: 'Purdue',
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Purdue%20EngineeringMall.jpg?width=900',
    credit: 'Tstuddud · Public domain'
  }
];

export default function WorkWithAspire() {
  const loop = [...campuses, ...campuses];

  return (
    <section id="ambassadors" className="campusAmbassadors">
      <div className="shell ambassadorHead">
        <div>
          <p className="eyebrow">CAMPUS AMBASSADORS</p>
          <h2>Bring Aspire to your campus.</h2>
        </div>
        <a className="ambassadorLink" href="/ambassadors">We’re recruiting <span>↗</span></a>
      </div>

      <div className="campusRail" aria-label="Campuses where Aspire is recruiting student ambassadors">
        <div className="campusRailTrack">
          {loop.map((campus, index) => (
            <article className="campusRailCard" key={`${campus.school}-${index}`} aria-hidden={index >= campuses.length}>
              <img src={campus.image} alt={index < campuses.length ? `${campus.school} campus` : ''} />
              <div className="campusRailShade" />
              <strong>{campus.school}</strong>
              <small>{campus.credit}</small>
            </article>
          ))}
        </div>
      </div>

      <p className="ambassadorNote shell">Student-led, campus by campus.</p>
    </section>
  );
}
