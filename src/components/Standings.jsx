import { useMemo, useState } from "react";
import { LoadError } from "./LoadError";
import { useCurrentWeek } from "../lib/useCurrentWeek";
import { useLeagueData } from "../lib/leagueDataContext";
import { useOwnerFirstNames } from "../lib/useOwnerFirstNames";
import { rankTeams, leaguePointsFromRanking } from "../lib/ranking";
import { Icon } from "./Icon";
import { ShareButton } from "./ShareButton";
import { buildShareImage, shareStamp } from "../lib/shareCard";

export function Standings({ myTeamId, onOpenRace }) {
  const { week: currentWeek, loading: weekLoading, error: weekError, retry: retryWeek } = useCurrentWeek();
  const ownerNames = useOwnerFirstNames();
  const [mode, setMode] = useState("current");
  const { teams, lineups, scoresByPlayer, overrides, loading } = useLeagueData();

  // Reads a specific week's score for a player, using the weeklyPoints map
  // (which preserves history across weeks) rather than the single top-level
  // `points` field, which only ever reflects whichever week was most
  // recently synced. Falls back to `.points` only for the live current
  // week, in case that week's weeklyPoints entry hasn't been written yet.
  function pointsForWeek(playerId, week) {
    const doc = scoresByPlayer[playerId];
    if (!doc) return 0;
    if (doc.weeklyPoints && typeof doc.weeklyPoints[week] === "number") {
      return doc.weeklyPoints[week];
    }
    // Only trust the single .points field if it was actually computed FOR
    // this specific week (doc.week === week) -- not just because "week"
    // happens to equal the app's notion of currentWeek. Confirmed bug
    // (Sept 2026): before any real stats exist for a new week, .points
    // still holds whatever week it was last genuinely synced for, so
    // checking "week === currentWeek" alone served stale prior-week
    // scores mislabeled as the new week's numbers.
    if (doc.week === week) return doc.points || 0;
    return 0;
  }

  function leaguePointsForWeek(week) {
    const ranked = rankTeams({ teams, lineups, scoresByPlayer, week, getPoints: pointsForWeek });
    return leaguePointsFromRanking(ranked, teams.length);
  }

  function leaguePointsForTeamWeek(teamId, week, computedMap) {
    const overrideKey = `${teamId}_${week}`;
    if (overrideKey in overrides) return overrides[overrideKey];
    return computedMap[teamId] || 0;
  }

  function sumWeeks(weeks) {
    const totals = {};
    teams.forEach((t) => (totals[t.id] = 0));
    weeks.forEach((week) => {
      const computed = leaguePointsForWeek(week);
      teams.forEach((t) => {
        totals[t.id] += leaguePointsForTeamWeek(t.id, week, computed);
      });
    });
    return teams.map((t) => ({ ...t, leaguePoints: totals[t.id] })).sort((a, b) => b.leaguePoints - a.leaguePoints);
  }

  const currentStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    const completedWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);
    return sumWeeks(completedWeeks);
  }, [teams, lineups, scoresByPlayer, currentWeek, overrides]);

  const liveStandings = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    const weeksIncludingCurrent = Array.from({ length: currentWeek }, (_, i) => i + 1);
    return sumWeeks(weeksIncludingCurrent);
  }, [teams, lineups, scoresByPlayer, currentWeek, overrides]);

  if (weekError) return <LoadError message="Couldn't load the current NFL week. Check your connection and try again." onRetry={retryWeek} />;

  if (loading || weekLoading) return <p>Loading standings...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  const standings = mode === "current" ? currentStandings : liveStandings;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode("current")} style={{ fontWeight: mode === "current" ? 700 : 400 }}>
          Current Standings
        </button>
        <button onClick={() => setMode("live")} style={{ fontWeight: mode === "live" ? 700 : 400 }}>
          Live Standings
        </button>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        {mode === "current"
          ? `League Points from completed weeks (through Week ${currentWeek - 1 || 0}).`
          : `League Points through completed weeks, plus what Week ${currentWeek} would add if it ended right now. Updates automatically.`}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {standings.map((t, i) => {
          const isMine = t.id === myTeamId;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <div
                style={{
                  width: 32,
                  flexShrink: 0,
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  background: isMine ? "var(--text-accent)" : "var(--surface-1)",
                  color: isMine ? "var(--surface-2)" : "var(--text-secondary)",
                  border: isMine ? "none" : "0.5px solid var(--border-strong)",
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.7rem",
                  background: isMine ? "var(--bg-accent)" : "var(--surface-1)",
                  color: isMine ? "var(--text-accent)" : "inherit",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  {t.name}
                  {ownerNames[t.ownerUid] && (
                    <span
                      style={{
                        display: "block",
                        fontSize: 9,
                        lineHeight: 1.1,
                        opacity: 0.75,
                        color: isMine ? "var(--text-accent)" : "var(--text-secondary)",
                      }}
                    >
                      {ownerNames[t.ownerUid]}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: 8,
                  }}
                >
                  <span
                    style={{
                      minWidth: 30,
                      textAlign: "right",
                      fontSize: 26,
                      lineHeight: 1,
                      fontWeight: 500,
                    }}
                  >
                    {t.leaguePoints}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      fontSize: 11,
                      fontWeight: 400,
                      lineHeight: "10.5px",
                      textAlign: "left",
                      color: isMine ? "var(--text-accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span>League</span>
                    <span>Points</span>
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
        {onOpenRace ? (
          <button
            onClick={onOpenRace}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              fontWeight: 600,
              color: "var(--text-accent)",
              borderColor: "var(--text-accent)",
            }}
          >
            <Icon name="player-play" /> Standings Race
          </button>
        ) : (
          <span />
        )}
        <ShareButton
          title="One & Done League Standings"
          filename={`one-and-done-standings-${mode === "current" ? "week-" + (currentWeek - 1) : "live"}.png`}
          makeImage={() =>
            buildShareImage({
              title: "Standings",
              subtitle:
                mode === "current"
                  ? currentWeek > 1
                    ? `League Points through Week ${currentWeek - 1}`
                    : "No completed weeks yet"
                  : `Live League Points · Week ${currentWeek} in progress`,
              rows: standings.map((t, i) => ({
                rank: i + 1,
                name: t.name,
                owner: ownerNames[t.ownerUid] || "",
                value: t.leaguePoints,
              })),
              kind: "points",
              host: window.location.host,
              when: shareStamp(),
            })
          }
        />
      </div>
    </div>
  );
}
