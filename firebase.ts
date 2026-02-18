
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBfP0TXp3ai9MLLlaPrtbZ40TsowTwdJfQ",
  authDomain: "viruszero-bcf2c.firebaseapp.com",
  projectId: "viruszero-bcf2c",
  storageBucket: "viruszero-bcf2c.firebasestorage.app",
  messagingSenderId: "168152531512",
  appId: "1:168152531512:web:992187cbcff13969da1ccd",
  measurementId: "G-HLVLH6HRJ4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
