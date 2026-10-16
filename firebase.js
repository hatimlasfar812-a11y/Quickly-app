// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Config
const firebaseConfig = {
  apiKey: "AIzaSyAIVM0mpmmPUlTipfa6H7dA0G1UUnuaelY",
  authDomain: "quickly-5856d.firebaseapp.com",
  projectId: "quickly-5856d",
  storageBucket: "quickly-5856d.firebasestorage.app",
  messagingSenderId: "589837703010",
  appId: "1:589837703010:web:99d18d82236eee45e9be3b"
};

// Initialize
const app = initializeApp(firebaseConfig);

// Firestore
const db = getFirestore(app);

// Authentication
const auth = getAuth(app);

export { db, auth };