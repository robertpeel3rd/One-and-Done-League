export function MoreMenu({ options, onSelect }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(64px + env(safe-area-inset-bottom))",
        right: 8,
        background: "var(--surface-2)",
        border: "0.5px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
        minWidth: 160,
        zIndex: 101,
      }}
    >
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "12px 16px",
            fontSize: 13,
            minHeight: 0,
            border: "none",
            borderRadius: 0,
            borderBottom: i < options.length - 1 ? "0.5px solid var(--border)" : "none",
            background: "transparent",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
