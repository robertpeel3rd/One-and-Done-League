import { useCallback, useEffect, useState } from "react";

// The current NFL week barely changes, so fetch it from Sleeper once and
// reuse it for 10 minutes instead of re-fetching on every tab switch.
const CACHE_MS = 10 * 60 * 1000;
let cache = null; // { week, season, at }
let inflight = null;

function fetchState() {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("https://api.sleeper.app/v1/state/nfl")
      .then((res) => {
        if (!res.ok) throw new Error(`Sleeper responded ${res.status}`);
        return res.json();
      })
      .then((state) => {
        if (!state || !state.week) throw new Error("Sleeper returned no week");
        cache = { week: state.week, season: state.season, at: Date.now() };
        return cache;
      })
      .catch((err) => {
        console.error("Failed to fetch current NFL week:", err);
        // If we already know a week from earlier, keep using it (not cached
        // as fresh, so the next call tries again). If we have never known
        // the week, report an error instead of silently guessing Week 1.
        if (cache) return { week: cache.week, season: cache.season, at: 0 };
        return { week: null, season: null, at: 0, error: true };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function getFreshCache() {
  return cache && Date.now() - cache.at < CACHE_MS ? cache : null;
}

export function useCurrentWeek() {
  const [state, setState] = useState(getFreshCache);

  const load = useCallback(() => {
    let alive = true;
    fetchState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const retry = useCallback(() => {
    setState(null);
    load();
  }, [load]);

  return {
    week: state ? state.week : null,
    season: state ? state.season : null,
    loading: state === null,
    error: !!(state && state.error),
    retry,
  };
}
