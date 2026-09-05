// Pulls this week's RAW stats from Sleeper and computes fantasy points
// ourselves using our own explicit scoring rules, rather than trusting
// Sleeper's own pts_ppr field. We verified against real 2025 data that
// Sleeper's pts_ppr does NOT cleanly match a simple documented formula for
// kickers (two real kicker examples gave inconsistent results against every
// flat-tier model we tried) — so we compute scoring ourselves here instead,
// using our own defined, documented rules (see the About tab in the app).
//
// Writes running fantasy point totals into Firestore's `liveScores`
// collection, keyed by player_id. Run frequently during game windows.
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
  pts -= (Number(stats.pass_int) || 0) * 2;

  pts += (Number(stats.rush_yd) || 0) * 0.1;
  pts += (Number(stats.rush_td) || 0) * 6;

  pts += (Number(stats.rec) || 0) * 1;
  pts += (Number(stats.rec_yd) || 0) * 0.1;
  pts += (Number(stats.rec_td) || 0) * 6;

  pts -= (Number(stats.fum_lost) || 0) * 2;

  pts += (Number(stats.pass_2pt) || 0) * 2;
  pts += (Number(stats.rush_2pt) || 0) * 2;
  pts += (Number(stats.rec_2pt) || 0) * 2;

  const fgm40_49 = Number(stats.fgm_40_49) || 0;
  const fgm50_59 = Number(stats.fgm_50_59) || 0;
  const fgm50p = Number(stats.fgm_50p) || 0;
  const fgmTotal = Number(stats.fgm) || 0;
  const fgm0_39 = Math.max(0, fgmTotal - fgm40_49 - fgm50_59 - fgm50p);

  pts += fgm0_39 * 3;
  pts += fgm40_49 * 4;
  pts += (fgm50_59 + fgm50p) * 5;
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

  const entries = Object.entries(rawStats).filter(([, s]) => s && Object.keys(s).length > 0);

  console.log(`Computing and writing scores for ${entries.length} players...`);
  const batchSize = 400;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + batchSize);
    for (const [playerId, stats] of chunk) {
      const points = calcFantasyPoints(stats);
      const ref = db.collection("liveScores").doc(playerId);
      batch.set(
        ref,
        {
          points,
          week,
          season,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
