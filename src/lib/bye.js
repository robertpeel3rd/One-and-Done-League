// A player is on a bye this week when their team is known but the sync found
// no game for that team (kickoffTime is empty). Only meaningful for the
// current week.
export function isOnBye(player) {
  if (!player) return false;
  const team = player.team;
  if (!team || team === "FA") return false;
  return !player.kickoffTime;
}
