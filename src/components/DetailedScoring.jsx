import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoadError } from "./LoadError";
import { useCurrentWeek } from "../lib/useCurrentWeek";
import { useLeagueData } from "../lib/leagueDataContext";
import { useOwnerFirstNames } from "../lib/useOwnerFirstNames";
import { LivePill } from "./Pills";
import { UpdatedAt } from "./UpdatedAt";

const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST"];

// Human-readable labels for the curated stat fields stored by
// syncLiveScores.js's buildStatLine(). Entries marked `first: true` (touchdowns
// and turnovers/big plays) are shown before everything else so they are never
// the ones hidden under the "+N" overflow pill. Otherwise order here is
// display order.
const STAT_LABELS = [
  ["pass_yd", "pass yd"],
  ["pass_td", "pass TD", true],
  ["pass_int", "INT", true],
  ["rush_yd", "rush yd"],
  ["rush_td", "rush TD", true],
  ["rec", "rec"],
  ["rec_yd", "rec yd"],
  ["rec_td", "rec TD", true],
  ["fum_lost", "fum lost", true],
  ["fgm", "FG made"],
  ["fgm_40_49", "FG 40-49"],
  ["fgm_50p", "FG 50+"],
  ["fgmiss", "FG missed"],
  ["xpm", "XP made"],
  ["xpmiss", "XP missed"],
  ["sack", "sacks"],
  ["int", "INT", true],
  ["fum_rec", "fum rec", true],
  ["def_td", "def TD", true],
  ["safe", "safety", true],
  ["blk_kick", "blocked kick", true],
];

function getStatLineParts(statLine) {
  if (!statLine) return [];
  const priority = [];
  const rest = [];
  for (const [field, label, first] of STAT_LABELS) {
    if (field in statLine) {
      (first ? priority : rest).push(`${statLine[field]} ${label}`);
    }
  }
  if ("pts_allow" in statLine) {
    rest.push(`${statLine.pts_allow} pts allowed`);
  }
  return [...priority, ...rest];
}

// Renders stat pills on exactly ONE line. Anything that doesn't fit
// collapses into a "+N" button; tapping it shows every pill (wrapping onto
// extra lines), and tapping the row again collapses it. Fit is measured from an invisible copy of
// all pills, so the visible row never wraps or jumps.
function StatPills({ parts, pillStyle, expanded, onExpand }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(parts.length);

  const partsKey = parts.join("|");

  useLayoutEffect(() => {
    function recalc() {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      const available = container.clientWidth;
      const GAP = 3;
      const MORE_WIDTH = 30;
      const widths = Array.from(measure.children).map((c) => c.offsetWidth);
      const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? GAP : 0), 0);
      if (total <= available) {
        setVisibleCount(parts.length);
        return;
      }
      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const next = used + widths[i] + (i > 0 ? GAP : 0);
        if (next + GAP + MORE_WIDTH > available) break;
        used = next;
        count++;
      }
      setVisibleCount(Math.max(count, 1));
    }
    recalc();
    let ro;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(recalc);
      ro.observe(containerRef.current);
    }
    return () => ro && ro.disconnect();
  }, [partsKey, parts.length]);

  const hidden = parts.length - visibleCount;
  return (
    <div style={{ position: "relative", marginTop: 3 }}>
      <div
        ref={containerRef}
        style={
          expanded
            ? { display: "flex", flexWrap: "wrap", gap: 3 }
            : { display: "flex", flexWrap: "nowrap", gap: 3, overflow: "hidden", whiteSpace: "nowrap" }
        }
      >
        {parts.slice(0, expanded ? parts.length : visibleCount).map((part, i) => (
          <span key={i} style={pillStyle}>{part}</span>
        ))}
        {hidden > 0 && !expanded && (
          <button
            type="button"
            aria-expanded="false"
            aria-label={`Show ${hidden} more stats`}
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            style={{
              minHeight: 0,
              cursor: "pointer",
              font: "inherit",
              fontSize: pillStyle.fontSize,
              ...pillStyle,
              background: "transparent",
              border: "0.5px solid var(--border-strong)",
              color: "var(--text-primary)",
              fontWeight: 500,
            }}
          >
            +{hidden}
          </button>
        )}
      </div>
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
          height: 0,
          overflow: "hidden",
          display: "flex",
          flexWrap: "nowrap",
          whiteSpace: "nowrap",
        }}
      >
        {parts.map((part, i) => (
          <span key={i} style={pillStyle}>{part}</span>
        ))}
      </div>
    </div>
  );
}

export function DetailedScoring({ myTeamId }) {
  const { week: currentWeek, loading: weekLoading, error: weekError, retry: retryWeek } = useCurrentWeek();
  const ownerNames = useOwnerFirstNames();
  const { teams, players, lineups, scoresByPlayer, loading } = useLeagueData();
  const myTeamRef = useRef(null);
  // Rows whose "+N" has been tapped open, keyed "teamId:slotIndex". Kept here
  // (not inside each row) so data refreshes never collapse an open row.
  const [openRows, setOpenRows] = useState(() => new Set());
  function setRowOpen(key, open) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  const hasScrolledRef = useRef(false);

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

  if (weekError) return <LoadError message="Couldn't load the current NFL week. Check your connection and try again." onRetry={retryWeek} />;

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
                  <span>
                    {team.name}
                    {ownerNames[team.ownerUid] && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 9,
                          fontWeight: 400,
                          lineHeight: 1.1,
                          opacity: 0.75,
                          color: isMine ? "var(--text-accent)" : "var(--text-secondary)",
                        }}
                      >
                        {ownerNames[team.ownerUid]}
                      </span>
                    )}
                  </span>
                  <span>{total}</span>
                </div>

                {slotEntries.map((s, idx) => {
                  const isLive = s.player?.gameState === "in";
                  const isFinished = s.player?.gameCompleted === true;
                  const statParts = getStatLineParts(s.statLine);
                  const rowKey = `${team.id}:${idx}`;
                  const rowOpen = openRows.has(rowKey);
                  return (
                    <div
                      key={idx}
                      onClick={rowOpen ? () => setRowOpen(rowKey, false) : undefined}
                      style={{
                        cursor: rowOpen ? "pointer" : undefined,
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
                          {isLive && <LivePill />}
                        </div>
                        {statParts.length > 0 && (
                          <StatPills
                            parts={statParts}
                            expanded={rowOpen}
                            onExpand={() => setRowOpen(rowKey, true)}
                            pillStyle={{
                              flexShrink: 0,
                              fontSize: 10,
                              lineHeight: 1,
                              color: isFinished ? "var(--text-muted)" : isLive ? "var(--text-success)" : "var(--text-muted)",
                              background: isLive ? "var(--surface-2)" : "var(--surface-1)",
                              border: isLive ? "0.5px solid var(--text-success)" : "0.5px solid var(--border)",
                              borderRadius: 999,
                              padding: "2px 6px",
                              boxSizing: "border-box",
                            }}
                          />
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
      <UpdatedAt />
    </div>
  );
}
