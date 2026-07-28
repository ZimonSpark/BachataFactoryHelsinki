// Firebase Web config — this is public by design (security lives in firestore.rules, not here).
export const firebaseConfig = {
  apiKey: "AIzaSyAzPoIMukNNswoUHL_gAtpaXXdSAaGS7yw",
  authDomain: "bachata-factory-helsinki.firebaseapp.com",
  projectId: "bachata-factory-helsinki",
  storageBucket: "bachata-factory-helsinki.firebasestorage.app",
  messagingSenderId: "34439146513",
  appId: "1:34439146513:web:7d892160b957b96c4995b0",
};

export const ADMIN_EMAIL = "simon.borali7@gmail.com";

export const isConfigured = firebaseConfig.apiKey !== "PLACEHOLDER";
