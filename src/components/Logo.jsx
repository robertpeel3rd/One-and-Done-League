export function Logo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "0.5rem" }}>
      <svg width="64" height="64" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="37" fill="var(--bg-accent)" stroke="var(--text-accent)" strokeWidth="2" />
        <g transform="rotate(-20 40 40)">
          <ellipse cx="40" cy="40" rx="24" ry="15" fill="none" stroke="var(--text-accent)" strokeWidth="2.5" />
          <line x1="24" y1="40" x2="56" y2="40" stroke="var(--text-accent)" strokeWidth="2" />
          <line x1="31" y1="35" x2="31" y2="45" stroke="var(--text-accent)" strokeWidth="2" />
          <line x1="40" y1="33" x2="40" y2="47" stroke="var(--text-accent)" strokeWidth="2" />
          <line x1="49" y1="35" x2="49" y2="45" stroke="var(--text-accent)" strokeWidth="2" />
        </g>
      </svg>
      <div style={{ textAlign: "center", marginTop: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>One &amp; Done</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 }}>
          <div style={{ width: 24, height: 2, background: "var(--text-accent)" }} />
          <span style={{ fontSize: 13, color: "var(--text-accent)", letterSpacing: 1 }}>LEAGUE</span>
          <div style={{ width: 24, height: 2, background: "var(--text-accent)" }} />
        </div>
      </div>
    </div>
  );
}
