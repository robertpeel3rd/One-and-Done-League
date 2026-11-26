import { useEffect, useMemo, useRef, useState } from "react";
import { LoadError } from "./LoadError";
import { Icon } from "./Icon";
import { useCurrentWeek } from "../lib/useCurrentWeek";
import { useLeagueData } from "../lib/leagueDataContext";
import { computeHistory, shortName } from "../lib/standingsHistory";

const SERIES_COUNT = 8;
const SECONDS_PER_WEEK = 1;
const ease = (f) => f * f * (3 - 2 * f);

// Animated chart of how the standings changed week by week: either rank
// (a "bump chart") or cumulative League Points. Opens on the finished chart;
// Play replays the season from Week 1, with older parts of each trail fading.
export function StandingsRace({ myTeamId, onBack }) {
  const { week: currentWeek, loading: weekLoading, error: weekError, retry: retryWeek } = useCurrentWeek();
  const { teams, lineups, scoresByPlayer, overrides, loading } = useLeagueData();

  const [mode, setMode] = useState("rank");
  const [t, setT] = useState(null); // position along the season, 0 .. weeks-1; null = finished
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(340);
  const [tip, setTip] = useState(null);
  const wrapRef = useRef(null);
  const tRef = useRef(0);

  const weeksDone = currentWeek ? currentWeek - 1 : 0;

  const history = useMemo(() => {
    if (teams.length === 0 || weeksDone < 1) return null;
    return computeHistory({ teams, lineups, scoresByPlayer, overrides, throughWeek: weeksDone });
  }, [teams, lineups, scoresByPlayer, overrides, weeksDone]);

  // Colors follow the team, not its rank, so a team keeps its color all
  // season. Ordered by team id so the assignment is stable.
  const colorIndex = useMemo(() => {
    const ids = teams.map((tm) => tm.id).sort();
    const map = {};
    teams.forEach((tm) => (map[tm.id] = ids.indexOf(tm.id) % SERIES_COUNT));
    return map;
  }, [teams]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, [history]);

  useEffect(() => {
    if (!playing || !history) return;
    const last = history.cum.length - 1;
    let raf = 0;
    let prev = 0;
    function frame(ts) {
      if (!prev) prev = ts;
      const dt = (ts - prev) / 1000;
      prev = ts;
      tRef.current = Math.min(last, tRef.current + dt / SECONDS_PER_WEEK);
      setT(tRef.current);
      if (tRef.current >= last) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, history]);

  if (weekError) return <LoadError message="Couldn't load the current NFL week. Check your connection and try again." onRetry={retryWeek} />;
  if (loading || weekLoading) return <p>Loading Standings Race...</p>;

  const header = (
    <>
      <button className="btn-compact" onClick={onBack} style={{ marginBottom: 12 }}>
        <Icon name="arrow-left" /> Standings
      </button>
      <h2 style={{ fontSize: 20, margin: "0 0 4px", fontWeight: 600 }}>Standings Race</h2>
    </>
  );

  if (!history) {
    return (
      <div style={{ maxWidth: 480, textAlign: "left" }}>
        {header}
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          The race starts once Week 1 is complete.
        </p>
      </div>
    );
  }

  const W = history.cum.length;
  const N = teams.length;
  const last = W - 1;
  const tNow = t === null ? last : t;
  const src = mode === "rank" ? history.rank : history.cum;
  const maxCum = Math.max(...history.cum[last]);
  const ymax = Math.max(5, Math.ceil(maxCum / 5) * 5);

  const labelMax = width < 460 ? 15 : 22;
  const rightMargin = width < 460 ? 104 : 132;
  const m = { l: 28, r: rightMargin, t: 12, b: 24 };
  const height = Math.max(300, Math.min(420, width * 0.9));
  const pw = Math.max(60, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const x = (k) => m.l + (W > 1 ? pw * (k / (W - 1)) : 0);
  const y = (v) =>
    mode === "rank"
      ? m.t + (N > 1 ? ph * ((v - 1) / (N - 1)) : 0)
      : m.t + ph * (1 - v / ymax);

  function valueAt(i, tt) {
    const k = Math.min(last, Math.floor(tt));
    if (k >= last) return src[last][i];
    const f = ease(Math.min(1, tt - k));
    return src[k][i] + (src[k + 1][i] - src[k][i]) * f;
  }

  const ticks = mode === "rank" ? Array.from({ length: N }, (_, i) => i + 1) : Array.from({ length: ymax / 5 + 1 }, (_, i) => i * 5);
  const fullWeeks = Math.floor(tNow);
  const myIndex = teams.findIndex((tm) => tm.id === myTeamId);

  // Draw my team last so its line sits on top.
  const drawOrder = teams.map((_, i) => i).sort((a, b) => (a === myIndex) - (b === myIndex));

  // End-of-line labels, nudged apart so they never overlap.
  const heads = teams.map((_, i) => ({ i, yy: y(valueAt(i, tNow)) })).sort((a, b) => a.yy - b.yy);
  let prevY = -99;
  heads.forEach((h) => {
    h.ly = Math.max(h.yy, prevY + 13);
    prevY = h.ly;
  });
  const overflow = prevY - (m.t + ph + 8);
  if (overflow > 0) heads.forEach((h) => (h.ly -= overflow));
  const labelY = {};
  heads.forEach((h) => (labelY[h.i] = h.ly));

  const color = (i) => `var(--series-${colorIndex[teams[i].id] + 1})`;
  const topHalf = Math.floor(N / 2);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (t === null || tRef.current >= last) {
      tRef.current = 0;
      setT(0);
    }
    setPlaying(true);
  }

  function onSlide(e) {
    const v = Number(e.target.value) - 1;
    setPlaying(false);
    tRef.current = v;
    setT(v);
  }

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let k = Math.round(((px - m.l) / pw) * (W - 1));
    k = Math.max(0, Math.min(Math.floor(tNow + 1e-6), k));
    setTip({ k, left: e.clientX - rect.left, top: e.clientY - rect.top });
  }

  const tipRows = tip
    ? teams.map((_, i) => i).sort((a, b) => history.rank[tip.k][a] - history.rank[tip.k][b])
    : [];

  const modeBtn = (key, label) => (
    <button className="btn-compact" onClick={() => setMode(key)} aria-pressed={mode === key} style={{ fontWeight: mode === key ? 700 : 400 }}>
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 480, textAlign: "left" }}>
      {header}
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0, marginBottom: 8 }}>
        How the standings changed, week by week, through Week {weeksDone}. Press Play to replay the season.
        {mode === "rank" ? " The dashed line marks the in-the-points cutoff." : ""}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {modeBtn("rank", "Rank")}
        {modeBtn("pts", "League Points")}
      </div>

      <div ref={wrapRef} style={{ position: "relative", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "8px 4px 4px" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`Standings by week through Week ${weeksDone}. Open the table below for the numbers.`}
          style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
          onPointerMove={onMove}
          onPointerLeave={() => setTip(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} style={{ stroke: "var(--border)" }} strokeWidth="1" />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: "var(--text-muted)" }}>{v}</text>
            </g>
          ))}
          {mode === "rank" && topHalf > 0 && topHalf < N && (
            <line
              x1={m.l} x2={m.l + pw} y1={y(topHalf + 0.5)} y2={y(topHalf + 0.5)}
              style={{ stroke: "var(--border-strong)" }} strokeWidth="1" strokeDasharray="4 4"
            />
          )}
          {Array.from({ length: W }, (_, k) =>
            W > 12 && k % 2 === 1 && k !== last ? null : (
              <text key={k} x={x(k)} y={height - 8} textAnchor="middle" fontSize="11" style={{ fill: "var(--text-muted)" }}>{k + 1}</text>
            )
          )}

          {drawOrder.map((i) => {
            const mine = i === myIndex;
            const sw = mine ? 3.5 : 2.5;
            const segs = [];
            for (let k = 0; k < fullWeeks; k++) {
              const age = tNow - (k + 1);
              const op = Math.max(0.22, 1 - age * 0.11);
              segs.push(
                <g key={k} opacity={op}>
                  <line x1={x(k)} y1={y(src[k][i])} x2={x(k + 1)} y2={y(src[k + 1][i])} style={{ stroke: color(i) }} strokeWidth={sw} strokeLinecap="round" />
                  <circle cx={x(k)} cy={y(src[k][i])} r={mine ? 3.5 : 3} style={{ fill: color(i) }} />
                </g>
              );
            }
            const hx = x(tNow);
            const hv = valueAt(i, tNow);
            if (tNow > fullWeeks && fullWeeks < last) {
              segs.push(
                <line key="p" x1={x(fullWeeks)} y1={y(src[fullWeeks][i])} x2={hx} y2={y(hv)} style={{ stroke: color(i) }} strokeWidth={sw} strokeLinecap="round" />
              );
            }
            return (
              <g key={teams[i].id}>
                {segs}
                <circle cx={hx} cy={y(hv)} r={mine ? 6.5 : 5.5} style={{ fill: color(i), stroke: "var(--surface-1)" }} strokeWidth="2" />
                <text x={hx + 11} y={labelY[i] + 4} fontSize="12" fontWeight={mine ? 700 : 500} style={{ fill: "var(--text-primary)" }}>
                  {shortName(teams[i].name || teams[i].id, labelMax)}
                  <title>{teams[i].name}</title>
                </text>
              </g>
            );
          })}

          {tip && (
            <line x1={x(tip.k)} x2={x(tip.k)} y1={m.t} y2={m.t + ph} style={{ stroke: "var(--border-strong)" }} strokeWidth="1" />
          )}
        </svg>

        {tip && (
          <div
            style={{
              position: "absolute",
              left: Math.max(4, tip.left > width - 190 ? tip.left - 180 : tip.left + 14),
              top: Math.max(4, tip.top - 20),
              pointerEvents: "none",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              minWidth: 160,
              boxShadow: "0 4px 14px rgba(0,0,0,.18)",
              zIndex: 3,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>After week {tip.k + 1}</div>
            {tipRows.map((i) => (
              <div key={teams[i].id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color(i), marginRight: 6 }} />
                  {history.rank[tip.k][i]}. {shortName(teams[i].name || teams[i].id, 18)}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{history.cum[tip.k][i]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn-compact" onClick={togglePlay} style={{ width: 96, fontWeight: 600 }}>
          <Icon name={playing ? "player-pause" : "player-play"} />
          {playing ? "Pause" : t !== null && tNow >= last ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          min="1"
          max={W}
          step="0.01"
          value={tNow + 1}
          onChange={onSlide}
          aria-label="Week"
          disabled={W < 2}
          style={{ flex: 1, minWidth: 120, accentColor: "var(--text-accent)" }}
        />
        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", minWidth: 84, textAlign: "right" }}>
          Week {Math.min(W, Math.round(tNow) + 1)} of {W}
        </span>
      </div>

      <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", listStyle: "none", padding: 0, margin: "14px 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
        {teams.map((tm, i) => (
          <li key={tm.id} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: i === myIndex ? 600 : 400 }}>
            <i style={{ width: 14, height: 3, borderRadius: 2, background: color(i), display: "inline-block" }} />
            {tm.name || tm.id}
          </li>
        ))}
      </ul>

      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Table view: League Points after each week</summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Team</th>
                {history.cum.map((_, k) => (
                  <th key={k} style={{ textAlign: "right", padding: "4px 6px" }}>W{k + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((tm, i) => (
                <tr key={tm.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                  <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{tm.name || tm.id}</td>
                  {history.cum.map((c, k) => (
                    <td key={k} style={{ textAlign: "right", padding: "4px 6px" }}>{c[i]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
