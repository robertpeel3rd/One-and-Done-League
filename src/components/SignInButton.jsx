import { signInWithGoogle, signOutUser } from "../lib/firebase";

export function SignInButton({ user }) {
  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img
          src={user.photoURL}
          alt=""
          style={{ width: 28, height: 28, borderRadius: "50%" }}
        />
        <span style={{ fontSize: 14 }}>{user.displayName}</span>
        <button onClick={signOutUser}>Sign out</button>
      </div>
    );
  }

  return <button onClick={signInWithGoogle}>Sign in with Google</button>;
}