// Injury display components, shared by the Picker, My Lineup, and the Legend.
// Logic lives in src/lib/injury.js.

export function InjuryDot({ info }) {
  if (!info) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        flexShrink: 0,
        boxSizing: "border-box",
        display: "inline-block",
        background: info.ring ? "transparent" : info.color,
        border: info.ring ? `2px solid ${info.color}` : "none",
      }}
    />
  );
}

export function InjuryText({ info }) {
  if (!info) return null;
  return <span style={{ fontWeight: 500, color: info.textColor }}>{info.label}</span>;
}
