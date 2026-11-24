// Each tab gets its own web address (#/standings, #/my-lineup, ...) so a
// reload stays on the same tab and the phone's back button steps back
// through the tabs you visited.
const TAB_SLUGS = {
  Standings: "standings",
  "Weekly Scoring": "weekly-scoring",
  "Detailed Scoring": "detailed-scoring",
  "My Lineup": "my-lineup",
  "Standings Race": "standings-race",
  "Used Players": "used-players",
  About: "about",
  Legend: "legend",
  Commissioner: "commissioner",
};

const TAB_BY_SLUG = Object.fromEntries(Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab]));

export function tabFromHash(hash) {
  const slug = String(hash || "").replace(/^#\/?/, "");
  return TAB_BY_SLUG[slug] || "Standings";
}

export function hashForTab(tab) {
  return `#/${TAB_SLUGS[tab] || "standings"}`;
}
