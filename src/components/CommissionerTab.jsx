import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

export function CommissionerTab({ user }) {
  const [settings, setSettings] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoCommTeam, setSelectedCoCommTeam] = useState("");

  const [overrideTeamId, setOverrideTeamId] = useState("");
  const [overrideWeek, setOverrideWeek] = useState(1);
  const [overrideSlot, setOverrideSlot] = useState(0);
  const [overridePlayerId, setOverridePlayerId] = useState("");

  const [pointsTeamId, setPointsTeamId] = useState("");
  const [pointsWeek, setPointsWeek] = useState(1);
  const [pointsValue, setPointsValue] = useState("");

  async function loadEverything() {
    setLoading(true);
    const settingsSnap = await getDoc(doc(db, "leagueSettings", "main"));
    setSettings(settingsSnap.exists() ? settingsSnap.data() : null);
    const teamsSnap = await getDocs(collection(db, "teams"));
    setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => {
    loadEverything();
  }, []);

  const isCommissioner = settings?.commissionerUids?.includes(user.uid);

  async function becomeCommissioner() {
    await setDoc(doc(db, "leagueSettings", "main"), {
      commissionerUids: [user.uid],
      rosterSlots: SLOTS,
    });
    await loadEverything();
  }

  async function addCoCommissioner() {
    const team = teams.find((t) => t.id === selectedCoCommTeam);
    if (!team) return;
    await updateDoc(doc(db, "leagueSettings", "main"), {
      commissionerUids: arrayUnion(team.ownerUid),
    });
    setSelectedCoCommTeam("");
    await loadEverything();
  }

  async function removeCoCommissioner(uid) {
    if (uid === user.uid) return;
    await updateDoc(doc(db, "leagueSettings", "main"), {
      commissionerUids: arrayRemove(uid),
    });
    await loadEverything();
  }

  async function submitLineupOverride() {
    if (!overrideTeamId || !overridePlayerId) return;
    const lineupId = `${overrideTeamId}_${overrideWeek}`;
    const existing = await getDoc(doc(db, "lineups", lineupId));
    const currentSlots = existing.exists() ? existing.data().slots || {} : {};
    await setDoc(
      doc(db, "lineups", lineupId),
      {
        teamId: overrideTeamId,
        week: overrideWeek,
        slots: { ...currentSlots, [overrideSlot]: overridePlayerId },
      },
      { merge: true }
    );
    setOverridePlayerId("");
    alert("Lineup override saved.");
  }

  async function submitPointsOverride() {
    if (!pointsTeamId || pointsValue === "") return;
    const overrideId = `${pointsTeamId}_${pointsWeek}`;
    await setDoc(doc(db, "leaguePointOverrides", overrideId), {
      teamId: pointsTeamId,
      week: pointsWeek,
      leaguePoints: Number(pointsValue),
    });
    setPointsValue("");
    alert("League Points override saved.");
  }

  if (loading) return <p>Loading commissioner tools...</p>;

  if (!settings) {
    return (
      <div style={{ maxWidth: 480 }}>
        <p style={{ color: "var(--text-secondary, #666)" }}>
          No commissioner has been set for this league yet.
        </p>
        <button onClick={becomeCommissioner}>Become commissioner</button>
      </div>
    );
  }

  if (!isCommissioner) {
    return (
      <p style={{ color: "var(--text-muted, #888)" }}>
        Only league commissioners can access this tab.
      </p>
    );
  }

  const currentCommissioners = teams.filter((t) =>
    settings.commissionerUids.includes(t.ownerUid)
  );

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <h3 style={{ marginBottom: 8 }}>Commissioners</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {currentCommissioners.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.4rem 0.6rem",
                background: "var(--surface-1, #f5f5f5)",
                borderRadius: "var(--radius, 6px)",
              }}
            >
              <span>{t.name}</span>
              {t.ownerUid !== user.uid && (
                <button onClick={() => removeCoCommissioner(t.ownerUid)}>remove</button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={selectedCoCommTeam} onChange={(e) => setSelectedCoCommTeam(e.target.value)} style={{ flex: 1 }}>
            <option value="">Select a team to add as co-commissioner</option>
            {teams
              .filter((t) => !settings.commissionerUids.includes(t.ownerUid))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
          <button onClick={addCoCommissioner} disabled={!selectedCoCommTeam}>Add</button>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Override a team's lineup</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
          Directly sets a player into a slot for the given team and week, bypassing the normal owner-only and kickoff-lock rules.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select value={overrideTeamId} onChange={(e) => setOverrideTeamId(e.target.value)}>
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={overrideWeek} onChange={(e) => setOverrideWeek(Number(e.target.value))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
            <select value={overrideSlot} onChange={(e) => setOverrideSlot(Number(e.target.value))}>
              {SLOTS.map((pos, idx) => (
                <option key={idx} value={idx}>{pos} (slot {idx + 1})</option>
              ))}
            </select>
          </div>
          <input
            placeholder="Player ID (from players collection)"
            value={overridePlayerId}
            onChange={(e) => setOverridePlayerId(e.target.value)}
          />
          <button onClick={submitLineupOverride}>Save override</button>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Override League Points</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 0 }}>
          Manually sets a team's League Points for a specific week, overriding the automatic calculation.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select value={pointsTeamId} onChange={(e) => setPointsTeamId(e.target.value)}>
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={pointsWeek} onChange={(e) => setPointsWeek(Number(e.target.value))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="League Points"
              value={pointsValue}
              onChange={(e) => setPointsValue(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <button onClick={submitPointsOverride}>Save override</button>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Roster slots</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>
          Current slots: {settings.rosterSlots?.join(", ")}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>
          Editing these here updates leagueSettings, but the Set Lineup tab still uses a fixed slot list — a follow-up step.
        </p>
      </section>
    </div>
  );
}
