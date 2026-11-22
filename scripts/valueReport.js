// One-off, READ-ONLY report: the three draft "most valuable pick" views,
// computed from the league's current data. Writes nothing to Firestore.
//
// Run from the "Value score report" GitHub Action (manual). The result is
// printed to the log and the job summary.
//
// Required env var: FIREBASE_SERVICE_ACCOUNT
// Optional env var: THROUGH_WEEK (last week to include; default = the week
// before the latest lineup week, i.e. completed weeks only)

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const popSd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r2 = (x) => Math.round(x * 100) / 100;
const sign = (x) => (x >= 0 ? "+" : "") + r2(x);

function pointsForWeek(scoreDoc, week) {
  if (!scoreDoc) return 0;
  if (scoreDoc.weeklyPoints && typeof scoreDoc.weeklyPoints[week] === "number") {
    return scoreDoc.weeklyPoints[week];
  }
  if (scoreDoc.week === week) return scoreDoc.points || 0;
  return 0;
}

export function computeReport({ teams, lineups, players, scores, throughWeek }) {
  const teamName = {};
  teams.forEach((t) => (teamName[t.id] = t.name || t.id));
  const playerById = {};
  players.forEach((p) => (playerById[p.id] = p));

  const latest = Math.max(0, ...lineups.map((l) => l.week));
  const lastWeek = throughWeek ?? latest - 1;

  // 1. Every pick = one filled lineup slot in an included week.
  const picks = [];
  lineups.forEach((l) => {
    if (l.week > lastWeek || !teamName[l.teamId]) return;
    Object.values(l.slots || {}).forEach((pid) => {
      if (!pid) return;
      const p = playerById[pid];
      if (!p || !POSITIONS.includes(p.pos)) return;
      picks.push({
        teamId: l.teamId,
        team: teamName[l.teamId],
        week: l.week,
        playerId: pid,
        name: p.name,
        pos: p.pos,
        pts: pointsForWeek(scores[pid], l.week),
      });
    });
  });

  // 2. Position baselines (population standard deviation).
  const posStats = {};
  POSITIONS.forEach((pos) => {
    const xs = picks.filter((k) => k.pos === pos).map((k) => k.pts);
    if (xs.length === 0) return;
    posStats[pos] = { n: xs.length, mean: mean(xs), sd: popSd(xs) };
  });
  picks.forEach((k) => {
    const s = posStats[k.pos];
    k.z1 = s && s.sd > 0 ? (k.pts - s.mean) / s.sd : 0;
  });

  // 3. How many teams picked each player (a team can only pick him once).
  const byPlayer = {};
  picks.forEach((k) => (byPlayer[k.playerId] = byPlayer[k.playerId] || []).push(k));

  // View 2: centered on the player's own average, scaled by the position
  // spread, weighted n / (n + 3). Players picked once are excluded.
  const view2 = [];
  Object.values(byPlayer).forEach((ks) => {
    const n = ks.length;
    if (n < 2) return;
    const m = mean(ks.map((k) => k.pts));
    ks.forEach((k) => {
      const sd = posStats[k.pos]?.sd || 0;
      const raw = sd > 0 ? (k.pts - m) / sd : 0;
      view2.push({ ...k, n, playerAvg: m, raw, score: raw * (n / (n + 3)) });
    });
  });

  // View 3: View 1 value score x 1 / sqrt(number of teams who picked him).
  const view3 = picks.map((k) => {
    const n = byPlayer[k.playerId].length;
    return { ...k, n, score: k.z1 * (1 / Math.sqrt(n)) };
  });

  // Best owner overall: average View 1 value score per pick.
  const owners = {};
  picks.forEach((k) => {
    owners[k.teamId] = owners[k.teamId] || { team: k.team, zs: [] };
    owners[k.teamId].zs.push(k.z1);
  });
  const ownerRows = Object.values(owners)
    .map((o) => ({ team: o.team, picks: o.zs.length, avg: mean(o.zs) }))
    .sort((a, b) => b.avg - a.avg);

  const histogram = {};
  Object.values(byPlayer).forEach((ks) => (histogram[ks.length] = (histogram[ks.length] || 0) + 1));

  return {
    lastWeek,
    picks,
    posStats,
    ownerRows,
    histogram,
    view1: [...picks].sort((a, b) => b.z1 - a.z1),
    view2: view2.sort((a, b) => b.score - a.score),
    view3: view3.sort((a, b) => b.score - a.score),
    playerCount: Object.keys(byPlayer).length,
  };
}

