const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let db = null;
let auth = null;
let FIREBASE_READY = false;

try {
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.warn('[Firebase] serviceAccountKey.json not found in /server. Firebase features will be disabled until provided.');
  } else {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });
    db = admin.firestore();
    auth = admin.auth();
    FIREBASE_READY = true;
    console.log('[Firebase] Admin initialized');
  }
} catch (err) {
  console.error('[Firebase] Initialization error:', err.message);
  FIREBASE_READY = false;
}

module.exports = {
  admin,
  db,
  auth,
  FIREBASE_READY
};
