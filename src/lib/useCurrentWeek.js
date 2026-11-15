import { useEffect, useState } from "react";

// The current NFL week barely changes, so fetch it from Sleeper once and
// reuse it for 10 minutes instead of re-fetching on every tab switch.
const CACHE_MS = 10 * 60 * 1000;
let cache = null; // { week, season, at }
let inflight = null;

function fetchState() {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("https://api.sleeper.app/v1/state/nfl")
      .then((res) => res.json())
      .then((state) => {
        cache = { week: state.week || 1, season: state.season, at: Date.now() };
        return cache;
      })
      .catch((err) => {
        console.error("Failed to fetch current NFL week, falling back to week 1:", err);
        // Don't cache the fallback, so the next call tries again.
        return { week: cache?.week || 1, season: cache?.season ?? null, at: 0 };
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

  useEffect(() => {
    let alive = true;
    fetchState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    week: state ? state.week : null,
    season: state ? state.season : null,
    loading: state === null,
  };
}
