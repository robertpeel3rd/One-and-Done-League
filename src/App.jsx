import { useState } from "react";
import "./App.css";
import { useAuth } from "./lib/useAuth";
import { SignInButton } from "./components/SignInButton";
import { TeamSetup } from "./components/TeamSetup";
import { RosterBuilder } from "./components/RosterBuilder";
import { LeagueTable } from "./components/LeagueTable";
import { UsedPlayers } from "./components/UsedPlayers";

const TABS = ["League Table", "Set Lineup", "Used Players"];

function App() {
  const { user, loading } = useAuth();
  const [team, setTeam] = useState(null);
  const [activeTab, setActiveTab] = useState("League Table");

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading...</p>;
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>
      <h1>One and Done League</h1>
      <SignInButton user={user} />
      {!user && <p>Sign in with Google to set up or manage your team.</p>}

      {user && (
        <>
          <TeamSetup user={user} onTeamReady={setTeam} />

          {team && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginTop: "1.5rem",
                  marginBottom: "1rem",
                  borderBottom: "1px solid #ddd",
                  flexWrap: "wrap",
                }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: "none",
                      borderBottom: activeTab === tab ? "2px solid #333" : "2px solid transparent",
                      borderRadius: 0,
                      background: "transparent",
                      fontWeight: activeTab === tab ? 700 : 400,
                      minHeight: 44,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === "League Table" && <LeagueTable />}
              {activeTab === "Set Lineup" && <RosterBuilder team={team} />}
              {activeTab === "Used Players" && <UsedPlayers team={team} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
