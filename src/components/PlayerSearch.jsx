import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

function lastName(fullName = "") {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || fullName;
}

// Loads the full player pool once and lets the owner search/filter it
// client-side. ~3,200 players is small enough to fetch in one shot rather
// than round-tripping to Firestore on every keystroke.
export function PlayerSearch() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");

  useEffect(() => {
    async function loadPlayers() {
      try {
        const snap = await getDocs(collection(db, "players"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPlayers(list);
      } catch (err) {
        setError("Couldn't load the player database.");
      } finally {
        setLoading(false);
      }
    }
    loadPlayers();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return players
      .filter((p) => posFilter === "ALL" || p.pos === posFilter)
      .filter((p) => !term || (p.name || "").toLowerCase().includes(term))
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .slice(0, 100); // cap rendered rows for performance
  }, [players, searchTerm, posFilter]);

  if (loading) return <p>Loading player database...</p>;
  if (error) return <p style={{ color: "var(--text-danger, #a32d2d)" }}>{error}</p>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Search players by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted, #888)", marginTop: 0 }}>
        {players.length} players loaded — showing {filtered.length}
        {filtered.length === 100 ? " (top 100, refine your search)" : ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
        {filtered.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.4rem 0.6rem",
              background: "var(--surface-1, #f5f5f5)",
              borderRadius: "var(--radius, 6px)",
            }}
          >
            <span>{p.name}</span>
            <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>
              {p.pos} · {p.team || "FA"}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: "var(--text-muted, #888)", fontSize: 13 }}>No players match.</p>
        )}
      </div>
    </div>
  );
}