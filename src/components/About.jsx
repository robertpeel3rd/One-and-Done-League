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
          Each week, teams are ranked by their total Weekly Points. The top half of teams earn League Points — more points for a higher finish, none for the bottom half. Points accumulate across the season to determine the standings.
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
        <div style={heading}>Lineup Locks</div>
        <p style={body}>
          A player becomes locked in your lineup at the moment their NFL game kicks off. Locked players cannot be swapped or removed. Players can be freely changed at any time before their game starts.
        </p>
      </div>

      <div style={section}>
        <div style={heading}>Scoring</div>
        <p style={body}>
          Standard PPR (point-per-reception) scoring is used for passing, rushing, and receiving statistics. Kickers and Defense/Special Teams are scored using the values below.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
          <tbody>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 500, color: "var(--text-secondary)" }}>Category</td>
              <td style={{ padding: 8, fontWeight: 500, color: "var(--text-secondary)" }}>Stat</td>
              <td style={{ padding: 8, fontWeight: 500, color: "var(--text-secondary)", textAlign: "right" }}>Points</td>
            </tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td rowSpan={3} style={{ padding: 8, verticalAlign: "middle", fontWeight: 500 }}>Passing</td>
              <td style={{ padding: 8 }}>Yard</td><td style={{ padding: 8, textAlign: "right" }}>0.04</td>
            </tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Touchdown</td><td style={{ padding: 8, textAlign: "right" }}>4</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Interception</td><td style={{ padding: 8, textAlign: "right" }}>-2</td></tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td rowSpan={2} style={{ padding: 8, verticalAlign: "middle", fontWeight: 500 }}>Rushing</td>
              <td style={{ padding: 8 }}>Yard</td><td style={{ padding: 8, textAlign: "right" }}>0.1</td>
            </tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Touchdown</td><td style={{ padding: 8, textAlign: "right" }}>6</td></tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td rowSpan={3} style={{ padding: 8, verticalAlign: "middle", fontWeight: 500 }}>Receiving</td>
              <td style={{ padding: 8 }}>Reception</td><td style={{ padding: 8, textAlign: "right" }}>1</td>
            </tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Yard</td><td style={{ padding: 8, textAlign: "right" }}>0.1</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Touchdown</td><td style={{ padding: 8, textAlign: "right" }}>6</td></tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 500 }}>Fumbles</td>
              <td style={{ padding: 8 }}>Fumble lost</td><td style={{ padding: 8, textAlign: "right" }}>-2</td>
            </tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td style={{ padding: 8, fontWeight: 500 }}>2-Point Conversion</td>
              <td style={{ padding: 8 }}>Any type</td><td style={{ padding: 8, textAlign: "right" }}>2</td>
            </tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td rowSpan={6} style={{ padding: 8, verticalAlign: "middle", fontWeight: 500 }}>Kicking</td>
              <td style={{ padding: 8 }}>Field goal, 0-39 yards</td><td style={{ padding: 8, textAlign: "right" }}>3</td>
            </tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Field goal, 40-49 yards</td><td style={{ padding: 8, textAlign: "right" }}>4</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Field goal, 50+ yards</td><td style={{ padding: 8, textAlign: "right" }}>5</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Missed field goal</td><td style={{ padding: 8, textAlign: "right" }}>-1</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Extra point</td><td style={{ padding: 8, textAlign: "right" }}>1</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Missed extra point</td><td style={{ padding: 8, textAlign: "right" }}>-1</td></tr>

            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              <td rowSpan={6} style={{ padding: 8, verticalAlign: "middle", fontWeight: 500 }}>Defense/Special Teams</td>
              <td style={{ padding: 8 }}>Sack</td><td style={{ padding: 8, textAlign: "right" }}>1</td>
            </tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Interception</td><td style={{ padding: 8, textAlign: "right" }}>2</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Fumble recovery</td><td style={{ padding: 8, textAlign: "right" }}>2</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Defensive/special teams touchdown</td><td style={{ padding: 8, textAlign: "right" }}>6</td></tr>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}><td style={{ padding: 8 }}>Safety</td><td style={{ padding: 8, textAlign: "right" }}>2</td></tr>
            <tr><td style={{ padding: 8 }}>Blocked kick</td><td style={{ padding: 8, textAlign: "right" }}>2</td></tr>
          </tbody>
        </table>
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
