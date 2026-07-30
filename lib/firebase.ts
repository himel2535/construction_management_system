import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, Database } from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyC0XM8hKZjOehw5n4KA8k0LeSan3LZBPPI",
  authDomain: "erptriniti.firebaseapp.com",
  databaseURL: "https://erptriniti-default-rtdb.firebaseio.com",
  projectId: "erptriniti",
  storageBucket: "erptriniti.firebasestorage.app",
  messagingSenderId: "622588010782",
  appId: "1:622588010782:web:d6c9efb7e80b3b7eba690f",
};

// Initialize Firebase for SSR / Client safety
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db: Database = getDatabase(app);
export const DEMO_ACTOR_UID = "demo-user";
