// One-time script: writes Agora credentials to Firestore /config/agora
// Run: node scripts/init-agora-config.js
// These values come from console.agora.io — OK Music Live project

const admin = require("firebase-admin");
const sa = require("../service-account.json");

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const AGORA_APP_ID          = "abe047eaf0f04fa1a445b763991f56b7";
const AGORA_APP_CERTIFICATE = "9c65cd16799f4de889e7801dd199146c";

(async () => {
  await db.collection("config").doc("agora").set({
    appId:          AGORA_APP_ID,
    appCertificate: AGORA_APP_CERTIFICATE,
  });
  console.log("Agora config written to Firestore /config/agora");
  process.exit(0);
})();
