import { signOutUser } from "../lib/firebase";

export function About({ user }) {
  const section = { marginBottom: "1.25rem" };
  const heading = { fontSize: 15, fontWeight: 500, marginBottom: 4 };
  const body = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={section}>
        <div style={heading}>Format</div>
        <p style={body}>
          No head-to-head matchups. Teams compete for the most Weekly Points (i.e., fantasy points) and standings are based on League Points earned across the season.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>League Points</div>
        <p style={body}>
          Each week, teams are ranked by their total Weekly Points. The top half of teams earn League Points: 1st place earns points equal to half the number of teams in the league (rounded down), 2nd place earns one less, and so on, down to the last team in the top half earning 1 point. Teams in the bottom half earn 0 League Points that week. Ties split the available points evenly, rounded down. Season standings are the sum of League Points earned across all weeks.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>Roster</div>
        <p style={body}>
          Each week, a team's lineup consists of 9 slots: QB, RB, RB, WR, WR, TE, FLEX (RB/WR/TE), K, DST.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>The one-time rule</div>
        <p style={body}>
          A player can only be used once per team for the entire season. Once you start a player in your lineup, they cannot be selected again by your team in any future week.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>Player locks</div>
        <p style={body}>
          A player becomes locked in your lineup at the moment their NFL game kicks off. Locked players cannot be swapped or removed. Players can be freely changed at any time before their game starts.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>Scoring</div>
        <p style={body}>
          Standard PPR (point-per-reception) scoring is used for passing, rushing, and receiving statistics. Kickers are scored using standard distance-based field goal and extra point values.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>Team management</div>
        <p style={body}>
          Each team is owned by one person, signed in with a Google account. Team rosters and lineups are tied to that account.
        </p>
      </div>

      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "1.5rem" }}>
          <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
          <span style={{ fontSize: 14 }}>{user.displayName}</span>
          <button onClick={signOutUser}>Sign out</button>
        </div>
      )}
    </div>
  );
}
