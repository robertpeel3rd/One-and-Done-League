import { useState } from "react";
import "./App.css";
import { useAuth } from "./lib/useAuth";
import { SignInButton } from "./components/SignInButton";
import { TeamSetup } from "./components/TeamSetup";
import { PlayerSearch } from "./components/PlayerSearch";
import { RosterBuilder } from "./components/RosterBuilder";

function App() {
  const { user, loading } = useAuth();
  const [team, setTeam] = useState(null);

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
              <h2 style={{ marginTop: "1.5rem" }}>Set your lineup</h2>
              <RosterBuilder team={team} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;