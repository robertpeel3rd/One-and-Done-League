import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;

export function WeeklyScoring() {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [teams, setTeams] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentWeek && selectedWeek === null) {
      setSelectedWeek(currentWeek);
    }
  }, [currentWeek, selectedWeek]);

  async function loadAll() {
    const [teamsSnap, lineupsSnap, scoresSnap] = await Promise.all([
      getDocs(collection(db, "teams")),
      getDocs(collection(db, "lineups")),
      getDocs(collection(db, "liveScores")),
    ]);
    setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLineups(lineupsSnap.docs.map((d) => d.data()));
    const scoreMap = {};
    scoresSnap.docs.forEach((d) => {
      scoreMap[d.id] = d.data().points || 0;
    });
    setScoresByPlayer(scoreMap);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function weeklyTotal(teamId, week) {
    const lineup = lineups.find((l) => l.teamId === teamId && l.week === week);
    if (!lineup || !lineup.slots) return 0;
    return Object.values(lineup.slots).reduce((sum, playerId) => sum + (scoresByPlayer[playerId] || 0), 0);
  }

  const standings = useMemo(() => {
    if (teams.length === 0 || !selectedWeek) return [];
    return teams
      .map((t) => ({ ...t, weekPoints: Math.round(weeklyTotal(t.id, selectedWeek) * 10) / 10 }))
      .sort((a, b) => b.weekPoints - a.weekPoints);
  }, [teams, lineups, scoresByPlayer, selectedWeek]);

  if (loading || weekLoading || selectedWeek === null) return <p>Loading weekly scoring...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>Week</span>
        <select value={selectedWeek} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
        Raw fantasy points for Week {selectedWeek}
        {selectedWeek === currentWeek ? ", updated automatically." : "."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {standings.map((t, i) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.7rem", background: "var(--surface-1, #f5f5f5)", borderRadius: "var(--radius, 6px)" }}>
            <span>{i + 1}. {t.name}</span>
            <span style={{ fontWeight: 500 }}>{t.weekPoints} points</span>
          </div>
        ))}
      </div>
    </div>
  );
}
