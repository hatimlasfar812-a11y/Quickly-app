import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const phoneInput = document.getElementById("phoneInput");
const saveBtn = document.getElementById("saveBtn");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  
  currentUser = user;
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  
  if (snap.exists()) {
    
    const data = snap.data();
    
    nameInput.value =
      data.name || user.displayName || "";
    
    emailInput.value =
      data.email || user.email || "";
    
    phoneInput.value =
      data.phone || user.phoneNumber || "";
    
  } else {
    
    nameInput.value = user.displayName || "";
    emailInput.value = user.email || "";
    phoneInput.value = user.phoneNumber || "";
    
  }
  
});

saveBtn.addEventListener("click", async () => {
  
  if (!currentUser) return;
  
  try {
    
    await setDoc(doc(db, "users", currentUser.uid), {
      
      uid: currentUser.uid,
      
      name: nameInput.value.trim(),
      
      email: emailInput.value,
      
      phone: phoneInput.value,
      
      updatedAt: serverTimestamp()
      
    }, { merge: true });
    
    alert("Information updated successfully!");
    
  } catch (error) {
    
    console.error(error);
    alert(error.message);
    
  }
  
});