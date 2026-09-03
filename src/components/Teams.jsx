import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

export function Teams() {
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
        <span style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>Week</span>
        <select value={selectedWeek} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
        Ranked by Week {selectedWeek} raw points
        {selectedWeek === currentWeek ? ", updates automatically." : "."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {teamRows.map(({ team, slotEntries, total }, i) => (
          <div
            key={team.id}
            style={{
              background: "var(--surface-1, #f5f5f5)",
              borderRadius: "var(--radius, 6px)",
              padding: "0.5rem 0.7rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginBottom: 4 }}>
              <span>{i + 1}. {team.name}</span>
              <span>{total} pts</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary, #666)", lineHeight: 1.6 }}>
              {slotEntries.map((s, idx) => (
                <span key={idx} style={{ marginRight: 10 }}>
                  {s.pos} {s.player ? `${s.player.name.split(" ").slice(-1)[0]} ${s.pts}` : "—"}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
