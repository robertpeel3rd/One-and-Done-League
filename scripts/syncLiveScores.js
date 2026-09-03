// Pulls this week's stats from Sleeper (including their computed pts_ppr) and
// writes running fantasy point totals into Firestore's `liveScores`
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

async function main() {
  const db = initFirebase();

  const { season, week } = await getCurrentWeek();
  console.log(`Fetching stats for ${season} week ${week}...`);

  const res = await fetch(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`
  );
  if (!res.ok) throw new Error(`Sleeper stats request failed: ${res.status}`);
  const stats = await res.json(); // { [player_id]: { pts_ppr, pts_std, ...raw stats } }

  const entries = Object.entries(stats).filter(([, s]) => s && typeof s.pts_ppr === "number");

  console.log(`Writing live scores for ${entries.length} players...`);
  const batchSize = 400;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + batchSize);
    for (const [playerId, s] of chunk) {
      const ref = db.collection("liveScores").doc(playerId);
      batch.set(
        ref,
        {
          points: s.pts_ppr,
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
