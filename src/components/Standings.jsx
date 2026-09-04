import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;

export function Standings({ myTeamId }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [mode, setMode] = useState("current");
  const [teams, setTeams] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [teamsSnap, lineupsSnap, scoresSnap, overridesSnap] = await Promise.all([
      getDocs(collection(db, "teams")),
      getDocs(collection(db, "lineups")),
      getDocs(collection(db, "liveScores")),
      getDocs(collection(db, "leaguePointOverrides")),
    ]);

    setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLineups(lineupsSnap.docs.map((d) => d.data()));

    const scoreMap = {};
    scoresSnap.docs.forEach((d) => {
      scoreMap[d.id] = d.data().points || 0;
    });
    setScoresByPlayer(scoreMap);

    const overrideMap = {};
    overridesSnap.docs.forEach((d) => {
      const data = d.data();
      overrideMap[`${data.teamId}_${data.week}`] = data.leaguePoints;
    });
    setOverrides(overrideMap);

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

  function leaguePointsForWeek(week) {
    const n = teams.length;
    const topHalfSize = Math.floor(n / 2);
    if (topHalfSize === 0) return {};
    const ranked = teams.map((t) => ({ id: t.id, pts: weeklyTotal(t.id, week) })).sort((a, b) => b.pts - a.pts);
    const result = {};
    let i = 0;
    while (i < topHalfSize) {
      let j = i;
      while (j + 1 < ranked.length && ranked[j + 1].pts === ranked[i].pts) j++;
      const tieCount = j - i + 1;
      let sum = 0;
      let slotsInTopHalf = 0;
      for (let rank = i; rank <= j; rank++) {
        if (rank < topHalfSize) {
          sum += topHalfSize - rank;
          slotsInTopHalf++;
        }
      }
      const share = slotsInTopHalf > 0 ? Math.floor(sum / tieCount) : 0;
      for (let k = i; k <= j; k++) result[ranked[k].id] = share;
      i = j + 1;
    }
    return result;
  }

  function leaguePointsForTeamWeek(teamId, week, computedMap) {
    const overrideKey = `${teamId}_${week}`;
    if (overrideKey in overrides) return overrides[overrideKey];
    return computedMap[teamId] || 0;
  }

  function sumWeeks(weeks) {
    const totals = {};
    teams.forEach((t) => (totals[t.id] = 0));
    weeks.forEach((week) => {
      const computed = leaguePointsForWeek(week);
      teams.forEach((t) => {
        totals[t.id] += leaguePointsForTeamWeek(t.id, week, computed);
      });
    });
    return teams.map((t) => ({ ...t, leaguePoints: totals[t.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints);
  }

  const currentStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    const completedWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);
    return sumWeeks(completedWeeks);
  }, [teams, lineups, scoresByPlayer, currentWeek, overrides]);

  const liveStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    const weeksIncludingCurrent = Array.from({ length: currentWeek }, (_, i) => i + 1);
    return sumWeeks(weeksIncludingCurrent);
  }, [teams, lineups, scoresByPlayer, currentWeek, overrides]);

  if (loading || weekLoading) return <p>Loading standings...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  const standings = mode === "current" ? currentStandings : liveStandings;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode("current")} style={{ fontWeight: mode === "current" ? 700 : 400 }}>
          Current Standings
        </button>
        <button onClick={() => setMode("live")} style={{ fontWeight: mode === "live" ? 700 : 400 }}>
          Live Standings
        </button>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        {mode === "current"
          ? `League Points from completed weeks (through Week ${currentWeek - 1 || 0}).`
          : `League Points through completed weeks, plus what Week ${currentWeek} would add if it ended right now. Updates automatically.`}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {standings.map((t, i) => {
          const isMine = t.id === myTeamId;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <div
                style={{
                  width: 32,
                  flexShrink: 0,
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  background: isMine ? "var(--text-accent)" : "var(--surface-1)",
                  color: isMine ? "var(--surface-2)" : "var(--text-secondary)",
                  border: isMine ? "none" : "0.5px solid var(--border-strong)",
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.7rem",
                  background: isMine ? "var(--bg-accent)" : "var(--surface-1)",
                  color: isMine ? "var(--text-accent)" : "inherit",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{t.name}</span>
                <span style={{ flexShrink: 0, textAlign: "right", fontWeight: 500, marginLeft: 8 }}>
                  {t.leaguePoints} League Points
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
