import { useState } from "react";
import { Icon } from "./Icon";
import { shareImage } from "../lib/shareCard";

// Small round blue button that builds a share image and opens the phone's
// share sheet. `makeImage` returns a Promise of a PNG Blob.
export function ShareButton({ makeImage, filename, title }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const blob = await makeImage();
      const result = await shareImage(blob, filename, title);
      if (result === "downloaded") setNote("Image saved");
    } catch (err) {
      console.error("Share failed:", err);
      setNote("Couldn't make the image");
    } finally {
      setBusy(false);
      setTimeout(() => setNote(""), 3000);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {note && (
        <span role="status" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {note}
        </span>
      )}
      <button
        onClick={onClick}
        disabled={busy}
        aria-label="Share as image"
        title="Share as image"
        style={{
          width: 38,
          height: 38,
          minHeight: 0,
          padding: 0,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--text-accent)",
          color: "var(--surface-2)",
          border: "none",
          fontSize: 19,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Icon name="share" />
      </button>
    </span>
  );
}
