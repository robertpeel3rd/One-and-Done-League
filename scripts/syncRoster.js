// Pulls the full active NFL player list from Sleeper and writes it into the
// Firestore `players` collection. Sleeper's player list is large (~1MB) and
// changes rarely, so this only needs to run once a day.
//
// No API key needed — Sleeper's API is public and read-only.
//
// Required env var:
//   FIREBASE_SERVICE_ACCOUNT  - JSON string of a Firebase service account key

import admin from "firebase-admin";

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return admin.firestore();
}

async function main() {
  const db = initFirebase();

  console.log("Fetching full player list from Sleeper...");
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) {
    throw new Error(`Sleeper request failed: ${res.status}`);
  }
  const players = await res.json(); // { [player_id]: { ...player fields } }

  const activePlayers = Object.entries(players).filter(
    ([, p]) =>
      p.active &&
      p.team && // excludes free agents not on an active 53-man roster
      ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position)
  );

  console.log(`Writing ${activePlayers.length} active players to Firestore...`);
  const activeIds = new Set(activePlayers.map(([id]) => id));
  const batchSize = 400; // stay under Firestore's 500-write batch limit
  for (let i = 0; i < activePlayers.length; i += batchSize) {
    const batch = db.batch();
    const chunk = activePlayers.slice(i, i + batchSize);
    for (const [playerId, p] of chunk) {
      const ref = db.collection("players").doc(playerId);
      batch.set(
        ref,
        {
          name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          pos: p.position === "DEF" ? "DST" : p.position,
          team: p.team,
          // NOTE: kickoff time isn't available from this endpoint — the schedule
          // sync (see below) needs to fill this in separately once confirmed.
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    console.log(`  wrote ${Math.min(i + batchSize, activePlayers.length)}/${activePlayers.length}`);
  }

  // Clean up stale docs — players previously synced (e.g. free agents, retired,
  // or since-inactive players) that no longer belong in the pool.
  console.log("Checking for stale player docs to remove...");
  const existingSnap = await db.collection("players").get();
  const staleIds = existingSnap.docs.map((d) => d.id).filter((id) => !activeIds.has(id));
  if (staleIds.length > 0) {
    console.log(`Removing ${staleIds.length} stale players...`);
    for (let i = 0; i < staleIds.length; i += batchSize) {
      const batch = db.batch();
      const chunk = staleIds.slice(i, i + batchSize);
      for (const id of chunk) {
        batch.delete(db.collection("players").doc(id));
      }
      await batch.commit();
    }
  }

  console.log("Done. NOTE: kickoff times still need to be filled in — see comment in this file.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});