import { useAuth } from "./lib/useAuth";
import { SignInButton } from "./components/SignInButton";
import { TeamSetup } from "./components/TeamSetup";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading...</p>;
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>
      <h1>One and Done League</h1>
      <SignInButton user={user} />
      {!user && <p>Sign in with Google to set up or manage your team.</p>}
      {user && <TeamSetup user={user} />}
    </div>
  );
}

export default App;