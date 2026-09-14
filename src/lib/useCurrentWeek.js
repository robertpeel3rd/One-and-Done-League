import { useEffect, useState } from "react";

export function useCurrentWeek() {
  const [week, setWeek] = useState(null);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("https://api.sleeper.app/v1/state/nfl");
        const state = await res.json();
        setWeek(state.week || 1);
        setSeason(state.season);
      } catch (err) {
        console.error("Failed to fetch current NFL week, falling back to week 1:", err);
        setWeek(1);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { week, season, loading };
}
