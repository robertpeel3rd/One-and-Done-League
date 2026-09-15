import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCurrentWeek } from "../lib/useCurrentWeek";

const REFRESH_INTERVAL_MS = 30000;
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

// Human-readable labels for the curated stat fields stored by
// syncLiveScores.js's buildStatLine(). Order here is also display order.
const STAT_LABELS = [
  ["pass_yd", "pass yd"],
  ["pass_td", "pass TD"],
  ["pass_int", "INT"],
  ["rush_yd", "rush yd"],
  ["rush_td", "rush TD"],
  ["rec", "rec"],
  ["rec_yd", "rec yd"],
  ["rec_td", "rec TD"],
  ["fum_lost", "fum lost"],
  ["fgm", "FG made"],
  ["fgm_40_49", "FG 40-49"],
  ["fgm_50p", "FG 50+"],
  ["fgmiss", "FG missed"],
  ["xpm", "XP made"],
  ["xpmiss", "XP missed"],
  ["sack", "sacks"],
  ["int", "INT"],
  ["fum_rec", "fum rec"],
  ["def_td", "def TD"],
  ["safe", "safety"],
  ["blk_kick", "blocked kick"],
];

function getStatLineParts(statLine) {
  if (!statLine) return [];
  const parts = [];
  for (const [field, label] of STAT_LABELS) {
    if (field in statLine) {
      parts.push(`${statLine[field]} ${label}`);
    }
  }
  if ("pts_allow" in statLine) {
    parts.push(`${statLine.pts_allow} pts allowed`);
  }
  return parts;
}

export function DetailedScoring({ myTeamId }) {
  const { week: currentWeek, loading: weekLoading } = useCurrentWeek();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [scoresByPlayer, setScoresByPlayer] = useState({});
  const [loading, setLoading] = useState(true);
  const myTeamRef = useRef(null);
  const hasScrolledRef = useRef(false);

  async function loadAll() {
    const [teamsSnap, playersSnap, lineupsSnap, scoresSnap] = await Promise.all([
      getDocs(collection(db, "teams")),
      getDocs(collection(db, "players")),
      getDocs(collection(db, "lineups")),
      getDocs(collection(db, "liveScores")),
    ]);
    setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLineups(lineupsSnap.docs.map((d) => d.data()));
    const scoreMap = {};
    scoresSnap.docs.forEach((d) => {
      scoreMap[d.id] = d.data();
    });
    setScoresByPlayer(scoreMap);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const playerById = useMemo(() => {
    const map = {};
    players.forEach((p) => (map[p.id] = p));
    return map;
  }, [players]);

  // Only ever shows the CURRENT week — no week selector, per spec.
  function pointsForCurrentWeek(playerId) {
    const doc = scoresByPlayer[playerId];
    if (!doc) return 0;
    if (doc.weeklyPoints && typeof doc.weeklyPoints[currentWeek] === "number") {
      return doc.weeklyPoints[currentWeek];
    }
    // Only trust the single .points field if it was actually computed FOR
    // currentWeek (doc.week === currentWeek), not just assumed to be --
    // same fix as WeeklyScoring.jsx/Standings.jsx. See those files for the
    // full writeup of the confirmed bug this prevents.
    if (doc.week === currentWeek) return doc.points || 0;
    return 0;
  }

  function statLineForCurrentWeek(playerId) {
    const doc = scoresByPlayer[playerId];
    if (!doc || !doc.statLine) return null;
    return doc.statLine[currentWeek] || null;
  }

  const teamRows = useMemo(() => {
    if (teams.length === 0 || !currentWeek) return [];
    return teams
      .map((t) => {
        const lineup = lineups.find((l) => l.teamId === t.id && l.week === currentWeek);
        const slots = lineup?.slots || {};
        const slotEntries = SLOTS.map((pos, idx) => {
          const playerId = slots[idx];
          const player = playerId ? playerById[playerId] : null;
          const pts = playerId ? pointsForCurrentWeek(playerId) : 0;
          const statLine = playerId ? statLineForCurrentWeek(playerId) : null;
          return { pos, player, pts, statLine };
        });
        const total = Math.round(slotEntries.reduce((sum, s) => sum + s.pts, 0) * 10) / 10;
        return { team: t, slotEntries, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [teams, lineups, scoresByPlayer, playerById, currentWeek]);

  // Auto-scroll so the user's own team lands roughly centered in the
  // viewport on load, rather than always starting at the top — matters
  // more here than elsewhere since every team is always fully expanded,
  // so the page can get quite long.
  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (!myTeamRef.current || teamRows.length === 0) return;
    const el = myTeamRef.current;
    const rect = el.getBoundingClientRect();
    const targetScroll = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: "auto" });
    hasScrolledRef.current = true;
  }, [teamRows]);

  if (loading || weekLoading) return <p>Loading detailed scoring...</p>;
  if (teams.length === 0) return <p>No teams yet.</p>;

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
        Detailed Scoring for Week {currentWeek} — every player, every stat that counted.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {teamRows.map(({ team, slotEntries, total }, i) => {
          const isMine = team.id === myTeamId;
          return (
            <div
              key={team.id}
              ref={isMine ? myTeamRef : null}
              style={{ display: "flex", alignItems: "stretch", gap: 8 }}
            >
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
              <div style={{ flex: 1, borderRadius: "var(--radius)", overflow: "hidden" }}>
                <div
                  style={{
                    padding: "0.6rem 0.9rem",
                    display: "flex",
                    justifyContent: "space-between",
                    background: isMine ? "var(--bg-accent)" : "var(--surface-1)",
                    color: isMine ? "var(--text-accent)" : "inherit",
                    fontWeight: 700,
                  }}
                >
                  <span>{team.name}</span>
                  <span>{total}</span>
                </div>

                {slotEntries.map((s, idx) => {
                  const isLive = s.player?.gameState === "in";
                  const isFinished = s.player?.gameCompleted === true;
                  const statParts = getStatLineParts(s.statLine);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: isLive ? "6px 12px 6px 9px" : "6px 12px",
                        borderTop: "0.5px solid var(--border)",
                        borderLeft: isLive ? "3px solid var(--text-success)" : "none",
                        background: isLive ? "var(--bg-success)" : "transparent",
                        display: "flex",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: isFinished ? "var(--text-muted)" : "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span>
                            <span style={{ fontWeight: 600, color: isFinished ? "var(--text-muted)" : "var(--text-secondary)" }}>{s.pos}</span>{" "}
                            {s.player ? `${s.player.name} (${s.player.team})` : "empty"}
                          </span>
                          {isLive && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 600,
                                border: "1px solid var(--text-success)",
                                color: "var(--text-success)",
                                background: "var(--surface-2)",
                                borderRadius: 7,
                                padding: "1px 6px",
                              }}
                            >
                              LIVE
                            </span>
                          )}
                        </div>
                        {statParts.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                            {statParts.map((part, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: 10,
                                  color: isFinished ? "var(--text-muted)" : isLive ? "var(--text-success)" : "var(--text-muted)",
                                  background: isLive ? "var(--surface-2)" : "var(--surface-1)",
                                  border: isLive ? "0.5px solid var(--text-success)" : "none",
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                }}
                              >
                                {part}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          width: 40,
                          flexShrink: 0,
                          textAlign: "right",
                          fontSize: 13,
                          fontWeight: isLive ? 600 : 400,
                          color: isFinished ? "var(--text-muted)" : isLive ? "var(--text-success)" : "var(--text-primary)",
                          paddingTop: 1,
                        }}
                      >
                        {s.pts}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
