import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

function lastName(fullName = "") {
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || fullName;
}

function lineupDocId(teamId, week) {
  return `${teamId}_${week}`;
}

function isGameStarted(kickoffTime) {
  if (!kickoffTime) return false;
  return Date.now() >= new Date(kickoffTime).getTime();
}

function formatKickoffET(kickoffTime) {
  if (!kickoffTime) return null;
  return new Date(kickoffTime).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RosterBuilder({ team }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [players, setPlayers] = useState([]);
  const [allLineups, setAllLineups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [pendingPlayerId, setPendingPlayerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (currentWeek && selectedWeek === null) {
      setSelectedWeek(currentWeek);
    }
  }, [currentWeek, selectedWeek]);

  useEffect(() => {
    async function loadPlayers() {
      const snap = await getDocs(collection(db, "players"));
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    loadPlayers();
  }, []);

  useEffect(() => {
    async function loadLineups() {
      setLoading(true);
      const q = query(collection(db, "lineups"), where("teamId", "==", team.id));
      const snap = await getDocs(q);
      setAllLineups(snap.docs.map((d) => d.data()));
      setLoading(false);
    }
    loadLineups();
  }, [team.id]);

  const isReadOnly = selectedWeek !== currentWeek;

  const usedPlayerIds = useMemo(() => {
    const used = new Set();
    allLineups.forEach((l) => {
      Object.values(l.slots || {}).forEach((pid) => pid && used.add(pid));
    });
    return used;
  }, [allLineups]);

  const currentSlots = useMemo(() => {
    const lineup = allLineups.find((l) => l.week === selectedWeek);
    return lineup?.slots || {};
  }, [allLineups, selectedWeek]);

  function isLockedIn(slotIndex) {
    const pid = currentSlots[slotIndex];
    if (!pid) return false;
    const player = players.find((p) => p.id === pid);
    return player && isGameStarted(player.kickoffTime);
  }

  function openPicker(slotIndex) {
    setPickerSlot(slotIndex);
    setPendingPlayerId(currentSlots[slotIndex] || null);
    setSearchTerm("");
  }

  function closePicker() {
    setPickerSlot(null);
    setPendingPlayerId(null);
    setSearchTerm("");
  }

  async function submitPick() {
    if (pickerSlot === null || !pendingPlayerId) return;
    const newSlots = { ...currentSlots, [pickerSlot]: pendingPlayerId };

    setAllLineups((prev) => {
      const existingIdx = prev.findIndex((l) => l.week === selectedWeek);
      const updated = { teamId: team.id, week: selectedWeek, slots: newSlots };
      if (existingIdx === -1) return [...prev, updated];
      const next = [...prev];
      next[existingIdx] = updated;
      return next;
    });

    const ref = doc(db, "lineups", lineupDocId(team.id, selectedWeek));
    await setDoc(ref, { teamId: team.id, week: selectedWeek, slots: newSlots }, { merge: true });
    closePicker();
  }

  async function clearSlot(slotIndex) {
    if (isLockedIn(slotIndex)) return;
    const newSlots = { ...currentSlots };
    delete newSlots[slotIndex];

    setAllLineups((prev) => {
      const existingIdx = prev.findIndex((l) => l.week === selectedWeek);
      if (existingIdx === -1) return prev;
      const next = [...prev];
      next[existingIdx] = { ...next[existingIdx], slots: newSlots };
      return next;
    });

    const ref = doc(db, "lineups", lineupDocId(team.id, selectedWeek));
    await updateDoc(ref, { [`slots.${slotIndex}`]: deleteField() }).catch(() => {});
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
        const gameStarted = isGameStarted(p.kickoffTime);
        const locked = usedElsewhereThisWeek || usedInPastWeek || gameStarted;
        return { ...p, locked, gameStarted };
      })
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .slice(0, 100);
  }, [pickerSlot, players, searchTerm, currentSlots, usedPlayerIds]);

  if (weekLoading || loading || selectedWeek === null) return <p>Loading your lineup...</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>Week</span>
        <select value={selectedWeek} onChange={(e) => { setSelectedWeek(Number(e.target.value)); closePicker(); }}>
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        {isReadOnly && (
          <span style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>viewing past week — read only</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {SLOTS.map((pos, idx) => {
          const isPicking = pickerSlot === idx;
          const pid = currentSlots[idx];
          const player = players.find((p) => p.id === pid);
          const locked = isLockedIn(idx);

          if (isPicking) {
            return (
              <div
                key={idx}
                style={{
                  background: "var(--surface-1, #f5f5f5)",
                  borderRadius: "var(--radius, 6px)",
                  padding: "0.6rem 0.7rem",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary, #666)", marginBottom: 6 }}>
                  {pos}
                </div>
                <input
                  placeholder={`Search ${pos}s...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: "100%", marginBottom: 8 }}
                  autoFocus
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
                  {pickerPool.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => !p.locked && setPendingPlayerId(p.id)}
                      disabled={p.locked}
                      style={{
                        textAlign: "left",
                        opacity: p.locked ? 0.4 : 1,
                        outline: pendingPlayerId === p.id ? "2px solid #333" : "none",
                      }}
                    >
                      {p.name}{" "}
                      <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>
                        {p.pos} · {p.team}
                        {!p.gameStarted && p.kickoffTime && ` · ${formatKickoffET(p.kickoffTime)} ET`}
                      </span>
                    </button>
                  ))}
                  {pickerPool.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted, #888)" }}>No matches.</p>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={submitPick} disabled={!pendingPlayerId}>Submit</button>
                  <button onClick={closePicker}>Cancel</button>
                </div>
              </div>
            );
          }

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
                    {locked && (
                      <span style={{ color: "var(--text-danger, #a32d2d)", fontSize: 11, marginLeft: 6 }}>
                        locked
                      </span>
                    )}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted, #888)" }}>empty</span>
                )}
              </div>
              {!isReadOnly && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openPicker(idx)} disabled={locked}>
                    {player ? "swap" : "pick"}
                  </button>
                  {player && <button onClick={() => clearSlot(idx)} disabled={locked}>clear</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
