import { useEffect, useMemo, useRef, useState } from "react";
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
const SAVE_DEBOUNCE_MS = 1000;
const SAVED_DISPLAY_MS = 2000;

const SORT_OPTIONS = [
  { key: "az", label: "A-Z" },
  { key: "projected", label: "Projected Points" },
  { key: "season", label: "Season Total" },
];

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

// Compact kickoff display: always includes the day, drops "ET" and spells
// out AM/PM as a lowercase a/p instead (e.g. "Sun 1:00p", "Thu 8:35p").
function formatKickoffCompact(kickoffTime) {
  if (!kickoffTime) return null;
  const formatted = new Date(kickoffTime).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return formatted.replace(",", "").replace(" AM", "a").replace(" PM", "p");
}

function seasonTotalFor(player) {
  if (!player.weeklyPoints) return 0;
  return Object.values(player.weeklyPoints).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );
}

function sortPickerPool(pool, sortMode) {
  if (sortMode === "projected") {
    return [...pool].sort((a, b) => {
      const aHas = typeof a.projectedPoints === "number";
      const bHas = typeof b.projectedPoints === "number";
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && b.projectedPoints !== a.projectedPoints) {
        return b.projectedPoints - a.projectedPoints;
      }
      return lastName(a.name).localeCompare(lastName(b.name));
    });
  }
  if (sortMode === "season") {
    return [...pool].sort((a, b) => {
      const aTotal = seasonTotalFor(a);
      const bTotal = seasonTotalFor(b);
      const aHas = aTotal > 0;
      const bHas = bTotal > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && bTotal !== aTotal) return bTotal - aTotal;
      return lastName(a.name).localeCompare(lastName(b.name));
    });
  }
  return [...pool].sort((a, b) =>
    lastName(a.name).localeCompare(lastName(b.name))
  );
}

