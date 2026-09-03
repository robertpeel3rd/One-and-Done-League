import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

export function Teams({ myTeamId }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentWeek && selectedWeek === null) {
      setSelectedWeek(currentWeek);
    }
  }, [currentWeek, selectedWeek]);

  async function loadAll() {
    const [teamsSnap, playersSnap, lineupsSnap, scoresSnap] = await Promise.all([
      getDocs(collection(db, "teams")),
      getDocs(collection(db, "players")),
      getDocs(collection(db, "lineups")),
      getDocs(collection(db, "liveScores")),
    ]);
    setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const playerById = useMemo(() => {
    const map = {};
    players.forEach((p) => (map[p.id] = p));
    return map;
  }, [players]);

  const teamRows = useMemo(() => {
    if (teams.length === 0 || !selectedWeek) return [];
    return teams
      .map((t) => {
        const lineup = lineups.find((l) => l.teamId === t.id && l.week === selectedWeek);
        const slots = lineup?.slots || {};
        const slotEntries = SLOTS.map((pos, idx) => {
          const playerId = slots[idx];
          const player = playerId ? playerById[playerId] : null;
          const pts = playerId ? scoresByPlayer[playerId] || 0 : 0;
          return { pos, player, pts };
        });
        const total = Math.round(slotEntries.reduce((sum, s) => sum + s.pts, 0) * 10) / 10;
        return { team: t, slotEntries, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [teams, lineups, scoresByPlayer, playerById, selectedWeek]);

  if (loading || weekLoading || selectedWeek === null) return <p>Loading teams...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Week</span>
        <select value={selectedWeek} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        Ranked by Week {selectedWeek} Weekly Points
        {selectedWeek === currentWeek ? ", updates automatically." : "."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {teamRows.map(({ team, slotEntries, total }, i) => {
          const isMine = team.id === myTeamId;
          return (
            <div
              key={team.id}
              style={{
                borderRadius: "var(--radius)",
                overflow: "hidden",
                border: "0.5px solid var(--border)",
              }}
            >
              <div
                style={{
                  padding: "0.6rem 0.9rem",
                  fontWeight: 600,
                  display: "flex",
                  justifyContent: "space-between",
                  background: isMine ? "var(--bg-accent)" : "var(--surface-1)",
                  color: isMine ? "var(--text-accent)" : "inherit",
                }}
              >
                <span>{i + 1}. {team.name}</span>
                <span>{total} pts</span>
              </div>
              {slotEntries.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.4rem 0.9rem",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    borderTop: "0.5px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.pos}</span>{" "}
                    {s.player ? s.player.name.split(" ").slice(-1)[0] : "—"}
                  </span>
                  <span>{s.pts}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
