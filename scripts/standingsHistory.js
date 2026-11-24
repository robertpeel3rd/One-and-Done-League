// One-off, READ-ONLY report: each team's League Points for every completed
// week, cumulative totals and rank after each week, using the app's own
// ranking logic (src/lib/ranking.js) and commissioner overrides. Output is a
// small JSON block meant to be pasted into the Standings Race chart.
// Writes nothing to Firestore.
//
// Required env var: FIREBASE_SERVICE_ACCOUNT
// Optional env var: THROUGH_WEEK (default = completed weeks only)

import { rankTeams, leaguePointsFromRanking } from "../src/lib/ranking.js";

// Same rule as Standings.jsx: prefer the per-week map; only trust the single
// `points` field when it was computed for that exact week.
function pointsForWeek(scoresByPlayer, playerId, week) {
  const doc = scoresByPlayer[playerId];
  if (!doc) return 0;
  if (doc.weeklyPoints && typeof doc.weeklyPoints[week] === "number") return doc.weeklyPoints[week];
  if (doc.week === week) return doc.points || 0;
  return 0;
}

export function computeHistory({ teams, lineups, scoresByPlayer, overrides, throughWeek }) {
  const weekly = teams.map(() => []); // weekly[teamIndex][weekIndex]
  for (let week = 1; week <= throughWeek; week++) {
    const ranked = rankTeams({
      teams, lineups, scoresByPlayer, week,
      getPoints: (pid, w) => pointsForWeek(scoresByPlayer, pid, w),
    });
    const computed = leaguePointsFromRanking(ranked, teams.length);
    teams.forEach((t, i) => {
      const key = `${t.id}_${week}`;
      weekly[i].push(key in overrides ? overrides[key] : computed[t.id] || 0);
    });
  }
  const cum = [];
  const rank = [];
  for (let w = 0; w < throughWeek; w++) {
    const totals = teams.map((_, i) => weekly[i].slice(0, w + 1).reduce((a, b) => a + b, 0));
    cum.push(totals);
    // Same ordering as the Standings tab: points, ties keep team order.
    const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
    const r = new Array(teams.length);
    order.forEach((teamIndex, pos) => (r[teamIndex] = pos + 1));
    rank.push(r);
  }
  return { teams: teams.map((t) => t.name || t.id), weekly: weekly[0] ? weekly[0].map((_, w) => weekly.map((x) => x[w])) : [], cum, rank };
}

async function main() {
  const { default: admin } = await import("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const read = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [teams, lineups, scoreDocs, overrideDocs] = await Promise.all([
    read("teams"), read("lineups"), read("liveScores"), read("leaguePointOverrides"),
  ]);
  const scoresByPlayer = {};
  scoreDocs.forEach((d) => (scoresByPlayer[d.id] = d));
  const overrides = {};
  overrideDocs.forEach((d) => (overrides[`${d.teamId}_${d.week}`] = d.leaguePoints));

  const state = await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
  const throughWeek = process.env.THROUGH_WEEK ? Number(process.env.THROUGH_WEEK) : state.week - 1;

  const out = computeHistory({ teams, lineups, scoresByPlayer, overrides, throughWeek });
  const json = JSON.stringify(out);
  const md = [
    `## Standings history (through Week ${throughWeek})`,
    "Copy the block below and paste it into the chat.",
    "",
    "```json",
    json,
    "```",
  ].join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