// Small lock glyph matching the app header logo's blue accent styling
// (a real line-drawn icon, not an emoji). Appears only on locked slots.
function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-accent)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function RosterBuilder({ team }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [players, setPlayers] = useState([]);
  const [allLineups, setAllLineups] = useState([]);
  const [localSlots, setLocalSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("az");

  // Auto-save status: which slot indices are currently in a save cycle, and
  // what that cycle's status is. Only rows in `slots` show a non-default
  // button label; every other row just shows its normal "Edit"/lock state.
  const [saveState, setSaveState] = useState({ status: "idle", slots: new Set() });
  const [wobbleKeys, setWobbleKeys] = useState({});

  // Refs so the debounced save (a setTimeout callback) always reads the
  // latest local edits, never a stale closure snapshot.
  const localSlotsRef = useRef(localSlots);
  const pendingChangesRef = useRef(new Set());
  const debounceTimerRef = useRef(null);
  const saveTokenRef = useRef(0);

  useEffect(() => {
    localSlotsRef.current = localSlots;
  }, [localSlots]);

  useEffect(() => {
    if (currentWeek && selectedWeek === null) {
      setSelectedWeek(currentWeek);
    }
  }, [currentWeek, selectedWeek]);

  useEffect(() => {
    async function loadPlayers() {
      const [playersSnap, liveScoresSnap] = await Promise.all([
        getDocs(collection(db, "players")),
        getDocs(collection(db, "liveScores")),
      ]);
      const liveScoresById = {};
      liveScoresSnap.docs.forEach((d) => {
        liveScoresById[d.id] = d.data();
      });
      setPlayers(
        playersSnap.docs.map((d) => {
          const ls = liveScoresById[d.id];
          return {
            id: d.id,
            ...d.data(),
            projectedPoints: ls?.projectedPoints,
            weeklyPoints: ls?.weeklyPoints,
          };
        })
      );
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
    setSaveState({ status: "idle", slots: new Set() });
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
    setSearchTerm("");
    setSortMode("az");
  }

  function closePicker() {
    setPickerSlot(null);
    setSearchTerm("");
  }

  function triggerWobble(slotIndex) {
    setWobbleKeys((prev) => ({ ...prev, [slotIndex]: (prev[slotIndex] || 0) + 1 }));
  }

  // Performs the actual Firestore write for a specific week/slots snapshot.
  // Real await + try/catch, UI only ever reflects a confirmed successful
  // write — never an optimistic assumption. This preserves the exact
  // pattern required by the historical "picks silently didn't save" bug
  // fix; see future-improvements.md for the full writeup if this is ever
  // touched again.
  async function performSave(weekToSave, slotsToSave, slotIndices) {
    const myToken = ++saveTokenRef.current;
    setSaveState({ status: "saving", slots: new Set(slotIndices) });
    try {
      const ref = doc(db, "lineups", lineupDocId(team.id, weekToSave));
      await setDoc(ref, { teamId: team.id, week: weekToSave, slots: slotsToSave });
      setAllLineups((prev) => {
        const existingIdx = prev.findIndex((l) => l.week === weekToSave);
        const updated = { teamId: team.id, week: weekToSave, slots: slotsToSave };
        if (existingIdx === -1) return [...prev, updated];
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      });
      if (saveTokenRef.current === myToken) {
        setSaveState({ status: "saved", slots: new Set(slotIndices) });
        setTimeout(() => {
          if (saveTokenRef.current === myToken) {
            setSaveState({ status: "idle", slots: new Set() });
          }
        }, SAVED_DISPLAY_MS);
      }
    } catch (err) {
      if (saveTokenRef.current === myToken) {
        setSaveState({ status: "error", slots: new Set(slotIndices) });
      }
      // No manual retry — the next edit (to any slot) schedules a fresh
      // save of the entire current localSlots, which naturally retries
      // whatever failed here too.
    }
  }

  // Debounces ~1s after the last change in a burst before actually saving,
  // so picking several players quickly doesn't fire several separate writes.
  function scheduleSave(slotIndex) {
    pendingChangesRef.current.add(slotIndex);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const weekAtEditTime = selectedWeek;
    debounceTimerRef.current = setTimeout(() => {
      const slotIndices = Array.from(pendingChangesRef.current);
      pendingChangesRef.current = new Set();
      debounceTimerRef.current = null;
      performSave(weekAtEditTime, localSlotsRef.current, slotIndices);
    }, SAVE_DEBOUNCE_MS);
  }

  // Immediately flushes any pending debounced save rather than letting it
  // fire later against a since-overwritten localSlots ref. Called right
  // before switching weeks, since the week-switch effect above resets
  // localSlots to the newly-selected week's saved data — without this
  // flush, a still-pending save could end up writing the WRONG week's data
  // to the OLD week's document once the debounce timer eventually fired.
  function flushPendingSave() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingChangesRef.current.size > 0) {
      const slotIndices = Array.from(pendingChangesRef.current);
      pendingChangesRef.current = new Set();
      performSave(selectedWeek, localSlotsRef.current, slotIndices);
    }
  }

  function confirmPick(playerId) {
    if (pickerSlot === null || !playerId) return;
    const slotIndex = pickerSlot;
    setLocalSlots((prev) => ({ ...prev, [slotIndex]: playerId }));
    scheduleSave(slotIndex);
    closePicker();
  }

  function clearSlot(slotIndex) {
    if (isLockedIn(slotIndex)) return;
    setLocalSlots((prev) => {
      const next = { ...prev };
      delete next[slotIndex];
      return next;
    });
    scheduleSave(slotIndex);
  }

  const pickerPool = useMemo(() => {
    if (pickerSlot === null) return [];
    const pos = SLOTS[pickerSlot];
    const term = searchTerm.trim().toLowerCase();
    const filtered = players
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
      });
    return sortPickerPool(filtered, sortMode);
  }, [pickerSlot, players, searchTerm, localSlots, usedPlayerIds, sortMode]);

  if (weekLoading || loading || selectedWeek === null) return <p>Loading your lineup...</p>;

  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const pickerHasPlayer = pickerSlot !== null && Boolean(localSlots[pickerSlot]);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Week</span>
        <select
          value={selectedWeek}
          onChange={(e) => {
            flushPendingSave();
            setSelectedWeek(Number(e.target.value));
            closePicker();
          }}
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
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sort</span>
                  {SORT_OPTIONS.map((opt) => {
                    const active = sortMode === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setSortMode(opt.key)}
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: active ? "var(--text-accent)" : "transparent",
                          color: active ? "var(--surface-2)" : "var(--text-secondary)",
                          border: active ? "none" : "0.5px solid var(--border-strong)",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
                  {pickerPool.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => !p.locked && confirmPick(p.id)}
                      disabled={p.locked}
                      style={{ textAlign: "left", opacity: p.locked ? 0.4 : 1 }}
                    >
                      {p.name}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {p.pos} · {p.team}
                        {!p.gameStarted && p.kickoffTime && (
                          <>
                            {" "}· {formatKickoffCompact(p.kickoffTime)}
                            {p.opponent ? ` ${p.isHome ? "vs" : "@"} ${p.opponent}` : ""}
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                  {pickerPool.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No matches.</p>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={closePicker} style={{ flex: 1 }}>Cancel</button>
                  <button
                    onClick={() => {
                      clearSlot(idx);
                      closePicker();
                    }}
                    disabled={!pickerHasPlayer}
                    style={{
                      flex: 1,
                      color: pickerHasPlayer ? "var(--text-danger)" : "var(--text-muted)",
                      border: pickerHasPlayer ? "1px solid var(--text-danger)" : "1px solid var(--border)",
                      opacity: pickerHasPlayer ? 1 : 0.5,
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            );
          }

          const isSaving = saveState.status === "saving" && saveState.slots.has(idx);
          const isSaved = saveState.status === "saved" && saveState.slots.has(idx);
          const isError = saveState.status === "error" && saveState.slots.has(idx);
          const isCompact = isSaving || isSaved;

          return (
            <div
              key={`slot-${idx}-${wobbleKeys[idx] || 0}`}
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 8,
                animation: wobbleKeys[idx] ? "oadWobble 0.5s cubic-bezier(.36,.07,.19,.97)" : "none",
              }}
            >
              <div
                style={{
                  width: 44,
                  flexShrink: 0,
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--surface-1)",
                  color: "var(--text-secondary)",
                  border: "0.5px solid var(--border-strong)",
                }}
              >
                {pos}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.7rem",
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  {player ? (
                    <>
                      {player.name}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({player.team})</span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>empty</span>
                  )}
                </span>

                {!isReadOnly && (
                  <div style={{ width: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {locked ? (
                      <button
                        onClick={() => triggerWobble(idx)}
                        aria-label="Locked — game has started"
                        style={{
                          width: 32,
                          height: 32,
                          minHeight: 32,
                          boxSizing: "border-box",
                          borderRadius: "50%",
                          border: "1.5px solid var(--text-accent)",
                          background: "var(--bg-accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                        }}
                      >
                        <LockIcon />
                      </button>
                    ) : (
                      <button
                        onClick={() => openPicker(idx)}
                        style={{
                          height: 32,
                          minHeight: 32,
                          boxSizing: "border-box",
                          padding: isCompact ? "0 8px" : "0 16px",
                          fontSize: isCompact ? 12 : 13,
                          borderRadius: "var(--radius)",
                          border: isCompact
                            ? "1px solid var(--text-success)"
                            : isError
                            ? "1px solid var(--text-danger)"
                            : "1px solid var(--border-strong)",
                          background: isCompact ? "var(--bg-success)" : "var(--surface-2)",
                          color: isCompact
                            ? "var(--text-success)"
                            : isError
                            ? "var(--text-danger)"
                            : "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isSaving ? "Saving..." : isSaved ? "✓ Saved" : isError ? "⚠ Error" : "Edit"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
