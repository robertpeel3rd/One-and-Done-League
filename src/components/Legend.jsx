import { InjuryDot } from "./Injury";
import { getInjuryInfo } from "../lib/injury";
import { LivePill, UsedPill } from "./Pills";

// Static reference page (More > Legend). No data fetching, so it adds
// nothing to load time.

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", letterSpacing: 0.2, margin: "0 2px 4px" }}>{title}</div>
      <div
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--radius)",
          padding: "0 14px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ keyContent, children, last }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "0.5px solid var(--border)",
      }}
    >
      <div style={{ width: 112, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
        {keyContent}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-accent)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function Legend() {
  const injuryKey = (status, label) => (
    <>
      <InjuryDot info={getInjuryInfo(status)} />
      {label}
    </>
  );

  return (
    <div style={{ maxWidth: 480 }}>
      <Section title="INJURY STATUS">
        <Row keyContent={injuryKey("Questionable", "Questionable")}>Might not play. Check before kickoff.</Row>
        <Row keyContent={injuryKey("Doubtful", "Doubtful")}>Unlikely to play.</Row>
        <Row keyContent={injuryKey("Out", "Out")}>Ruled out for this week's game.</Row>
        <Row keyContent={injuryKey("IR", "IR")} last>
          On injured reserve. Out for an extended time.
        </Row>
      </Section>

      <Section title="GAME STATUS">
        <Row keyContent={<LivePill />}>The player's game is in progress.</Row>
        <Row keyContent={<span style={{ color: "var(--text-muted)" }}>Gray row</span>} last>
          The player's game is finished. Points are final.
        </Row>
      </Section>

      <Section title="LINEUP">
        <Row keyContent={<UsedPill week={3} />}>You already picked this player that week. One and done.</Row>
        <Row
          keyContent={
            <>
              <LockIcon /> Locked
            </>
          }
          last
        >
          The game started, so this pick can't change.
        </Row>
      </Section>

      <div
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--radius)",
          padding: "12px 14px",
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
          Where the data comes from
        </div>
        <p style={{ margin: "0 0 6px" }}>
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>Sleeper</span> provides player rosters, injury
          status, game stats, and projected points.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>ESPN</span> provides the game schedule, kickoff
          times, and live and final game status.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          Fantasy points are calculated by this app from the stats, using the league's scoring rules.
        </p>
        <p style={{ margin: 0 }}>
          Data refreshes automatically on game days. Injury status can lag breaking news, so check team reports before
          kickoff.
        </p>
      </div>
    </div>
  );
}
