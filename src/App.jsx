import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import "./App.css";
import { db } from "./lib/firebase";
import { useAuth } from "./lib/useAuth";
import { TeamSetup } from "./components/TeamSetup";
import { RosterBuilder } from "./components/RosterBuilder";
import { Standings } from "./components/Standings";
import { StandingsRace } from "./components/StandingsRace";
import { WeeklyScoring } from "./components/WeeklyScoring";
import { DetailedScoring } from "./components/DetailedScoring";
import { UsedPlayers } from "./components/UsedPlayers";
import { CommissionerTab } from "./components/CommissionerTab";
import { About } from "./components/About";
import { Legend } from "./components/Legend";
import { BottomNav } from "./components/BottomNav";
import { MoreMenu } from "./components/MoreMenu";
import { LeagueDataProvider } from "./components/LeagueDataProvider";
import { Logo } from "./components/Logo";
import { signInWithGoogle } from "./lib/firebase";
import { tabFromHash, hashForTab } from "./lib/tabRoute";

const MAIN_TABS = ["Standings", "Weekly Scoring", "Detailed Scoring", "My Lineup", "More"];
const MORE_OPTIONS = ["Used Players", "About", "Legend"];

function App() {
  const { user, loading } = useAuth();
  const [team, setTeam] = useState(null);
  const [activeTab, setActiveTab] = useState(() => tabFromHash(window.location.hash));
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Keep the selected tab in step with the web address, so reload and the
  // phone's back button both work.
  useEffect(() => {
    function onHashChange() {
      setActiveTab(tabFromHash(window.location.hash));
      setMoreOpen(false);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let retryTimer = null;
    // If the lookup fails (e.g. a brief network drop) try again a few times
    // instead of silently leaving a commissioner without their tab.
    async function checkCommissioner(attempt) {
      try {
        const snap = await getDoc(doc(db, "leagueSettings", "main"));
        if (cancelled) return;
        if (snap.exists()) {
          setIsCommissioner((snap.data().commissionerUids || []).includes(user.uid));
        }
      } catch (err) {
        console.error("Commissioner check failed:", err);
        if (!cancelled && attempt < 3) {
          retryTimer = setTimeout(() => checkCommissioner(attempt + 1), 4000);
        }
      }
    }
    checkCommissioner(1);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [user]);

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading...</p>;
  }

  const moreOptions = isCommissioner ? [...MORE_OPTIONS, "Commissioner"] : MORE_OPTIONS;
  const isMoreActive = moreOptions.includes(activeTab);
  // The Standings Race page is opened from Standings, so Standings stays lit.
  const displayTab = isMoreActive ? "More" : activeTab === "Standings Race" ? "Standings" : activeTab;

  function handleNavSelect(tab) {
    if (tab === "More") {
      setMoreOpen((open) => !open);
      return;
    }
    goToTab(tab);
    setMoreOpen(false);
  }

  function handleMoreSelect(option) {
    goToTab(option);
    setMoreOpen(false);
  }

  // Changing the address adds a history entry (so Back works); the
  // hashchange listener above then updates the visible tab.
  function goToTab(tab) {
    const hash = hashForTab(tab);
    if (window.location.hash === hash) {
      setActiveTab(tab);
    } else {
      window.location.hash = hash;
    }
  }

  return (
    <LeagueDataProvider enabled={Boolean(user)}>
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "1rem",
          paddingBottom: "calc(1rem + 64px + env(safe-area-inset-bottom))",
          width: "100%",
          flex: 1,
        }}
      >
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
                {activeTab === "Standings" && <Standings myTeamId={team.id} onOpenRace={() => goToTab("Standings Race")} />}
                {activeTab === "Standings Race" && <StandingsRace myTeamId={team.id} onBack={() => goToTab("Standings")} />}
                {activeTab === "Weekly Scoring" && <WeeklyScoring myTeamId={team.id} />}
                {activeTab === "Detailed Scoring" && <DetailedScoring myTeamId={team.id} />}
                {activeTab === "My Lineup" && <RosterBuilder team={team} />}
                {activeTab === "Used Players" && <UsedPlayers team={team} />}
                {activeTab === "About" && <About user={user} />}
                {activeTab === "Legend" && <Legend />}
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
    </LeagueDataProvider>
  );
}

export default App;
