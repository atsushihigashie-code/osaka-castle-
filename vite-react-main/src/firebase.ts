import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "osaka-castle-tour.firebaseapp.com",
  databaseURL: "https://osaka-castle-tour-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "osaka-castle-tour",
  storageBucket: "osaka-castle-tour.firebasestorage.app",
  messagingSenderId: "82330141589",
  appId: "1:82330141589:web:945254147c2c27f042ac9c"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
