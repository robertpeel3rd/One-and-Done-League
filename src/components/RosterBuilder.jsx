import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
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
  const [localSlots, setLocalSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [pendingPlayerId, setPendingPlayerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  useEffect(() => {
    if (selectedWeek === null) return;
    const savedLineup = allLineups.find((l) => l.week === selectedWeek);
    setLocalSlots(savedLineup?.slots || {});
    setHasUnsavedChanges(false);
    setSaveStatus("idle");
  }, [selectedWeek, allLineups]);

  const isReadOnly = selectedWeek !== currentWeek;

  const usedPlayerIds = useMemo(() => {
    const used = new Set();
    allLineups.forEach((l) => {
      if (l.week === selectedWeek) return;
      Object.values(l.slots || {}).forEach((pid) => pid && used.add(pid));
    });
    Object.values(localSlots).forEach((pid) => pid && used.add(pid));
    return used;
  }, [allLineups, localSlots, selectedWeek]);

  function isLockedIn(slotIndex) {
    const pid = localSlots[slotIndex];
    if (!pid) return false;
    const player = players.find((p) => p.id === pid);
    return player && isGameStarted(player.kickoffTime);
  }

  function openPicker(slotIndex) {
    setPickerSlot(slotIndex);
    setPendingPlayerId(localSlots[slotIndex] || null);
    setSearchTerm("");
  }

  function closePicker() {
    setPickerSlot(null);
    setPendingPlayerId(null);
    setSearchTerm("");
  }

  function confirmPick() {
    if (pickerSlot === null || !pendingPlayerId) return;
    setLocalSlots((prev) => ({ ...prev, [pickerSlot]: pendingPlayerId }));
    setHasUnsavedChanges(true);
    setSaveStatus("idle");
    closePicker();
  }

  function clearSlot(slotIndex) {
    if (isLockedIn(slotIndex)) return;
    setLocalSlots((prev) => {
      const next = { ...prev };
      delete next[slotIndex];
      return next;
    });
    setHasUnsavedChanges(true);
    setSaveStatus("idle");
  }

  async function saveLineup() {
    setSaveStatus("saving");
    try {
      const ref = doc(db, "lineups", lineupDocId(team.id, selectedWeek));
      await setDoc(ref, { teamId: team.id, week: selectedWeek, slots: localSlots });
      setAllLineups((prev) => {
        const existingIdx = prev.findIndex((l) => l.week === selectedWeek);
        const updated = { teamId: team.id, week: selectedWeek, slots: localSlots };
        if (existingIdx === -1) return [...prev, updated];
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      });
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
    }
  }

  const pickerPool = useMemo(() => {
    if (pickerSlot === null) return [];
    const pos = SLOTS[pickerSlot];
    const term = searchTerm.trim().toLowerCase();
    return players
      .filter((p) => (pos === "FLEX" ? FLEX_ELIGIBLE.includes(p.pos) : p.pos === pos))
      .filter((p) => !term || (p.name || "").toLowerCase().includes(term))
      .map((p) => {
        const usedElsewhereThisWeek = Object.entries(localSlots).some(
          ([idx, pid]) => pid === p.id && Number(idx) !== pickerSlot
        );
        const usedInPastWeek = usedPlayerIds.has(p.id) && localSlots[pickerSlot] !== p.id;
        const gameStarted = isGameStarted(p.kickoffTime);
        const locked = usedElsewhereThisWeek || usedInPastWeek || gameStarted;
        return { ...p, locked, gameStarted };
      })
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .slice(0, 100);
  }, [pickerSlot, players, searchTerm, localSlots, usedPlayerIds]);

  if (weekLoading || loading || selectedWeek === null) return <p>Loading your lineup...</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Week</span>
        <select
          value={selectedWeek}
          onChange={(e) => { setSelectedWeek(Number(e.target.value)); closePicker(); }}
        >
          {weekOptions.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        {isReadOnly && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>viewing past week — read only</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {SLOTS.map((pos, idx) => {
          const isPicking = pickerSlot === idx;
          const pid = localSlots[idx];
          const player = players.find((p) => p.id === pid);
          const locked = isLockedIn(idx);

          if (isPicking) {
            return (
              <div
                key={idx}
                style={{
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius)",
                  padding: "0.6rem 0.7rem",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{pos}</div>
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
                        outline: pendingPlayerId === p.id ? "2px solid var(--text-accent)" : "none",
                      }}
                    >
                      {p.name}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {p.pos} · {p.team}
                        {!p.gameStarted && p.kickoffTime && ` · ${formatKickoffET(p.kickoffTime)} ET`}
                      </span>
                    </button>
                  ))}
                  {pickerPool.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No matches.</p>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={confirmPick} disabled={!pendingPlayerId}>Submit</button>
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
                background: "var(--surface-1)",
                borderRadius: "var(--radius)",
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 8 }}>{pos}</span>
                {player ? (
                  <span>
                    {player.name}{" "}
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({player.team})</span>
                    {locked && (
                      <span style={{ color: "var(--text-danger)", fontSize: 11, marginLeft: 6 }}>locked</span>
                    )}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>empty</span>
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

      {!isReadOnly && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={saveLineup}
            disabled={!hasUnsavedChanges || saveStatus === "saving"}
            style={{
              fontWeight: 500,
              background: hasUnsavedChanges ? "var(--bg-accent)" : undefined,
              color: hasUnsavedChanges ? "var(--text-accent)" : undefined,
            }}
          >
            {saveStatus === "saving" ? "Saving..." : "Save Lineup"}
          </button>
          {saveStatus === "saved" && (
            <p style={{ fontSize: 13, color: "var(--text-accent)", margin: 0 }}>Lineup saved.</p>
          )}
          {saveStatus === "error" && (
            <p style={{ fontSize: 13, color: "var(--text-danger)", margin: 0 }}>
              Couldn't save your lineup. Check your connection and try again.
            </p>
          )}
          {hasUnsavedChanges && saveStatus === "idle" && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              You have unsaved changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
