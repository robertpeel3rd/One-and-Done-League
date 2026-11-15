// Injury status helpers. Source: Sleeper's `injury_status`, stored on the
// player doc as `injuryStatus` by scripts/syncRoster.js. Healthy players
// have null and show nothing.

const INJURY_INFO = {
  questionable: { key: "questionable", label: "Questionable", color: "#F2C200", textColor: "var(--text-warning)", ring: false },
  doubtful: { key: "doubtful", label: "Doubtful", color: "#F7861B", textColor: "#B85A0A", ring: false },
  out: { key: "out", label: "Out", color: "#E24B4A", textColor: "var(--text-danger)", ring: false },
  ir: { key: "ir", label: "Injured reserve", color: "#E24B4A", textColor: "var(--text-danger)", ring: true },
};

// Returns display info for a Sleeper injury status string, or null if the
// player is healthy or has a status we deliberately don't show.
// PUP (physically unable to perform) is treated like IR.
export function getInjuryInfo(status) {
  if (!status || typeof status !== "string") return null;
  const s = status.trim().toLowerCase();
  if (s === "ir" || s === "pup") return INJURY_INFO.ir;
  return INJURY_INFO[s] || null;
}

// True for statuses that mean the player will not play this week.
export function isRuledOut(status) {
  const info = getInjuryInfo(status);
  return info?.key === "out" || info?.key === "ir";
}