export function renderMarkdown(rep, topN = 10) {
  const L = [];
  L.push(`# Most valuable pick: draft views (through Week ${rep.lastWeek})`);
  L.push(`${rep.picks.length} picks, ${rep.playerCount} different players. Completed weeks only. Draft formulas, not final.\n`);
  L.push("## Position baselines (all picks that position)");
  L.push("| Position | Picks | Average pts | Std dev |\n|---|---|---|---|");
  POSITIONS.forEach((pos) => {
    const s = rep.posStats[pos];
    if (s) L.push(`| ${pos} | ${s.n} | ${r2(s.mean)} | ${r2(s.sd)} |`);
  });
  L.push("\n## View 1: best single picks (vs. all picks at the position)");
  L.push("| # | Team | Player | Pos | Wk | Pts | Value |\n|---|---|---|---|---|---|---|");
  rep.view1.slice(0, topN).forEach((k, i) =>
    L.push(`| ${i + 1} | ${k.team} | ${k.name} | ${k.pos} | ${k.week} | ${r2(k.pts)} | ${sign(k.z1)} |`));
  L.push("\n## View 1: best owner overall (average value per pick)");
  L.push("| # | Team | Picks | Avg value |\n|---|---|---|---|");
  rep.ownerRows.forEach((o, i) => L.push(`| ${i + 1} | ${o.team} | ${o.picks} | ${sign(o.avg)} |`));
  L.push("\n## View 2: vs. the same player's other picks, weighted n/(n+3)");
  L.push("Players picked only once are excluded.");
  L.push("| # | Team | Player | Wk | Pts | Player avg | Picks | Score |\n|---|---|---|---|---|---|---|---|");
  rep.view2.slice(0, topN).forEach((k, i) =>
    L.push(`| ${i + 1} | ${k.team} | ${k.name} | ${k.week} | ${r2(k.pts)} | ${r2(k.playerAvg)} | ${k.n} | ${sign(k.score)} |`));
  L.push("\n## View 3: hidden gems (View 1 value x 1/sqrt(teams who picked him))");
  L.push("| # | Team | Player | Wk | Pts | Teams | Value | Gem score |\n|---|---|---|---|---|---|---|---|");
  rep.view3.slice(0, topN).forEach((k, i) =>
    L.push(`| ${i + 1} | ${k.team} | ${k.name} | ${k.week} | ${r2(k.pts)} | ${k.n} | ${sign(k.z1)} | ${sign(k.score)} |`));
  L.push("\n## How many teams picked each player");
  L.push("| Teams | Players |\n|---|---|");
  Object.keys(rep.histogram).sort((a, b) => a - b).forEach((n) => L.push(`| ${n} | ${rep.histogram[n]} |`));
  return L.join("\n");
}

async function main() {
  const { default: admin } = await import("firebase-admin");
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const read = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [teams, lineups, players, scoreDocs] = await Promise.all([
    read("teams"), read("lineups"), read("players"), read("liveScores"),
  ]);
  const scores = {};
  scoreDocs.forEach((d) => (scores[d.id] = d));
  const throughWeek = process.env.THROUGH_WEEK ? Number(process.env.THROUGH_WEEK) : undefined;
  const md = renderMarkdown(computeReport({ teams, lineups, players, scores, throughWeek }));
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
