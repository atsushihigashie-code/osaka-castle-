import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "kabuki-captions.firebaseapp.com",
  databaseURL: "https://kabuki-captions-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kabuki-captions",
  storageBucket: "kabuki-captions.appspot.com",
  messagingSenderId: "228747197880",
  appId: "1:228747197880:web:ebe63ff0e2183539b3e34d",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
