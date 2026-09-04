import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST"];

function lastName(fullName = "") {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || fullName;
}

export function UsedPlayers({ team }) {
  const [players, setPlayers] = useState([]);
  const [usedEntries, setUsedEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("az");

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

  const groupedByPosition = useMemo(() => {
    const usedPlayers = usedEntries
      .map((entry) => {
        const player = players.find((p) => p.id === entry.playerId);
        return player ? { ...player, week: entry.week } : null;
      })
      .filter(Boolean);

    const groups = {};
    usedPlayers.forEach((p) => {
      const pos = p.pos || "Other";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    });

    Object.keys(groups).forEach((pos) => {
      groups[pos].sort((a, b) => {
        if (sortBy === "team") return (a.team || "").localeCompare(b.team || "");
        if (sortBy === "week") return a.week - b.week;
        return lastName(a.name).localeCompare(lastName(b.name));
      });
    });

    return groups;
  }, [usedEntries, players, sortBy]);

  const orderedPositions = useMemo(() => {
    const present = Object.keys(groupedByPosition);
    return POSITION_ORDER.filter((pos) => present.includes(pos)).concat(
      present.filter((pos) => !POSITION_ORDER.includes(pos))
    );
  }, [groupedByPosition]);

  if (loading) return <p>Loading used players...</p>;

  if (orderedPositions.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>No players used yet this season.</p>;
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        These players have already been started this season and can't be used again.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sort</span>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "az", label: "A-Z" },
            { key: "team", label: "Team" },
            { key: "week", label: "Week" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                minHeight: 0,
                borderRadius: "var(--radius)",
                background: sortBy === opt.key ? "var(--text-primary)" : "transparent",
                color: sortBy === opt.key ? "var(--surface-2)" : "var(--text-secondary)",
                border: sortBy === opt.key ? "none" : "0.5px solid var(--border-strong)",
                fontWeight: sortBy === opt.key ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {orderedPositions.map((pos) => (
        <div key={pos} style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 6,
              letterSpacing: 0.5,
            }}
          >
            {pos}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {groupedByPosition[pos].map((p, idx) => (
              <div
                key={`${p.id}-${idx}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.7rem",
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius)",
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  {p.name} <span style={{ color: "var(--text-muted)" }}>({p.team})</span>
                </span>
                <span style={{ color: "var(--text-muted)", flexShrink: 0, marginLeft: 8 }}>Week {p.week}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
