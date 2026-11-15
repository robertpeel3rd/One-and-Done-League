// Weekly ranking with tie-breakers.
// Order: weekly points, then total touchdowns (passing, rushing, receiving,
// defensive), then total yards (passing, rushing, receiving), then total
// field goals made. Teams identical on all four remain tied.

const n = (v) => (typeof v === "number" ? v : 0);

export function statTotals(statLine) {
  const s = statLine || {};
  return {
    td: n(s.pass_td) + n(s.rush_td) + n(s.rec_td) + n(s.def_td),
    yd: n(s.pass_yd) + n(s.rush_yd) + n(s.rec_yd),
    fg: n(s.fgm),
  };
}

// Round to 2 decimals so float noise never fakes (or hides) a tie.
export const round2 = (x) => Math.round(x * 100) / 100;

function compare(a, b) {
  return b.pts - a.pts || b.td - a.td || b.yd - a.yd || b.fg - a.fg;
}

function sameKey(a, b) {
  return compare(a, b) === 0;
}

// getPoints(playerId, week) -> number. Returns rows sorted best-first:
// { id, pts, td, yd, fg, tiebreakerWin }
export function rankTeams({ teams, lineups, scoresByPlayer, week, getPoints }) {
  const rows = teams.map((t) => {
    const lineup = lineups.find((l) => l.teamId === t.id && l.week === week);
    const ids = lineup && lineup.slots ? Object.values(lineup.slots).filter(Boolean) : [];
    let pts = 0, td = 0, yd = 0, fg = 0;
    ids.forEach((pid) => {
      pts += getPoints(pid, week);
      const doc = scoresByPlayer[pid];
      const st = statTotals(doc && doc.statLine ? doc.statLine[week] : null);
      td += st.td; yd += st.yd; fg += st.fg;
    });
    return { id: t.id, pts: round2(pts), td, yd, fg, tiebreakerWin: false };
  });
  rows.sort(compare);
  rows.forEach((r, i) => {
    r.tiebreakerWin = rows.some((o, j) => j > i && o.pts === r.pts && !sameKey(o, r));
  });
  return rows;
}

// League Points for one week (same share formula as before, but ties are
// only groups that are identical on every tie-breaker).
export function leaguePointsFromRanking(ranked, teamCount) {
  const topHalfSize = Math.floor(teamCount / 2);
  const result = {};
  if (topHalfSize === 0) return result;
  let i = 0;
  while (i < topHalfSize) {
    let j = i;
    while (j + 1 < ranked.length && sameKey(ranked[j + 1], ranked[i])) j++;
    const tieCount = j - i + 1;
    let sum = 0, slots = 0;
    for (let r = i; r <= j; r++) {
      if (r < topHalfSize) { sum += topHalfSize - r; slots++; }
    }
    const share = slots > 0 ? Math.floor(sum / tieCount) : 0;
    for (let k = i; k <= j; k++) result[ranked[k].id] = share;
    i = j + 1;
  }
  return result;
}
