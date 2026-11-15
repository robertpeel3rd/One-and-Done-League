import { useLayoutEffect, useRef } from "react";

// One-line text that starts at `max` px and shrinks in 0.5px steps (down to
// `min`) only when it would otherwise be cut off. Adjusts the DOM directly,
// so no extra re-render is needed.
export function FitText({ text, max = 17, min = 12, style }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      while (el.scrollWidth > el.clientWidth && size > min) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [text, max, min]);

  return (
    <span
      ref={ref}
      style={{
        display: "block",
        flex: "0 1 auto",
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        ...style,
      }}
    >
      {text}
    </span>
  );
}
