// One-off, READ-ONLY report: which defenses the league's offensive picks
// (QB, RB, WR, TE, incl. FLEX) were made against, through a given week.
// Writes nothing to Firestore. Run from the "Opponent report" GitHub Action.
//
// Required env var: FIREBASE_SERVICE_ACCOUNT
// Optional env var: THROUGH_WEEK (default = completed weeks only)
//
// Caveat: the app only stores each player's CURRENT team, so a player traded
// mid-season is matched to his current team's schedule for every week.

const OFFENSE = ["QB", "RB", "WR", "TE"];
const ESPN_TO_SLEEPER_TEAM = { WSH: "WAS" };

// scheduleByWeek: { [week]: { [teamAbbr]: opponentAbbr } }
export function computeOpponentReport({ lineups, players, scheduleByWeek, throughWeek }) {
  const playerById = {};
  players.forEach((p) => (playerById[p.id] = p));
  const latest = Math.max(0, ...lineups.map((l) => l.week));
  const lastWeek = throughWeek ?? latest - 1;

  const byOpp = {};
  let total = 0;
  lineups.forEach((l) => {
    if (l.week > lastWeek) return;
    Object.values(l.slots || {}).forEach((pid) => {
      const p = playerById[pid];
      if (!p || !OFFENSE.includes(p.pos)) return;
      total++;
      const opp = scheduleByWeek[l.week]?.[p.team] || "BYE / unknown";
      const row = (byOpp[opp] = byOpp[opp] || { picks: 0, players: new Set() });
      row.picks++;
      row.players.add(pid);
    });
  });

  const rows = Object.entries(byOpp)
    .map(([opp, r]) => ({ opp, picks: r.picks, players: r.players.size, share: total ? r.picks / total : 0 }))
    .sort((a, b) => b.picks - a.picks || a.opp.localeCompare(b.opp));
  return { lastWeek, total, rows };
}

export function renderMarkdown({ lastWeek, total, rows }) {
  const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
  const out = [];
  out.push(`## Offensive picks by opponent (through Week ${lastWeek})`);
  out.push(`${total} QB/RB/WR/TE picks (FLEX included). Every pick counts, so a player picked by several teams counts once per team.`);
  out.push("");
  out.push("| # | Opponent defense | Picks against | Share | Different players |");
  out.push("|---|---|---|---|---|");
  rows.forEach((r, i) => out.push(`| ${i + 1} | ${r.opp} | ${r.picks} | ${pct(r.share)} | ${r.players} |`));
  return out.join("\n");
}

async function fetchSchedule(season, weeks) {
  const scheduleByWeek = {};
  for (const week of weeks) {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`
    );
    if (!res.ok) throw new Error(`ESPN schedule request failed for week ${week}: ${res.status}`);
    const data = await res.json();
    const map = {};
    for (const event of data.events || []) {
      const comps = event.competitions?.[0]?.competitors || [];
      if (comps.length !== 2) continue;
      const a = ESPN_TO_SLEEPER_TEAM[comps[0].team?.abbreviation] || comps[0].team?.abbreviation;
      const b = ESPN_TO_SLEEPER_TEAM[comps[1].team?.abbreviation] || comps[1].team?.abbreviation;
      if (!a || !b) continue;
      map[a] = b;
      map[b] = a;
    }
    scheduleByWeek[week] = map;
  }
  return scheduleByWeek;
}

async function main() {
  const { default: admin } = await import("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const read = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [lineups, players] = await Promise.all([read("lineups"), read("players")]);

  const state = await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
  const latest = Math.max(0, ...lineups.map((l) => l.week));
  const throughWeek = process.env.THROUGH_WEEK ? Number(process.env.THROUGH_WEEK) : latest - 1;
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  const scheduleByWeek = await fetchSchedule(state.season, weeks);

  const md = renderMarkdown(computeOpponentReport({ lineups, players, scheduleByWeek, throughWeek }));
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
