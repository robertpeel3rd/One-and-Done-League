import admin from "firebase-admin";

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

const ESPN_TO_SLEEPER_TEAM = {
  WSH: "WAS",
};

// Returns a map of team abbreviation -> { kickoffTime, opponent, isHome }
// for every team playing this week, derived from ESPN's scoreboard data.
async function fetchCurrentWeekGameInfo() {
  console.log("Fetching current NFL week...");
  const stateRes = await fetch("https://api.sleeper.app/v1/state/nfl");
  const state = await stateRes.json();
  const week = state.week;

  console.log(`Fetching kickoff schedule for week ${week} from ESPN...`);
  const scoreboardRes = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`
  );
  if (!scoreboardRes.ok) {
    console.warn(`ESPN schedule request failed: ${scoreboardRes.status} — leaving existing kickoff/opponent/isHome data untouched this run instead of overwriting it with nulls.`);
    return null; // null = "the fetch itself failed", distinct from {} = "fetch succeeded, just no data for some team"
  }
  const data = await scoreboardRes.json();
  const events = data.events || [];
  const gameInfoByTeam = {};
  for (const event of events) {
    const kickoffISO = event.date;
    const competitors = event.competitions?.[0]?.competitors || [];
    if (competitors.length !== 2) continue;
    const [a, b] = competitors;
    let abbrA = a.team?.abbreviation;
    let abbrB = b.team?.abbreviation;
    if (!abbrA || !abbrB) continue;
    abbrA = ESPN_TO_SLEEPER_TEAM[abbrA] || abbrA;
    abbrB = ESPN_TO_SLEEPER_TEAM[abbrB] || abbrB;
    gameInfoByTeam[abbrA] = {
      kickoffTime: kickoffISO,
      opponent: abbrB,
      isHome: a.homeAway === "home",
    };
    gameInfoByTeam[abbrB] = {
      kickoffTime: kickoffISO,
      opponent: abbrA,
      isHome: b.homeAway === "home",
    };
  }
  return gameInfoByTeam;
}

async function main() {
  const db = initFirebase();
  const gameInfoByTeam = await fetchCurrentWeekGameInfo();
  const scheduleFetchFailed = gameInfoByTeam === null;

  console.log("Fetching full player list from Sleeper...");
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) {
    throw new Error(`Sleeper request failed: ${res.status}`);
  }
  const players = await res.json();

  const activePlayers = Object.entries(players).filter(
    ([, p]) => p.active && p.team && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position)
  );

  // Sanity floor: a real Sleeper response for active NFL players is
  // typically 800+. If it comes back far lower while still returning
  // HTTP 200 (a truncated/degraded response, not an outright failure),
  // treat rosters as unreliable this run — skip both the roster write
  // AND the later stale-player deletion, rather than risk mass-deleting
  // real players based on a bad response.
  const MIN_EXPECTED_ACTIVE_PLAYERS = 500;
  if (activePlayers.length < MIN_EXPECTED_ACTIVE_PLAYERS) {
    console.warn(
      `Only ${activePlayers.length} active players returned by Sleeper (expected ${MIN_EXPECTED_ACTIVE_PLAYERS}+) — this looks like a degraded response, not a real roster. Skipping this run entirely to avoid corrupting or mass-deleting real player data.`
    );
    return;
  }

  console.log(`Writing ${activePlayers.length} active players to Firestore...`);
  const activeIds = new Set(activePlayers.map(([id]) => id));
  const batchSize = 400;
  for (let i = 0; i < activePlayers.length; i += batchSize) {
    const batch = db.batch();
    const chunk = activePlayers.slice(i, i + batchSize);
    for (const [playerId, p] of chunk) {
      const ref = db.collection("players").doc(playerId);
      const docData = {
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        pos: p.position === "DEF" ? "DST" : p.position,
        team: p.team,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Only touch kickoff/opponent/isHome when the ESPN fetch actually
      // succeeded this run — if it failed, leave whatever was already
      // there from a previous successful run alone, rather than
      // overwriting good data with nulls.
      if (!scheduleFetchFailed) {
        const info = gameInfoByTeam[p.team];
        docData.kickoffTime = info?.kickoffTime || null;
        docData.opponent = info?.opponent || null;
        docData.isHome = info?.isHome ?? null;
      }
      batch.set(ref, docData, { merge: true });
    }
    await batch.commit();
    console.log(`  wrote ${Math.min(i + batchSize, activePlayers.length)}/${activePlayers.length}`);
  }

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

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
