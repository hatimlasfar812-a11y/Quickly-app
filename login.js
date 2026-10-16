import { auth, db } from "./firebase.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// =====================
// GOOGLE LOGIN
// =====================

const googleBtn = document.getElementById("googleLogin");
const provider = new GoogleAuthProvider();

googleBtn.addEventListener("click", async () => {
  
  try {
    
    const result = await signInWithPopup(auth, provider);
    
    const user = result.user;
    
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: user.displayName || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
      photo: user.photoURL || "",
      createdAt: serverTimestamp()
    }, { merge: true });
    
    window.location.href = "index.html";
    
  } catch (error) {
    
    alert(error.message);
    console.error(error);
    
  }
  
});



// =====================
// PHONE LOGIN
// =====================

const phoneBtn = document.getElementById("phoneLogin");
const phoneForm = document.getElementById("phoneForm");
const sendCodeBtn = document.getElementById("sendCodeBtn");

phoneBtn.addEventListener("click", () => {
  
  phoneBtn.style.display = "none";
  phoneForm.style.display = "block";
  
});

sendCodeBtn.addEventListener("click", async () => {
  
  const phone = document.getElementById("phoneInput").value.trim();
  
  if (!phone) {
    alert("Enter your phone number");
    return;
  }
  
  try {
    
    if (!window.recaptchaVerifier) {
      
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible"
        }
      );
      
      await window.recaptchaVerifier.render();
      
    }
    
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      phone,
      window.recaptchaVerifier
    );
    
    const code = prompt("Enter verification code");
    
    if (!code) return;
    
    const result = await confirmationResult.confirm(code);
    
    const user = result.user;
    
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      phone: user.phoneNumber,
      createdAt: serverTimestamp()
    }, { merge: true });
    
    window.location.href = "index.html";
    
  } catch (error) {
    
    console.error(error);
    alert(error.message);
    
  }
  
});