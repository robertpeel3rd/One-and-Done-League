// Draws a clean, fixed-size "share card" image of a ranked list (Standings or
// Weekly Scoring) on a canvas, and hands it to the phone's share sheet.
// Always light-themed and neutral (no row highlighted for the sharer), so it
// looks the same no matter who shares it or what theme their phone uses.
// Drawn directly on a canvas (no image library) so it adds nothing to the
// download size.

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const C = {
  bg: "#ffffff",
  row: "#f5f5f5",
  rowBorder: "#bbbbbb",
  text: "#111111",
  secondary: "#555555",
  muted: "#888888",
  line: "#dddddd",
  accent: "#185fa5",
  accentBg: "#e6f1fb",
};
const W = 360; // card width in CSS pixels; fixed so every phone gets the same layout
const SCALE = 3; // 1080 px wide image
const PAD = 20;

const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
  `<circle cx="40" cy="40" r="37" fill="${C.accentBg}" stroke="${C.accent}" stroke-width="2"/>` +
  `<g transform="rotate(-20 40 40)"><ellipse cx="40" cy="40" rx="24" ry="15" fill="none" stroke="${C.accent}" stroke-width="2.5"/>` +
  `<line x1="24" y1="40" x2="56" y2="40" stroke="${C.accent}" stroke-width="2"/>` +
  `<line x1="31" y1="35" x2="31" y2="45" stroke="${C.accent}" stroke-width="2"/>` +
  `<line x1="40" y1="33" x2="40" y2="47" stroke="${C.accent}" stroke-width="2"/>` +
  `<line x1="49" y1="35" x2="49" y2="45" stroke="${C.accent}" stroke-width="2"/></g></svg>`;

function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the card still works without the logo
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Splits text into at most maxLines lines that fit maxWidth (adds "…" if cut).
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxWidth || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = words[i];
    }
  }
  lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}…`;
    while (last.length > 1 && ctx.measureText(last).width > maxWidth) last = `${last.slice(0, -2)}…`;
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

function spaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

// rows: [{ rank, name, owner, value, tag }]; kind: "points" (big number with a
// "League Points" label) or "score" (bold number). dividerAfter: index after
// which the in/out-of-the-points divider is drawn (or null).
export async function buildShareImage({ title, subtitle, rows, kind, dividerAfter = null, host, when }) {
  const logo = await loadLogo();
  const measure = document.createElement("canvas").getContext("2d");

  const rankW = 32;
  const rowX = PAD + rankW + 8;
  const rowW = W - PAD - rowX;
  const valueW = kind === "points" ? 84 : 78;
  const nameW = rowW - valueW - 22;

  measure.font = `400 15px ${FONT}`;
  const laid = rows.map((r) => {
    const lines = wrap(measure, r.name, nameW, 2);
    const h = Math.max(46, 14 + lines.length * 18 + (r.owner ? 12 : 0));
    return { ...r, lines, h };
  });

  const headerH = 150;
  const gap = 8;
  let listH = 0;
  laid.forEach((r, i) => {
    listH += r.h + (i < laid.length - 1 ? gap : 0);
    if (dividerAfter !== null && i === dividerAfter - 1) listH += 22;
  });
  const footerH = 46;
  const H = headerH + listH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: logo, wordmark, title, subtitle.
  if (logo) ctx.drawImage(logo, PAD, 18, 44, 44);
  ctx.fillStyle = C.text;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText("One & Done", PAD + 54, 40);
  ctx.fillStyle = C.accent;
  ctx.font = `400 11px ${FONT}`;
  spaced(ctx, "LEAGUE", PAD + 54, 57, 1.6);

  ctx.fillStyle = C.text;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(title, PAD, 102);
  ctx.fillStyle = C.secondary;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText(subtitle, PAD, 124);

  // Rows.
  let y = headerH - 6;
  laid.forEach((r, i) => {
    // Rank box
    roundRect(ctx, PAD, y, rankW, r.h, 8);
    ctx.fillStyle = C.row;
    ctx.fill();
    ctx.strokeStyle = C.rowBorder;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = C.secondary;
    ctx.font = `600 14px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(String(r.rank), PAD + rankW / 2, y + r.h / 2 + 5);
    ctx.textAlign = "left";

    // Row body
    roundRect(ctx, rowX, y, rowW, r.h, 8);
    ctx.fillStyle = C.row;
    ctx.fill();

    const blockH = r.lines.length * 18 + (r.owner ? 12 : 0);
    let ty = y + (r.h - blockH) / 2 + 14;
    ctx.fillStyle = C.text;
    ctx.font = `400 15px ${FONT}`;
    r.lines.forEach((ln) => {
      ctx.fillText(ln, rowX + 11, ty);
      ty += 18;
    });
    if (r.owner) {
      ctx.fillStyle = C.secondary;
      ctx.font = `400 10px ${FONT}`;
      ctx.fillText(r.owner, rowX + 11, ty - 2);
    }

    // Value
    const right = rowX + rowW - 11;
    const midY = y + r.h / 2;
    if (kind === "points") {
      ctx.fillStyle = C.secondary;
      ctx.font = `400 11px ${FONT}`;
      const lw = Math.max(ctx.measureText("League").width, ctx.measureText("Points").width);
      ctx.fillText("League", right - lw, midY - 1);
      ctx.fillText("Points", right - lw, midY + 10);
      ctx.fillStyle = C.text;
      ctx.font = `500 26px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(String(r.value), right - lw - 6, midY + 9);
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = C.text;
      ctx.font = `700 18px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(String(r.value), right, midY + 6);
      if (r.tag) {
        const vw = ctx.measureText(String(r.value)).width;
        ctx.fillStyle = C.secondary;
        ctx.font = `400 9px ${FONT}`;
        ctx.fillText(r.tag, right - vw - 8, midY + 4);
      }
      ctx.textAlign = "left";
    }

    y += r.h + gap;
    if (dividerAfter !== null && i === dividerAfter - 1) {
      const dy = y - gap + 11;
      const label = "↑ IN THE POINTS · OUT OF THE POINTS ↓";
      ctx.font = `400 9px ${FONT}`;
      const lw = ctx.measureText(label).width;
      const cx = rowX + rowW / 2;
      ctx.strokeStyle = C.rowBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(rowX, dy - 3);
      ctx.lineTo(cx - lw / 2 - 6, dy - 3);
      ctx.moveTo(cx + lw / 2 + 6, dy - 3);
      ctx.lineTo(rowX + rowW, dy - 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, dy);
      ctx.textAlign = "left";
      y += 22; // height of the divider block
    }
  });

  // Footer
  const fy = H - footerH + 14;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, fy);
  ctx.lineTo(W - PAD, fy);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = `400 11px ${FONT}`;
  ctx.fillText(host, PAD, fy + 20);
  ctx.textAlign = "right";
  ctx.fillText(when, W - PAD, fy + 20);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/png");
  });
}

export function shareStamp() {
  return new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Opens the phone's share sheet with the image. Where that isn't available
// (most desktop browsers) the image is downloaded instead.
export async function shareImage(blob, filename, title) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled"; // user closed the sheet
      console.error("Share failed, falling back to download:", err);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
