// Friendly "something went wrong" notice with a retry button, used wherever
// a screen can't load its data.
export function LoadError({ message, onRetry }) {
  return (
    <div
      role="alert"
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        padding: "0.9rem 1rem",
      }}
    >
      <p style={{ margin: "0 0 0.6rem", fontSize: 14 }}>{message}</p>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}
