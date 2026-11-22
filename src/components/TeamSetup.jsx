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
import { LoadError } from "./LoadError";

// Looks up the signed-in owner's team, or lets them create one if they don't
// have one yet. Calls onTeamReady(team) once a team exists.
export function TeamSetup({ user, onTeamReady }) {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function findTeam() {
      setLoading(true);
      setLookupFailed(false);
      try {
        const q = query(collection(db, "teams"), where("ownerUid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const found = { id: docSnap.id, ...docSnap.data() };
          setTeam(found);
          onTeamReady?.(found);
        }
      } catch (err) {
        // Don't fall through to the "name your team" form: that would let
        // someone with an existing team accidentally create a second one.
        console.error("Team lookup failed:", err);
        setLookupFailed(true);
      }
      setLoading(false);
    }
    findTeam();
  }, [user.uid, attempt]);

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
      console.error("Team creation failed:", err);
      setError("Couldn't create the team. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading your team...</p>;
  }

  if (lookupFailed) {
    return <LoadError message="Couldn't load your team. Check your connection and try again." onRetry={() => setAttempt((n) => n + 1)} />;
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