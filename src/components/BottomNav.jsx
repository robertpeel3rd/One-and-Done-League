const ICONS = {
  Standings: "ti-chart-bar",
  "Weekly Scoring": "ti-calendar",
  Teams: "ti-users",
  "My Lineup": "ti-list",
  "Used Players": "ti-history",
  About: "ti-info-circle",
  Commissioner: "ti-shield",
};

export function BottomNav({ tabs, activeTab, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        borderTop: "0.5px solid var(--border)",
        background: "var(--surface-2)",
        padding: "6px 4px",
        position: "sticky",
        bottom: 0,
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
            <i className={`ti ${ICONS[tab] || "ti-circle"}`} style={{ fontSize: 16 }} aria-hidden="true" />
            <span style={{ fontSize: 9, fontWeight: isActive ? 500 : 400 }}>{tab}</span>
          </button>
        );
      })}
    </div>
  );
}
