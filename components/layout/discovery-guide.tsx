const guideItems = [
  {
    title: 'What is EndorseCoin?',
    body: 'EndorseCoin helps people discover new crypto coins, fresh token launches, presales, airdrops, and active community picks in one place that is easier to scan.',
  },
  {
    title: 'How are rankings calculated?',
    body: 'Community rankings are powered by real votes. When a project has an active boost, its vote power increases for the length of that boost, giving it more visibility while it still competes inside the same leaderboard flow.',
  },
  {
    title: 'How is trending determined?',
    body: 'A coin can trend when investors start paying attention to it quickly. Recent votes and watchlist activity help surface trending coins and early signals without replacing the main vote-based leaderboard.',
  },
  {
    title: 'What are boosted coins?',
    body: 'Boosts are paid visibility upgrades for listed projects. They can help a coin compete harder in rankings for a set time, but they do not lock in a guaranteed spot or hide that the project is boosted.',
  },
  {
    title: 'How do I submit a coin?',
    body: 'Submit your project with the required details, links, logo, and market information. We review coin listings first so they stay clean, useful, and easier for investors to compare.',
  },
  {
    title: 'Why is market or chart data missing?',
    body: 'Some tokens are too new or not supported by every data source yet. If we cannot verify a live chart, DEX link, or market feed, we would rather leave it blank than show something broken.',
  },
  {
    title: 'Do I need an account to vote or watch coins?',
    body: 'Yes. Accounts help keep voting fair and let you build a coin watchlist you can come back to later. You can also share your watchlist with other investors when you want.',
  },
];

const summaryItems = [
  {
    kicker: 'Who we are',
    title: 'A community-powered discovery platform for new coins.',
    body: 'EndorseCoin spotlights new crypto coins, early-stage tokens, presales, and airdrops in one place. We help investors discover promising projects early, follow the ones they like, and influence visibility through real community votes.',
    points: [
      'Early-stage tokens, presales, and airdrops',
      'Community-led voting visibility',
      'Clear project and trust signals',
    ],
  },
  {
    kicker: 'What we do',
    title: 'Find new listings, presales, and airdrops early.',
    body: 'EndorseCoin gives investors a cleaner way to discover fresh token launches, live presales, airdrops, and promoted projects competing for attention each week.',
    points: [
      'Browse new launches, presales, and airdrops',
      'Vote for projects you believe in',
      'Save coins you want to follow',
    ],
  },
  {
    kicker: 'How we do it',
    title: 'Community signals first, paid visibility clearly marked.',
    body: 'Weekly votes, watchlist interest, and project freshness shape coin discovery. Boosts and sponsored placements stay clearly labeled, so attention is easy to understand.',
    points: [
      'Votes reset every week',
      'Boosts lift ranking visibility',
      'Promoted coins are labeled upfront',
    ],
  },
];

export function DiscoveryGuide() {
  return (
    <section className="container discovery-guide" aria-labelledby="discovery-guide-title">
      <div className="discovery-guide-head">
        <small>Good to know</small>
        <h2 id="discovery-guide-title">Frequently asked questions</h2>
        <p>
          A quick guide to community rankings, boosts, submissions, watchlists, and the market data
          you see around the site.
        </p>
      </div>

      <div className="discovery-guide-body">
        <div className="discovery-guide-list">
          {guideItems.map((item) => (
            <article className="discovery-guide-row" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <div className="discovery-guide-summary">
          {summaryItems.map((item) => (
            <article className="discovery-guide-summary-card" key={item.kicker}>
              <small>{item.kicker}</small>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
