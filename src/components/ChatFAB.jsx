import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const REACTIONS = ["👍", "👎", "😂", "😮", "🔥"];
const MESSAGE_LIMIT = 20;
const DRAG_DISMISS_THRESHOLD = 80;

// Small chat-bubble glyph, styled to match the app's header logo (line-drawn,
// same accent color) rather than an emoji.
function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--surface-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ChatFAB({ user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [reactionsByMessage, setReactionsByMessage] = useState({});
  const [text, setText] = useState("");
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [openReactionPickerFor, setOpenReactionPickerFor] = useState(null);
  const [lastReadMillis, setLastReadMillis] = useState(null);
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef(null);
  const draggingRef = useRef(false);
  const listEndRef = useRef(null);

  const giphyKey = import.meta.env.VITE_GIPHY_API_KEY;

  // Real-time listener for the most recent MESSAGE_LIMIT messages.
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(MESSAGE_LIMIT));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      setMessages(msgs);
    });
    return unsub;
  }, []);

  // One small real-time listener per currently-visible message's reactions
  // subcollection. Fine at this scale (capped at MESSAGE_LIMIT=20, small
  // league) — only re-subscribes when the actual SET of visible message
  // IDs changes, not on every reaction update within them.
  const messageIdsKey = messages.map((m) => m.id).join(",");
  useEffect(() => {
    const unsubs = messages.map((m) =>
      onSnapshot(collection(db, "messages", m.id, "reactions"), (snap) => {
        const byUser = {};
        snap.docs.forEach((d) => {
          byUser[d.id] = d.data().emoji;
        });
        setReactionsByMessage((prev) => ({ ...prev, [m.id]: byUser }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIdsKey]);

  useEffect(() => {
    async function loadLastRead() {
      const snap = await getDoc(doc(db, "users", user.uid));
      const ts = snap.data()?.lastReadTimestamp;
      setLastReadMillis(ts?.toMillis ? ts.toMillis() : 0);
    }
    if (user) loadLastRead();
  }, [user]);

  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages.length]);

  const unreadCount = useMemo(() => {
    if (lastReadMillis === null) return 0;
    return messages.filter((m) => {
      if (m.senderId === user.uid) return false;
      const created = m.createdAt?.toMillis ? m.createdAt.toMillis() : null;
      return created !== null && created > lastReadMillis;
    }).length;
  }, [messages, lastReadMillis, user]);

  async function openChat() {
    setOpen(true);
    setLastReadMillis(Date.now());
    await setDoc(doc(db, "users", user.uid), { lastReadTimestamp: serverTimestamp() }, { merge: true });
  }

  function closeChat() {
    setOpen(false);
    setShowGifPicker(false);
    setOpenReactionPickerFor(null);
    setDragY(0);
  }

  async function sendText() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await addDoc(collection(db, "messages"), {
      senderId: user.uid,
      senderName: user.displayName || "Someone",
      text: trimmed,
      gifUrl: null,
      createdAt: serverTimestamp(),
      deleted: false,
    });
  }

  async function sendGif(url) {
    setShowGifPicker(false);
    setGifQuery("");
    setGifResults([]);
    await addDoc(collection(db, "messages"), {
      senderId: user.uid,
      senderName: user.displayName || "Someone",
      text: null,
      gifUrl: url,
      createdAt: serverTimestamp(),
      deleted: false,
    });
  }

  async function deleteMessage(messageId) {
    await updateDoc(doc(db, "messages", messageId), { deleted: true });
  }

  // One reaction per person: setting a new emoji overwrites their prior
  // one (same doc ID = their own uid); tapping the same emoji again clears
  // it entirely via a real delete, rather than leaving a null-valued doc.
  async function setReaction(messageId, emoji) {
    const ref = doc(db, "messages", messageId, "reactions", user.uid);
    if (emoji === null) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { emoji });
    }
    setOpenReactionPickerFor(null);
  }

  useEffect(() => {
    if (!showGifPicker || !giphyKey) return;
    if (!gifQuery.trim()) {
      setGifResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setGifLoading(true);
      try {
        const res = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(gifQuery)}&limit=12&rating=pg-13`
        );
        const data = await res.json();
        setGifResults(data.data || []);
      } catch (err) {
        console.error(err);
        setGifResults([]);
      } finally {
        setGifLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [gifQuery, showGifPicker, giphyKey]);

  function handleDragStart(e) {
    draggingRef.current = true;
    dragStartYRef.current = e.touches ? e.touches[0].clientY : e.clientY;
  }
  function handleDragMove(e) {
    if (!draggingRef.current || dragStartYRef.current === null) return;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = currentY - dragStartYRef.current;
    if (delta > 0) setDragY(delta);
  }
  function handleDragEnd() {
    draggingRef.current = false;
    dragStartYRef.current = null;
    if (dragY > DRAG_DISMISS_THRESHOLD) {
      closeChat();
    } else {
      setDragY(0);
    }
  }

  if (!user) return null;

  return (
    <>
      {!open && (
        <button
          onClick={openChat}
          aria-label="Open league chat"
          style={{
            position: "fixed",
            right: 16,
            bottom: "calc(76px + env(safe-area-inset-bottom))",
            width: 52,
            height: 52,
            minHeight: 0,
            borderRadius: "50%",
            background: "var(--text-accent)",
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90,
            padding: 0,
          }}
        >
          <ChatIcon />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                background: "var(--text-danger)",
                color: "var(--surface-2)",
                fontSize: 10,
                fontWeight: 600,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <>
          <div
            onClick={closeChat}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 150 }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              height: "75vh",
              background: "var(--surface-2)",
              borderRadius: "16px 16px 0 0",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.2)",
              zIndex: 151,
              display: "flex",
              flexDirection: "column",
              transform: `translateY(${dragY}px)`,
              transition: draggingRef.current ? "none" : "transform 0.2s ease-out",
            }}
          >
            <div
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
              onMouseDown={handleDragStart}
              onMouseMove={(e) => {
                if (e.buttons === 1) handleDragMove(e);
              }}
              onMouseUp={handleDragEnd}
              style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px", cursor: "grab", touchAction: "none" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 14px 8px",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500 }}>League Chat</span>
              <button
                onClick={closeChat}
                style={{ border: "none", background: "transparent", fontSize: 18, color: "var(--text-muted)", padding: 4, minHeight: 0 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 && (
                <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No messages yet — say hi!</p>
              )}
              {messages.map((m) => {
                const isMine = m.senderId === user.uid;
                const reactions = reactionsByMessage[m.id] || {};
                const reactionCounts = {};
                Object.values(reactions).forEach((emoji) => {
                  if (emoji) reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
                });
                const myReaction = reactions[user.uid];

                return (
                  <div key={m.id} style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                    {!isMine && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{m.senderName}</div>
                    )}
                    {m.deleted ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", padding: "6px 10px" }}>
                        Message deleted
                      </div>
                    ) : (
                      <div
                        onClick={() => setOpenReactionPickerFor(openReactionPickerFor === m.id ? null : m.id)}
                        style={{
                          background: isMine ? "var(--text-accent)" : "var(--surface-1)",
                          color: isMine ? "var(--surface-2)" : "inherit",
                          borderRadius: 10,
                          padding: m.gifUrl ? 4 : "6px 10px",
                          fontSize: 13,
                          cursor: "pointer",
                          display: "inline-block",
                        }}
                      >
                        {m.gifUrl ? (
                          <img src={m.gifUrl} alt="" style={{ maxWidth: 160, borderRadius: 6, display: "block" }} />
                        ) : (
                          m.text
                        )}
                      </div>
                    )}

                    {!m.deleted && Object.keys(reactionCounts).length > 0 && (
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 11, background: "var(--surface-1)", borderRadius: 8, padding: "1px 6px" }}>
                          {Object.entries(reactionCounts)
                            .map(([emoji, count]) => `${emoji} ${count}`)
                            .join("  ")}
                        </span>
                      </div>
                    )}

                    {openReactionPickerFor === m.id && !m.deleted && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setReaction(m.id, myReaction === emoji ? null : emoji)}
                            style={{
                              fontSize: 13,
                              padding: "2px 6px",
                              minHeight: 0,
                              borderRadius: 10,
                              border: myReaction === emoji ? "1px solid var(--text-accent)" : "0.5px solid var(--border-strong)",
                              background: myReaction === emoji ? "var(--bg-accent)" : "var(--surface-2)",
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                        {isMine && (
                          <button
                            onClick={() => {
                              deleteMessage(m.id);
                              setOpenReactionPickerFor(null);
                            }}
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              minHeight: 0,
                              borderRadius: 10,
                              border: "1px solid var(--text-danger)",
                              color: "var(--text-danger)",
                              background: "transparent",
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>

            {showGifPicker && (
              <div style={{ borderTop: "0.5px solid var(--border)", padding: 8 }}>
                {!giphyKey ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 8 }}>
                    GIF search unavailable right now.
                  </p>
                ) : (
                  <>
                    <input
                      placeholder="Search GIFs..."
                      value={gifQuery}
                      onChange={(e) => setGifQuery(e.target.value)}
                      style={{ width: "100%", marginBottom: 6 }}
                      autoFocus
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                      {gifLoading && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Searching...</p>}
                      {gifResults.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => sendGif(g.images.fixed_height.url)}
                          style={{ padding: 0, border: "none", minHeight: 0, borderRadius: 6, overflow: "hidden" }}
                        >
                          <img src={g.images.fixed_height_small.url} alt="" style={{ width: "100%", display: "block" }} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, borderTop: showGifPicker ? "none" : "0.5px solid var(--border)" }}>
              <button
                onClick={() => setShowGifPicker((v) => !v)}
                style={{
                  width: 32,
                  height: 32,
                  minHeight: 0,
                  borderRadius: "50%",
                  padding: 0,
                  fontSize: 11,
                  border: showGifPicker ? "1px solid var(--text-accent)" : "1px solid var(--border-strong)",
                  background: showGifPicker ? "var(--bg-accent)" : "var(--surface-2)",
                  color: showGifPicker ? "var(--text-accent)" : "var(--text-secondary)",
                }}
              >
                GIF
              </button>
              <input
                placeholder="Message the league..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendText();
                }}
                style={{ flex: 1, borderRadius: 16 }}
              />
              <button
                onClick={sendText}
                disabled={!text.trim()}
                style={{
                  width: 32,
                  height: 32,
                  minHeight: 0,
                  borderRadius: "50%",
                  padding: 0,
                  border: "none",
                  background: "var(--text-accent)",
                  color: "var(--surface-2)",
                }}
              >
                ➤
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
