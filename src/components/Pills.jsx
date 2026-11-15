// Slim, outlined pills shared across the app. Slimness comes from
// lineHeight: 1 plus tight padding, so the pill is ~15px tall and never
// forces its row taller.

const base = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  padding: "2px 6px",
  borderRadius: 999,
  whiteSpace: "nowrap",
  flexShrink: 0,
  boxSizing: "border-box",
};

export function LivePill() {
  return (
    <span
      style={{
        ...base,
        border: "1px solid var(--text-success)",
        color: "var(--text-success)",
        background: "transparent",
      }}
    >
      LIVE
    </span>
  );
}

export function UsedPill({ week }) {
  return (
    <span
      style={{
        ...base,
        border: "1px solid var(--text-accent)",
        color: "var(--text-accent)",
        background: "transparent",
      }}
    >
      USED WK {week}
    </span>
  );
}
