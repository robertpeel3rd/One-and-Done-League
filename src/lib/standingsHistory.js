// League Points for every completed week, plus cumulative totals and rank
// after each week, using the same ranking rules as the Standings tab
// (ranking.js tie-breakers, commissioner overrides). Used by the Standings
// Race chart.
import { rankTeams, leaguePointsFromRanking } from "./ranking.js";

// Same rule as Standings: prefer the per-week map; only trust the single
// `points` field when it was computed for that exact week.
function pointsForWeek(scoresByPlayer, playerId, week) {
  const doc = scoresByPlayer[playerId];
  if (!doc) return 0;
  if (doc.weeklyPoints && typeof doc.weeklyPoints[week] === "number") return doc.weeklyPoints[week];
  if (doc.week === week) return doc.points || 0;
  return 0;
}

// Returns { cum, rank } where cum[w][i] is team i's total League Points after
// week w+1 and rank[w][i] is its 1-based position (ties keep team order, the
// same as the Standings tab).
export function computeHistory({ teams, lineups, scoresByPlayer, overrides, throughWeek }) {
  const totals = teams.map(() => 0);
  const cum = [];
  const rank = [];
  for (let week = 1; week <= throughWeek; week++) {
    const ranked = rankTeams({
      teams, lineups, scoresByPlayer, week,
      getPoints: (pid, w) => pointsForWeek(scoresByPlayer, pid, w),
    });
    const computed = leaguePointsFromRanking(ranked, teams.length);
    teams.forEach((t, i) => {
      const key = `${t.id}_${week}`;
      totals[i] += key in overrides ? overrides[key] : computed[t.id] || 0;
    });
    cum.push(totals.slice());
    const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
    const r = new Array(teams.length);
    order.forEach((teamIndex, pos) => (r[teamIndex] = pos + 1));
    rank.push(r);
  }
  return { cum, rank };
}

// Short label for the end of a line: drops a leading "The " and cuts long
// names at a word boundary. The full name is always in the legend.
export function shortName(name, max = 15) {
  let n = String(name || "").replace(/^The\s+/i, "").trim();
  if (n.length <= max) return n;
  const words = n.split(/\s+/);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max - 1) break;
    out = next;
  }
  if (!out) out = n.slice(0, max - 1);
  return `${out}…`;
}
