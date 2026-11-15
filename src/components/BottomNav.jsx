import { Icon } from "./Icon";

const ICONS = {
  Standings: "chart-bar",
  "Weekly Scoring": "calendar",
  "Detailed Scoring": "list-details",
  Teams: "users",
  "My Lineup": "list",
  "Used Players": "history",
  About: "info-circle",
  Commissioner: "shield",
  More: "dots",
};

export function BottomNav({ tabs, activeTab, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        borderTop: "0.5px solid var(--border)",
        background: "var(--surface-2)",
        padding: "6px 4px",
        paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onSelect(tab)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "6px 2px",
              minHeight: 0,
              border: "none",
              borderRadius: 10,
              background: isActive ? "var(--bg-accent)" : "transparent",
              color: isActive ? "var(--text-accent)" : "var(--text-muted)",
            }}
          >
            <Icon name={ICONS[tab] || "circle"} style={{ fontSize: 16 }} />
            <span style={{ fontSize: 9, fontWeight: isActive ? 500 : 400 }}>{tab}</span>
          </button>
        );
      })}
    </div>
  );
}
