import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// Looks up the signed-in owner's team, or lets them create one if they don't
// have one yet. Calls onTeamReady(team) once a team exists.
export function TeamSetup({ user, onTeamReady }) {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function findTeam() {
      const q = query(collection(db, "teams"), where("ownerUid", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const found = { id: docSnap.id, ...docSnap.data() };
        setTeam(found);
        onTeamReady?.(found);
      }
      setLoading(false);
    }
    findTeam();
  }, [user.uid]);

  async function createTeam(e) {
    e.preventDefault();
    const name = teamName.trim();
    if (!name) {
      setError("Enter a team name first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const docRef = await addDoc(collection(db, "teams"), {
        name,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      const newTeam = { id: docRef.id, name, ownerUid: user.uid };
      setTeam(newTeam);
      onTeamReady?.(newTeam);
    } catch (err) {
      setError("Couldn't create the team. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading your team...</p>;
  }

  if (team) {
    return <p>Your team: <strong>{team.name}</strong></p>;
  }

  return (
    <form onSubmit={createTeam} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      <label htmlFor="teamName">Name your team to get started</label>
      <input
        id="teamName"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="e.g. Audubon Aces"
      />
      {error && <span style={{ color: "var(--text-danger, #a32d2d)", fontSize: 13 }}>{error}</span>}
      <button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create team"}
      </button>
    </form>
  );
}