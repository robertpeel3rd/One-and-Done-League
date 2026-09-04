import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

export function WeeklyScoring({ myTeamId }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedTeamId, setExpandedTeamId] = useState(null);

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

  if (loading || weekLoading || selectedWeek === null) return <p>Loading weekly scoring...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Week</span>
        <select value={selectedWeek} onChange={(e) => { setSelectedWeek(Number(e.target.value)); setExpandedTeamId(null); }}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        Weekly Points for Week {selectedWeek}
        {selectedWeek === currentWeek ? ", updated automatically." : "."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {teamRows.map(({ team, slotEntries, total }, i) => {
          const isMine = team.id === myTeamId;
          const isExpanded = expandedTeamId === team.id;
          return (
            <div key={team.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
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
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  border: isExpanded ? "0.5px solid var(--border-strong)" : "none",
                }}
              >
                <button
                  onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.6rem 0.9rem",
                    background: isMine ? "var(--bg-accent)" : "var(--surface-1)",
                    color: isMine ? "var(--text-accent)" : "inherit",
                    border: "none",
                    borderRadius: isExpanded ? 0 : "var(--radius)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    {team.name}
                    <i
                      className={`ti ti-chevron-${isExpanded ? "up" : "down"}`}
                      style={{ fontSize: 13, marginLeft: 6, verticalAlign: -1 }}
                      aria-hidden="true"
                    />
                  </span>
                  <span style={{ flexShrink: 0, textAlign: "right", fontWeight: 700, marginLeft: 8 }}>
                    {total}
                  </span>
                </button>

                {isExpanded &&
                  slotEntries.map((s, idx) => (
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
                        {s.player ? `${s.player.name} (${s.player.team})` : "—"}
                      </span>
                      <span>{s.pts}</span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
