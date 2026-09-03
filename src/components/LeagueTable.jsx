import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

export function LeagueTable() {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [mode, setMode] = useState("total");
  const [teams, setTeams] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    loadAll();
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

  const totalStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    const completedWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);
    const leaguePointTotals = {};
    teams.forEach((t) => (leaguePointTotals[t.id] = 0));
    completedWeeks.forEach((week) => {
      const computedWeekPts = leaguePointsForWeek(week);
      teams.forEach((t) => {
        leaguePointTotals[t.id] += leaguePointsForTeamWeek(t.id, week, computedWeekPts);
      });
    });
    return teams.map((t) => ({ ...t, leaguePoints: leaguePointTotals[t.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints);
  }, [teams, lineups, scoresByPlayer, currentWeek, overrides]);

  const liveStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    return teams
      .map((t) => ({ ...t, weekPoints: Math.round(weeklyTotal(t.id, currentWeek) * 10) / 10 }))
      .sort((a, b) => b.weekPoints - a.weekPoints);
  }, [teams, lineups, scoresByPlayer, currentWeek]);

  if (loading || weekLoading) return <p>Loading league table...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode("total")} style={{ fontWeight: mode === "total" ? 700 : 400 }}>
          Total League Points
        </button>
        <button onClick={() => setMode("live")} style={{ fontWeight: mode === "live" ? 700 : 400 }}>
          Live Scoring
        </button>
      </div>

      {mode === "total" ? (
        <>
          <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
            Total League Points from completed weeks (through Week {currentWeek - 1 || 0}).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {totalStandings.map((t, i) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.7rem", background: "var(--surface-1, #f5f5f5)", borderRadius: "var(--radius, 6px)" }}>
                <span>{i + 1}. {t.name}</span>
                <span style={{ fontWeight: 500 }}>{t.leaguePoints} League Points</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
            Live standings for Week {currentWeek}, as scored at this moment.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {liveStandings.map((t, i) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.7rem", background: "var(--surface-1, #f5f5f5)", borderRadius: "var(--radius, 6px)" }}>
                <span>{i + 1}. {t.name}</span>
                <span style={{ fontWeight: 500 }}>{t.weekPoints} points</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
