import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

function lastName(fullName = "") {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || fullName;
}

function lineupDocId(teamId, week) {
  return `${teamId}_${week}`;
}

export function RosterBuilder({ team }) {
  const [week, setWeek] = useState(1);
  const [players, setPlayers] = useState([]);
  const [usedPlayerIds, setUsedPlayerIds] = useState(new Set());
  const [currentSlots, setCurrentSlots] = useState({}); // { slotIndex: playerId }
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Load the full player pool once.
  useEffect(() => {
    async function loadPlayers() {
      const snap = await getDocs(collection(db, "players"));
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    loadPlayers();
  }, []);

  // Load every lineup this team has ever set, to compute which players are
  // already used (locked out for the rest of the season), and load this
  // week's current picks.
  useEffect(() => {
    async function loadLineups() {
      setLoading(true);
      const q = query(collection(db, "lineups"), where("teamId", "==", team.id));
      const snap = await getDocs(q);

      const used = new Set();
      let thisWeekSlots = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const slots = data.slots || {};
        Object.values(slots).forEach((pid) => pid && used.add(pid));
        if (data.week === week) {
          thisWeekSlots = slots;
        }
      });

      setUsedPlayerIds(used);
      setCurrentSlots(thisWeekSlots);
      setLoading(false);
    }
    loadLineups();
  }, [team.id, week]);

  async function assignPlayer(slotIndex, playerId) {
    const newSlots = { ...currentSlots, [slotIndex]: playerId };
    setCurrentSlots(newSlots);
    setUsedPlayerIds((prev) => new Set(prev).add(playerId));

    const ref = doc(db, "lineups", lineupDocId(team.id, week));
    await setDoc(
      ref,
      { teamId: team.id, week, slots: newSlots },
      { merge: true }
    );
    setPickerSlot(null);
    setSearchTerm("");
  }

  async function clearSlot(slotIndex) {
    const clearedPlayerId = currentSlots[slotIndex];
    const newSlots = { ...currentSlots };
    delete newSlots[slotIndex];
    setCurrentSlots(newSlots);
    if (clearedPlayerId) {
      setUsedPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(clearedPlayerId);
        return next;
      });
    }

    const ref = doc(db, "lineups", lineupDocId(team.id, week));
    await updateDoc(ref, { [`slots.${slotIndex}`]: deleteField() }).catch(() => {
      // doc might not exist yet if nothing was ever saved for this week
    });
  }

  const pickerPool = useMemo(() => {
    if (pickerSlot === null) return [];
    const pos = SLOTS[pickerSlot];
    const term = searchTerm.trim().toLowerCase();
    return players
      .filter((p) => (pos === "FLEX" ? FLEX_ELIGIBLE.includes(p.pos) : p.pos === pos))
      .filter((p) => !term || (p.name || "").toLowerCase().includes(term))
      .map((p) => {
        const usedElsewhereThisWeek = Object.entries(currentSlots).some(
          ([idx, pid]) => pid === p.id && Number(idx) !== pickerSlot
        );
        const usedInPastWeek = usedPlayerIds.has(p.id) && currentSlots[pickerSlot] !== p.id;
        // NOTE: kickoff-time lock isn't wired up yet — players stay selectable
        // right up until game data is added to the players collection.
        const locked = usedElsewhereThisWeek || usedInPastWeek;
        return { ...p, locked };
      })
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .slice(0, 100);
  }, [pickerSlot, players, searchTerm, currentSlots, usedPlayerIds]);

  if (loading) return <p>Loading your roster...</p>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Week</h3>
        <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {SLOTS.map((pos, idx) => {
          const pid = currentSlots[idx];
          const player = players.find((p) => p.id === pid);
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.7rem",
                background: "var(--surface-1, #f5f5f5)",
                borderRadius: "var(--radius, 6px)",
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: "var(--text-secondary, #666)", marginRight: 8 }}>
                  {pos}
                </span>
                {player ? (
                  <span>
                    {player.name}{" "}
                    <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>
                      ({player.team})
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted, #888)" }}>empty</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setPickerSlot(idx); setSearchTerm(""); }}>
                  {player ? "swap" : "pick"}
                </button>
                {player && <button onClick={() => clearSlot(idx)}>clear</button>}
              </div>
            </div>
          );
        })}
      </div>

      {pickerSlot !== null && (
        <div style={{ background: "var(--surface-1, #f5f5f5)", borderRadius: "var(--radius, 6px)", padding: "0.8rem" }}>
          <input
            placeholder={`Search ${SLOTS[pickerSlot]}s...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
            autoFocus
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
            {pickerPool.map((p) => (
              <button
                key={p.id}
                onClick={() => !p.locked && assignPlayer(pickerSlot, p.id)}
                disabled={p.locked}
                style={{ textAlign: "left", opacity: p.locked ? 0.4 : 1 }}
              >
                {p.name}{" "}
                <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>
                  {p.pos} · {p.team}
                </span>
              </button>
            ))}
            {pickerPool.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted, #888)" }}>No matches.</p>}
          </div>
          <button onClick={() => setPickerSlot(null)} style={{ marginTop: 8 }}>cancel</button>
        </div>
      )}
    </div>
  );
}