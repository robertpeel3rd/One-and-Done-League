import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import "./App.css";
import { db } from "./lib/firebase";
import { useAuth } from "./lib/useAuth";
import { TeamSetup } from "./components/TeamSetup";
import { RosterBuilder } from "./components/RosterBuilder";
import { Standings } from "./components/Standings";
import { WeeklyScoring } from "./components/WeeklyScoring";
import { UsedPlayers } from "./components/UsedPlayers";
import { CommissionerTab } from "./components/CommissionerTab";
import { About } from "./components/About";
import { BottomNav } from "./components/BottomNav";
import { MoreMenu } from "./components/MoreMenu";
import { Logo } from "./components/Logo";
import { signInWithGoogle } from "./lib/firebase";

const MAIN_TABS = ["Standings", "Weekly Scoring", "My Lineup", "More"];
const MORE_OPTIONS = ["Used Players", "About"];

function App() {
  const { user, loading } = useAuth();
  const [team, setTeam] = useState(null);
  const [activeTab, setActiveTab] = useState("Standings");
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    async function checkCommissioner() {
      if (!user) return;
      const snap = await getDoc(doc(db, "leagueSettings", "main"));
      if (snap.exists()) {
        setIsCommissioner((snap.data().commissionerUids || []).includes(user.uid));
      }
    }
    checkCommissioner();
  }, [user]);

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading...</p>;
  }

  const moreOptions = isCommissioner ? [...MORE_OPTIONS, "Commissioner"] : MORE_OPTIONS;
  const isMoreActive = moreOptions.includes(activeTab);
  const displayTab = isMoreActive ? "More" : activeTab;

  function handleNavSelect(tab) {
    if (tab === "More") {
      setMoreOpen((open) => !open);
      return;
    }
    setActiveTab(tab);
    setMoreOpen(false);
  }

  function handleMoreSelect(option) {
    setActiveTab(option);
    setMoreOpen(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem", width: "100%", flex: 1 }}>
        <Logo />
        {!user && (
          <div style={{ textAlign: "center" }}>
            <button onClick={signInWithGoogle}>Sign in with Google</button>
            <p>Sign in with Google to set up or manage your team.</p>
          </div>
        )}

        {user && (
          <>
            <TeamSetup user={user} onTeamReady={setTeam} />

            {team && (
              <div style={{ marginTop: "1.25rem" }}>
                {activeTab === "Standings" && <Standings myTeamId={team.id} />}
                {activeTab === "Weekly Scoring" && <WeeklyScoring myTeamId={team.id} />}
                {activeTab === "My Lineup" && <RosterBuilder team={team} />}
                {activeTab === "Used Players" && <UsedPlayers team={team} />}
                {activeTab === "About" && <About user={user} />}
                {activeTab === "Commissioner" && <CommissionerTab user={user} />}
              </div>
            )}
          </>
        )}
      </div>

      {user && team && moreOpen && (
        <MoreMenu options={moreOptions} onSelect={handleMoreSelect} />
      )}

      {user && team && (
        <BottomNav tabs={MAIN_TABS} activeTab={displayTab} onSelect={handleNavSelect} />
      )}
    </div>
  );
}

export default App;
