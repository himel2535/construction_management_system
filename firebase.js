import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";

/** erptriniti — Real Estate ERP production database */
export const firebaseConfig = {
  apiKey: "AIzaSyC0XM8hKZjOehw5n4KA8k0LeSan3LZBPPI",
  authDomain: "erptriniti.firebaseapp.com",
  databaseURL: "https://erptriniti-default-rtdb.firebaseio.com",
  projectId: "erptriniti",
  storageBucket: "erptriniti.firebasestorage.app",
  messagingSenderId: "622588010782",
  appId: "1:622588010782:web:d6c9efb7e80b3b7eba690f",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const DEMO_ACTOR_UID = "demo-user";

export { ref, get, set, push, update, remove, onValue, runTransaction };
