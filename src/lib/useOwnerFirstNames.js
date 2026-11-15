import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// Maps ownerUid -> first name (first word of the Google display name stored
// on users/{uid}.name). Loaded ONCE per page load and cached at module level
// -- deliberately not part of any tab's 30-second polling loop, since names
// essentially never change. A missing name just yields no entry, so callers
// render nothing rather than "undefined".
let cache = null;
let inflight = null;

function firstWord(full) {
  if (typeof full !== "string") return null;
  const word = full.trim().split(/\s+/)[0];
  return word || null;
}

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getDocs(collection(db, "users"))
      .then((snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const name = firstWord(data.name) || firstWord(data.displayName);
          if (name) map[d.id] = name;
        });
        cache = map;
        return map;
      })
      .catch((err) => {
        console.error("Couldn't load owner names:", err);
        inflight = null;
        return {};
      });
  }
  return inflight;
}

export function useOwnerFirstNames() {
  const [names, setNames] = useState(cache || {});
  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setNames(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return names;
}
