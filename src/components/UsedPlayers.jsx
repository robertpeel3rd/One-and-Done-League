import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

function lastName(fullName = "") {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || fullName;
}

export function UsedPlayers({ team }) {
  const [players, setPlayers] = useState([]);
  const [usedEntries, setUsedEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [playersSnap, lineupsSnap] = await Promise.all([
        getDocs(collection(db, "players")),
        getDocs(query(collection(db, "lineups"), where("teamId", "==", team.id))),
      ]);

      setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const entries = [];
      lineupsSnap.docs.forEach((d) => {
        const data = d.data();
        Object.values(data.slots || {}).forEach((playerId) => {
          if (playerId) entries.push({ playerId, week: data.week });
        });
      });
      setUsedEntries(entries);
      setLoading(false);
    }
    load();
  }, [team.id]);

  const usedPlayers = useMemo(() => {
    return usedEntries
      .map((entry) => {
        const player = players.find((p) => p.id === entry.playerId);
        return player ? { ...player, week: entry.week } : null;
      })
      .filter(Boolean)
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  }, [usedEntries, players]);

  if (loading) return <p>Loading used players...</p>;

  if (usedPlayers.length === 0) {
    return <p style={{ color: "var(--text-muted, #888)" }}>No players used yet this season.</p>;
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
        These players have already been started this season and can't be used again.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {usedPlayers.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.5rem 0.7rem",
              background: "var(--surface-1, #f5f5f5)",
              borderRadius: "var(--radius, 6px)",
            }}
          >
            <span>{p.name} <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>({p.pos} · {p.team})</span></span>
            <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>Week {p.week}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
