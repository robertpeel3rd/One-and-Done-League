// Pulls this week's RAW stats from Sleeper and computes fantasy points
// ourselves using our own explicit scoring rules, rather than trusting
// Sleeper's own pts_ppr field. We verified against real 2025 data that
// Sleeper's pts_ppr does NOT cleanly match a simple documented formula for
// kickers (two real kicker examples gave inconsistent results against every
// flat-tier model we tried) — so we compute scoring ourselves here instead,
// using our own defined, documented rules (see the About tab in the app).
//
// Also pulls this week's PROJECTED points from Sleeper directly (their own
// pts_ppr total, not run through our own calcFantasyPoints). Our custom
// scoring only diverges from standard PPR for kickers and DST tiers, so
// using Sleeper's own projected total trades a small amount of accuracy at
// those two positions for a simpler, more reliable calculation overall.
//
// Writes running fantasy point totals into Firestore's `liveScores`
// collection, keyed by player_id. Each player's doc also accumulates a
// `weeklyPoints` map (one entry per week, e.g. weeklyPoints.3 = 14.2) so a
// season-to-date total can be computed client-side by summing that map —
// this avoids overwriting prior weeks' totals, since each player only has
// a single liveScores doc that's updated in place every run.
//
// Run frequently during game windows.
//
// No API key needed.
//
// Required env var:
//   FIREBASE_SERVICE_ACCOUNT

import admin from "firebase-admin";

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return admin.firestore();
}

async function getCurrentWeek() {
  const res = await fetch("https://api.sleeper.app/v1/state/nfl");
  if (!res.ok) throw new Error(`Sleeper state request failed: ${res.status}`);
  const state = await res.json();
  return { season: state.season, week: state.week };
}

// Standard defense/special teams points-allowed scoring tiers.
function getPointsAllowedScore(ptsAllowed) {
  if (ptsAllowed === 0) return 10;
  if (ptsAllowed <= 6) return 7;
  if (ptsAllowed <= 13) return 4;
  if (ptsAllowed <= 20) return 1;
  if (ptsAllowed <= 27) return 0;
  if (ptsAllowed <= 34) return -1;
  return -4; // 35+
}

function calcFantasyPoints(stats) {
  let pts = 0;

  pts += (Number(stats.pass_yd) || 0) * 0.04;
  pts += (Number(stats.pass_td) || 0) * 4;
  pts -= (Number(stats.pass_int) || 0) * 1;

  pts += (Number(stats.rush_yd) || 0) * 0.1;
  pts += (Number(stats.rush_td) || 0) * 6;

  pts += (Number(stats.rec) || 0) * 1;
  pts += (Number(stats.rec_yd) || 0) * 0.1;
  pts += (Number(stats.rec_td) || 0) * 6;

  pts -= (Number(stats.fum_lost) || 0) * 2;

  pts += (Number(stats.pass_2pt) || 0) * 2;
  pts += (Number(stats.rush_2pt) || 0) * 2;
  pts += (Number(stats.rec_2pt) || 0) * 2;

  // Confirmed against real 2025 data (Sleeper player id 12961, week 6):
  // fgm_50_59 and fgm_50p are NOT separate additive categories — fgm_50p is
  // the umbrella "50+ yards" bucket, and fgm_50_59 is a narrower breakdown
  // WITHIN that same bucket describing the same kick. Summing both double-
  // counts every 50-59 yard field goal. Use fgm_50p alone.
  const fgm40_49 = Number(stats.fgm_40_49) || 0;
  const fgm50p = Number(stats.fgm_50p) || 0;
  const fgmTotal = Number(stats.fgm) || 0;
  const fgm0_39 = Math.max(0, fgmTotal - fgm40_49 - fgm50p);

  pts += fgm0_39 * 3;
  pts += fgm40_49 * 4;
  pts += fgm50p * 5;
  pts += (Number(stats.xpm) || 0) * 1;
  pts -= (Number(stats.fgmiss) || 0) * 1;
  pts -= (Number(stats.xpmiss) || 0) * 1;

  pts += (Number(stats.sack) || 0) * 1;
  pts += (Number(stats.int) || 0) * 2;
  pts += (Number(stats.fum_rec) || 0) * 2;
  pts += (Number(stats.def_td) || 0) * 6;
  pts += (Number(stats.safe) || 0) * 2;
  pts += (Number(stats.blk_kick) || 0) * 2;

  // DST points allowed (only applies to team defense entries, which carry
  // pts_allow; skip for individual players who won't have this field).
  if (stats.pts_allow !== undefined) {
    pts += getPointsAllowedScore(Number(stats.pts_allow));
  }

  return Math.round(pts * 100) / 100;
}

async function main() {
  const db = initFirebase();

  const { season, week } = await getCurrentWeek();
  console.log(`Fetching raw stats for ${season} week ${week}...`);

  const res = await fetch(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`
  );
  if (!res.ok) throw new Error(`Sleeper stats request failed: ${res.status}`);
  const rawStats = await res.json();
  const rawStatsMap = Object.fromEntries(
    Object.entries(rawStats).filter(([, s]) => s && Object.keys(s).length > 0)
  );

  // NOTE: unlike the stats endpoint (an object keyed by player_id), the
  // projections endpoint returns an ARRAY of entry objects, each with its
  // own player_id field and the actual projected numbers nested under
  // entry.stats.pts_ppr. Confirmed against the real 2026 week 1 response —
  // do not assume the same shape as the stats endpoint here.
  console.log(`Fetching projected points for ${season} week ${week}...`);
  let projMap = {};
  try {
    const projRes = await fetch(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`
    );
    if (projRes.ok) {
      const projData = await projRes.json();
      const entries = Array.isArray(projData) ? projData : [];
      for (const entry of entries) {
        const pid = entry?.player_id;
        const ppr = entry?.stats?.pts_ppr;
        if (pid && typeof ppr === "number" && ppr > 0) {
          projMap[pid] = ppr;
        }
      }
    } else {
      console.warn(`Sleeper projections request failed: ${projRes.status} — skipping projected points this run.`);
    }
  } catch (err) {
    console.warn(`Sleeper projections request errored: ${err.message} — skipping projected points this run.`);
  }

  const allPlayerIds = Array.from(
    new Set([...Object.keys(rawStatsMap), ...Object.keys(projMap)])
  );

  console.log(`Computing and writing scores for ${allPlayerIds.length} players...`);
  const batchSize = 400;
  for (let i = 0; i < allPlayerIds.length; i += batchSize) {
    const batch = db.batch();
    const chunk = allPlayerIds.slice(i, i + batchSize);
    for (const playerId of chunk) {
      const stats = rawStatsMap[playerId];
      const projectedPoints = projMap[playerId] ?? null;

      if (!stats && projectedPoints === null) continue;

      const ref = db.collection("liveScores").doc(playerId);
      const docData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Only touch points/weeklyPoints when real stats are actually present
      // this run. A player missing from THIS run's stats (but still present
      // in projections, which are usually available all week) must NOT have
      // their real, already-correct score zeroed out — just leave it alone.
      if (stats) {
        const points = calcFantasyPoints(stats);
        docData.points = points;
        docData.week = week;
        docData.season = season;
        docData[`weeklyPoints.${week}`] = points;
      }

      if (projectedPoints !== null) {
        docData.projectedPoints = projectedPoints;
      }

      batch.set(ref, docData, { merge: true });
    }
    await batch.commit();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
