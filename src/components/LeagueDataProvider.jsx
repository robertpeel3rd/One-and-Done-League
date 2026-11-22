import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { LeagueDataContext } from "../lib/leagueDataContext";

const TICK_MS = 5000;
const POLL_MS = 30000;
const REFOCUS_STALE_MS = 60000;
const GAME_BEFORE_MS = 10 * 60 * 1000;
const GAME_AFTER_MS = 5 * 60 * 60 * 1000;

const EMPTY = { teams: [], players: [], lineups: [], scoresByPlayer: {}, overrides: {} };

async function fetchAll() {
  const [teamsSnap, playersSnap, lineupsSnap, scoresSnap, overridesSnap] = await Promise.all([
    getDocs(collection(db, "teams")),
    getDocs(collection(db, "players")),
    getDocs(collection(db, "lineups")),
    getDocs(collection(db, "liveScores")),
    getDocs(collection(db, "leaguePointOverrides")),
  ]);
  const scoresByPlayer = {};
  scoresSnap.docs.forEach((d) => {
    scoresByPlayer[d.id] = d.data();
  });
  const overrides = {};
  overridesSnap.docs.forEach((d) => {
    const data = d.data();
    overrides[`${data.teamId}_${data.week}`] = data.leaguePoints;
  });
  return {
    teams: teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    players: playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lineups: lineupsSnap.docs.map((d) => d.data()),
    scoresByPlayer,
    overrides,
  };
}

// True while any NFL game is in its live window: from 10 minutes before
// kickoff until it's marked completed (or 5 hours after kickoff, as a
// safety cap in case a game never gets marked completed).
function gameWindowActive(players) {
  const now = Date.now();
  return players.some((p) => {
    if (!p.kickoffTime || p.gameCompleted === true) return false;
    const kickoff = Date.parse(p.kickoffTime);
    if (Number.isNaN(kickoff)) return false;
    return now >= kickoff - GAME_BEFORE_MS && now <= kickoff + GAME_AFTER_MS;
  });
}

// Loads all league data once when `enabled` (signed in), then refreshes:
//  - every 30s ONLY while a game is live (and the browser tab is visible)
//  - when the user returns to the tab after 60s+ away
//  - retries every 5s until the first load succeeds
export function LeagueDataProvider({ enabled, children }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const rerunRef = useRef(false);
  const dataRef = useRef(EMPTY);
  const inflightRef = useRef(null);
  const lastLoadedRef = useRef(0);

  const refresh = useCallback(() => {
    if (inflightRef.current) {
      // A load is already running, but it may have started BEFORE whatever
      // prompted this call (e.g. a lineup save). Queue one more load right
      // after it so the caller ends up with fresh data.
      rerunRef.current = true;
      return inflightRef.current;
    }
    const p = (async () => {
      do {
        rerunRef.current = false;
        try {
          const next = await fetchAll();
          dataRef.current = next;
          lastLoadedRef.current = Date.now();
          setLastUpdated(new Date(lastLoadedRef.current));
          setData(next);
          setLoading(false);
        } catch (err) {
          console.error("League data refresh failed (keeping existing data):", err);
        }
      } while (rerunRef.current);
      inflightRef.current = null;
    })();
    inflightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const tick = setInterval(() => {
      if (document.hidden) return;
      const age = Date.now() - lastLoadedRef.current;
      if (!lastLoadedRef.current) {
        refresh();
      } else if (age >= POLL_MS - 1000 && gameWindowActive(dataRef.current.players)) {
        refresh();
      }
    }, TICK_MS);
    function onVisible() {
      if (!document.hidden && Date.now() - lastLoadedRef.current > REFOCUS_STALE_MS) {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  const value = useMemo(() => ({ ...data, loading, lastUpdated, refresh }), [data, loading, lastUpdated, refresh]);
  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}
