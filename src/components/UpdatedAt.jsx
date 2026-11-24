import { useLeagueData } from "../lib/leagueDataContext";

// Small gray "Updated 2:41 PM" note showing when the league data on screen
// was last loaded.
export function UpdatedAt({ style }) {
  const { lastUpdated } = useLeagueData();
  if (!lastUpdated) return null;
  const time = lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0.75rem 0 0", ...style }}>
      Updated {time}
    </p>
  );
}
