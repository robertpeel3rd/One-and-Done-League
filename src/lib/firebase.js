import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB8owyhFXj9XZ5QZz9to15cuYY63AckYWQ",
  authDomain: "one-and-done-league-1aadb.firebaseapp.com",
  projectId: "one-and-done-league-1aadb",
  storageBucket: "one-and-done-league-1aadb.firebasestorage.app",
  messagingSenderId: "966866571314",
  appId: "1:966866571314:web:01aca18acd567b909cac2b",
  measurementId: "G-9STN7Y1K5Y",
};

// Avoid re-initializing on hot reload
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}