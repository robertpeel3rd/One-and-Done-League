import admin from "firebase-admin";

function initFirebase() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

// Wraps a promise with a hard timeout so a hung Firestore call fails fast
// (e.g. 45s) instead of hanging for a very long default network/client
// timeout (observed to take ~20+ minutes during a real Firestore latency
// incident on Sept 14, 2026 — see future-improvements.md for the full
// writeup). A fast, clear failure lets the next scheduled/triggered run
// recover sooner, rather than one bad window silently blocking sync for
// a long time.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const WRITE_TIMEOUT_MS = 45000;

const ESPN_TO_SLEEPER_TEAM = {
  WSH: "WAS",
};

// Returns a map of team abbreviation -> { kickoffTime, opponent, isHome,
// gameState, gameCompleted } for every team playing this week, derived
// from ESPN's scoreboard data. gameState/gameCompleted come from ESPN's
// event.status.type field — confirmed against real live data (Sept 2026):
// a live game shows { state: "in", completed: false }, a finished game
// shows { state: "post", completed: true }.
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
    console.warn(`ESPN schedule request failed: ${scoreboardRes.status} — leaving existing kickoff/opponent/isHome/gameState data untouched this run instead of overwriting it with nulls.`);
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
    const statusType = event.status?.type || {};
    const gameState = statusType.state ?? null;
    const gameCompleted = typeof statusType.completed === "boolean" ? statusType.completed : null;
    gameInfoByTeam[abbrA] = {
      kickoffTime: kickoffISO,
      opponent: abbrB,
      isHome: a.homeAway === "home",
      gameState,
      gameCompleted,
    };
    gameInfoByTeam[abbrB] = {
      kickoffTime: kickoffISO,
      opponent: abbrA,
      isHome: b.homeAway === "home",
      gameState,
      gameCompleted,
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
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Only touch kickoff/opponent/isHome/gameState when the ESPN fetch
      // actually succeeded this run — if it failed, leave whatever was
      // already there from a previous successful run alone, rather than
      // overwriting good data with nulls.
      if (!scheduleFetchFailed) {
        const info = gameInfoByTeam[p.team];
        docData.kickoffTime = info?.kickoffTime || null;
        docData.opponent = info?.opponent || null;
        docData.isHome = info?.isHome ?? null;
        docData.gameState = info?.gameState || null;
        docData.gameCompleted = info?.gameCompleted ?? null;
      }
      batch.set(ref, docData, { merge: true });
    }
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, `roster batch commit (${i}-${i + chunk.length})`);
    console.log(`  wrote ${Math.min(i + batchSize, activePlayers.length)}/${activePlayers.length}`);
  }

  // Soft-delete rather than hard-delete: a player who drops off Sleeper's
  // active list (released, retired, long-term IR) gets marked active:false
  // instead of having their doc removed entirely. A hard delete would
  // break historical box-score display (WeeklyScoring/Standings showing
  // "—" instead of the player's name for a slot they legitimately filled
  // in an earlier week) and silently drop them from UsedPlayers' list —
  // even though the actual point totals live independently in liveScores
  // and are unaffected either way. RosterBuilder's picker filters out
  // active:false players so they still can't be newly started.
  console.log("Checking for stale (no longer active) players to mark inactive...");
  const existingSnap = await withTimeout(
    db.collection("players").get(),
    WRITE_TIMEOUT_MS,
    "players collection get (stale check)"
  );
  const staleIds = existingSnap.docs
    .filter((d) => !activeIds.has(d.id) && d.data().active !== false)
    .map((d) => d.id);
  if (staleIds.length > 0) {
    console.log(`Marking ${staleIds.length} players inactive...`);
    for (let i = 0; i < staleIds.length; i += batchSize) {
      const batch = db.batch();
      const chunk = staleIds.slice(i, i + batchSize);
      for (const id of chunk) {
        batch.set(db.collection("players").doc(id), { active: false }, { merge: true });
      }
      await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, `stale-mark batch commit (${i}-${i + chunk.length})`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
