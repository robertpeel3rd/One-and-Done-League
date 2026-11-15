import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// Tracks the signed-in owner and ensures a users/{uid} doc exists.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Show the app immediately; make sure the users/{uid} doc exists
        // in the background instead of making everyone wait on it.
        setUser(firebaseUser);
        setLoading(false);
        const userRef = doc(db, "users", firebaseUser.uid);
        getDoc(userRef)
          .then((snap) => {
            if (!snap.exists()) {
              return setDoc(userRef, {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName,
                email: firebaseUser.email,
                photoURL: firebaseUser.photoURL,
                createdAt: serverTimestamp(),
              });
            }
          })
          .catch((err) => console.error("Couldn't ensure user doc:", err));
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return { user, loading };
}