import { createContext, useContext } from "react";

// Shared league data (teams, players, lineups, liveScores, overrides),
// loaded ONCE and reused by every tab so switching tabs is instant instead
// of re-downloading the whole database each time.
export const LeagueDataContext = createContext({
  teams: [],
  players: [],
  lineups: [],
  scoresByPlayer: {},
  overrides: {},
  loading: true,
  refresh: async () => {},
});

export function useLeagueData() {
  return useContext(LeagueDataContext);
}
